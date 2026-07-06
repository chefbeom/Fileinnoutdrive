package com.example.WaffleBear.file.share;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.share.model.FileSharePermission;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

final class SharePolicyRules {

    private SharePolicyRules() {
    }

    record SharePolicy(LocalDateTime expiresAt, Integer downloadLimit, String passwordHash) {
        static SharePolicy empty() {
            return new SharePolicy(null, null, null);
        }
    }

    static FileSharePermission resolvePermission(String permission, List<String> permissions) {
        if (permissions == null || permissions.isEmpty()) {
            return FileSharePermission.from(permission);
        }

        Set<FileSharePermission> normalized = permissions.stream()
                .filter(Objects::nonNull)
                .map(FileSharePermission::from)
                .collect(Collectors.toSet());

        if (normalized.contains(FileSharePermission.WRITE)) {
            return FileSharePermission.WRITE;
        }
        if (normalized.contains(FileSharePermission.UPLOAD) && normalized.contains(FileSharePermission.DOWNLOAD)) {
            return FileSharePermission.WRITE;
        }
        if (normalized.contains(FileSharePermission.UPLOAD)) {
            return FileSharePermission.UPLOAD;
        }
        if (normalized.contains(FileSharePermission.DOWNLOAD)) {
            return FileSharePermission.DOWNLOAD;
        }
        return FileSharePermission.READ;
    }

    static SharePolicy resolveSharePolicy(
            LocalDateTime expiresAt,
            Integer downloadLimit,
            String sharePassword,
            PasswordEncoder passwordEncoder
    ) {
        if (expiresAt != null && !expiresAt.isAfter(LocalDateTime.now())) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        if (downloadLimit != null && downloadLimit <= 0) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        return new SharePolicy(expiresAt, downloadLimit, encodeSharePassword(sharePassword, passwordEncoder));
    }

    static void ensureSharePasswordSatisfied(
            FileShare share,
            String sharePassword,
            PasswordEncoder passwordEncoder
    ) {
        if (share == null || !share.isPasswordProtected()) {
            return;
        }
        String normalized = sharePassword == null ? "" : sharePassword.trim();
        if (normalized.isBlank() || !passwordEncoder.matches(normalized, share.getPasswordHash())) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    static void ensureSharePolicyActive(FileShare share) {
        if (share == null || share.isExpired(LocalDateTime.now())) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    static void ensureShareDownloadAvailable(FileShare share) {
        ensureSharePolicyActive(share);
        if (share.isDownloadLimitReached()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    static boolean requiresTrackedSharedDownload(FileShare share) {
        return share != null && (share.getExpiresAt() != null || share.getDownloadLimit() != null || share.isPasswordProtected());
    }

    private static String encodeSharePassword(String sharePassword, PasswordEncoder passwordEncoder) {
        if (sharePassword == null || sharePassword.isBlank()) {
            return null;
        }
        String normalized = sharePassword.trim();
        if (normalized.length() > 128) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        return passwordEncoder.encode(normalized);
    }
}
