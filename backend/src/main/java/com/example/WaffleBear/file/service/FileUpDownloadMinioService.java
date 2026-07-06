package com.example.WaffleBear.file.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.file.info.dto.FileInfoDto;
import com.example.WaffleBear.file.manage.dto.FileManageDto;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.share.ShareInheritanceService;
import com.example.WaffleBear.file.share.ShareRepository;
import com.example.WaffleBear.file.version.FileVersionLifecycleService;
import com.example.WaffleBear.user.model.User;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import static com.example.WaffleBear.file.util.FileContentUtils.isTextPreviewable;

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

    private record FileListPageReadResult(
            List<FileCommonDto.FileListItemRes> fileList,
            List<FileCommonDto.FileBreadcrumbRes> breadcrumbs,
            List<String> availableExtensions,
            int totalPage,
            long totalCount,
            int currentPage,
            int currentSize
    ) {}

    private record FileObjectReadMetadata(
            String objectKey,
            String fileOriginName,
            String fileSaveName,
            String fileFormat,
            Long fileSize
    ) {}
    @Override
    public List<FileCommonDto.FileListItemRes> fileList(Long idx) {
        Long userIdx = idx == null ? 0L : idx;

        return fileUpDownloadRepository.findAllByUser_IdxOrderByLastModifyDateDescUploadDateDesc(userIdx)
                .stream()
                .map(this::toFileListItem)
                .toList();
    }

    @Override
    public FileCommonDto.FileListPageRes fileListPage(Long userIdx, FileManageDto.ListPageReq request) {
        FileListPageReadResult readResult = transactionTemplate.execute(status -> loadFileListPageReadResult(userIdx, request));

        return FileCommonDto.FileListPageRes.builder()
                .fileList(readResult.fileList().stream().map(fileListItemUrlService::attachUrls).toList())
                .breadcrumbs(readResult.breadcrumbs())
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
        int page = FileListQueryRules.sanitizePage(request != null ? request.getPage() : null);
        int size = FileListQueryRules.sanitizePageSize(request != null ? request.getSize() : null);

        if (parentId != null) {
            FileInfo parent = getOwnedFile(normalizedUserIdx, parentId);
            if (parent.isTrashed() || FileTreeRules.resolveNodeType(parent) != FileNodeType.FOLDER) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
        }

        Pageable pageable = PageRequest.of(page, size, resolveSort(request != null ? request.getSortOption() : null));
        Page<FileInfo> result = fileUpDownloadRepository.findAll(buildPageSpecification(normalizedUserIdx, request), pageable);

        return new FileListPageReadResult(
                result.getContent().stream().map(this::toFileListItemMetadata).toList(),
                buildBreadcrumbs(normalizedUserIdx, parentId),
                fileUpDownloadRepository.findDistinctFileFormatsByUserAndParent(
                        normalizedUserIdx,
                        parentId,
                        FileNodeType.FILE
                ),
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
        FileInfo parent = resolveParentFolder(userIdx, request.getParentId());

        FileInfo entity = FileInfo.builder()
                .user(User.builder().idx(userIdx).build())
                .parent(parent)
                .nodeType(FileNodeType.FOLDER)
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

        FileInfo saved = fileUpDownloadRepository.save(entity);
        shareInheritanceService.inheritParentShares(parent, saved);
        return toFileListItem(saved);
    }

    @Override
    public FileCommonDto.FileActionRes moveToTrash(Long userIdx, Long fileIdx) {
        FileInfo target = getOwnedFile(userIdx, fileIdx);
        List<FileInfo> userFiles = fileUpDownloadRepository.findAllByUser_Idx(userIdx);
        List<FileInfo> targetTree = FileTreeRules.collectTargetTree(target, userFiles);
        FileTreeRules.ensureNoLockedFileNodes(targetTree);
        LocalDateTime deletedAt = LocalDateTime.now();

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
        List<FileInfo> userFiles = fileUpDownloadRepository.findAllByUser_Idx(userIdx);
        List<FileInfo> targetTree = FileTreeRules.collectTargetTree(target, userFiles);
        FileTreeRules.ensureNoLockedFileNodes(targetTree);

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
        List<FileInfo> trashedFiles = fileUpDownloadRepository.findAllByUser_Idx(userIdx)
                .stream()
                .filter(FileInfo::isTrashed)
                .toList();

        if (trashedFiles.isEmpty()) {
            return FileCommonDto.FileActionRes.builder()
                    .targetIdx(null)
                    .action("clear-trash")
                    .affectedCount(0)
                    .build();
        }

        FileTreeRules.ensureNoLockedFileNodes(trashedFiles);
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
    public FileCommonDto.FileActionRes moveToFolder(Long userIdx, Long fileIdx, Long targetParentId) {
        return moveFilesToFolder(userIdx, List.of(fileIdx), targetParentId);
    }

    @Override
    public FileCommonDto.FileActionRes moveFilesToFolder(Long userIdx, List<Long> fileIdxList, Long targetParentId) {
        if (fileIdxList == null || fileIdxList.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        List<FileInfo> userFiles = fileUpDownloadRepository.findAllByUser_Idx(userIdx);
        Map<Long, FileInfo> fileById = userFiles.stream()
                .filter(file -> file.getIdx() != null)
                .collect(HashMap::new, (map, file) -> map.put(file.getIdx(), file), HashMap::putAll);
        FileInfo targetParent = resolveParentFolder(userIdx, targetParentId);

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

        for (FileInfo source : topLevelSources) {
            FileTreeRules.ensureNoLockedFileNodes(FileTreeRules.resolveNodeType(source) == FileNodeType.FOLDER ? FileTreeRules.collectTargetTree(source, userFiles) : List.of(source));

            if (source.isTrashed()) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }

            if (FileTreeRules.resolveNodeType(source) == FileNodeType.FOLDER && targetParent != null) {
                List<FileInfo> descendants = FileTreeRules.collectTargetTree(source, userFiles);
                boolean movingIntoOwnTree = descendants.stream()
                        .map(FileInfo::getIdx)
                        .anyMatch(idx -> idx != null && idx.equals(targetParent.getIdx()));

                if (movingIntoOwnTree) {
                    throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
                }
            }
        }

        topLevelSources.forEach(source -> source.changeParent(targetParent));
        fileUpDownloadRepository.saveAll(topLevelSources);

        return FileCommonDto.FileActionRes.builder()
                .targetIdx(targetParentId)
                .action("move")
                .affectedCount(topLevelSources.size())
                .build();
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

        return FileCommonDto.FileActionRes.builder()
                .targetIdx(null)
                .action("restore")
                .affectedCount(restoreTargets.size())
                .build();
    }

    @Override
    public FileCommonDto.FileListItemRes renameFolder(Long userIdx, Long folderIdx, String folderName) {
        FileInfo item = getOwnedFile(userIdx, folderIdx);
        if (item.isTrashed() || item.isLockedFile()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        item.rename(FileListQueryRules.sanitizeFolderName(folderName));
        return toFileListItem(fileUpDownloadRepository.save(item));
    }

    @Override
    public FileInfoDto.FolderPropertyRes getFolderProperties(Long userIdx, Long folderIdx) {
        FileInfo folder = getOwnedFile(userIdx, folderIdx);
        if (folder.isTrashed() || FileTreeRules.resolveNodeType(folder) != FileNodeType.FOLDER) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        List<FileInfo> userFiles = fileUpDownloadRepository.findAllByUser_Idx(userIdx)
                .stream()
                .filter(file -> !file.isTrashed())
                .toList();
        List<FileInfo> directChildren = userFiles.stream()
                .filter(file -> file.getParent() != null && folderIdx.equals(file.getParent().getIdx()))
                .toList();
        List<FileInfo> targetTree = FileTreeRules.collectTargetTree(folder, userFiles);
        List<FileInfo> descendants = targetTree.stream()
                .filter(file -> !folderIdx.equals(file.getIdx()))
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

    private FileObjectReadMetadata resolveFileObjectReadMetadata(Long userIdx, Long fileIdx, boolean requireTextPreviewable) {
        return transactionTemplate.execute(status -> {
            FileInfo file = getOwnedFile(userIdx, fileIdx);
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

        List<com.example.WaffleBear.file.share.model.FileShare> shares = shareRepository.findAllByFile_IdxIn(fileIds);
        if (shares.isEmpty()) {
            return;
        }

        shareRepository.deleteAll(shares);
    }

    private Specification<FileInfo> buildPageSpecification(Long userIdx, FileManageDto.ListPageReq request) {
        return (root, query, criteriaBuilder) -> {
            List<Predicate> predicates = new ArrayList<>();
            Long parentId = request != null ? request.getParentId() : null;
            String keyword = FileListQueryRules.normalizeSearchKeyword(request != null ? request.getSearchQuery() : null);
            String extensionFilter = FileListQueryRules.normalizeFilterValue(request != null ? request.getExtensionFilter() : null, "all");
            String sizeFilter = FileListQueryRules.normalizeFilterValue(request != null ? request.getSizeFilter() : null, "all");
            String statusFilter = FileListQueryRules.normalizeFilterValue(request != null ? request.getStatusFilter() : null, "all");

            Predicate isFile = criteriaBuilder.or(
                    criteriaBuilder.isNull(root.get("nodeType")),
                    criteriaBuilder.equal(root.get("nodeType"), FileNodeType.FILE)
            );
            Predicate isFolder = criteriaBuilder.equal(root.get("nodeType"), FileNodeType.FOLDER);

            predicates.add(criteriaBuilder.equal(root.get("user").get("idx"), userIdx));
            predicates.add(criteriaBuilder.or(
                    criteriaBuilder.isNull(root.get("trashed")),
                    criteriaBuilder.isFalse(root.get("trashed"))
            ));

            if (parentId == null) {
                predicates.add(criteriaBuilder.isNull(root.get("parent")));
            } else {
                predicates.add(criteriaBuilder.equal(root.get("parent").get("idx"), parentId));
            }

            if (!keyword.isBlank()) {
                String likePattern = "%" + keyword + "%";
                predicates.add(criteriaBuilder.or(
                        criteriaBuilder.like(criteriaBuilder.lower(root.get("fileOriginName")), likePattern),
                        criteriaBuilder.like(criteriaBuilder.lower(root.get("fileFormat")), likePattern)
                ));
            }

            if (!"all".equals(extensionFilter)) {
                predicates.add(criteriaBuilder.and(
                        isFile,
                        criteriaBuilder.equal(criteriaBuilder.lower(root.get("fileFormat")), extensionFilter)
                ));
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

    private FileCommonDto.FileListItemRes toFileListItem(FileInfo entity) {
        return fileListItemUrlService.attachUrls(toFileListItemMetadata(entity));
    }

    private FileCommonDto.FileListItemRes toFileListItemMetadata(FileInfo entity) {
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
                .deletedAt(entity.getDeletedAt())
                .uploadDate(entity.getUploadDate())
                .lastModifyDate(entity.getLastModifyDate())
                .build();
    }
}
