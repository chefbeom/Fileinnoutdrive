package com.example.WaffleBear.file.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

final class FileListQueryRules {

    record ParsedSearchKeyword(String textTerm, List<String> inlineExtensions) {
    }

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

    static String normalizeSearchScope(String value) {
        String normalized = normalizeFilterValue(value, "current");
        return switch (normalized) {
            case "subtree", "sub", "recursive" -> "subtree";
            case "root", "all" -> "root";
            default -> "current";
        };
    }

    static String normalizeExtensionToken(String rawToken) {
        if (rawToken == null) {
            return "";
        }
        String normalized = rawToken.trim().toLowerCase(Locale.ROOT);
        while (!normalized.isEmpty() && (normalized.charAt(0) == '*' || normalized.charAt(0) == '.')) {
            normalized = normalized.substring(1).trim();
        }
        if (normalized.isEmpty() || "all".equals(normalized) || "*".equals(normalized)) {
            return "";
        }
        return normalized;
    }

    static List<String> parseExtensionFilters(String rawFilter) {
        if (rawFilter == null || rawFilter.isBlank()) {
            return List.of();
        }
        String trimmed = rawFilter.trim();
        if ("all".equalsIgnoreCase(trimmed)) {
            return List.of();
        }

        Set<String> tokens = new LinkedHashSet<>();
        for (String part : trimmed.split("[,;\\s]+")) {
            String normalized = normalizeExtensionToken(part);
            if (!normalized.isEmpty()) {
                tokens.add(normalized);
            }
        }
        return tokens.isEmpty() ? List.of() : List.copyOf(tokens);
    }

    static ParsedSearchKeyword parseSearchKeyword(String rawQuery) {
        String normalized = normalizeSearchKeyword(rawQuery);
        if (normalized.isEmpty()) {
            return new ParsedSearchKeyword("", List.of());
        }

        List<String> textTokens = new ArrayList<>();
        Set<String> inlineExtensions = new LinkedHashSet<>();
        for (String token : normalized.split("\\s+")) {
            if (token.startsWith("ext:") && token.length() > 4) {
                inlineExtensions.addAll(parseExtensionFilters(token.substring(4)));
                continue;
            }
            if ((token.startsWith("*.") && token.length() > 2) || (token.startsWith(".") && token.length() > 1)) {
                String parsedExt = normalizeExtensionToken(token);
                if (!parsedExt.isEmpty()) {
                    inlineExtensions.add(parsedExt);
                    continue;
                }
            }
            textTokens.add(token);
        }

        return new ParsedSearchKeyword(
                String.join(" ", textTokens),
                inlineExtensions.isEmpty() ? List.of() : List.copyOf(inlineExtensions)
        );
    }

    static String escapeLikePattern(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        return value
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
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
