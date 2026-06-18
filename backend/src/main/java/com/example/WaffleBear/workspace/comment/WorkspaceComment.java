package com.example.WaffleBear.workspace.comment;

import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.workspace.model.post.Post;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
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
public class WorkspaceComment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "workspace_comment_idx")
    private Long idx;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_idx", nullable = false)
    private Post workspace;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_idx", nullable = false)
    private User author;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String contents;

    @Column(length = 80)
    private String anchorBlockId;

    @Column(length = 40)
    private String anchorBlockType;

    @Column(length = 255)
    private String anchorText;

    @Column(nullable = false)
    private boolean resolved;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public void updateContents(String contents) {
        this.contents = contents;
    }

    public void updateResolved(boolean resolved) {
        this.resolved = resolved;
    }
}
