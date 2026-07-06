package com.example.WaffleBear.workspace.asset;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Collection;
import java.util.List;

final class WorkspaceAssetObjectCleanupScheduler {

    private WorkspaceAssetObjectCleanupScheduler() {
    }

    static void deleteAfterRollback(
            WorkspaceAssetObjectStorageService objectStorageService,
            Collection<String> objectKeys
    ) {
        List<String> normalizedObjectKeys = WorkspaceAssetRules.normalizeObjectKeys(objectKeys);
        if (normalizedObjectKeys.isEmpty() || !TransactionSynchronizationManager.isActualTransactionActive()) {
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == TransactionSynchronization.STATUS_ROLLED_BACK) {
                    deleteQuietly(objectStorageService, normalizedObjectKeys);
                }
            }
        });
    }

    static void deleteAfterCommit(
            WorkspaceAssetObjectStorageService objectStorageService,
            Collection<String> objectKeys
    ) {
        List<String> normalizedObjectKeys = WorkspaceAssetRules.normalizeObjectKeys(objectKeys);
        if (normalizedObjectKeys.isEmpty()) {
            return;
        }

        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            deleteNow(objectStorageService, normalizedObjectKeys);
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                deleteQuietly(objectStorageService, normalizedObjectKeys);
            }
        });
    }

    static void deleteQuietly(
            WorkspaceAssetObjectStorageService objectStorageService,
            Collection<String> objectKeys
    ) {
        objectStorageService.deleteCloudObjectsQuietly(objectKeys);
    }

    private static void deleteNow(
            WorkspaceAssetObjectStorageService objectStorageService,
            Collection<String> objectKeys
    ) {
        objectStorageService.deleteCloudObjects(objectKeys);
    }
}
