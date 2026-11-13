package com.example.WaffleBear.storageshare.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
@Slf4j
public class StorageShareLifecycleScheduler {

    private final StorageGrantService storageGrantService;
    private final SharedStorageService sharedStorageService;

    @Scheduled(fixedDelayString = "${app.storage-share.cleanup-interval-ms:600000}", initialDelay = 60000)
    public void runLifecycleTasks() {
        LocalDateTime now = LocalDateTime.now();
        try {
            storageGrantService.processExpiredAndExpiringGrants(now);
        } catch (Exception e) {
            log.warn("Failed to process storage grants lifecycle", e);
        }

        try {
            sharedStorageService.processExpiredApprovalsAndTrashedStorages(now);
        } catch (Exception e) {
            log.warn("Failed to process shared storages lifecycle", e);
        }
    }
}
