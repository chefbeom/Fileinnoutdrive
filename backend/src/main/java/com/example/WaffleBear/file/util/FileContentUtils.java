package com.example.WaffleBear.file.util;

import java.net.URLConnection;
import java.util.Locale;
import java.util.Set;

public final class FileContentUtils {

    private static final String THUMBNAIL_DIRECTORY_NAME = "thumbnails";
    private static final Set<String> ACTIVE_WEB_EXTENSIONS = Set.of(
            "html", "htm", "xhtml", "svg", "svgz", "xml", "js", "mjs", "swf", "mhtml", "mht"
    );
    private static final Set<String> ACTIVE_WEB_CONTENT_TYPES = Set.of(
            "text/html",
            "application/xhtml+xml",
            "image/svg+xml",
            "text/xml",
            "application/xml",
            "text/javascript",
            "application/javascript",
            "application/x-javascript",
            "application/x-shockwave-flash"
    );

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

    public static boolean isActiveWebFile(String fileNameOrFormat) {
        if (fileNameOrFormat == null || fileNameOrFormat.isBlank()) {
            return false;
        }
        String candidate = fileNameOrFormat.trim().toLowerCase(Locale.ROOT);
        int slashIndex = Math.max(candidate.lastIndexOf('/'), candidate.lastIndexOf('\\'));
        if (slashIndex >= 0 && slashIndex < candidate.length() - 1) {
            candidate = candidate.substring(slashIndex + 1);
        }
        int dotIndex = candidate.lastIndexOf('.');
        String extension = dotIndex >= 0 && dotIndex < candidate.length() - 1
                ? candidate.substring(dotIndex + 1)
                : candidate;
        return ACTIVE_WEB_EXTENSIONS.contains(extension);
    }

    public static boolean isActiveWebContentType(String contentType) {
        if (contentType == null || contentType.isBlank()) {
            return false;
        }
        String baseType = contentType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        return ACTIVE_WEB_CONTENT_TYPES.contains(baseType);
    }

    public static String resolveDownloadContentType(String fileName) {
        if (isActiveWebFile(fileName)) {
            return "application/octet-stream";
        }
        String contentType = URLConnection.guessContentTypeFromName(fileName == null ? "" : fileName);
        if (contentType == null || contentType.isBlank() || isActiveWebContentType(contentType)) {
            return "application/octet-stream";
        }
        return contentType;
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
