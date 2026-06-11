package com.example.WaffleBear.file.share.model;

import java.util.Locale;

public enum FileSharePermission {
    READ,
    DOWNLOAD,
    UPLOAD,
    WRITE;

    public static FileSharePermission from(String rawPermission) {
        if (rawPermission == null || rawPermission.isBlank()) {
            return READ;
        }

        try {
            return FileSharePermission.valueOf(rawPermission.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ignored) {
            return READ;
        }
    }

    public boolean canWrite() {
        return this == WRITE;
    }

    public boolean canRead() {
        return true;
    }

    public boolean canDownload() {
        return this == DOWNLOAD || this == WRITE;
    }

    public boolean canUpload() {
        return this == UPLOAD || this == WRITE;
    }
}
