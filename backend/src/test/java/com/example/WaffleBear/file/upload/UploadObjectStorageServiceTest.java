package com.example.WaffleBear.file.upload;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.config.MinioProperties;
import io.minio.ComposeObjectArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.ListObjectsArgs;
import io.minio.MinioClient;
import io.minio.RemoveObjectsArgs;
import io.minio.Result;
import io.minio.StatObjectArgs;
import io.minio.StatObjectResponse;
import io.minio.messages.Item;
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
    void ensureAllUploadedUsesSinglePrefixListWhenAvailable() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        Item item1 = mock(Item.class);
        Item item2 = mock(Item.class);
        Item item3 = mock(Item.class);
        Item item4 = mock(Item.class);
        when(item1.isDir()).thenReturn(false);
        when(item1.objectName()).thenReturn("7/tmp/batch.part00001of00004.mp4");
        when(item2.isDir()).thenReturn(false);
        when(item2.objectName()).thenReturn("7/tmp/batch.part00002of00004.mp4");
        when(item3.isDir()).thenReturn(false);
        when(item3.objectName()).thenReturn("7/tmp/batch.part00003of00004.mp4");
        when(item4.isDir()).thenReturn(false);
        when(item4.objectName()).thenReturn("7/tmp/batch.part00004of00004.mp4");

        @SuppressWarnings("unchecked")
        Result<Item> r1 = mock(Result.class);
        @SuppressWarnings("unchecked")
        Result<Item> r2 = mock(Result.class);
        @SuppressWarnings("unchecked")
        Result<Item> r3 = mock(Result.class);
        @SuppressWarnings("unchecked")
        Result<Item> r4 = mock(Result.class);
        when(r1.get()).thenReturn(item1);
        when(r2.get()).thenReturn(item2);
        when(r3.get()).thenReturn(item3);
        when(r4.get()).thenReturn(item4);
        when(minioClient.listObjects(any(ListObjectsArgs.class))).thenReturn(List.of(r1, r2, r3, r4));

        storageService.ensureAllUploaded(List.of(
                "7/tmp/batch.part00001of00004.mp4",
                "7/tmp/batch.part00002of00004.mp4",
                "7/tmp/batch.part00003of00004.mp4",
                "7/tmp/batch.part00004of00004.mp4"
        ));

        verify(minioClient).listObjects(any(ListObjectsArgs.class));
        verify(minioClient, never()).statObject(any(StatObjectArgs.class));
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