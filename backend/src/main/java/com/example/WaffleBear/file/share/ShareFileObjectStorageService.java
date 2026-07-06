package com.example.WaffleBear.file.share;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.file.info.dto.FileInfoDto;
import io.minio.CopyObjectArgs;
import io.minio.CopySource;
import io.minio.GetObjectArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.StatObjectArgs;
import io.minio.http.Method;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ContentDisposition;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

import static com.example.WaffleBear.file.util.FileContentUtils.buildThumbnailObjectKey;
import static com.example.WaffleBear.file.util.FileContentUtils.resolveTextContentType;

@Service
@RequiredArgsConstructor
@Slf4j
class ShareFileObjectStorageService {

    private static final int MAX_TEXT_PREVIEW_BYTES = 64 * 1024;

    private final MinioClient minioClient;
    private final MinioPresignedUrlService minioPresignedUrlService;
    private final MinioProperties minioProperties;

    int presignedUrlExpirySeconds() {
        return minioProperties.getPresignedUrlExpirySeconds();
    }

    void copyObject(String sourceObjectKey, String targetObjectKey) {
        if (isBlank(sourceObjectKey) || isBlank(targetObjectKey)) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        try {
            minioClient.copyObject(
                    CopyObjectArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .object(targetObjectKey)
                            .source(CopySource.builder()
                                    .bucket(minioProperties.getBucket_cloud())
                                    .object(sourceObjectKey)
                                    .build())
                            .build()
            );
        } catch (Exception exception) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    void putObject(MultipartFile file, String objectKey, long fileSize, String contentType) {
        if (file == null || isBlank(objectKey)) {
            throw BaseException.from(BaseResponseStatus.FILE_UPLOADURL_FAIL);
        }

        try (var inputStream = file.getInputStream()) {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(minioProperties.getBucket_cloud())
                    .object(objectKey)
                    .stream(inputStream, fileSize, -1)
                    .contentType(contentType)
                    .build());
        } catch (Exception exception) {
            deleteObjectQuietly(objectKey);
            throw BaseException.from(BaseResponseStatus.FILE_UPLOADURL_FAIL);
        }
    }

    void deleteObjectQuietly(String objectKey) {
        if (isBlank(objectKey)) {
            return;
        }

        try {
            minioClient.removeObject(
                    RemoveObjectArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .object(objectKey)
                            .build()
            );
        } catch (Exception exception) {
            log.warn("Shared file object cleanup failed. objectKey={}", objectKey, exception);
        }
    }

    FileInfoDto.TextPreviewRes readTextPreview(
            Long fileIdx,
            String objectKey,
            String fileOriginName,
            String fileFormat,
            Long fileSize
    ) {
        if (isBlank(objectKey)) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        try (var objectStream = minioClient.getObject(
                GetObjectArgs.builder()
                        .bucket(minioProperties.getBucket_cloud())
                        .object(objectKey)
                        .build()
        )) {
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int totalRead = 0;
            boolean truncated = false;
            int read;

            while ((read = objectStream.read(buffer)) != -1) {
                int writable = Math.min(read, MAX_TEXT_PREVIEW_BYTES - totalRead);
                if (writable > 0) {
                    outputStream.write(buffer, 0, writable);
                    totalRead += writable;
                }
                if (totalRead >= MAX_TEXT_PREVIEW_BYTES) {
                    truncated = true;
                    break;
                }
            }

            return FileInfoDto.TextPreviewRes.builder()
                    .idx(fileIdx)
                    .fileOriginName(fileOriginName)
                    .fileFormat(fileFormat)
                    .contentType(resolveTextContentType(fileFormat))
                    .content(outputStream.toString(StandardCharsets.UTF_8))
                    .truncated(truncated)
                    .fileSize(fileSize)
                    .build();
        } catch (Exception exception) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    byte[] readObjectBytes(String objectKey) {
        if (isBlank(objectKey)) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        try (var objectStream = minioClient.getObject(
                GetObjectArgs.builder()
                        .bucket(minioProperties.getBucket_cloud())
                        .object(objectKey)
                        .build()
        )) {
            return objectStream.readAllBytes();
        } catch (Exception exception) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    String generateDownloadUrl(String objectKey) {
        if (isBlank(objectKey)) {
            return null;
        }

        try {
            return minioPresignedUrlService.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(minioProperties.getBucket_cloud())
                    .object(objectKey)
                    .expiry(minioProperties.getPresignedUrlExpirySeconds())
                    .build());
        } catch (Exception exception) {
            return null;
        }
    }

    String generateThumbnailUrl(String objectKey) {
        if (isBlank(objectKey)) {
            return null;
        }

        String thumbnailObjectKey = buildThumbnailObjectKey(objectKey);
        try {
            minioClient.statObject(StatObjectArgs.builder()
                    .bucket(minioProperties.getBucket_cloud())
                    .object(thumbnailObjectKey)
                    .build());
            return minioPresignedUrlService.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(minioProperties.getBucket_cloud())
                    .object(thumbnailObjectKey)
                    .expiry(minioProperties.getPresignedUrlExpirySeconds())
                    .build());
        } catch (Exception exception) {
            return null;
        }
    }

    String generateAttachmentDownloadUrl(String objectKey, String fileName, String contentType) {
        if (isBlank(objectKey)) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        try {
            Map<String, String> queryParams = new LinkedHashMap<>();
            queryParams.put(
                    "response-content-disposition",
                    ContentDisposition.attachment()
                            .filename(fileName, StandardCharsets.UTF_8)
                            .build()
                            .toString()
            );
            queryParams.put(
                    "response-content-type",
                    isBlank(contentType) ? "application/octet-stream" : contentType
            );

            return minioPresignedUrlService.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(minioProperties.getBucket_cloud())
                    .object(objectKey)
                    .expiry(minioProperties.getPresignedUrlExpirySeconds())
                    .extraQueryParams(queryParams)
                    .build());
        } catch (Exception exception) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}