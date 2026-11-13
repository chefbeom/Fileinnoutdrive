package com.example.WaffleBear.file.sharelink;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.model.FileSpaceType;
import com.example.WaffleBear.file.secret.PinAttemptLimiter;
import com.example.WaffleBear.file.service.FileObjectDownloadService;
import com.example.WaffleBear.file.sharelink.dto.DownloadShareLinkDto;
import com.example.WaffleBear.file.sharelink.model.FileDownloadShareLink;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DownloadShareLinkServiceTest {

    private FileDownloadShareLinkRepository shareLinkRepository;
    private FileUpDownloadRepository fileUpDownloadRepository;
    private UserRepository userRepository;
    private FileObjectDownloadService fileObjectDownloadService;
    private PasswordEncoder passwordEncoder;
    private PinAttemptLimiter pinAttemptLimiter;
    private DownloadShareLinkService service;

    private User owner;
    private FileInfo driveFile;

    @BeforeEach
    void setUp() {
        shareLinkRepository = mock(FileDownloadShareLinkRepository.class);
        fileUpDownloadRepository = mock(FileUpDownloadRepository.class);
        userRepository = mock(UserRepository.class);
        fileObjectDownloadService = mock(FileObjectDownloadService.class);
        passwordEncoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();
        pinAttemptLimiter = new PinAttemptLimiter();
        service = new DownloadShareLinkService(
                shareLinkRepository,
                fileUpDownloadRepository,
                userRepository,
                fileObjectDownloadService,
                passwordEncoder,
                pinAttemptLimiter
        );

        owner = User.builder()
                .idx(7L)
                .email("owner@wafflebear.local")
                .name("Kim")
                .build();

        driveFile = FileInfo.builder()
                .idx(42L)
                .user(owner)
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.DRIVE)
                .fileOriginName("report.pdf")
                .fileFormat("pdf")
                .fileSaveName("uuid-report.pdf")
                .fileSavePath("7/uuid-report.pdf")
                .fileSize(2048L)
                .lockedFile(false)
                .trashed(false)
                .hiddenFolder(false)
                .build();
    }

    @Test
    void createsDownloadLinkWithCustomDurationAndMaxDownloads() {
        when(userRepository.findById(7L)).thenReturn(Optional.of(owner));
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(42L, 7L)).thenReturn(Optional.of(driveFile));
        when(shareLinkRepository.existsByToken(any())).thenReturn(false);
        when(shareLinkRepository.save(any(FileDownloadShareLink.class))).thenAnswer(invocation -> {
            FileDownloadShareLink entity = invocation.getArgument(0);
            return FileDownloadShareLink.builder()
                    .idx(101L)
                    .token(entity.getToken())
                    .file(entity.getFile())
                    .owner(entity.getOwner())
                    .durationMinutes(entity.getDurationMinutes())
                    .expiresAt(entity.getExpiresAt())
                    .maxDownloads(entity.getMaxDownloads())
                    .downloadCount(0)
                    .passwordHash(entity.getPasswordHash())
                    .revoked(false)
                    .createdAt(LocalDateTime.now())
                    .build();
        });

        DownloadShareLinkDto.CreateReq req = new DownloadShareLinkDto.CreateReq(30, null, 1, "pass1234");
        DownloadShareLinkDto.LinkRes res = service.createDownloadLink(7L, 42L, req);

        assertThat(res.getIdx()).isEqualTo(101L);
        assertThat(res.getToken()).isNotBlank();
        assertThat(res.getDurationMinutes()).isEqualTo(30);
        assertThat(res.getMaxDownloads()).isEqualTo(1);
        assertThat(res.getRemainingDownloads()).isEqualTo(1);
        assertThat(res.isPasswordProtected()).isTrue();
        assertThat(res.getStatus()).isEqualTo("ACTIVE");
        assertThat(res.getRemainingSeconds()).isBetween(1700L, 1805L);
        assertThat(res.getSharePath()).isEqualTo("/share-link/" + res.getToken());
        assertThat(res.getDirectDownloadPath()).isEqualTo("/file/share-links/public/" + res.getToken() + "/download");
    }

    @Test
    void enforcesSingleDownloadLimitAndClampsPresignedExpiryToRemainingWindow() {
        LocalDateTime now = LocalDateTime.now();
        FileDownloadShareLink link = FileDownloadShareLink.builder()
                .idx(55L)
                .token("once-token")
                .file(driveFile)
                .owner(owner)
                .durationMinutes(2)
                .expiresAt(now.plusSeconds(120))
                .maxDownloads(1)
                .downloadCount(0)
                .revoked(false)
                .createdAt(now)
                .build();

        AtomicInteger atomicCounter = new AtomicInteger(0);
        when(shareLinkRepository.findByToken("once-token")).thenAnswer(invocation -> Optional.of(
                FileDownloadShareLink.builder()
                        .idx(55L)
                        .token("once-token")
                        .file(driveFile)
                        .owner(owner)
                        .durationMinutes(2)
                        .expiresAt(now.plusSeconds(120))
                        .maxDownloads(1)
                        .downloadCount(atomicCounter.get())
                        .revoked(false)
                        .createdAt(now)
                        .build()
        ));
        when(shareLinkRepository.consumeDownloadSlot(eq(55L), any(LocalDateTime.class))).thenAnswer(invocation -> {
            if (atomicCounter.compareAndSet(0, 1)) {
                return 1;
            }
            return 0;
        });
        when(fileObjectDownloadService.generateAttachmentDownloadUrl(
                eq("7/uuid-report.pdf"),
                eq("report.pdf"),
                any(),
                anyInt()
        )).thenAnswer(invocation -> "https://minio.local/presigned?exp=" + invocation.getArgument(3));

        DownloadShareLinkDto.PublicDownloadUrlRes first = service.issuePresignedDownloadUrl("once-token", null);

        assertThat(first.getDownloadCount()).isEqualTo(1);
        assertThat(first.getRemainingDownloads()).isEqualTo(0);
        assertThat(first.getStatus()).isEqualTo("EXHAUSTED");
        assertThat(first.getUrlExpiresInSeconds()).isBetween(1L, 120L);
        assertThat(first.getPresignedUrl()).contains("https://minio.local/presigned");

        assertThatThrownBy(() -> service.issuePresignedDownloadUrl("once-token", null))
                .isInstanceOf(BaseException.class)
                .extracting(ex -> ((BaseException) ex).getStatus())
                .isEqualTo(BaseResponseStatus.SHARE_LINK_DOWNLOAD_LIMIT_REACHED);
    }

    @Test
    void rejectsExpiredOrRevokedLinks() {
        FileDownloadShareLink expired = FileDownloadShareLink.builder()
                .idx(12L)
                .token("expired-token")
                .file(driveFile)
                .owner(owner)
                .expiresAt(LocalDateTime.now().minusMinutes(1))
                .maxDownloads(3)
                .downloadCount(0)
                .revoked(false)
                .build();

        when(shareLinkRepository.findByToken("expired-token")).thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> service.issuePresignedDownloadUrl("expired-token", null))
                .isInstanceOf(BaseException.class)
                .extracting(ex -> ((BaseException) ex).getStatus())
                .isEqualTo(BaseResponseStatus.SHARE_LINK_EXPIRED);

        FileDownloadShareLink revoked = FileDownloadShareLink.builder()
                .idx(13L)
                .token("revoked-token")
                .file(driveFile)
                .owner(owner)
                .expiresAt(LocalDateTime.now().plusMinutes(10))
                .maxDownloads(3)
                .downloadCount(0)
                .revoked(true)
                .build();

        when(shareLinkRepository.findByToken("revoked-token")).thenReturn(Optional.of(revoked));

        assertThatThrownBy(() -> service.issuePresignedDownloadUrl("revoked-token", null))
                .isInstanceOf(BaseException.class)
                .extracting(ex -> ((BaseException) ex).getStatus())
                .isEqualTo(BaseResponseStatus.SHARE_LINK_REVOKED);
        verify(shareLinkRepository, never()).consumeDownloadSlot(anyLong(), any());
    }

    @Test
    void enforcesPasswordAndAttemptLimitingBeforeSlotConsumption() {
        FileDownloadShareLink protectedLink = FileDownloadShareLink.builder()
                .idx(77L)
                .token("pw-token")
                .file(driveFile)
                .owner(owner)
                .expiresAt(LocalDateTime.now().plusMinutes(30))
                .maxDownloads(2)
                .downloadCount(0)
                .passwordHash(passwordEncoder.encode("secret99"))
                .revoked(false)
                .build();

        when(shareLinkRepository.findByToken("pw-token")).thenReturn(Optional.of(protectedLink));
        when(shareLinkRepository.consumeDownloadSlot(eq(77L), any(LocalDateTime.class))).thenReturn(1);
        when(fileObjectDownloadService.generateAttachmentDownloadUrl(any(), any(), any(), anyInt()))
                .thenReturn("https://minio.local/presigned-pw");

        assertThatThrownBy(() -> service.issuePresignedDownloadUrl("pw-token", ""))
                .isInstanceOf(BaseException.class)
                .extracting(ex -> ((BaseException) ex).getStatus())
                .isEqualTo(BaseResponseStatus.SHARE_LINK_PASSWORD_REQUIRED);

        assertThatThrownBy(() -> service.issuePresignedDownloadUrl("pw-token", "wrong"))
                .isInstanceOf(BaseException.class)
                .extracting(ex -> ((BaseException) ex).getStatus())
                .isEqualTo(BaseResponseStatus.SHARE_LINK_PASSWORD_INVALID);

        verify(shareLinkRepository, never()).consumeDownloadSlot(anyLong(), any());

        DownloadShareLinkDto.PublicDownloadUrlRes issued = service.issuePresignedDownloadUrl("pw-token", "secret99");
        assertThat(issued.getPresignedUrl()).isEqualTo("https://minio.local/presigned-pw");
        verify(shareLinkRepository).consumeDownloadSlot(eq(77L), any(LocalDateTime.class));
    }

    @Test
    void rejectsFoldersLockedFilesTrashedFilesAndSecretSpaceFiles() {
        when(userRepository.findById(7L)).thenReturn(Optional.of(owner));

        FileInfo folder = FileInfo.builder().idx(1L).user(owner).nodeType(FileNodeType.FOLDER).fileOriginName("Docs").build();
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(1L, 7L)).thenReturn(Optional.of(folder));
        assertThatThrownBy(() -> service.createDownloadLink(7L, 1L, new DownloadShareLinkDto.CreateReq()))
                .isInstanceOf(BaseException.class)
                .extracting(ex -> ((BaseException) ex).getStatus())
                .isEqualTo(BaseResponseStatus.REQUEST_ERROR);

        FileInfo locked = FileInfo.builder()
                .idx(2L).user(owner).nodeType(FileNodeType.FILE).lockedFile(true)
                .fileSavePath("7/locked.pdf").fileOriginName("locked.pdf").fileFormat("pdf").fileSaveName("locked.pdf")
                .build();
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(2L, 7L)).thenReturn(Optional.of(locked));
        assertThatThrownBy(() -> service.createDownloadLink(7L, 2L, new DownloadShareLinkDto.CreateReq()))
                .isInstanceOf(BaseException.class)
                .extracting(ex -> ((BaseException) ex).getStatus())
                .isEqualTo(BaseResponseStatus.SHARE_LINK_FILE_UNAVAILABLE);

        FileInfo vaultFile = FileInfo.builder()
                .idx(3L).user(owner).nodeType(FileNodeType.FILE).spaceType(FileSpaceType.VAULT)
                .fileSavePath("7/vault.pdf").fileOriginName("vault.pdf").fileFormat("pdf").fileSaveName("vault.pdf")
                .build();
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(3L, 7L)).thenReturn(Optional.of(vaultFile));
        assertThatThrownBy(() -> service.createDownloadLink(7L, 3L, new DownloadShareLinkDto.CreateReq()))
                .isInstanceOf(BaseException.class)
                .extracting(ex -> ((BaseException) ex).getStatus())
                .isEqualTo(BaseResponseStatus.SECRET_FOLDER_NOT_ALLOWED);
    }
}
