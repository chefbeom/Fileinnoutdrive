package com.example.WaffleBear.file.share.model;

import java.time.LocalDateTime;
import java.util.List;

public class ShareDto {

    public record ShareReq(
            List<Long> fileIdxList,
            String recipientEmail,
            String permission,
            List<String> permissions,
            LocalDateTime expiresAt,
            Integer downloadLimit,
            String sharePassword
    ) {
    }

    public record CancelAllShareReq(
            List<Long> fileIdxList
    ) {
    }

    public record SaveToDriveReq(
            Long parentId,
            String sharePassword
    ) {
    }

    public record ShareInfoRes(
            Long shareIdx,
            Long fileIdx,
            String fileOriginName,
            String ownerName,
            String ownerEmail,
            String recipientName,
            String recipientEmail,
            String permission,
            LocalDateTime createdAt,
            String status,
            LocalDateTime respondedAt,
            LocalDateTime expiresAt,
            Integer downloadLimit,
            Integer downloadCount,
            Boolean expired,
            Boolean downloadLimitReached,
            Boolean passwordProtected,
            Boolean readable,
            Boolean downloadable,
            Boolean uploadable,
            Boolean writable
    ) {
    }

    public record SharedFileRes(
            Long idx,
            String fileOriginName,
            String fileSaveName,
            String fileSavePath,
            String fileFormat,
            Long fileSize,
            String nodeType,
            Long parentId,
            Boolean lockedFile,
            Boolean sharedFile,
            Boolean trashed,
            LocalDateTime deletedAt,
            LocalDateTime uploadDate,
            LocalDateTime lastModifyDate,
            String presignedDownloadUrl,
            String thumbnailPresignedUrl,
            Integer presignedUrlExpiresIn,
            Boolean sharedWithMe,
            String permission,
            Boolean writable,
            String ownerName,
            String ownerEmail,
            LocalDateTime sharedAt,
            String status,
            LocalDateTime respondedAt,
            LocalDateTime expiresAt,
            Integer downloadLimit,
            Integer downloadCount,
            Boolean expired,
            Boolean downloadLimitReached,
            Boolean passwordProtected,
            Boolean readable,
            Boolean downloadable,
            Boolean uploadable
    ) {
    }

    public record ShareRecipientRes(
            String recipientName,
            String recipientEmail,
            String permission,
            LocalDateTime sharedAt,
            String status,
            LocalDateTime respondedAt,
            LocalDateTime expiresAt,
            Integer downloadLimit,
            Integer downloadCount,
            Boolean expired,
            Boolean downloadLimitReached,
            Boolean passwordProtected,
            Boolean readable,
            Boolean downloadable,
            Boolean uploadable,
            Boolean writable
    ) {
    }

    public record SentSharedFileRes(
            Long idx,
            String fileOriginName,
            String fileSaveName,
            String fileSavePath,
            String fileFormat,
            Long fileSize,
            String nodeType,
            Long parentId,
            Boolean lockedFile,
            Boolean sharedFile,
            Boolean trashed,
            LocalDateTime deletedAt,
            LocalDateTime uploadDate,
            LocalDateTime lastModifyDate,
            String presignedDownloadUrl,
            String thumbnailPresignedUrl,
            Integer presignedUrlExpiresIn,
            Boolean sharedWithMe,
            String permission,
            Boolean writable,
            String ownerName,
            String ownerEmail,
            LocalDateTime sharedAt,
            Integer recipientCount,
            List<ShareRecipientRes> recipients,
            String status,
            LocalDateTime respondedAt,
            LocalDateTime expiresAt,
            Integer downloadLimit,
            Integer downloadCount,
            Boolean expired,
            Boolean downloadLimitReached,
            Boolean passwordProtected,
            Boolean readable,
            Boolean downloadable,
            Boolean uploadable
    ) {
    }
    public record ShareAuditRes(
            Long idx,
            Long shareIdx,
            Long fileIdx,
            String fileName,
            Long ownerIdx,
            String ownerEmail,
            String ownerName,
            Long recipientIdx,
            String recipientEmail,
            String recipientName,
            Long actorIdx,
            String actorEmail,
            String actorName,
            String action,
            String permission,
            String status,
            LocalDateTime expiresAt,
            Integer downloadLimit,
            Integer downloadCount,
            LocalDateTime createdAt
    ) {
    }
}