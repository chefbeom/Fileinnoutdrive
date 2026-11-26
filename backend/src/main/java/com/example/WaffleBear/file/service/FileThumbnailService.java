package com.example.WaffleBear.file.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.file.crypto.VaultFileCryptoService;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.util.FileContentUtils;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import io.minio.GetObjectArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.ListObjectsArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.Result;
import io.minio.StatObjectArgs;
import io.minio.http.Method;
import io.minio.messages.Item;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.security.SecureRandom;
import java.time.ZoneId;
import java.util.Base64;
import java.util.Collection;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
public class FileThumbnailService {

    private static final String THUMBNAIL_DIRECTORY_NAME = "thumbnails";
    private static final long MAX_VIDEO_FALLBACK_DOWNLOAD_BYTES = 80L * 1024 * 1024;
    private static final long MAX_IMAGE_THUMBNAIL_SOURCE_BYTES = 50L * 1024 * 1024;
    private static final long THUMBNAIL_PREFIX_CACHE_TTL_MS = 30_000L;
    private static final long THUMBNAIL_MISSING_CACHE_TTL_MS = 15_000L;
    private static final long MAX_MEMORY_CACHE_BYTES = 48L * 1024 * 1024;
    private static final long MAX_MEMORY_CACHE_ENTRY_BYTES = 2L * 1024 * 1024;
    private static final Set<String> IMAGE_EXTENSIONS = Set.of(
            "jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", "heic", "avif", "apng", "jfif", "tif", "tiff"
    );
    private static final Set<String> NON_TRANSCODABLE_IMAGE_EXTENSIONS = Set.of("gif", "svg");
    private static final Set<String> VIDEO_EXTENSIONS = Set.of(
            "mp4", "mov", "avi", "mkv", "wmv", "webm", "m4v", "mpeg", "mpg", "ogv", "3gp"
    );

    private final MinioClient minioClient;
    private final MinioPresignedUrlService minioPresignedUrlService;
    private final MinioProperties minioProperties;
    private final VideoThumbnailService videoThumbnailService;
    private final ImageThumbnailService imageThumbnailService;
    private final ThumbnailTaskExecutor thumbnailTaskExecutor;

    @Autowired(required = false)
    private VaultFileCryptoService vaultFileCryptoService;

    private static final SecureRandom EPHEMERAL_RANDOM = new SecureRandom();
    private final Set<String> thumbnailGenerationInProgress = ConcurrentHashMap.newKeySet();
    private final Set<String> existingThumbnailKeys = ConcurrentHashMap.newKeySet();
    private final Set<String> failedThumbnailKeys = ConcurrentHashMap.newKeySet();
    private final Map<String, Long> scannedThumbnailPrefixes = new ConcurrentHashMap<>();
    private final Map<String, Long> missingThumbnailKeys = new ConcurrentHashMap<>();
    private final Object memoryCacheLock = new Object();
    private final Map<String, CachedThumbnailEntry> thumbnailMemoryCache = new LinkedHashMap<>(256, 0.75f, true);
    private long currentMemoryCacheBytes = 0L;

    public ThumbnailPayload loadThumbnail(FileInfo file) {
        validateFile(file);

        String objectKey = file.getFileSavePath();
        if (objectKey == null || objectKey.isBlank()) {
            return null;
        }

        String normalizedExtension = resolveExtension(file);
        if (file.isEncrypted()) {
            return loadEncryptedThumbnail(file, objectKey, normalizedExtension);
        }
        if (VIDEO_EXTENSIONS.contains(normalizedExtension)) {
            return loadVideoThumbnail(file, objectKey);
        }
        if (IMAGE_EXTENSIONS.contains(normalizedExtension)) {
            return loadImageThumbnail(file, objectKey, normalizedExtension);
        }

        return null;
    }

    private ThumbnailPayload loadEncryptedThumbnail(FileInfo file, String objectKey, String extension) {
        if (vaultFileCryptoService == null) {
            return null;
        }
        boolean isVideo = VIDEO_EXTENSIONS.contains(extension);
        boolean isImage = IMAGE_EXTENSIONS.contains(extension);
        if (!isVideo && !isImage) {
            return null;
        }

        String eTag = buildEtag(file);

        if (isImage && NON_TRANSCODABLE_IMAGE_EXTENSIONS.contains(extension)) {
            if (file.getFileSize() != null && file.getFileSize() > MAX_IMAGE_THUMBNAIL_SOURCE_BYTES) {
                return null;
            }
            String rawCacheKey = buildEncryptedRawCacheKey(objectKey);
            ThumbnailPayload memoryCached = getCachedThumbnail(rawCacheKey, eTag);
            if (memoryCached != null) {
                return memoryCached;
            }
            try {
                byte[] original = vaultFileCryptoService.readDecryptedBytes(file);
                if (original == null || original.length == 0) {
                    return null;
                }
                ThumbnailPayload payload = new ThumbnailPayload(
                        original,
                        resolveImageContentType(extension),
                        eTag,
                        resolveLastModifiedEpochMillis(file),
                        true
                );
                putCachedThumbnail(rawCacheKey, payload, objectKey);
                return payload;
            } catch (Exception ignored) {
                return null;
            }
        }

        String encryptedThumbKey = FileContentUtils.buildEncryptedThumbnailObjectKey(objectKey);
        if (failedThumbnailKeys.contains(encryptedThumbKey)) {
            return null;
        }

        ThumbnailPayload memoryCached = getCachedThumbnail(encryptedThumbKey, eTag);
        if (memoryCached != null) {
            return memoryCached;
        }

        if (objectExists(encryptedThumbKey)) {
            byte[] cached = vaultFileCryptoService.loadDecryptedThumbnail(file, encryptedThumbKey);
            if (cached != null && cached.length > 0) {
                ThumbnailPayload payload = new ThumbnailPayload(
                        cached,
                        "image/jpeg",
                        eTag,
                        resolveLastModifiedEpochMillis(file),
                        true
                );
                putCachedThumbnail(encryptedThumbKey, payload, objectKey);
                return payload;
            }
        }

        if (isVideo && !videoThumbnailService.supports(extension)) {
            failedThumbnailKeys.add(encryptedThumbKey);
            return null;
        }
        if (!isVideo && !isPresignedRasterImage(file, extension)) {
            return null;
        }

        if (!thumbnailGenerationInProgress.add(encryptedThumbKey)) {
            return null;
        }

        try {
            if (objectExistsDirect(encryptedThumbKey)) {
                byte[] existing = vaultFileCryptoService.loadDecryptedThumbnail(file, encryptedThumbKey);
                if (existing != null && existing.length > 0) {
                    ThumbnailPayload payload = new ThumbnailPayload(
                            existing,
                            "image/jpeg",
                            eTag,
                            resolveLastModifiedEpochMillis(file),
                            true
                    );
                    putCachedThumbnail(encryptedThumbKey, payload, objectKey);
                    return payload;
                }
            }

            byte[] generatedBytes;
            if (isVideo) {
                generatedBytes = createEncryptedVideoThumbnailBytes(file, extension);
            } else {
                try (var plainStream = vaultFileCryptoService.openDecryptedInputStream(file)) {
                    generatedBytes = imageThumbnailService.createThumbnail(plainStream);
                }
            }

            if (generatedBytes != null && generatedBytes.length > 0) {
                vaultFileCryptoService.encryptAndStoreThumbnail(file, encryptedThumbKey, generatedBytes);
                existingThumbnailKeys.add(encryptedThumbKey);
                missingThumbnailKeys.remove(encryptedThumbKey);
                failedThumbnailKeys.remove(encryptedThumbKey);
                ThumbnailPayload payload = new ThumbnailPayload(
                        generatedBytes,
                        "image/jpeg",
                        eTag,
                        resolveLastModifiedEpochMillis(file),
                        true
                );
                putCachedThumbnail(encryptedThumbKey, payload, objectKey);
                return payload;
            }
            failedThumbnailKeys.add(encryptedThumbKey);
            return null;
        } catch (Exception ignored) {
            failedThumbnailKeys.add(encryptedThumbKey);
            return null;
        } finally {
            thumbnailGenerationInProgress.remove(encryptedThumbKey);
        }
    }

    private byte[] createEncryptedVideoThumbnailBytes(FileInfo file, String extension) throws IOException {
        long plainSize = Math.max(0L, file.getFileSize() == null ? 0L : file.getFileSize());
        if (plainSize == 0L) {
            return new byte[0];
        }

        byte[] tokenBytes = new byte[24];
        EPHEMERAL_RANDOM.nextBytes(tokenBytes);
        String expectedPath = "/" + Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes) + "." + extension;

        HttpServer server = HttpServer.create(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0), 4);
        server.createContext(expectedPath, exchange -> handleLoopbackVideoRange(exchange, expectedPath, file, plainSize));
        server.start();
        try {
            int port = server.getAddress().getPort();
            String sourceUrl = "http://127.0.0.1:" + port + expectedPath;
            return videoThumbnailService.createThumbnailFromSource(sourceUrl);
        } finally {
            server.stop(0);
        }
    }

    private void handleLoopbackVideoRange(
            HttpExchange exchange,
            String expectedPath,
            FileInfo file,
            long plainSize
    ) throws IOException {
        try {
            String method = exchange.getRequestMethod();
            String path = exchange.getRequestURI() != null ? exchange.getRequestURI().getPath() : "";
            if (!expectedPath.equals(path) || (!"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method))) {
                exchange.sendResponseHeaders(404, -1);
                return;
            }

            long start = 0L;
            long end = plainSize - 1L;
            int statusCode = 200;
            String rangeHeader = exchange.getRequestHeaders().getFirst("Range");
            if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
                String spec = rangeHeader.substring("bytes=".length()).split(",", 2)[0].trim();
                int dash = spec.indexOf('-');
                if (dash >= 0) {
                    String startStr = spec.substring(0, dash).trim();
                    String endStr = spec.substring(dash + 1).trim();
                    try {
                        if (startStr.isEmpty() && !endStr.isEmpty()) {
                            long suffix = Long.parseLong(endStr);
                            start = Math.max(0L, plainSize - suffix);
                            end = plainSize - 1L;
                        } else if (!startStr.isEmpty()) {
                            start = Long.parseLong(startStr);
                            end = endStr.isEmpty() ? (plainSize - 1L) : Math.min(plainSize - 1L, Long.parseLong(endStr));
                        }
                        if (start < 0L || end < start || start >= plainSize) {
                            exchange.getResponseHeaders().set("Content-Range", "bytes */" + plainSize);
                            exchange.sendResponseHeaders(416, -1);
                            return;
                        }
                        statusCode = 206;
                    } catch (NumberFormatException ignored) {
                        statusCode = 200;
                        start = 0L;
                        end = plainSize - 1L;
                    }
                }
            }

            long length = end - start + 1L;
            exchange.getResponseHeaders().set("Accept-Ranges", "bytes");
            exchange.getResponseHeaders().set("Content-Type", "application/octet-stream");
            if (statusCode == 206) {
                exchange.getResponseHeaders().set("Content-Range", "bytes " + start + "-" + end + "/" + plainSize);
            }
            if ("HEAD".equalsIgnoreCase(method)) {
                exchange.getResponseHeaders().set("Content-Length", String.valueOf(length));
                exchange.sendResponseHeaders(statusCode, -1);
                return;
            }

            exchange.sendResponseHeaders(statusCode, length);
            try (OutputStream out = exchange.getResponseBody()) {
                vaultFileCryptoService.streamDecryptedRange(file, start, end, out);
            } catch (IOException ignored) {
                // ffmpeg closes stream as soon as keyframe/moov atom is decoded
            }
        } finally {
            exchange.close();
        }
    }

    public void warmThumbnailsForFiles(Collection<FileInfo> files) {
        if (files == null || files.isEmpty() || minioProperties.getBucket_cloud() == null) {
            return;
        }

        Set<String> prefixesToScan = new HashSet<>();
        long now = System.currentTimeMillis();
        for (FileInfo file : files) {
            boolean presignedEligible = isPresignedThumbnailEligible(file);
            boolean encryptedEligible = !presignedEligible && isEncryptedThumbnailWarmEligible(file);
            if (!presignedEligible && !encryptedEligible) {
                continue;
            }
            String objectKey = file.getFileSavePath();
            if (objectKey == null || objectKey.isBlank()) {
                continue;
            }
            String thumbnailObjectKey = encryptedEligible
                    ? FileContentUtils.buildEncryptedThumbnailObjectKey(objectKey)
                    : buildThumbnailObjectKey(objectKey);
            if (thumbnailObjectKey == null
                    || thumbnailObjectKey.isBlank()
                    || existingThumbnailKeys.contains(thumbnailObjectKey)
                    || failedThumbnailKeys.contains(thumbnailObjectKey)) {
                continue;
            }
            String prefix = extractThumbnailDirectoryPrefix(thumbnailObjectKey);
            if (prefix == null) {
                continue;
            }
            Long lastScannedAt = scannedThumbnailPrefixes.get(prefix);
            if (lastScannedAt == null || (now - lastScannedAt) >= THUMBNAIL_PREFIX_CACHE_TTL_MS) {
                prefixesToScan.add(prefix);
            }
        }

        for (String prefix : prefixesToScan) {
            scanThumbnailPrefix(prefix, now);
        }
    }

    public void scheduleEncryptedThumbnailPreGeneration(FileInfo file) {
        if (file == null || vaultFileCryptoService == null || !isEncryptedThumbnailWarmEligible(file)) {
            return;
        }

        String objectKey = file.getFileSavePath();
        if (objectKey == null || objectKey.isBlank()) {
            return;
        }

        String encryptedThumbKey = FileContentUtils.buildEncryptedThumbnailObjectKey(objectKey);
        if (encryptedThumbKey == null
                || encryptedThumbKey.isBlank()
                || existingThumbnailKeys.contains(encryptedThumbKey)
                || failedThumbnailKeys.contains(encryptedThumbKey)) {
            return;
        }

        try {
            thumbnailTaskExecutor.runAsync(() -> {
                try {
                    loadThumbnail(file);
                } catch (Exception ignored) {
                }
            });
        } catch (RuntimeException ignored) {
        }
    }

    public void evictThumbnailCacheForObjectKeys(Collection<String> objectKeys) {
        if (objectKeys == null || objectKeys.isEmpty()) {
            return;
        }

        Set<String> targetKeys = new HashSet<>();
        Set<String> sourceKeys = new HashSet<>();
        for (String rawKey : objectKeys) {
            if (rawKey == null || rawKey.isBlank()) {
                continue;
            }
            String key = rawKey.trim();
            sourceKeys.add(key);
            targetKeys.add(key);
            targetKeys.add(buildEncryptedRawCacheKey(key));
            String plainThumbKey = buildThumbnailObjectKey(key);
            if (!plainThumbKey.isBlank()) {
                targetKeys.add(plainThumbKey);
            }
            String encryptedThumbKey = FileContentUtils.buildEncryptedThumbnailObjectKey(key);
            if (encryptedThumbKey != null && !encryptedThumbKey.isBlank()) {
                targetKeys.add(encryptedThumbKey);
            }
        }

        for (String key : targetKeys) {
            existingThumbnailKeys.remove(key);
            missingThumbnailKeys.remove(key);
            failedThumbnailKeys.remove(key);
        }

        synchronized (memoryCacheLock) {
            Iterator<Map.Entry<String, CachedThumbnailEntry>> iterator = thumbnailMemoryCache.entrySet().iterator();
            while (iterator.hasNext()) {
                Map.Entry<String, CachedThumbnailEntry> entry = iterator.next();
                CachedThumbnailEntry value = entry.getValue();
                if (targetKeys.contains(entry.getKey())
                        || (value != null && sourceKeys.contains(value.sourceObjectKey()))) {
                    currentMemoryCacheBytes = Math.max(0L, currentMemoryCacheBytes - value.byteLength());
                    iterator.remove();
                }
            }
        }
    }

    public void evictVaultCacheForUser(Long userIdx) {
        if (userIdx == null || userIdx <= 0L) {
            return;
        }

        String vaultPrefix = userIdx + "/vault/";
        String rawVaultPrefix = "enc-raw:" + vaultPrefix;
        synchronized (memoryCacheLock) {
            Iterator<Map.Entry<String, CachedThumbnailEntry>> iterator = thumbnailMemoryCache.entrySet().iterator();
            while (iterator.hasNext()) {
                Map.Entry<String, CachedThumbnailEntry> entry = iterator.next();
                String cacheKey = entry.getKey();
                CachedThumbnailEntry value = entry.getValue();
                String sourceObjectKey = value != null ? value.sourceObjectKey() : null;
                if ((cacheKey != null && (cacheKey.startsWith(vaultPrefix) || cacheKey.startsWith(rawVaultPrefix)))
                        || (sourceObjectKey != null && sourceObjectKey.startsWith(vaultPrefix))) {
                    currentMemoryCacheBytes = Math.max(0L, currentMemoryCacheBytes - (value != null ? value.byteLength() : 0L));
                    iterator.remove();
                }
            }
        }
    }

    public String generatePresignedThumbnailUrl(FileInfo file) {
        if (!isPresignedThumbnailEligible(file)) {
            return null;
        }

        String objectKey = file.getFileSavePath();
        if (objectKey == null || objectKey.isBlank()) {
            return null;
        }

        String thumbnailObjectKey = buildThumbnailObjectKey(objectKey);
        if (failedThumbnailKeys.contains(thumbnailObjectKey)) {
            return null;
        }

        try {
            if (!objectExists(thumbnailObjectKey)) {
                triggerThumbnailGeneration(file, thumbnailObjectKey);
                return null;
            }

            return generatePresignedGetUrl(thumbnailObjectKey);
        } catch (Exception ignored) {
            return null;
        }
    }

    private ThumbnailPayload loadVideoThumbnail(FileInfo file, String objectKey) {
        String thumbnailObjectKey = buildThumbnailObjectKey(objectKey);
        if (objectExists(thumbnailObjectKey)) {
            return readObject(thumbnailObjectKey, "image/jpeg", file);
        }

        if (failedThumbnailKeys.contains(thumbnailObjectKey)) {
            return null;
        }

        byte[] generatedBytes = ensureVideoThumbnailSynchronously(file, thumbnailObjectKey);
        if (generatedBytes != null && generatedBytes.length > 0) {
            ThumbnailPayload payload = new ThumbnailPayload(
                    generatedBytes,
                    "image/jpeg",
                    buildEtag(file),
                    resolveLastModifiedEpochMillis(file)
            );
            putCachedThumbnail(thumbnailObjectKey, payload, objectKey);
            return payload;
        }

        if (objectExists(thumbnailObjectKey)) {
            return readObject(thumbnailObjectKey, "image/jpeg", file);
        }

        triggerThumbnailGeneration(file, thumbnailObjectKey);
        return null;
    }

    private ThumbnailPayload loadImageThumbnail(FileInfo file, String objectKey, String extension) {
        if (file.getFileSize() != null && file.getFileSize() > MAX_IMAGE_THUMBNAIL_SOURCE_BYTES) {
            return null;
        }

        if ("svg".equals(extension) || "gif".equals(extension)) {
            return readObject(objectKey, resolveImageContentType(extension), file);
        }

        String thumbnailObjectKey = buildThumbnailObjectKey(objectKey);
        if (objectExists(thumbnailObjectKey)) {
            return readObject(thumbnailObjectKey, "image/jpeg", file);
        }

        if (!failedThumbnailKeys.contains(thumbnailObjectKey)) {
            byte[] generatedBytes = ensureImageThumbnail(objectKey, thumbnailObjectKey);
            if (generatedBytes != null && generatedBytes.length > 0) {
                ThumbnailPayload payload = new ThumbnailPayload(
                        generatedBytes,
                        "image/jpeg",
                        buildEtag(file),
                        resolveLastModifiedEpochMillis(file)
                );
                putCachedThumbnail(thumbnailObjectKey, payload, objectKey);
                return payload;
            }
        }

        return readObject(objectKey, resolveImageContentType(extension), file);
    }

    private void triggerThumbnailGeneration(FileInfo file, String thumbnailObjectKey) {
        if (thumbnailObjectKey == null || thumbnailObjectKey.isBlank()) {
            return;
        }

        if (failedThumbnailKeys.contains(thumbnailObjectKey)) {
            return;
        }

        String extension = resolveExtension(file);
        boolean isVideo = VIDEO_EXTENSIONS.contains(extension);
        boolean isRasterImage = isPresignedRasterImage(file, extension);
        if (isVideo) {
            if (!videoThumbnailService.supports(extension)) {
                failedThumbnailKeys.add(thumbnailObjectKey);
                return;
            }
        } else if (!isRasterImage) {
            failedThumbnailKeys.add(thumbnailObjectKey);
            return;
        }

        if (!thumbnailGenerationInProgress.add(thumbnailObjectKey)) {
            return;
        }

        try {
            thumbnailTaskExecutor.runAsync(() -> {
                try {
                    if (!objectExistsDirect(thumbnailObjectKey)) {
                        if (isVideo) {
                            ensureVideoThumbnail(file, thumbnailObjectKey);
                        } else {
                            ensureImageThumbnail(file.getFileSavePath(), thumbnailObjectKey);
                        }
                    }
                } finally {
                    thumbnailGenerationInProgress.remove(thumbnailObjectKey);
                }
            });
        } catch (RuntimeException exception) {
            thumbnailGenerationInProgress.remove(thumbnailObjectKey);
        }
    }

    private byte[] ensureVideoThumbnailSynchronously(FileInfo file, String thumbnailObjectKey) {
        if (thumbnailObjectKey == null || thumbnailObjectKey.isBlank()) {
            return null;
        }
        String extension = resolveExtension(file);
        if (!videoThumbnailService.supports(extension)) {
            failedThumbnailKeys.add(thumbnailObjectKey);
            return null;
        }

        if (!thumbnailGenerationInProgress.add(thumbnailObjectKey)) {
            return null;
        }

        try {
            return ensureVideoThumbnail(file, thumbnailObjectKey);
        } finally {
            thumbnailGenerationInProgress.remove(thumbnailObjectKey);
        }
    }

    private byte[] ensureVideoThumbnail(FileInfo file, String thumbnailObjectKey) {
        String extension = resolveExtension(file);
        if (!videoThumbnailService.supports(extension)) {
            failedThumbnailKeys.add(thumbnailObjectKey);
            return null;
        }

        String objectKey = file.getFileSavePath();
        if (objectKey == null || objectKey.isBlank()) {
            return null;
        }

        try {
            byte[] thumbnailBytes = createVideoThumbnailBytes(file, extension);
            if (thumbnailBytes != null && thumbnailBytes.length > 0) {
                uploadThumbnail(thumbnailObjectKey, thumbnailBytes);
                existingThumbnailKeys.add(thumbnailObjectKey);
                failedThumbnailKeys.remove(thumbnailObjectKey);
                return thumbnailBytes;
            }
            failedThumbnailKeys.add(thumbnailObjectKey);
            return null;
        } catch (Exception ignored) {
            failedThumbnailKeys.add(thumbnailObjectKey);
            return null;
        }
    }

    private byte[] createVideoThumbnailBytes(FileInfo file, String extension) throws Exception {
        String objectKey = file.getFileSavePath();
        String internalPresignedUrl = generateInternalPresignedGetUrl(objectKey);
        if (internalPresignedUrl != null && !internalPresignedUrl.isBlank()) {
            byte[] streamedThumbnail = videoThumbnailService.createThumbnailFromSource(internalPresignedUrl);
            if (streamedThumbnail != null && streamedThumbnail.length > 0) {
                return streamedThumbnail;
            }
        }

        if (file.getFileSize() != null && file.getFileSize() > MAX_VIDEO_FALLBACK_DOWNLOAD_BYTES) {
            return new byte[0];
        }

        java.nio.file.Path tempVideoPath = null;
        try {
            tempVideoPath = java.nio.file.Files.createTempFile("wafflebear-thumbnail-", "." + extension);
            try (var objectStream = minioClient.getObject(
                    GetObjectArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .object(objectKey)
                            .build()
            )) {
                java.nio.file.Files.copy(objectStream, tempVideoPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }

            return videoThumbnailService.createThumbnail(tempVideoPath);
        } finally {
            if (tempVideoPath != null) {
                try {
                    java.nio.file.Files.deleteIfExists(tempVideoPath);
                } catch (Exception ignored) {
                }
            }
        }
    }

    private byte[] ensureImageThumbnail(String objectKey, String thumbnailObjectKey) {
        try (var objectStream = minioClient.getObject(
                GetObjectArgs.builder()
                        .bucket(minioProperties.getBucket_cloud())
                        .object(objectKey)
                        .build()
        )) {
            byte[] thumbnailBytes = imageThumbnailService.createThumbnail(objectStream);
            if (thumbnailBytes != null && thumbnailBytes.length > 0) {
                uploadThumbnail(thumbnailObjectKey, thumbnailBytes);
                existingThumbnailKeys.add(thumbnailObjectKey);
                failedThumbnailKeys.remove(thumbnailObjectKey);
                return thumbnailBytes;
            }
            failedThumbnailKeys.add(thumbnailObjectKey);
            return null;
        } catch (Exception ignored) {
            failedThumbnailKeys.add(thumbnailObjectKey);
            return null;
        }
    }

    private void uploadThumbnail(String thumbnailObjectKey, byte[] thumbnailBytes) throws Exception {
        if (thumbnailBytes == null || thumbnailBytes.length == 0 || thumbnailObjectKey == null || thumbnailObjectKey.isBlank()) {
            return;
        }

        try (ByteArrayInputStream inputStream = new ByteArrayInputStream(thumbnailBytes)) {
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .object(thumbnailObjectKey)
                            .stream(inputStream, thumbnailBytes.length, -1)
                            .contentType("image/jpeg")
                            .build()
            );
            existingThumbnailKeys.add(thumbnailObjectKey);
            missingThumbnailKeys.remove(thumbnailObjectKey);
            failedThumbnailKeys.remove(thumbnailObjectKey);
        }
    }

    private ThumbnailPayload readObject(String objectKey, String contentType, FileInfo file) {
        String eTag = buildEtag(file);
        ThumbnailPayload memoryCached = getCachedThumbnail(objectKey, eTag);
        if (memoryCached != null) {
            return memoryCached;
        }

        try (var objectStream = minioClient.getObject(
                GetObjectArgs.builder()
                        .bucket(minioProperties.getBucket_cloud())
                        .object(objectKey)
                        .build()
        );
             ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
            objectStream.transferTo(outputStream);
            ThumbnailPayload payload = new ThumbnailPayload(
                    outputStream.toByteArray(),
                    contentType,
                    eTag,
                    resolveLastModifiedEpochMillis(file)
            );
            putCachedThumbnail(objectKey, payload, file != null ? file.getFileSavePath() : null);
            return payload;
        } catch (Exception ignored) {
            return null;
        }
    }

    private boolean objectExists(String objectKey) {
        if (objectKey == null || objectKey.isBlank()) {
            return false;
        }

        if (existingThumbnailKeys.contains(objectKey)) {
            return true;
        }

        if (failedThumbnailKeys.contains(objectKey)) {
            return false;
        }

        long now = System.currentTimeMillis();
        String prefix = extractThumbnailDirectoryPrefix(objectKey);
        if (prefix != null) {
            Long lastScannedAt = scannedThumbnailPrefixes.get(prefix);
            if (lastScannedAt != null && (now - lastScannedAt) < THUMBNAIL_PREFIX_CACHE_TTL_MS) {
                return false;
            }
        }

        Long missingUntil = missingThumbnailKeys.get(objectKey);
        if (missingUntil != null) {
            if (now < missingUntil) {
                return false;
            }
            missingThumbnailKeys.remove(objectKey, missingUntil);
        }

        return objectExistsDirect(objectKey);
    }

    private boolean objectExistsDirect(String objectKey) {
        if (objectKey == null || objectKey.isBlank()) {
            return false;
        }

        if (existingThumbnailKeys.contains(objectKey)) {
            return true;
        }

        try {
            minioClient.statObject(
                    StatObjectArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .object(objectKey)
                            .build()
            );
            existingThumbnailKeys.add(objectKey);
            missingThumbnailKeys.remove(objectKey);
            return true;
        } catch (Exception ignored) {
            missingThumbnailKeys.put(objectKey, System.currentTimeMillis() + THUMBNAIL_MISSING_CACHE_TTL_MS);
            return false;
        }
    }

    private void scanThumbnailPrefix(String prefix, long now) {
        try {
            Iterable<Result<Item>> results = minioClient.listObjects(
                    ListObjectsArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .prefix(prefix)
                            .recursive(false)
                            .build()
            );
            if (results == null) {
                return;
            }

            for (Result<Item> result : results) {
                Item item = result.get();
                if (item != null && !item.isDir() && item.objectName() != null) {
                    existingThumbnailKeys.add(item.objectName());
                    missingThumbnailKeys.remove(item.objectName());
                }
            }
            scannedThumbnailPrefixes.put(prefix, now);
        } catch (Exception ignored) {
        }
    }

    private String extractThumbnailDirectoryPrefix(String thumbnailObjectKey) {
        if (thumbnailObjectKey == null || thumbnailObjectKey.isBlank()) {
            return null;
        }
        int lastSlash = thumbnailObjectKey.lastIndexOf('/');
        if (lastSlash < 0) {
            return null;
        }
        return thumbnailObjectKey.substring(0, lastSlash + 1);
    }

    private String generateInternalPresignedGetUrl(String objectKey) {
        if (objectKey == null || objectKey.isBlank() || minioProperties.getBucket_cloud() == null) {
            return null;
        }

        try {
            return minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(minioProperties.getBucket_cloud())
                    .object(objectKey)
                    .expiry(300)
                    .build());
        } catch (Exception ignored) {
            return null;
        }
    }

    private String generatePresignedGetUrl(String objectKey) {
        if (objectKey == null || objectKey.isBlank()) {
            return null;
        }

        try {
            return minioPresignedUrlService.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(minioProperties.getBucket_cloud())
                    .object(objectKey)
                    .expiry(minioProperties.getPresignedUrlExpirySeconds())
                    .build());
        } catch (Exception ignored) {
            return null;
        }
    }

    private void validateFile(FileInfo file) {
        if (file == null || resolveNodeType(file) != FileNodeType.FILE || file.isLockedFile() || file.isTrashed()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    private boolean isPresignedThumbnailEligible(FileInfo file) {
        if (file == null
                || resolveNodeType(file) != FileNodeType.FILE
                || file.isLockedFile()
                || file.isTrashed()
                || file.isEncrypted()
                || file.isVaultSpace()) {
            return false;
        }

        String extension = resolveExtension(file);
        return VIDEO_EXTENSIONS.contains(extension) || isPresignedRasterImage(file, extension);
    }

    private boolean isEncryptedThumbnailWarmEligible(FileInfo file) {
        if (file == null
                || resolveNodeType(file) != FileNodeType.FILE
                || file.isLockedFile()
                || file.isTrashed()
                || !file.isEncrypted()) {
            return false;
        }

        String extension = resolveExtension(file);
        return VIDEO_EXTENSIONS.contains(extension) || isPresignedRasterImage(file, extension);
    }

    private String buildEncryptedRawCacheKey(String objectKey) {
        return "enc-raw:" + (objectKey == null ? "" : objectKey);
    }

    private ThumbnailPayload getCachedThumbnail(String cacheKey, String expectedEtag) {
        if (cacheKey == null || cacheKey.isBlank()) {
            return null;
        }

        synchronized (memoryCacheLock) {
            CachedThumbnailEntry cached = thumbnailMemoryCache.get(cacheKey);
            if (cached == null) {
                return null;
            }
            if (expectedEtag != null && !Objects.equals(cached.eTag(), expectedEtag)) {
                currentMemoryCacheBytes = Math.max(0L, currentMemoryCacheBytes - cached.byteLength());
                thumbnailMemoryCache.remove(cacheKey);
                return null;
            }
            return new ThumbnailPayload(
                    cached.bytes(),
                    cached.contentType(),
                    cached.eTag(),
                    cached.lastModifiedEpochMillis(),
                    cached.privateNoStore()
            );
        }
    }

    private void putCachedThumbnail(String cacheKey, ThumbnailPayload payload, String sourceObjectKey) {
        if (cacheKey == null
                || cacheKey.isBlank()
                || payload == null
                || payload.bytes() == null
                || payload.bytes().length == 0
                || payload.bytes().length > MAX_MEMORY_CACHE_ENTRY_BYTES) {
            return;
        }

        CachedThumbnailEntry nextEntry = new CachedThumbnailEntry(
                payload.bytes(),
                payload.contentType(),
                payload.eTag(),
                payload.lastModifiedEpochMillis(),
                payload.privateNoStore(),
                sourceObjectKey
        );

        synchronized (memoryCacheLock) {
            CachedThumbnailEntry previous = thumbnailMemoryCache.remove(cacheKey);
            if (previous != null) {
                currentMemoryCacheBytes = Math.max(0L, currentMemoryCacheBytes - previous.byteLength());
            }
            thumbnailMemoryCache.put(cacheKey, nextEntry);
            currentMemoryCacheBytes += nextEntry.byteLength();

            Iterator<Map.Entry<String, CachedThumbnailEntry>> iterator = thumbnailMemoryCache.entrySet().iterator();
            while (currentMemoryCacheBytes > MAX_MEMORY_CACHE_BYTES && iterator.hasNext()) {
                Map.Entry<String, CachedThumbnailEntry> eldest = iterator.next();
                CachedThumbnailEntry removed = eldest.getValue();
                currentMemoryCacheBytes = Math.max(0L, currentMemoryCacheBytes - (removed != null ? removed.byteLength() : 0L));
                iterator.remove();
            }
        }
    }

    private record CachedThumbnailEntry(
            byte[] bytes,
            String contentType,
            String eTag,
            long lastModifiedEpochMillis,
            boolean privateNoStore,
            String sourceObjectKey
    ) {
        long byteLength() {
            return bytes == null ? 0L : bytes.length;
        }
    }

    private boolean isPresignedRasterImage(FileInfo file, String extension) {
        if (!IMAGE_EXTENSIONS.contains(extension) || NON_TRANSCODABLE_IMAGE_EXTENSIONS.contains(extension)) {
            return false;
        }
        return file.getFileSize() == null || file.getFileSize() <= MAX_IMAGE_THUMBNAIL_SOURCE_BYTES;
    }

    private FileNodeType resolveNodeType(FileInfo file) {
        return file.getNodeType() == null ? FileNodeType.FILE : file.getNodeType();
    }

    private String resolveExtension(FileInfo file) {
        if (file == null) {
            return "";
        }
        String normalizedFormat = normalizeExtension(file.getFileFormat());
        if (!normalizedFormat.isBlank()) {
            return normalizedFormat;
        }
        String fromOriginName = extractExtensionFromFileName(file.getFileOriginName());
        if (!fromOriginName.isBlank()) {
            return fromOriginName;
        }
        return extractExtensionFromFileName(file.getFileSavePath());
    }

    private String extractExtensionFromFileName(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            return "";
        }
        int dotIndex = fileName.lastIndexOf('.');
        if (dotIndex < 0 || dotIndex == fileName.length() - 1) {
            return "";
        }
        return normalizeExtension(fileName.substring(dotIndex + 1));
    }

    private String normalizeExtension(String extension) {
        String normalized = extension == null ? "" : extension.trim().toLowerCase(Locale.ROOT);
        while (normalized.startsWith(".")) {
            normalized = normalized.substring(1);
        }
        return normalized;
    }

    private String buildThumbnailObjectKey(String objectKey) {
        int pathSeparatorIndex = objectKey.lastIndexOf('/');
        String directory = pathSeparatorIndex >= 0 ? objectKey.substring(0, pathSeparatorIndex + 1) : "";
        String fileName = pathSeparatorIndex >= 0 ? objectKey.substring(pathSeparatorIndex + 1) : objectKey;
        int extensionIndex = fileName.lastIndexOf('.');
        String baseName = extensionIndex >= 0 ? fileName.substring(0, extensionIndex) : fileName;

        return directory + THUMBNAIL_DIRECTORY_NAME + "/" + baseName + ".jpg";
    }

    private String resolveImageContentType(String extension) {
        return switch (normalizeExtension(extension)) {
            case "png" -> "image/png";
            case "gif" -> "image/gif";
            case "svg" -> "image/svg+xml";
            case "bmp" -> "image/bmp";
            case "webp" -> "image/webp";
            case "heic" -> "image/heic";
            case "avif" -> "image/avif";
            case "apng" -> "image/apng";
            case "tif", "tiff" -> "image/tiff";
            default -> "image/jpeg";
        };
    }

    private String buildEtag(FileInfo file) {
        long modifiedAt = resolveLastModifiedEpochMillis(file);
        long size = file.getFileSize() == null ? 0L : file.getFileSize();
        return "thumb-" + file.getIdx() + "-" + modifiedAt + "-" + size;
    }

    private long resolveLastModifiedEpochMillis(FileInfo file) {
        if (file.getLastModifyDate() != null) {
            return file.getLastModifyDate().atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
        }
        if (file.getUploadDate() != null) {
            return file.getUploadDate().atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
        }
        return 0L;
    }

    public record ThumbnailPayload(
            byte[] bytes,
            String contentType,
            String eTag,
            long lastModifiedEpochMillis,
            boolean privateNoStore
    ) {
        public ThumbnailPayload(byte[] bytes, String contentType, String eTag, long lastModifiedEpochMillis) {
            this(bytes, contentType, eTag, lastModifiedEpochMillis, false);
        }
    }
}
