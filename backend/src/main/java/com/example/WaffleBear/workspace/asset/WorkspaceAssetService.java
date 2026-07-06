package com.example.WaffleBear.workspace.asset;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.asset.model.WorkspaceAsset;
import com.example.WaffleBear.workspace.asset.model.WorkspaceAssetDto;
import com.example.WaffleBear.workspace.asset.model.WorkspaceAssetType;
import com.example.WaffleBear.workspace.model.post.Post;
import com.example.WaffleBear.workspace.model.relation.AccessRole;
import com.example.WaffleBear.workspace.model.relation.UserPost;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class WorkspaceAssetService {

    // ─── 하드코딩 버킷명 제거 ──────────────────────────────────────────────────
    // 버킷명은 MinioProperties 에서 주입받습니다.
    // 워크스페이스 에셋 → bucket_work
    // 드라이브 저장     → bucket_cloud  (FileUpDownloadMinioService 와 동일)

    public record EditorJsUploadResult(Long assetIdx, String fileUrl) {}
    private record WorkspacePermission(Post workspace, AccessRole accessRole) {}
    private record WorkspaceUploadContext(Long workspaceIdx, String workspaceUuid, User uploader) {
        Post workspaceReference() {
            return Post.builder().idx(workspaceIdx).UUID(workspaceUuid).build();
        }
    }
    private record PendingWorkspaceAsset(
            String objectKey,
            String storedFileName,
            String objectFolder,
            String originalName,
            String contentType,
            Long fileSize
    ) {
        WorkspaceAsset toEntity(Post workspace, User uploader) {
            return WorkspaceAsset.builder()
                    .workspace(workspace)
                    .uploader(uploader)
                    .assetType(WorkspaceAssetType.FILE)
                    .originalName(originalName)
                    .storedFileName(storedFileName)
                    .objectFolder(objectFolder)
                    .objectKey(objectKey)
                    .contentType(contentType)
                    .fileSize(fileSize)
                    .build();
        }
    }
    private record PendingEditorJsAsset(
            String objectKey,
            String storedFileName,
            String objectFolder,
            String originalName,
            String contentType,
            Long fileSize,
            WorkspaceAssetType assetType,
            String fileUrl
    ) {
        WorkspaceAsset toEntity(Post workspace, User uploader) {
            return WorkspaceAsset.builder()
                    .workspace(workspace)
                    .uploader(uploader)
                    .assetType(assetType)
                    .originalName(originalName)
                    .storedFileName(storedFileName)
                    .objectFolder(objectFolder)
                    .objectKey(objectKey)
                    .contentType(contentType)
                    .fileSize(fileSize)
                    .build();
        }
    }
    private record DriveAssetCopyContext(
            Long userIdx,
            Long parentId,
            String sourceObjectKey,
            String originalName,
            Long fileSize,
            String fileFormat,
            String targetBucket,
            String savedFileName,
            String savedObjectKey
    ) {
        FileInfo parentReference() {
            return parentId == null ? null : FileInfo.builder().idx(parentId).build();
        }
    }

    private record WorkspaceAssetDownloadMetadata(
            String objectKey,
            String contentType,
            String downloadFileName,
            Long fileSize
    ) {}

    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final UserRepository userRepository;
    private final WorkspaceAssetRepository workspaceAssetRepository;
    private final UserPostRepository userPostRepository;
    private final WorkspaceAssetObjectStorageService workspaceAssetObjectStorageService;
    private final WorkspaceAssetEventPublisher workspaceAssetEventPublisher;
    private final TransactionTemplate transactionTemplate;

    /**
     * 여러 파일을 한번에 업로드 (일반 에셋용)
     */
    public List<WorkspaceAssetDto.AssetRes> uploadWorkspaceAssets(
            Long userIdx,
            Long workspaceIdx,
            MultipartFile[] files) {

        if (files == null || files.length == 0) {
            throw BaseException.from(BaseResponseStatus.FILE_EMPTY);
        }

        WorkspaceUploadContext context = resolveWorkspaceUploadContext(userIdx, workspaceIdx);
        List<PendingWorkspaceAsset> pendingAssets = new ArrayList<>();
        List<String> uploadedObjectKeys = new ArrayList<>();

        try {
            for (MultipartFile file : files) {
                if (file == null || file.isEmpty()) continue;

                PendingWorkspaceAsset pendingAsset = uploadWorkspaceAssetObject(context.workspaceUuid(), file);
                pendingAssets.add(pendingAsset);
                uploadedObjectKeys.add(pendingAsset.objectKey());
            }

            if (pendingAssets.isEmpty()) {
                return List.of();
            }

            List<WorkspaceAsset> savedAssets = saveWorkspaceAssetsInTransaction(context, pendingAssets, uploadedObjectKeys);
            List<WorkspaceAssetDto.AssetRes> result = savedAssets.stream()
                    .map(this::toAssetRes)
                    .toList();

            workspaceAssetEventPublisher.publishAfterCommit(workspaceIdx, "UPLOAD", userIdx, result, null);

            return result;
        } catch (RuntimeException exception) {
            WorkspaceAssetObjectCleanupScheduler.deleteQuietly(workspaceAssetObjectStorageService, uploadedObjectKeys);
            throw exception;
        }
    }

    private WorkspaceUploadContext resolveWorkspaceUploadContext(Long userIdx, Long workspaceIdx) {
        return transactionTemplate.execute(status -> {
            WorkspacePermission permission = requireWorkspaceAccess(userIdx, workspaceIdx, true);
            Post workspace = permission.workspace();
            User uploader = userRepository.findById(userIdx)
                    .orElseThrow(() -> BaseException.from(BaseResponseStatus.USER_NOT_FOUND));
            return new WorkspaceUploadContext(workspace.getIdx(), workspace.getUUID(), uploader);
        });
    }

    private PendingWorkspaceAsset uploadWorkspaceAssetObject(String workspaceUuid, MultipartFile file) {
        String originalName = WorkspaceAssetRules.validateFile(file);

        String contentType = file.getContentType();
        String normalizedContentType = contentType != null ? contentType : "application/octet-stream";
        String extension = WorkspaceAssetRules.extractExtension(originalName);

        boolean isImage = WorkspaceAssetRules.isImageFile(contentType, extension);
        if (isImage) {
            throw new IllegalArgumentException(
                    "이미지 파일은 업로드할 수 없습니다.\n" +
                            "파일: " + originalName + "\n" +
                            "이미지는 에디터 이미지 업로드를 사용해주세요."
            );
        }

        if (file.getSize() > WorkspaceAssetRules.MAX_FILE_SIZE) {
            throw new IllegalArgumentException(
                    "파일은 30MB 이하만 업로드 가능합니다.\n" +
                            "파일: " + originalName + "\n" +
                            "크기: " + (file.getSize() / 1024 / 1024) + "MB"
            );
        }

        String objectFolder = "file/" + workspaceUuid;
        String objectKey = objectFolder + "/" + System.currentTimeMillis() + "_" + originalName;

        workspaceAssetObjectStorageService.putCloudObject(objectKey, file, normalizedContentType);

        String storedFileName = objectKey.substring(objectKey.lastIndexOf('/') + 1);
        return new PendingWorkspaceAsset(
                objectKey,
                storedFileName,
                objectFolder,
                originalName,
                normalizedContentType,
                file.getSize()
        );
    }

    private List<WorkspaceAsset> saveWorkspaceAssetsInTransaction(
            WorkspaceUploadContext context,
            List<PendingWorkspaceAsset> pendingAssets,
            List<String> uploadedObjectKeys
    ) {
        return transactionTemplate.execute(status -> {
            WorkspaceAssetObjectCleanupScheduler.deleteAfterRollback(workspaceAssetObjectStorageService, uploadedObjectKeys);
            Post workspace = context.workspaceReference();
            List<WorkspaceAsset> savedAssets = new ArrayList<>();
            for (PendingWorkspaceAsset pendingAsset : pendingAssets) {
                try {
                    WorkspaceAsset saved = workspaceAssetRepository.save(
                            pendingAsset.toEntity(workspace, context.uploader())
                    );
                    savedAssets.add(saved);
                    log.debug("Workspace asset saved. assetIdx={}, originalName={}", saved.getIdx(), pendingAsset.originalName());
                } catch (Exception exception) {
                    log.warn("Workspace asset DB save failed. workspaceIdx={}, originalName={}",
                            context.workspaceIdx(), pendingAsset.originalName(), exception);
                    throw new RuntimeException(
                            "파일 DB 저장 실패: " + pendingAsset.originalName() + " - " + exception.getMessage(),
                            exception
                    );
                }
            }
            return savedAssets;
        });
    }
    @Transactional(readOnly = true)
    public List<WorkspaceAssetDto.AssetRes> listAssets(Long userIdx, Long workspaceIdx) {
        WorkspacePermission permission = requireWorkspaceAccess(userIdx, workspaceIdx, false);

        return workspaceAssetRepository.findProjectedAllByWorkspaceIdxOrderByCreatedAtDesc(permission.workspace().getIdx())
                .stream()
                .map(this::toAssetRes)
                .toList();
    }

    public EditorJsUploadResult uploadAssetsEditorJs(Long userIdx, Long workspaceIdx, MultipartFile image) {
        if (image == null || image.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.FILE_EMPTY);
        }

        WorkspaceUploadContext context = resolveWorkspaceUploadContext(userIdx, workspaceIdx);
        PendingEditorJsAsset pendingAsset = null;
        try {
            pendingAsset = uploadEditorJsAssetObject(context.workspaceUuid(), image);
            WorkspaceAsset saved = saveEditorJsAssetInTransaction(context, pendingAsset);
            return new EditorJsUploadResult(saved.getIdx(), pendingAsset.fileUrl());
        } catch (RuntimeException exception) {
            if (pendingAsset != null) {
                WorkspaceAssetObjectCleanupScheduler.deleteQuietly(workspaceAssetObjectStorageService, List.of(pendingAsset.objectKey()));
            }
            throw exception;
        }
    }

    private PendingEditorJsAsset uploadEditorJsAssetObject(String workspaceUuid, MultipartFile image) {
        String originalName = WorkspaceAssetRules.validateFile(image);
        String contentType = image.getContentType();
        String normalizedContentType = contentType != null ? contentType : "application/octet-stream";
        String extension = WorkspaceAssetRules.extractExtension(originalName);
        boolean isImage = WorkspaceAssetRules.isImageFile(contentType, extension);

        if (isImage && image.getSize() > WorkspaceAssetRules.MAX_IMAGE_SIZE) {
            throw new IllegalArgumentException("이미지는 5MB 이하만 업로드 가능합니다.");
        }
        if (!isImage && image.getSize() > WorkspaceAssetRules.MAX_FILE_SIZE) {
            throw new IllegalArgumentException("파일은 30MB 이하만 업로드 가능합니다.");
        }

        String objectFolder = "asset/" + workspaceUuid;
        String objectKey = objectFolder + "/" + System.currentTimeMillis() + "_" + originalName;
        workspaceAssetObjectStorageService.putCloudObject(objectKey, image, normalizedContentType);

        try {
            String fileUrl = workspaceAssetObjectStorageService.generateCloudGetUrl(objectKey);
            String storedFileName = objectKey.substring(objectKey.lastIndexOf('/') + 1);
            return new PendingEditorJsAsset(
                    objectKey,
                    storedFileName,
                    objectFolder,
                    originalName,
                    normalizedContentType,
                    image.getSize(),
                    WorkspaceAssetRules.resolveAssetType(contentType, extension),
                    fileUrl
            );
        } catch (RuntimeException exception) {
            WorkspaceAssetObjectCleanupScheduler.deleteQuietly(workspaceAssetObjectStorageService, List.of(objectKey));
            throw exception;
        }
    }

    private WorkspaceAsset saveEditorJsAssetInTransaction(WorkspaceUploadContext context, PendingEditorJsAsset pendingAsset) {
        return transactionTemplate.execute(status -> {
            WorkspaceAssetObjectCleanupScheduler.deleteAfterRollback(workspaceAssetObjectStorageService, List.of(pendingAsset.objectKey()));
            return workspaceAssetRepository.save(
                    pendingAsset.toEntity(context.workspaceReference(), context.uploader())
            );
        });
    }
    public void deleteEditorJsImage(Long userIdx, Long workspaceIdx, Long assetIdx) {
        transactionTemplate.execute(status -> {
            WorkspacePermission permission = requireWorkspaceAccess(userIdx, workspaceIdx, true);

            WorkspaceAsset asset = workspaceAssetRepository
                    .findByIdxAndWorkspace_Idx(assetIdx, permission.workspace().getIdx())
                    .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));
            String objectKey = asset.getObjectKey();
            workspaceAssetRepository.delete(asset);
            WorkspaceAssetObjectCleanupScheduler.deleteAfterCommit(workspaceAssetObjectStorageService, List.of(objectKey));
            return null;
        });
    }

    /**
     * 일반 에셋 삭제
     */
    public void deleteWorkspaceAsset(Long userIdx, Long workspaceIdx, Long assetId) {
        transactionTemplate.execute(status -> {
            WorkspacePermission permission = requireWorkspaceAccess(userIdx, workspaceIdx, true);

            WorkspaceAsset asset = workspaceAssetRepository
                    .findByIdxAndWorkspace_Idx(assetId, permission.workspace().getIdx())
                    .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));
            String objectKey = asset.getObjectKey();
            workspaceAssetRepository.delete(asset);
            WorkspaceAssetObjectCleanupScheduler.deleteAfterCommit(workspaceAssetObjectStorageService, List.of(objectKey));
            workspaceAssetEventPublisher.publishAfterCommit(workspaceIdx, "DELETE", userIdx, null, List.of(assetId));
            return null;
        });
    }

    public FileCommonDto.FileListItemRes saveAssetToDrive(Long userIdx, Long workspaceIdx, Long assetIdx, Long parentId) {
        DriveAssetCopyContext context = resolveDriveAssetCopyContext(userIdx, workspaceIdx, assetIdx, parentId);
        try {
            copyAssetObjectToDrive(context);
            FileInfo savedFile = saveDriveFileInTransaction(context);
            return toDriveFileListItem(savedFile, context.targetBucket());
        } catch (RuntimeException exception) {
            WorkspaceAssetObjectCleanupScheduler.deleteQuietly(workspaceAssetObjectStorageService, List.of(context.savedObjectKey()));
            throw exception;
        }
    }

    private DriveAssetCopyContext resolveDriveAssetCopyContext(Long userIdx, Long workspaceIdx, Long assetIdx, Long parentId) {
        return transactionTemplate.execute(status -> {
            WorkspacePermission permission = requireWorkspaceAccess(userIdx, workspaceIdx, false);
            WorkspaceAsset asset = workspaceAssetRepository
                    .findByIdxAndWorkspace_Idx(assetIdx, permission.workspace().getIdx())
                    .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));
            FileInfo parentFolder = resolveParentFolder(userIdx, parentId);
            String fileFormat = WorkspaceAssetRules.resolveDriveFileFormat(asset);
            String savedFileName = WorkspaceAssetRules.buildDriveStoredFileName(fileFormat);
            String savedObjectKey = userIdx + "/" + savedFileName;
            return new DriveAssetCopyContext(
                    userIdx,
                    parentFolder == null ? null : parentFolder.getIdx(),
                    asset.getObjectKey(),
                    asset.getOriginalName(),
                    asset.getFileSize(),
                    fileFormat,
                    resolveDriveBucketName(),
                    savedFileName,
                    savedObjectKey
            );
        });
    }

    private void copyAssetObjectToDrive(DriveAssetCopyContext context) {
        workspaceAssetObjectStorageService.copyCloudObjectToBucket(
                context.sourceObjectKey(),
                context.targetBucket(),
                context.savedObjectKey()
        );
    }
    private FileInfo saveDriveFileInTransaction(DriveAssetCopyContext context) {
        return transactionTemplate.execute(status -> {
            WorkspaceAssetObjectCleanupScheduler.deleteAfterRollback(workspaceAssetObjectStorageService, List.of(context.savedObjectKey()));
            return fileUpDownloadRepository.save(
                    FileInfo.builder()
                            .user(User.builder().idx(context.userIdx()).build())
                            .parent(context.parentReference())
                            .nodeType(FileNodeType.FILE)
                            .fileOriginName(context.originalName())
                            .fileFormat(context.fileFormat())
                            .fileSaveName(context.savedFileName())
                            .fileSavePath(context.savedObjectKey())
                            .fileSize(context.fileSize())
                            .lockedFile(false)
                            .sharedFile(false)
                            .trashed(false)
                            .deletedAt(null)
                            .build()
            );
        });
    }
    public FileCommonDto.FileDownloadPayload downloadWorkspaceAsset(Long userIdx, Long workspaceIdx, Long assetIdx) {
        WorkspaceAssetDownloadMetadata metadata = resolveWorkspaceAssetDownloadMetadata(userIdx, workspaceIdx, assetIdx);
        return new FileCommonDto.FileDownloadPayload(
                readObjectBytes(resolveDriveBucketName(), metadata.objectKey()),
                metadata.contentType(),
                metadata.downloadFileName(),
                metadata.fileSize()
        );
    }

    public String getWorkspaceAssetDownloadUrl(Long userIdx, Long workspaceIdx, Long assetIdx) {
        WorkspaceAssetDownloadMetadata metadata = resolveWorkspaceAssetDownloadMetadata(userIdx, workspaceIdx, assetIdx);
        return generateAttachmentDownloadUrl(
                metadata.objectKey(),
                metadata.downloadFileName(),
                metadata.contentType()
        );
    }

    private WorkspaceAssetDownloadMetadata resolveWorkspaceAssetDownloadMetadata(Long userIdx, Long workspaceIdx, Long assetIdx) {
        return transactionTemplate.execute(status -> {
            WorkspacePermission permission = requireWorkspaceAccess(userIdx, workspaceIdx, false);
            WorkspaceAsset asset = workspaceAssetRepository
                    .findByIdxAndWorkspace_Idx(assetIdx, permission.workspace().getIdx())
                    .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));
            return new WorkspaceAssetDownloadMetadata(
                    asset.getObjectKey(),
                    WorkspaceAssetRules.resolveContentType(asset.getContentType()),
                    WorkspaceAssetRules.sanitizeDownloadFileName(asset.getOriginalName(), asset.getStoredFileName()),
                    asset.getFileSize()
            );
        });
    }
    @Transactional
    public void deleteAllWorkspaceAssets(Post workspace) {
        if (workspace == null || workspace.getIdx() == null) {
            return;
        }

        List<String> objectKeys = workspaceAssetRepository.findObjectKeysByWorkspaceIdx(workspace.getIdx());
        if (objectKeys.isEmpty()) {
            return;
        }

        workspaceAssetRepository.deleteAllByWorkspaceIdx(workspace.getIdx());
        WorkspaceAssetObjectCleanupScheduler.deleteAfterCommit(workspaceAssetObjectStorageService, objectKeys);
    }

    // ─── 내부 헬퍼 ────────────────────────────────────────────────────────────

    private WorkspacePermission requireWorkspaceAccess(Long userIdx, Long workspaceIdx, boolean writeRequired) {
        if (userIdx == null || userIdx <= 0 || workspaceIdx == null || workspaceIdx <= 0) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        UserPost userPost = userPostRepository.findByUser_IdxAndWorkspace_Idx(userIdx, workspaceIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));

        if (writeRequired && userPost.getLevel() == AccessRole.READ) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        return new WorkspacePermission(userPost.getWorkspace(), userPost.getLevel());
    }

    private WorkspaceAssetDto.AssetRes toAssetRes(WorkspaceAsset asset) {
        String downloadUrl = generatePresignedGetUrl(asset.getObjectKey());
        String previewUrl  = asset.getAssetType() == WorkspaceAssetType.IMAGE ? downloadUrl : null;

        return new WorkspaceAssetDto.AssetRes(
                asset.getIdx(),
                asset.getWorkspace() != null ? asset.getWorkspace().getIdx() : null,
                asset.getAssetType().name(),
                asset.getOriginalName(),
                asset.getStoredFileName(),
                asset.getObjectFolder(),
                asset.getObjectKey(),
                asset.getContentType(),
                asset.getFileSize(),
                previewUrl,
                downloadUrl,
                workspaceAssetObjectStorageService.resolvePresignedUrlExpirySeconds(),
                asset.getCreatedAt()
        );
    }

    private WorkspaceAssetDto.AssetRes toAssetRes(WorkspaceAssetRepository.WorkspaceAssetView asset) {
        String downloadUrl = generatePresignedGetUrl(asset.getObjectKey());
        String previewUrl  = asset.getAssetType() == WorkspaceAssetType.IMAGE ? downloadUrl : null;

        return new WorkspaceAssetDto.AssetRes(
                asset.getIdx(),
                asset.getWorkspaceIdx(),
                asset.getAssetType().name(),
                asset.getOriginalName(),
                asset.getStoredFileName(),
                asset.getObjectFolder(),
                asset.getObjectKey(),
                asset.getContentType(),
                asset.getFileSize(),
                previewUrl,
                downloadUrl,
                workspaceAssetObjectStorageService.resolvePresignedUrlExpirySeconds(),
                asset.getCreatedAt()
        );
    }

    /**
     * 이미지 파일 여부 판단
     */
    private String generatePresignedGetUrl(String objectKey) {
        return workspaceAssetObjectStorageService.generateCloudGetUrl(objectKey);
    }
    private String resolveDriveBucketName() {
        return workspaceAssetObjectStorageService.resolveCloudBucketName();
    }

    // ─── 기타 헬퍼 ────────────────────────────────────────────────────────────

    private FileInfo resolveParentFolder(Long userIdx, Long parentId) {
        if (parentId == null) {
            return null;
        }

        FileInfo parent = fileUpDownloadRepository.findByIdxAndUser_Idx(parentId, userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));

        if (parent.isTrashed() || parent.getNodeType() != FileNodeType.FOLDER) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        return parent;
    }

    private FileCommonDto.FileListItemRes toDriveFileListItem(FileInfo entity, String bucketName) {
        return FileCommonDto.FileListItemRes.builder()
                .idx(entity.getIdx())
                .fileOriginName(entity.getFileOriginName())
                .fileSaveName(entity.getFileSaveName())
                .fileSavePath(entity.getFileSavePath())
                .fileFormat(entity.getFileFormat())
                .fileSize(entity.getFileSize())
                .nodeType(FileNodeType.FILE.name())
                .parentId(entity.getParent() != null ? entity.getParent().getIdx() : null)
                .lockedFile(entity.isLockedFile())
                .sharedFile(entity.isSharedFile())
                .trashed(entity.isTrashed())
                .deletedAt(entity.getDeletedAt())
                .uploadDate(entity.getUploadDate())
                .lastModifyDate(entity.getLastModifyDate())
                .presignedDownloadUrl(generateDrivePresignedGetUrl(entity.getFileSavePath(), bucketName))
                .thumbnailPresignedUrl(null)
                .presignedUrlExpiresIn(workspaceAssetObjectStorageService.resolvePresignedUrlExpirySeconds())
                .build();
    }

    private String generateDrivePresignedGetUrl(String objectKey, String bucketName) {
        return workspaceAssetObjectStorageService.generateDriveGetUrl(objectKey, bucketName);
    }
    private byte[] readObjectBytes(String bucketName, String objectKey) {
        return workspaceAssetObjectStorageService.readCloudObjectBytes(objectKey);
    }
    private String generateAttachmentDownloadUrl(String objectKey, String fileName, String contentType) {
        return workspaceAssetObjectStorageService.generateCloudAttachmentUrl(objectKey, fileName, contentType);
    }
}
