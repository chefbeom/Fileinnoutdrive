package com.example.WaffleBear.file.sharelink.model;

import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.user.model.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Tokenized download share link backing configurable expiry and download-count enforcement
 * before vending a short-lived MinIO presigned download URL.
 */
@Entity
@Table(
        name = "file_download_share_link",
        indexes = {
                @Index(name = "idx_file_download_share_link_file_owner", columnList = "file_idx, owner_idx, created_at"),
                @Index(name = "idx_file_download_share_link_owner_created", columnList = "owner_idx, created_at")
        }
)
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FileDownloadShareLink {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idx;

    @Column(nullable = false, unique = true, length = 96)
    private String token;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "file_idx", nullable = false)
    private FileInfo file;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_idx", nullable = false)
    private User owner;

    private Integer durationMinutes;

    @Column(nullable = false)
    private LocalDateTime expiresAt;

    private Integer maxDownloads;

    @Column(nullable = false)
    private int downloadCount;

    @Column(length = 255)
    private String passwordHash;

    @Column(nullable = false)
    private boolean revoked;

    private LocalDateTime revokedAt;

    private LocalDateTime lastDownloadedAt;

    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now();
        }
        if (this.downloadCount < 0) {
            this.downloadCount = 0;
        }
    }

    public boolean isPasswordProtected() {
        return this.passwordHash != null && !this.passwordHash.isBlank();
    }

    public boolean isExpired(LocalDateTime now) {
        return this.expiresAt != null && !this.expiresAt.isAfter(now);
    }

    public boolean isDownloadLimitReached() {
        return this.maxDownloads != null && this.downloadCount >= this.maxDownloads;
    }

    public Integer getRemainingDownloads() {
        if (this.maxDownloads == null) {
            return null;
        }
        return Math.max(0, this.maxDownloads - this.downloadCount);
    }

    public void revoke(LocalDateTime now) {
        this.revoked = true;
        this.revokedAt = now;
    }

    public void recordDownload(LocalDateTime now) {
        this.downloadCount += 1;
        this.lastDownloadedAt = now;
    }
}
