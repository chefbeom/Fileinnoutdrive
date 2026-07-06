package com.example.WaffleBear.file.share;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class ShareObjectCleanupSchedulerTest {

    @Mock
    private ShareFileObjectStorageService objectStorageService;

    @AfterEach
    void clearTransactionSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    @Test
    void deleteAfterRollbackDeletesOnlyWhenTransactionRollsBack() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);

        ShareObjectCleanupScheduler.deleteAfterRollback(objectStorageService, "1/report.txt");

        verify(objectStorageService, never()).deleteObjectQuietly("1/report.txt");

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        }

        verify(objectStorageService).deleteObjectQuietly("1/report.txt");
    }

    @Test
    void deleteAfterRollbackSkipsWhenNoActiveTransaction() {
        ShareObjectCleanupScheduler.deleteAfterRollback(objectStorageService, "1/report.txt");

        verify(objectStorageService, never()).deleteObjectQuietly("1/report.txt");
    }

    @Test
    void deleteQuietlyDeletesImmediateObjectAndSkipsBlankKeys() {
        ShareObjectCleanupScheduler.deleteQuietly(objectStorageService, "1/report.txt");
        ShareObjectCleanupScheduler.deleteQuietly(objectStorageService, " ");
        ShareObjectCleanupScheduler.deleteQuietly(objectStorageService, null);

        verify(objectStorageService).deleteObjectQuietly("1/report.txt");
        verify(objectStorageService, never()).deleteObjectQuietly(" ");
        verify(objectStorageService, never()).deleteObjectQuietly(null);
    }
}
