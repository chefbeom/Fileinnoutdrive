package com.example.WaffleBear.workspace.preference;

import com.example.WaffleBear.user.model.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Table(
        name = "workspace_preference",
        uniqueConstraints = @UniqueConstraint(name = "uk_workspace_preference_user", columnNames = "user_idx")
)
public class WorkspacePreference {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "workspace_preference_idx")
    private Long idx;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_idx", nullable = false, unique = true)
    private User user;

    @Column(columnDefinition = "LONGTEXT", nullable = false)
    private String favoriteWorkspaceIds;

    @Column(columnDefinition = "LONGTEXT", nullable = false)
    private String recentWorkspaceIds;

    @Column(columnDefinition = "LONGTEXT", nullable = false)
    private String documentSections;

    @Column(columnDefinition = "LONGTEXT", nullable = false)
    private String pageIndexViews;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    public static WorkspacePreference create(User user) {
        return WorkspacePreference.builder()
                .user(user)
                .favoriteWorkspaceIds("[]")
                .recentWorkspaceIds("[]")
                .documentSections("[]")
                .pageIndexViews("[]")
                .build();
    }

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
        normalizeEmptyJson();
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
        normalizeEmptyJson();
    }

    public void update(
            String favoriteWorkspaceIds,
            String recentWorkspaceIds,
            String documentSections,
            String pageIndexViews
    ) {
        this.favoriteWorkspaceIds = favoriteWorkspaceIds;
        this.recentWorkspaceIds = recentWorkspaceIds;
        this.documentSections = documentSections;
        this.pageIndexViews = pageIndexViews;
    }

    private void normalizeEmptyJson() {
        if (favoriteWorkspaceIds == null || favoriteWorkspaceIds.isBlank()) {
            favoriteWorkspaceIds = "[]";
        }
        if (recentWorkspaceIds == null || recentWorkspaceIds.isBlank()) {
            recentWorkspaceIds = "[]";
        }
        if (documentSections == null || documentSections.isBlank()) {
            documentSections = "[]";
        }
        if (pageIndexViews == null || pageIndexViews.isBlank()) {
            pageIndexViews = "[]";
        }
    }
}
