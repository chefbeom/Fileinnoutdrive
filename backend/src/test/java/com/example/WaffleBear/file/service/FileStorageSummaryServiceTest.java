package com.example.WaffleBear.file.service;

import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.info.dto.FileInfoDto;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.version.FileVersionLifecycleService;
import com.example.WaffleBear.user.model.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileStorageSummaryServiceTest {

    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;

    @Mock
    private StoragePlanService storagePlanService;

    @Mock
    private FileVersionLifecycleService fileVersionLifecycleService;

    @InjectMocks
    private FileStorageSummaryService fileStorageSummaryService;

    @Test
    void buildsStorageSummaryFromFilesQuotaAndVersionBytes() {
        Long userIdx = 7L;
        FileInfo folder = folder(20L, userIdx, false);
        FileInfo trashedFolder = folder(21L, userIdx, true);
        FileInfo document = file(1L, userIdx, "report.pdf", "pdf", 100L, folder, false, LocalDateTime.parse("2026-01-01T10:00:00"));
        FileInfo image = file(2L, userIdx, "diagram.png", "png", 300L, folder, false, LocalDateTime.parse("2026-01-02T10:00:00"));
        FileInfo video = file(3L, userIdx, "demo.mp4", "mp4", 200L, null, false, LocalDateTime.parse("2026-01-03T10:00:00"));
        FileInfo archivedTrash = file(4L, userIdx, "old.zip", "zip", 50L, trashedFolder, true, LocalDateTime.parse("2026-01-04T10:00:00"));

        when(fileUpDownloadRepository.findAllByUser_Idx(userIdx))
                .thenReturn(List.of(folder, trashedFolder, document, image, video, archivedTrash));
        when(storagePlanService.resolveQuota(userIdx)).thenReturn(quota(1_000L, 500L));
        when(storagePlanService.isAdministrator(userIdx)).thenReturn(false);
        when(fileVersionLifecycleService.sumStoredVersionBytes(userIdx)).thenReturn(25L);

        FileInfoDto.StorageSummaryRes summary = fileStorageSummaryService.getStorageSummary(userIdx);

        assertThat(summary.getPlanCode()).isEqualTo("PRO");
        assertThat(summary.getAdminAccount()).isFalse();
        assertThat(summary.getQuotaBytes()).isEqualTo(1_500L);
        assertThat(summary.getUsedBytes()).isEqualTo(675L);
        assertThat(summary.getActiveUsedBytes()).isEqualTo(600L);
        assertThat(summary.getTrashUsedBytes()).isEqualTo(50L);
        assertThat(summary.getRemainingBytes()).isEqualTo(825L);
        assertThat(summary.getUsagePercent()).isEqualTo(45);
        assertThat(summary.getTotalFileCount()).isEqualTo(4);
        assertThat(summary.getActiveFileCount()).isEqualTo(3);
        assertThat(summary.getTrashFileCount()).isEqualTo(1);
        assertThat(summary.getActiveFolderCount()).isEqualTo(1);
        assertThat(summary.getTrashFolderCount()).isEqualTo(1);

        assertThat(summary.getCategories())
                .extracting(FileInfoDto.StorageCategoryRes::getCategoryKey)
                .containsExactly("document", "image", "video", "archive", "audio", "other");
        assertThat(category(summary, "document").getCategoryLabel()).isEqualTo("문서");
        assertThat(category(summary, "document").getFileCount()).isEqualTo(1);
        assertThat(category(summary, "document").getSizeBytes()).isEqualTo(100L);
        assertThat(category(summary, "document").getUsagePercent()).isEqualTo(17);
        assertThat(category(summary, "image").getSizeBytes()).isEqualTo(300L);
        assertThat(category(summary, "image").getUsagePercent()).isEqualTo(50);
        assertThat(category(summary, "video").getSizeBytes()).isEqualTo(200L);
        assertThat(category(summary, "video").getUsagePercent()).isEqualTo(33);
        assertThat(category(summary, "archive").getSizeBytes()).isEqualTo(0L);

        assertThat(summary.getLargestFiles())
                .extracting(FileInfoDto.StorageTopFileRes::getFileOriginName)
                .containsExactly("diagram.png", "demo.mp4", "report.pdf");
    }

    @Test
    void treatsNullAndNegativeSizesAsZero() {
        Long userIdx = 9L;
        FileInfo empty = file(1L, userIdx, "empty.txt", "txt", null, null, false, LocalDateTime.parse("2026-01-01T10:00:00"));
        FileInfo negative = file(2L, userIdx, "broken.bin", "bin", -10L, null, false, LocalDateTime.parse("2026-01-02T10:00:00"));

        when(fileUpDownloadRepository.findAllByUser_Idx(userIdx)).thenReturn(List.of(empty, negative));
        when(storagePlanService.resolveQuota(userIdx)).thenReturn(quota(0L, 0L));
        when(storagePlanService.isAdministrator(userIdx)).thenReturn(true);
        when(fileVersionLifecycleService.sumStoredVersionBytes(userIdx)).thenReturn(0L);

        FileInfoDto.StorageSummaryRes summary = fileStorageSummaryService.getStorageSummary(userIdx);

        assertThat(summary.getAdminAccount()).isTrue();
        assertThat(summary.getQuotaBytes()).isEqualTo(0L);
        assertThat(summary.getUsedBytes()).isEqualTo(0L);
        assertThat(summary.getRemainingBytes()).isEqualTo(0L);
        assertThat(summary.getUsagePercent()).isEqualTo(0);
        assertThat(category(summary, "document").getFileCount()).isEqualTo(1);
        assertThat(category(summary, "document").getSizeBytes()).isEqualTo(0L);
        assertThat(category(summary, "other").getFileCount()).isEqualTo(1);
        assertThat(category(summary, "other").getSizeBytes()).isEqualTo(0L);
    }

    private static FileInfoDto.StorageCategoryRes category(FileInfoDto.StorageSummaryRes summary, String key) {
        return summary.getCategories().stream()
                .filter(category -> key.equals(category.getCategoryKey()))
                .findFirst()
                .orElseThrow();
    }

    private static StoragePlanService.StorageQuota quota(long baseQuotaBytes, long addonQuotaBytes) {
        return new StoragePlanService.StorageQuota(
                "PRO",
                "PRO",
                "Pro",
                baseQuotaBytes,
                addonQuotaBytes,
                baseQuotaBytes + addonQuotaBytes,
                true,
                true,
                100L,
                10
        );
    }

    private static FileInfo folder(Long idx, Long userIdx, boolean trashed) {
        return FileInfo.builder()
                .idx(idx)
                .user(User.builder().idx(userIdx).build())
                .nodeType(FileNodeType.FOLDER)
                .fileOriginName("folder-" + idx)
                .fileFormat("folder")
                .fileSaveName("folder-" + idx)
                .fileSize(0L)
                .trashed(trashed)
                .build();
    }

    private static FileInfo file(
            Long idx,
            Long userIdx,
            String fileName,
            String format,
            Long fileSize,
            FileInfo parent,
            boolean trashed,
            LocalDateTime lastModifyDate
    ) {
        return FileInfo.builder()
                .idx(idx)
                .user(User.builder().idx(userIdx).build())
                .parent(parent)
                .nodeType(FileNodeType.FILE)
                .fileOriginName(fileName)
                .fileFormat(format)
                .fileSaveName(fileName)
                .fileSavePath(userIdx + "/" + fileName)
                .fileSize(fileSize)
                .trashed(trashed)
                .lastModifyDate(lastModifyDate)
                .build();
    }
}