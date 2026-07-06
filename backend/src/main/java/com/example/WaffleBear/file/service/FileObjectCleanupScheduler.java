package com.example.WaffleBear.file.service;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Collection;
import java.util.List;

final class FileObjectCleanupScheduler {

    private FileObjectCleanupScheduler() {
    }

    static void deleteAfterCommit(FileObjectDeletionService deletionService, Collection<String> objectKeys) {
        if (deletionService == null) {
            return;
        }

        List<String> keys = objectKeys == null
                ? List.of()
                : objectKeys.stream()
                .filter(key -> key != null && !key.isBlank())
                .distinct()
                .toList();
        if (keys.isEmpty()) {
            return;
        }

        if (!TransactionSynchronizationManager.isSynchronizationActive()
                || !TransactionSynchronizationManager.isActualTransactionActive()) {
            deletionService.deleteObjects(keys);
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                deletionService.deleteObjects(keys);
            }
        });
    }
}
