package com.example.WaffleBear.workspace.revision;

import java.time.LocalDateTime;

public class WorkspaceRevisionDto {

    public record ResSummary(
            Long idx,
            Long workspaceIdx,
            Long actorIdx,
            String actorName,
            String actorEmail,
            String title,
            String reason,
            int contentLength,
            LocalDateTime createdAt
    ) {
        public static ResSummary from(WorkspaceRevision revision) {
            return new ResSummary(
                    revision.getIdx(),
                    revision.getWorkspace().getIdx(),
                    revision.getActor().getIdx(),
                    revision.getActor().getName(),
                    revision.getActor().getEmail(),
                    revision.getTitle(),
                    revision.getReason(),
                    revision.getContents() == null ? 0 : revision.getContents().length(),
                    revision.getCreatedAt()
            );
        }
    }

    public record ResRevision(
            Long idx,
            Long workspaceIdx,
            Long actorIdx,
            String actorName,
            String actorEmail,
            String title,
            String contents,
            String reason,
            LocalDateTime createdAt
    ) {
        public static ResRevision from(WorkspaceRevision revision) {
            return new ResRevision(
                    revision.getIdx(),
                    revision.getWorkspace().getIdx(),
                    revision.getActor().getIdx(),
                    revision.getActor().getName(),
                    revision.getActor().getEmail(),
                    revision.getTitle(),
                    revision.getContents(),
                    revision.getReason(),
                    revision.getCreatedAt()
            );
        }
    }
}
