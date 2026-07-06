package com.example.WaffleBear.file.share;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

final class ShareObjectCleanupScheduler {

    private ShareObjectCleanupScheduler() {
    }

    static void deleteAfterRollback(ShareFileObjectStorageService objectStorageService, String objectKey) {
        if (objectStorageService == null || objectKey == null || objectKey.isBlank()
                || !TransactionSynchronizationManager.isActualTransactionActive()) {
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == TransactionSynchronization.STATUS_ROLLED_BACK) {
                    deleteQuietly(objectStorageService, objectKey);
                }
            }
        });
    }

    static void deleteQuietly(ShareFileObjectStorageService objectStorageService, String objectKey) {
        if (objectStorageService == null || objectKey == null || objectKey.isBlank()) {
            return;
        }
        objectStorageService.deleteObjectQuietly(objectKey);
    }
}
