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
            VaultFileCryptoService.VaultEncryptionResult encResult = null;
            try {
                encResult = vaultFileCryptoService.encryptPlaintextObject(userIdx, oldObjectKey, plainSize);
                final VaultFileCryptoService.VaultEncryptionResult finalizedEnc = encResult;
                final Long fileIdx = candidate.getIdx();

                Boolean updated = transactionTemplate.execute(status -> {
                    FileInfo managed = fileUpDownloadRepository.findByIdxAndUser_Idx(fileIdx, userIdx).orElse(null);
                    if (managed == null
                            || !managed.isVaultSpace()
                            || managed.isTrashed()
                            || FileTreeRules.resolveNodeType(managed) != FileNodeType.FILE
                            || managed.isEncrypted()) {
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
                    FileObjectCleanupScheduler.deleteAfterCommit(
                            fileObjectDeletionService,
                            List.of(oldObjectKey, FileContentUtils.buildThumbnailObjectKey(oldObjectKey))
                    );
                    return Boolean.TRUE;
                });

                if (Boolean.TRUE.equals(updated)) {
                    migratedCount++;
                } else {
                    vaultFileCryptoService.deleteObjectQuietly(encResult.encryptedObjectKey());
                    skippedCount++;
                }
            } catch (Exception exception) {
                if (encResult != null) {
                    vaultFileCryptoService.deleteObjectQuietly(encResult.encryptedObjectKey());
                }
                failedCount++;
                log.warn("Failed to migrate vault file [idx={}] for user [{}]: {}",
                        candidate.getIdx(), userIdx, exception.getMessage());
            }
        }

        return new MigrationReport(scannedCount, migratedCount, skippedCount, failedCount);
    }
}
