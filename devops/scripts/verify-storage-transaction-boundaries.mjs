#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const errors = [];

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function fail(message) {
  errors.push(message);
}

function extractMethod(source, signature) {
  const signatureIndex = source.indexOf(signature);
  if (signatureIndex < 0) {
    fail(`Missing method signature: ${signature}`);
    return '';
  }

  const bodyStart = source.indexOf('{', signatureIndex);
  if (bodyStart < 0) {
    fail(`Missing method body: ${signature}`);
    return '';
  }

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(signatureIndex, index + 1);
      }
    }
  }

  fail(`Could not parse method body: ${signature}`);
  return '';
}

function annotationTextBefore(source, signature) {
  const signatureIndex = source.indexOf(signature);
  if (signatureIndex < 0) return '';
  const previousMethodEnd = source.lastIndexOf('\n    }', signatureIndex);
  return source.slice(previousMethodEnd + 1, signatureIndex);
}

function ensureNoTransactionalAnnotation(source, signature, label) {
  const annotations = annotationTextBefore(source, signature);
  if (annotations.includes('@Transactional')) {
    fail(`${label} must not be annotated with @Transactional; external storage I/O is intentionally outside DB transaction`);
  }
}

function ensureTransactionalAnnotation(source, signature, label) {
  const annotations = annotationTextBefore(source, signature);
  if (!annotations.includes('@Transactional')) {
    fail(`${label} must be annotated with @Transactional so DB deletes commit atomically before afterCommit storage cleanup`);
  }
}
function ensureIncludes(block, label, fragments) {
  for (const fragment of fragments) {
    if (!block.includes(fragment)) {
      fail(`${label} must include ${fragment}`);
    }
  }
}

function ensureExcludes(block, label, fragments) {
  for (const fragment of fragments) {
    if (block.includes(fragment)) {
      fail(`${label} must not include ${fragment}`);
    }
  }
}

function ensureOrder(block, label, first, second) {
  const firstIndex = block.indexOf(first);
  const secondIndex = block.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) {
    fail(`${label} must call ${first} before ${second}`);
  }
}

const workspaceAssetService = read('backend/src/main/java/com/example/WaffleBear/workspace/asset/WorkspaceAssetService.java');
const workspaceAssetObjectStorageService = read('backend/src/main/java/com/example/WaffleBear/workspace/asset/WorkspaceAssetObjectStorageService.java');
const workspaceAssetObjectCleanupScheduler = read('backend/src/main/java/com/example/WaffleBear/workspace/asset/WorkspaceAssetObjectCleanupScheduler.java');
const workspaceAssetEventPublisher = read('backend/src/main/java/com/example/WaffleBear/workspace/asset/WorkspaceAssetEventPublisher.java');
ensureIncludes(workspaceAssetService, 'WorkspaceAssetService class', [
  'WorkspaceAssetObjectStorageService',
  'WorkspaceAssetObjectCleanupScheduler',
  'WorkspaceAssetEventPublisher',
  'workspaceAssetEventPublisher.publishAfterCommit',
]);
ensureExcludes(workspaceAssetService, 'WorkspaceAssetService class', [
  'MinioClient',
  'PutObjectArgs',
  'CopyObjectArgs',
  'RemoveObjectsArgs',
  'GetPresignedObjectUrlArgs',
  'minioClient.',
  'minioProperties.',
  'minioPresignedUrlService',
  'TransactionSynchronizationManager',
  'TransactionSynchronization',
  'ClusteredStompPublisher',
  'stompPublisher',
  'WorkspaceAssetDto.AssetEvent',
]);
ensureIncludes(workspaceAssetObjectCleanupScheduler, 'WorkspaceAssetObjectCleanupScheduler class', [
  'TransactionSynchronizationManager.isActualTransactionActive()',
  'TransactionSynchronizationManager.registerSynchronization',
  'TransactionSynchronization.STATUS_ROLLED_BACK',
  'afterCommit()',
  'objectStorageService.deleteCloudObjectsQuietly',
  'objectStorageService.deleteCloudObjects',
]);
ensureIncludes(workspaceAssetObjectStorageService, 'WorkspaceAssetObjectStorageService class', [
  'minioClient.putObject',
  'minioClient.copyObject',
  'minioClient.getObject',
  'minioClient.removeObjects',
  'minioPresignedUrlService.getPresignedObjectUrl',
  'WorkspaceAssetRules.normalizeObjectKeys',
]);
ensureIncludes(workspaceAssetEventPublisher, 'WorkspaceAssetEventPublisher class', [
  'ClusteredStompPublisher',
  'TransactionSynchronizationManager.isSynchronizationActive()',
  'TransactionSynchronizationManager.registerSynchronization',
  'afterCommit()',
  'stompPublisher.send',
  'WorkspaceAssetDto.AssetEvent',
]);
ensureNoTransactionalAnnotation(
  workspaceAssetService,
  'public List<WorkspaceAssetDto.AssetRes> uploadWorkspaceAssets(',
  'WorkspaceAssetService.uploadWorkspaceAssets'
);
const uploadWorkspaceAssets = extractMethod(
  workspaceAssetService,
  'public List<WorkspaceAssetDto.AssetRes> uploadWorkspaceAssets('
);
ensureIncludes(uploadWorkspaceAssets, 'WorkspaceAssetService.uploadWorkspaceAssets', [
  'uploadWorkspaceAssetObject(',
  'saveWorkspaceAssetsInTransaction(',
  'WorkspaceAssetObjectCleanupScheduler.deleteQuietly(workspaceAssetObjectStorageService, uploadedObjectKeys)',
]);
ensureOrder(
  uploadWorkspaceAssets,
  'WorkspaceAssetService.uploadWorkspaceAssets',
  'uploadWorkspaceAssetObject(',
  'saveWorkspaceAssetsInTransaction('
);

const saveWorkspaceAssets = extractMethod(
  workspaceAssetService,
  'private List<WorkspaceAsset> saveWorkspaceAssetsInTransaction('
);
ensureIncludes(saveWorkspaceAssets, 'WorkspaceAssetService.saveWorkspaceAssetsInTransaction', [
  'transactionTemplate.execute',
  'WorkspaceAssetObjectCleanupScheduler.deleteAfterRollback(workspaceAssetObjectStorageService, uploadedObjectKeys)',
  'workspaceAssetRepository.save',
]);
ensureExcludes(saveWorkspaceAssets, 'WorkspaceAssetService.saveWorkspaceAssetsInTransaction', [
  'minioClient.',
  'putObject',
  'copyObject',
  'removeObject',
  'removeObjects',
  'TransactionSynchronizationManager',
  'TransactionSynchronization',
  'private List<FileInfo> collectTargetTree',
  'private List<FileInfo> sortForDelete',
  'private boolean hasSelectedAncestor',
  'private boolean hasTrashedAncestor',
  'private void ensureNoLockedNodes',
]);

ensureNoTransactionalAnnotation(
  workspaceAssetService,
  'public FileCommonDto.FileListItemRes saveAssetToDrive(',
  'WorkspaceAssetService.saveAssetToDrive'
);
const saveAssetToDrive = extractMethod(
  workspaceAssetService,
  'public FileCommonDto.FileListItemRes saveAssetToDrive('
);
ensureIncludes(saveAssetToDrive, 'WorkspaceAssetService.saveAssetToDrive', [
  'resolveDriveAssetCopyContext(',
  'copyAssetObjectToDrive(context)',
  'saveDriveFileInTransaction(context)',
  'WorkspaceAssetObjectCleanupScheduler.deleteQuietly(workspaceAssetObjectStorageService, List.of(context.savedObjectKey()))',
]);
ensureOrder(
  saveAssetToDrive,
  'WorkspaceAssetService.saveAssetToDrive',
  'copyAssetObjectToDrive(context)',
  'saveDriveFileInTransaction(context)'
);

const saveDriveFile = extractMethod(workspaceAssetService, 'private FileInfo saveDriveFileInTransaction(');
ensureIncludes(saveDriveFile, 'WorkspaceAssetService.saveDriveFileInTransaction', [
  'transactionTemplate.execute',
  'WorkspaceAssetObjectCleanupScheduler.deleteAfterRollback(workspaceAssetObjectStorageService, List.of(context.savedObjectKey()))',
  'fileUpDownloadRepository.save',
]);
ensureExcludes(saveDriveFile, 'WorkspaceAssetService.saveDriveFileInTransaction', [
  'minioClient.',
  'putObject',
  'copyObject',
  'removeObject',
  'removeObjects',
]);

const deleteWorkspaceAsset = extractMethod(workspaceAssetService, 'public void deleteWorkspaceAsset(');
ensureIncludes(deleteWorkspaceAsset, 'WorkspaceAssetService.deleteWorkspaceAsset', [
  'transactionTemplate.execute',
  'workspaceAssetRepository.delete(asset)',
  'WorkspaceAssetObjectCleanupScheduler.deleteAfterCommit(workspaceAssetObjectStorageService, List.of(objectKey))',
]);
ensureExcludes(deleteWorkspaceAsset, 'WorkspaceAssetService.deleteWorkspaceAsset', [
  'deleteObjectKeys(',
  'deleteObjectKeysQuietly(',
  'minioClient.',
  'removeObject',
  'removeObjects',
]);

const uploadService = read('backend/src/main/java/com/example/WaffleBear/file/upload/UploadService.java');
const uploadObjectStorageService = read('backend/src/main/java/com/example/WaffleBear/file/upload/UploadObjectStorageService.java');
const uploadObjectCleanupScheduler = read('backend/src/main/java/com/example/WaffleBear/file/upload/UploadObjectCleanupScheduler.java');
ensureIncludes(uploadService, 'UploadService class', [
  'UploadObjectStorageService',
  'UploadObjectCleanupScheduler',
  'uploadObjectStorageService.generatePresignedUploadUrl(objectKey)',
  'uploadObjectStorageService.ensureUploadedObjectExists(finalObjectKey)',
  'uploadObjectStorageService.ensureAllUploaded(chunkObjectKeys)',
  'uploadObjectStorageService.composeFinalObject(finalObjectKey, chunkObjectKeys)',
  'uploadObjectStorageService.resolveCompletedObjectSize(finalObjectKey, expectedFileSize)',
  'uploadObjectStorageService.deleteObjectKeys',
]);
ensureExcludes(uploadService, 'UploadService class', [
  'MinioClient',
  'MinioProperties',
  'MinioPresignedUrlService',
  'ComposeObjectArgs',
  'ComposeSource',
  'GetPresignedObjectUrlArgs',
  'RemoveObjectsArgs',
  'StatObjectArgs',
  'io.minio.messages.DeleteObject',
  'minioClient.',
  'minioProperties.',
  'minioPresignedUrlService',
  'TransactionSynchronizationManager',
  'TransactionSynchronization',
]);
ensureIncludes(uploadObjectStorageService, 'UploadObjectStorageService class', [
  'MinioClient',
  'minioPresignedUrlService.getPresignedObjectUrl',
  'minioClient.statObject',
  'minioClient.composeObject',
  'minioClient.removeObjects',
  'UploadObjectRules.normalizeDeleteObjectKeys',
]);
ensureIncludes(uploadObjectCleanupScheduler, 'UploadObjectCleanupScheduler class', [
  'UploadObjectRules.normalizeDeleteObjectKeys',
  'TransactionSynchronizationManager.isSynchronizationActive()',
  'TransactionSynchronizationManager.isActualTransactionActive()',
  'TransactionSynchronizationManager.registerSynchronization',
  'TransactionSynchronization.STATUS_ROLLED_BACK',
  'afterCommit()',
  'objectStorageService.deleteObjectKeys',
]);
ensureNoTransactionalAnnotation(uploadService, 'public UploadDto.CompleteRes complete(', 'UploadService.complete');
const completeUpload = extractMethod(uploadService, 'public UploadDto.CompleteRes complete(');
ensureIncludes(completeUpload, 'UploadService.complete', [
  'transactionTemplate.execute',
  'prepareCompleteUpload(',
  'ensureAllUploaded(chunkObjectKeys)',
  'composeFinalObject(finalObjectKey, chunkObjectKeys)',
  'resolveCompletedObjectSize(',
  'persistCompletedUpload(',
  'UploadObjectCleanupScheduler.deleteQuietly(uploadObjectStorageService, List.of(finalObjectKey))',
  'UploadObjectCleanupScheduler.deleteQuietly(uploadObjectStorageService, chunkObjectKeys)',
]);
ensureOrder(completeUpload, 'UploadService.complete', 'prepareCompleteUpload(', 'composeFinalObject(');
ensureOrder(completeUpload, 'UploadService.complete', 'composeFinalObject(', 'persistCompletedUpload(');

const resolveUsedStorageBytes = extractMethod(uploadService, 'private long resolveUsedStorageBytes(');
ensureIncludes(resolveUsedStorageBytes, 'UploadService.resolveUsedStorageBytes', [
  'fileVersionLifecycleService.sumStoredVersionBytes(userIdx)',
]);
ensureExcludes(resolveUsedStorageBytes, 'UploadService.resolveUsedStorageBytes', [
  'fileVersionService.sumStoredVersionBytes',
]);
const persistCompletedUpload = extractMethod(uploadService, 'private void persistCompletedUpload(');
ensureIncludes(persistCompletedUpload, 'UploadService.persistCompletedUpload', [
  'UploadObjectCleanupScheduler.deleteAfterRollback(uploadObjectStorageService, List.of(finalObjectKey))',
  'UploadObjectCleanupScheduler.deleteAfterRollback(uploadObjectStorageService, chunkObjectKeys)',
  'saveFinalFileInfo(',
  'UploadObjectCleanupScheduler.deleteAfterCommit(uploadObjectStorageService, chunkObjectKeys)',
]);
ensureExcludes(persistCompletedUpload, 'UploadService.persistCompletedUpload', [
  'minioClient.',
  'composeObject',
  'removeObjects',
]);

const chatMessageService = read('backend/src/main/java/com/example/WaffleBear/chat/ChatMessageService.java');
const chatAttachmentStorageService = read('backend/src/main/java/com/example/WaffleBear/chat/ChatAttachmentStorageService.java');
ensureIncludes(chatMessageService, 'ChatMessageService class', [
  'ChatAttachmentStorageService',
  'chatAttachmentStorageService.uploadChatAttachment(roomIdx, userIdx, file)',
]);
ensureExcludes(chatMessageService, 'ChatMessageService class', [
  'MinioClient',
  'MinioProperties',
  'MinioPresignedUrlService',
  'PutObjectArgs',
  'GetPresignedObjectUrlArgs',
  'minioClient.',
  'minioProperties.',
  'minioPresignedUrlService',
]);
ensureNoTransactionalAnnotation(
  chatMessageService,
  'public String uploadFile(',
  'ChatMessageService.uploadFile'
);
const uploadChatFile = extractMethod(chatMessageService, 'public String uploadFile(');
ensureIncludes(uploadChatFile, 'ChatMessageService.uploadFile', [
  'validateRoomMembership(roomIdx, userIdx)',
  'chatAttachmentStorageService.uploadChatAttachment(roomIdx, userIdx, file)',
]);
ensureExcludes(uploadChatFile, 'ChatMessageService.uploadFile', [
  'minioClient.',
  'putObject',
  'getPresignedObjectUrl',
]);
ensureIncludes(chatAttachmentStorageService, 'ChatAttachmentStorageService class', [
  'MinioClient',
  'minioClient.putObject',
  'minioPresignedUrlService.getPresignedObjectUrl',
  'MAX_IMAGE_SIZE',
  'MAX_FILE_SIZE',
]);
const shareService = read('backend/src/main/java/com/example/WaffleBear/file/share/ShareService.java');
const shareFileAccessService = read('backend/src/main/java/com/example/WaffleBear/file/share/ShareFileAccessService.java');
const shareFileObjectStorageService = read('backend/src/main/java/com/example/WaffleBear/file/share/ShareFileObjectStorageService.java');
const shareObjectCleanupScheduler = read('backend/src/main/java/com/example/WaffleBear/file/share/ShareObjectCleanupScheduler.java');
const shareTreeStatusService = read('backend/src/main/java/com/example/WaffleBear/file/share/ShareTreeStatusService.java');
ensureIncludes(shareService, 'ShareService class', [
  'ShareFileAccessService',
  'ShareTreeStatusService',
  'shareFileAccessService.saveSharedFileToDrive',
  'shareFileAccessService.uploadFileToSharedFolder',
  'shareTreeStatusService.changeTreeStatus',
]);
ensureExcludes(shareService, 'ShareService class', [
  'MinioClient',
  'MinioProperties',
  'MinioPresignedUrlService',
  'CopyObjectArgs',
  'CopySource',
  'GetObjectArgs',
  'GetPresignedObjectUrlArgs',
  'PutObjectArgs',
  'RemoveObjectArgs',
  'StatObjectArgs',
  'minioClient.',
  'minioProperties.',
  'minioPresignedUrlService',
  'ClusteredStompPublisher',
  'stompPublisher',
  'WorkspaceAssetDto.AssetEvent',
  'private int changeShareTreeStatus',
  'TransactionSynchronizationManager',
  'TransactionSynchronization',
]);
ensureIncludes(shareFileAccessService, 'ShareFileAccessService class', [
  'ShareFileObjectStorageService',
  'ShareObjectCleanupScheduler',
  'TransactionTemplate',
  'shareFileObjectStorageService.copyObject',
  'shareFileObjectStorageService.putObject',
  'ShareObjectCleanupScheduler.deleteQuietly',
]);
ensureExcludes(shareFileAccessService, 'ShareFileAccessService class', [
  'MinioClient',
  'MinioProperties',
  'MinioPresignedUrlService',
  'CopyObjectArgs',
  'CopySource',
  'GetObjectArgs',
  'GetPresignedObjectUrlArgs',
  'PutObjectArgs',
  'RemoveObjectArgs',
  'StatObjectArgs',
  'minioClient.',
  'minioProperties.',
  'minioPresignedUrlService',
  'ClusteredStompPublisher',
  'stompPublisher',
  'WorkspaceAssetDto.AssetEvent',
  'TransactionSynchronizationManager',
  'TransactionSynchronization',
]);
ensureIncludes(shareFileObjectStorageService, 'ShareFileObjectStorageService class', [
  'minioClient.copyObject',
  'minioClient.putObject',
  'minioClient.removeObject',
  'minioClient.getObject',
  'minioClient.statObject',
  'minioPresignedUrlService.getPresignedObjectUrl',
]);
ensureIncludes(shareObjectCleanupScheduler, 'ShareObjectCleanupScheduler class', [
  'TransactionSynchronizationManager.isActualTransactionActive()',
  'TransactionSynchronizationManager.registerSynchronization',
  'TransactionSynchronization.STATUS_ROLLED_BACK',
  'objectStorageService.deleteObjectQuietly',
]);
ensureIncludes(shareTreeStatusService, 'ShareTreeStatusService class', [
  'fileUpDownloadRepository.findAllByUser_Idx(ownerIdx)',
  'shareRepository.findByFile_IdxAndRecipient_Idx',
  'targetShare.changeStatus(status)',
  'shareRepository.saveAll(changed)',
  'shareAuditService.record',
]);
ensureNoTransactionalAnnotation(
  shareFileAccessService,
  'FileCommonDto.FileListItemRes saveSharedFileToDrive(Long userIdx, Long fileIdx, Long parentId, String sharePassword)',
  'ShareFileAccessService.saveSharedFileToDrive'
);
const saveSharedFileToDrive = extractMethod(
  shareFileAccessService,
  'FileCommonDto.FileListItemRes saveSharedFileToDrive(Long userIdx, Long fileIdx, Long parentId, String sharePassword)'
);
ensureIncludes(saveSharedFileToDrive, 'ShareFileAccessService.saveSharedFileToDrive', [
  'transactionTemplate.execute',
  'prepareSharedDriveCopy(',
  'shareFileObjectStorageService.copyObject(copyPlan.sourceObjectKey(), copyPlan.targetObjectKey())',
  'persistSharedDriveCopy(copyPlan, sharePassword)',
  'ShareObjectCleanupScheduler.deleteQuietly(shareFileObjectStorageService, copyPlan.targetObjectKey())',
]);
ensureOrder(
  saveSharedFileToDrive,
  'ShareFileAccessService.saveSharedFileToDrive',
  'shareFileObjectStorageService.copyObject(copyPlan.sourceObjectKey(), copyPlan.targetObjectKey())',
  'persistSharedDriveCopy(copyPlan, sharePassword)'
);

const persistSharedDriveCopy = extractMethod(shareFileAccessService, 'private FileCommonDto.FileListItemRes persistSharedDriveCopy(');
ensureIncludes(persistSharedDriveCopy, 'ShareFileAccessService.persistSharedDriveCopy', [
  'ShareObjectCleanupScheduler.deleteAfterRollback(shareFileObjectStorageService, copyPlan.targetObjectKey())',
  'fileUpDownloadRepository.save(copy)',
  'recordSharedDownload(share)',
  'shareAuditService.record',
]);
ensureExcludes(persistSharedDriveCopy, 'ShareFileAccessService.persistSharedDriveCopy', [
  'minioClient.',
  'copyObject',
  'putObject',
  'removeObject',
]);

ensureNoTransactionalAnnotation(
  shareFileAccessService,
  'FileCommonDto.FileListItemRes uploadFileToSharedFolder(',
  'ShareFileAccessService.uploadFileToSharedFolder'
);
const uploadFileToSharedFolder = extractMethod(
  shareFileAccessService,
  'FileCommonDto.FileListItemRes uploadFileToSharedFolder('
);
ensureIncludes(uploadFileToSharedFolder, 'ShareFileAccessService.uploadFileToSharedFolder', [
  'transactionTemplate.execute',
  'prepareSharedFolderUpload(',
  'shareFileObjectStorageService.putObject(',
  'persistSharedFolderUpload(uploadPlan)',
  'ShareObjectCleanupScheduler.deleteQuietly(shareFileObjectStorageService, uploadPlan.objectKey())',
]);
ensureOrder(
  uploadFileToSharedFolder,
  'ShareFileAccessService.uploadFileToSharedFolder',
  'shareFileObjectStorageService.putObject(',
  'persistSharedFolderUpload(uploadPlan)'
);

const persistSharedFolderUpload = extractMethod(shareFileAccessService, 'private FileCommonDto.FileListItemRes persistSharedFolderUpload(');
ensureIncludes(persistSharedFolderUpload, 'ShareFileAccessService.persistSharedFolderUpload', [
  'ShareObjectCleanupScheduler.deleteAfterRollback(shareFileObjectStorageService, uploadPlan.objectKey())',
  'fileUpDownloadRepository.save(uploaded)',
]);
ensureExcludes(persistSharedFolderUpload, 'ShareFileAccessService.persistSharedFolderUpload', [
  'minioClient.',
  'putObject',
  'copyObject',
  'removeObject',
]);
const objectStorageConsistencyService = read('backend/src/main/java/com/example/WaffleBear/file/service/ObjectStorageConsistencyService.java');
const objectStorageOrphanCleanupJob = read('backend/src/main/java/com/example/WaffleBear/file/service/ObjectStorageOrphanCleanupJob.java');
const objectStorageOrphanCleanupJobTest = read('backend/src/test/java/com/example/WaffleBear/file/service/ObjectStorageOrphanCleanupJobTest.java');
const objectStorageConsistencyServiceTest = read('backend/src/test/java/com/example/WaffleBear/file/service/ObjectStorageConsistencyServiceTest.java');
const waffleBearApplication = read('backend/src/main/java/com/example/WaffleBear/WaffleBearApplication.java');
const applicationYaml = read('backend/src/main/resources/application.yml');
const helmValues = read('devops/Helm/values.yaml');
const helmProductionExample = read('devops/Helm/values.production.example.yaml');
const fileUpDownloadRepository = read('backend/src/main/java/com/example/WaffleBear/file/FileUpDownloadRepository.java');
const fileVersionRepository = read('backend/src/main/java/com/example/WaffleBear/file/version/FileVersionRepository.java');
const workspaceAssetRepository = read('backend/src/main/java/com/example/WaffleBear/workspace/asset/WorkspaceAssetRepository.java');
ensureIncludes(objectStorageConsistencyService, 'ObjectStorageConsistencyService class', [
  'loadReferencedCloudObjectKeys',
  'fileUpDownloadRepository.findStoredObjectKeys()',
  'fileVersionRepository.findStoredObjectKeys()',
  'workspaceAssetRepository.findAllObjectKeys()',
  'minioClient.listObjects',
  'ListObjectsArgs.builder()',
  'fileObjectDeletionService.deleteObjects(report.orphanObjectKeys())',
  'dryRun',
]);
ensureNoTransactionalAnnotation(
  objectStorageConsistencyService,
  'public StorageObjectCleanupReport cleanupCloudOrphanObjects(',
  'ObjectStorageConsistencyService.cleanupCloudOrphanObjects'
);
ensureIncludes(objectStorageConsistencyServiceTest, 'ObjectStorageConsistencyServiceTest', [
  'cleanupCloudOrphanObjectsPropagatesDeletionFailuresForRetry',
  'doThrow(new IllegalStateException("delete failed"))',
  'assertThatThrownBy(() -> service.cleanupCloudOrphanObjects(10, false))',
  'verify(fileObjectDeletionService).deleteObjects(List.of("1/orphan.tmp"))',
]);
ensureIncludes(objectStorageOrphanCleanupJob, 'ObjectStorageOrphanCleanupJob class', [
  '@ConditionalOnProperty(prefix = "app.storage.orphan-cleanup", name = "enabled", havingValue = "true")',
  '@Scheduled',
  'app.storage.orphan-cleanup.dry-run:true',
  'app.storage.orphan-cleanup.max-scan:10000',
  'cleanupCloudOrphanObjects(maxScan, dryRun)',
]);
ensureIncludes(objectStorageOrphanCleanupJobTest, 'ObjectStorageOrphanCleanupJobTest', [
  'cleanupCloudOrphansUsesConfiguredScanLimitAndDryRunMode',
  'cleanupCloudOrphansDoesNotPropagateRuntimeFailures',
  'ReflectionTestUtils.setField(job, "maxScan"',
  'ReflectionTestUtils.setField(job, "dryRun"',
  'assertThatCode(job::cleanupCloudOrphans).doesNotThrowAnyException()',
  'verify(consistencyService).cleanupCloudOrphanObjects(',
]);
ensureIncludes(waffleBearApplication, 'WaffleBearApplication scheduling configuration', [
  '@EnableScheduling',
]);
ensureIncludes(applicationYaml, 'application.yml orphan cleanup defaults', [
  'orphan-cleanup:',
  'enabled: ${APP_STORAGE_ORPHAN_CLEANUP_ENABLED:false}',
  'dry-run: ${APP_STORAGE_ORPHAN_CLEANUP_DRY_RUN:true}',
  'max-scan: ${APP_STORAGE_ORPHAN_CLEANUP_MAX_SCAN:10000}',
]);
ensureIncludes(fileUpDownloadRepository, 'FileUpDownloadRepository stored object key query', [
  'select f.fileSavePath',
  'List<String> findStoredObjectKeys(@Param("fileNodeType") FileNodeType fileNodeType)',
]);
ensureIncludes(fileVersionRepository, 'FileVersionRepository stored object key query', [
  'select v.fileSavePath',
  'List<String> findStoredObjectKeys()',
]);
ensureIncludes(workspaceAssetRepository, 'WorkspaceAssetRepository object key query', [
  'select a.objectKey',
  'List<String> findAllObjectKeys()',
]);
const minioFileService = read('backend/src/main/java/com/example/WaffleBear/file/service/FileUpDownloadMinioService.java');
const fileObjectCleanupScheduler = read('backend/src/main/java/com/example/WaffleBear/file/service/FileObjectCleanupScheduler.java');
const fileTreeRules = read('backend/src/main/java/com/example/WaffleBear/file/service/FileTreeRules.java');
ensureTransactionalAnnotation(
  minioFileService,
  'public FileCommonDto.FileActionRes deletePermanently(',
  'FileUpDownloadMinioService.deletePermanently'
);
const deletePermanently = extractMethod(
  minioFileService,
  'public FileCommonDto.FileActionRes deletePermanently('
);
ensureIncludes(deletePermanently, 'FileUpDownloadMinioService.deletePermanently', [
  'removeMinioObjectsAfterCommit(targetTree)',
  'fileUpDownloadRepository.deleteAll(FileTreeRules.sortForDelete(targetTree))',
]);
ensureExcludes(deletePermanently, 'FileUpDownloadMinioService.deletePermanently', [
  'deleteObjectKeys(',
  'minioClient.',
  'removeObject',
  'removeObjects',
]);

ensureTransactionalAnnotation(
  minioFileService,
  'public FileCommonDto.FileActionRes clearTrash(',
  'FileUpDownloadMinioService.clearTrash'
);
const clearTrash = extractMethod(minioFileService, 'public FileCommonDto.FileActionRes clearTrash(');
ensureIncludes(clearTrash, 'FileUpDownloadMinioService.clearTrash', [
  'removeMinioObjectsAfterCommit(trashedFiles)',
  'fileUpDownloadRepository.deleteAll(FileTreeRules.sortForDelete(trashedFiles))',
]);
ensureExcludes(clearTrash, 'FileUpDownloadMinioService.clearTrash', [
  'deleteObjectKeys(',
  'minioClient.',
  'removeObject',
  'removeObjects',
]);

ensureExcludes(minioFileService, 'FileUpDownloadMinioService class', [
  'FileVersionService',
  'fileVersionService',
  'minioClient.',
  'RemoveObjectsArgs',
  'io.minio.messages.DeleteObject',
  'removeObjects',
  'TransactionSynchronizationManager',
  'TransactionSynchronization',
]);
const removeAfterCommit = extractMethod(minioFileService, 'private void removeMinioObjectsAfterCommit(');
ensureIncludes(removeAfterCommit, 'FileUpDownloadMinioService.removeMinioObjectsAfterCommit', [
  'fileVersionLifecycleService.findVersionObjectKeys(files)',
  'FileObjectCleanupScheduler.deleteAfterCommit(fileObjectDeletionService, objectKeys)',
]);
ensureIncludes(fileObjectCleanupScheduler, 'FileObjectCleanupScheduler class', [
  'TransactionSynchronizationManager.isSynchronizationActive()',
  'TransactionSynchronizationManager.isActualTransactionActive()',
  'TransactionSynchronizationManager.registerSynchronization',
  'afterCommit()',
  'deletionService.deleteObjects(keys)',
]);
ensureIncludes(fileTreeRules, 'FileTreeRules class', [
  'collectTargetTree(FileInfo target',
  'sortForDelete(Collection<FileInfo> targetTree)',
  'hasSelectedAncestor(FileInfo file',
  'hasTrashedAncestor(FileInfo file',
  'ensureNoLockedFileNodes(Collection<FileInfo> files)',
  'resolveNodeType(FileInfo entity)',
]);

if (errors.length > 0) {
  console.error('Storage transaction boundary verification failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Storage transaction boundary verification passed.');
