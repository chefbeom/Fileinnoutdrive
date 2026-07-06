package com.example.WaffleBear.file.share.model;

import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.user.model.User;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FileShare {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idx;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "file_idx", nullable = false)
    private FileInfo file;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_idx", nullable = false)
    private User owner;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recipient_idx", nullable = false)
    private User recipient;

    @Enumerated(EnumType.STRING)
    private FileSharePermission permission;

    @Enumerated(EnumType.STRING)
    private FileShareStatus status;

    private LocalDateTime createdAt;
    private LocalDateTime respondedAt;
    private LocalDateTime expiresAt;
    private Integer downloadLimit;
    private int downloadCount;
    private String passwordHash;

    @PrePersist
    public void prePersist() {
        if (permission == null) {
            permission = FileSharePermission.READ;
        }
        if (status == null) {
            status = FileShareStatus.PENDING;
        }
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    public FileSharePermission getEffectivePermission() {
        return permission == null ? FileSharePermission.READ : permission;
    }

    public void changePermission(FileSharePermission permission) {
        this.permission = permission == null ? FileSharePermission.READ : permission;
    }

    public boolean changePolicy(LocalDateTime expiresAt, Integer downloadLimit) {
        Integer normalizedDownloadLimit = normalizeDownloadLimit(downloadLimit);
        boolean changed = !Objects.equals(this.expiresAt, expiresAt)
                || !Objects.equals(this.downloadLimit, normalizedDownloadLimit);
        boolean downloadLimitChanged = !Objects.equals(this.downloadLimit, normalizedDownloadLimit);
        this.expiresAt = expiresAt;
        this.downloadLimit = normalizedDownloadLimit;
        if (downloadLimitChanged) {
            this.downloadCount = 0;
        }
        return changed;
    }

    public boolean changePasswordHash(String passwordHash) {
        boolean changed = !Objects.equals(this.passwordHash, passwordHash);
        this.passwordHash = passwordHash;
        return changed;
    }

    public boolean isPasswordProtected() {
        return passwordHash != null && !passwordHash.isBlank();
    }
    public FileShareStatus getEffectiveStatus() {
        return status == null ? FileShareStatus.ACCEPTED : status;
    }

    public boolean isExpired(LocalDateTime now) {
        return expiresAt != null && now != null && !expiresAt.isAfter(now);
    }

    public boolean isDownloadLimitReached() {
        return downloadLimit != null && downloadLimit > 0 && downloadCount >= downloadLimit;
    }

    public boolean isDownloadAvailable(LocalDateTime now) {
        return !isExpired(now) && !isDownloadLimitReached();
    }

    public boolean recordDownloadAccess() {
        if (downloadLimit == null || downloadLimit <= 0) {
            return false;
        }
        downloadCount += 1;
        return true;
    }

    public void markPending() {
        this.status = FileShareStatus.PENDING;
        this.respondedAt = null;
    }

    public void accept() {
        this.status = FileShareStatus.ACCEPTED;
        this.respondedAt = LocalDateTime.now();
    }

    public void reject() {
        this.status = FileShareStatus.REJECTED;
        this.respondedAt = LocalDateTime.now();
    }

    public void changeStatus(FileShareStatus status) {
        this.status = status == null ? FileShareStatus.PENDING : status;
        this.respondedAt = this.status == FileShareStatus.PENDING ? null : LocalDateTime.now();
    }

    private Integer normalizeDownloadLimit(Integer downloadLimit) {
        return downloadLimit != null && downloadLimit > 0 ? downloadLimit : null;
    }
}