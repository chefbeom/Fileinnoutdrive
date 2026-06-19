package com.example.WaffleBear.file.share;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.manage.dto.FileManageDto;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.file.info.dto.FileInfoDto;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.share.model.FileSharePermission;
import com.example.WaffleBear.file.share.model.FileShareStatus;
import com.example.WaffleBear.file.share.model.ShareDto;
import com.example.WaffleBear.file.service.StoragePlanService;
import com.example.WaffleBear.file.upload.UploadFolderService;
import com.example.WaffleBear.notification.NotificationService;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import io.minio.CopyObjectArgs;
import io.minio.CopySource;
import io.minio.GetObjectArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.StatObjectArgs;
import io.minio.http.Method;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static com.example.WaffleBear.file.util.FileContentUtils.buildThumbnailObjectKey;
import static com.example.WaffleBear.file.util.FileContentUtils.isTextPreviewable;
import static com.example.WaffleBear.file.util.FileContentUtils.isVideoFile;
import static com.example.WaffleBear.file.util.FileContentUtils.resolveDownloadContentType;
import static com.example.WaffleBear.file.util.FileContentUtils.resolveTextContentType;
import static com.example.WaffleBear.file.util.FileContentUtils.sanitizeDownloadFileName;

@Service
@RequiredArgsConstructor
public class ShareService {

    private static final int MAX_TEXT_PREVIEW_BYTES = 64 * 1024;

    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final ShareRepository shareRepository;
    private final UserRepository userRepository;
    private final MinioClient minioClient;
    private final MinioPresignedUrlService minioPresignedUrlService;
    private final MinioProperties minioProperties;
    private final StoragePlanService storagePlanService;
    private final UploadFolderService uploadFolderService;
    private final NotificationService notificationService;
    private final ShareInheritanceService shareInheritanceService;

    public List<ShareDto.SharedFileRes> sharedFileList(Long userIdx) {
        requireAuthenticated(userIdx);

        return shareRepository.findAllByRecipient_IdxOrderByCreatedAtDesc(userIdx)
                .stream()
                .filter(share -> share.getFile() != null)
                .filter(share -> !share.getFile().isTrashed())
                .filter(share -> share.getEffectiveStatus().isAccepted())
                .map(this::toSharedFileRes)
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
                .map(this::toSharedFileRes)
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
                .map(this::toSentSharedFileRes)
                .toList();
    }

    public List<ShareDto.ShareInfoRes> getShareInfo(Long userIdx, Long fileIdx) {
        FileInfo file = getOwnedFile(userIdx, fileIdx);

        return shareRepository.findAllByFile_Idx(file.getIdx())
                .stream()
                .sorted(Comparator.comparing(FileShare::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toShareInfo)
                .toList();
    }

    public FileCommonDto.FileActionRes shareFiles(Long userIdx, List<Long> fileIdxList, String recipientEmail, String permission) {
        return shareFiles(userIdx, fileIdxList, recipientEmail, permission, null);
    }

    public FileCommonDto.FileActionRes shareFiles(
            Long userIdx,
            List<Long> fileIdxList,
            String recipientEmail,
            String permission,
            List<String> permissions
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

        FileSharePermission sharePermission = resolvePermission(permission, permissions);
        List<FileInfo> newlySharedFiles = expandShareTargets(userIdx, fileIdxList).stream()
                .map(file -> shareOneFile(file, recipient, sharePermission))
                .filter(Objects::nonNull)
                .toList();

        if (!newlySharedFiles.isEmpty()) {
            notificationService.sendGeneralNotification(
                    recipient.getIdx(),
                    "파일 공유",
                    buildFileShareMessage(newlySharedFiles)
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

        FileSharePermission sharePermission = resolvePermission(permission, null);
        int affectedCount = 0;

        for (User recipient : recipients) {
            List<FileInfo> newlySharedFiles = expandShareTargets(userIdx, fileIdxList).stream()
                    .map(file -> shareOneFile(file, recipient, sharePermission))
                    .filter(Objects::nonNull)
                    .toList();

            affectedCount += newlySharedFiles.size();

            if (!newlySharedFiles.isEmpty()) {
                notificationService.sendGeneralNotification(
                        recipient.getIdx(),
                        "파일 공유",
                        buildFileShareMessage(newlySharedFiles)
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
                shareRepository.delete(share.get());
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
        int affectedCount = changeShareTreeStatus(share, FileShareStatus.ACCEPTED);

        return FileCommonDto.FileActionRes.builder()
                .targetIdx(fileIdx)
                .action("accept-share")
                .affectedCount(affectedCount)
                .build();
    }

    public FileCommonDto.FileActionRes rejectSharedFile(Long userIdx, Long fileIdx) {
        FileShare share = getAnySharedRecord(userIdx, fileIdx);
        int affectedCount = changeShareTreeStatus(share, FileShareStatus.REJECTED);

        return FileCommonDto.FileActionRes.builder()
                .targetIdx(fileIdx)
                .action("reject-share")
                .affectedCount(affectedCount)
                .build();
    }

    public FileCommonDto.FileListItemRes saveSharedFileToDrive(Long userIdx, Long fileIdx, Long parentId) {
        requireAuthenticated(userIdx);
        FileShare share = getSharedRecord(userIdx, fileIdx);
        if (!share.getEffectivePermission().canDownload()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        FileInfo original = share.getFile();
        ensureAccessibleSharedFile(original);

        FileInfo parent = resolveParentFolder(userIdx, parentId);
        String objectKey = original.getFileSavePath();
        if (objectKey == null || objectKey.isBlank()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        String newSaveName = UUID.randomUUID() + "." + original.getFileFormat();
        String newObjectKey = userIdx + "/" + newSaveName;

        try {
            minioClient.copyObject(
                    CopyObjectArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .object(newObjectKey)
                            .source(CopySource.builder()
                                    .bucket(minioProperties.getBucket_cloud())
                                    .object(objectKey)
                                    .build())
                            .build()
            );
        } catch (Exception exception) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        FileInfo copy = FileInfo.builder()
                .user(User.builder().idx(userIdx).build())
                .parent(parent)
                .nodeType(FileNodeType.FILE)
                .fileOriginName(original.getFileOriginName())
                .fileFormat(original.getFileFormat())
                .fileSaveName(newSaveName)
                .fileSavePath(newObjectKey)
                .fileSize(original.getFileSize())
                .lockedFile(false)
                .sharedFile(false)
                .trashed(false)
                .deletedAt(null)
                .build();

        return toFileListItem(fileUpDownloadRepository.save(copy));
    }

    public FileInfoDto.TextPreviewRes getSharedTextPreview(Long userIdx, Long fileIdx) {
        requireAuthenticated(userIdx);
        FileShare share = getSharedRecord(userIdx, fileIdx);
        if (!share.getEffectivePermission().canRead()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        FileInfo file = share.getFile();
        ensureAccessibleSharedFile(file);

        if (!isTextPreviewable(file.getFileFormat())) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        try (var objectStream = minioClient.getObject(
                GetObjectArgs.builder()
                        .bucket(minioProperties.getBucket_cloud())
                        .object(file.getFileSavePath())
                        .build()
        )) {
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int totalRead = 0;
            boolean truncated = false;
            int read;

            while ((read = objectStream.read(buffer)) != -1) {
                int writable = Math.min(read, MAX_TEXT_PREVIEW_BYTES - totalRead);
                if (writable > 0) {
                    outputStream.write(buffer, 0, writable);
                    totalRead += writable;
                }
                if (totalRead >= MAX_TEXT_PREVIEW_BYTES) {
                    truncated = true;
                    break;
                }
            }

            return FileInfoDto.TextPreviewRes.builder()
                    .idx(file.getIdx())
                    .fileOriginName(file.getFileOriginName())
                    .fileFormat(file.getFileFormat())
                    .contentType(resolveTextContentType(file.getFileFormat()))
                    .content(outputStream.toString(StandardCharsets.UTF_8))
                    .truncated(truncated)
                    .fileSize(file.getFileSize())
                    .build();
        } catch (Exception exception) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    public FileCommonDto.FileDownloadPayload downloadSharedFile(Long userIdx, Long fileIdx) {
        requireAuthenticated(userIdx);
        FileShare share = getSharedRecord(userIdx, fileIdx);
        if (!share.getEffectivePermission().canDownload()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        FileInfo file = share.getFile();
        ensureAccessibleSharedFile(file);

        String objectKey = file.getFileSavePath();
        if (objectKey == null || objectKey.isBlank()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        return new FileCommonDto.FileDownloadPayload(
                readObjectBytes(minioProperties.getBucket_cloud(), objectKey),
                resolveDownloadContentType(file.getFileOriginName()),
                sanitizeDownloadFileName(file.getFileOriginName(), file.getFileSaveName()),
                file.getFileSize()
        );
    }

    public String getSharedFileDownloadUrl(Long userIdx, Long fileIdx) {
        requireAuthenticated(userIdx);
        FileShare share = getSharedRecord(userIdx, fileIdx);
        if (!share.getEffectivePermission().canDownload()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        FileInfo file = share.getFile();
        ensureAccessibleSharedFile(file);

        String objectKey = file.getFileSavePath();
        if (objectKey == null || objectKey.isBlank()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        return generateAttachmentDownloadUrl(
                objectKey,
                sanitizeDownloadFileName(file.getFileOriginName(), file.getFileSaveName()),
                resolveDownloadContentType(file.getFileOriginName())
        );
    }

    public FileCommonDto.FileListItemRes createFolderInSharedFolder(
            Long actorUserIdx,
            Long folderIdx,
            FileManageDto.FolderReq request
    ) {
        FileInfo parentFolder = getWritableSharedFolder(actorUserIdx, folderIdx);
        String folderName = request != null ? request.getFolderName() : null;
        if (folderName == null || folderName.isBlank()) {
            throw BaseException.from(BaseResponseStatus.FILE_NAME_WRONG);
        }

        Long ownerIdx = parentFolder.getUser().getIdx();
        FileInfo folder = uploadFolderService.findOrCreateCommittedFolder(ownerIdx, parentFolder.getIdx(), folderName.trim());
        propagateParentFolderShares(parentFolder, folder);
        folder.changeSharedFile(true);
        fileUpDownloadRepository.save(folder);
        return toFileListItem(folder);
    }

    public FileCommonDto.FileListItemRes uploadFileToSharedFolder(
            Long actorUserIdx,
            Long folderIdx,
            MultipartFile file,
            String relativePath
    ) {
        FileInfo parentFolder = getWritableSharedFolder(actorUserIdx, folderIdx);
        validateMultipartFile(file);

        String fileOriginName = sanitizeUploadFileName(file.getOriginalFilename());
        String fileFormat = resolveFileFormat(fileOriginName);
        FileInfo uploadParent = resolveSharedUploadParent(parentFolder, relativePath, fileOriginName);
        Long ownerIdx = parentFolder.getUser().getIdx();
        String objectKey = ownerIdx + "/" + UUID.randomUUID() + "." + fileFormat;
        String contentType = file.getContentType() == null || file.getContentType().isBlank()
                ? resolveDownloadContentType(fileOriginName)
                : file.getContentType();

        try (var inputStream = file.getInputStream()) {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(minioProperties.getBucket_cloud())
                    .object(objectKey)
                    .stream(inputStream, file.getSize(), -1)
                    .contentType(contentType)
                    .build());
        } catch (Exception exception) {
            throw BaseException.from(BaseResponseStatus.FILE_UPLOADURL_FAIL);
        }

        markExistingSameNameTrashed(ownerIdx, uploadParent, fileOriginName);

        FileInfo uploaded = FileInfo.builder()
                .user(User.builder().idx(ownerIdx).build())
                .parent(uploadParent)
                .nodeType(FileNodeType.FILE)
                .fileOriginName(fileOriginName)
                .fileFormat(fileFormat)
                .fileSaveName(extractFileSaveName(objectKey))
                .fileSavePath(objectKey)
                .fileSize(Math.max(0L, file.getSize()))
                .lockedFile(false)
                .sharedFile(true)
                .trashed(false)
                .deletedAt(null)
                .build();

        FileInfo saved = fileUpDownloadRepository.save(uploaded);
        propagateParentFolderShares(uploadParent, saved);
        return toFileListItem(saved);
    }

    public FileCommonDto.FileActionRes moveSharedFileToTrash(Long actorUserIdx, Long fileIdx) {
        FileShare share = getSharedRecord(actorUserIdx, fileIdx);
        if (!share.getEffectivePermission().canWrite()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        FileInfo target = share.getFile();
        if (target == null || target.isTrashed() || target.isLockedFile()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        Long ownerIdx = target.getUser() != null ? target.getUser().getIdx() : null;
        if (ownerIdx == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        Map<Long, List<FileInfo>> childrenByParentId = buildChildrenByParentId(fileUpDownloadRepository.findAllByUser_Idx(ownerIdx));
        Map<Long, FileInfo> targetTreeById = new LinkedHashMap<>();
        collectTrashTree(target, childrenByParentId, targetTreeById);
        List<FileInfo> targetTree = new ArrayList<>(targetTreeById.values());
        ensureNoLockedNodes(targetTree);

        LocalDateTime deletedAt = LocalDateTime.now();
        targetTree.forEach(fileInfo -> fileInfo.markTrashed(deletedAt));
        fileUpDownloadRepository.saveAll(targetTree);

        return FileCommonDto.FileActionRes.builder()
                .targetIdx(fileIdx)
                .action("shared-trash")
                .affectedCount(targetTree.size())
                .build();
    }

    private void requireAuthenticated(Long userIdx) {
        if (userIdx == null || userIdx <= 0L) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    private FileSharePermission resolvePermission(String permission, List<String> permissions) {
        if (permissions == null || permissions.isEmpty()) {
            return FileSharePermission.from(permission);
        }

        Set<FileSharePermission> normalized = permissions.stream()
                .filter(Objects::nonNull)
                .map(FileSharePermission::from)
                .collect(java.util.stream.Collectors.toSet());

        if (normalized.contains(FileSharePermission.WRITE)) {
            return FileSharePermission.WRITE;
        }
        if (normalized.contains(FileSharePermission.UPLOAD) && normalized.contains(FileSharePermission.DOWNLOAD)) {
            return FileSharePermission.WRITE;
        }
        if (normalized.contains(FileSharePermission.UPLOAD)) {
            return FileSharePermission.UPLOAD;
        }
        if (normalized.contains(FileSharePermission.DOWNLOAD)) {
            return FileSharePermission.DOWNLOAD;
        }
        return FileSharePermission.READ;
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

    private int changeShareTreeStatus(FileShare rootShare, FileShareStatus status) {
        FileInfo root = rootShare.getFile();
        Long recipientIdx = recipientId(rootShare);
        if (root == null || root.getIdx() == null || recipientIdx == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        Long ownerIdx = root.getUser() != null ? root.getUser().getIdx() : ownerId(rootShare);
        if (ownerIdx == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        Map<Long, List<FileInfo>> childrenByParentId = buildChildrenByParentId(fileUpDownloadRepository.findAllByUser_Idx(ownerIdx));
        Map<Long, FileInfo> targetTreeById = new LinkedHashMap<>();
        collectRevocableShareTree(root, childrenByParentId, targetTreeById);

        List<FileShare> changed = new ArrayList<>();
        for (Long targetFileIdx : targetTreeById.keySet()) {
            Optional<FileShare> share = shareRepository.findByFile_IdxAndRecipient_Idx(targetFileIdx, recipientIdx);
            if (share.isEmpty()) {
                continue;
            }

            FileShare targetShare = share.get();
            if (!Objects.equals(ownerId(targetShare), ownerIdx)) {
                continue;
            }
            if (targetShare.getEffectiveStatus() == status) {
                continue;
            }
            targetShare.changeStatus(status);
            changed.add(targetShare);
        }

        if (!changed.isEmpty()) {
            shareRepository.saveAll(changed);
        }
        return changed.size();
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

    private FileInfo getWritableSharedFolder(Long actorUserIdx, Long folderIdx) {
        FileShare share = getSharedRecord(actorUserIdx, folderIdx);
        if (!share.getEffectivePermission().canUpload()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        FileInfo folder = share.getFile();
        if (folder == null || folder.isTrashed() || folder.isLockedFile() || resolveNodeType(folder) != FileNodeType.FOLDER) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        return folder;
    }

    private void ensureShareableFile(FileInfo file) {
        FileNodeType nodeType = file != null ? resolveNodeType(file) : null;
        boolean shareableNodeType = nodeType == FileNodeType.FILE || nodeType == FileNodeType.FOLDER;
        if (file == null || file.isTrashed() || file.isLockedFile() || !shareableNodeType) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    private void ensureAccessibleSharedFile(FileInfo file) {
        if (file == null || file.isTrashed() || file.isLockedFile() || resolveNodeType(file) != FileNodeType.FILE) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    private FileInfo resolveParentFolder(Long userIdx, Long parentId) {
        if (parentId == null) {
            return null;
        }

        FileInfo parent = getOwnedFile(userIdx, parentId);
        if (resolveNodeType(parent) != FileNodeType.FOLDER || parent.isTrashed()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        return parent;
    }

    private FileInfo shareOneFile(FileInfo file, User recipient, FileSharePermission permission) {
        if (file == null || file.getUser() == null || Objects.equals(file.getUser().getIdx(), recipient.getIdx())) {
            return null;
        }

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
            if (share.getEffectiveStatus() == FileShareStatus.REJECTED) {
                share.markPending();
                changed = true;
            }
            if (changed) {
                shareRepository.save(share);
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

        shareRepository.save(FileShare.builder()
                .file(file)
                .owner(file.getUser())
                .recipient(recipient)
                .permission(permission == null ? FileSharePermission.READ : permission)
                .status(FileShareStatus.PENDING)
                .build());
        file.changeSharedFile(true);
        fileUpDownloadRepository.save(file);
        return file;
    }

    private void propagateParentFolderShares(FileInfo parentFolder, FileInfo child) {
        shareInheritanceService.inheritParentShares(parentFolder, child);
    }

    private FileInfo resolveSharedUploadParent(FileInfo sharedFolder, String relativePath, String fileOriginName) {
        List<String> folderSegments = extractFolderSegments(relativePath, fileOriginName);
        FileInfo currentParent = sharedFolder;

        for (String folderSegment : folderSegments) {
            FileInfo nextFolder = uploadFolderService.findOrCreateCommittedFolder(
                    sharedFolder.getUser().getIdx(),
                    currentParent.getIdx(),
                    folderSegment
            );
            propagateParentFolderShares(currentParent, nextFolder);
            nextFolder.changeSharedFile(true);
            fileUpDownloadRepository.save(nextFolder);
            currentParent = nextFolder;
        }

        return currentParent;
    }

    private List<String> extractFolderSegments(String relativePath, String fileOriginName) {
        String normalized = relativePath == null || relativePath.isBlank()
                ? fileOriginName
                : relativePath.trim().replace("\\", "/");
        String[] segments = normalized.split("/");
        if (segments.length <= 1) {
            return List.of();
        }

        List<String> folderSegments = new ArrayList<>();
        for (int index = 0; index < segments.length - 1; index += 1) {
            String folderName = sanitizeFolderName(segments[index]);
            if (!folderName.isBlank()) {
                folderSegments.add(folderName);
            }
        }
        return folderSegments;
    }

    private void validateMultipartFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.FILE_EMPTY);
        }
        sanitizeUploadFileName(file.getOriginalFilename());
    }

    private String sanitizeUploadFileName(String fileName) {
        String normalized = fileName == null ? "" : fileName.trim();
        if (normalized.isEmpty() || normalized.length() > 100) {
            throw BaseException.from(BaseResponseStatus.FILE_NAME_WRONG);
        }
        if (normalized.contains("..") || normalized.contains("/") || normalized.contains("\\") || normalized.contains("\u0000")) {
            throw BaseException.from(BaseResponseStatus.FILE_NAME_WRONG);
        }
        return normalized;
    }

    private String sanitizeFolderName(String folderName) {
        String normalized = folderName == null ? "" : folderName.trim();
        if (normalized.isEmpty() || normalized.length() > 100) {
            throw BaseException.from(BaseResponseStatus.FILE_NAME_WRONG);
        }
        if (normalized.contains("..") || normalized.contains("/") || normalized.contains("\\") || normalized.contains("\u0000")) {
            throw BaseException.from(BaseResponseStatus.FILE_NAME_WRONG);
        }
        return normalized;
    }

    private String resolveFileFormat(String fileName) {
        int extensionIndex = fileName == null ? -1 : fileName.lastIndexOf('.');
        if (extensionIndex <= 0 || extensionIndex >= fileName.length() - 1) {
            throw BaseException.from(BaseResponseStatus.FILE_FORMAT_NOTHING);
        }
        String fileFormat = fileName.substring(extensionIndex + 1).trim().toLowerCase(Locale.ROOT);
        if (fileFormat.isBlank() || fileFormat.length() > 20 || !fileFormat.matches("^[a-z0-9]+$")) {
            throw BaseException.from(BaseResponseStatus.FILE_FORMAT_WRONG);
        }
        return fileFormat;
    }

    private void markExistingSameNameTrashed(Long ownerIdx, FileInfo parent, String fileOriginName) {
        Optional<FileInfo> existing = parent == null
                ? fileUpDownloadRepository.findByUser_IdxAndParentIsNullAndFileOriginNameAndTrashedFalse(ownerIdx, fileOriginName)
                : fileUpDownloadRepository.findByUser_IdxAndParent_IdxAndFileOriginNameAndTrashedFalse(ownerIdx, parent.getIdx(), fileOriginName);

        if (existing.isEmpty()) {
            return;
        }

        FileInfo existingFile = existing.get();
        if (resolveNodeType(existingFile) == FileNodeType.FOLDER) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        existingFile.markTrashed(java.time.LocalDateTime.now());
        fileUpDownloadRepository.save(existingFile);
    }

    private String extractFileSaveName(String finalObjectKey) {
        int separatorIndex = finalObjectKey.lastIndexOf('/');
        if (separatorIndex < 0 || separatorIndex >= finalObjectKey.length() - 1) {
            return finalObjectKey;
        }
        return finalObjectKey.substring(separatorIndex + 1);
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
                    key -> buildChildrenByParentId(fileUpDownloadRepository.findAllByUser_Idx(key))
            );
            collectShareableTree(root, childrenByParentId, expandedTargets);
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
        ensureShareableFile(file);
        return file;
    }

    private List<FileInfo> expandOwnedShareRevocationTargets(Long userIdx, List<Long> fileIdxList) {
        if (fileIdxList == null || fileIdxList.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        Map<Long, FileInfo> expandedTargets = new LinkedHashMap<>();
        List<FileInfo> userFiles = fileUpDownloadRepository.findAllByUser_Idx(userIdx);
        Map<Long, List<FileInfo>> childrenByParentId = buildChildrenByParentId(userFiles);

        for (Long fileIdx : fileIdxList.stream().filter(Objects::nonNull).distinct().toList()) {
            FileInfo root = getOwnedFile(userIdx, fileIdx);
            collectRevocableShareTree(root, childrenByParentId, expandedTargets);
        }

        if (expandedTargets.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        return new ArrayList<>(expandedTargets.values());
    }

    private Map<Long, List<FileInfo>> buildChildrenByParentId(List<FileInfo> userFiles) {
        Map<Long, List<FileInfo>> childrenByParentId = new LinkedHashMap<>();
        for (FileInfo file : userFiles) {
            if (file.getParent() == null || file.getParent().getIdx() == null) {
                continue;
            }
            childrenByParentId
                    .computeIfAbsent(file.getParent().getIdx(), ignored -> new ArrayList<>())
                    .add(file);
        }
        return childrenByParentId;
    }

    private void collectShareableTree(
            FileInfo file,
            Map<Long, List<FileInfo>> childrenByParentId,
            Map<Long, FileInfo> expandedTargets
    ) {
        ensureShareableFile(file);
        expandedTargets.putIfAbsent(file.getIdx(), file);

        if (resolveNodeType(file) != FileNodeType.FOLDER) {
            return;
        }

        for (FileInfo child : childrenByParentId.getOrDefault(file.getIdx(), List.of())) {
            if (child == null || child.isTrashed() || child.isLockedFile()) {
                continue;
            }
            collectShareableTree(child, childrenByParentId, expandedTargets);
        }
    }

    private void collectRevocableShareTree(
            FileInfo file,
            Map<Long, List<FileInfo>> childrenByParentId,
            Map<Long, FileInfo> expandedTargets
    ) {
        FileNodeType nodeType = file != null ? resolveNodeType(file) : null;
        if (file == null || file.getIdx() == null || (nodeType != FileNodeType.FILE && nodeType != FileNodeType.FOLDER)) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        expandedTargets.putIfAbsent(file.getIdx(), file);

        if (nodeType != FileNodeType.FOLDER) {
            return;
        }

        for (FileInfo child : childrenByParentId.getOrDefault(file.getIdx(), List.of())) {
            collectRevocableShareTree(child, childrenByParentId, expandedTargets);
        }
    }

    private void collectTrashTree(
            FileInfo file,
            Map<Long, List<FileInfo>> childrenByParentId,
            Map<Long, FileInfo> targetTreeById
    ) {
        if (file == null || file.getIdx() == null || file.isTrashed()) {
            return;
        }

        FileNodeType nodeType = resolveNodeType(file);
        if (nodeType != FileNodeType.FILE && nodeType != FileNodeType.FOLDER) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        targetTreeById.putIfAbsent(file.getIdx(), file);

        if (nodeType != FileNodeType.FOLDER) {
            return;
        }

        for (FileInfo child : childrenByParentId.getOrDefault(file.getIdx(), List.of())) {
            collectTrashTree(child, childrenByParentId, targetTreeById);
        }
    }

    private void ensureNoLockedNodes(List<FileInfo> files) {
        boolean hasLockedFile = files.stream()
                .anyMatch(file -> resolveNodeType(file) == FileNodeType.FILE && file.isLockedFile());

        if (hasLockedFile) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    private ShareDto.ShareInfoRes toShareInfo(FileShare share) {
        FileSharePermission permission = share.getEffectivePermission();
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
                permission.canRead(),
                permission.canDownload(),
                permission.canUpload(),
                permission.canWrite()
        );
    }

    private ShareDto.SharedFileRes toSharedFileRes(FileShare share) {
        FileInfo file = share.getFile();
        FileSharePermission permission = share.getEffectivePermission();
        FileShareStatus status = share.getEffectiveStatus();
        boolean accepted = status.isAccepted();
        return new ShareDto.SharedFileRes(
                file.getIdx(),
                file.getFileOriginName(),
                file.getFileSaveName(),
                file.getFileSavePath(),
                file.getFileFormat(),
                file.getFileSize(),
                resolveNodeType(file).name(),
                file.getParent() != null ? file.getParent().getIdx() : null,
                file.isLockedFile(),
                file.isSharedFile(),
                file.isTrashed(),
                file.getDeletedAt(),
                file.getUploadDate(),
                file.getLastModifyDate(),
                accepted && permission.canDownload() ? generatePresignedDownloadUrl(file) : null,
                accepted ? generatePresignedThumbnailUrl(file) : null,
                minioProperties.getPresignedUrlExpirySeconds(),
                true,
                permission.name(),
                accepted && permission.canWrite(),
                share.getOwner() != null ? share.getOwner().getName() : null,
                share.getOwner() != null ? share.getOwner().getEmail() : null,
                share.getCreatedAt(),
                status.name(),
                share.getRespondedAt(),
                accepted && permission.canRead(),
                accepted && permission.canDownload(),
                accepted && permission.canUpload()
        );
    }

    private ShareDto.SentSharedFileRes toSentSharedFileRes(List<FileShare> shares) {
        FileShare firstShare = shares.get(0);
        FileInfo file = firstShare.getFile();
        List<ShareDto.ShareRecipientRes> recipients = shares.stream()
                .map(share -> {
                    FileSharePermission permission = share.getEffectivePermission();
                    return new ShareDto.ShareRecipientRes(
                            share.getRecipient() != null ? share.getRecipient().getName() : null,
                            share.getRecipient() != null ? share.getRecipient().getEmail() : null,
                            permission.name(),
                            share.getCreatedAt(),
                            share.getEffectiveStatus().name(),
                            share.getRespondedAt(),
                            permission.canRead(),
                            permission.canDownload(),
                            permission.canUpload(),
                            permission.canWrite()
                    );
                })
                .toList();
        FileSharePermission permission = firstShare.getEffectivePermission();

        return new ShareDto.SentSharedFileRes(
                file.getIdx(),
                file.getFileOriginName(),
                file.getFileSaveName(),
                file.getFileSavePath(),
                file.getFileFormat(),
                file.getFileSize(),
                resolveNodeType(file).name(),
                file.getParent() != null ? file.getParent().getIdx() : null,
                file.isLockedFile(),
                file.isSharedFile(),
                file.isTrashed(),
                file.getDeletedAt(),
                file.getUploadDate(),
                file.getLastModifyDate(),
                generatePresignedDownloadUrl(file),
                generatePresignedThumbnailUrl(file),
                minioProperties.getPresignedUrlExpirySeconds(),
                false,
                permission.name(),
                permission.canWrite(),
                firstShare.getOwner() != null ? firstShare.getOwner().getName() : null,
                firstShare.getOwner() != null ? firstShare.getOwner().getEmail() : null,
                firstShare.getCreatedAt(),
                recipients.size(),
                recipients,
                firstShare.getEffectiveStatus().name(),
                firstShare.getRespondedAt(),
                permission.canRead(),
                permission.canDownload(),
                permission.canUpload()
        );
    }

    private String buildFileShareMessage(List<FileInfo> files) {
        FileInfo firstFile = files.get(0);
        String ownerName = firstFile.getUser() != null ? firstFile.getUser().getName() : "알 수 없는 사용자";

        if (files.size() == 1) {
            return ownerName + " 님이 '" + firstFile.getFileOriginName() + "' 파일을 공유했습니다.";
        }

        return ownerName + " 님이 '" + firstFile.getFileOriginName() + "' 외 " + (files.size() - 1) + "개 파일을 공유했습니다.";
    }

    private FileCommonDto.FileListItemRes toFileListItem(FileInfo entity) {
        return FileCommonDto.FileListItemRes.builder()
                .idx(entity.getIdx())
                .fileOriginName(entity.getFileOriginName())
                .fileSaveName(entity.getFileSaveName())
                .fileSavePath(entity.getFileSavePath())
                .fileFormat(entity.getFileFormat())
                .fileSize(entity.getFileSize())
                .nodeType(resolveNodeType(entity).name())
                .parentId(entity.getParent() != null ? entity.getParent().getIdx() : null)
                .lockedFile(entity.isLockedFile())
                .sharedFile(entity.isSharedFile())
                .trashed(entity.isTrashed())
                .deletedAt(entity.getDeletedAt())
                .uploadDate(entity.getUploadDate())
                .lastModifyDate(entity.getLastModifyDate())
                .presignedDownloadUrl(generatePresignedDownloadUrl(entity))
                .thumbnailPresignedUrl(generatePresignedThumbnailUrl(entity))
                .presignedUrlExpiresIn(minioProperties.getPresignedUrlExpirySeconds())
                .build();
    }

    private String generatePresignedDownloadUrl(FileInfo entity) {
        if (entity == null || entity.isLockedFile() || resolveNodeType(entity) != FileNodeType.FILE) {
            return null;
        }

        String objectKey = entity.getFileSavePath();
        if (objectKey == null || objectKey.isBlank()) {
            return null;
        }

        try {
            return minioPresignedUrlService.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(minioProperties.getBucket_cloud())
                    .object(objectKey)
                    .expiry(minioProperties.getPresignedUrlExpirySeconds())
                    .build());
        } catch (Exception exception) {
            return null;
        }
    }

    private String generatePresignedThumbnailUrl(FileInfo entity) {
        if (entity == null || entity.isLockedFile() || resolveNodeType(entity) != FileNodeType.FILE || !isVideoFile(entity.getFileFormat())) {
            return null;
        }

        String objectKey = entity.getFileSavePath();
        if (objectKey == null || objectKey.isBlank()) {
            return null;
        }

        String thumbnailObjectKey = buildThumbnailObjectKey(objectKey);
        try {
            minioClient.statObject(StatObjectArgs.builder()
                    .bucket(minioProperties.getBucket_cloud())
                    .object(thumbnailObjectKey)
                    .build());
            return minioPresignedUrlService.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(minioProperties.getBucket_cloud())
                    .object(thumbnailObjectKey)
                    .expiry(minioProperties.getPresignedUrlExpirySeconds())
                    .build());
        } catch (Exception exception) {
            return null;
        }
    }

private byte[] readObjectBytes(String bucketName, String objectKey) {
    try (var objectStream = minioClient.getObject(
            GetObjectArgs.builder()
                    .bucket(bucketName)
                    .object(objectKey)
                    .build()
    )) {
        return objectStream.readAllBytes();
    } catch (Exception exception) {
        throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
    }
}

private String generateAttachmentDownloadUrl(String objectKey, String fileName, String contentType) {
    if (objectKey == null || objectKey.isBlank()) {
        throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
    }

    try {
        Map<String, String> queryParams = new LinkedHashMap<>();
        queryParams.put(
                "response-content-disposition",
                ContentDisposition.attachment()
                        .filename(fileName, StandardCharsets.UTF_8)
                        .build()
                        .toString()
        );
        queryParams.put(
                "response-content-type",
                (contentType == null || contentType.isBlank())
                        ? resolveDownloadContentType(fileName)
                        : contentType
        );

        return minioPresignedUrlService.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                .method(Method.GET)
                .bucket(minioProperties.getBucket_cloud())
                .object(objectKey)
                .expiry(minioProperties.getPresignedUrlExpirySeconds())
                .extraQueryParams(queryParams)
                .build());
    } catch (Exception exception) {
        throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
    }
}

private FileNodeType resolveNodeType(FileInfo entity) {
    return entity.getNodeType() == null ? FileNodeType.FILE : entity.getNodeType();
}
}
