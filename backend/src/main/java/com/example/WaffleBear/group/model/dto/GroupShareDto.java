package com.example.WaffleBear.group.model.dto;

import com.example.WaffleBear.group.model.enums.InviteType;

import java.time.LocalDateTime;
import java.util.List;

public class GroupShareDto {

    public record FileShareRequest(
            List<Long> fileIds,
            List<Long> userIds,
            List<Long> groupIds,
            List<String> emails,
            String permission,
            LocalDateTime expiresAt,
            Integer downloadLimit,
            String sharePassword
    ) {
    }

    public record WorkspaceShareRequest(
            Long workspaceId,
            List<Long> userIds,
            List<Long> groupIds,
            List<String> emails,
            String role
    ) {
    }

    public record ChatShareRequest(
            Long roomId,
            List<Long> userIds,
            List<Long> groupIds,
            List<String> emails
    ) {
    }

    public record ShareRecipient(
            Long userId,
            String name,
            String email,
            String source
    ) {
    }

    public record PendingInvite(
            Long inviteId,
            String email,
            InviteType type
    ) {
    }

    public record ShareResult(
            int affectedCount,
            List<ShareRecipient> resolvedRecipients,
            List<PendingInvite> pendingInvites
    ) {
    }
}
