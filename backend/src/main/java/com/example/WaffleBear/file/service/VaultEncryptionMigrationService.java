package com.example.WaffleBear.file.service;

import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.crypto.VaultFileCryptoService;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.secret.SecretAccessGuard;
import com.example.WaffleBear.file.util.FileContentUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Encrypts legacy plaintext files already stored inside a user's unlocked personal vault.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class VaultEncryptionMigrationService {

    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final VaultFileCryptoService vaultFileCryptoService;
    private final FileObjectDeletionService fileObjectDeletionService;
    private final TransactionTemplate transactionTemplate;

    @Autowired(required = false)
    private SecretAccessGuard secretAccessGuard;

    @Autowired(required = false)
    private FileThumbnailService fileThumbnailService;

    public enum FileMigrationOutcome {
        MIGRATED,
        SKIPPED,
        FAILED
    }

    public record MigrationReport(
            int scannedCount,
            int migratedCount,
            int skippedCount,
            int failedCount
    ) {
    }

    public MigrationReport migrateUserVault(Long userIdx) {
        if (secretAccessGuard != null) {
            secretAccessGuard.requireVaultUnlocked(userIdx);
        }

        List<FileInfo> vaultFiles = fileUpDownloadRepository.findAllByUser_Idx(userIdx).stream()
                .filter(file -> file != null && file.isVaultSpace() && !file.isTrashed())
                .filter(file -> FileTreeRules.resolveNodeType(file) == FileNodeType.FILE)
                .toList();

        int scannedCount = vaultFiles.size();
        int migratedCount = 0;
        int skippedCount = 0;
        int failedCount = 0;

        for (FileInfo candidate : vaultFiles) {
            String oldObjectKey = candidate.getFileSavePath();
            if (candidate.isEncrypted() || oldObjectKey == null || oldObjectKey.isBlank()) {
                skippedCount++;
                continue;
            }

            long plainSize = Math.max(0L, candidate.getFileSize() == null ? 0L : candidate.getFileSize());
            FileMigrationOutcome outcome = migrateSingleVaultFile(
                    userIdx,
                    candidate.getIdx(),
                    oldObjectKey,
                    plainSize
            );
            switch (outcome) {
                case MIGRATED -> migratedCount++;
                case SKIPPED -> skippedCount++;
                case FAILED -> failedCount++;
            }
        }

        return new MigrationReport(scannedCount, migratedCount, skippedCount, failedCount);
    }

    /**
     * Encrypts a single unencrypted vault file outside the DB transaction and atomically commits
     * the new `.enc` object pointer + wrapped DEK metadata before scheduling old plaintext cleanup.
     */
    public FileMigrationOutcome migrateSingleVaultFile(
            Long userIdx,
            Long fileIdx,
            String expectedObjectKey,
            long plainSize
    ) {
        if (userIdx == null || userIdx <= 0L || fileIdx == null || fileIdx <= 0L
                || expectedObjectKey == null || expectedObjectKey.isBlank()) {
            return FileMigrationOutcome.SKIPPED;
        }

        VaultFileCryptoService.VaultEncryptionResult encResult = null;
        final AtomicReference<FileInfo> migratedFileRef = new AtomicReference<>();
        try {
            encResult = vaultFileCryptoService.encryptPlaintextObject(userIdx, expectedObjectKey, Math.max(0L, plainSize));
            final VaultFileCryptoService.VaultEncryptionResult finalizedEnc = encResult;

            Boolean updated = transactionTemplate.execute(status -> {
                FileInfo managed = fileUpDownloadRepository.findByIdxAndUser_Idx(fileIdx, userIdx).orElse(null);
                if (managed == null
                        || !managed.isVaultSpace()
                        || managed.isTrashed()
                        || FileTreeRules.resolveNodeType(managed) != FileNodeType.FILE
                        || managed.isEncrypted()
                        || !Objects.equals(managed.getFileSavePath(), expectedObjectKey)) {
                    return Boolean.FALSE;
                }

                managed.updateStorageObject(finalizedEnc.encryptedSaveName(), finalizedEnc.encryptedObjectKey());
                managed.applyServerEnvelopeEncryption(
                        finalizedEnc.keyVersion(),
                        finalizedEnc.wrappedDek(),
                        finalizedEnc.noncePrefixBase64(),
                        finalizedEnc.chunkSize(),
                        finalizedEnc.encryptedFileSize()
                );
                fileUpDownloadRepository.saveAndFlush(managed);
                migratedFileRef.set(managed);
                FileObjectCleanupScheduler.deleteAfterCommit(
                        fileObjectDeletionService,
                        List.of(expectedObjectKey, FileContentUtils.buildThumbnailObjectKey(expectedObjectKey))
                );
                return Boolean.TRUE;
            });

            if (Boolean.TRUE.equals(updated)) {
                if (fileThumbnailService != null && migratedFileRef.get() != null) {
                    fileThumbnailService.scheduleEncryptedThumbnailPreGeneration(migratedFileRef.get());
                }
                return FileMigrationOutcome.MIGRATED;
            }
            vaultFileCryptoService.deleteObjectQuietly(encResult.encryptedObjectKey());
            return FileMigrationOutcome.SKIPPED;
        } catch (Exception exception) {
            if (encResult != null) {
                vaultFileCryptoService.deleteObjectQuietly(encResult.encryptedObjectKey());
            }
            log.warn("Failed to migrate vault file [idx={}] for user [{}]: {}",
                    fileIdx, userIdx, exception.getMessage());
            return FileMigrationOutcome.FAILED;
        }
    }
}
