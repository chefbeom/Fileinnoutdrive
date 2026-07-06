package com.example.WaffleBear.file.service;

import com.example.WaffleBear.config.MinioProperties;
import io.minio.MinioClient;
import io.minio.RemoveObjectsArgs;
import io.minio.Result;
import io.minio.messages.DeleteObject;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
class FileObjectDeletionService {

    private final MinioClient minioClient;
    private final MinioProperties minioProperties;

    void deleteObjects(List<String> objectKeys) {
        List<String> normalizedObjectKeys = FileObjectRemovalRules.normalizeObjectKeys(objectKeys);
        if (normalizedObjectKeys.isEmpty()) {
            return;
        }

        try {
            List<DeleteObject> objects = normalizedObjectKeys.stream()
                    .map(DeleteObject::new)
                    .toList();

            Iterable<Result<io.minio.messages.DeleteError>> results = minioClient.removeObjects(
                    RemoveObjectsArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .objects(objects)
                            .build()
            );

            for (Result<io.minio.messages.DeleteError> result : results) {
                result.get();
            }
        } catch (Exception ignored) {
        }
    }
}