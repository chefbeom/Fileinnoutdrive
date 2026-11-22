package com.example.WaffleBear.file.service;

import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.file.util.FileContentUtils;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.http.Method;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.Objects;

@Service
@RequiredArgsConstructor
class FileListItemUrlService {

    private final MinioPresignedUrlService minioPresignedUrlService;
    private final MinioProperties minioProperties;
    private final FileThumbnailService fileThumbnailService;

    void prepareThumbnailUrls(Collection<FileCommonDto.FileListItemRes> items) {
        if (items == null || items.isEmpty()) {
            return;
        }

        fileThumbnailService.warmThumbnailsForFiles(
                items.stream()
                        .filter(Objects::nonNull)
                        .map(FileDownloadRules::toFileInfoUrlSnapshot)
                        .toList()
        );
    }

    FileCommonDto.FileListItemRes attachUrls(FileCommonDto.FileListItemRes item) {
        if (item == null) {
            return null;
        }

        item.setPresignedDownloadUrl(generatePresignedDownloadUrl(item));
        item.setThumbnailPresignedUrl(
                fileThumbnailService.generatePresignedThumbnailUrl(FileDownloadRules.toFileInfoUrlSnapshot(item))
        );
        item.setPresignedUrlExpiresIn(minioProperties.getPresignedUrlExpirySeconds());
        return item;
    }

    private String generatePresignedDownloadUrl(FileCommonDto.FileListItemRes item) {
        if (!FileDownloadRules.canGeneratePresignedDownloadUrl(item)) {
            return null;
        }

        try {
            GetPresignedObjectUrlArgs.Builder builder = GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(minioProperties.getBucket_cloud())
                    .object(item.getFileSavePath())
                    .expiry(minioProperties.getPresignedUrlExpirySeconds());
            if (FileContentUtils.isActiveWebFile(item.getFileOriginName())
                    || FileContentUtils.isActiveWebFile(item.getFileFormat())) {
                builder.extraQueryParams(FileDownloadRules.attachmentQueryParams(
                        FileDownloadRules.downloadFileName(item.getFileOriginName(), item.getFileSaveName()),
                        "application/octet-stream"
                ));
            }
            return minioPresignedUrlService.getPresignedObjectUrl(builder.build());
        } catch (Exception e) {
            return null;
        }
    }
}
