package com.example.WaffleBear.file.service;

import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.file.dto.FileCommonDto;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.http.Method;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
class FileListItemUrlService {

    private final MinioPresignedUrlService minioPresignedUrlService;
    private final MinioProperties minioProperties;
    private final FileThumbnailService fileThumbnailService;

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
            return minioPresignedUrlService.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(minioProperties.getBucket_cloud())
                    .object(item.getFileSavePath())
                    .expiry(minioProperties.getPresignedUrlExpirySeconds())
                    .build());
        } catch (Exception e) {
            return null;
        }
    }
}
