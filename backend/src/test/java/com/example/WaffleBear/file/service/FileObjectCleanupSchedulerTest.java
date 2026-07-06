package com.example.WaffleBear.file.service;

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
class FileObjectCleanupSchedulerTest {

    @Mock
    private FileObjectDeletionService deletionService;

    @AfterEach
    void clearTransactionSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    @Test
    void deleteAfterCommitDeletesImmediatelyWithoutActiveTransaction() {
        FileObjectCleanupScheduler.deleteAfterCommit(deletionService, List.of("1/a.txt", "1/a.txt", " "));

        verify(deletionService).deleteObjects(List.of("1/a.txt"));
    }

    @Test
    void deleteAfterCommitRunsOnlyAfterTransactionCommit() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);

        FileObjectCleanupScheduler.deleteAfterCommit(deletionService, List.of("1/a.txt", "1/b.txt"));

        verify(deletionService, never()).deleteObjects(List.of("1/a.txt", "1/b.txt"));

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCommit();
        }

        verify(deletionService).deleteObjects(List.of("1/a.txt", "1/b.txt"));
    }

    @Test
    void deleteAfterCommitSkipsEmptyKeys() {
        FileObjectCleanupScheduler.deleteAfterCommit(deletionService, List.of(" ", ""));

        verify(deletionService, never()).deleteObjects(org.mockito.ArgumentMatchers.any());
    }
}
