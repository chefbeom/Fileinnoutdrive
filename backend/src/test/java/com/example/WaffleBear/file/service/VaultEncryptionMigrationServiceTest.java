package com.example.WaffleBear.file.service;

import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.crypto.VaultFileCryptoService;
import com.example.WaffleBear.file.model.FileEncryptionMode;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.model.FileSpaceType;
import com.example.WaffleBear.file.secret.SecretAccessGuard;
import com.example.WaffleBear.user.model.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class VaultEncryptionMigrationServiceTest {

    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;

    @Mock
    private VaultFileCryptoService vaultFileCryptoService;

    @Mock
    private FileObjectDeletionService fileObjectDeletionService;

    @Mock
    private TransactionTemplate transactionTemplate;

    @Mock
    private SecretAccessGuard secretAccessGuard;

    private VaultEncryptionMigrationService service;

    @BeforeEach
    void setUp() {
        lenient().when(transactionTemplate.execute(any())).thenAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            TransactionCallback<Object> callback = invocation.getArgument(0);
            return callback.doInTransaction(new SimpleTransactionStatus());
        });
        service = new VaultEncryptionMigrationService(
                fileUpDownloadRepository,
                vaultFileCryptoService,
                fileObjectDeletionService,
                transactionTemplate
        );
    }

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void migratesPlaintextVaultFileDeletesOldPlaintextAndCleansThumbnails() {
        User owner = User.builder().idx(7L).build();
        FileInfo legacyVaultFile = FileInfo.builder()
                .idx(15L)
                .user(owner)
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.VAULT)
                .fileOriginName("secret-clip.mp4")
                .fileSaveName("legacy.mp4")
                .fileSavePath("7/legacy.mp4")
                .fileFormat("mp4")
                .fileSize(4096L)
                .trashed(false)
                .build();

        when(vaultFileCryptoService.encryptPlaintextObject(7L, "7/legacy.mp4", 4096L))
                .thenReturn(new VaultFileCryptoService.VaultEncryptionResult(
                        "7/vault/new-enc.enc",
                        "new-enc.enc",
                        1,
                        "wrapped-dek",
                        "nonce-b64",
                        1048576,
                        4096L,
                        4112L
                ));
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(15L, 7L))
                .thenReturn(Optional.of(legacyVaultFile));

        var outcome = service.migrateSingleVaultFile(7L, 15L, "7/legacy.mp4", 4096L);

        assertThat(outcome).isEqualTo(VaultEncryptionMigrationService.FileMigrationOutcome.MIGRATED);
        assertThat(legacyVaultFile.isEncrypted()).isTrue();
        assertThat(legacyVaultFile.resolveEncryptionMode()).isEqualTo(FileEncryptionMode.SERVER_ENVELOPE_V1);
        assertThat(legacyVaultFile.getFileSavePath()).isEqualTo("7/vault/new-enc.enc");
        assertThat(legacyVaultFile.getEncryptedFileSize()).isEqualTo(4112L);
        verify(fileUpDownloadRepository).saveAndFlush(legacyVaultFile);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> deleteCaptor = ArgumentCaptor.forClass(List.class);
        verify(fileObjectDeletionService).deleteObjects(deleteCaptor.capture());
        assertThat(deleteCaptor.getValue()).containsExactly("7/legacy.mp4", "7/thumbnails/legacy.jpg");
    }

    @Test
    void deletesNewEncryptedObjectIfFileChangedConcurrentlyBeforeCommit() {
        User owner = User.builder().idx(7L).build();
        FileInfo alreadyEncrypted = FileInfo.builder()
                .idx(15L)
                .user(owner)
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.VAULT)
                .fileOriginName("secret-clip.mp4")
                .fileSaveName("concurrent.enc")
                .fileSavePath("7/vault/concurrent.enc")
                .fileFormat("mp4")
                .fileSize(4096L)
                .encryptionMode(FileEncryptionMode.SERVER_ENVELOPE_V1)
                .trashed(false)
                .build();

        when(vaultFileCryptoService.encryptPlaintextObject(7L, "7/legacy.mp4", 4096L))
                .thenReturn(new VaultFileCryptoService.VaultEncryptionResult(
                        "7/vault/orphan.enc",
                        "orphan.enc",
                        1,
                        "wrapped-dek",
                        "nonce-b64",
                        1048576,
                        4096L,
                        4112L
                ));
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(15L, 7L))
                .thenReturn(Optional.of(alreadyEncrypted));

        var outcome = service.migrateSingleVaultFile(7L, 15L, "7/legacy.mp4", 4096L);

        assertThat(outcome).isEqualTo(VaultEncryptionMigrationService.FileMigrationOutcome.SKIPPED);
        verify(vaultFileCryptoService).deleteObjectQuietly("7/vault/orphan.enc");
        verify(fileUpDownloadRepository, never()).saveAndFlush(any());
    }

    @Test
    void migrateUserVaultRequiresUnlockedVaultWhenGuardIsConfigured() {
        ReflectionTestUtils.setField(service, "secretAccessGuard", secretAccessGuard);
        when(fileUpDownloadRepository.findAllByUser_Idx(7L)).thenReturn(List.of());

        var report = service.migrateUserVault(7L);

        verify(secretAccessGuard).requireVaultUnlocked(7L);
        assertThat(report.scannedCount()).isZero();
    }
}
