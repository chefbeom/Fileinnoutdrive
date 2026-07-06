package com.example.WaffleBear.file.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;

import java.util.Locale;

final class FileListQueryRules {

    private FileListQueryRules() {
    }

    static String sanitizeFolderName(String folderName) {
        String normalized = folderName == null ? "" : folderName.trim();
        if (normalized.isEmpty() || normalized.length() > 100) {
            throw BaseException.from(BaseResponseStatus.FILE_NAME_WRONG);
        }

        if (normalized.contains("..") || normalized.contains("/") || normalized.contains("\\") || normalized.contains("\u0000")) {
            throw BaseException.from(BaseResponseStatus.FILE_NAME_WRONG);
        }

        return normalized;
    }

    static int sanitizePage(Integer page) {
        if (page == null || page < 0) {
            return 0;
        }
        return page;
    }

    static int sanitizePageSize(Integer size) {
        if (size == null || size <= 0) {
            return 10;
        }
        return Math.min(30, size);
    }

    static String normalizeSearchKeyword(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    static String normalizeFilterValue(String value, String fallback) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        return normalized.isEmpty() ? fallback : normalized;
    }

    static long megabytesToBytes(long megabytes) {
        return megabytes * 1024L * 1024L;
    }

    static Long parseMegabytesToBytes(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        try {
            double megabytes = Double.parseDouble(value.trim());
            if (!Double.isFinite(megabytes) || megabytes < 0) {
                return null;
            }
            return Math.round(megabytes * 1024D * 1024D);
        } catch (NumberFormatException exception) {
            return null;
        }
    }
}
