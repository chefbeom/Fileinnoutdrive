package com.example.WaffleBear.chat;

import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.config.MinioProperties;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatAttachmentStorageServiceTest {

    @Mock
    private MinioClient minioClient;

    @Mock
    private MinioPresignedUrlService minioPresignedUrlService;

    @Mock
    private MinioProperties minioProperties;

    @InjectMocks
    private ChatAttachmentStorageService storageService;

    @Test
    void uploadChatAttachmentWritesToCloudBucketAndReturnsDownloadUrl() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "hello.txt",
                "text/plain",
                "hello".getBytes(StandardCharsets.UTF_8)
        );
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        when(minioPresignedUrlService.getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class)))
                .thenReturn("http://download.example/chat/hello.txt");

        String url = storageService.uploadChatAttachment(10L, 99L, file);

        assertThat(url).isEqualTo("http://download.example/chat/hello.txt");
        verify(minioClient).putObject(any(PutObjectArgs.class));
    }

    @Test
    void uploadChatAttachmentRejectsOversizedImageBeforeStorageIo() throws Exception {
        byte[] oversizedImage = new byte[(5 * 1024 * 1024) + 1];
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "large.png",
                "image/png",
                oversizedImage
        );

        assertThatThrownBy(() -> storageService.uploadChatAttachment(10L, 99L, file))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("이미지는 5MB 이하");

        verify(minioClient, never()).putObject(any(PutObjectArgs.class));
    }
}