package com.example.WaffleBear.storageshare.model;

import com.example.WaffleBear.storageshare.model.StorageShareEnums.ApprovalStatus;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.ApprovalType;
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
 * 공유 저장소 삭제 / 다른 사람이 올린 항목 삭제 / 참여자 제외(탈퇴)에 대한 전원 승인 요청.
 */
@Entity
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "shared_storage_approval")
public class SharedStorageApproval {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idx;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "storage_idx", nullable = false)
    private SharedStorage storage;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ApprovalType approvalType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ApprovalStatus status;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requester_idx")
    private User requester;

    /** DELETE_NODE 대상 */
    private Long targetNodeIdx;

    @Column(length = 255)
    private String targetLabel;

    /** REMOVE_MEMBER 대상 */
    private Long targetUserIdx;

    @Column(length = 500)
    private String reason;

    @Column(length = 500)
    private String resultMessage;

    private LocalDateTime createdAt;
    private LocalDateTime expiresAt;
    private LocalDateTime resolvedAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
        if (status == null) {
            status = ApprovalStatus.PENDING;
        }
    }

    public boolean isPending() {
        return status == ApprovalStatus.PENDING;
    }

    public void resolve(ApprovalStatus status, String resultMessage, LocalDateTime now) {
        this.status = status;
        this.resultMessage = resultMessage;
        this.resolvedAt = now;
    }

    public void clearRequester() {
        this.requester = null;
    }
}
