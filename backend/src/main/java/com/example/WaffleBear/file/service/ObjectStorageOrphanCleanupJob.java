package com.example.WaffleBear.file.service;

import com.example.WaffleBear.file.service.ObjectStorageConsistencyService.StorageObjectCleanupReport;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "app.storage.orphan-cleanup", name = "enabled", havingValue = "true")
class ObjectStorageOrphanCleanupJob {

    private final ObjectStorageConsistencyService objectStorageConsistencyService;

    @Value("${app.storage.orphan-cleanup.dry-run:true}")
    private boolean dryRun;

    @Value("${app.storage.orphan-cleanup.max-scan:10000}")
    private int maxScan;

    @Scheduled(
            initialDelayString = "${app.storage.orphan-cleanup.initial-delay-ms:600000}",
            fixedDelayString = "${app.storage.orphan-cleanup.fixed-delay-ms:86400000}"
    )
    void cleanupCloudOrphans() {
        try {
            StorageObjectCleanupReport report = objectStorageConsistencyService.cleanupCloudOrphanObjects(maxScan, dryRun);
            log.info(
                    "Cloud object orphan cleanup completed. dryRun={}, deleted={}, scanned={}, referenced={}, orphan={}, truncated={}",
                    report.dryRun(),
                    report.deleted(),
                    report.scannedCount(),
                    report.referencedCount(),
                    report.orphanCount(),
                    report.truncated()
            );
        } catch (RuntimeException exception) {
            log.warn("Cloud object orphan cleanup failed", exception);
        }
    }
}