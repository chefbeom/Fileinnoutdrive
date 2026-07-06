package com.example.WaffleBear.workspace.asset;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.config.MinioProperties;
import io.minio.CopyObjectArgs;
import io.minio.CopySource;
import io.minio.GetObjectArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectsArgs;
import io.minio.Result;
import io.minio.http.Method;
import io.minio.messages.DeleteObject;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ContentDisposition;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
class WorkspaceAssetObjectStorageService {

    private final MinioClient minioClient;
    private final MinioPresignedUrlService minioPresignedUrlService;
    private final MinioProperties minioProperties;

    String resolveCloudBucketName() {
        return minioProperties.getBucket_cloud();
    }

    int resolvePresignedUrlExpirySeconds() {
        return minioProperties.getPresignedUrlExpirySeconds();
    }

    void putCloudObject(String objectKey, MultipartFile file, String contentType) {
        try {
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(resolveCloudBucketName())
                            .object(objectKey)
                            .stream(file.getInputStream(), file.getSize(), -1)
                            .contentType(contentType)
                            .build()
            );
        } catch (Exception exception) {
            throw new RuntimeException("Workspace asset object upload failed: " + exception.getMessage(), exception);
        }
    }

    void copyCloudObjectToBucket(String sourceObjectKey, String targetBucket, String targetObjectKey) {
        try {
            minioClient.copyObject(
                    CopyObjectArgs.builder()
                            .bucket(targetBucket)
                            .object(targetObjectKey)
                            .source(CopySource.builder()
                                    .bucket(resolveCloudBucketName())
                                    .object(sourceObjectKey)
                                    .build())
                            .build()
            );
        } catch (Exception exception) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    byte[] readCloudObjectBytes(String objectKey) {
        try (var objectStream = minioClient.getObject(
                GetObjectArgs.builder()
                        .bucket(resolveCloudBucketName())
                        .object(objectKey)
                        .build()
        )) {
            return objectStream.readAllBytes();
        } catch (Exception exception) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    String generateCloudGetUrl(String objectKey) {
        if (!StringUtils.hasText(objectKey)) {
            return null;
        }

        try {
            return minioPresignedUrlService.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.GET)
                            .bucket(resolveCloudBucketName())
                            .object(objectKey)
                            .expiry(minioProperties.getPresignedUrlExpirySeconds())
                            .build()
            );
        } catch (Exception exception) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    String generateCloudAttachmentUrl(String objectKey, String fileName, String contentType) {
        if (!StringUtils.hasText(objectKey)) {
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
                    StringUtils.hasText(contentType) ? contentType : "application/octet-stream"
            );

            return minioPresignedUrlService.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.GET)
                            .bucket(resolveCloudBucketName())
                            .object(objectKey)
                            .expiry(minioProperties.getPresignedUrlExpirySeconds())
                            .extraQueryParams(queryParams)
                            .build()
            );
        } catch (Exception exception) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    String generateDriveGetUrl(String objectKey, String bucketName) {
        if (!StringUtils.hasText(objectKey) || !StringUtils.hasText(bucketName)) {
            return null;
        }

        try {
            return minioPresignedUrlService.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.GET)
                            .bucket(bucketName)
                            .object(objectKey)
                            .expiry(minioProperties.getPresignedUrlExpirySeconds())
                            .build()
            );
        } catch (Exception exception) {
            return null;
        }
    }

    void deleteCloudObjectsQuietly(Collection<String> objectKeys) {
        try {
            deleteCloudObjects(objectKeys);
        } catch (Exception exception) {
            log.warn("Workspace asset object cleanup failed. objectKeys={}", objectKeys, exception);
        }
    }

    void deleteCloudObjects(Collection<String> objectKeys) {
        List<DeleteObject> deleteTargets = WorkspaceAssetRules.normalizeObjectKeys(objectKeys)
                .stream()
                .map(DeleteObject::new)
                .toList();

        if (deleteTargets.isEmpty()) {
            return;
        }

        try {
            Iterable<Result<io.minio.messages.DeleteError>> results = minioClient.removeObjects(
                    RemoveObjectsArgs.builder()
                            .bucket(resolveCloudBucketName())
                            .objects(deleteTargets)
                            .build()
            );

            for (Result<io.minio.messages.DeleteError> result : results) {
                result.get();
            }
        } catch (Exception exception) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }
}