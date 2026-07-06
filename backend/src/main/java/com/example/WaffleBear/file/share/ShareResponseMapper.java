package com.example.WaffleBear.file.share;

import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.share.model.FileSharePermission;
import com.example.WaffleBear.file.share.model.FileShareStatus;
import com.example.WaffleBear.file.share.model.ShareDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

import static com.example.WaffleBear.file.util.FileContentUtils.isVideoFile;

@Service
@RequiredArgsConstructor
class ShareResponseMapper {

    private final ShareFileObjectStorageService shareFileObjectStorageService;

    ShareDto.ShareInfoRes toShareInfo(FileShare share) {
        FileSharePermission permission = share.getEffectivePermission();
        boolean expired = share.isExpired(LocalDateTime.now());
        boolean downloadLimitReached = share.isDownloadLimitReached();
        return new ShareDto.ShareInfoRes(
                share.getIdx(),
                share.getFile() != null ? share.getFile().getIdx() : null,
                share.getFile() != null ? share.getFile().getFileOriginName() : null,
                share.getOwner() != null ? share.getOwner().getName() : null,
                share.getOwner() != null ? share.getOwner().getEmail() : null,
                share.getRecipient() != null ? share.getRecipient().getName() : null,
                share.getRecipient() != null ? share.getRecipient().getEmail() : null,
                permission.name(),
                share.getCreatedAt(),
                share.getEffectiveStatus().name(),
                share.getRespondedAt(),
                share.getExpiresAt(),
                share.getDownloadLimit(),
                share.getDownloadCount(),
                expired,
                downloadLimitReached,
                share.isPasswordProtected(),
                !expired && permission.canRead(),
                !expired && !downloadLimitReached && permission.canDownload(),
                !expired && permission.canUpload(),
                !expired && permission.canWrite()
        );
    }

    ShareDto.SharedFileRes toSharedFileRes(FileShare share) {
        FileInfo file = share.getFile();
        FileSharePermission permission = share.getEffectivePermission();
        FileShareStatus status = share.getEffectiveStatus();
        boolean accepted = status.isAccepted();
        boolean expired = share.isExpired(LocalDateTime.now());
        boolean downloadLimitReached = share.isDownloadLimitReached();
        boolean downloadAvailable = accepted && !expired && !downloadLimitReached && permission.canDownload();
        String directDownloadUrl = downloadAvailable && !SharePolicyRules.requiresTrackedSharedDownload(share)
                ? generatePresignedDownloadUrl(file)
                : null;
        return new ShareDto.SharedFileRes(
                file.getIdx(),
                file.getFileOriginName(),
                file.getFileSaveName(),
                file.getFileSavePath(),
                file.getFileFormat(),
                file.getFileSize(),
                ShareFileTree.resolveNodeType(file).name(),
                file.getParent() != null ? file.getParent().getIdx() : null,
                file.isLockedFile(),
                file.isSharedFile(),
                file.isTrashed(),
                file.getDeletedAt(),
                file.getUploadDate(),
                file.getLastModifyDate(),
                directDownloadUrl,
                accepted && !expired ? generatePresignedThumbnailUrl(file) : null,
                shareFileObjectStorageService.presignedUrlExpirySeconds(),
                true,
                permission.name(),
                accepted && !expired && permission.canWrite(),
                share.getOwner() != null ? share.getOwner().getName() : null,
                share.getOwner() != null ? share.getOwner().getEmail() : null,
                share.getCreatedAt(),
                status.name(),
                share.getRespondedAt(),
                share.getExpiresAt(),
                share.getDownloadLimit(),
                share.getDownloadCount(),
                expired,
                downloadLimitReached,
                share.isPasswordProtected(),
                accepted && !expired && permission.canRead(),
                downloadAvailable,
                accepted && !expired && permission.canUpload()
        );
    }

    ShareDto.SentSharedFileRes toSentSharedFileRes(List<FileShare> shares) {
        FileShare firstShare = shares.get(0);
        FileInfo file = firstShare.getFile();
        List<ShareDto.ShareRecipientRes> recipients = shares.stream()
                .map(this::toShareRecipientRes)
                .toList();
        FileSharePermission permission = firstShare.getEffectivePermission();
        boolean expired = firstShare.isExpired(LocalDateTime.now());
        boolean downloadLimitReached = firstShare.isDownloadLimitReached();

        return new ShareDto.SentSharedFileRes(
                file.getIdx(),
                file.getFileOriginName(),
                file.getFileSaveName(),
                file.getFileSavePath(),
                file.getFileFormat(),
                file.getFileSize(),
                ShareFileTree.resolveNodeType(file).name(),
                file.getParent() != null ? file.getParent().getIdx() : null,
                file.isLockedFile(),
                file.isSharedFile(),
                file.isTrashed(),
                file.getDeletedAt(),
                file.getUploadDate(),
                file.getLastModifyDate(),
                generatePresignedDownloadUrl(file),
                generatePresignedThumbnailUrl(file),
                shareFileObjectStorageService.presignedUrlExpirySeconds(),
                false,
                permission.name(),
                !expired && permission.canWrite(),
                firstShare.getOwner() != null ? firstShare.getOwner().getName() : null,
                firstShare.getOwner() != null ? firstShare.getOwner().getEmail() : null,
                firstShare.getCreatedAt(),
                recipients.size(),
                recipients,
                firstShare.getEffectiveStatus().name(),
                firstShare.getRespondedAt(),
                firstShare.getExpiresAt(),
                firstShare.getDownloadLimit(),
                firstShare.getDownloadCount(),
                expired,
                downloadLimitReached,
                firstShare.isPasswordProtected(),
                !expired && permission.canRead(),
                !expired && !downloadLimitReached && permission.canDownload(),
                !expired && permission.canUpload()
        );
    }

    FileCommonDto.FileListItemRes toFileListItem(FileInfo entity) {
        return FileCommonDto.FileListItemRes.builder()
                .idx(entity.getIdx())
                .fileOriginName(entity.getFileOriginName())
                .fileSaveName(entity.getFileSaveName())
                .fileSavePath(entity.getFileSavePath())
                .fileFormat(entity.getFileFormat())
                .fileSize(entity.getFileSize())
                .nodeType(ShareFileTree.resolveNodeType(entity).name())
                .parentId(entity.getParent() != null ? entity.getParent().getIdx() : null)
                .lockedFile(entity.isLockedFile())
                .sharedFile(entity.isSharedFile())
                .trashed(entity.isTrashed())
                .deletedAt(entity.getDeletedAt())
                .uploadDate(entity.getUploadDate())
                .lastModifyDate(entity.getLastModifyDate())
                .presignedDownloadUrl(generatePresignedDownloadUrl(entity))
                .thumbnailPresignedUrl(generatePresignedThumbnailUrl(entity))
                .presignedUrlExpiresIn(shareFileObjectStorageService.presignedUrlExpirySeconds())
                .build();
    }

    String buildFileShareMessage(List<FileInfo> files) {
        if (files == null || files.isEmpty()) {
            return "공유된 파일이 없습니다.";
        }

        FileInfo firstFile = files.get(0);
        String ownerName = firstFile.getUser() != null ? firstFile.getUser().getName() : "알 수 없는 사용자";

        if (files.size() == 1) {
            return ownerName + " 님이 '" + firstFile.getFileOriginName() + "' 파일을 공유했습니다.";
        }

        return ownerName + " 님이 '" + firstFile.getFileOriginName() + "' 외 " + (files.size() - 1) + "개 파일을 공유했습니다.";
    }

    private ShareDto.ShareRecipientRes toShareRecipientRes(FileShare share) {
        FileSharePermission permission = share.getEffectivePermission();
        boolean expired = share.isExpired(LocalDateTime.now());
        boolean downloadLimitReached = share.isDownloadLimitReached();
        return new ShareDto.ShareRecipientRes(
                share.getRecipient() != null ? share.getRecipient().getName() : null,
                share.getRecipient() != null ? share.getRecipient().getEmail() : null,
                permission.name(),
                share.getCreatedAt(),
                share.getEffectiveStatus().name(),
                share.getRespondedAt(),
                share.getExpiresAt(),
                share.getDownloadLimit(),
                share.getDownloadCount(),
                expired,
                downloadLimitReached,
                share.isPasswordProtected(),
                !expired && permission.canRead(),
                !expired && !downloadLimitReached && permission.canDownload(),
                !expired && permission.canUpload(),
                !expired && permission.canWrite()
        );
    }

    private String generatePresignedDownloadUrl(FileInfo entity) {
        if (entity == null || entity.isLockedFile() || ShareFileTree.resolveNodeType(entity) != FileNodeType.FILE) {
            return null;
        }

        String objectKey = entity.getFileSavePath();
        if (objectKey == null || objectKey.isBlank()) {
            return null;
        }

        return shareFileObjectStorageService.generateDownloadUrl(objectKey);
    }

    private String generatePresignedThumbnailUrl(FileInfo entity) {
        if (entity == null || entity.isLockedFile() || ShareFileTree.resolveNodeType(entity) != FileNodeType.FILE || !isVideoFile(entity.getFileFormat())) {
            return null;
        }

        String objectKey = entity.getFileSavePath();
        if (objectKey == null || objectKey.isBlank()) {
            return null;
        }

        return shareFileObjectStorageService.generateThumbnailUrl(objectKey);
    }
}