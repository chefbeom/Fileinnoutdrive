package com.example.WaffleBear.workspace.asset;

import com.example.WaffleBear.config.stomp.ClusteredStompPublisher;
import com.example.WaffleBear.workspace.asset.model.WorkspaceAssetDto;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class WorkspaceAssetEventPublisherTest {

    @Mock
    private ClusteredStompPublisher stompPublisher;

    @InjectMocks
    private WorkspaceAssetEventPublisher eventPublisher;

    @AfterEach
    void clearTransactionSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void publishAfterCommitPublishesImmediatelyWithoutActiveSynchronization() {
        WorkspaceAssetDto.AssetRes asset = assetRes(99L);

        eventPublisher.publishAfterCommit(10L, "UPLOAD", 1L, List.of(asset), null);

        ArgumentCaptor<WorkspaceAssetDto.AssetEvent> eventCaptor = ArgumentCaptor.forClass(WorkspaceAssetDto.AssetEvent.class);
        verify(stompPublisher).send(eq("/sub/workspace/assets/10"), eventCaptor.capture());
        WorkspaceAssetDto.AssetEvent event = eventCaptor.getValue();
        assertThat(event.workspaceIdx()).isEqualTo(10L);
        assertThat(event.action()).isEqualTo("UPLOAD");
        assertThat(event.actorUserIdx()).isEqualTo(1L);
        assertThat(event.assets()).containsExactly(asset);
        assertThat(event.assetIdxList()).isEmpty();
    }

    @Test
    void publishAfterCommitDefersPublishUntilTransactionCommit() {
        TransactionSynchronizationManager.initSynchronization();

        eventPublisher.publishAfterCommit(10L, "DELETE", 1L, null, List.of(77L));

        verify(stompPublisher, never()).send(eq("/sub/workspace/assets/10"), org.mockito.ArgumentMatchers.any());
        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCommit();
        }

        ArgumentCaptor<WorkspaceAssetDto.AssetEvent> eventCaptor = ArgumentCaptor.forClass(WorkspaceAssetDto.AssetEvent.class);
        verify(stompPublisher).send(eq("/sub/workspace/assets/10"), eventCaptor.capture());
        WorkspaceAssetDto.AssetEvent event = eventCaptor.getValue();
        assertThat(event.assets()).isEmpty();
        assertThat(event.assetIdxList()).containsExactly(77L);
    }

    @Test
    void publishAfterCommitDoesNotPublishWhenTransactionRollsBack() {
        TransactionSynchronizationManager.initSynchronization();

        eventPublisher.publishAfterCommit(10L, "DELETE", 1L, null, List.of(77L));

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        }

        verify(stompPublisher, never()).send(eq("/sub/workspace/assets/10"), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void publishAfterCommitIgnoresNullWorkspace() {
        eventPublisher.publishAfterCommit(null, "UPLOAD", 1L, List.of(assetRes(99L)), null);

        verify(stompPublisher, never()).send(eq("/sub/workspace/assets/null"), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void publishAfterCommitSwallowsPublisherFailure() {
        doThrow(new IllegalStateException("broker down"))
                .when(stompPublisher)
                .send(eq("/sub/workspace/assets/10"), org.mockito.ArgumentMatchers.any());

        eventPublisher.publishAfterCommit(10L, "UPLOAD", 1L, null, null);

        verify(stompPublisher).send(eq("/sub/workspace/assets/10"), org.mockito.ArgumentMatchers.any());
    }

    private WorkspaceAssetDto.AssetRes assetRes(Long idx) {
        return new WorkspaceAssetDto.AssetRes(
                idx,
                10L,
                "FILE",
                "report.txt",
                "stored-report.txt",
                "asset/workspace",
                "asset/workspace/stored-report.txt",
                "text/plain",
                5L,
                null,
                "http://download.example/report.txt",
                1800,
                null
        );
    }
}