package com.example.WaffleBear.file.service;

import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.crypto.VaultFileCryptoService;
import com.example.WaffleBear.file.model.FileEncryptionMode;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.model.FileSpaceType;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.ListObjectsArgs;
import io.minio.MinioClient;
import io.minio.Result;
import io.minio.StatObjectArgs;
import io.minio.messages.Item;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Semaphore;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
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

    @Mock
    private VaultFileCryptoService vaultFileCryptoService;

    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;

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
    void warmThumbnailsUsesSinglePrefixListForExistingAndMissingThumbnails() throws Exception {
        Item existingThumb = mock(Item.class);
        when(existingThumb.isDir()).thenReturn(false);
        when(existingThumb.objectName()).thenReturn("7/thumbnails/movie.jpg");
        @SuppressWarnings("unchecked")
        Result<Item> thumbResult = mock(Result.class);
        when(thumbResult.get()).thenReturn(existingThumb);
        when(minioClient.listObjects(any(ListObjectsArgs.class))).thenReturn(List.of(thumbResult));
        when(minioPresignedUrlService.getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class)))
                .thenReturn("https://thumbnail.example/movie");
        when(videoThumbnailService.supports("mp4")).thenReturn(true);
        when(thumbnailTaskExecutor.runAsync(any(Runnable.class))).thenReturn(CompletableFuture.completedFuture(null));

        FileInfo missingThumbVideo = FileInfo.builder()
                .nodeType(FileNodeType.FILE)
                .fileOriginName("missing.mp4")
                .fileFormat("mp4")
                .fileSaveName("missing.mp4")
                .fileSavePath("7/missing.mp4")
                .lockedFile(false)
                .build();

        fileThumbnailService.warmThumbnailsForFiles(List.of(videoFile(), missingThumbVideo));

        assertThat(fileThumbnailService.generatePresignedThumbnailUrl(videoFile()))
                .isEqualTo("https://thumbnail.example/movie");
        assertThat(fileThumbnailService.generatePresignedThumbnailUrl(missingThumbVideo)).isNull();
        verify(minioClient).listObjects(any(ListObjectsArgs.class));
        verify(minioClient, never()).statObject(any(StatObjectArgs.class));
    }

    @Test
    void returnsPresignedThumbnailUrlForRasterImagesWhenThumbnailExists() throws Exception {
        FileInfo photo = FileInfo.builder()
                .nodeType(FileNodeType.FILE)
                .fileOriginName("photo.jpg")
                .fileFormat("jpg")
                .fileSaveName("photo.jpg")
                .fileSavePath("7/photo.jpg")
                .fileSize(1024L)
                .lockedFile(false)
                .build();
        when(minioClient.statObject(any(StatObjectArgs.class))).thenReturn(null);
        when(minioPresignedUrlService.getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class)))
                .thenReturn("https://thumbnail.example/photo");

        String result = fileThumbnailService.generatePresignedThumbnailUrl(photo);

        assertThat(result).isEqualTo("https://thumbnail.example/photo");
    }

    @Test
    void ignoresLockedOrNonVideoFiles() {
        assertThat(fileThumbnailService.generatePresignedThumbnailUrl(lockedVideoFile())).isNull();
        assertThat(fileThumbnailService.generatePresignedThumbnailUrl(textFile())).isNull();

        verify(thumbnailTaskExecutor, never()).runAsync(any(Runnable.class));
    }

    @Test
    void warmThumbnailsScansEncryptedVaultPrefixAndSkipsStatObject() throws Exception {
        ReflectionTestUtils.setField(fileThumbnailService, "vaultFileCryptoService", vaultFileCryptoService);

        Item existingEncryptedThumb = mock(Item.class);
        when(existingEncryptedThumb.isDir()).thenReturn(false);
        when(existingEncryptedThumb.objectName()).thenReturn("7/vault/thumbnails/clip.vthumb");
        @SuppressWarnings("unchecked")
        Result<Item> thumbResult = mock(Result.class);
        when(thumbResult.get()).thenReturn(existingEncryptedThumb);
        when(minioClient.listObjects(any(ListObjectsArgs.class))).thenReturn(List.of(thumbResult));

        FileInfo encryptedVideo = encryptedVaultVideo(101L, "7/vault/clip.enc");
        byte[] thumbBytes = new byte[]{1, 2, 3, 4};
        when(vaultFileCryptoService.loadDecryptedThumbnail(encryptedVideo, "7/vault/thumbnails/clip.vthumb"))
                .thenReturn(thumbBytes);

        fileThumbnailService.warmThumbnailsForFiles(List.of(encryptedVideo));
        FileThumbnailService.ThumbnailPayload payload = fileThumbnailService.loadThumbnail(encryptedVideo);

        assertThat(payload).isNotNull();
        assertThat(payload.bytes()).containsExactly(thumbBytes);
        assertThat(payload.privateNoStore()).isTrue();
        verify(minioClient).listObjects(any(ListObjectsArgs.class));
        verify(minioClient, never()).statObject(any(StatObjectArgs.class));
    }

    @Test
    void loadEncryptedThumbnailUsesInMemoryCacheOnRepeatedAccess() throws Exception {
        ReflectionTestUtils.setField(fileThumbnailService, "vaultFileCryptoService", vaultFileCryptoService);

        FileInfo encryptedVideo = encryptedVaultVideo(102L, "7/vault/cached.enc");
        when(minioClient.statObject(any(StatObjectArgs.class))).thenReturn(null);
        when(vaultFileCryptoService.loadDecryptedThumbnail(encryptedVideo, "7/vault/thumbnails/cached.vthumb"))
                .thenReturn(new byte[]{9, 8, 7});

        FileThumbnailService.ThumbnailPayload first = fileThumbnailService.loadThumbnail(encryptedVideo);
        FileThumbnailService.ThumbnailPayload second = fileThumbnailService.loadThumbnail(encryptedVideo);

        assertThat(first).isNotNull();
        assertThat(second).isNotNull();
        assertThat(second.bytes()).containsExactly(9, 8, 7);
        verify(vaultFileCryptoService, times(1))
                .loadDecryptedThumbnail(encryptedVideo, "7/vault/thumbnails/cached.vthumb");
    }

    @Test
    void evictVaultCacheForUserClearsOnlyTargetUsersVaultThumbnails() throws Exception {
        ReflectionTestUtils.setField(fileThumbnailService, "vaultFileCryptoService", vaultFileCryptoService);

        FileInfo user7Video = encryptedVaultVideo(201L, "7/vault/u7.enc");
        FileInfo user8Video = encryptedVaultVideo(202L, "8/vault/u8.enc");
        when(minioClient.statObject(any(StatObjectArgs.class))).thenReturn(null);
        when(vaultFileCryptoService.loadDecryptedThumbnail(user7Video, "7/vault/thumbnails/u7.vthumb"))
                .thenReturn(new byte[]{7, 7});
        when(vaultFileCryptoService.loadDecryptedThumbnail(user8Video, "8/vault/thumbnails/u8.vthumb"))
                .thenReturn(new byte[]{8, 8});

        fileThumbnailService.loadThumbnail(user7Video);
        fileThumbnailService.loadThumbnail(user8Video);

        fileThumbnailService.evictVaultCacheForUser(7L);

        fileThumbnailService.loadThumbnail(user7Video);
        fileThumbnailService.loadThumbnail(user8Video);

        verify(vaultFileCryptoService, times(2))
                .loadDecryptedThumbnail(user7Video, "7/vault/thumbnails/u7.vthumb");
        verify(vaultFileCryptoService, times(1))
                .loadDecryptedThumbnail(user8Video, "8/vault/thumbnails/u8.vthumb");
    }

    @Test
    void evictThumbnailCacheForObjectKeysClearsCachedEntry() throws Exception {
        ReflectionTestUtils.setField(fileThumbnailService, "vaultFileCryptoService", vaultFileCryptoService);

        FileInfo encryptedVideo = encryptedVaultVideo(203L, "7/vault/delete-me.enc");
        when(minioClient.statObject(any(StatObjectArgs.class))).thenReturn(null);
        when(vaultFileCryptoService.loadDecryptedThumbnail(encryptedVideo, "7/vault/thumbnails/delete-me.vthumb"))
                .thenReturn(new byte[]{5, 4, 3});

        fileThumbnailService.loadThumbnail(encryptedVideo);
        fileThumbnailService.evictThumbnailCacheForObjectKeys(List.of("7/vault/delete-me.enc"));
        fileThumbnailService.loadThumbnail(encryptedVideo);

        verify(vaultFileCryptoService, times(2))
                .loadDecryptedThumbnail(encryptedVideo, "7/vault/thumbnails/delete-me.vthumb");
    }

    @Test
    void scheduleEncryptedThumbnailPreGenerationRunsAsyncForEncryptedMediaOnly() {
        ReflectionTestUtils.setField(fileThumbnailService, "vaultFileCryptoService", vaultFileCryptoService);
        when(thumbnailTaskExecutor.runAsync(any(Runnable.class))).thenReturn(CompletableFuture.completedFuture(null));

        FileInfo plainVideo = videoFile();
        FileInfo encryptedText = FileInfo.builder()
                .idx(301L)
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.VAULT)
                .encryptionMode(FileEncryptionMode.SERVER_ENVELOPE_V1)
                .fileOriginName("secret.txt")
                .fileFormat("txt")
                .fileSaveName("secret.enc")
                .fileSavePath("7/vault/secret.enc")
                .build();
        FileInfo encryptedVideo = encryptedVaultVideo(302L, "7/vault/pregen.enc");

        fileThumbnailService.scheduleEncryptedThumbnailPreGeneration(plainVideo);
        fileThumbnailService.scheduleEncryptedThumbnailPreGeneration(encryptedText);
        verify(thumbnailTaskExecutor, never()).runAsync(any(Runnable.class));

        fileThumbnailService.scheduleEncryptedThumbnailPreGeneration(encryptedVideo);
        verify(thumbnailTaskExecutor, times(1)).runAsync(any(Runnable.class));
    }

    @Test
    void returnsPendingPayloadWhenOnDemandFfmpegPermitsAreSaturated() throws Exception {
        ReflectionTestUtils.setField(fileThumbnailService, "vaultFileCryptoService", vaultFileCryptoService);
        when(videoThumbnailService.supports("mp4")).thenReturn(true);
        when(minioClient.statObject(any(StatObjectArgs.class))).thenThrow(new RuntimeException("missing"));
        when(thumbnailTaskExecutor.runAsync(any(Runnable.class))).thenReturn(CompletableFuture.completedFuture(null));

        Semaphore permits = (Semaphore) ReflectionTestUtils.getField(fileThumbnailService, "onDemandVideoFfmpegPermits");
        int acquiredCount = permits.drainPermits();
        try {
            FileInfo encryptedVideo = encryptedVaultVideo(401L, "7/vault/busy-clip.enc");
            FileThumbnailService.ThumbnailPayload payload = fileThumbnailService.loadThumbnail(encryptedVideo);

            assertThat(payload).isNotNull();
            assertThat(payload.pending()).isTrue();
            verify(thumbnailTaskExecutor, times(1)).runAsync(any(Runnable.class));
        } finally {
            permits.release(acquiredCount);
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void expiredFailureCooldownAllowsThumbnailRetry() throws Exception {
        ReflectionTestUtils.setField(fileThumbnailService, "vaultFileCryptoService", vaultFileCryptoService);
        FileInfo encryptedVideo = encryptedVaultVideo(402L, "7/vault/retry-clip.enc");
        String thumbKey = "7/vault/thumbnails/retry-clip.vthumb";

        Map<String, Long> retryMap = (Map<String, Long>) ReflectionTestUtils.getField(
                fileThumbnailService,
                "failedThumbnailRetryAfter"
        );
        retryMap.put(thumbKey, System.currentTimeMillis() - 1000L);

        when(minioClient.statObject(any(StatObjectArgs.class))).thenReturn(null);
        when(vaultFileCryptoService.loadDecryptedThumbnail(encryptedVideo, thumbKey))
                .thenReturn(new byte[]{7, 8, 9});

        FileThumbnailService.ThumbnailPayload payload = fileThumbnailService.loadThumbnail(encryptedVideo);
        assertThat(payload).isNotNull();
        assertThat(payload.pending()).isFalse();
        assertThat(payload.bytes()).containsExactly(7, 8, 9);
    }

    @Test
    void scheduleEncryptedThumbnailPreGenerationDeduplicatesAndWaitsForPermit() throws Exception {
        ReflectionTestUtils.setField(fileThumbnailService, "vaultFileCryptoService", vaultFileCryptoService);
        when(videoThumbnailService.supports("mp4")).thenReturn(true);
        // First statObject check sees missing .vthumb so generation path acquires FFmpeg permit;
        // second check (inside permit block) finds the .vthumb ready.
        when(minioClient.statObject(any(StatObjectArgs.class)))
                .thenThrow(new RuntimeException("missing"))
                .thenReturn(null);

        java.util.List<Runnable> submitted = new java.util.ArrayList<>();
        when(thumbnailTaskExecutor.runAsync(any(Runnable.class))).thenAnswer(invocation -> {
            submitted.add(invocation.getArgument(0));
            return CompletableFuture.completedFuture(null);
        });

        FileInfo encryptedVideo = encryptedVaultVideo(403L, "7/vault/dedup-clip.enc");
        String thumbKey = "7/vault/thumbnails/dedup-clip.vthumb";
        when(vaultFileCryptoService.loadDecryptedThumbnail(encryptedVideo, thumbKey))
                .thenReturn(new byte[]{1, 2, 3});

        // Scheduling the same encrypted video twice only enqueues one async task
        fileThumbnailService.scheduleEncryptedThumbnailPreGeneration(encryptedVideo);
        fileThumbnailService.scheduleEncryptedThumbnailPreGeneration(encryptedVideo);
        assertThat(submitted).hasSize(1);

        // Drain permits temporarily; background prewarm blocks on acquire() instead of bailing on tryAcquire()
        Semaphore permits = (Semaphore) ReflectionTestUtils.getField(fileThumbnailService, "onDemandVideoFfmpegPermits");
        int drained = permits.drainPermits();
        CompletableFuture<Void> workerFuture = CompletableFuture.runAsync(submitted.get(0));
        try {
            Thread.sleep(60L);
            assertThat(workerFuture.isDone()).isFalse();
        } finally {
            permits.release(drained);
        }

        workerFuture.get(3, java.util.concurrent.TimeUnit.SECONDS);
        verify(vaultFileCryptoService).loadDecryptedThumbnail(encryptedVideo, thumbKey);
    }

    @Test
    void hydratesEncryptedFileMetadataFromRepositoryWhenSnapshotLacksKeys() throws Exception {
        ReflectionTestUtils.setField(fileThumbnailService, "vaultFileCryptoService", vaultFileCryptoService);
        ReflectionTestUtils.setField(fileThumbnailService, "fileUpDownloadRepository", fileUpDownloadRepository);

        FileInfo snapshot = encryptedVaultVideo(501L, "7/vault/snapshot.enc");
        FileInfo hydrated = FileInfo.builder()
                .idx(501L)
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.VAULT)
                .encryptionMode(FileEncryptionMode.SERVER_ENVELOPE_V1)
                .encryptionKeyVersion(1)
                .wrappedDek("wrapped-dek")
                .encryptionNoncePrefix("nonce123456")
                .encryptionChunkSize(1048576)
                .fileOriginName("secret.mp4")
                .fileFormat("mp4")
                .fileSaveName("secret.enc")
                .fileSavePath("7/vault/snapshot.enc")
                .fileSize(4096L)
                .lockedFile(false)
                .trashed(false)
                .build();

        String thumbKey = "7/vault/thumbnails/snapshot.vthumb";
        when(fileUpDownloadRepository.findById(501L)).thenReturn(Optional.of(hydrated));
        when(minioClient.statObject(any(StatObjectArgs.class))).thenReturn(null);
        when(vaultFileCryptoService.loadDecryptedThumbnail(hydrated, thumbKey))
                .thenReturn(new byte[]{4, 5, 6});

        FileThumbnailService.ThumbnailPayload payload = fileThumbnailService.loadThumbnail(snapshot);

        assertThat(payload).isNotNull();
        assertThat(payload.bytes()).containsExactly(4, 5, 6);
        verify(vaultFileCryptoService).loadDecryptedThumbnail(hydrated, thumbKey);
    }

    @Test
    void loopbackEncryptedVideoServerSendsConnectionCloseHeader() throws Exception {
        ReflectionTestUtils.setField(fileThumbnailService, "vaultFileCryptoService", vaultFileCryptoService);

        FileInfo encryptedVideo = FileInfo.builder()
                .idx(502L)
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.VAULT)
                .encryptionMode(FileEncryptionMode.SERVER_ENVELOPE_V1)
                .encryptionKeyVersion(1)
                .wrappedDek("wrapped-dek")
                .encryptionNoncePrefix("nonce123456")
                .encryptionChunkSize(1048576)
                .fileOriginName("secret.mp4")
                .fileFormat("mp4")
                .fileSaveName("secret.enc")
                .fileSavePath("7/vault/loopback-close.enc")
                .fileSize(4096L)
                .lockedFile(false)
                .trashed(false)
                .build();

        when(videoThumbnailService.supports("mp4")).thenReturn(true);
        when(minioClient.statObject(any(StatObjectArgs.class))).thenThrow(new RuntimeException("missing"));
        doAnswer(invocation -> {
            OutputStream out = invocation.getArgument(3);
            out.write(new byte[]{10, 20, 30, 40});
            out.flush();
            return null;
        }).when(vaultFileCryptoService).streamDecryptedRange(eq(encryptedVideo), eq(0L), eq(3L), any(OutputStream.class));

        when(videoThumbnailService.createThumbnailFromSource(any(String.class))).thenAnswer(invocation -> {
            String url = invocation.getArgument(0);
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Range", "bytes=0-3");
            assertThat(conn.getResponseCode()).isEqualTo(206);
            assertThat(conn.getHeaderField("Connection")).isEqualToIgnoringCase("close");
            assertThat(conn.getHeaderField("Content-Range")).isEqualTo("bytes 0-3/4096");
            byte[] body = conn.getInputStream().readAllBytes();
            conn.disconnect();
            assertThat(body).containsExactly(10, 20, 30, 40);
            return new byte[]{(byte) 0xFF, (byte) 0xD8, 1};
        });

        FileThumbnailService.ThumbnailPayload payload = fileThumbnailService.loadThumbnail(encryptedVideo);

        assertThat(payload).isNotNull();
        assertThat(payload.bytes()).containsExactly((byte) 0xFF, (byte) 0xD8, 1);
    }

    private FileInfo encryptedVaultVideo(Long idx, String objectKey) {
        return FileInfo.builder()
                .idx(idx)
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.VAULT)
                .encryptionMode(FileEncryptionMode.SERVER_ENVELOPE_V1)
                .fileOriginName("secret.mp4")
                .fileFormat("mp4")
                .fileSaveName("secret.enc")
                .fileSavePath(objectKey)
                .fileSize(4096L)
                .lockedFile(false)
                .trashed(false)
                .build();
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
