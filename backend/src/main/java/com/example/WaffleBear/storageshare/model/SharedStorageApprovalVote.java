package com.example.WaffleBear.storageshare.model;

import com.example.WaffleBear.user.model.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
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

@Entity
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table(
        name = "shared_storage_approval_vote",
        uniqueConstraints = @UniqueConstraint(name = "uk_shared_storage_vote", columnNames = {"approval_idx", "voter_idx"})
)
public class SharedStorageApprovalVote {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idx;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "approval_idx", nullable = false)
    private SharedStorageApproval approval;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "voter_idx", nullable = false)
    private User voter;

    @Column(nullable = false)
    private boolean approved;

    private LocalDateTime votedAt;

    @PrePersist
    public void prePersist() {
        if (votedAt == null) {
            votedAt = LocalDateTime.now();
        }
    }
}
