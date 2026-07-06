package com.example.WaffleBear.file.upload;

import lombok.extern.slf4j.Slf4j;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Collection;
import java.util.List;

@Slf4j
final class UploadObjectCleanupScheduler {

    private UploadObjectCleanupScheduler() {
    }

    static void deleteAfterRollback(
            UploadObjectStorageService objectStorageService,
            Collection<String> objectKeys
    ) {
        List<String> cleanupTargets = UploadObjectRules.normalizeDeleteObjectKeys(objectKeys);
        if (cleanupTargets.isEmpty()
                || !TransactionSynchronizationManager.isSynchronizationActive()
                || !TransactionSynchronizationManager.isActualTransactionActive()) {
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == TransactionSynchronization.STATUS_ROLLED_BACK) {
                    deleteQuietly(objectStorageService, cleanupTargets);
                }
            }
        });
    }

    static void deleteAfterCommit(
            UploadObjectStorageService objectStorageService,
            Collection<String> objectKeys
    ) {
        List<String> cleanupTargets = UploadObjectRules.normalizeDeleteObjectKeys(objectKeys);
        if (cleanupTargets.isEmpty()) {
            return;
        }

        if (!TransactionSynchronizationManager.isSynchronizationActive()
                || !TransactionSynchronizationManager.isActualTransactionActive()) {
            deleteNow(objectStorageService, cleanupTargets);
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                deleteQuietly(objectStorageService, cleanupTargets);
            }
        });
    }

    static void deleteQuietly(
            UploadObjectStorageService objectStorageService,
            Collection<String> objectKeys
    ) {
        List<String> cleanupTargets = UploadObjectRules.normalizeDeleteObjectKeys(objectKeys);
        if (cleanupTargets.isEmpty()) {
            return;
        }

        try {
            objectStorageService.deleteObjectKeys(cleanupTargets);
        } catch (RuntimeException exception) {
            log.warn("Upload object cleanup failed. objectKeys={}", cleanupTargets, exception);
        }
    }

    private static void deleteNow(
            UploadObjectStorageService objectStorageService,
            Collection<String> objectKeys
    ) {
        objectStorageService.deleteObjectKeys(objectKeys);
    }
}