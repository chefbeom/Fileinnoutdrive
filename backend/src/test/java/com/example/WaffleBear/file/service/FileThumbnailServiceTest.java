package com.example.WaffleBear.file.service;

import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.StatObjectArgs;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileThumbnailServiceTest {

    @Mock
    private MinioClient minioClient;

    @Mock
    private MinioPresignedUrlService minioPresignedUrlService;

    @Mock
    private VideoThumbnailService videoThumbnailService;

    @Mock
    private ImageThumbnailService imageThumbnailService;

    @Mock
    private ThumbnailTaskExecutor thumbnailTaskExecutor;

    private FileThumbnailService fileThumbnailService;

    @BeforeEach
    void setUp() {
        MinioProperties minioProperties = new MinioProperties();
        minioProperties.setBucket_cloud("fileinnout-test");
        fileThumbnailService = new FileThumbnailService(
                minioClient,
                minioPresignedUrlService,
                minioProperties,
                videoThumbnailService,
                imageThumbnailService,
                thumbnailTaskExecutor
        );
    }

    @Test
    void returnsPresignedThumbnailUrlWhenThumbnailObjectAlreadyExists() throws Exception {
        when(minioClient.statObject(any(StatObjectArgs.class))).thenReturn(null);
        when(minioPresignedUrlService.getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class)))
                .thenReturn("https://thumbnail.example/url");

        String result = fileThumbnailService.generatePresignedThumbnailUrl(videoFile());

        assertThat(result).isEqualTo("https://thumbnail.example/url");
        verify(thumbnailTaskExecutor, never()).runAsync(any(Runnable.class));
    }

    @Test
    void schedulesThumbnailGenerationWhenThumbnailObjectIsMissing() throws Exception {
        when(minioClient.statObject(any(StatObjectArgs.class))).thenThrow(new RuntimeException("missing"));
        when(videoThumbnailService.supports("mp4")).thenReturn(true);
        when(thumbnailTaskExecutor.runAsync(any(Runnable.class))).thenReturn(CompletableFuture.completedFuture(null));

        String result = fileThumbnailService.generatePresignedThumbnailUrl(videoFile());

        assertThat(result).isNull();
        verify(thumbnailTaskExecutor).runAsync(any(Runnable.class));
        verify(minioPresignedUrlService, never()).getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class));
    }

    @Test
    void ignoresLockedOrNonVideoFiles() {
        assertThat(fileThumbnailService.generatePresignedThumbnailUrl(lockedVideoFile())).isNull();
        assertThat(fileThumbnailService.generatePresignedThumbnailUrl(textFile())).isNull();

        verify(thumbnailTaskExecutor, never()).runAsync(any(Runnable.class));
    }

    private FileInfo videoFile() {
        return FileInfo.builder()
                .nodeType(FileNodeType.FILE)
                .fileOriginName("movie.mp4")
                .fileFormat("mp4")
                .fileSaveName("movie.mp4")
                .fileSavePath("7/movie.mp4")
                .lockedFile(false)
                .build();
    }

    private FileInfo lockedVideoFile() {
        return FileInfo.builder()
                .nodeType(FileNodeType.FILE)
                .fileOriginName("locked.mp4")
                .fileFormat("mp4")
                .fileSaveName("locked.mp4")
                .fileSavePath("7/locked.mp4")
                .lockedFile(true)
                .build();
    }

    private FileInfo textFile() {
        return FileInfo.builder()
                .nodeType(FileNodeType.FILE)
                .fileOriginName("note.txt")
                .fileFormat("txt")
                .fileSaveName("note.txt")
                .fileSavePath("7/note.txt")
                .build();
    }
}
