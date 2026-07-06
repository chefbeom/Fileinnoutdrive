package com.example.WaffleBear.file.upload;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;

import java.util.Collection;
import java.util.List;
import java.util.Objects;

final class UploadObjectRules {

    private UploadObjectRules() {
    }

    static String normalizeOriginName(String originName) {
        String normalized = originName == null ? "" : originName.trim();
        if (normalized.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.FILE_NAME_WRONG);
        }
        return normalized;
    }

    static String normalizeFormat(String rawFormat, String originName) {
        String format = rawFormat;
        String safeOriginName = originName == null ? "" : originName;
        if (format == null || format.isBlank()) {
            int idx = safeOriginName.lastIndexOf('.');
            if (idx <= 0 || idx >= safeOriginName.length() - 1) {
                throw BaseException.from(BaseResponseStatus.FILE_FORMAT_NOTHING);
            }
            format = safeOriginName.substring(idx + 1);
        }

        format = format.trim();
        if (format.startsWith(".")) {
            format = format.substring(1);
        }

        if (format.isEmpty() || format.length() > 20 || !format.matches("^[A-Za-z0-9]+$")) {
            throw BaseException.from(BaseResponseStatus.FILE_FORMAT_WRONG);
        }

        return format.toLowerCase();
    }

    static String normalizeOwnedObjectKey(Long userIdx, String objectKey) {
        String normalized = objectKey == null ? "" : objectKey.trim();
        if (normalized.isEmpty() || !normalized.startsWith(userIdx + "/")) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        return normalized;
    }

    static List<String> normalizeOwnedObjectKeys(Long userIdx, List<String> objectKeys) {
        if (objectKeys == null) {
            return List.of();
        }

        return objectKeys.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .map(value -> normalizeOwnedObjectKey(userIdx, value))
                .distinct()
                .toList();
    }

    static List<String> normalizeDeleteObjectKeys(Collection<String> objectKeys) {
        if (objectKeys == null || objectKeys.isEmpty()) {
            return List.of();
        }

        return objectKeys.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(key -> !key.isBlank())
                .distinct()
                .toList();
    }

    static String extractFileSaveName(String finalObjectKey) {
        int separatorIndex = finalObjectKey.lastIndexOf('/');
        if (separatorIndex < 0 || separatorIndex >= finalObjectKey.length() - 1) {
            return finalObjectKey;
        }
        return finalObjectKey.substring(separatorIndex + 1);
    }
}
