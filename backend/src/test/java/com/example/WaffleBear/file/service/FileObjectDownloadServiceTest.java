package com.example.WaffleBear.file.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import io.minio.GetObjectArgs;
import io.minio.GetObjectResponse;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FileObjectDownloadServiceTest {

    private MinioClient minioClient;
    private MinioProperties minioProperties;
    private MinioPresignedUrlService minioPresignedUrlService;
    private FileObjectDownloadService service;

    @BeforeEach
    void setUp() {
        minioClient = mock(MinioClient.class);
        minioProperties = mock(MinioProperties.class);
        minioPresignedUrlService = mock(MinioPresignedUrlService.class);
        service = new FileObjectDownloadService(minioClient, minioProperties, minioPresignedUrlService);
    }

    @Test
    void readsObjectBytesFromConfiguredBucket() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        GetObjectResponse objectResponse = mock(GetObjectResponse.class);
        when(objectResponse.readAllBytes()).thenReturn("hello".getBytes(StandardCharsets.UTF_8));
        when(minioClient.getObject(any(GetObjectArgs.class))).thenReturn(objectResponse);

        byte[] bytes = service.readObjectBytes("7/report.txt");

        assertThat(bytes).isEqualTo("hello".getBytes(StandardCharsets.UTF_8));
        verify(minioClient).getObject(any(GetObjectArgs.class));
    }

    @Test
    void readsTextPreviewFromConfiguredBucket() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        GetObjectResponse objectResponse = mock(GetObjectResponse.class);
        byte[] content = "hello preview".getBytes(StandardCharsets.UTF_8);
        int[] offset = {0};
        when(objectResponse.read(any(byte[].class))).thenAnswer(invocation -> {
            byte[] buffer = invocation.getArgument(0);
            if (offset[0] >= content.length) {
                return -1;
            }
            int length = Math.min(buffer.length, content.length - offset[0]);
            System.arraycopy(content, offset[0], buffer, 0, length);
            offset[0] += length;
            return length;
        });
        when(minioClient.getObject(any(GetObjectArgs.class))).thenReturn(objectResponse);

        var preview = service.readTextPreview(10L, "7/report.txt", "report.txt", "txt", 128L);

        assertThat(preview.getIdx()).isEqualTo(10L);
        assertThat(preview.getFileOriginName()).isEqualTo("report.txt");
        assertThat(preview.getFileFormat()).isEqualTo("txt");
        assertThat(preview.getContentType()).isEqualTo("text/plain");
        assertThat(preview.getContent()).isEqualTo("hello preview");
        assertThat(preview.getTruncated()).isFalse();
        assertThat(preview.getFileSize()).isEqualTo(128L);
        verify(minioClient).getObject(any(GetObjectArgs.class));
    }

    @Test
    void createsAttachmentDownloadUrl() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        when(minioProperties.getPresignedUrlExpirySeconds()).thenReturn(1800);
        when(minioPresignedUrlService.getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class)))
                .thenReturn("https://download.example/report");

        String url = service.generateAttachmentDownloadUrl("7/report.txt", "report.txt", "text/plain");

        assertThat(url).isEqualTo("https://download.example/report");
        verify(minioPresignedUrlService).getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class));
    }

    @Test
    void validatesBlankObjectKeys() throws Exception {
        assertThat(service.generateAttachmentDownloadUrl(" ", "report.txt", "text/plain")).isNull();
        assertThatThrownBy(() -> service.readObjectBytes(" "))
                .isInstanceOf(BaseException.class);
        assertThatThrownBy(() -> service.readTextPreview(10L, " ", "report.txt", "txt", 128L))
                .isInstanceOf(BaseException.class);

        verify(minioClient, never()).getObject(any(GetObjectArgs.class));
        verify(minioPresignedUrlService, never()).getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class));
    }
}