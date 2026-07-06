package com.example.WaffleBear.file.share;

import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.config.MinioProperties;
import io.minio.CopyObjectArgs;
import io.minio.GetObjectArgs;
import io.minio.GetObjectResponse;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.StatObjectArgs;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ShareFileObjectStorageServiceTest {

    @Mock
    private MinioClient minioClient;

    @Mock
    private MinioPresignedUrlService minioPresignedUrlService;

    @Mock
    private MinioProperties minioProperties;

    @InjectMocks
    private ShareFileObjectStorageService storageService;

    @Test
    void copyObjectUsesConfiguredCloudBucketForSourceAndTarget() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");

        storageService.copyObject("1/source.txt", "2/copied.txt");

        verify(minioClient).copyObject(any(CopyObjectArgs.class));
    }

    @Test
    void putObjectWritesMultipartFileToCloudBucket() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        MockMultipartFile upload = new MockMultipartFile(
                "file",
                "report.txt",
                "text/plain",
                "hello".getBytes(StandardCharsets.UTF_8)
        );

        storageService.putObject(upload, "1/report.txt", upload.getSize(), "text/plain");

        verify(minioClient).putObject(any(PutObjectArgs.class));
    }

    @Test
    void deleteObjectQuietlySkipsBlankObjectKey() throws Exception {
        storageService.deleteObjectQuietly(" ");

        verify(minioClient, never()).removeObject(any(RemoveObjectArgs.class));
    }

    @Test
    void deleteObjectQuietlyRemovesCloudObject() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");

        storageService.deleteObjectQuietly("1/report.txt");

        verify(minioClient).removeObject(any(RemoveObjectArgs.class));
    }

    @Test
    void readObjectBytesReturnsCloudObjectBytes() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        GetObjectResponse response = mock(GetObjectResponse.class);
        when(response.readAllBytes()).thenReturn("hello".getBytes(StandardCharsets.UTF_8));
        when(minioClient.getObject(any(GetObjectArgs.class))).thenReturn(response);

        byte[] bytes = storageService.readObjectBytes("1/report.txt");

        assertThat(bytes).isEqualTo("hello".getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void readTextPreviewLimitsReadThroughObjectStream() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        GetObjectResponse response = mock(GetObjectResponse.class);
        AtomicBoolean alreadyRead = new AtomicBoolean(false);
        when(response.read(any(byte[].class))).thenAnswer(invocation -> {
            if (alreadyRead.getAndSet(true)) {
                return -1;
            }
            byte[] buffer = invocation.getArgument(0);
            byte[] source = "hello".getBytes(StandardCharsets.UTF_8);
            System.arraycopy(source, 0, buffer, 0, source.length);
            return source.length;
        });
        when(minioClient.getObject(any(GetObjectArgs.class))).thenReturn(response);

        var preview = storageService.readTextPreview(10L, "1/report.txt", "report.txt", "txt", 5L);

        assertThat(preview.getContent()).isEqualTo("hello");
        assertThat(preview.getTruncated()).isFalse();
    }

    @Test
    void generateAttachmentDownloadUrlDelegatesToPresignedUrlService() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        when(minioProperties.getPresignedUrlExpirySeconds()).thenReturn(1800);
        when(minioPresignedUrlService.getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class)))
                .thenReturn("http://download.example/report.txt");

        String url = storageService.generateAttachmentDownloadUrl("1/report.txt", "report.txt", "text/plain");

        assertThat(url).isEqualTo("http://download.example/report.txt");
    }

    @Test
    void generateThumbnailUrlStatsThumbnailBeforeCreatingUrl() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        when(minioProperties.getPresignedUrlExpirySeconds()).thenReturn(1800);
        when(minioPresignedUrlService.getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class)))
                .thenReturn("http://download.example/thumb.jpg");

        String url = storageService.generateThumbnailUrl("1/movie.mp4");

        assertThat(url).isEqualTo("http://download.example/thumb.jpg");
        verify(minioClient).statObject(any(StatObjectArgs.class));
    }
}