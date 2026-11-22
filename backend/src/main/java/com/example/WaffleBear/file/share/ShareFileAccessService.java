package com.example.WaffleBear.file.share;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.file.info.dto.FileInfoDto;
import com.example.WaffleBear.file.manage.dto.FileManageDto;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.secret.PinAttemptLimiter;
import com.example.WaffleBear.file.secret.SecretAccessGuard;
import com.example.WaffleBear.file.secret.SecretTreeRules;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.share.model.FileShareAuditAction;
import com.example.WaffleBear.file.share.model.FileShareStatus;
import com.example.WaffleBear.file.upload.UploadFolderService;
import com.example.WaffleBear.user.model.User;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static com.example.WaffleBear.file.util.FileContentUtils.isActiveWebContentType;
import static com.example.WaffleBear.file.util.FileContentUtils.isActiveWebFile;
import static com.example.WaffleBear.file.util.FileContentUtils.isTextPreviewable;
import static com.example.WaffleBear.file.util.FileContentUtils.resolveDownloadContentType;
import static com.example.WaffleBear.file.util.FileContentUtils.sanitizeDownloadFileName;

@Service
@RequiredArgsConstructor
class ShareFileAccessService {

    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final ShareRepository shareRepository;
    private final ShareFileObjectStorageService shareFileObjectStorageService;
    private final UploadFolderService uploadFolderService;
    private final ShareInheritanceService shareInheritanceService;
    private final ShareAuditService shareAuditService;
    private final ShareResponseMapper shareResponseMapper;
    private final PasswordEncoder passwordEncoder;
    private final TransactionTemplate transactionTemplate;
    private PinAttemptLimiter pinAttemptLimiter = new PinAttemptLimiter();

    @Autowired(required = false)
    private SecretAccessGuard secretAccessGuard;

    @Autowired(required = false)
    public void setPinAttemptLimiter(PinAttemptLimiter pinAttemptLimiter) {
        if (pinAttemptLimiter != null) {
            this.pinAttemptLimiter = pinAttemptLimiter;
        }
    }

    private record SharedDriveCopyPlan(
            Long userIdx,
            Long fileIdx,
            Long parentId,
            String sourceObjectKey,
            String targetObjectKey,
            String targetSaveName,
            String originalName,
            String fileFormat,
            long fileSize
    ) {
    }

    private record SharedFolderUploadPlan(
            Long actorUserIdx,
            Long folderIdx,
            Long ownerIdx,
            String relativePath,
            String fileOriginName,
            String fileFormat,
            String objectKey,
            String contentType,
            long fileSize
    ) {
    }

    FileCommonDto.FileListItemRes saveSharedFileToDrive(Long userIdx, Long fileIdx, Long parentId) {
        return saveSharedFileToDrive(userIdx, fileIdx, parentId, null);
    }

    FileCommonDto.FileListItemRes saveSharedFileToDrive(Long userIdx, Long fileIdx, Long parentId, String sharePassword) {
        SharedDriveCopyPlan copyPlan = transactionTemplate.execute(status ->
                prepareSharedDriveCopy(userIdx, fileIdx, parentId, sharePassword)
        );
        if (copyPlan == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        shareFileObjectStorageService.copyObject(copyPlan.sourceObjectKey(), copyPlan.targetObjectKey());

        try {
            FileCommonDto.FileListItemRes savedFile = transactionTemplate.execute(status ->
                    persistSharedDriveCopy(copyPlan, sharePassword)
            );
            if (savedFile == null) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            return savedFile;
        } catch (RuntimeException exception) {
            ShareObjectCleanupScheduler.deleteQuietly(shareFileObjectStorageService, copyPlan.targetObjectKey());
            throw exception;
        }
    }

    FileInfoDto.TextPreviewRes getSharedTextPreview(Long userIdx, Long fileIdx) {
        return getSharedTextPreview(userIdx, fileIdx, null);
    }

    FileInfoDto.TextPreviewRes getSharedTextPreview(Long userIdx, Long fileIdx, String sharePassword) {
        requireAuthenticated(userIdx);
        FileShare share = getSharedRecord(userIdx, fileIdx);
        if (!share.getEffectivePermission().canRead()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        SharePolicyRules.ensureSharePolicyActive(share);
        verifySharePassword(userIdx, share, sharePassword);
        FileInfo file = share.getFile();
        ensureAccessibleSharedFile(file);

        if (!isTextPreviewable(file.getFileFormat())) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        return shareFileObjectStorageService.readTextPreview(
                file.getIdx(),
                file.getFileSavePath(),
                file.getFileOriginName(),
                file.getFileFormat(),
                file.getFileSize()
        );
    }

    FileCommonDto.FileDownloadPayload downloadSharedFile(Long userIdx, Long fileIdx) {
        return downloadSharedFile(userIdx, fileIdx, null);
    }

    FileCommonDto.FileDownloadPayload downloadSharedFile(Long userIdx, Long fileIdx, String sharePassword) {
        requireAuthenticated(userIdx);
        FileShare share = getSharedRecord(userIdx, fileIdx);
        if (!share.getEffectivePermission().canDownload()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        SharePolicyRules.ensureShareDownloadAvailable(share);
        verifySharePassword(userIdx, share, sharePassword);
        FileInfo file = share.getFile();
        ensureAccessibleSharedFile(file);

        String objectKey = file.getFileSavePath();
        if (objectKey == null || objectKey.isBlank()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        byte[] bytes = shareFileObjectStorageService.readObjectBytes(objectKey);
        recordSharedDownload(share);
        shareAuditService.record(share, userIdx, FileShareAuditAction.DOWNLOADED);
        return new FileCommonDto.FileDownloadPayload(
                bytes,
                resolveDownloadContentType(file.getFileOriginName()),
                sanitizeDownloadFileName(file.getFileOriginName(), file.getFileSaveName()),
                file.getFileSize()
        );
    }

    String getSharedFileDownloadUrl(Long userIdx, Long fileIdx) {
        return getSharedFileDownloadUrl(userIdx, fileIdx, null);
    }

    String getSharedFileDownloadUrl(Long userIdx, Long fileIdx, String sharePassword) {
        requireAuthenticated(userIdx);
        FileShare share = getSharedRecord(userIdx, fileIdx);
        if (!share.getEffectivePermission().canDownload()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        SharePolicyRules.ensureShareDownloadAvailable(share);
        verifySharePassword(userIdx, share, sharePassword);
        FileInfo file = share.getFile();
        ensureAccessibleSharedFile(file);

        String objectKey = file.getFileSavePath();
        if (objectKey == null || objectKey.isBlank()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        String downloadUrl = shareFileObjectStorageService.generateAttachmentDownloadUrl(
                objectKey,
                sanitizeDownloadFileName(file.getFileOriginName(), file.getFileSaveName()),
                resolveDownloadContentType(file.getFileOriginName())
        );
        recordSharedDownload(share);
        shareAuditService.record(share, userIdx, FileShareAuditAction.DOWNLOAD_LINK_CREATED);
        return downloadUrl;
    }

    FileCommonDto.FileListItemRes createFolderInSharedFolder(
            Long actorUserIdx,
            Long folderIdx,
            FileManageDto.FolderReq request
    ) {
        FileInfo parentFolder = getWritableSharedFolder(actorUserIdx, folderIdx);
        String sanitizedFolderName = ShareUploadPathRules.sanitizeFolderName(
                request != null ? request.getFolderName() : null
        );

        Long ownerIdx = parentFolder.getUser().getIdx();
        FileInfo folder = uploadFolderService.findOrCreateCommittedFolder(ownerIdx, parentFolder.getIdx(), sanitizedFolderName);
        propagateParentFolderShares(parentFolder, folder);
        folder.changeSharedFile(true);
        fileUpDownloadRepository.save(folder);
        return shareResponseMapper.toFileListItem(folder);
    }

    FileCommonDto.FileListItemRes uploadFileToSharedFolder(
            Long actorUserIdx,
            Long folderIdx,
            MultipartFile file,
            String relativePath
    ) {
        SharedFolderUploadPlan uploadPlan = transactionTemplate.execute(status ->
                prepareSharedFolderUpload(actorUserIdx, folderIdx, file, relativePath)
        );
        if (uploadPlan == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        shareFileObjectStorageService.putObject(
                file,
                uploadPlan.objectKey(),
                uploadPlan.fileSize(),
                uploadPlan.contentType()
        );

        try {
            FileCommonDto.FileListItemRes savedFile = transactionTemplate.execute(status ->
                    persistSharedFolderUpload(uploadPlan)
            );
            if (savedFile == null) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            return savedFile;
        } catch (RuntimeException exception) {
            ShareObjectCleanupScheduler.deleteQuietly(shareFileObjectStorageService, uploadPlan.objectKey());
            throw exception;
        }
    }

    FileCommonDto.FileActionRes moveSharedFileToTrash(Long actorUserIdx, Long fileIdx) {
        FileShare share = getSharedRecord(actorUserIdx, fileIdx);
        if (!share.getEffectivePermission().canWrite()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        FileInfo target = share.getFile();
        if (target == null
                || target.isTrashed()
                || target.isLockedFile()
                || SecretTreeRules.hasVaultAncestor(target)
                || SecretTreeRules.hasHiddenAncestor(target)) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        Long ownerIdx = target.getUser() != null ? target.getUser().getIdx() : null;
        if (ownerIdx == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        Map<Long, List<FileInfo>> childrenByParentId = ShareFileTree.groupChildrenByParentId(fileUpDownloadRepository.findAllByUser_Idx(ownerIdx));
        List<FileInfo> targetTree = ShareFileTree.collectTrashTree(target, childrenByParentId);
        ShareFileTree.ensureNoLockedFileNodes(targetTree);

        LocalDateTime deletedAt = LocalDateTime.now();
        targetTree.forEach(fileInfo -> fileInfo.markTrashed(deletedAt));
        fileUpDownloadRepository.saveAll(targetTree);

        return FileCommonDto.FileActionRes.builder()
                .targetIdx(fileIdx)
                .action("shared-trash")
                .affectedCount(targetTree.size())
                .build();
    }

    private SharedDriveCopyPlan prepareSharedDriveCopy(Long userIdx, Long fileIdx, Long parentId, String sharePassword) {
        requireAuthenticated(userIdx);
        FileShare share = getSharedRecord(userIdx, fileIdx);
        if (!share.getEffectivePermission().canDownload()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        SharePolicyRules.ensureShareDownloadAvailable(share);
        verifySharePassword(userIdx, share, sharePassword);
        FileInfo original = share.getFile();
        ensureAccessibleSharedFile(original);

        FileInfo parent = resolveParentFolder(userIdx, parentId);
        String objectKey = original.getFileSavePath();
        if (objectKey == null || objectKey.isBlank()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        String newSaveName = UUID.randomUUID() + "." + original.getFileFormat();
        String newObjectKey = userIdx + "/" + newSaveName;

        return new SharedDriveCopyPlan(
                userIdx,
                fileIdx,
                parent != null ? parent.getIdx() : null,
                objectKey,
                newObjectKey,
                newSaveName,
                original.getFileOriginName(),
                original.getFileFormat(),
                original.getFileSize()
        );
    }

    private FileCommonDto.FileListItemRes persistSharedDriveCopy(
            SharedDriveCopyPlan copyPlan,
            String sharePassword
    ) {
        ShareObjectCleanupScheduler.deleteAfterRollback(shareFileObjectStorageService, copyPlan.targetObjectKey());

        FileShare share = getSharedRecord(copyPlan.userIdx(), copyPlan.fileIdx());
        if (!share.getEffectivePermission().canDownload()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        SharePolicyRules.ensureShareDownloadAvailable(share);
        verifySharePassword(copyPlan.userIdx(), share, sharePassword);

        FileInfo parent = resolveParentFolder(copyPlan.userIdx(), copyPlan.parentId());

        FileInfo copy = FileInfo.builder()
                .user(User.builder().idx(copyPlan.userIdx()).build())
                .parent(parent)
                .nodeType(FileNodeType.FILE)
                .fileOriginName(copyPlan.originalName())
                .fileFormat(copyPlan.fileFormat())
                .fileSaveName(copyPlan.targetSaveName())
                .fileSavePath(copyPlan.targetObjectKey())
                .fileSize(copyPlan.fileSize())
                .lockedFile(false)
                .sharedFile(false)
                .trashed(false)
                .deletedAt(null)
                .build();

        FileCommonDto.FileListItemRes savedFile = shareResponseMapper.toFileListItem(fileUpDownloadRepository.save(copy));
        recordSharedDownload(share);
        shareAuditService.record(share, copyPlan.userIdx(), FileShareAuditAction.SAVED_TO_DRIVE);
        return savedFile;
    }

    private void verifySharePassword(Long userIdx, FileShare share, String sharePassword) {
        if (share == null || !share.isPasswordProtected()) {
            return;
        }
        String scopeKey = "share:" + userIdx + ":" + share.getIdx();
        pinAttemptLimiter.assertNotLocked(scopeKey);
        try {
            SharePolicyRules.ensureSharePasswordSatisfied(share, sharePassword, passwordEncoder);
            pinAttemptLimiter.clearFailures(scopeKey);
        } catch (RuntimeException exception) {
            pinAttemptLimiter.recordFailure(scopeKey);
            throw exception;
        }
    }

    private SharedFolderUploadPlan prepareSharedFolderUpload(
            Long actorUserIdx,
            Long folderIdx,
            MultipartFile file,
            String relativePath
    ) {
        FileInfo parentFolder = getWritableSharedFolder(actorUserIdx, folderIdx);
        ShareUploadPathRules.validateMultipartFile(file);

        String fileOriginName = ShareUploadPathRules.sanitizeUploadFileName(file.getOriginalFilename());
        String fileFormat = ShareUploadPathRules.resolveFileFormat(fileOriginName);
        ShareUploadPathRules.extractFolderSegments(relativePath, fileOriginName);
        Long ownerIdx = parentFolder.getUser().getIdx();
        String objectKey = ownerIdx + "/" + UUID.randomUUID() + "." + fileFormat;
        String rawContentType = file.getContentType();
        String contentType = rawContentType == null
                || rawContentType.isBlank()
                || isActiveWebFile(fileOriginName)
                || isActiveWebContentType(rawContentType)
                ? resolveDownloadContentType(fileOriginName)
                : rawContentType;

        return new SharedFolderUploadPlan(
                actorUserIdx,
                folderIdx,
                ownerIdx,
                relativePath,
                fileOriginName,
                fileFormat,
                objectKey,
                contentType,
                Math.max(0L, file.getSize())
        );
    }

    private FileCommonDto.FileListItemRes persistSharedFolderUpload(SharedFolderUploadPlan uploadPlan) {
        ShareObjectCleanupScheduler.deleteAfterRollback(shareFileObjectStorageService, uploadPlan.objectKey());

        FileInfo parentFolder = getWritableSharedFolder(uploadPlan.actorUserIdx(), uploadPlan.folderIdx());
        FileInfo uploadParent = resolveSharedUploadParent(parentFolder, uploadPlan.relativePath(), uploadPlan.fileOriginName());

        markExistingSameNameTrashed(uploadPlan.ownerIdx(), uploadParent, uploadPlan.fileOriginName());

        FileInfo uploaded = FileInfo.builder()
                .user(User.builder().idx(uploadPlan.ownerIdx()).build())
                .parent(uploadParent)
                .nodeType(FileNodeType.FILE)
                .fileOriginName(uploadPlan.fileOriginName())
                .fileFormat(uploadPlan.fileFormat())
                .fileSaveName(ShareUploadPathRules.extractFileSaveName(uploadPlan.objectKey()))
                .fileSavePath(uploadPlan.objectKey())
                .fileSize(uploadPlan.fileSize())
                .lockedFile(false)
                .sharedFile(true)
                .trashed(false)
                .deletedAt(null)
                .build();

        FileInfo saved = fileUpDownloadRepository.save(uploaded);
        propagateParentFolderShares(uploadParent, saved);
        return shareResponseMapper.toFileListItem(saved);
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

    private FileInfo getWritableSharedFolder(Long actorUserIdx, Long folderIdx) {
        FileShare share = getSharedRecord(actorUserIdx, folderIdx);
        if (!share.getEffectivePermission().canUpload()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        FileInfo folder = share.getFile();
        if (folder == null
                || folder.isTrashed()
                || folder.isLockedFile()
                || SecretTreeRules.hasVaultAncestor(folder)
                || SecretTreeRules.hasHiddenAncestor(folder)
                || ShareFileTree.resolveNodeType(folder) != FileNodeType.FOLDER) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        return folder;
    }

    private FileInfo getOwnedFile(Long userIdx, Long fileIdx) {
        requireAuthenticated(userIdx);
        if (fileIdx == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        return fileUpDownloadRepository.findByIdxAndUser_Idx(fileIdx, userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));
    }

    private void requireAuthenticated(Long userIdx) {
        if (userIdx == null || userIdx <= 0L) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    private synchronized void recordSharedDownload(FileShare share) {
        if (share == null) {
            return;
        }
        SharePolicyRules.ensureShareDownloadAvailable(share);
        if (share.recordDownloadAccess()) {
            shareRepository.save(share);
        }
    }

    private void ensureAccessibleSharedFile(FileInfo file) {
        if (file == null
                || file.isTrashed()
                || file.isLockedFile()
                || SecretTreeRules.hasVaultAncestor(file)
                || SecretTreeRules.hasHiddenAncestor(file)
                || ShareFileTree.resolveNodeType(file) != FileNodeType.FILE) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    private FileInfo resolveParentFolder(Long userIdx, Long parentId) {
        if (parentId == null) {
            return null;
        }

        FileInfo parent = getOwnedFile(userIdx, parentId);
        if (ShareFileTree.resolveNodeType(parent) != FileNodeType.FOLDER || parent.isTrashed()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        if (secretAccessGuard != null) {
            secretAccessGuard.assertNodeAccess(userIdx, parent, true);
        }

        return parent;
    }

    private void propagateParentFolderShares(FileInfo parentFolder, FileInfo child) {
        shareInheritanceService.inheritParentShares(parentFolder, child);
    }

    private FileInfo resolveSharedUploadParent(FileInfo sharedFolder, String relativePath, String fileOriginName) {
        List<String> folderSegments = ShareUploadPathRules.extractFolderSegments(relativePath, fileOriginName);
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

    private void markExistingSameNameTrashed(Long ownerIdx, FileInfo parent, String fileOriginName) {
        Optional<FileInfo> existing = parent == null
                ? fileUpDownloadRepository.findByUser_IdxAndParentIsNullAndFileOriginNameAndTrashedFalse(ownerIdx, fileOriginName)
                : fileUpDownloadRepository.findByUser_IdxAndParent_IdxAndFileOriginNameAndTrashedFalse(ownerIdx, parent.getIdx(), fileOriginName);

        if (existing.isEmpty()) {
            return;
        }

        FileInfo existingFile = existing.get();
        if (existingFile.isLockedFile() || ShareFileTree.resolveNodeType(existingFile) == FileNodeType.FOLDER) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        existingFile.markTrashed(LocalDateTime.now());
        fileUpDownloadRepository.save(existingFile);
    }
}
