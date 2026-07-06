package com.example.WaffleBear.workspace.asset;

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
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class WorkspaceAssetObjectCleanupSchedulerTest {

    @Mock
    private WorkspaceAssetObjectStorageService objectStorageService;

    @AfterEach
    void clearTransactionSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    @Test
    void deleteAfterRollbackDeletesQuietlyOnlyWhenTransactionRollsBack() {
        startTransactionSynchronization();

        WorkspaceAssetObjectCleanupScheduler.deleteAfterRollback(objectStorageService, List.of("", "object-a"));

        verifyNoInteractions(objectStorageService);

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        }

        verify(objectStorageService).deleteCloudObjectsQuietly(List.of("object-a"));
        verify(objectStorageService, never()).deleteCloudObjects(List.of("object-a"));
    }

    @Test
    void deleteAfterCommitDeletesQuietlyOnlyAfterCommitWhenTransactionIsActive() {
        startTransactionSynchronization();

        WorkspaceAssetObjectCleanupScheduler.deleteAfterCommit(objectStorageService, List.of("object-a"));

        verifyNoInteractions(objectStorageService);

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCommit();
        }

        verify(objectStorageService).deleteCloudObjectsQuietly(List.of("object-a"));
        verify(objectStorageService, never()).deleteCloudObjects(List.of("object-a"));
    }

    @Test
    void deleteAfterCommitDeletesImmediatelyWhenTransactionIsNotActive() {
        WorkspaceAssetObjectCleanupScheduler.deleteAfterCommit(objectStorageService, List.of("object-a"));

        verify(objectStorageService).deleteCloudObjects(List.of("object-a"));
        verify(objectStorageService, never()).deleteCloudObjectsQuietly(List.of("object-a"));
    }

    @Test
    void deleteAfterRollbackSkipsEmptyAndInactiveRequests() {
        WorkspaceAssetObjectCleanupScheduler.deleteAfterRollback(objectStorageService, List.of("", " "));

        verifyNoInteractions(objectStorageService);
    }

    private void startTransactionSynchronization() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
    }
}
