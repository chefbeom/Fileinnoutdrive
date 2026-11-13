package com.example.WaffleBear.storageshare.model;

import com.example.WaffleBear.storageshare.model.StorageShareEnums.NodeType;
import com.example.WaffleBear.user.model.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
 * 공유 저장소 안의 파일/폴더. 개인 드라이브(FileInfo)와 분리되어 개인 사용량에 포함되지 않는다.
 */
@Entity
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table(
        name = "shared_storage_node",
        indexes = {
                @Index(name = "idx_shared_storage_node_storage_parent", columnList = "storage_idx,parent_idx"),
                @Index(name = "idx_shared_storage_node_uploader", columnList = "uploader_idx")
        }
)
public class SharedStorageNode {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idx;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "storage_idx", nullable = false)
    private SharedStorage storage;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_idx")
    private SharedStorageNode parent;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private NodeType nodeType;

    @Column(nullable = false, length = 255)
    private String name;

    @Column(length = 20)
    private String fileFormat;

    @Column(length = 512)
    private String objectKey;

    private Long fileSize;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "uploader_idx")
    private User uploader;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    public boolean isFolder() {
        return nodeType == NodeType.FOLDER;
    }

    public long safeFileSize() {
        return fileSize == null ? 0L : Math.max(0L, fileSize);
    }

    public void clearUploader() {
        this.uploader = null;
    }
}
