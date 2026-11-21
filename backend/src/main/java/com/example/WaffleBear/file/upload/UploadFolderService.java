package com.example.WaffleBear.file.upload;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.model.FileSpaceType;
import com.example.WaffleBear.file.secret.SecretAccessGuard;
import com.example.WaffleBear.file.share.ShareInheritanceService;
import com.example.WaffleBear.file.upload.dto.UploadDto;
import com.example.WaffleBear.user.model.User;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UploadFolderService {

    private static final int MAX_FOLDER_NAME_LENGTH = 255;

    private record ParentCacheKey(Long parentId, FileSpaceType spaceType) {
    }

    private record ChildFolderCacheKey(Long parentId, FileSpaceType spaceType, String folderName) {
    }

    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final ShareInheritanceService shareInheritanceService;
    private final PlatformTransactionManager transactionManager;
    private final Object folderCreationMonitor = new Object();

    @Autowired(required = false)
    private SecretAccessGuard secretAccessGuard;

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public FileInfo findOrCreateCommittedFolder(Long userIdx, Long parentId, String folderName) {
        return findOrCreateFolderSynchronized(userIdx, parentId, folderName, FileSpaceType.DRIVE);
    }

    public FileInfo findOrCreateFolderSynchronized(Long userIdx, Long parentId, String folderName) {
        return findOrCreateFolderSynchronized(userIdx, parentId, folderName, FileSpaceType.DRIVE);
    }

    public FileInfo findOrCreateFolderSynchronized(
            Long userIdx,
            Long parentId,
            String folderName,
            FileSpaceType requestedSpaceType
    ) {
        synchronized (folderCreationMonitor) {
            TransactionTemplate template = new TransactionTemplate(transactionManager);
            template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            return template.execute(status -> findOrCreateFolder(userIdx, parentId, folderName, requestedSpaceType));
        }
    }

    public void ensureFolderHierarchies(Long userIdx, List<UploadDto.InitReq> requests) {
        if (requests == null || requests.isEmpty()) {
            return;
        }
        Map<ParentCacheKey, FileInfo> parentCache = new HashMap<>();
        Map<ChildFolderCacheKey, FileInfo> childCache = new HashMap<>();

        for (UploadDto.InitReq request : requests) {
            if (request == null) {
                continue;
            }
            FileSpaceType requestedSpace = resolveRequestedSpace(
                    request.getSpaceType(),
                    request.getVaultMode()
            );
            ParentCacheKey rootKey = new ParentCacheKey(request.getParentId(), requestedSpace);
            FileInfo currentParent;
            if (parentCache.containsKey(rootKey)) {
                currentParent = parentCache.get(rootKey);
            } else {
                currentParent = resolveParentFolder(userIdx, request.getParentId(), requestedSpace);
                FileSpaceType rootEffectiveSpace = currentParent != null
                        ? currentParent.resolveSpaceType()
                        : (requestedSpace == null ? FileSpaceType.DRIVE : requestedSpace);
                if (rootEffectiveSpace == FileSpaceType.VAULT && secretAccessGuard != null) {
                    secretAccessGuard.requireVaultUnlocked(userIdx);
                }
                parentCache.put(rootKey, currentParent);
            }

            FileSpaceType effectiveSpace = currentParent != null
                    ? currentParent.resolveSpaceType()
                    : (requestedSpace == null ? FileSpaceType.DRIVE : requestedSpace);

            List<String> folderSegments = extractFolderSegments(
                    request.getRelativePath(),
                    request.getFileOriginName()
            );
            for (String folderSegment : folderSegments) {
                Long currentParentId = currentParent != null ? currentParent.getIdx() : null;
                ChildFolderCacheKey childKey = new ChildFolderCacheKey(currentParentId, effectiveSpace, folderSegment);
                if (childCache.containsKey(childKey)) {
                    currentParent = childCache.get(childKey);
                } else {
                    FileInfo resolvedChild = findOrCreateFolderSynchronized(
                            userIdx,
                            currentParentId,
                            folderSegment,
                            effectiveSpace
                    );
                    childCache.put(childKey, resolvedChild);
                    currentParent = resolvedChild;
                }
            }
        }
    }

    @Transactional
    public FileInfo saveCompletedUpload(
            Long userIdx,
            UploadDto.CompleteReq request,
            String fileOriginName,
            String fileFormat,
            long fileSize,
            String finalObjectKey
    ) {
        synchronized (folderCreationMonitor) {
            Optional<FileInfo> existing = fileUpDownloadRepository.findByUser_IdxAndFileSavePath(userIdx, finalObjectKey);
            if (existing.isPresent()) {
                return existing.get();
            }

            FileSpaceType requestedSpace = resolveRequestedSpace(
                    request != null ? request.getSpaceType() : null,
                    request != null ? request.getVaultMode() : null
            );
            FileInfo parent = resolveUploadParentFolder(
                    userIdx,
                    request != null ? request.getParentId() : null,
                    request != null ? request.getRelativePath() : null,
                    fileOriginName,
                    requestedSpace
            );
            FileSpaceType effectiveSpace = parent != null ? parent.resolveSpaceType() : requestedSpace;
            if (effectiveSpace == FileSpaceType.VAULT && secretAccessGuard != null) {
                secretAccessGuard.requireVaultUnlocked(userIdx);
            }

            Long replaceFileId = request != null ? request.getReplaceFileId() : null;
            if (replaceFileId != null) {
                FileInfo target = fileUpDownloadRepository.findByIdxAndUser_Idx(replaceFileId, userIdx)
                        .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));
                if (resolveNodeType(target) != FileNodeType.FILE || target.isTrashed() || target.isLockedFile()) {
                    throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
                }
                if (secretAccessGuard != null) {
                    secretAccessGuard.assertNodeAccess(userIdx, target, true);
                }
                target.replaceContent(
                        fileOriginName,
                        fileFormat,
                        extractFileSaveName(finalObjectKey),
                        finalObjectKey,
                        fileSize,
                        parent
                );
                FileInfo saved = fileUpDownloadRepository.saveAndFlush(target);
                shareInheritanceService.inheritParentShares(parent, saved);
                return saved;
            }

            FileInfo entity = FileInfo.builder()
                    .fileOriginName(fileOriginName)
                    .fileFormat(fileFormat)
                    .fileSaveName(extractFileSaveName(finalObjectKey))
                    .fileSavePath(finalObjectKey)
                    .fileSize(fileSize)
                    .nodeType(FileNodeType.FILE)
                    .spaceType(effectiveSpace)
                    .hiddenFolder(false)
                    .folderPinEnabled(false)
                    .parent(parent)
                    .lockedFile(false)
                    .sharedFile(false)
                    .trashed(false)
                    .deletedAt(null)
                    .user(User.builder().idx(userIdx).build())
                    .build();

            FileInfo saved = fileUpDownloadRepository.saveAndFlush(entity);
            shareInheritanceService.inheritParentShares(parent, saved);
            return saved;
        }
    }

    private FileNodeType resolveNodeType(FileInfo entity) {
        return entity.getNodeType() == null ? FileNodeType.FILE : entity.getNodeType();
    }

    public FileInfo resolveUploadParentFolder(Long userIdx, Long parentId, String relativePath, String fileOriginName) {
        return resolveUploadParentFolder(userIdx, parentId, relativePath, fileOriginName, FileSpaceType.DRIVE);
    }

    public FileInfo resolveUploadParentFolder(
            Long userIdx,
            Long parentId,
            String relativePath,
            String fileOriginName,
            FileSpaceType requestedSpaceType
    ) {
        FileInfo currentParent = resolveParentFolder(userIdx, parentId, requestedSpaceType);
        FileSpaceType effectiveSpace = currentParent != null
                ? currentParent.resolveSpaceType()
                : (requestedSpaceType == null ? FileSpaceType.DRIVE : requestedSpaceType);
        if (effectiveSpace == FileSpaceType.VAULT && secretAccessGuard != null) {
            secretAccessGuard.requireVaultUnlocked(userIdx);
        }

        List<String> folderSegments = extractFolderSegments(relativePath, fileOriginName);
        for (String folderSegment : folderSegments) {
            currentParent = findOrCreateFolderSynchronized(
                    userIdx,
                    currentParent != null ? currentParent.getIdx() : null,
                    folderSegment,
                    effectiveSpace
            );
        }

        return currentParent;
    }

    private List<String> extractFolderSegments(String relativePath, String fileOriginName) {
        String normalized = normalizeRelativePath(relativePath, fileOriginName);
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        String[] pathSegments = normalized.split("/");

        if (pathSegments.length <= 1) {
            return List.of();
        }

        List<String> folderSegments = new ArrayList<>();
        for (int index = 0; index < pathSegments.length - 1; index += 1) {
            String rawSegment = pathSegments[index];
            if (rawSegment == null || rawSegment.trim().isEmpty()) {
                continue;
            }
            String segment = sanitizeFolderName(rawSegment);
            if (!segment.isBlank()) {
                folderSegments.add(segment);
            }
        }

        return folderSegments;
    }

    private FileInfo findOrCreateFolder(
            Long userIdx,
            Long parentId,
            String folderName,
            FileSpaceType requestedSpaceType
    ) {
        FileInfo parent = resolveParentFolder(userIdx, parentId, requestedSpaceType);
        FileSpaceType effectiveSpace = parent != null
                ? parent.resolveSpaceType()
                : (requestedSpaceType == null ? FileSpaceType.DRIVE : requestedSpaceType);
        if (effectiveSpace == FileSpaceType.VAULT && secretAccessGuard != null) {
            secretAccessGuard.requireVaultUnlocked(userIdx);
        }

        Optional<FileInfo> existing = parentId == null
                ? fileUpDownloadRepository.findFirstRootFolderByNameAndSpace(userIdx, folderName, effectiveSpace)
                : fileUpDownloadRepository.findFirstByUser_IdxAndParent_IdxAndFileOriginNameAndTrashedFalseOrderByIdxAsc(userIdx, parentId, folderName);

        if (existing.isPresent()) {
            FileInfo folder = existing.get();
            if (resolveNodeType(folder) != FileNodeType.FOLDER) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            if (secretAccessGuard != null) {
                secretAccessGuard.assertNodeAccess(userIdx, folder, true);
            }
            shareInheritanceService.inheritParentShares(parent, folder);
            return folder;
        }

        FileInfo entity = FileInfo.builder()
                .user(User.builder().idx(userIdx).build())
                .parent(parent)
                .nodeType(FileNodeType.FOLDER)
                .spaceType(effectiveSpace)
                .hiddenFolder(false)
                .folderPinEnabled(false)
                .fileOriginName(folderName)
                .fileFormat("folder")
                .fileSaveName("folder-" + UUID.randomUUID())
                .fileSavePath(null)
                .fileSize(0L)
                .lockedFile(false)
                .sharedFile(false)
                .trashed(false)
                .deletedAt(null)
                .build();

        FileInfo saved = fileUpDownloadRepository.saveAndFlush(entity);
        shareInheritanceService.inheritParentShares(parent, saved);
        return saved;
    }

    private FileInfo resolveParentFolder(Long userIdx, Long parentId, FileSpaceType requestedSpaceType) {
        if (parentId == null) {
            return null;
        }

        FileInfo parent = fileUpDownloadRepository.findByIdxAndUser_Idx(parentId, userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));

        if (resolveNodeType(parent) != FileNodeType.FOLDER || parent.isTrashed()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        if (requestedSpaceType == FileSpaceType.VAULT && !parent.isVaultSpace()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        if (secretAccessGuard != null) {
            secretAccessGuard.assertNodeAccess(userIdx, parent, true);
        }

        return parent;
    }

    private FileSpaceType resolveRequestedSpace(String rawSpaceType, Boolean vaultMode) {
        if (Boolean.TRUE.equals(vaultMode) || "VAULT".equalsIgnoreCase(rawSpaceType)) {
            return FileSpaceType.VAULT;
        }
        return FileSpaceType.DRIVE;
    }

    private String sanitizeFolderName(String folderName) {
        String normalized = folderName == null ? "" : folderName.trim();
        if (normalized.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.FILE_NAME_WRONG);
        }
        if (normalized.length() > MAX_FOLDER_NAME_LENGTH) {
            throw BaseException.from(
                    BaseResponseStatus.FILE_NAME_LENGTH_WRONG,
                    "폴더 이름 길이가 허용 범위(255자)를 초과했습니다: " + summarizeName(normalized)
            );
        }

        if (".".equals(normalized)
                || "..".equals(normalized)
                || normalized.contains("/")
                || normalized.contains("\\")
                || normalized.contains("\u0000")
                || normalized.contains("\r")
                || normalized.contains("\n")) {
            throw BaseException.from(
                    BaseResponseStatus.FILE_NAME_WRONG,
                    "폴더 이름이 올바르지 않습니다: " + summarizeName(normalized)
            );
        }

        return normalized;
    }

    private String summarizeName(String value) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.length() <= 60) {
            return normalized;
        }
        return normalized.substring(0, 57) + "...";
    }

    private String normalizeRelativePath(String relativePath, String fallbackFileName) {
        String normalized = relativePath == null ? "" : relativePath.trim();
        if (normalized.isEmpty()) {
            return fallbackFileName;
        }
        return normalized.replace("\\", "/");
    }

    private String extractFileSaveName(String finalObjectKey) {
        int separatorIndex = finalObjectKey.lastIndexOf('/');
        if (separatorIndex < 0 || separatorIndex >= finalObjectKey.length() - 1) {
            return finalObjectKey;
        }
        return finalObjectKey.substring(separatorIndex + 1);
    }
}
