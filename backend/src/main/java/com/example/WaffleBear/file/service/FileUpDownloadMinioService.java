package com.example.WaffleBear.file.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.file.info.dto.FileInfoDto;
import com.example.WaffleBear.file.manage.dto.FileManageDto;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.model.FileSpaceType;
import com.example.WaffleBear.file.secret.SecretAccessGuard;
import com.example.WaffleBear.file.secret.SecretFolderService;
import com.example.WaffleBear.file.secret.SecretTreeRules;
import com.example.WaffleBear.file.share.ShareInheritanceService;
import com.example.WaffleBear.file.share.ShareRepository;
import com.example.WaffleBear.file.sharelink.FileDownloadShareLinkRepository;
import com.example.WaffleBear.file.version.FileVersionLifecycleService;
import com.example.WaffleBear.storageshare.service.SharedStorageService;
import com.example.WaffleBear.user.model.User;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Queue;
import java.util.Set;
import java.util.UUID;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.ZoneId;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import static com.example.WaffleBear.file.util.FileContentUtils.isTextPreviewable;

@Slf4j
@Service
@RequiredArgsConstructor
public class FileUpDownloadMinioService implements FileUpDownloadService {

    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final FileListItemUrlService fileListItemUrlService;
    private final FileObjectDownloadService fileObjectDownloadService;
    private final FileObjectDeletionService fileObjectDeletionService;
    private final FileStorageSummaryService fileStorageSummaryService;
    private final StoragePlanService storagePlanService;
    private final ShareRepository shareRepository;
    private final ShareInheritanceService shareInheritanceService;
    private final FileVersionLifecycleService fileVersionLifecycleService;
    private final TransactionTemplate transactionTemplate;

    @Autowired(required = false)
    private SharedStorageService sharedStorageService;

    @Autowired(required = false)
    private SecretAccessGuard secretAccessGuard;

    @Autowired(required = false)
    private SecretFolderService secretFolderService;

    @Autowired(required = false)
    private FileDownloadShareLinkRepository fileDownloadShareLinkRepository;

    private record FileListPageReadResult(
            List<FileCommonDto.FileListItemRes> fileList,
            List<FileCommonDto.FileBreadcrumbRes> breadcrumbs,
            List<FileCommonDto.FileBreadcrumbRes> rootFolders,
            List<String> availableExtensions,
            int totalPage,
            long totalCount,
            int currentPage,
            int currentSize
    ) {}

    private record FolderTreeSnapshot(
            Map<Long, FileInfo> folderMap,
            Map<Long, List<FileInfo>> childrenByParent,
            List<FileInfo> rootLevelFolders,
            List<FileCommonDto.FileBreadcrumbRes> rootFolderSummaries
    ) {}

    private record SearchScopeResolution(
            String effectiveScope,
            boolean includeRootParent,
            Set<Long> allowedParentIds
    ) {}

    private record FileObjectReadMetadata(
            String objectKey,
            String fileOriginName,
            String fileSaveName,
            String fileFormat,
            Long fileSize
    ) {}
    @Transactional
    public int resetOwnedData(Long userIdx) {
        if (userIdx == null || userIdx <= 0L) {
            return 0;
        }

        List<FileInfo> files = fileUpDownloadRepository.findAllByUser_Idx(userIdx);
        if (files.isEmpty()) {
            return 0;
        }

        List<String> objectKeys = FileObjectRemovalRules.collectObjectKeysForRemoval(
                files,
                fileVersionLifecycleService.findVersionObjectKeys(files)
        );
        deleteFileShares(files);
        fileVersionLifecycleService.deleteVersionsForFiles(files);
        fileUpDownloadRepository.deleteAll(FileTreeRules.sortForDelete(files));
        FileObjectCleanupScheduler.deleteAfterCommit(fileObjectDeletionService, objectKeys);
        return files.size();
    }

    @Override
    public List<FileCommonDto.FileListItemRes> fileList(Long idx) {
        Long userIdx = idx == null ? 0L : idx;
        if (sharedStorageService != null && userIdx > 0L) {
            try {
                sharedStorageService.syncActiveSharedStorageDriveFoldersForUser(userIdx);
            } catch (Exception e) {
                log.debug("Failed to sync shared storage drive folders for user {}: {}", userIdx, e.getMessage());
            }
        }

        List<FileInfo> allFiles = fileUpDownloadRepository.findAllByUser_IdxOrderByLastModifyDateDescUploadDateDesc(userIdx);
        Set<Long> secretSubtreeIds = SecretTreeRules.collectHiddenOrVaultSubtreeIds(allFiles);

        List<FileCommonDto.FileListItemRes> items = allFiles.stream()
                .filter(file -> file.getIdx() == null || !secretSubtreeIds.contains(file.getIdx()))
                .map(this::toFileListItemMetadata)
                .toList();
        fileListItemUrlService.prepareThumbnailUrls(items);
        return items.stream()
                .map(fileListItemUrlService::attachUrls)
                .toList();
    }

    @Override
    public List<FileCommonDto.FileListItemRes> vaultFileList(Long userIdx) {
        Long normalizedUserIdx = userIdx == null ? 0L : userIdx;
        requireVaultUnlocked(normalizedUserIdx);

        List<FileInfo> allFiles = fileUpDownloadRepository.findAllByUser_IdxOrderByLastModifyDateDescUploadDateDesc(normalizedUserIdx);
        Map<Long, FileInfo> fileById = allFiles.stream()
                .filter(file -> file.getIdx() != null)
                .collect(HashMap::new, (map, file) -> map.put(file.getIdx(), file), HashMap::putAll);

        List<FileCommonDto.FileListItemRes> items = allFiles.stream()
                .filter(FileInfo::isVaultSpace)
                .filter(file -> !file.isTrashed() && !FileTreeRules.hasTrashedAncestor(file, fileById))
                .filter(file -> isSecretNodeAccessibleForCatalog(normalizedUserIdx, file))
                .map(this::toFileListItemMetadata)
                .toList();
        fileListItemUrlService.prepareThumbnailUrls(items);
        return items.stream()
                .map(fileListItemUrlService::attachUrls)
                .toList();
    }

    @Override
    public FileCommonDto.FileListPageRes fileListPage(Long userIdx, FileManageDto.ListPageReq request) {
        FileListPageReadResult readResult = transactionTemplate.execute(status -> loadFileListPageReadResult(userIdx, request));
        List<FileCommonDto.FileListItemRes> items = readResult.fileList();
        fileListItemUrlService.prepareThumbnailUrls(items);

        return FileCommonDto.FileListPageRes.builder()
                .fileList(items.stream().map(fileListItemUrlService::attachUrls).toList())
                .breadcrumbs(readResult.breadcrumbs())
                .rootFolders(readResult.rootFolders())
                .availableExtensions(readResult.availableExtensions())
                .totalPage(readResult.totalPage())
                .totalCount(readResult.totalCount())
                .currentPage(readResult.currentPage())
                .currentSize(readResult.currentSize())
                .build();
    }

    private FileListPageReadResult loadFileListPageReadResult(Long userIdx, FileManageDto.ListPageReq request) {
        Long normalizedUserIdx = userIdx == null ? 0L : userIdx;
        Long parentId = request != null ? request.getParentId() : null;
        boolean vaultMode = Boolean.TRUE.equals(request != null ? request.getVaultMode() : null);
        boolean includeHidden = Boolean.TRUE.equals(request != null ? request.getIncludeHidden() : null);
        boolean trashedOnly = Boolean.TRUE.equals(request != null ? request.getTrashedOnly() : null);
        int page = FileListQueryRules.sanitizePage(request != null ? request.getPage() : null);
        int size = FileListQueryRules.sanitizePageSize(request != null ? request.getSize() : null);

        if (vaultMode) {
            requireVaultUnlocked(normalizedUserIdx);
        } else if (parentId == null && sharedStorageService != null && normalizedUserIdx > 0L) {
            try {
                sharedStorageService.syncActiveSharedStorageDriveFoldersForUser(normalizedUserIdx);
            } catch (Exception e) {
                log.debug("Failed to sync shared storage drive folders for user {}: {}", normalizedUserIdx, e.getMessage());
            }
        }

        if (parentId != null) {
            FileInfo parent = getOwnedFile(normalizedUserIdx, parentId);
            if (parent.isTrashed() || FileTreeRules.resolveNodeType(parent) != FileNodeType.FOLDER) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            if (parent.isVaultSpace() != vaultMode) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            if (!includeHidden && SecretTreeRules.hasHiddenAncestor(parent)) {
                throw BaseException.from(BaseResponseStatus.SECRET_FOLDER_UNLOCK_REQUIRED);
            }
            assertSecretNodeAccess(normalizedUserIdx, parent, includeHidden);
        }

        FolderTreeSnapshot folderTree = buildFolderTreeSnapshot(normalizedUserIdx, vaultMode, includeHidden);
        SearchScopeResolution scopeResolution = resolveSearchScope(
                normalizedUserIdx,
                parentId,
                request,
                vaultMode,
                includeHidden,
                trashedOnly,
                folderTree
        );

        Pageable pageable = PageRequest.of(page, size, resolveSort(request != null ? request.getSortOption() : null));
        Page<FileInfo> result = fileUpDownloadRepository.findAll(
                buildPageSpecification(normalizedUserIdx, request, vaultMode, includeHidden, trashedOnly, scopeResolution),
                pageable
        );

        List<String> availableExtensions = resolveAvailableExtensions(
                normalizedUserIdx,
                parentId,
                vaultMode,
                includeHidden,
                trashedOnly,
                scopeResolution
        );

        return new FileListPageReadResult(
                result.getContent().stream()
                        .map(entity -> toFileListItemMetadata(entity, folderTree, vaultMode, trashedOnly))
                        .toList(),
                buildBreadcrumbs(normalizedUserIdx, parentId),
                (vaultMode && trashedOnly) ? List.of() : folderTree.rootFolderSummaries(),
                availableExtensions,
                result.getTotalPages(),
                result.getTotalElements(),
                result.getNumber(),
                result.getSize()
        );
    }

    @Override
    public FileCommonDto.FileListItemRes createFolder(Long userIdx, FileManageDto.FolderReq request) {
        if (request == null || request.getFolderName() == null || request.getFolderName().isBlank()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        String folderName = FileListQueryRules.sanitizeFolderName(request.getFolderName());
        boolean vaultRequested = Boolean.TRUE.equals(request.getVaultMode())
                || "VAULT".equalsIgnoreCase(request.getSpaceType());
        FileInfo parent = resolveParentFolder(userIdx, request.getParentId());

        if (parent != null) {
            if (vaultRequested && !parent.isVaultSpace()) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            if (Boolean.FALSE.equals(request.getVaultMode()) && parent.isVaultSpace()) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            assertSecretNodeAccess(userIdx, parent, true);
        } else if (vaultRequested) {
            requireVaultUnlocked(userIdx);
        }

        FileSpaceType targetSpace = (parent != null && parent.isVaultSpace()) || vaultRequested
                ? FileSpaceType.VAULT
                : FileSpaceType.DRIVE;
        boolean hidden = Boolean.TRUE.equals(request.getHidden());
        if (hidden && parent != null) {
            String parentSaveName = parent.getFileSaveName() == null ? "" : parent.getFileSaveName();
            if (parent.isSharedFile()
                    || parentSaveName.startsWith("shared-")
                    || shareRepository.countByFile_Idx(parent.getIdx()) > 0) {
                throw BaseException.from(BaseResponseStatus.SECRET_FOLDER_NOT_ALLOWED);
            }
        }
        boolean pinEnabled = hidden && Boolean.TRUE.equals(request.getPinEnabled());
        String pinHash = (pinEnabled && secretFolderService != null)
                ? secretFolderService.encodeOptionalFolderPin(true, request.getPin())
                : null;
        boolean shared = !vaultRequested && !hidden && targetSpace == FileSpaceType.DRIVE
                && Boolean.TRUE.equals(request.getSharedFile());

        FileInfo entity = FileInfo.builder()
                .user(User.builder().idx(userIdx).build())
                .parent(parent)
                .nodeType(FileNodeType.FOLDER)
                .spaceType(targetSpace)
                .hiddenFolder(hidden)
                .folderPinEnabled(pinEnabled)
                .folderPinHash(pinHash)
                .fileOriginName(folderName)
                .fileFormat("folder")
                .fileSaveName("folder-" + UUID.randomUUID())
                .fileSavePath(null)
                .fileSize(0L)
                .lockedFile(false)
                .sharedFile(shared)
                .trashed(false)
                .deletedAt(null)
                .build();

        FileInfo saved = fileUpDownloadRepository.save(entity);
        if (!hidden && targetSpace == FileSpaceType.DRIVE) {
            shareInheritanceService.inheritParentShares(parent, saved);
        }
        return toFileListItem(saved);
    }

    @Override
    public FileCommonDto.FileActionRes moveToTrash(Long userIdx, Long fileIdx) {
        FileInfo target = getOwnedFile(userIdx, fileIdx);
        assertSecretNodeAccess(userIdx, target, true);
        List<FileInfo> userFiles = fileUpDownloadRepository.findAllByUser_Idx(userIdx);
        List<FileInfo> targetTree = FileTreeRules.collectTargetTree(target, userFiles);
        FileTreeRules.ensureNoLockedFileNodes(targetTree);
        LocalDateTime deletedAt = LocalDateTime.now();

        if (sharedStorageService != null) {
            for (FileInfo node : targetTree) {
                Long storageIdx = SharedStorageService.extractSharedStorageIdxFromSaveName(node.getFileSaveName());
                if (storageIdx != null) {
                    boolean canTrashNow = sharedStorageService.handleDriveFolderMoveToTrash(userIdx, storageIdx, deletedAt);
                    if (!canTrashNow) {
                        throw BaseException.from(BaseResponseStatus.SHARED_STORAGE_DELETE_VOTE_REGISTERED);
                    }
                }
            }
        }

        targetTree.forEach(file -> file.markTrashed(deletedAt));
        fileUpDownloadRepository.saveAll(targetTree);

        return FileCommonDto.FileActionRes.builder()
                .targetIdx(fileIdx)
                .action("trash")
                .affectedCount(targetTree.size())
                .build();
    }

    @Override
    public FileCommonDto.FileActionRes restoreFromTrash(Long userIdx, Long fileIdx) {
        return restoreFilesFromTrash(userIdx, List.of(fileIdx));
    }

    @Override
    @Transactional
    public FileCommonDto.FileActionRes deletePermanently(Long userIdx, Long fileIdx) {
        FileInfo target = getOwnedFile(userIdx, fileIdx);
        assertSecretNodeAccess(userIdx, target, true);
        List<FileInfo> userFiles = fileUpDownloadRepository.findAllByUser_Idx(userIdx);
        List<FileInfo> targetTree = FileTreeRules.collectTargetTree(target, userFiles);
        FileTreeRules.ensureNoLockedFileNodes(targetTree);

        if (sharedStorageService != null) {
            for (FileInfo node : targetTree) {
                Long storageIdx = SharedStorageService.extractSharedStorageIdxFromSaveName(node.getFileSaveName());
                if (storageIdx != null) {
                    sharedStorageService.handleDriveFolderPermanentDelete(userIdx, storageIdx);
                }
            }
        }

        removeMinioObjectsAfterCommit(targetTree);
        deleteFileShares(targetTree);
        fileVersionLifecycleService.deleteVersionsForFiles(targetTree);
        fileUpDownloadRepository.deleteAll(FileTreeRules.sortForDelete(targetTree));

        return FileCommonDto.FileActionRes.builder()
                .targetIdx(fileIdx)
                .action("permanent-delete")
                .affectedCount(targetTree.size())
                .build();
    }

    @Override
    @Transactional
    public FileCommonDto.FileActionRes clearTrash(Long userIdx) {
        return clearTrash(userIdx, false);
    }

    @Override
    @Transactional
    public FileCommonDto.FileActionRes clearTrash(Long userIdx, boolean vaultMode) {
        if (vaultMode) {
            requireVaultUnlocked(userIdx);
        }
        List<FileInfo> trashedFiles = fileUpDownloadRepository.findAllByUser_Idx(userIdx)
                .stream()
                .filter(FileInfo::isTrashed)
                .filter(file -> file.isVaultSpace() == vaultMode)
                .filter(file -> isSecretNodeAccessibleForCatalog(userIdx, file))
                .toList();

        if (trashedFiles.isEmpty()) {
            return FileCommonDto.FileActionRes.builder()
                    .targetIdx(null)
                    .action("clear-trash")
                    .affectedCount(0)
                    .build();
        }

        FileTreeRules.ensureNoLockedFileNodes(trashedFiles);
        if (sharedStorageService != null) {
            for (FileInfo node : trashedFiles) {
                Long storageIdx = SharedStorageService.extractSharedStorageIdxFromSaveName(node.getFileSaveName());
                if (storageIdx != null) {
                    sharedStorageService.handleDriveFolderPermanentDelete(userIdx, storageIdx);
                }
            }
        }
        removeMinioObjectsAfterCommit(trashedFiles);
        deleteFileShares(trashedFiles);
        fileVersionLifecycleService.deleteVersionsForFiles(trashedFiles);
        fileUpDownloadRepository.deleteAll(FileTreeRules.sortForDelete(trashedFiles));

        return FileCommonDto.FileActionRes.builder()
                .targetIdx(null)
                .action("clear-trash")
                .affectedCount(trashedFiles.size())
                .build();
    }

    @Override
    @Transactional
    public FileCommonDto.FileActionRes moveToFolder(Long userIdx, Long fileIdx, Long targetParentId) {
        return moveFilesToFolder(userIdx, fileIdx == null ? List.of() : List.of(fileIdx), targetParentId);
    }

    @Override
    @Transactional
    public FileCommonDto.FileActionRes moveFilesToFolder(Long userIdx, List<Long> fileIdxList, Long targetParentId) {
        return moveFilesToTargetSpace(userIdx, fileIdxList, targetParentId, null);
    }

    @Override
    @Transactional
    public FileCommonDto.FileActionRes moveToVault(Long userIdx, Long fileIdx, Long targetParentId) {
        return moveFilesToVault(userIdx, fileIdx == null ? List.of() : List.of(fileIdx), targetParentId);
    }

    @Override
    @Transactional
    public FileCommonDto.FileActionRes moveFilesToVault(Long userIdx, List<Long> fileIdxList, Long targetParentId) {
        return moveFilesToTargetSpace(userIdx, fileIdxList, targetParentId, FileSpaceType.VAULT);
    }

    private FileCommonDto.FileActionRes moveFilesToTargetSpace(
            Long userIdx,
            List<Long> fileIdxList,
            Long targetParentId,
            FileSpaceType requestedTargetSpace
    ) {
        if (fileIdxList == null || fileIdxList.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        boolean vaultAccessChecked = false;
        if (requestedTargetSpace == FileSpaceType.VAULT) {
            requireVaultUnlocked(userIdx);
            vaultAccessChecked = true;
        }

        List<FileInfo> userFiles = fileUpDownloadRepository.findAllByUser_Idx(userIdx);
        Map<Long, FileInfo> fileById = userFiles.stream()
                .filter(file -> file.getIdx() != null)
                .collect(HashMap::new, (map, file) -> map.put(file.getIdx(), file), HashMap::putAll);
        FileInfo targetParent = resolveParentFolder(userIdx, targetParentId);
        if (targetParent != null) {
            assertSecretNodeAccess(userIdx, targetParent, true);
            if (requestedTargetSpace != null && targetParent.resolveSpaceType() != requestedTargetSpace) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
        }

        List<FileInfo> requestedSources = fileIdxList.stream()
                .filter(Objects::nonNull)
                .distinct()
                .map(fileIdx -> resolveOwnedFile(fileById, userIdx, fileIdx))
                .toList();

        if (requestedSources.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        Set<Long> requestedSourceIds = requestedSources.stream()
                .map(FileInfo::getIdx)
                .filter(Objects::nonNull)
                .collect(HashSet::new, HashSet::add, HashSet::addAll);

        List<FileInfo> topLevelSources = requestedSources.stream()
                .filter(source -> !FileTreeRules.hasSelectedAncestor(source, requestedSourceIds, fileById))
                .toList();

        if (targetParent != null) {
            for (FileInfo source : topLevelSources) {
                if (source.getIdx().equals(targetParent.getIdx())) {
                    throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
                }
            }
        }

        FileSpaceType targetSpace = targetParent != null
                ? targetParent.resolveSpaceType()
                : (requestedTargetSpace != null ? requestedTargetSpace : topLevelSources.get(0).resolveSpaceType());
        if (targetSpace == FileSpaceType.VAULT && !vaultAccessChecked) {
            requireVaultUnlocked(userIdx);
        }
        boolean targetHiddenOrVault = targetSpace == FileSpaceType.VAULT
                || (targetParent != null && SecretTreeRules.hasHiddenAncestor(targetParent));
        boolean explicitVaultDestination = requestedTargetSpace == FileSpaceType.VAULT
                || (targetParent != null && targetParent.isVaultSpace());

        List<FileInfo> nodesToSave = new ArrayList<>();
        Set<Long> queuedNodeIds = new HashSet<>();

        for (FileInfo source : topLevelSources) {
            if (source.isTrashed()) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            assertSecretNodeAccess(userIdx, source, true);

            boolean movingIntoVault = explicitVaultDestination
                    && targetSpace == FileSpaceType.VAULT
                    && source.resolveSpaceType() == FileSpaceType.DRIVE;
            if (source.resolveSpaceType() != targetSpace && !movingIntoVault) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }

            List<FileInfo> subtree = FileTreeRules.resolveNodeType(source) == FileNodeType.FOLDER
                    ? FileTreeRules.collectTargetTree(source, userFiles)
                    : List.of(source);

            if (targetParent != null) {
                boolean movingIntoOwnTree = subtree.stream()
                        .map(FileInfo::getIdx)
                        .anyMatch(idx -> idx != null && idx.equals(targetParent.getIdx()));

                if (movingIntoOwnTree) {
                    throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
                }
            }

            List<FileInfo> activeSubtreeNodes = new ArrayList<>();
            List<FileInfo> trashedDescendants = new ArrayList<>();
            for (FileInfo node : subtree) {
                if (node != source && node.isTrashed()) {
                    trashedDescendants.add(node);
                } else {
                    activeSubtreeNodes.add(node);
                }
            }

            for (FileInfo node : activeSubtreeNodes) {
                if (node != source) {
                    assertSecretNodeAccess(userIdx, node, true);
                }
            }
            FileTreeRules.ensureNoLockedFileNodes(activeSubtreeNodes);

            if (targetHiddenOrVault) {
                ensureNoSharedNodesInSubtree(activeSubtreeNodes);
            }

            source.changeParent(targetParent);
            queueNodeForSave(nodesToSave, queuedNodeIds, source);

            if (movingIntoVault) {
                for (FileInfo activeNode : activeSubtreeNodes) {
                    activeNode.changeSpaceType(FileSpaceType.VAULT);
                    if (activeNode.isHiddenFolder() || activeNode.isFolderPinEnabled() || activeNode.hasFolderPin()) {
                        activeNode.updateHiddenSettings(false, false, null);
                    }
                    queueNodeForSave(nodesToSave, queuedNodeIds, activeNode);
                }
                for (FileInfo trashedDescendant : trashedDescendants) {
                    FileInfo descendantParent = trashedDescendant.getParent();
                    if (descendantParent != null && !descendantParent.isTrashed()) {
                        trashedDescendant.changeParent(null);
                        queueNodeForSave(nodesToSave, queuedNodeIds, trashedDescendant);
                    }
                }
            }
        }

        fileUpDownloadRepository.saveAll(nodesToSave);

        return FileCommonDto.FileActionRes.builder()
                .targetIdx(targetParentId)
                .action(requestedTargetSpace == FileSpaceType.VAULT ? "move-to-vault" : "move")
                .affectedCount(topLevelSources.size())
                .build();
    }

    private void ensureNoSharedNodesInSubtree(List<FileInfo> nodes) {
        if (nodes == null || nodes.isEmpty()) {
            return;
        }
        List<Long> nodeIds = new ArrayList<>();
        for (FileInfo node : nodes) {
            String saveName = node.getFileSaveName();
            if (node.isSharedFile() || (saveName != null && saveName.startsWith("shared-"))) {
                throw BaseException.from(BaseResponseStatus.SECRET_FOLDER_NOT_ALLOWED);
            }
            if (node.getIdx() != null) {
                nodeIds.add(node.getIdx());
            }
        }
        if (!nodeIds.isEmpty() && !shareRepository.findAllByFile_IdxIn(nodeIds).isEmpty()) {
            throw BaseException.from(BaseResponseStatus.SECRET_FOLDER_NOT_ALLOWED);
        }
    }

    private void queueNodeForSave(List<FileInfo> nodesToSave, Set<Long> queuedNodeIds, FileInfo node) {
        if (node == null) {
            return;
        }
        Long idx = node.getIdx();
        if (idx == null || queuedNodeIds.add(idx)) {
            nodesToSave.add(node);
        }
    }

    @Override
    public FileCommonDto.FileActionRes restoreFilesFromTrash(Long userIdx, List<Long> fileIdxList) {
        if (fileIdxList == null || fileIdxList.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        List<FileInfo> userFiles = fileUpDownloadRepository.findAllByUser_Idx(userIdx);
        Map<Long, FileInfo> fileById = userFiles.stream()
                .filter(file -> file.getIdx() != null)
                .collect(HashMap::new, (map, file) -> map.put(file.getIdx(), file), HashMap::putAll);

        List<FileInfo> requestedTargets = fileIdxList.stream()
                .filter(Objects::nonNull)
                .distinct()
                .map(fileIdx -> resolveOwnedFile(fileById, userIdx, fileIdx))
                .toList();

        if (requestedTargets.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        List<FileInfo> topLevelTargets = requestedTargets.stream()
                .filter(target -> target.isTrashed())
                .filter(target -> !FileTreeRules.hasTrashedAncestor(target, fileById))
                .toList();

        if (topLevelTargets.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        List<FileInfo> restoreTargets = new ArrayList<>();
        Set<Long> restoredIds = new HashSet<>();

        for (FileInfo target : topLevelTargets) {
            assertSecretNodeAccess(userIdx, target, true);
            validateRestorableParent(target, fileById);
            for (FileInfo node : FileTreeRules.collectTargetTree(target, userFiles)) {
                if (node.getIdx() != null && restoredIds.add(node.getIdx())) {
                    if (!node.isTrashed()) {
                        continue;
                    }
                    node.restore();
                    restoreTargets.add(node);
                }
            }
        }

        fileUpDownloadRepository.saveAll(restoreTargets);

        if (sharedStorageService != null) {
            for (FileInfo node : restoreTargets) {
                Long storageIdx = SharedStorageService.extractSharedStorageIdxFromSaveName(node.getFileSaveName());
                if (storageIdx != null) {
                    sharedStorageService.handleDriveFolderRestore(userIdx, storageIdx);
                }
            }
        }

        return FileCommonDto.FileActionRes.builder()
                .targetIdx(null)
                .action("restore")
                .affectedCount(restoreTargets.size())
                .build();
    }

    @Override
    public FileCommonDto.FileListItemRes renameFolder(Long userIdx, Long folderIdx, String folderName) {
        FileInfo item = getOwnedFile(userIdx, folderIdx);
        assertSecretNodeAccess(userIdx, item, true);
        if (item.isTrashed() || item.isLockedFile()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        String sanitizedName = FileListQueryRules.sanitizeFolderName(folderName);
        item.rename(sanitizedName);
        FileInfo saved = fileUpDownloadRepository.save(item);
        if (sharedStorageService != null) {
            Long storageIdx = SharedStorageService.extractSharedStorageIdxFromSaveName(saved.getFileSaveName());
            if (storageIdx != null) {
                sharedStorageService.handleDriveFolderRename(userIdx, storageIdx, sanitizedName);
            }
        }
        return toFileListItem(saved);
    }

    @Override
    public FileInfoDto.FolderPropertyRes getFolderProperties(Long userIdx, Long folderIdx) {
        FileInfo folder = getOwnedFile(userIdx, folderIdx);
        assertSecretNodeAccess(userIdx, folder, true);
        if (folder.isTrashed() || FileTreeRules.resolveNodeType(folder) != FileNodeType.FOLDER) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        List<FileInfo> userFiles = fileUpDownloadRepository.findAllByUser_Idx(userIdx)
                .stream()
                .filter(file -> !file.isTrashed())
                .toList();
        Set<Long> hiddenSkipIds = new HashSet<>();
        if (!folder.isHiddenFolder() && !folder.isVaultSpace()) {
            hiddenSkipIds.addAll(SecretTreeRules.collectHiddenSubtreeIds(userFiles));
        }
        hiddenSkipIds.addAll(collectLockedHiddenSubtreeIds(userIdx, userFiles, folderIdx));
        List<FileInfo> directChildren = userFiles.stream()
                .filter(file -> file.getParent() != null && folderIdx.equals(file.getParent().getIdx()))
                .filter(file -> file.getIdx() == null || !hiddenSkipIds.contains(file.getIdx()))
                .toList();
        List<FileInfo> targetTree = FileTreeRules.collectTargetTree(folder, userFiles);
        List<FileInfo> descendants = targetTree.stream()
                .filter(file -> !folderIdx.equals(file.getIdx()))
                .filter(file -> file.getIdx() == null || !hiddenSkipIds.contains(file.getIdx()))
                .toList();

        int directFileCount = (int) directChildren.stream()
                .filter(file -> FileTreeRules.resolveNodeType(file) == FileNodeType.FILE)
                .count();
        int directFolderCount = (int) directChildren.stream()
                .filter(file -> FileTreeRules.resolveNodeType(file) == FileNodeType.FOLDER)
                .count();
        int totalFileCount = (int) descendants.stream()
                .filter(file -> FileTreeRules.resolveNodeType(file) == FileNodeType.FILE)
                .count();
        int totalFolderCount = (int) descendants.stream()
                .filter(file -> FileTreeRules.resolveNodeType(file) == FileNodeType.FOLDER)
                .count();
        long directSize = directChildren.stream()
                .filter(file -> FileTreeRules.resolveNodeType(file) == FileNodeType.FILE)
                .map(FileInfo::getFileSize)
                .filter(size -> size != null && size > 0)
                .mapToLong(Long::longValue)
                .sum();
        long totalSize = descendants.stream()
                .filter(file -> FileTreeRules.resolveNodeType(file) == FileNodeType.FILE)
                .map(FileInfo::getFileSize)
                .filter(size -> size != null && size > 0)
                .mapToLong(Long::longValue)
                .sum();

        return FileInfoDto.FolderPropertyRes.builder()
                .idx(folder.getIdx())
                .folderName(folder.getFileOriginName())
                .parentId(folder.getParent() != null ? folder.getParent().getIdx() : null)
                .directChildCount(directChildren.size())
                .directFileCount(directFileCount)
                .directFolderCount(directFolderCount)
                .totalChildCount(descendants.size())
                .totalFileCount(totalFileCount)
                .totalFolderCount(totalFolderCount)
                .directSize(directSize)
                .totalSize(totalSize)
                .uploadDate(folder.getUploadDate())
                .lastModifyDate(folder.getLastModifyDate())
                .build();
    }

    @Override
    public FileInfoDto.StorageSummaryRes getStorageSummary(Long userIdx) {
        return fileStorageSummaryService.getStorageSummary(userIdx);
    }

    @Override
    public FileInfoDto.TextPreviewRes getTextPreview(Long userIdx, Long fileIdx) {
        FileObjectReadMetadata metadata = resolveFileObjectReadMetadata(userIdx, fileIdx, true);

        return fileObjectDownloadService.readTextPreview(
                fileIdx,
                metadata.objectKey(),
                metadata.fileOriginName(),
                metadata.fileFormat(),
                metadata.fileSize()
        );
    }

    @Override
    public FileCommonDto.FileDownloadPayload downloadFile(Long userIdx, Long fileIdx) {
        FileObjectReadMetadata metadata = resolveFileObjectReadMetadata(userIdx, fileIdx, false);

        return new FileCommonDto.FileDownloadPayload(
                fileObjectDownloadService.readObjectBytes(metadata.objectKey()),
                FileDownloadRules.downloadContentType(metadata.fileOriginName()),
                FileDownloadRules.downloadFileName(metadata.fileOriginName(), metadata.fileSaveName()),
                metadata.fileSize()
        );
    }

    @Override
    public String getDownloadUrl(Long userIdx, Long fileIdx) {
        FileObjectReadMetadata metadata = resolveFileObjectReadMetadata(userIdx, fileIdx, false);

        return fileObjectDownloadService.generateAttachmentDownloadUrl(
                metadata.objectKey(),
                FileDownloadRules.downloadFileName(metadata.fileOriginName(), metadata.fileSaveName()),
                FileDownloadRules.downloadContentType(metadata.fileOriginName())
        );
    }

    @Override
    public FileCommonDto.FolderZipDownloadPayload downloadFolderZip(Long userIdx, Long folderIdx) {
        FileInfo rootFolder = getOwnedFile(userIdx, folderIdx);
        assertSecretNodeAccess(userIdx, rootFolder, true);
        if (rootFolder.isTrashed() || FileTreeRules.resolveNodeType(rootFolder) != FileNodeType.FOLDER) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        String rawFolderName = rootFolder.getFileOriginName();
        String rootFolderName = FileListQueryRules.sanitizeFolderName(rawFolderName);
        if (rootFolderName == null || rootFolderName.isBlank()) {
            rootFolderName = "folder";
        }

        List<FileInfo> userFiles = fileUpDownloadRepository.findAllByUser_Idx(userIdx);
        List<FileInfo> targetTree = FileTreeRules.collectTargetTree(rootFolder, userFiles);
        Set<Long> hiddenZipSkip = new HashSet<>();
        if (!rootFolder.isHiddenFolder() && !rootFolder.isVaultSpace()) {
            hiddenZipSkip.addAll(SecretTreeRules.collectHiddenSubtreeIds(targetTree));
        }
        hiddenZipSkip.addAll(collectLockedHiddenSubtreeIds(userIdx, targetTree, rootFolder.getIdx()));

        Map<Long, FileInfo> fileMap = targetTree.stream()
                .filter(f -> f.getIdx() != null)
                .collect(Collectors.toMap(FileInfo::getIdx, f -> f, (a, b) -> a));

        List<FolderZipItem> itemsToZip = new ArrayList<>();
        Set<String> addedEntries = new HashSet<>();

        String rootEntryPath = rootFolderName + "/";
        itemsToZip.add(new FolderZipItem(true, rootEntryPath, null, rootFolder.getLastModifyDate()));
        addedEntries.add(rootEntryPath);

        for (FileInfo item : targetTree) {
            if (item.getIdx() == null
                    || item.getIdx().equals(rootFolder.getIdx())
                    || item.isTrashed()
                    || hiddenZipSkip.contains(item.getIdx())) {
                continue;
            }

            String relativePath = buildRelativePath(item, rootFolder, fileMap);
            if (relativePath.isBlank()) {
                continue;
            }

            FileNodeType nodeType = FileTreeRules.resolveNodeType(item);
            if (nodeType == FileNodeType.FOLDER) {
                String dirPath = rootFolderName + "/" + relativePath + "/";
                if (addedEntries.add(dirPath)) {
                    itemsToZip.add(new FolderZipItem(true, dirPath, null, item.getLastModifyDate()));
                }
            } else if (nodeType == FileNodeType.FILE && !item.isLockedFile()) {
                String objectKey = item.getFileSavePath();
                if (objectKey == null || objectKey.isBlank()) {
                    continue;
                }

                String filePath = rootFolderName + "/" + relativePath;
                filePath = ensureUniqueZipEntry(filePath, addedEntries);
                itemsToZip.add(new FolderZipItem(false, filePath, objectKey, item.getLastModifyDate()));
            }
        }

        final List<FolderZipItem> finalItems = itemsToZip;
        StreamingResponseBody streamingBody = outputStream -> {
            try (ZipOutputStream zos = new ZipOutputStream(outputStream, StandardCharsets.UTF_8)) {
                for (FolderZipItem zipItem : finalItems) {
                    try {
                        ZipEntry zipEntry = new ZipEntry(zipItem.entryPath());
                        if (zipItem.lastModifyDate() != null) {
                            zipEntry.setTime(zipItem.lastModifyDate().atZone(ZoneId.systemDefault()).toInstant().toEpochMilli());
                        }
                        if (zipItem.directory()) {
                            zos.putNextEntry(zipEntry);
                            zos.closeEntry();
                        } else {
                            try (InputStream is = fileObjectDownloadService.openObjectStream(zipItem.fileSavePath())) {
                                zos.putNextEntry(zipEntry);
                                is.transferTo(zos);
                                zos.closeEntry();
                            }
                        }
                    } catch (Exception e) {
                        log.warn("Failed to add entry [{}] to folder zip: {}", zipItem.entryPath(), e.getMessage());
                    }
                }
                zos.finish();
                zos.flush();
            }
        };

        return new FileCommonDto.FolderZipDownloadPayload(rootFolderName, streamingBody);
    }

    private String buildRelativePath(FileInfo node, FileInfo rootFolder, Map<Long, FileInfo> fileMap) {
        if (node == null || node.getIdx() == null || node.getIdx().equals(rootFolder.getIdx())) {
            return "";
        }
        List<String> segments = new ArrayList<>();
        FileInfo current = node;
        Set<Long> visited = new HashSet<>();
        while (current != null && current.getIdx() != null && !current.getIdx().equals(rootFolder.getIdx()) && visited.add(current.getIdx())) {
            segments.add(sanitizeZipSegment(current.getFileOriginName()));
            FileInfo parent = current.getParent();
            if (parent == null || parent.getIdx() == null) {
                break;
            }
            current = fileMap.get(parent.getIdx());
        }
        Collections.reverse(segments);
        return String.join("/", segments);
    }

    private String sanitizeZipSegment(String rawSegment) {
        String normalized = rawSegment == null ? "" : rawSegment.trim();
        normalized = normalized
                .replace("\u0000", "")
                .replace('/', '_')
                .replace('\\', '_')
                .replace(':', '_');
        while (normalized.contains("..")) {
            normalized = normalized.replace("..", "_");
        }
        if (normalized.isBlank() || ".".equals(normalized)) {
            return "unnamed";
        }
        return normalized;
    }

    private String ensureUniqueZipEntry(String path, Set<String> addedEntries) {
        if (addedEntries.add(path)) {
            return path;
        }
        int slashIndex = path.lastIndexOf('/');
        int dotIndex = path.lastIndexOf('.');
        String base = (dotIndex > slashIndex) ? path.substring(0, dotIndex) : path;
        String ext = (dotIndex > slashIndex) ? path.substring(dotIndex) : "";

        int counter = 1;
        String candidate;
        do {
            candidate = base + " (" + counter + ")" + ext;
            counter++;
        } while (!addedEntries.add(candidate));
        return candidate;
    }

    private record FolderZipItem(
            boolean directory,
            String entryPath,
            String fileSavePath,
            LocalDateTime lastModifyDate
    ) {}

    private FileObjectReadMetadata resolveFileObjectReadMetadata(Long userIdx, Long fileIdx, boolean requireTextPreviewable) {
        return transactionTemplate.execute(status -> {
            FileInfo file = getOwnedFile(userIdx, fileIdx);
            assertSecretNodeAccess(userIdx, file, true);
            if (FileTreeRules.resolveNodeType(file) != FileNodeType.FILE || file.isLockedFile()) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            if (requireTextPreviewable && !isTextPreviewable(file.getFileFormat())) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            String objectKey = file.getFileSavePath();
            if (objectKey == null || objectKey.isBlank()) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            return new FileObjectReadMetadata(
                    objectKey,
                    file.getFileOriginName(),
                    file.getFileSaveName(),
                    file.getFileFormat(),
                    file.getFileSize()
            );
        });
    }

    private FileInfo resolveParentFolder(Long userIdx, Long parentId) {
        if (parentId == null) {
            return null;
        }

        FileInfo parent = getOwnedFile(userIdx, parentId);
        if (FileTreeRules.resolveNodeType(parent) != FileNodeType.FOLDER || parent.isTrashed()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        return parent;
    }

    private FileInfo getOwnedFile(Long userIdx, Long fileIdx) {
        if (userIdx == null || fileIdx == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        return fileUpDownloadRepository.findByIdxAndUser_Idx(fileIdx, userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));
    }

    private FileInfo resolveOwnedFile(Map<Long, FileInfo> fileById, Long userIdx, Long fileIdx) {
        FileInfo file = fileById.get(fileIdx);
        if (file != null) {
            return file;
        }

        return getOwnedFile(userIdx, fileIdx);
    }

    private void validateRestorableParent(FileInfo file, Map<Long, FileInfo> fileById) {
        FileInfo parent = file.getParent();
        if (parent == null || parent.getIdx() == null) {
            return;
        }

        FileInfo resolvedParent = fileById.getOrDefault(parent.getIdx(), parent);
        if (resolvedParent.isTrashed() || FileTreeRules.resolveNodeType(resolvedParent) != FileNodeType.FOLDER) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    @Override
    public FileCommonDto.FileActionRes setLockedFiles(Long userIdx, List<Long> fileIdxList, boolean locked) {
        if (fileIdxList == null || fileIdxList.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        StoragePlanService.StorageQuota storageQuota = storagePlanService.resolveQuota(userIdx);
        if (locked && !storageQuota.fileLockEnabled()) {
            throw BaseException.from(BaseResponseStatus.PLAN_FEATURE_NOT_AVAILABLE);
        }

        List<FileInfo> files = fileIdxList.stream()
                .filter(Objects::nonNull)
                .distinct()
                .map(fileIdx -> getOwnedFile(userIdx, fileIdx))
                .toList();

        for (FileInfo file : files) {
            assertSecretNodeAccess(userIdx, file, true);
            if (FileTreeRules.resolveNodeType(file) != FileNodeType.FILE || file.isTrashed()) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            file.changeLockedFile(locked);
        }

        fileUpDownloadRepository.saveAll(files);

        return FileCommonDto.FileActionRes.builder()
                .targetIdx(null)
                .action(locked ? "lock" : "unlock")
                .affectedCount(files.size())
                .build();
    }

    private void removeMinioObjectsAfterCommit(List<FileInfo> files) {
        List<String> objectKeys = FileObjectRemovalRules.collectObjectKeysForRemoval(
                files,
                fileVersionLifecycleService.findVersionObjectKeys(files)
        );
        FileObjectCleanupScheduler.deleteAfterCommit(fileObjectDeletionService, objectKeys);
    }

    private void deleteFileShares(List<FileInfo> files) {
        List<Long> fileIds = FileObjectRemovalRules.collectFileIds(files);
        if (fileIds.isEmpty()) {
            return;
        }

        if (fileDownloadShareLinkRepository != null) {
            fileDownloadShareLinkRepository.deleteAllByFile_IdxIn(fileIds);
        }

        List<com.example.WaffleBear.file.share.model.FileShare> shares = shareRepository.findAllByFile_IdxIn(fileIds);
        if (shares.isEmpty()) {
            return;
        }

        shareRepository.deleteAll(shares);
    }

    private Specification<FileInfo> buildPageSpecification(
            Long userIdx,
            FileManageDto.ListPageReq request,
            boolean vaultMode,
            boolean includeHidden,
            boolean trashedOnly,
            SearchScopeResolution scopeResolution
    ) {
        return (root, query, criteriaBuilder) -> {
            List<Predicate> predicates = new ArrayList<>();
            FileListQueryRules.ParsedSearchKeyword parsedKeyword = FileListQueryRules.parseSearchKeyword(
                    request != null ? request.getSearchQuery() : null
            );
            List<String> requestedExtensions = FileListQueryRules.parseExtensionFilters(
                    request != null ? request.getExtensionFilter() : null
            );
            String sizeFilter = FileListQueryRules.normalizeFilterValue(request != null ? request.getSizeFilter() : null, "all");
            String statusFilter = FileListQueryRules.normalizeFilterValue(request != null ? request.getStatusFilter() : null, "all");

            Predicate isFile = criteriaBuilder.or(
                    criteriaBuilder.isNull(root.get("nodeType")),
                    criteriaBuilder.equal(root.get("nodeType"), FileNodeType.FILE)
            );
            Predicate isFolder = criteriaBuilder.equal(root.get("nodeType"), FileNodeType.FOLDER);

            predicates.add(criteriaBuilder.equal(root.get("user").get("idx"), userIdx));

            if (vaultMode && trashedOnly) {
                predicates.add(criteriaBuilder.isTrue(root.get("trashed")));
            } else {
                predicates.add(criteriaBuilder.or(
                        criteriaBuilder.isNull(root.get("trashed")),
                        criteriaBuilder.isFalse(root.get("trashed"))
                ));

                if (scopeResolution.includeRootParent() && !scopeResolution.allowedParentIds().isEmpty()) {
                    predicates.add(criteriaBuilder.or(
                            criteriaBuilder.isNull(root.get("parent")),
                            root.get("parent").get("idx").in(scopeResolution.allowedParentIds())
                    ));
                } else if (scopeResolution.includeRootParent()) {
                    predicates.add(criteriaBuilder.isNull(root.get("parent")));
                } else if (scopeResolution.allowedParentIds().size() == 1) {
                    Long singleParentId = scopeResolution.allowedParentIds().iterator().next();
                    predicates.add(criteriaBuilder.equal(root.get("parent").get("idx"), singleParentId));
                } else if (!scopeResolution.allowedParentIds().isEmpty()) {
                    predicates.add(root.get("parent").get("idx").in(scopeResolution.allowedParentIds()));
                } else {
                    predicates.add(criteriaBuilder.disjunction());
                }
            }

            if (vaultMode) {
                predicates.add(criteriaBuilder.equal(root.get("spaceType"), FileSpaceType.VAULT));
            } else {
                predicates.add(criteriaBuilder.or(
                        criteriaBuilder.isNull(root.get("spaceType")),
                        criteriaBuilder.equal(root.get("spaceType"), FileSpaceType.DRIVE)
                ));
            }

            if (!includeHidden && !(vaultMode && trashedOnly)) {
                predicates.add(criteriaBuilder.or(
                        criteriaBuilder.isNull(root.get("hiddenFolder")),
                        criteriaBuilder.isFalse(root.get("hiddenFolder"))
                ));
            }

            if (!parsedKeyword.textTerm().isBlank()) {
                for (String term : parsedKeyword.textTerm().split("\\s+")) {
                    String likePattern = "%" + FileListQueryRules.escapeLikePattern(term) + "%";
                    predicates.add(criteriaBuilder.or(
                            criteriaBuilder.like(criteriaBuilder.lower(root.get("fileOriginName")), likePattern, '\\'),
                            criteriaBuilder.like(criteriaBuilder.lower(root.get("fileFormat")), likePattern, '\\')
                    ));
                }
            }

            if (!parsedKeyword.inlineExtensions().isEmpty()) {
                predicates.add(buildExtensionPredicate(criteriaBuilder, root, isFile, parsedKeyword.inlineExtensions()));
            }

            if (!requestedExtensions.isEmpty()) {
                predicates.add(buildExtensionPredicate(criteriaBuilder, root, isFile, requestedExtensions));
            }

            if (!"all".equals(sizeFilter)) {
                Expression<Long> fileSize = criteriaBuilder.coalesce(root.get("fileSize"), 0L);
                Predicate sizePredicate = switch (sizeFilter) {
                    case "lte10" -> criteriaBuilder.lessThanOrEqualTo(fileSize, FileListQueryRules.megabytesToBytes(10L));
                    case "lte100" -> criteriaBuilder.lessThanOrEqualTo(fileSize, FileListQueryRules.megabytesToBytes(100L));
                    case "lte1000" -> criteriaBuilder.lessThanOrEqualTo(fileSize, FileListQueryRules.megabytesToBytes(1000L));
                    case "lte100000" -> criteriaBuilder.lessThanOrEqualTo(fileSize, FileListQueryRules.megabytesToBytes(100000L));
                    case "gte100001" -> criteriaBuilder.greaterThanOrEqualTo(fileSize, FileListQueryRules.megabytesToBytes(100001L));
                    case "custom" -> buildCustomSizePredicate(criteriaBuilder, fileSize, request);
                    default -> null;
                };

                if (sizePredicate != null) {
                    predicates.add(criteriaBuilder.or(isFolder, criteriaBuilder.and(isFile, sizePredicate)));
                }
            }

            switch (statusFilter) {
                case "shared", "shared-owned" -> predicates.add(criteriaBuilder.isTrue(root.get("sharedFile")));
                case "shared-with-me" -> predicates.add(criteriaBuilder.disjunction());
                case "locked" -> predicates.add(criteriaBuilder.isTrue(root.get("lockedFile")));
                case "unlocked" -> predicates.add(criteriaBuilder.isFalse(root.get("lockedFile")));
                default -> {
                }
            }

            return criteriaBuilder.and(predicates.toArray(Predicate[]::new));
        };
    }

    private Predicate buildCustomSizePredicate(
            jakarta.persistence.criteria.CriteriaBuilder criteriaBuilder,
            Expression<Long> fileSize,
            FileManageDto.ListPageReq request
    ) {
        Long minBytes = FileListQueryRules.parseMegabytesToBytes(request != null ? request.getCustomMinSize() : null);
        Long maxBytes = FileListQueryRules.parseMegabytesToBytes(request != null ? request.getCustomMaxSize() : null);

        if (minBytes == null && maxBytes == null) {
            return null;
        }
        if (minBytes != null && maxBytes != null) {
            return criteriaBuilder.between(fileSize, minBytes, maxBytes);
        }
        if (minBytes != null) {
            return criteriaBuilder.greaterThanOrEqualTo(fileSize, minBytes);
        }
        return criteriaBuilder.lessThanOrEqualTo(fileSize, maxBytes);
    }

    private List<FileCommonDto.FileBreadcrumbRes> buildBreadcrumbs(Long userIdx, Long parentId) {
        if (parentId == null) {
            return List.of();
        }

        List<FileCommonDto.FileBreadcrumbRes> breadcrumbs = new ArrayList<>();
        FileInfo cursor = getOwnedFile(userIdx, parentId);
        if (cursor.isTrashed() || FileTreeRules.resolveNodeType(cursor) != FileNodeType.FOLDER) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        while (cursor != null) {
            breadcrumbs.add(FileCommonDto.FileBreadcrumbRes.builder()
                    .idx(cursor.getIdx())
                    .fileOriginName(cursor.getFileOriginName())
                    .parentId(cursor.getParent() != null ? cursor.getParent().getIdx() : null)
                    .build());
            cursor = cursor.getParent();
        }

        Collections.reverse(breadcrumbs);
        return breadcrumbs;
    }

    private Sort resolveSort(String sortOption) {
        String normalizedSort = FileListQueryRules.normalizeFilterValue(sortOption, "updatedat-desc");

        return switch (normalizedSort) {
            case "updatedat-asc" -> Sort.by(
                    Sort.Order.asc("lastModifyDate"),
                    Sort.Order.asc("uploadDate")
            );
            case "name-asc" -> Sort.by(Sort.Order.asc("fileOriginName").ignoreCase());
            case "name-desc" -> Sort.by(Sort.Order.desc("fileOriginName").ignoreCase());
            case "size-asc" -> Sort.by(Sort.Order.asc("fileSize"), Sort.Order.desc("lastModifyDate"));
            case "size-desc" -> Sort.by(Sort.Order.desc("fileSize"), Sort.Order.desc("lastModifyDate"));
            default -> Sort.by(
                    Sort.Order.desc("lastModifyDate"),
                    Sort.Order.desc("uploadDate")
            );
        };
    }

    private Predicate buildExtensionPredicate(
            jakarta.persistence.criteria.CriteriaBuilder criteriaBuilder,
            jakarta.persistence.criteria.Root<FileInfo> root,
            Predicate isFile,
            List<String> extensions
    ) {
        List<Predicate> extMatches = new ArrayList<>();
        for (String ext : extensions) {
            String escapedExt = FileListQueryRules.escapeLikePattern(ext);
            extMatches.add(criteriaBuilder.or(
                    criteriaBuilder.equal(criteriaBuilder.lower(root.get("fileFormat")), ext),
                    criteriaBuilder.like(criteriaBuilder.lower(root.get("fileOriginName")), "%." + escapedExt, '\\')
            ));
        }
        return criteriaBuilder.and(isFile, criteriaBuilder.or(extMatches.toArray(Predicate[]::new)));
    }

    private FolderTreeSnapshot buildFolderTreeSnapshot(Long userIdx, boolean vaultMode, boolean includeHidden) {
        List<FileInfo> rawFolders = fileUpDownloadRepository.findActiveFoldersByUserAndSpace(
                userIdx,
                FileNodeType.FOLDER,
                vaultMode
        );
        List<FileInfo> activeFolders = rawFolders == null ? List.of() : rawFolders;
        Map<Long, FileInfo> folderMap = new HashMap<>();
        Map<Long, List<FileInfo>> childrenByParent = new HashMap<>();
        List<FileInfo> rootLevelFolders = new ArrayList<>();

        for (FileInfo folder : activeFolders) {
            if (folder == null || folder.getIdx() == null) {
                continue;
            }
            folderMap.put(folder.getIdx(), folder);
            FileInfo parent = folder.getParent();
            if (parent == null || parent.getIdx() == null) {
                if (includeHidden || !folder.isHiddenFolder()) {
                    rootLevelFolders.add(folder);
                }
            } else {
                childrenByParent.computeIfAbsent(parent.getIdx(), ignored -> new ArrayList<>()).add(folder);
            }
        }

        List<FileCommonDto.FileBreadcrumbRes> rootSummaries = rootLevelFolders.stream()
                .map(folder -> FileCommonDto.FileBreadcrumbRes.builder()
                        .idx(folder.getIdx())
                        .fileOriginName(folder.getFileOriginName())
                        .build())
                .toList();

        return new FolderTreeSnapshot(folderMap, childrenByParent, rootLevelFolders, rootSummaries);
    }

    private SearchScopeResolution resolveSearchScope(
            Long userIdx,
            Long parentId,
            FileManageDto.ListPageReq request,
            boolean vaultMode,
            boolean includeHidden,
            boolean trashedOnly,
            FolderTreeSnapshot folderTree
    ) {
        if (vaultMode && trashedOnly) {
            return new SearchScopeResolution("current", false, Set.of());
        }

        String requestedScope = FileListQueryRules.normalizeSearchScope(
                request != null ? request.getSearchScope() : null
        );
        Long searchRootFolderId = request != null ? request.getSearchRootFolderId() : null;

        if ("current".equals(requestedScope)) {
            if (parentId == null) {
                return new SearchScopeResolution("current", true, Set.of());
            }
            return new SearchScopeResolution("current", false, Set.of(parentId));
        }

        if ("subtree".equals(requestedScope)) {
            if (parentId == null) {
                return new SearchScopeResolution(
                        "subtree",
                        true,
                        collectAllowedSubtreeIds(userIdx, null, folderTree, includeHidden)
                );
            }
            return new SearchScopeResolution(
                    "subtree",
                    false,
                    collectAllowedSubtreeIds(userIdx, parentId, folderTree, includeHidden)
            );
        }

        // "root" scope: either user-chosen root folder or the active space root (Drive Home / Vault Root)
        if (searchRootFolderId != null) {
            FileInfo rootTarget = folderTree.folderMap().get(searchRootFolderId);
            if (rootTarget == null) {
                rootTarget = getOwnedFile(userIdx, searchRootFolderId);
            }
            if (rootTarget.isTrashed() || FileTreeRules.resolveNodeType(rootTarget) != FileNodeType.FOLDER) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            if (rootTarget.isVaultSpace() != vaultMode) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            if (!includeHidden && (hasHiddenAncestorInMap(rootTarget, folderTree.folderMap()) || SecretTreeRules.hasHiddenAncestor(rootTarget))) {
                throw BaseException.from(BaseResponseStatus.SECRET_FOLDER_UNLOCK_REQUIRED);
            }
            assertSecretNodeAccess(userIdx, rootTarget, includeHidden);

            return new SearchScopeResolution(
                    "root",
                    false,
                    collectAllowedSubtreeIds(userIdx, searchRootFolderId, folderTree, includeHidden)
            );
        }

        return new SearchScopeResolution(
                "root",
                true,
                collectAllowedSubtreeIds(userIdx, null, folderTree, includeHidden)
        );
    }

    private Set<Long> collectAllowedSubtreeIds(
            Long userIdx,
            Long anchorFolderId,
            FolderTreeSnapshot folderTree,
            boolean includeHidden
    ) {
        Set<Long> allowed = new LinkedHashSet<>();
        Set<Long> visited = new HashSet<>();
        Queue<Long> queue = new ArrayDeque<>();

        if (anchorFolderId == null) {
            for (FileInfo rootFolder : folderTree.rootLevelFolders()) {
                if (rootFolder.getIdx() != null && visited.add(rootFolder.getIdx())) {
                    if (canTraverseFolderSubtree(userIdx, rootFolder, includeHidden)) {
                        allowed.add(rootFolder.getIdx());
                        queue.add(rootFolder.getIdx());
                    }
                }
            }
        } else {
            allowed.add(anchorFolderId);
            visited.add(anchorFolderId);
            queue.add(anchorFolderId);
        }

        while (!queue.isEmpty()) {
            Long currentId = queue.poll();
            for (FileInfo child : folderTree.childrenByParent().getOrDefault(currentId, List.of())) {
                if (child == null || child.getIdx() == null || !visited.add(child.getIdx())) {
                    continue;
                }
                if (!canTraverseFolderSubtree(userIdx, child, includeHidden)) {
                    continue;
                }
                allowed.add(child.getIdx());
                queue.add(child.getIdx());
            }
        }

        return allowed;
    }

    private boolean canTraverseFolderSubtree(Long userIdx, FileInfo folder, boolean includeHidden) {
        if (folder == null) {
            return false;
        }
        if (folder.isHiddenFolder()) {
            if (!includeHidden) {
                return false;
            }
            return isSecretNodeAccessibleForCatalog(userIdx, folder);
        }
        return true;
    }

    private boolean isSecretNodeAccessibleForCatalog(Long userIdx, FileInfo node) {
        if (secretAccessGuard == null || node == null) {
            return true;
        }
        try {
            secretAccessGuard.assertNodeAccess(userIdx, node, true);
            return true;
        } catch (BaseException ignored) {
            return false;
        }
    }

    private Set<Long> collectLockedHiddenSubtreeIds(Long userIdx, List<FileInfo> nodes, Long excludeRootIdx) {
        if (secretAccessGuard == null || nodes == null || nodes.isEmpty()) {
            return Set.of();
        }
        Map<Long, List<FileInfo>> childrenByParent = new HashMap<>();
        Queue<Long> queue = new ArrayDeque<>();
        Set<Long> lockedIds = new HashSet<>();

        for (FileInfo node : nodes) {
            if (node == null || node.getIdx() == null) {
                continue;
            }
            if (node.getParent() != null && node.getParent().getIdx() != null) {
                childrenByParent
                        .computeIfAbsent(node.getParent().getIdx(), ignored -> new ArrayList<>())
                        .add(node);
            }
            if (!Objects.equals(node.getIdx(), excludeRootIdx)
                    && node.isHiddenFolder()
                    && !isSecretNodeAccessibleForCatalog(userIdx, node)
                    && lockedIds.add(node.getIdx())) {
                queue.add(node.getIdx());
            }
        }

        while (!queue.isEmpty()) {
            Long currentId = queue.poll();
            for (FileInfo child : childrenByParent.getOrDefault(currentId, List.of())) {
                if (child != null && child.getIdx() != null && lockedIds.add(child.getIdx())) {
                    queue.add(child.getIdx());
                }
            }
        }
        return lockedIds;
    }

    private boolean hasHiddenAncestorInMap(FileInfo node, Map<Long, FileInfo> folderMap) {
        Set<Long> visited = new HashSet<>();
        FileInfo current = node;
        while (current != null) {
            if (current.isHiddenFolder()) {
                return true;
            }
            Long idx = current.getIdx();
            if (idx != null && !visited.add(idx)) {
                break;
            }
            FileInfo parentRef = current.getParent();
            current = parentRef != null && parentRef.getIdx() != null
                    ? folderMap.getOrDefault(parentRef.getIdx(), parentRef)
                    : parentRef;
        }
        return false;
    }

    private List<String> resolveAvailableExtensions(
            Long userIdx,
            Long parentId,
            boolean vaultMode,
            boolean includeHidden,
            boolean trashedOnly,
            SearchScopeResolution scope
    ) {
        List<String> rawFormats;
        if ((vaultMode && trashedOnly) || "current".equals(scope.effectiveScope())) {
            rawFormats = (!vaultMode && !includeHidden)
                    ? fileUpDownloadRepository.findDistinctFileFormatsByUserAndParent(
                            userIdx,
                            parentId,
                            FileNodeType.FILE
                    )
                    : fileUpDownloadRepository.findDistinctFileFormatsByUserAndParent(
                            userIdx,
                            parentId,
                            FileNodeType.FILE,
                            vaultMode,
                            includeHidden
                    );
        } else if (scope.includeRootParent() && !scope.allowedParentIds().isEmpty()) {
            rawFormats = fileUpDownloadRepository.findDistinctFileFormatsByUserInRootOrParents(
                    userIdx,
                    scope.allowedParentIds(),
                    FileNodeType.FILE,
                    vaultMode,
                    includeHidden
            );
        } else if (scope.includeRootParent()) {
            rawFormats = fileUpDownloadRepository.findDistinctFileFormatsByUserAndParent(
                    userIdx,
                    null,
                    FileNodeType.FILE,
                    vaultMode,
                    includeHidden
            );
        } else if (!scope.allowedParentIds().isEmpty()) {
            rawFormats = fileUpDownloadRepository.findDistinctFileFormatsByUserAndParentIn(
                    userIdx,
                    scope.allowedParentIds(),
                    FileNodeType.FILE,
                    vaultMode,
                    includeHidden
            );
        } else {
            rawFormats = List.of();
        }

        if (rawFormats == null || rawFormats.isEmpty()) {
            return List.of();
        }
        return rawFormats.stream()
                .map(FileListQueryRules::normalizeExtensionToken)
                .filter(ext -> !ext.isEmpty())
                .distinct()
                .sorted()
                .toList();
    }

    private FileCommonDto.FileListItemRes toFileListItem(FileInfo entity) {
        return fileListItemUrlService.attachUrls(toFileListItemMetadata(entity));
    }

    private FileCommonDto.FileListItemRes toFileListItemMetadata(FileInfo entity) {
        return toFileListItemMetadata(entity, null, entity != null && entity.isVaultSpace(), entity != null && entity.isTrashed());
    }

    private FileCommonDto.FileListItemRes toFileListItemMetadata(
            FileInfo entity,
            FolderTreeSnapshot folderTree,
            boolean vaultMode,
            boolean trashedOnly
    ) {
        FileNodeType nodeType = FileTreeRules.resolveNodeType(entity);

        return FileCommonDto.FileListItemRes.builder()
                .idx(entity.getIdx())
                .fileOriginName(entity.getFileOriginName())
                .fileSaveName(entity.getFileSaveName())
                .fileSavePath(entity.getFileSavePath())
                .fileFormat(entity.getFileFormat())
                .fileSize(entity.getFileSize())
                .nodeType(nodeType.name())
                .parentId(entity.getParent() != null ? entity.getParent().getIdx() : null)
                .lockedFile(entity.isLockedFile())
                .sharedFile(entity.isSharedFile())
                .trashed(entity.isTrashed())
                .spaceType(entity.resolveSpaceType().name())
                .hiddenFolder(entity.isHiddenFolder())
                .pinEnabled(entity.isFolderPinEnabled())
                .pinRegistered(entity.hasFolderPin())
                .deletedAt(entity.getDeletedAt())
                .uploadDate(entity.getUploadDate())
                .lastModifyDate(entity.getLastModifyDate())
                .locationPath(resolveLocationPath(entity, folderTree, vaultMode, trashedOnly))
                .build();
    }

    private String resolveLocationPath(
            FileInfo entity,
            FolderTreeSnapshot folderTree,
            boolean vaultMode,
            boolean trashedOnly
    ) {
        String rootLabel = (vaultMode && trashedOnly)
                ? "비밀 휴지통"
                : (vaultMode ? "비밀 폴더" : "홈");
        if (entity == null || entity.getParent() == null) {
            return rootLabel;
        }
        Map<Long, FileInfo> folderMap = folderTree != null ? folderTree.folderMap() : Map.of();
        List<String> segments = new ArrayList<>();
        Set<Long> visited = new HashSet<>();
        FileInfo current = entity.getParent();
        if (current.getIdx() != null) {
            current = folderMap.getOrDefault(current.getIdx(), current);
        }
        while (current != null && visited.add(current.getIdx())) {
            String folderName = current.getFileOriginName();
            if (folderName != null && !folderName.isBlank()) {
                segments.add(folderName);
            }
            FileInfo nextParent = current.getParent();
            current = nextParent != null && nextParent.getIdx() != null
                    ? folderMap.getOrDefault(nextParent.getIdx(), nextParent)
                    : nextParent;
        }
        Collections.reverse(segments);
        if (segments.isEmpty()) {
            return rootLabel;
        }
        return rootLabel + " / " + String.join(" / ", segments);
    }

    private void requireVaultUnlocked(Long userIdx) {
        if (secretAccessGuard != null) {
            secretAccessGuard.requireVaultUnlocked(userIdx);
        }
    }

    private void assertSecretNodeAccess(Long userIdx, FileInfo node, boolean allowRevealedHidden) {
        if (secretAccessGuard != null && node != null) {
            secretAccessGuard.assertNodeAccess(userIdx, node, allowRevealedHidden);
        }
    }
}
