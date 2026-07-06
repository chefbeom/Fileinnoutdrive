package com.example.WaffleBear.workspace.asset;

import com.example.WaffleBear.config.stomp.ClusteredStompPublisher;
import com.example.WaffleBear.workspace.asset.model.WorkspaceAssetDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
class WorkspaceAssetEventPublisher {

    private final ClusteredStompPublisher stompPublisher;

    void publishAfterCommit(
            Long workspaceIdx,
            String action,
            Long actorUserIdx,
            List<WorkspaceAssetDto.AssetRes> assets,
            List<Long> assetIdxList
    ) {
        if (workspaceIdx == null) {
            return;
        }

        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            publishQuietly(workspaceIdx, action, actorUserIdx, assets, assetIdxList);
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                publishQuietly(workspaceIdx, action, actorUserIdx, assets, assetIdxList);
            }
        });
    }

    private void publishQuietly(
            Long workspaceIdx,
            String action,
            Long actorUserIdx,
            List<WorkspaceAssetDto.AssetRes> assets,
            List<Long> assetIdxList
    ) {
        try {
            stompPublisher.send(
                    "/sub/workspace/assets/" + workspaceIdx,
                    new WorkspaceAssetDto.AssetEvent(
                            workspaceIdx,
                            action,
                            actorUserIdx,
                            assets == null ? List.of() : assets,
                            assetIdxList == null ? List.of() : assetIdxList
                    )
            );
        } catch (RuntimeException exception) {
            log.warn("Workspace asset event publish failed. workspaceIdx={}, action={}", workspaceIdx, action, exception);
        }
    }
}