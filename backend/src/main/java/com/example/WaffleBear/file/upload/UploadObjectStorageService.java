package com.example.WaffleBear.file.upload;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.config.MinioProperties;
import io.minio.ComposeObjectArgs;
import io.minio.ComposeSource;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.RemoveObjectsArgs;
import io.minio.Result;
import io.minio.StatObjectArgs;
import io.minio.http.Method;
import io.minio.messages.DeleteObject;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class UploadObjectStorageService {
    private final MinioClient minioClient;
    private final MinioPresignedUrlService minioPresignedUrlService;
    private final MinioProperties minioProperties;

    public int getPresignedUrlExpirySeconds() {
        return minioProperties.getPresignedUrlExpirySeconds();
    }

    public String generatePresignedUploadUrl(String objectKey) {
        try {
            return minioPresignedUrlService.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.PUT)
                            .bucket(minioProperties.getBucket_cloud())
                            .object(objectKey)
                            .expiry(minioProperties.getPresignedUrlExpirySeconds())
                            .build()
            );
        } catch (Exception e) {
            throw BaseException.from(BaseResponseStatus.FILE_UPLOADURL_FAIL);
        }
    }

    public boolean objectExists(String objectKey) {
        try {
            minioClient.statObject(
                    StatObjectArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .object(objectKey)
                            .build()
            );
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public void ensureUploadedObjectExists(String objectKey) {
        if (!objectExists(objectKey)) {
            throw BaseException.from(BaseResponseStatus.FILE_UPLOADURL_FAIL);
        }
    }

    public void ensureAllUploaded(List<String> chunkObjectKeys) {
        boolean missingChunk = chunkObjectKeys.stream().anyMatch(objectKey -> !objectExists(objectKey));
        if (missingChunk) {
            throw BaseException.from(BaseResponseStatus.FILE_UPLOADURL_FAIL);
        }
    }

    public void composeFinalObject(String finalObjectKey, List<String> chunkObjectKeys) {
        try {
            List<ComposeSource> sources = chunkObjectKeys.stream()
                    .map(objectKey -> ComposeSource.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .object(objectKey)
                            .build())
                    .toList();

            minioClient.composeObject(
                    ComposeObjectArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .object(finalObjectKey)
                            .sources(sources)
                            .build()
            );
        } catch (Exception e) {
            throw BaseException.from(BaseResponseStatus.FILE_UPLOADURL_FAIL);
        }
    }

    public void deleteObjectKeys(Collection<String> objectKeys) {
        List<String> deleteObjectKeys = UploadObjectRules.normalizeDeleteObjectKeys(objectKeys);
        if (deleteObjectKeys.isEmpty()) {
            return;
        }

        try {
            List<DeleteObject> deleteTargets = deleteObjectKeys.stream()
                    .map(DeleteObject::new)
                    .toList();

            Iterable<Result<io.minio.messages.DeleteError>> results = minioClient.removeObjects(
                    RemoveObjectsArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .objects(deleteTargets)
                            .build()
            );

            for (Result<io.minio.messages.DeleteError> result : results) {
                result.get();
            }
        } catch (Exception ignored) {
        }
    }

    public long sumExistingObjectSizes(List<String> objectKeys) {
        if (objectKeys == null || objectKeys.isEmpty()) {
            return 0L;
        }

        return objectKeys.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .distinct()
                .mapToLong(this::statObjectSize)
                .sum();
    }

    public long resolveCompletedObjectSize(String finalObjectKey, long expectedFileSize) {
        long actualFileSize = statObjectSize(finalObjectKey);
        if (actualFileSize > 0L) {
            return actualFileSize;
        }
        return Math.max(0L, expectedFileSize);
    }

    private long statObjectSize(String objectKey) {
        if (objectKey == null || objectKey.isBlank()) {
            return 0L;
        }

        try {
            return Math.max(0L, minioClient.statObject(
                    StatObjectArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .object(objectKey)
                            .build()
            ).size());
        } catch (Exception exception) {
            return 0L;
        }
    }
}