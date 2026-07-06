package com.example.WaffleBear.workspace.asset;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.workspace.asset.model.WorkspaceAsset;
import com.example.WaffleBear.workspace.asset.model.WorkspaceAssetType;
import org.springframework.web.multipart.MultipartFile;

import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

final class WorkspaceAssetRules {

    static final long MAX_IMAGE_SIZE = 5L * 1024 * 1024;
    static final long MAX_FILE_SIZE = 30L * 1024 * 1024;

    private static final Set<String> IMAGE_EXTENSIONS = Set.of(
            "jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", "heic", "avif", "apng", "jfif", "tif", "tiff"
    );

    private WorkspaceAssetRules() {
    }

    static String validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.FILE_EMPTY);
        }

        String originalName = sanitizeOriginalName(file.getOriginalFilename());
        if (originalName.length() > 255) {
            throw BaseException.from(BaseResponseStatus.FILE_NAME_LENGTH_WRONG);
        }

        return originalName;
    }

    static String sanitizeOriginalName(String originalName) {
        String normalized = originalName == null ? "" : originalName.trim().replace("\\", "/");
        int slashIndex = normalized.lastIndexOf('/');
        if (slashIndex >= 0) {
            normalized = normalized.substring(slashIndex + 1);
        }

        if (normalized.isBlank() || normalized.contains("\u0000")) {
            throw BaseException.from(BaseResponseStatus.FILE_NAME_WRONG);
        }

        return normalized;
    }

    static String extractExtension(String fileName) {
        String normalized = fileName == null ? "" : fileName;
        int lastDot = normalized.lastIndexOf('.');
        if (lastDot < 0 || lastDot >= normalized.length() - 1) {
            return "";
        }
        return normalized.substring(lastDot + 1).trim().toLowerCase(Locale.ROOT);
    }

    static String buildDriveStoredFileName(String extension) {
        String normalizedExtension = extension == null ? "" : extension.trim().toLowerCase(Locale.ROOT);
        return normalizedExtension.isBlank()
                ? UUID.randomUUID().toString()
                : UUID.randomUUID() + "." + normalizedExtension;
    }

    static String resolveContentType(String contentType) {
        String normalized = contentType == null ? "" : contentType.trim();
        return normalized.isBlank() ? "application/octet-stream" : normalized;
    }

    static WorkspaceAssetType resolveAssetType(String contentType, String extension) {
        if (contentType != null && contentType.toLowerCase(Locale.ROOT).startsWith("image/")) {
            return WorkspaceAssetType.IMAGE;
        }
        return IMAGE_EXTENSIONS.contains(extension) ? WorkspaceAssetType.IMAGE : WorkspaceAssetType.FILE;
    }

    static boolean isImageFile(String contentType, String extension) {
        if (contentType != null && contentType.toLowerCase(Locale.ROOT).startsWith("image/")) {
            return true;
        }

        return extension != null && IMAGE_EXTENSIONS.contains(extension.toLowerCase(Locale.ROOT));
    }

    static String resolveDriveFileFormat(WorkspaceAsset asset) {
        String originalName = asset == null ? null : asset.getOriginalName();
        String extension = extractExtension(originalName);
        if (!extension.isBlank()) {
            return extension;
        }

        String storedFileName = asset == null ? null : asset.getStoredFileName();
        extension = extractExtension(storedFileName);
        return extension.isBlank() ? "bin" : extension;
    }

    static List<String> normalizeObjectKeys(Collection<String> objectKeys) {
        return objectKeys == null
                ? List.of()
                : objectKeys.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .distinct()
                .toList();
    }

    static String sanitizeDownloadFileName(String preferredName, String fallbackName) {
        String candidate = hasText(preferredName) ? preferredName : fallbackName;
        if (!hasText(candidate)) {
            candidate = "file";
        }

        return candidate.replace("\r", "").replace("\n", "").trim();
    }

    private static boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
