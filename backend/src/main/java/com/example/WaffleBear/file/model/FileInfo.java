package com.example.WaffleBear.file.model;

import com.example.WaffleBear.user.model.User;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(indexes = {
        @Index(name = "idx_file_info_user_parent_trashed", columnList = "user_idx, parent_idx, trashed"),
        @Index(name = "idx_file_info_user_space_trashed", columnList = "user_idx, space_type, trashed")
})
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FileInfo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idx;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_idx")
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_idx")
    private FileInfo parent;

    @Enumerated(EnumType.STRING)
    private FileNodeType nodeType;

    @Enumerated(EnumType.STRING)
    private FileSpaceType spaceType;

    private Boolean hiddenFolder;
    private Boolean folderPinEnabled;
    private String folderPinHash;

    @Column(nullable = false)
    private String fileOriginName;
    @Column(nullable = false)
    private String fileFormat;
    @Column(nullable = false)
    private String fileSaveName;

    private String fileSavePath;

    private Long fileSize;

    private boolean lockedFile;
    private boolean sharedFile;
    private Boolean trashed;
    private LocalDateTime deletedAt;

    private LocalDateTime uploadDate;
    private LocalDateTime lastModifyDate;

    @PrePersist
    public void prePersist() {
        if (this.nodeType == null) {
            this.nodeType = FileNodeType.FILE;
        }
        if (this.spaceType == null) {
            this.spaceType = (this.parent != null && this.parent.isVaultSpace())
                    ? FileSpaceType.VAULT
                    : FileSpaceType.DRIVE;
        }
        if (this.hiddenFolder == null) {
            this.hiddenFolder = false;
        }
        if (this.folderPinEnabled == null) {
            this.folderPinEnabled = false;
        }
        if (this.trashed == null) {
            this.trashed = false;
        }
        this.uploadDate = LocalDateTime.now();
        this.lastModifyDate = LocalDateTime.now();
    }

    @PreUpdate
    public void preUpdate() {
        this.lastModifyDate = LocalDateTime.now();
    }

    public void markTrashed(LocalDateTime deletedAt) {
        this.trashed = true;
        this.deletedAt = deletedAt;
    }

    public void restore() {
        this.trashed = false;
        this.deletedAt = null;
    }

    public boolean isTrashed() {
        return Boolean.TRUE.equals(this.trashed);
    }

    public FileSpaceType resolveSpaceType() {
        return this.spaceType == null ? FileSpaceType.DRIVE : this.spaceType;
    }

    public boolean isVaultSpace() {
        return resolveSpaceType() == FileSpaceType.VAULT;
    }

    public boolean isHiddenFolder() {
        return Boolean.TRUE.equals(this.hiddenFolder);
    }

    public boolean isFolderPinEnabled() {
        return Boolean.TRUE.equals(this.folderPinEnabled);
    }

    public boolean hasFolderPin() {
        return this.folderPinHash != null && !this.folderPinHash.isBlank();
    }

    public void changeSpaceType(FileSpaceType spaceType) {
        this.spaceType = spaceType == null ? FileSpaceType.DRIVE : spaceType;
    }

    public void updateHiddenSettings(Boolean hidden, Boolean pinEnabled, String pinHash) {
        if (hidden != null) {
            this.hiddenFolder = hidden;
        }
        if (pinEnabled != null) {
            this.folderPinEnabled = pinEnabled;
        }
        if (Boolean.FALSE.equals(this.hiddenFolder) || Boolean.FALSE.equals(this.folderPinEnabled)) {
            this.folderPinEnabled = false;
            this.folderPinHash = null;
        } else if (pinHash != null) {
            this.folderPinHash = pinHash;
        }
    }

    public void changeParent(FileInfo parent) {
        this.parent = parent;
    }

    public void rename(String fileOriginName) {
        this.fileOriginName = fileOriginName;
    }

    public void replaceContent(
            String fileOriginName,
            String fileFormat,
            String fileSaveName,
            String fileSavePath,
            Long fileSize,
            FileInfo parent
    ) {
        this.fileOriginName = fileOriginName;
        this.fileFormat = fileFormat;
        this.fileSaveName = fileSaveName;
        this.fileSavePath = fileSavePath;
        this.fileSize = fileSize;
        this.parent = parent;
        this.nodeType = FileNodeType.FILE;
        if (parent != null) {
            this.spaceType = parent.resolveSpaceType();
        }
        this.trashed = false;
        this.deletedAt = null;
    }

    public void changeLockedFile(boolean lockedFile) {
        this.lockedFile = lockedFile;
    }

    public void changeSharedFile(boolean sharedFile) {
        this.sharedFile = sharedFile;
    }
}
