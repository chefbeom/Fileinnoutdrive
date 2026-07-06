package com.example.WaffleBear.file.service;

import com.example.WaffleBear.config.MinioProperties;
import io.minio.MinioClient;
import io.minio.RemoveObjectsArgs;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FileObjectDeletionServiceTest {

    private MinioClient minioClient;
    private MinioProperties minioProperties;
    private FileObjectDeletionService service;

    @BeforeEach
    void setUp() {
        minioClient = mock(MinioClient.class);
        minioProperties = mock(MinioProperties.class);
        service = new FileObjectDeletionService(minioClient, minioProperties);
    }

    @Test
    void deletesNormalizedObjectKeysFromConfiguredBucket() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        when(minioClient.removeObjects(any(RemoveObjectsArgs.class))).thenReturn(List.of());

        service.deleteObjects(List.of(" 7/report.txt ", "7/report.txt", "7/thumb.jpg", " "));

        verify(minioClient).removeObjects(any(RemoveObjectsArgs.class));
    }

    @Test
    void ignoresEmptyObjectKeys() throws Exception {
        service.deleteObjects(List.of(" ", ""));

        verify(minioClient, never()).removeObjects(any(RemoveObjectsArgs.class));
    }
}