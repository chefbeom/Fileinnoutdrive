package com.example.WaffleBear.file.share;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

final class ShareUploadPathRules {

    private ShareUploadPathRules() {
    }

    static List<String> extractFolderSegments(String relativePath, String fileOriginName) {
        String normalized = relativePath == null || relativePath.isBlank()
                ? fileOriginName
                : relativePath.trim().replace("\\", "/");
        String[] segments = normalized.split("/");
        if (segments.length <= 1) {
            return List.of();
        }

        List<String> folderSegments = new ArrayList<>();
        for (int index = 0; index < segments.length - 1; index += 1) {
            String folderName = sanitizeFolderName(segments[index]);
            if (!folderName.isBlank()) {
                folderSegments.add(folderName);
            }
        }
        return folderSegments;
    }

    static void validateMultipartFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.FILE_EMPTY);
        }
        sanitizeUploadFileName(file.getOriginalFilename());
    }

    static String sanitizeUploadFileName(String fileName) {
        String normalized = fileName == null ? "" : fileName.trim();
        if (normalized.isEmpty() || normalized.length() > 100) {
            throw BaseException.from(BaseResponseStatus.FILE_NAME_WRONG);
        }
        if (normalized.contains("..") || normalized.contains("/") || normalized.contains("\\") || normalized.contains("\u0000")) {
            throw BaseException.from(BaseResponseStatus.FILE_NAME_WRONG);
        }
        return normalized;
    }

    static String resolveFileFormat(String fileName) {
        int extensionIndex = fileName == null ? -1 : fileName.lastIndexOf('.');
        if (extensionIndex <= 0 || extensionIndex >= fileName.length() - 1) {
            throw BaseException.from(BaseResponseStatus.FILE_FORMAT_NOTHING);
        }
        String fileFormat = fileName.substring(extensionIndex + 1).trim().toLowerCase(Locale.ROOT);
        if (fileFormat.isBlank() || fileFormat.length() > 20 || !fileFormat.matches("^[a-z0-9]+$")) {
            throw BaseException.from(BaseResponseStatus.FILE_FORMAT_WRONG);
        }
        return fileFormat;
    }

    static String extractFileSaveName(String finalObjectKey) {
        int separatorIndex = finalObjectKey.lastIndexOf('/');
        if (separatorIndex < 0 || separatorIndex >= finalObjectKey.length() - 1) {
            return finalObjectKey;
        }
        return finalObjectKey.substring(separatorIndex + 1);
    }

    private static String sanitizeFolderName(String folderName) {
        String normalized = folderName == null ? "" : folderName.trim();
        if (normalized.isEmpty() || normalized.length() > 100) {
            throw BaseException.from(BaseResponseStatus.FILE_NAME_WRONG);
        }
        if (normalized.contains("..") || normalized.contains("/") || normalized.contains("\\") || normalized.contains("\u0000")) {
            throw BaseException.from(BaseResponseStatus.FILE_NAME_WRONG);
        }
        return normalized;
    }
}
