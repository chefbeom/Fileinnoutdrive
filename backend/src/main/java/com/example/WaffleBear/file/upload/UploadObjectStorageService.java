package com.example.WaffleBear.file.upload;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.config.MinioProperties;
import io.minio.ComposeObjectArgs;
import io.minio.ComposeSource;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.ListObjectsArgs;
import io.minio.MinioClient;
import io.minio.RemoveObjectsArgs;
import io.minio.Result;
import io.minio.StatObjectArgs;
import io.minio.http.Method;
import io.minio.messages.DeleteObject;
import io.minio.messages.Item;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
@RequiredArgsConstructor
public class UploadObjectStorageService {
    private static final int STORAGE_IO_PARALLELISM = 8;
    private static final int DELETE_BATCH_LIMIT = 1000;
    private static final ExecutorService STORAGE_IO_EXECUTOR = Executors.newFixedThreadPool(
            STORAGE_IO_PARALLELISM,
            runnable -> {
                Thread thread = new Thread(runnable, "upload-storage-io");
                thread.setDaemon(true);
                return thread;
            }
    );

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
        if (chunkObjectKeys == null || chunkObjectKeys.isEmpty()) {
            return;
        }

        List<String> distinctKeys = chunkObjectKeys.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(key -> !key.isBlank())
                .distinct()
                .toList();
        if (distinctKeys.isEmpty()) {
            return;
        }

        Boolean listedMatch = checkAllUploadedViaPrefixList(distinctKeys);
        if (listedMatch != null) {
            if (!listedMatch) {
                throw BaseException.from(BaseResponseStatus.FILE_UPLOADURL_FAIL);
            }
            return;
        }

        boolean missingChunk;
        if (distinctKeys.size() <= 2) {
            missingChunk = distinctKeys.stream().anyMatch(objectKey -> !objectExists(objectKey));
        } else {
            List<CompletableFuture<Boolean>> checks = distinctKeys.stream()
                    .map(objectKey -> CompletableFuture.supplyAsync(() -> objectExists(objectKey), STORAGE_IO_EXECUTOR))
                    .toList();
            missingChunk = checks.stream()
                    .map(CompletableFuture::join)
                    .anyMatch(exists -> !Boolean.TRUE.equals(exists));
        }
        if (missingChunk) {
            throw BaseException.from(BaseResponseStatus.FILE_UPLOADURL_FAIL);
        }
    }

    private Boolean checkAllUploadedViaPrefixList(List<String> distinctKeys) {
        if (distinctKeys.size() < 4) {
            return null;
        }

        String commonPrefix = findSafeCommonPrefix(distinctKeys);
        if (commonPrefix == null) {
            return null;
        }

        try {
            Iterable<Result<Item>> results = minioClient.listObjects(
                    ListObjectsArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .prefix(commonPrefix)
                            .recursive(true)
                            .build()
            );
            if (results == null) {
                return null;
            }

            Set<String> expected = new HashSet<>(distinctKeys);
            Set<String> found = new HashSet<>(expected.size());
            for (Result<Item> result : results) {
                Item item = result.get();
                if (item != null && !item.isDir() && expected.contains(item.objectName())) {
                    found.add(item.objectName());
                    if (found.size() == expected.size()) {
                        return true;
                    }
                }
            }
            return found.size() == expected.size();
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String findSafeCommonPrefix(List<String> keys) {
        String prefix = keys.get(0);
        for (int i = 1; i < keys.size(); i++) {
            String next = keys.get(i);
            int maxLen = Math.min(prefix.length(), next.length());
            int matchLen = 0;
            while (matchLen < maxLen && prefix.charAt(matchLen) == next.charAt(matchLen)) {
                matchLen++;
            }
            prefix = prefix.substring(0, matchLen);
            if (prefix.isEmpty()) {
                return null;
            }
        }

        int firstSlash = prefix.indexOf('/');
        if (firstSlash < 0 || prefix.length() <= firstSlash + 2) {
            return null;
        }
        return prefix;
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

        for (int start = 0; start < deleteObjectKeys.size(); start += DELETE_BATCH_LIMIT) {
            List<String> batch = deleteObjectKeys.subList(
                    start,
                    Math.min(deleteObjectKeys.size(), start + DELETE_BATCH_LIMIT)
            );
            try {
                List<DeleteObject> deleteTargets = batch.stream()
                        .map(DeleteObject::new)
                        .toList();

                Iterable<Result<io.minio.messages.DeleteError>> results = minioClient.removeObjects(
                        RemoveObjectsArgs.builder()
                                .bucket(minioProperties.getBucket_cloud())
                                .objects(deleteTargets)
                                .build()
                );

                if (results != null) {
                    for (Result<io.minio.messages.DeleteError> result : results) {
                        result.get();
                    }
                }
            } catch (Exception ignored) {
            }
        }
    }

    public long sumExistingObjectSizes(List<String> objectKeys) {
        if (objectKeys == null || objectKeys.isEmpty()) {
            return 0L;
        }

        List<String> distinctKeys = objectKeys.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .distinct()
                .toList();
        if (distinctKeys.isEmpty()) {
            return 0L;
        }
        if (distinctKeys.size() <= 2) {
            return distinctKeys.stream()
                    .mapToLong(this::statObjectSize)
                    .sum();
        }

        List<CompletableFuture<Long>> futures = distinctKeys.stream()
                .map(key -> CompletableFuture.supplyAsync(() -> statObjectSize(key), STORAGE_IO_EXECUTOR))
                .toList();
        long total = 0L;
        for (CompletableFuture<Long> future : futures) {
            try {
                total += future.join();
            } catch (CompletionException ignored) {
            }
        }
        return total;
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