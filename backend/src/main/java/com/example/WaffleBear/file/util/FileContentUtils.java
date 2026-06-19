package com.example.WaffleBear.file.util;

import java.net.URLConnection;
import java.util.Locale;
import java.util.Set;

public final class FileContentUtils {

    private static final String THUMBNAIL_DIRECTORY_NAME = "thumbnails";

    private FileContentUtils() {
    }

    public static String buildThumbnailObjectKey(String objectKey) {
        int pathSeparatorIndex = objectKey.lastIndexOf('/');
        String directory = pathSeparatorIndex >= 0 ? objectKey.substring(0, pathSeparatorIndex + 1) : "";
        String fileName = pathSeparatorIndex >= 0 ? objectKey.substring(pathSeparatorIndex + 1) : objectKey;
        int extensionIndex = fileName.lastIndexOf('.');
        String baseName = extensionIndex >= 0 ? fileName.substring(0, extensionIndex) : fileName;

        return directory + THUMBNAIL_DIRECTORY_NAME + "/" + baseName + ".jpg";
    }

    public static String categorizeExtension(String fileFormat) {
        String extension = normalizeExtension(fileFormat);

        if (Set.of("pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv", "hwp").contains(extension)) {
            return "document";
        }

        if (Set.of("jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", "heic").contains(extension)) {
            return "image";
        }

        if (Set.of("mp4", "mov", "avi", "mkv", "wmv", "webm").contains(extension)) {
            return "video";
        }

        if (Set.of("zip", "rar", "7z", "tar", "gz").contains(extension)) {
            return "archive";
        }

        if (Set.of("mp3", "wav", "aac", "flac", "ogg", "m4a").contains(extension)) {
            return "audio";
        }

        return "other";
    }

    public static boolean isVideoFile(String fileFormat) {
        return Set.of("mp4", "mov", "avi", "mkv", "wmv", "webm", "m4v", "mpeg", "mpg", "ogv", "3gp")
                .contains(normalizeExtension(fileFormat));
    }

    public static boolean isTextPreviewable(String fileFormat) {
        return Set.of(
                "txt", "md", "csv", "log", "json", "xml", "html", "htm",
                "css", "js", "ts", "java", "py", "sql", "yml", "yaml",
                "properties", "sh", "bat"
        ).contains(normalizeExtension(fileFormat));
    }

    public static String resolveTextContentType(String fileFormat) {
        String extension = normalizeExtension(fileFormat);

        if ("json".equals(extension)) {
            return "application/json";
        }
        if (Set.of("html", "htm").contains(extension)) {
            return "text/html";
        }
        if ("xml".equals(extension)) {
            return "application/xml";
        }
        if ("csv".equals(extension)) {
            return "text/csv";
        }

        return "text/plain";
    }

    public static String resolveDownloadContentType(String fileName) {
        String contentType = URLConnection.guessContentTypeFromName(fileName == null ? "" : fileName);
        return (contentType == null || contentType.isBlank()) ? "application/octet-stream" : contentType;
    }

    public static String sanitizeDownloadFileName(String preferredName, String fallbackName) {
        String candidate = preferredName;
        if (candidate == null || candidate.isBlank()) {
            candidate = fallbackName;
        }
        if (candidate == null || candidate.isBlank()) {
            candidate = "file";
        }

        return candidate
                .replace("\r", "")
                .replace("\n", "")
                .trim();
    }

    private static String normalizeExtension(String fileFormat) {
        return fileFormat == null ? "" : fileFormat.trim().toLowerCase(Locale.ROOT);
    }
}
