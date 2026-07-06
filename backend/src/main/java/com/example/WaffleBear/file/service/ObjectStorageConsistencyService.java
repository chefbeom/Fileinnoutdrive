package com.example.WaffleBear.file.service;

import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.version.FileVersionRepository;
import com.example.WaffleBear.workspace.asset.WorkspaceAssetRepository;
import io.minio.ListObjectsArgs;
import io.minio.MinioClient;
import io.minio.Result;
import io.minio.messages.Item;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ObjectStorageConsistencyService {

    private static final int DEFAULT_MAX_SCAN = 10_000;

    private final MinioClient minioClient;
    private final MinioProperties minioProperties;
    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final FileVersionRepository fileVersionRepository;
    private final WorkspaceAssetRepository workspaceAssetRepository;
    private final FileObjectDeletionService fileObjectDeletionService;

    public StorageObjectCleanupReport findCloudOrphanObjects(int maxScan) {
        Set<String> referencedObjectKeys = loadReferencedCloudObjectKeys();
        ListedObjectKeys listedObjectKeys = listCloudObjectKeys(maxScan);
        List<String> orphanObjectKeys = listedObjectKeys.objectKeys().stream()
                .filter(objectKey -> !referencedObjectKeys.contains(objectKey))
                .toList();

        return new StorageObjectCleanupReport(
                listedObjectKeys.objectKeys().size(),
                referencedObjectKeys.size(),
                orphanObjectKeys,
                listedObjectKeys.truncated(),
                true,
                false
        );
    }

    public StorageObjectCleanupReport cleanupCloudOrphanObjects(int maxScan, boolean dryRun) {
        StorageObjectCleanupReport report = findCloudOrphanObjects(maxScan);
        if (!dryRun && !report.orphanObjectKeys().isEmpty()) {
            fileObjectDeletionService.deleteObjects(report.orphanObjectKeys());
            return report.asExecuted();
        }
        return report;
    }

    @Transactional(readOnly = true)
    public Set<String> loadReferencedCloudObjectKeys() {
        Set<String> referencedObjectKeys = new LinkedHashSet<>();
        addNormalizedObjectKeys(referencedObjectKeys, fileUpDownloadRepository.findStoredObjectKeys());
        addNormalizedObjectKeys(referencedObjectKeys, fileVersionRepository.findStoredObjectKeys());
        addNormalizedObjectKeys(referencedObjectKeys, workspaceAssetRepository.findAllObjectKeys());
        return referencedObjectKeys;
    }

    ListedObjectKeys listCloudObjectKeys(int maxScan) {
        int scanLimit = maxScan > 0 ? maxScan : DEFAULT_MAX_SCAN;
        List<String> objectKeys = new ArrayList<>();
        String bucketName = minioProperties.getBucket_cloud();
        if (!StringUtils.hasText(bucketName)) {
            return new ListedObjectKeys(List.of(), false);
        }

        try {
            Iterable<Result<Item>> results = minioClient.listObjects(
                    ListObjectsArgs.builder()
                            .bucket(bucketName)
                            .recursive(true)
                            .build()
            );
            boolean truncated = false;
            for (Result<Item> result : results) {
                Item item = result.get();
                if (item == null || item.isDir() || !StringUtils.hasText(item.objectName())) {
                    continue;
                }
                if (objectKeys.size() >= scanLimit) {
                    truncated = true;
                    break;
                }
                objectKeys.add(item.objectName().trim());
            }
            return new ListedObjectKeys(objectKeys, truncated);
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to scan cloud object storage for orphan cleanup", exception);
        }
    }

    private void addNormalizedObjectKeys(Set<String> target, Collection<String> objectKeys) {
        if (objectKeys == null) {
            return;
        }
        objectKeys.stream()
                .filter(StringUtils::hasText)
                .map(String::trim)
                .forEach(target::add);
    }

    record ListedObjectKeys(List<String> objectKeys, boolean truncated) {
    }

    public record StorageObjectCleanupReport(
            int scannedCount,
            int referencedCount,
            List<String> orphanObjectKeys,
            boolean truncated,
            boolean dryRun,
            boolean deleted
    ) {
        public StorageObjectCleanupReport {
            orphanObjectKeys = orphanObjectKeys == null ? List.of() : List.copyOf(orphanObjectKeys);
        }

        public int orphanCount() {
            return orphanObjectKeys.size();
        }

        StorageObjectCleanupReport asExecuted() {
            return new StorageObjectCleanupReport(
                    scannedCount,
                    referencedCount,
                    orphanObjectKeys,
                    truncated,
                    false,
                    true
            );
        }
    }
}