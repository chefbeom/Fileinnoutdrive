package com.example.WaffleBear.file.share.model;

import java.util.Locale;

public enum FileShareStatus {
    PENDING,
    ACCEPTED,
    REJECTED;

    public static FileShareStatus from(String rawStatus) {
        if (rawStatus == null || rawStatus.isBlank()) {
            return PENDING;
        }

        try {
            return FileShareStatus.valueOf(rawStatus.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ignored) {
            return PENDING;
        }
    }

    public boolean isAccepted() {
        return this == ACCEPTED;
    }
}
