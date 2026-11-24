package com.example.WaffleBear.file.service;

import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.file.model.FileEncryptionMode;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.secret.SecretTokenService;
import io.minio.GetPresignedObjectUrlArgs;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FileListItemUrlServiceTest {

    private MinioPresignedUrlService minioPresignedUrlService;
    private MinioProperties minioProperties;
    private FileThumbnailService fileThumbnailService;
    private FileListItemUrlService service;

    @BeforeEach
    void setUp() {
        minioPresignedUrlService = mock(MinioPresignedUrlService.class);
        minioProperties = mock(MinioProperties.class);
        fileThumbnailService = mock(FileThumbnailService.class);
        service = new FileListItemUrlService(minioPresignedUrlService, minioProperties, fileThumbnailService);
    }

    @Test
    void attachesDownloadAndThumbnailUrls() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        when(minioProperties.getPresignedUrlExpirySeconds()).thenReturn(1800);
        when(minioPresignedUrlService.getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class)))
                .thenReturn("https://download.example/report");
        when(fileThumbnailService.generatePresignedThumbnailUrl(any(FileInfo.class)))
                .thenReturn("https://thumbnail.example/report");

        var item = fileItem(false, "7/report.txt");

        var result = service.attachUrls(item);

        assertThat(result).isSameAs(item);
        assertThat(item.getPresignedDownloadUrl()).isEqualTo("https://download.example/report");
        assertThat(item.getThumbnailPresignedUrl()).isEqualTo("https://thumbnail.example/report");
        assertThat(item.getPresignedUrlExpiresIn()).isEqualTo(1800);

        ArgumentCaptor<FileInfo> thumbnailSnapshot = ArgumentCaptor.forClass(FileInfo.class);
        verify(fileThumbnailService).generatePresignedThumbnailUrl(thumbnailSnapshot.capture());
        assertThat(thumbnailSnapshot.getValue().getFileSavePath()).isEqualTo("7/report.txt");
    }

    @Test
    void skipsDownloadUrlForLockedOrFolderItems() throws Exception {
        when(minioProperties.getPresignedUrlExpirySeconds()).thenReturn(1800);

        var lockedItem = fileItem(true, "7/report.txt");
        var folderItem = FileCommonDto.FileListItemRes.builder()
                .nodeType(FileNodeType.FOLDER.name())
                .lockedFile(false)
                .fileSavePath("7/folder")
                .build();

        service.attachUrls(lockedItem);
        service.attachUrls(folderItem);

        assertThat(lockedItem.getPresignedDownloadUrl()).isNull();
        assertThat(folderItem.getPresignedDownloadUrl()).isNull();
        verify(minioPresignedUrlService, never()).getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class));
    }

    @Test
    void keepsDownloadUrlNullWhenPresignedGenerationFails() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        when(minioProperties.getPresignedUrlExpirySeconds()).thenReturn(1800);
        when(minioPresignedUrlService.getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class)))
                .thenThrow(new IllegalStateException("storage unavailable"));

        var item = fileItem(false, "7/report.txt");

        service.attachUrls(item);

        assertThat(item.getPresignedDownloadUrl()).isNull();
        assertThat(item.getPresignedUrlExpiresIn()).isEqualTo(1800);
    }

    @Test
    void forcesAttachmentOctetStreamOnPresignedDownloadUrlForActiveWebFiles() throws Exception {
        when(minioProperties.getBucket_cloud()).thenReturn("fileinnout-test");
        when(minioProperties.getPresignedUrlExpirySeconds()).thenReturn(1800);
        when(minioPresignedUrlService.getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class)))
                .thenReturn("https://download.example/page.html");

        var htmlItem = FileCommonDto.FileListItemRes.builder()
                .idx(11L)
                .nodeType(FileNodeType.FILE.name())
                .lockedFile(false)
                .fileOriginName("evil.html")
                .fileSaveName("stored.html")
                .fileSavePath("7/stored.html")
                .fileFormat("html")
                .build();

        service.attachUrls(htmlItem);

        ArgumentCaptor<GetPresignedObjectUrlArgs> argsCaptor = ArgumentCaptor.forClass(GetPresignedObjectUrlArgs.class);
        verify(minioPresignedUrlService).getPresignedObjectUrl(argsCaptor.capture());
        assertThat(argsCaptor.getValue().extraQueryParams().get("response-content-type"))
                .containsExactly("application/octet-stream");
        assertThat(argsCaptor.getValue().extraQueryParams().get("response-content-disposition"))
                .anySatisfy(value -> assertThat(value).startsWith("attachment;"));
    }

    @Test
    void emitsSignedStreamUrlAndSkipsMinioPresignedUrlsForEncryptedVaultItems() throws Exception {
        SecretTokenService secretTokenService = new SecretTokenService("test-jwt-secret-key-at-least-32-characters-long");
        ReflectionTestUtils.setField(service, "secretTokenService", secretTokenService);

        var encryptedVaultItem = FileCommonDto.FileListItemRes.builder()
                .idx(42L)
                .nodeType(FileNodeType.FILE.name())
                .spaceType("VAULT")
                .encrypted(true)
                .encryptionMode(FileEncryptionMode.SERVER_ENVELOPE_V1.name())
                .lockedFile(false)
                .trashed(false)
                .fileOriginName("secret.mp4")
                .fileSaveName("vault.enc")
                .fileSavePath("7/vault/vault.enc")
                .fileFormat("mp4")
                .fileSize(4096L)
                .build();

        service.attachUrls(7L, encryptedVaultItem);

        assertThat(encryptedVaultItem.getThumbnailPresignedUrl()).isNull();
        assertThat(encryptedVaultItem.getPresignedDownloadUrl())
                .startsWith("/api/file/secret/stream/42?st=");
        String st = encryptedVaultItem.getPresignedDownloadUrl().substring("/api/file/secret/stream/42?st=".length());
        assertThat(secretTokenService.verifyVaultStreamToken(st, 42L)).contains(7L);
        verify(minioPresignedUrlService, never()).getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class));
        verify(fileThumbnailService, never()).generatePresignedThumbnailUrl(any(FileInfo.class));
    }

    private static FileCommonDto.FileListItemRes fileItem(boolean locked, String objectKey) {
        return FileCommonDto.FileListItemRes.builder()
                .idx(10L)
                .nodeType(FileNodeType.FILE.name())
                .lockedFile(locked)
                .sharedFile(false)
                .trashed(false)
                .fileOriginName("report.txt")
                .fileSaveName("stored.txt")
                .fileSavePath(objectKey)
                .fileFormat("txt")
                .fileSize(12L)
                .build();
    }
}
