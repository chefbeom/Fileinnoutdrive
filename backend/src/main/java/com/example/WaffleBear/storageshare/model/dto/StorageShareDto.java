package com.example.WaffleBear.storageshare.model.dto;

import lombok.Builder;

import java.time.LocalDateTime;
import java.util.List;

public final class StorageShareDto {

    private StorageShareDto() {
    }

    public record CreateGrantReq(
            Long bytes,
            /** RECURRING (1달 단위 정기 공유) 또는 FIXED (기간 지정 대여) */
            String grantType,
            LocalDateTime startAt,
            LocalDateTime endAt,
            List<Long> userIds,
            List<Long> groupIds,
            List<String> emails
    ) {
    }

    /**
     * 공유해 준 사람(A)에게 보이는 항목.
     * 수신자(B)의 실제 사용량이나 파일 정보는 절대 포함하지 않는다.
     */
    @Builder
    public record OutgoingGrantItem(
            Long grantIdx,
            Long recipientIdx,
            String recipientName,
            String recipientEmail,
            long bytes,
            String grantType,
            String status,
            String sourceLabel,
            LocalDateTime startAt,
            LocalDateTime endAt,
            LocalDateTime nextCycleAt,
            LocalDateTime cancelledAt,
            LocalDateTime createdAt,
            boolean effectiveNow
    ) {
    }

    /**
     * 공유받은 사람(B)에게 보이는 항목.
     */
    @Builder
    public record IncomingGrantItem(
            Long grantIdx,
            Long granterIdx,
            String granterName,
            String granterEmail,
            long bytes,
            String grantType,
            String status,
            String sourceLabel,
            LocalDateTime startAt,
            LocalDateTime endAt,
            LocalDateTime nextCycleAt,
            LocalDateTime cancelledAt,
            LocalDateTime createdAt,
            boolean effectiveNow
    ) {
    }

    @Builder
    public record CapacityShareOverviewRes(
            long ownPlanQuotaBytes,
            long grantedOutBytes,
            long grantedInBytes,
            long sharedStorageContributionBytes,
            long effectiveQuotaBytes,
            long personalUsedBytes,
            long availableToShareBytes,
            long excessBytes,
            List<OutgoingGrantItem> outgoingGrants,
            List<IncomingGrantItem> incomingGrants
    ) {
    }

    public record CreateSharedStorageReq(
            String name,
            String description,
            Long ownerContributionBytes,
            List<Long> userIds,
            List<Long> groupIds,
            List<String> emails,
            Long proposedContributionBytes,
            Long parentFolderId
    ) {
    }

    public record InviteMembersReq(
            List<Long> userIds,
            List<Long> groupIds,
            List<String> emails,
            Long proposedContributionBytes
    ) {
    }

    public record RespondInviteReq(
            boolean accept,
            Long contributionBytes
    ) {
    }

    public record UpdateContributionReq(
            Long contributionBytes
    ) {
    }

    public record CreateFolderReq(
            Long parentIdx,
            String folderName
    ) {
    }

    public record InitUploadItemReq(
            Long parentIdx,
            String relativePath,
            String fileOriginName,
            String fileFormat,
            Long fileSize
    ) {
    }

    @Builder
    public record InitUploadChunkRes(
            String fileOriginName,
            String fileFormat,
            Long fileSize,
            int chunkIndex,
            int totalChunks,
            long chunkSize,
            String uploadObjectKey,
            String finalObjectKey,
            String uploadUrl,
            int expiresInSeconds,
            Long parentIdx,
            String relativePath
    ) {
    }

    public record CompleteUploadReq(
            Long parentIdx,
            String relativePath,
            String fileOriginName,
            String fileFormat,
            Long fileSize,
            String finalObjectKey,
            List<String> chunkObjectKeys
    ) {
    }

    public record CreateApprovalReq(
            String approvalType,
            Long targetNodeIdx,
            Long targetUserIdx,
            String reason
    ) {
    }

    public record VoteApprovalReq(
            boolean approve
    ) {
    }

    @Builder
    public record MemberRes(
            Long memberIdx,
            Long userIdx,
            String userName,
            String userEmail,
            String role,
            String status,
            long contributionBytes,
            long proposedContributionBytes,
            LocalDateTime createdAt,
            LocalDateTime joinedAt
    ) {
    }

    @Builder
    public record NodeRes(
            Long idx,
            Long storageIdx,
            Long parentIdx,
            String nodeType,
            String name,
            String fileFormat,
            long fileSize,
            Long uploaderIdx,
            String uploaderName,
            String uploaderEmail,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {
    }

    @Builder
    public record VoteRes(
            Long voterIdx,
            String voterName,
            String voterEmail,
            boolean approved,
            LocalDateTime votedAt
    ) {
    }

    @Builder
    public record ApprovalRes(
            Long approvalIdx,
            Long storageIdx,
            String approvalType,
            String status,
            Long requesterIdx,
            String requesterName,
            String requesterEmail,
            Long targetNodeIdx,
            String targetLabel,
            Long targetUserIdx,
            String reason,
            String resultMessage,
            int requiredVoteCount,
            int approvedVoteCount,
            Boolean myVote,
            LocalDateTime createdAt,
            LocalDateTime expiresAt,
            LocalDateTime resolvedAt,
            List<VoteRes> votes
    ) {
    }

    @Builder
    public record SharedStorageSummaryRes(
            Long storageIdx,
            String name,
            String description,
            String status,
            Long creatorIdx,
            String creatorName,
            String creatorEmail,
            String myRole,
            String myStatus,
            long myContributionBytes,
            long myProposedContributionBytes,
            long totalCapacityBytes,
            long usedBytes,
            long remainingBytes,
            int usagePercent,
            int activeMemberCount,
            int pendingApprovalCount,
            Long driveFolderIdx,
            Long parentFolderId,
            LocalDateTime createdAt,
            LocalDateTime trashedAt,
            LocalDateTime purgeAt
    ) {
    }

    @Builder
    public record SharedStorageDetailRes(
            SharedStorageSummaryRes summary,
            Long currentParentIdx,
            List<NodeRes> breadcrumbs,
            List<NodeRes> nodes,
            List<MemberRes> members,
            List<ApprovalRes> approvals
    ) {
    }
}
