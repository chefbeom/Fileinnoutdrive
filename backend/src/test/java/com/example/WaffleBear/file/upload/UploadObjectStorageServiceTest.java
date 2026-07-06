package com.example.WaffleBear.file.upload;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.config.MinioProperties;
import io.minio.ComposeObjectArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.RemoveObjectsArgs;
import io.minio.StatObjectArgs;
import io.minio.StatObjectResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UploadObjectStorageServiceTest {

    @Mock
    private MinioClient minioClient;

    @Mock
    private MinioPresignedUrlService minioPresignedUrlService;

    @Mock
    private MinioProperties minioProperties;

    @InjectMocks
    private UploadObjectStorageService storageService;

    @Test
    void generatePresignedUploadUrlDelegatesToPresignedClient() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        when(minioProperties.getPresignedUrlExpirySeconds()).thenReturn(1800);
        when(minioPresignedUrlService.getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class)))
                .thenReturn("http://upload.example/7/file.bin");

        String url = storageService.generatePresignedUploadUrl("7/file.bin");

        assertThat(url).isEqualTo("http://upload.example/7/file.bin");
    }

    @Test
    void ensureAllUploadedFailsWhenAnyChunkIsMissing() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        when(minioClient.statObject(any(StatObjectArgs.class)))
                .thenReturn(mock(StatObjectResponse.class))
                .thenThrow(new RuntimeException("missing"));

        assertThatThrownBy(() -> storageService.ensureAllUploaded(List.of("7/tmp/a", "7/tmp/b")))
                .isInstanceOf(BaseException.class);
    }

    @Test
    void composeFinalObjectUsesConfiguredCloudBucket() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");

        storageService.composeFinalObject("7/final.bin", List.of("7/tmp/a", "7/tmp/b"));

        verify(minioClient).composeObject(any(ComposeObjectArgs.class));
    }

    @Test
    void deleteObjectKeysSkipsBlankKeys() throws Exception {
        storageService.deleteObjectKeys(List.of(" ", ""));

        verify(minioClient, never()).removeObjects(any(RemoveObjectsArgs.class));
    }

    @Test
    void sumExistingObjectSizesStatsDistinctNonBlankKeys() throws Exception {
        StatObjectResponse first = mock(StatObjectResponse.class);
        StatObjectResponse second = mock(StatObjectResponse.class);
        when(first.size()).thenReturn(10L);
        when(second.size()).thenReturn(20L);
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        when(minioClient.statObject(any(StatObjectArgs.class)))
                .thenReturn(first)
                .thenReturn(second);

        long total = storageService.sumExistingObjectSizes(List.of("7/a", " 7/a ", "7/b", " "));

        assertThat(total).isEqualTo(30L);
        verify(minioClient, org.mockito.Mockito.times(2)).statObject(any(StatObjectArgs.class));
    }
}