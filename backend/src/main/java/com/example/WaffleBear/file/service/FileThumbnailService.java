package com.example.WaffleBear.file.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
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
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.time.ZoneId;
import java.util.Collection;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
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
    private final Set<String> thumbnailGenerationInProgress = ConcurrentHashMap.newKeySet();
    private final Set<String> existingThumbnailKeys = ConcurrentHashMap.newKeySet();
    private final Set<String> failedThumbnailKeys = ConcurrentHashMap.newKeySet();
    private final Map<String, Long> scannedThumbnailPrefixes = new ConcurrentHashMap<>();
    private final Map<String, Long> missingThumbnailKeys = new ConcurrentHashMap<>();

    public ThumbnailPayload loadThumbnail(FileInfo file) {
        validateFile(file);

        String objectKey = file.getFileSavePath();
        if (objectKey == null || objectKey.isBlank()) {
            return null;
        }

        String normalizedExtension = resolveExtension(file);
        if (VIDEO_EXTENSIONS.contains(normalizedExtension)) {
            return loadVideoThumbnail(file, objectKey);
        }
        if (IMAGE_EXTENSIONS.contains(normalizedExtension)) {
            return loadImageThumbnail(file, objectKey, normalizedExtension);
        }

        return null;
    }

    public void warmThumbnailsForFiles(Collection<FileInfo> files) {
        if (files == null || files.isEmpty() || minioProperties.getBucket_cloud() == null) {
            return;
        }

        Set<String> prefixesToScan = new HashSet<>();
        long now = System.currentTimeMillis();
        for (FileInfo file : files) {
            if (!isPresignedThumbnailEligible(file)) {
                continue;
            }
            String objectKey = file.getFileSavePath();
            if (objectKey == null || objectKey.isBlank()) {
                continue;
            }
            String thumbnailObjectKey = buildThumbnailObjectKey(objectKey);
            if (existingThumbnailKeys.contains(thumbnailObjectKey) || failedThumbnailKeys.contains(thumbnailObjectKey)) {
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
            return new ThumbnailPayload(
                    generatedBytes,
                    "image/jpeg",
                    buildEtag(file),
                    resolveLastModifiedEpochMillis(file)
            );
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
                return new ThumbnailPayload(
                        generatedBytes,
                        "image/jpeg",
                        buildEtag(file),
                        resolveLastModifiedEpochMillis(file)
                );
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
        try (var objectStream = minioClient.getObject(
                GetObjectArgs.builder()
                        .bucket(minioProperties.getBucket_cloud())
                        .object(objectKey)
                        .build()
        );
             ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
            objectStream.transferTo(outputStream);
            return new ThumbnailPayload(
                    outputStream.toByteArray(),
                    contentType,
                    buildEtag(file),
                    resolveLastModifiedEpochMillis(file)
            );
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
                || file.isTrashed()) {
            return false;
        }

        String extension = resolveExtension(file);
        return VIDEO_EXTENSIONS.contains(extension) || isPresignedRasterImage(file, extension);
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
            long lastModifiedEpochMillis
    ) {
    }
}
