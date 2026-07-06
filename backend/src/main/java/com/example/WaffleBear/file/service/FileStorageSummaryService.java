package com.example.WaffleBear.file.service;

import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.info.dto.FileInfoDto;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.version.FileVersionLifecycleService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.example.WaffleBear.file.util.FileContentUtils.categorizeExtension;

@Service
@RequiredArgsConstructor
public class FileStorageSummaryService {

    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final StoragePlanService storagePlanService;
    private final FileVersionLifecycleService fileVersionLifecycleService;

    public FileInfoDto.StorageSummaryRes getStorageSummary(Long userIdx) {
        List<FileInfo> userFiles = fileUpDownloadRepository.findAllByUser_Idx(userIdx);
        List<FileInfo> allFileNodes = userFiles.stream()
                .filter(file -> FileTreeRules.resolveNodeType(file) == FileNodeType.FILE)
                .toList();
        List<FileInfo> activeFileNodes = allFileNodes.stream()
                .filter(file -> !file.isTrashed())
                .toList();
        List<FileInfo> trashFileNodes = allFileNodes.stream()
                .filter(FileInfo::isTrashed)
                .toList();
        List<FileInfo> activeFolderNodes = userFiles.stream()
                .filter(file -> FileTreeRules.resolveNodeType(file) == FileNodeType.FOLDER && !file.isTrashed())
                .toList();
        List<FileInfo> trashFolderNodes = userFiles.stream()
                .filter(file -> FileTreeRules.resolveNodeType(file) == FileNodeType.FOLDER && file.isTrashed())
                .toList();

        StoragePlanService.StorageQuota storageQuota = storagePlanService.resolveQuota(userIdx);
        long quotaBytes = storageQuota.totalQuotaBytes();
        long versionUsedBytes = fileVersionLifecycleService.sumStoredVersionBytes(userIdx);
        long usedBytes = sumFileSizes(allFileNodes) + versionUsedBytes;
        long activeUsedBytes = sumFileSizes(activeFileNodes);
        long trashUsedBytes = sumFileSizes(trashFileNodes);
        int usagePercent = quotaBytes > 0
                ? (int) Math.min(100, Math.round((usedBytes * 100.0) / quotaBytes))
                : 0;
        long remainingBytes = Math.max(0L, quotaBytes - usedBytes);

        Map<String, StorageCategoryAccumulator> categories = new HashMap<>();
        initializeStorageCategories(categories);
        for (FileInfo file : activeFileNodes) {
            String categoryKey = categorizeExtension(file.getFileFormat());
            StorageCategoryAccumulator accumulator = categories.get(categoryKey);
            if (accumulator == null) {
                continue;
            }

            accumulator.count += 1;
            accumulator.sizeBytes += safeFileSize(file);
        }

        List<FileInfoDto.StorageCategoryRes> categoryResponses = List.of(
                toStorageCategoryResponse("document", categories.get("document"), activeUsedBytes),
                toStorageCategoryResponse("image", categories.get("image"), activeUsedBytes),
                toStorageCategoryResponse("video", categories.get("video"), activeUsedBytes),
                toStorageCategoryResponse("archive", categories.get("archive"), activeUsedBytes),
                toStorageCategoryResponse("audio", categories.get("audio"), activeUsedBytes),
                toStorageCategoryResponse("other", categories.get("other"), activeUsedBytes)
        );

        List<FileInfoDto.StorageTopFileRes> largestFiles = activeFileNodes.stream()
                .sorted(Comparator.comparingLong(this::safeFileSize).reversed()
                        .thenComparing(FileInfo::getLastModifyDate, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(7)
                .map(this::toStorageTopFile)
                .toList();

        return FileInfoDto.StorageSummaryRes.builder()
                .planCode(storageQuota.planCode())
                .planLabel(storageQuota.planLabel())
                .adminAccount(storagePlanService.isAdministrator(userIdx))
                .shareEnabled(storageQuota.shareEnabled())
                .fileLockEnabled(storageQuota.fileLockEnabled())
                .maxUploadFileBytes(storageQuota.maxUploadFileBytes())
                .maxUploadCount(storageQuota.maxUploadCount())
                .quotaBytes(quotaBytes)
                .baseQuotaBytes(storageQuota.baseQuotaBytes())
                .addonQuotaBytes(storageQuota.addonQuotaBytes())
                .usedBytes(usedBytes)
                .activeUsedBytes(activeUsedBytes)
                .trashUsedBytes(trashUsedBytes)
                .remainingBytes(remainingBytes)
                .usagePercent(usagePercent)
                .totalFileCount(allFileNodes.size())
                .activeFileCount(activeFileNodes.size())
                .trashFileCount(trashFileNodes.size())
                .activeFolderCount(activeFolderNodes.size())
                .trashFolderCount(trashFolderNodes.size())
                .categories(categoryResponses)
                .largestFiles(largestFiles)
                .build();
    }

    private long sumFileSizes(List<FileInfo> fileNodes) {
        return fileNodes.stream()
                .mapToLong(this::safeFileSize)
                .sum();
    }

    private long safeFileSize(FileInfo file) {
        return file != null && file.getFileSize() != null && file.getFileSize() > 0
                ? file.getFileSize()
                : 0L;
    }

    private void initializeStorageCategories(Map<String, StorageCategoryAccumulator> categories) {
        categories.put("document", new StorageCategoryAccumulator("문서"));
        categories.put("image", new StorageCategoryAccumulator("이미지"));
        categories.put("video", new StorageCategoryAccumulator("동영상"));
        categories.put("archive", new StorageCategoryAccumulator("압축"));
        categories.put("audio", new StorageCategoryAccumulator("오디오"));
        categories.put("other", new StorageCategoryAccumulator("기타"));
    }

    private FileInfoDto.StorageCategoryRes toStorageCategoryResponse(
            String categoryKey,
            StorageCategoryAccumulator accumulator,
            long totalActiveBytes
    ) {
        long sizeBytes = accumulator != null ? accumulator.sizeBytes : 0L;
        int usagePercent = totalActiveBytes > 0
                ? (int) Math.round((sizeBytes * 100.0) / totalActiveBytes)
                : 0;

        return FileInfoDto.StorageCategoryRes.builder()
                .categoryKey(categoryKey)
                .categoryLabel(accumulator != null ? accumulator.label : categoryKey)
                .fileCount(accumulator != null ? accumulator.count : 0)
                .sizeBytes(sizeBytes)
                .usagePercent(usagePercent)
                .build();
    }

    private FileInfoDto.StorageTopFileRes toStorageTopFile(FileInfo entity) {
        return FileInfoDto.StorageTopFileRes.builder()
                .idx(entity.getIdx())
                .fileOriginName(entity.getFileOriginName())
                .fileFormat(entity.getFileFormat())
                .fileSize(entity.getFileSize())
                .lastModifyDate(entity.getLastModifyDate())
                .parentId(entity.getParent() != null ? entity.getParent().getIdx() : null)
                .build();
    }

    private static class StorageCategoryAccumulator {
        private final String label;
        private int count;
        private long sizeBytes;

        private StorageCategoryAccumulator(String label) {
            this.label = label;
        }
    }
}