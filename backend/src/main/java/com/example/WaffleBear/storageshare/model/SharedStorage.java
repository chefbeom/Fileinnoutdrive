package com.example.WaffleBear.storageshare.model;

import com.example.WaffleBear.storageshare.model.StorageShareEnums.SharedStorageStatus;
import com.example.WaffleBear.user.model.User;
import jakarta.persistence.Column;
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
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 여러 사용자가 각자 기여한 용량을 합쳐 함께 쓰는 논리적 공유 저장소(공유 폴더).
 */
@Entity
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "shared_storage")
public class SharedStorage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idx;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 500)
    private String description;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "creator_idx", nullable = false)
    private User creator;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SharedStorageStatus status;

    private LocalDateTime createdAt;
    private LocalDateTime trashedAt;
    private LocalDateTime purgeAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
        if (status == null) {
            status = SharedStorageStatus.ACTIVE;
        }
    }

    public boolean isActive() {
        return status == SharedStorageStatus.ACTIVE;
    }

    public void moveToTrash(LocalDateTime now, int retentionDays) {
        this.status = SharedStorageStatus.TRASHED;
        this.trashedAt = now;
        this.purgeAt = now.plusDays(retentionDays);
    }

    public void restore() {
        this.status = SharedStorageStatus.ACTIVE;
        this.trashedAt = null;
        this.purgeAt = null;
    }

    public void changeCreator(User creator) {
        this.creator = creator;
    }

    public void rename(String name) {
        if (name != null && !name.isBlank()) {
            this.name = name.trim();
        }
    }
}
