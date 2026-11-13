package com.example.WaffleBear.file.sharelink.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

public class DownloadShareLinkDto {

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CreateReq {
        private Integer expiresInMinutes;
        private LocalDateTime expiresAt;
        private Integer maxDownloads;
        private String password;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DownloadUrlReq {
        private String password;
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LinkRes {
        private Long idx;
        private String token;
        private Long fileIdx;
        private String fileName;
        private String fileFormat;
        private Long fileSize;
        private Integer durationMinutes;
        private LocalDateTime createdAt;
        private LocalDateTime expiresAt;
        private long remainingSeconds;
        private Integer maxDownloads;
        private int downloadCount;
        private Integer remainingDownloads;
        private boolean passwordProtected;
        private boolean revoked;
        private LocalDateTime revokedAt;
        private LocalDateTime lastDownloadedAt;
        private String status;
        private String sharePath;
        private String directDownloadPath;
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PublicMetaRes {
        private String token;
        private String fileName;
        private String fileFormat;
        private Long fileSize;
        private String ownerName;
        private Integer durationMinutes;
        private LocalDateTime createdAt;
        private LocalDateTime expiresAt;
        private long remainingSeconds;
        private Integer maxDownloads;
        private int downloadCount;
        private Integer remainingDownloads;
        private boolean passwordProtected;
        private boolean downloadable;
        private String status;
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PublicDownloadUrlRes {
        private String presignedUrl;
        private String fileName;
        private String fileFormat;
        private Long fileSize;
        private String contentType;
        private LocalDateTime linkExpiresAt;
        private long urlExpiresInSeconds;
        private Integer maxDownloads;
        private int downloadCount;
        private Integer remainingDownloads;
        private String status;
    }
}
