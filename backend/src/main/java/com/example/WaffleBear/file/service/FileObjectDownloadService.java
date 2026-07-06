package com.example.WaffleBear.file.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.file.info.dto.FileInfoDto;
import io.minio.GetObjectArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.http.Method;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static com.example.WaffleBear.file.util.FileContentUtils.resolveTextContentType;

@Service
@RequiredArgsConstructor
class FileObjectDownloadService {

    private final MinioClient minioClient;
    private final MinioProperties minioProperties;
    private final MinioPresignedUrlService minioPresignedUrlService;

    private static final int MAX_TEXT_PREVIEW_BYTES = 64 * 1024;

    byte[] readObjectBytes(String objectKey) {
        if (objectKey == null || objectKey.isBlank()) {
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

    FileInfoDto.TextPreviewRes readTextPreview(Long fileIdx, String objectKey, String fileOriginName, String fileFormat, Long fileSize) {
        if (objectKey == null || objectKey.isBlank()) {
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

    String generateAttachmentDownloadUrl(String objectKey, String fileName, String contentType) {
        if (objectKey == null || objectKey.isBlank()) {
            return null;
        }

        try {
            Map<String, String> queryParams = FileDownloadRules.attachmentQueryParams(fileName, contentType);
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
}