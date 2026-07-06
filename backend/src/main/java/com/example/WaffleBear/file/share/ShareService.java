package com.example.WaffleBear.file.share;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.manage.dto.FileManageDto;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.file.info.dto.FileInfoDto;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.share.model.FileShareAuditAction;
import com.example.WaffleBear.file.share.model.FileSharePermission;
import com.example.WaffleBear.file.share.model.FileShareStatus;
import com.example.WaffleBear.file.share.model.ShareDto;
import com.example.WaffleBear.file.service.StoragePlanService;
import com.example.WaffleBear.notification.NotificationService;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;


@Service
@RequiredArgsConstructor
public class ShareService {


    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final ShareRepository shareRepository;
    private final UserRepository userRepository;
    private final StoragePlanService storagePlanService;
    private final NotificationService notificationService;
    private final ShareAuditService shareAuditService;
    private final ShareTreeStatusService shareTreeStatusService;
    private final ShareResponseMapper shareResponseMapper;
    private final ShareFileAccessService shareFileAccessService;
    private final PasswordEncoder passwordEncoder;



    public List<ShareDto.SharedFileRes> sharedFileList(Long userIdx) {
        requireAuthenticated(userIdx);

        return shareRepository.findAllByRecipient_IdxOrderByCreatedAtDesc(userIdx)
                .stream()
                .filter(share -> share.getFile() != null)
                .filter(share -> !share.getFile().isTrashed())
                .filter(share -> share.getEffectiveStatus().isAccepted())
                .map(shareResponseMapper::toSharedFileRes)
                .toList();
    }

    public List<ShareDto.SharedFileRes> pendingSharedFileList(Long userIdx) {
        requireAuthenticated(userIdx);

        List<FileShare> pendingShares = shareRepository.findAllByRecipient_IdxOrderByCreatedAtDesc(userIdx)
                .stream()
                .filter(share -> share.getFile() != null)
                .filter(share -> !share.getFile().isTrashed())
                .filter(share -> share.getEffectiveStatus() == FileShareStatus.PENDING)
                .toList();

        Map<Long, FileShare> pendingByFileId = new LinkedHashMap<>();
        for (FileShare share : pendingShares) {
            FileInfo file = share.getFile();
            if (file != null && file.getIdx() != null) {
                pendingByFileId.put(file.getIdx(), share);
            }
        }

        return pendingShares.stream()
                .filter(share -> !hasPendingSharedAncestor(share, pendingByFileId))
                .map(shareResponseMapper::toSharedFileRes)
                .toList();
    }

    public List<ShareDto.SentSharedFileRes> sentSharedFileList(Long userIdx) {
        requireAuthenticated(userIdx);

        Map<Long, List<FileShare>> sharesByFileId = new LinkedHashMap<>();

        shareRepository.findAllByOwner_IdxOrderByCreatedAtDesc(userIdx)
                .stream()
                .filter(share -> share.getFile() != null)
                .filter(share -> !share.getFile().isTrashed())
                .forEach(share -> sharesByFileId
                        .computeIfAbsent(share.getFile().getIdx(), ignored -> new ArrayList<>())
                        .add(share));

        return sharesByFileId.values().stream()
                .map(shareResponseMapper::toSentSharedFileRes)
                .toList();
    }

    public List<ShareDto.ShareAuditRes> shareAuditList(Long userIdx) {
        requireAuthenticated(userIdx);
        return shareAuditService.listForUser(userIdx);
    }

    public List<ShareDto.ShareInfoRes> getShareInfo(Long userIdx, Long fileIdx) {
        FileInfo file = getOwnedFile(userIdx, fileIdx);

        return shareRepository.findAllByFile_Idx(file.getIdx())
                .stream()
                .sorted(Comparator.comparing(FileShare::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(shareResponseMapper::toShareInfo)
                .toList();
    }

    public FileCommonDto.FileActionRes shareFiles(Long userIdx, List<Long> fileIdxList, String recipientEmail, String permission) {
        return shareFiles(userIdx, fileIdxList, recipientEmail, permission, null, null, null, null);
    }

    public FileCommonDto.FileActionRes shareFiles(
            Long userIdx,
            List<Long> fileIdxList,
            String recipientEmail,
            String permission,
            List<String> permissions
    ) {
        return shareFiles(userIdx, fileIdxList, recipientEmail, permission, permissions, null, null, null);
    }

    public FileCommonDto.FileActionRes shareFiles(
            Long userIdx,
            List<Long> fileIdxList,
            String recipientEmail,
            String permission,
            List<String> permissions,
            LocalDateTime expiresAt,
            Integer downloadLimit
    ) {
        return shareFiles(userIdx, fileIdxList, recipientEmail, permission, permissions, expiresAt, downloadLimit, null);
    }

    public FileCommonDto.FileActionRes shareFiles(
            Long userIdx,
            List<Long> fileIdxList,
            String recipientEmail,
            String permission,
            List<String> permissions,
            LocalDateTime expiresAt,
            Integer downloadLimit,
            String sharePassword
    ) {
        requireAuthenticated(userIdx);
        StoragePlanService.StorageQuota storageQuota = storagePlanService.resolveQuota(userIdx);
        if (!storageQuota.shareEnabled()) {
            throw BaseException.from(BaseResponseStatus.PLAN_FEATURE_NOT_AVAILABLE);
        }
        if (fileIdxList == null || fileIdxList.isEmpty() || recipientEmail == null || recipientEmail.isBlank()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        String normalizedEmail = recipientEmail.trim().toLowerCase(Locale.ROOT);
        User recipient = userRepository.findByEmail(normalizedEmail)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));

        if (Objects.equals(recipient.getIdx(), userIdx)) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        FileSharePermission sharePermission = SharePolicyRules.resolvePermission(permission, permissions);
        SharePolicyRules.SharePolicy sharePolicy = SharePolicyRules.resolveSharePolicy(expiresAt, downloadLimit, sharePassword, passwordEncoder);
        List<FileInfo> newlySharedFiles = expandShareTargets(userIdx, fileIdxList).stream()
                .map(file -> shareOneFile(file, recipient, sharePermission, sharePolicy, userIdx))
                .filter(Objects::nonNull)
                .toList();

        if (!newlySharedFiles.isEmpty()) {
            notificationService.sendGeneralNotification(
                    recipient.getIdx(),
                    "파일 공유",
                    shareResponseMapper.buildFileShareMessage(newlySharedFiles)
            );
        }

        return FileCommonDto.FileActionRes.builder()
                .targetIdx(null)
                .action("share")
                .affectedCount(newlySharedFiles.size())
                .build();
    }

    public int shareFilesToUsers(
            Long userIdx,
            List<Long> fileIdxList,
            Collection<Long> recipientUserIds,
            String permission
    ) {
        return shareFilesToUsers(userIdx, fileIdxList, recipientUserIds, permission, null, null, null);
    }

    public int shareFilesToUsers(
            Long userIdx,
            List<Long> fileIdxList,
            Collection<Long> recipientUserIds,
            String permission,
            LocalDateTime expiresAt,
            Integer downloadLimit
    ) {
        return shareFilesToUsers(userIdx, fileIdxList, recipientUserIds, permission, expiresAt, downloadLimit, null);
    }

    public int shareFilesToUsers(
            Long userIdx,
            List<Long> fileIdxList,
            Collection<Long> recipientUserIds,
            String permission,
            LocalDateTime expiresAt,
            Integer downloadLimit,
            String sharePassword
    ) {
        requireAuthenticated(userIdx);
        StoragePlanService.StorageQuota storageQuota = storagePlanService.resolveQuota(userIdx);
        if (!storageQuota.shareEnabled()) {
            throw BaseException.from(BaseResponseStatus.PLAN_FEATURE_NOT_AVAILABLE);
        }
        if (fileIdxList == null || fileIdxList.isEmpty() || recipientUserIds == null || recipientUserIds.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        List<User> recipients = recipientUserIds.stream()
                .filter(Objects::nonNull)
                .distinct()
                .map(recipientUserId -> userRepository.findById(recipientUserId)
                        .orElseThrow(() -> BaseException.from(BaseResponseStatus.USER_NOT_FOUND)))
                .filter(recipient -> !Objects.equals(recipient.getIdx(), userIdx))
                .toList();

        if (recipients.isEmpty()) {
            return 0;
        }

        FileSharePermission sharePermission = SharePolicyRules.resolvePermission(permission, null);
        SharePolicyRules.SharePolicy sharePolicy = SharePolicyRules.resolveSharePolicy(expiresAt, downloadLimit, sharePassword, passwordEncoder);
        int affectedCount = 0;

        for (User recipient : recipients) {
            List<FileInfo> newlySharedFiles = expandShareTargets(userIdx, fileIdxList).stream()
                    .map(file -> shareOneFile(file, recipient, sharePermission, sharePolicy, userIdx))
                    .filter(Objects::nonNull)
                    .toList();

            affectedCount += newlySharedFiles.size();

            if (!newlySharedFiles.isEmpty()) {
                notificationService.sendGeneralNotification(
                        recipient.getIdx(),
                        "파일 공유",
                        shareResponseMapper.buildFileShareMessage(newlySharedFiles)
                );
            }
        }

        return affectedCount;
    }

    public FileCommonDto.FileActionRes cancelShare(Long userIdx, List<Long> fileIdxList, String recipientEmail) {
        requireAuthenticated(userIdx);
        if (fileIdxList == null || fileIdxList.isEmpty() || recipientEmail == null || recipientEmail.isBlank()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        String normalizedEmail = recipientEmail.trim().toLowerCase(Locale.ROOT);
        int affectedCount = 0;

        for (FileInfo file : expandOwnedShareRevocationTargets(userIdx, fileIdxList)) {
            boolean removed = false;

            Optional<FileShare> share = shareRepository.findByFile_IdxAndRecipient_Email(file.getIdx(), normalizedEmail);
            if (share.isPresent()) {
                FileShare removedShare = share.get();
                shareAuditService.record(removedShare, userIdx, FileShareAuditAction.CANCELED);
                shareRepository.delete(removedShare);
                removed = true;
            }

            long remain = shareRepository.countByFile_Idx(file.getIdx());
            file.changeSharedFile(remain > 0);
            fileUpDownloadRepository.save(file);
            if (removed) {
                affectedCount += 1;
            }
        }

        return FileCommonDto.FileActionRes.builder()
                .targetIdx(null)
                .action("cancel-share")
                .affectedCount(affectedCount)
                .build();
    }

    public FileCommonDto.FileActionRes cancelAllShares(Long userIdx, List<Long> fileIdxList) {
        requireAuthenticated(userIdx);
        if (fileIdxList == null || fileIdxList.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        int affectedCount = 0;

        for (FileInfo file : expandOwnedShareRevocationTargets(userIdx, fileIdxList)) {
            List<FileShare> shares = shareRepository.findAllByFile_Idx(file.getIdx());

            if (!shares.isEmpty()) {
                shares.forEach(share -> shareAuditService.record(share, userIdx, FileShareAuditAction.CANCELED_ALL));
                shareRepository.deleteAll(shares);
                affectedCount += shares.size();
            }

            file.changeSharedFile(false);
            fileUpDownloadRepository.save(file);
        }

        return FileCommonDto.FileActionRes.builder()
                .targetIdx(null)
                .action("cancel-all-share")
                .affectedCount(affectedCount)
                .build();
    }

    public FileCommonDto.FileActionRes acceptSharedFile(Long userIdx, Long fileIdx) {
        FileShare share = getAnySharedRecord(userIdx, fileIdx);
        int affectedCount = shareTreeStatusService.changeTreeStatus(share, FileShareStatus.ACCEPTED, userIdx, FileShareAuditAction.ACCEPTED);

        return FileCommonDto.FileActionRes.builder()
                .targetIdx(fileIdx)
                .action("accept-share")
                .affectedCount(affectedCount)
                .build();
    }

    public FileCommonDto.FileActionRes rejectSharedFile(Long userIdx, Long fileIdx) {
        FileShare share = getAnySharedRecord(userIdx, fileIdx);
        int affectedCount = shareTreeStatusService.changeTreeStatus(share, FileShareStatus.REJECTED, userIdx, FileShareAuditAction.REJECTED);

        return FileCommonDto.FileActionRes.builder()
                .targetIdx(fileIdx)
                .action("reject-share")
                .affectedCount(affectedCount)
                .build();
    }

    public FileCommonDto.FileListItemRes saveSharedFileToDrive(Long userIdx, Long fileIdx, Long parentId) {
        return shareFileAccessService.saveSharedFileToDrive(userIdx, fileIdx, parentId);
    }

    public FileCommonDto.FileListItemRes saveSharedFileToDrive(Long userIdx, Long fileIdx, Long parentId, String sharePassword) {
        return shareFileAccessService.saveSharedFileToDrive(userIdx, fileIdx, parentId, sharePassword);
    }

    public FileInfoDto.TextPreviewRes getSharedTextPreview(Long userIdx, Long fileIdx) {
        return shareFileAccessService.getSharedTextPreview(userIdx, fileIdx);
    }

    public FileInfoDto.TextPreviewRes getSharedTextPreview(Long userIdx, Long fileIdx, String sharePassword) {
        return shareFileAccessService.getSharedTextPreview(userIdx, fileIdx, sharePassword);
    }

    public FileCommonDto.FileDownloadPayload downloadSharedFile(Long userIdx, Long fileIdx) {
        return shareFileAccessService.downloadSharedFile(userIdx, fileIdx);
    }

    public FileCommonDto.FileDownloadPayload downloadSharedFile(Long userIdx, Long fileIdx, String sharePassword) {
        return shareFileAccessService.downloadSharedFile(userIdx, fileIdx, sharePassword);
    }

    public String getSharedFileDownloadUrl(Long userIdx, Long fileIdx) {
        return shareFileAccessService.getSharedFileDownloadUrl(userIdx, fileIdx);
    }

    public String getSharedFileDownloadUrl(Long userIdx, Long fileIdx, String sharePassword) {
        return shareFileAccessService.getSharedFileDownloadUrl(userIdx, fileIdx, sharePassword);
    }

    public FileCommonDto.FileListItemRes createFolderInSharedFolder(
            Long actorUserIdx,
            Long folderIdx,
            FileManageDto.FolderReq request
    ) {
        return shareFileAccessService.createFolderInSharedFolder(actorUserIdx, folderIdx, request);
    }

    public FileCommonDto.FileListItemRes uploadFileToSharedFolder(
            Long actorUserIdx,
            Long folderIdx,
            MultipartFile file,
            String relativePath
    ) {
        return shareFileAccessService.uploadFileToSharedFolder(actorUserIdx, folderIdx, file, relativePath);
    }

    public FileCommonDto.FileActionRes moveSharedFileToTrash(Long actorUserIdx, Long fileIdx) {
        return shareFileAccessService.moveSharedFileToTrash(actorUserIdx, fileIdx);
    }

    private void requireAuthenticated(Long userIdx) {
        if (userIdx == null || userIdx <= 0L) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    private boolean hasPendingSharedAncestor(FileShare share, Map<Long, FileShare> pendingByFileId) {
        FileInfo current = share != null && share.getFile() != null ? share.getFile().getParent() : null;
        while (current != null && current.getIdx() != null) {
            FileShare ancestorShare = pendingByFileId.get(current.getIdx());
            if (ancestorShare != null
                    && Objects.equals(ownerId(ancestorShare), ownerId(share))
                    && Objects.equals(recipientId(ancestorShare), recipientId(share))) {
                return true;
            }
            current = current.getParent();
        }
        return false;
    }

    private Long ownerId(FileShare share) {
        return share != null && share.getOwner() != null ? share.getOwner().getIdx() : null;
    }

    private Long recipientId(FileShare share) {
        return share != null && share.getRecipient() != null ? share.getRecipient().getIdx() : null;
    }

    private FileInfo getOwnedFile(Long userIdx, Long fileIdx) {
        requireAuthenticated(userIdx);
        if (fileIdx == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        return fileUpDownloadRepository.findByIdxAndUser_Idx(fileIdx, userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));
    }

    private FileShare getSharedRecord(Long userIdx, Long fileIdx) {
        FileShare share = getAnySharedRecord(userIdx, fileIdx);
        if (!share.getEffectiveStatus().isAccepted()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        SharePolicyRules.ensureSharePolicyActive(share);
        return share;
    }

    private FileShare getAnySharedRecord(Long userIdx, Long fileIdx) {
        requireAuthenticated(userIdx);
        if (fileIdx == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        return shareRepository.findByFile_IdxAndRecipient_Idx(fileIdx, userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));
    }



    private FileInfo shareOneFile(FileInfo file, User recipient, FileSharePermission permission, SharePolicyRules.SharePolicy policy, Long actorIdx) {
        if (file == null || file.getUser() == null || Objects.equals(file.getUser().getIdx(), recipient.getIdx())) {
            return null;
        }

        SharePolicyRules.SharePolicy effectivePolicy = policy == null ? SharePolicyRules.SharePolicy.empty() : policy;
        Optional<FileShare> existing = shareRepository.findByFile_IdxAndRecipient_Idx(file.getIdx(), recipient.getIdx());
        if (existing.isPresent()) {
            FileShare share = existing.get();
            FileSharePermission currentPermission = share.getEffectivePermission();
            FileSharePermission requestedPermission = permission == null ? FileSharePermission.READ : permission;
            boolean changed = false;
            if (currentPermission != requestedPermission) {
                share.changePermission(requestedPermission);
                changed = true;
            }
            if (share.changePolicy(effectivePolicy.expiresAt(), effectivePolicy.downloadLimit())) {
                changed = true;
            }
            if (share.changePasswordHash(effectivePolicy.passwordHash())) {
                changed = true;
            }
            if (share.getEffectiveStatus() == FileShareStatus.REJECTED) {
                share.markPending();
                changed = true;
            }
            if (changed) {
                shareRepository.save(share);
                shareAuditService.record(share, actorIdx, FileShareAuditAction.UPDATED);
            }
            if (changed || !file.isSharedFile()) {
                if (!file.isSharedFile()) {
                    file.changeSharedFile(true);
                    fileUpDownloadRepository.save(file);
                }
                return file;
            }
            return null;
        }

        FileShare newShare = FileShare.builder()
                .file(file)
                .owner(file.getUser())
                .recipient(recipient)
                .permission(permission == null ? FileSharePermission.READ : permission)
                .status(FileShareStatus.PENDING)
                .expiresAt(effectivePolicy.expiresAt())
                .downloadLimit(effectivePolicy.downloadLimit())
                .downloadCount(0)
                .passwordHash(effectivePolicy.passwordHash())
                .build();
        FileShare savedShare = shareRepository.save(newShare);
        shareAuditService.record(savedShare != null ? savedShare : newShare, actorIdx, FileShareAuditAction.CREATED);
        file.changeSharedFile(true);
        fileUpDownloadRepository.save(file);
        return file;
    }


    private List<FileInfo> expandShareTargets(Long userIdx, List<Long> fileIdxList) {
        if (fileIdxList == null || fileIdxList.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        Map<Long, FileInfo> expandedTargets = new LinkedHashMap<>();
        Map<Long, Map<Long, List<FileInfo>>> childrenByOwnerId = new LinkedHashMap<>();

        for (Long fileIdx : fileIdxList.stream().filter(Objects::nonNull).distinct().toList()) {
            FileInfo root = resolveShareRootForActor(userIdx, fileIdx);
            Long ownerIdx = root.getUser() != null ? root.getUser().getIdx() : null;
            if (ownerIdx == null) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            Map<Long, List<FileInfo>> childrenByParentId = childrenByOwnerId.computeIfAbsent(
                    ownerIdx,
                    key -> ShareFileTree.groupChildrenByParentId(fileUpDownloadRepository.findAllByUser_Idx(key))
            );
            ShareFileTree.collectShareableTree(root, childrenByParentId)
                    .forEach(file -> expandedTargets.putIfAbsent(file.getIdx(), file));
        }

        if (expandedTargets.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        return new ArrayList<>(expandedTargets.values());
    }

    private FileInfo resolveShareRootForActor(Long actorUserIdx, Long fileIdx) {
        Optional<FileInfo> owned = fileUpDownloadRepository.findByIdxAndUser_Idx(fileIdx, actorUserIdx);
        if (owned != null && owned.isPresent()) {
            return owned.get();
        }

        FileShare share = getSharedRecord(actorUserIdx, fileIdx);
        if (!share.getEffectivePermission().canWrite()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        FileInfo file = share.getFile();
        ShareFileTree.ensureShareableNode(file);
        return file;
    }

    private List<FileInfo> expandOwnedShareRevocationTargets(Long userIdx, List<Long> fileIdxList) {
        if (fileIdxList == null || fileIdxList.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        Map<Long, FileInfo> expandedTargets = new LinkedHashMap<>();
        List<FileInfo> userFiles = fileUpDownloadRepository.findAllByUser_Idx(userIdx);
        Map<Long, List<FileInfo>> childrenByParentId = ShareFileTree.groupChildrenByParentId(userFiles);

        for (Long fileIdx : fileIdxList.stream().filter(Objects::nonNull).distinct().toList()) {
            FileInfo root = getOwnedFile(userIdx, fileIdx);
            ShareFileTree.collectRevocableShareTree(root, childrenByParentId)
                    .forEach(file -> expandedTargets.putIfAbsent(file.getIdx(), file));
        }

        if (expandedTargets.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        return new ArrayList<>(expandedTargets.values());
    }
}
