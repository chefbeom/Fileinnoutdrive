package com.example.WaffleBear.workspace.comment;

import java.time.LocalDateTime;

public class WorkspaceCommentDto {

    public record ReqCreate(
            String contents,
            String anchorBlockId,
            String anchorBlockType,
            String anchorText
    ) {
        public ReqCreate(String contents) {
            this(contents, null, null, null);
        }
    }

    public record ReqUpdate(
            String contents
    ) {
    }

    public record ReqResolve(
            Boolean resolved
    ) {
    }

    public record ResComment(
            Long idx,
            Long workspaceIdx,
            Long authorIdx,
            String authorName,
            String authorEmail,
            String contents,
            String anchorBlockId,
            String anchorBlockType,
            String anchorText,
            boolean resolved,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {
        public static ResComment from(WorkspaceComment comment) {
            return new ResComment(
                    comment.getIdx(),
                    comment.getWorkspace().getIdx(),
                    comment.getAuthor().getIdx(),
                    comment.getAuthor().getName(),
                    comment.getAuthor().getEmail(),
                    comment.getContents(),
                    comment.getAnchorBlockId(),
                    comment.getAnchorBlockType(),
                    comment.getAnchorText(),
                    comment.isResolved(),
                    comment.getCreatedAt(),
                    comment.getUpdatedAt()
            );
        }
    }

    public record CommentEvent(
            Long workspaceIdx,
            String action,
            Long actorUserIdx,
            ResComment comment,
            Long commentIdx
    ) {
    }
}
