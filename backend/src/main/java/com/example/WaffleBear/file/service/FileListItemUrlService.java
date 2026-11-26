package com.example.WaffleBear.file.service;

import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.secret.SecretTokenService;
import com.example.WaffleBear.file.util.FileContentUtils;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.http.Method;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.Objects;

@Service
@RequiredArgsConstructor
class FileListItemUrlService {

    private final MinioPresignedUrlService minioPresignedUrlService;
    private final MinioProperties minioProperties;
    private final FileThumbnailService fileThumbnailService;

    @Autowired(required = false)
    private SecretTokenService secretTokenService;

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
        return attachUrls(null, item);
    }

    FileCommonDto.FileListItemRes attachUrls(Long userIdx, FileCommonDto.FileListItemRes item) {
        if (item == null) {
            return null;
        }

        if (isEncryptedItem(item)) {
            item.setThumbnailPresignedUrl(null);
            if (canIssueStreamUrl(item) && secretTokenService != null && userIdx != null && userIdx > 0L && item.getIdx() != null) {
                String token = secretTokenService.createVaultStreamToken(userIdx, item.getIdx());
                item.setPresignedDownloadUrl(token != null ? "/api/file/secret/stream/" + item.getIdx() + "?st=" + token : null);
                item.setPresignedUrlExpiresIn((int) secretTokenService.getStreamTokenTtlSeconds());
            } else {
                item.setPresignedDownloadUrl(null);
                item.setPresignedUrlExpiresIn(secretTokenService != null ? (int) secretTokenService.getStreamTokenTtlSeconds() : null);
            }
            return item;
        }

        item.setPresignedDownloadUrl(generatePresignedDownloadUrl(item));
        item.setThumbnailPresignedUrl(
                fileThumbnailService.generatePresignedThumbnailUrl(FileDownloadRules.toFileInfoUrlSnapshot(item))
        );
        item.setPresignedUrlExpiresIn(minioProperties.getPresignedUrlExpirySeconds());
        return item;
    }

    private boolean isEncryptedItem(FileCommonDto.FileListItemRes item) {
        return Boolean.TRUE.equals(item.getEncrypted())
                || (item.getEncryptionMode() != null && !"NONE".equalsIgnoreCase(item.getEncryptionMode()));
    }

    private boolean canIssueStreamUrl(FileCommonDto.FileListItemRes item) {
        if (Boolean.TRUE.equals(item.getLockedFile()) || Boolean.TRUE.equals(item.getTrashed())) {
            return false;
        }
        if (FileDownloadRules.parseNodeType(item.getNodeType()) != FileNodeType.FILE) {
            return false;
        }
        String objectKey = item.getFileSavePath();
        return objectKey != null && !objectKey.isBlank();
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
