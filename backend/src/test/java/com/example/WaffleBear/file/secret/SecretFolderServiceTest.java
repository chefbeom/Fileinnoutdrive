package com.example.WaffleBear.file.secret;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.feater.FeaterRepository;
import com.example.WaffleBear.feater.model.Feater;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.model.FileSpaceType;
import com.example.WaffleBear.file.share.ShareRepository;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SecretFolderServiceTest {

    private static final String TEST_JWT_KEY = Base64.getUrlEncoder().withoutPadding()
            .encodeToString("wafflebear-secret-folder-unit-test-key-32b!".getBytes(StandardCharsets.UTF_8));

    @Mock
    private FeaterRepository featerRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;

    @Mock
    private ShareRepository shareRepository;

    private PasswordEncoder passwordEncoder;
    private SecretTokenService secretTokenService;
    private SecretRequestContext secretRequestContext;
    private SecretAccessGuard secretAccessGuard;
    private SecretFolderService secretFolderService;

    @BeforeEach
    void setUp() {
        passwordEncoder = new BCryptPasswordEncoder();
        secretTokenService = new SecretTokenService(TEST_JWT_KEY);
        secretRequestContext = new SecretRequestContext();
        secretAccessGuard = new SecretAccessGuard(secretTokenService, secretRequestContext);
        secretFolderService = new SecretFolderService(
                featerRepository,
                userRepository,
                fileUpDownloadRepository,
                shareRepository,
                passwordEncoder,
                secretTokenService,
                secretAccessGuard
        );
    }

    @AfterEach
    void clearRequestContext() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void vaultPinLifecycleRegistersVerifiesAndChangesPin() {
        User user = User.builder().idx(11L).email("secret@test.local").name("Tester").build();
        Feater feater = Feater.builder().idx(1L).user(user).displayName("Tester").build();

        when(userRepository.findById(11L)).thenReturn(Optional.of(user));
        when(featerRepository.findByUser_Idx(11L)).thenReturn(Optional.of(feater));
        when(featerRepository.saveAndFlush(any(Feater.class))).thenAnswer(inv -> inv.getArgument(0));

        assertThat(secretFolderService.getVaultStatus(11L).isPinRegistered()).isFalse();

        assertThatThrownBy(() -> secretFolderService.registerVaultPin(11L, "12a4"))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.PIN_FORMAT_INVALID);

        SecretFolderDto.UnlockRes registered = secretFolderService.registerVaultPin(11L, "2580");
        assertThat(registered.isUnlocked()).isTrue();
        assertThat(registered.isPinRegistered()).isTrue();
        assertThat(secretTokenService.isValidVaultToken(11L, registered.getUnlockToken())).isTrue();
        assertThat(feater.hasVaultPin()).isTrue();
        assertThat(feater.getVaultPinHash()).isNotEqualTo("2580");

        assertThatThrownBy(() -> secretFolderService.registerVaultPin(11L, "0000"))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.VAULT_PIN_ALREADY_EXISTS);

        assertThatThrownBy(() -> secretFolderService.unlockVault(11L, "9999"))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.VAULT_PIN_INVALID);

        SecretFolderDto.UnlockRes unlocked = secretFolderService.unlockVault(11L, "2580");
        assertThat(secretTokenService.isValidVaultToken(11L, unlocked.getUnlockToken())).isTrue();

        SecretFolderDto.UnlockRes changed = secretFolderService.changeVaultPin(11L, "2580", "4321");
        assertThat(secretTokenService.isValidVaultToken(11L, changed.getUnlockToken())).isTrue();
        assertThatThrownBy(() -> secretFolderService.unlockVault(11L, "2580"))
                .isInstanceOf(BaseException.class);
        assertThat(secretFolderService.unlockVault(11L, "4321").isUnlocked()).isTrue();
    }

    @Test
    void hiddenFolderSupportsOptionalPinAndRegistersOnFirstUnlockWhenEmpty() {
        FileInfo hiddenFolder = FileInfo.builder()
                .idx(50L)
                .user(User.builder().idx(7L).build())
                .nodeType(FileNodeType.FOLDER)
                .spaceType(FileSpaceType.DRIVE)
                .hiddenFolder(true)
                .folderPinEnabled(true)
                .folderPinHash(null)
                .fileOriginName("PrivateDocs")
                .fileFormat("folder")
                .fileSaveName("folder-50")
                .trashed(false)
                .build();

        when(fileUpDownloadRepository.findByIdxAndUser_Idx(50L, 7L)).thenReturn(Optional.of(hiddenFolder));
        when(fileUpDownloadRepository.saveAndFlush(any(FileInfo.class))).thenAnswer(inv -> inv.getArgument(0));

        SecretFolderDto.FolderStatusRes initialStatus = secretFolderService.getFolderStatus(7L, 50L);
        assertThat(initialStatus.isHidden()).isTrue();
        assertThat(initialStatus.isPinEnabled()).isTrue();
        assertThat(initialStatus.isPinRegistered()).isFalse();

        SecretFolderDto.UnlockRes firstUnlock = secretFolderService.unlockFolder(7L, 50L, "1357");
        assertThat(firstUnlock.isUnlocked()).isTrue();
        assertThat(firstUnlock.isPinRegistered()).isTrue();
        assertThat(hiddenFolder.hasFolderPin()).isTrue();
        assertThat(secretTokenService.isValidFolderToken(7L, 50L, firstUnlock.getUnlockToken())).isTrue();

        assertThatThrownBy(() -> secretFolderService.unlockFolder(7L, 50L, "0000"))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.SECRET_FOLDER_PIN_INVALID);
    }

    @Test
    void sharedFolderCannotBeConfiguredAsHidden() {
        FileInfo sharedFolder = FileInfo.builder()
                .idx(80L)
                .user(User.builder().idx(9L).build())
                .nodeType(FileNodeType.FOLDER)
                .sharedFile(true)
                .fileOriginName("SharedTeam")
                .fileFormat("folder")
                .fileSaveName("shared-storage-80")
                .trashed(false)
                .build();

        when(fileUpDownloadRepository.findByIdxAndUser_Idx(80L, 9L)).thenReturn(Optional.of(sharedFolder));

        SecretFolderDto.FolderConfigReq req = new SecretFolderDto.FolderConfigReq(true, false, null, null);
        assertThatThrownBy(() -> secretFolderService.configureFolder(9L, 80L, req))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.SECRET_FOLDER_NOT_ALLOWED);
    }

    @Test
    void secretAccessGuardEnforcesVaultAndFolderAncestorTokensAndTreeIsolation() {
        FileInfo vaultRoot = FileInfo.builder()
                .idx(100L)
                .nodeType(FileNodeType.FOLDER)
                .spaceType(FileSpaceType.VAULT)
                .build();
        FileInfo vaultFile = FileInfo.builder()
                .idx(101L)
                .parent(vaultRoot)
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.VAULT)
                .build();

        FileInfo hiddenParent = FileInfo.builder()
                .idx(200L)
                .nodeType(FileNodeType.FOLDER)
                .spaceType(FileSpaceType.DRIVE)
                .hiddenFolder(true)
                .folderPinEnabled(true)
                .build();
        FileInfo hiddenChild = FileInfo.builder()
                .idx(201L)
                .parent(hiddenParent)
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.DRIVE)
                .hiddenFolder(false)
                .build();
        FileInfo publicFile = FileInfo.builder()
                .idx(300L)
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.DRIVE)
                .hiddenFolder(false)
                .build();

        assertThatThrownBy(() -> secretAccessGuard.assertNodeAccess(5L, vaultFile, true))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.VAULT_UNLOCK_REQUIRED);

        assertThatThrownBy(() -> secretAccessGuard.assertNodeAccess(5L, hiddenChild, true))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.SECRET_FOLDER_UNLOCK_REQUIRED);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(SecretRequestContext.HEADER_VAULT_TOKEN, secretTokenService.createVaultUnlockToken(5L));
        request.addHeader(SecretRequestContext.HEADER_SECRET_TOKENS, secretTokenService.createFolderUnlockToken(5L, 200L));
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));

        secretAccessGuard.assertNodeAccess(5L, vaultFile, true);
        secretAccessGuard.assertNodeAccess(5L, hiddenChild, true);

        assertThat(SecretTreeRules.collectHiddenOrVaultSubtreeIds(List.of(
                vaultRoot, vaultFile, hiddenParent, hiddenChild, publicFile
        ))).containsExactlyInAnyOrder(100L, 101L, 200L, 201L);
    }

    @Test
    void vaultUnlockLocksOutAfterFiveWrongPins() {
        User user = User.builder().idx(21L).email("brute@test.local").name("Brute").build();
        Feater feater = Feater.builder()
                .idx(2L)
                .user(user)
                .displayName("Brute")
                .vaultPinHash(passwordEncoder.encode("2580"))
                .build();

        when(featerRepository.findByUser_Idx(21L)).thenReturn(Optional.of(feater));

        for (int i = 0; i < 5; i++) {
            assertThatThrownBy(() -> secretFolderService.unlockVault(21L, "0000"))
                    .isInstanceOf(BaseException.class)
                    .extracting("status")
                    .isEqualTo(BaseResponseStatus.VAULT_PIN_INVALID);
        }

        assertThatThrownBy(() -> secretFolderService.unlockVault(21L, "2580"))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.PIN_ATTEMPTS_EXCEEDED);
    }

    @Test
    void lockVaultAndPinChangeRevokePreviouslyIssuedTokens() {
        User user = User.builder().idx(31L).email("revoke@test.local").name("Revoke").build();
        Feater feater = Feater.builder()
                .idx(3L)
                .user(user)
                .displayName("Revoke")
                .vaultPinHash(passwordEncoder.encode("1234"))
                .build();

        when(featerRepository.findByUser_Idx(31L)).thenReturn(Optional.of(feater));
        when(featerRepository.saveAndFlush(any(Feater.class))).thenAnswer(inv -> inv.getArgument(0));

        SecretFolderDto.UnlockRes initial = secretFolderService.unlockVault(31L, "1234");
        assertThat(secretTokenService.isValidVaultToken(31L, initial.getUnlockToken())).isTrue();

        secretFolderService.lockVault(31L);
        assertThat(secretTokenService.isValidVaultToken(31L, initial.getUnlockToken())).isFalse();

        SecretFolderDto.UnlockRes reunlocked = secretFolderService.unlockVault(31L, "1234");
        assertThat(secretTokenService.isValidVaultToken(31L, reunlocked.getUnlockToken())).isTrue();

        SecretFolderDto.UnlockRes changed = secretFolderService.changeVaultPin(31L, "1234", "5678");
        assertThat(secretTokenService.isValidVaultToken(31L, reunlocked.getUnlockToken())).isFalse();
        assertThat(secretTokenService.isValidVaultToken(31L, changed.getUnlockToken())).isTrue();
    }
}
