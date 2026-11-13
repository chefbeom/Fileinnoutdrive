package com.example.WaffleBear.storageshare.model;

import com.example.WaffleBear.storageshare.model.StorageShareEnums.MemberRole;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.MemberStatus;
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
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 공유 저장소 참여자. ACTIVE 상태의 contributionBytes 만큼 개인 할당량에서 차감되고,
 * 저장소 전체 용량은 ACTIVE 참여자 기여분의 합이다.
 */
@Entity
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table(
        name = "shared_storage_member",
        uniqueConstraints = @UniqueConstraint(name = "uk_shared_storage_member", columnNames = {"storage_idx", "user_idx"}),
        indexes = @Index(name = "idx_shared_storage_member_user", columnList = "user_idx")
)
public class SharedStorageMember {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idx;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "storage_idx", nullable = false)
    private SharedStorage storage;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_idx", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MemberRole role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MemberStatus status;

    @Column(nullable = false)
    private Long contributionBytes;

    /** 초대 시 제안된 기여 용량 */
    private Long proposedContributionBytes;

    private Long invitedByIdx;
    private LocalDateTime createdAt;
    private LocalDateTime joinedAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
        if (contributionBytes == null) {
            contributionBytes = 0L;
        }
    }

    public long safeContributionBytes() {
        return contributionBytes == null ? 0L : Math.max(0L, contributionBytes);
    }

    public boolean isActive() {
        return status == MemberStatus.ACTIVE;
    }

    public void accept(long contributionBytes, LocalDateTime now) {
        this.status = MemberStatus.ACTIVE;
        this.contributionBytes = Math.max(0L, contributionBytes);
        this.joinedAt = now;
    }

    public void decline() {
        this.status = MemberStatus.DECLINED;
        this.contributionBytes = 0L;
    }

    public void reinvite(Long invitedByIdx, long proposedContributionBytes) {
        this.status = MemberStatus.INVITED;
        this.invitedByIdx = invitedByIdx;
        this.proposedContributionBytes = Math.max(0L, proposedContributionBytes);
        this.contributionBytes = 0L;
        this.joinedAt = null;
    }

    public void changeContribution(long contributionBytes) {
        this.contributionBytes = Math.max(0L, contributionBytes);
    }

    public void changeRole(MemberRole role) {
        this.role = role;
    }
}
