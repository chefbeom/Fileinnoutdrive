package com.example.WaffleBear.storageshare.model;

import com.example.WaffleBear.storageshare.model.StorageShareEnums.GrantStatus;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.GrantType;
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
 * 한 사용자(granter)가 다른 사용자(recipient)에게 저장 용량을 빌려주는 내역.
 * 그룹 공유는 그룹원 1명당 1행으로 저장된다.
 * 공유자는 수신자의 사용량이나 파일에 접근할 수 없으며, 용량(할당량)만 이동한다.
 */
@Entity
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table(
        name = "storage_grant",
        indexes = {
                @Index(name = "idx_storage_grant_granter", columnList = "granter_idx"),
                @Index(name = "idx_storage_grant_recipient", columnList = "recipient_idx"),
                @Index(name = "idx_storage_grant_status_end", columnList = "status,end_at")
        }
)
public class StorageGrant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idx;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "granter_idx", nullable = false)
    private User granter;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recipient_idx", nullable = false)
    private User recipient;

    @Column(nullable = false)
    private Long bytes;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private GrantType grantType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private GrantStatus status;

    /** 공유 경로 표시용: user / email / group:그룹명 */
    @Column(length = 120)
    private String sourceLabel;

    @Column(name = "start_at", nullable = false)
    private LocalDateTime startAt;

    /** 정기 공유는 취소 전까지 null, 취소 시 취소일 + 1개월 */
    @Column(name = "end_at")
    private LocalDateTime endAt;

    private LocalDateTime cancelledAt;
    private LocalDateTime endedAt;
    private LocalDateTime createdAt;

    /** 마지막으로 보낸 만료 예고 알림 단계(일 수). 0이면 미발송 */
    private Integer notifiedDaysBefore;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
        if (status == null) {
            status = GrantStatus.ACTIVE;
        }
        if (notifiedDaysBefore == null) {
            notifiedDaysBefore = 0;
        }
    }

    public long safeBytes() {
        return bytes == null ? 0L : Math.max(0L, bytes);
    }

    /** 지금 이 순간 용량이 실제로 이동해 있는지 여부 */
    public boolean isEffectiveAt(LocalDateTime now) {
        if (status == GrantStatus.ENDED || now == null) {
            return false;
        }
        if (startAt != null && now.isBefore(startAt)) {
            return false;
        }
        return endAt == null || now.isBefore(endAt);
    }

    /** 아직 종료되지 않았는지(시작 전 예약 포함) */
    public boolean isOpenAt(LocalDateTime now) {
        if (status == GrantStatus.ENDED || now == null) {
            return false;
        }
        return endAt == null || now.isBefore(endAt);
    }

    public boolean isScheduledAt(LocalDateTime now) {
        return isOpenAt(now) && startAt != null && now.isBefore(startAt);
    }

    /** 취소: 취소일로부터 1개월 유예. 기간 대여는 원래 종료일을 넘기지 않는다. */
    public void cancel(LocalDateTime now) {
        LocalDateTime graceEnd = now.plusMonths(1);
        if (startAt != null && now.isBefore(startAt)) {
            // 시작 전 예약은 유예 없이 즉시 취소
            graceEnd = now;
        }
        if (endAt != null && endAt.isBefore(graceEnd)) {
            graceEnd = endAt;
        }
        this.endAt = graceEnd;
        this.cancelledAt = now;
        this.status = GrantStatus.CANCELLED;
        this.notifiedDaysBefore = 0;
    }

    public void markEnded(LocalDateTime now) {
        this.status = GrantStatus.ENDED;
        this.endedAt = now;
    }

    public void markNotified(int daysBefore) {
        this.notifiedDaysBefore = daysBefore;
    }
}
