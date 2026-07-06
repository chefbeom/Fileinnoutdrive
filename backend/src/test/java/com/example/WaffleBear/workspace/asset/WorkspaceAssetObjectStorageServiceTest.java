package com.example.WaffleBear.workspace.asset;

import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.config.MinioProperties;
import io.minio.CopyObjectArgs;
import io.minio.GetObjectArgs;
import io.minio.GetObjectResponse;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectsArgs;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkspaceAssetObjectStorageServiceTest {

    @Mock
    private MinioClient minioClient;

    @Mock
    private MinioPresignedUrlService minioPresignedUrlService;

    @Mock
    private MinioProperties minioProperties;

    @InjectMocks
    private WorkspaceAssetObjectStorageService storageService;

    @Test
    void putCloudObjectWritesToConfiguredCloudBucket() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        MockMultipartFile upload = new MockMultipartFile(
                "files",
                "report.txt",
                "text/plain",
                "hello".getBytes(StandardCharsets.UTF_8)
        );

        storageService.putCloudObject("asset/workspace/report.txt", upload, "text/plain");

        verify(minioClient).putObject(any(PutObjectArgs.class));
    }

    @Test
    void copyCloudObjectToBucketUsesConfiguredCloudBucketAsSource() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");

        storageService.copyCloudObjectToBucket("asset/source.txt", "drive-bucket", "1/copied.txt");

        verify(minioClient).copyObject(any(CopyObjectArgs.class));
    }

    @Test
    void readCloudObjectBytesReturnsObjectBytes() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        GetObjectResponse response = mock(GetObjectResponse.class);
        when(response.readAllBytes()).thenReturn("hello".getBytes(StandardCharsets.UTF_8));
        when(minioClient.getObject(any(GetObjectArgs.class))).thenReturn(response);

        byte[] bytes = storageService.readCloudObjectBytes("asset/workspace/report.txt");

        assertThat(bytes).isEqualTo("hello".getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void generateCloudAttachmentUrlDelegatesToPresignedUrlService() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        when(minioProperties.getPresignedUrlExpirySeconds()).thenReturn(1800);
        when(minioPresignedUrlService.getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class)))
                .thenReturn("http://download.example/report.txt");

        String url = storageService.generateCloudAttachmentUrl(
                "asset/workspace/report.txt",
                "report.txt",
                "text/plain"
        );

        assertThat(url).isEqualTo("http://download.example/report.txt");
    }

    @Test
    void deleteCloudObjectsSkipsBlankKeys() throws Exception {
        storageService.deleteCloudObjects(List.of(" ", ""));

        verify(minioClient, never()).removeObjects(any(RemoveObjectsArgs.class));
    }

    @Test
    void deleteCloudObjectsUsesBatchRemoveForNormalizedKeys() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        when(minioClient.removeObjects(any(RemoveObjectsArgs.class))).thenReturn(List.of());

        storageService.deleteCloudObjects(List.of(" asset/a.txt ", "asset/a.txt", "asset/b.txt"));

        verify(minioClient).removeObjects(any(RemoveObjectsArgs.class));
    }
}