package com.example.WaffleBear.file.upload;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class UploadObjectCleanupSchedulerTest {

    @Mock
    private UploadObjectStorageService objectStorageService;

    @AfterEach
    void clearTransactionSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    @Test
    void deleteAfterRollbackRunsOnlyWhenTransactionRollsBack() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);

        UploadObjectCleanupScheduler.deleteAfterRollback(objectStorageService, List.of("", "object-a"));

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCompletion(TransactionSynchronization.STATUS_COMMITTED);
        }
        verify(objectStorageService, never()).deleteObjectKeys(List.of("object-a"));

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        }
        verify(objectStorageService).deleteObjectKeys(List.of("object-a"));
    }

    @Test
    void deleteAfterCommitRunsOnlyAfterTransactionCommits() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);

        UploadObjectCleanupScheduler.deleteAfterCommit(objectStorageService, List.of("object-a"));

        verify(objectStorageService, never()).deleteObjectKeys(List.of("object-a"));
        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCommit();
        }
        verify(objectStorageService).deleteObjectKeys(List.of("object-a"));
    }

    @Test
    void deleteAfterCommitDeletesImmediatelyWithoutActiveTransaction() {
        UploadObjectCleanupScheduler.deleteAfterCommit(objectStorageService, List.of("object-a"));

        verify(objectStorageService).deleteObjectKeys(List.of("object-a"));
    }

    @Test
    void deleteAfterRollbackIgnoresBlankObjectKeys() {
        UploadObjectCleanupScheduler.deleteAfterRollback(objectStorageService, List.of("", " "));

        verify(objectStorageService, never()).deleteObjectKeys(List.of());
    }
}