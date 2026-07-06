package com.example.WaffleBear.workspace.asset;

import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.asset.model.WorkspaceAsset;
import com.example.WaffleBear.workspace.model.post.Post;
import com.example.WaffleBear.workspace.model.relation.AccessRole;
import com.example.WaffleBear.workspace.model.relation.UserPost;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkspaceAssetServiceTest {

    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private WorkspaceAssetRepository workspaceAssetRepository;

    @Mock
    private UserPostRepository userPostRepository;

    @Mock
    private WorkspaceAssetObjectStorageService workspaceAssetObjectStorageService;

    @Mock
    private WorkspaceAssetEventPublisher workspaceAssetEventPublisher;

    @Mock
    private TransactionTemplate transactionTemplate;

    @InjectMocks
    private WorkspaceAssetService workspaceAssetService;

    @BeforeEach
    void runTransactionTemplateCallbacks() {
        lenient().when(transactionTemplate.execute(any())).thenAnswer(invocation -> {
            TransactionCallback<?> callback = invocation.getArgument(0);
            return callback.doInTransaction(new SimpleTransactionStatus());
        });
    }

    @AfterEach
    void clearTransactionSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    @Test
    void directDeleteMethodsAreNotServiceLevelTransactionalBecauseCleanupRunsAfterCommit() throws Exception {
        assertThat(WorkspaceAssetService.class
                .getMethod("deleteWorkspaceAsset", Long.class, Long.class, Long.class)
                .isAnnotationPresent(Transactional.class))
                .isFalse();
        assertThat(WorkspaceAssetService.class
                .getMethod("deleteEditorJsImage", Long.class, Long.class, Long.class)
                .isAnnotationPresent(Transactional.class))
                .isFalse();
    }

    @Test
    void uploadWorkspaceAssetsDelegatesUploadEventToPublisher() throws Exception {
        startTransactionSynchronization();
        MockMultipartFile upload = setupSuccessfulUpload();

        var result = workspaceAssetService.uploadWorkspaceAssets(1L, 10L, new MockMultipartFile[]{upload});

        assertThat(result).hasSize(1);
        InOrder storageThenDatabase = inOrder(workspaceAssetObjectStorageService, workspaceAssetRepository);
        storageThenDatabase.verify(workspaceAssetObjectStorageService)
                .putCloudObject(anyString(), eq(upload), eq("text/plain"));
        storageThenDatabase.verify(workspaceAssetRepository).save(any(WorkspaceAsset.class));
        verify(workspaceAssetEventPublisher).publishAfterCommit(eq(10L), eq("UPLOAD"), eq(1L), any(), any());
        verify(workspaceAssetObjectStorageService, never()).deleteCloudObjectsQuietly(any());
    }

    @Test
    void uploadWorkspaceAssetsDeletesUploadedObjectWhenTransactionRollsBackAfterDbSave() throws Exception {
        startTransactionSynchronization();
        MockMultipartFile upload = setupSuccessfulUpload();

        workspaceAssetService.uploadWorkspaceAssets(1L, 10L, new MockMultipartFile[]{upload});

        verify(workspaceAssetObjectStorageService, never()).deleteCloudObjectsQuietly(any());

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        }

        verify(workspaceAssetObjectStorageService).deleteCloudObjectsQuietly(any());
        verify(workspaceAssetEventPublisher).publishAfterCommit(eq(10L), eq("UPLOAD"), eq(1L), any(), any());
    }

    @Test
    void uploadWorkspaceAssetsDeletesUploadedObjectImmediatelyWhenDbSaveFails() {
        MockMultipartFile upload = setupWorkspaceAccessAndFile();
        when(workspaceAssetRepository.save(any(WorkspaceAsset.class)))
                .thenThrow(new IllegalStateException("database down"));

        assertThatThrownBy(() -> workspaceAssetService.uploadWorkspaceAssets(1L, 10L, new MockMultipartFile[]{upload}))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("report.txt");

        verify(workspaceAssetObjectStorageService).deleteCloudObjectsQuietly(any());
        verify(workspaceAssetEventPublisher, never()).publishAfterCommit(any(), anyString(), any(), any(), any());
    }

    @Test
    void uploadAssetsEditorJsDeletesUploadedObjectImmediatelyWhenDbSaveFails() {
        MockMultipartFile upload = setupWorkspaceAccessAndFile();
        when(workspaceAssetObjectStorageService.generateCloudGetUrl(anyString()))
                .thenReturn("http://download.example/report.txt");
        when(workspaceAssetRepository.save(any(WorkspaceAsset.class)))
                .thenThrow(new IllegalStateException("database down"));

        assertThatThrownBy(() -> workspaceAssetService.uploadAssetsEditorJs(1L, 10L, upload))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("database down");

        InOrder storageThenDatabase = inOrder(workspaceAssetObjectStorageService, workspaceAssetRepository);
        storageThenDatabase.verify(workspaceAssetObjectStorageService)
                .putCloudObject(anyString(), eq(upload), eq("text/plain"));
        storageThenDatabase.verify(workspaceAssetRepository).save(any(WorkspaceAsset.class));
        verify(workspaceAssetObjectStorageService).deleteCloudObjectsQuietly(any());
    }

    @Test
    void saveAssetToDriveDeletesCopiedObjectImmediatelyWhenDbSaveFails() {
        setupWorkspaceAssetReadAccess();
        when(workspaceAssetObjectStorageService.resolveCloudBucketName()).thenReturn("fileinnout-test");
        when(fileUpDownloadRepository.save(any(FileInfo.class)))
                .thenThrow(new IllegalStateException("database down"));

        assertThatThrownBy(() -> workspaceAssetService.saveAssetToDrive(1L, 10L, 77L, null))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("database down");

        InOrder storageThenDatabase = inOrder(workspaceAssetObjectStorageService, fileUpDownloadRepository);
        storageThenDatabase.verify(workspaceAssetObjectStorageService)
                .copyCloudObjectToBucket(eq("asset/workspace-uuid/stored-report.txt"), eq("fileinnout-test"), anyString());
        storageThenDatabase.verify(fileUpDownloadRepository).save(any(FileInfo.class));
        verify(workspaceAssetObjectStorageService).deleteCloudObjectsQuietly(any());
    }

    @Test
    void uploadWorkspaceAssetsUsesSanitizedOriginalNameForObjectKeyAndEntity() {
        MockMultipartFile upload = setupWorkspaceAccessAndFile("..\\reports/secret.txt");
        lenient().when(workspaceAssetObjectStorageService.resolvePresignedUrlExpirySeconds()).thenReturn(1800);
        lenient().when(workspaceAssetObjectStorageService.generateCloudGetUrl(anyString()))
                .thenReturn("http://download.example/secret.txt");
        ArgumentCaptor<WorkspaceAsset> savedAsset = ArgumentCaptor.forClass(WorkspaceAsset.class);
        when(workspaceAssetRepository.save(savedAsset.capture())).thenAnswer(invocation -> {
            WorkspaceAsset asset = invocation.getArgument(0);
            return WorkspaceAsset.builder()
                    .idx(99L)
                    .workspace(asset.getWorkspace())
                    .uploader(asset.getUploader())
                    .assetType(asset.getAssetType())
                    .originalName(asset.getOriginalName())
                    .storedFileName(asset.getStoredFileName())
                    .objectFolder(asset.getObjectFolder())
                    .objectKey(asset.getObjectKey())
                    .contentType(asset.getContentType())
                    .fileSize(asset.getFileSize())
                    .createdAt(LocalDateTime.now())
                    .build();
        });

        workspaceAssetService.uploadWorkspaceAssets(1L, 10L, new MockMultipartFile[]{upload});

        WorkspaceAsset captured = savedAsset.getValue();
        assertThat(captured.getOriginalName()).isEqualTo("secret.txt");
        assertThat(captured.getStoredFileName()).endsWith("_secret.txt");
        assertThat(captured.getObjectKey()).endsWith("_secret.txt");
        assertThat(captured.getObjectKey()).doesNotContain("reports");
    }

    @Test
    void uploadAssetsEditorJsDeletesUploadedObjectWhenTransactionRollsBackAfterDbSave() throws Exception {
        startTransactionSynchronization();
        MockMultipartFile upload = setupSuccessfulUpload();

        var result = workspaceAssetService.uploadAssetsEditorJs(1L, 10L, upload);

        assertThat(result.assetIdx()).isEqualTo(99L);
        verify(workspaceAssetObjectStorageService, never()).deleteCloudObjectsQuietly(any());

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        }

        verify(workspaceAssetObjectStorageService).deleteCloudObjectsQuietly(any());
        verify(workspaceAssetEventPublisher, never()).publishAfterCommit(any(), anyString(), any(), any(), any());
    }

    @Test
    void saveAssetToDriveDeletesCopiedObjectWhenTransactionRollsBackAfterDbSave() throws Exception {
        startTransactionSynchronization();
        setupWorkspaceAssetReadAccess();
        when(workspaceAssetObjectStorageService.resolveCloudBucketName()).thenReturn("fileinnout-test");
        when(workspaceAssetObjectStorageService.resolvePresignedUrlExpirySeconds()).thenReturn(1800);
        when(workspaceAssetObjectStorageService.generateDriveGetUrl(anyString(), eq("fileinnout-test")))
                .thenReturn("http://download.example/copied.bin");
        when(fileUpDownloadRepository.save(any(FileInfo.class))).thenAnswer(invocation -> invocation.getArgument(0));

        workspaceAssetService.saveAssetToDrive(1L, 10L, 77L, null);

        verify(workspaceAssetObjectStorageService, never()).deleteCloudObjectsQuietly(any());

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        }

        verify(workspaceAssetObjectStorageService).deleteCloudObjectsQuietly(any());
    }

    @Test
    void deleteWorkspaceAssetDelegatesDeleteEventToPublisher() throws Exception {
        startTransactionSynchronization();
        setupWorkspaceAssetWriteAccess();

        workspaceAssetService.deleteWorkspaceAsset(1L, 10L, 77L);

        verify(workspaceAssetRepository).delete(any(WorkspaceAsset.class));
        verify(workspaceAssetObjectStorageService, never()).deleteCloudObjectsQuietly(any());
        verify(workspaceAssetEventPublisher).publishAfterCommit(eq(10L), eq("DELETE"), eq(1L), any(), any());

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCommit();
        }

        verify(workspaceAssetObjectStorageService).deleteCloudObjectsQuietly(any());
    }

    @Test
    void deleteWorkspaceAssetDoesNotDeleteObjectWhenTransactionRollsBack() {
        startTransactionSynchronization();
        setupWorkspaceAssetWriteAccess();

        workspaceAssetService.deleteWorkspaceAsset(1L, 10L, 77L);

        verify(workspaceAssetRepository).delete(any(WorkspaceAsset.class));

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        }

        verify(workspaceAssetObjectStorageService, never()).deleteCloudObjectsQuietly(any());
        verify(workspaceAssetEventPublisher).publishAfterCommit(eq(10L), eq("DELETE"), eq(1L), any(), any());
    }

    @Test
    void downloadWorkspaceAssetReadsObjectOutsideReadTransaction() {
        runTransactionTemplateCallbacksWithActiveTransaction();
        setupWorkspaceAssetReadAccess();
        when(workspaceAssetObjectStorageService.resolveCloudBucketName()).thenReturn("fileinnout-test");
        when(workspaceAssetObjectStorageService.readCloudObjectBytes(anyString())).thenAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return "hello".getBytes(StandardCharsets.UTF_8);
        });

        var payload = workspaceAssetService.downloadWorkspaceAsset(1L, 10L, 77L);

        assertThat(payload.bytes()).isEqualTo("hello".getBytes(StandardCharsets.UTF_8));
        assertThat(payload.contentType()).isEqualTo("text/plain");
        assertThat(payload.fileName()).isEqualTo("report.txt");
        assertThat(payload.contentLength()).isEqualTo(5L);
    }

    @Test
    void getWorkspaceAssetDownloadUrlGeneratesPresignedUrlOutsideReadTransaction() {
        runTransactionTemplateCallbacksWithActiveTransaction();
        setupWorkspaceAssetReadAccess();
        when(workspaceAssetObjectStorageService.generateCloudAttachmentUrl(anyString(), eq("report.txt"), eq("text/plain")))
                .thenAnswer(invocation -> {
                    assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
                    return "http://download.example/report.txt";
                });

        String url = workspaceAssetService.getWorkspaceAssetDownloadUrl(1L, 10L, 77L);

        assertThat(url).isEqualTo("http://download.example/report.txt");
    }

    private void startTransactionSynchronization() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
    }

    private void runTransactionTemplateCallbacksWithActiveTransaction() {
        doAnswer(invocation -> {
            TransactionCallback<?> callback = invocation.getArgument(0);
            boolean wasTransactionActive = TransactionSynchronizationManager.isActualTransactionActive();
            TransactionSynchronizationManager.setActualTransactionActive(true);
            try {
                return callback.doInTransaction(new SimpleTransactionStatus());
            } finally {
                TransactionSynchronizationManager.setActualTransactionActive(wasTransactionActive);
            }
        }).when(transactionTemplate).execute(any());
    }

    private void setupWorkspaceAssetWriteAccess() {
        User uploader = User.builder()
                .idx(1L)
                .email("owner@example.com")
                .name("Owner")
                .build();
        Post workspace = Post.builder()
                .idx(10L)
                .UUID("workspace-uuid")
                .build();
        UserPost userPost = UserPost.builder()
                .user(uploader)
                .workspace(workspace)
                .Level(AccessRole.WRITE)
                .build();
        WorkspaceAsset asset = WorkspaceAsset.builder()
                .idx(77L)
                .workspace(workspace)
                .uploader(uploader)
                .assetType(com.example.WaffleBear.workspace.asset.model.WorkspaceAssetType.FILE)
                .originalName("report.txt")
                .storedFileName("stored-report.txt")
                .objectFolder("asset/workspace-uuid")
                .objectKey("asset/workspace-uuid/stored-report.txt")
                .contentType("text/plain")
                .fileSize(5L)
                .build();

        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(1L, 10L)).thenReturn(Optional.of(userPost));
        when(workspaceAssetRepository.findByIdxAndWorkspace_Idx(77L, 10L)).thenReturn(Optional.of(asset));
    }

    private void setupWorkspaceAssetReadAccess() {
        User uploader = User.builder()
                .idx(1L)
                .email("owner@example.com")
                .name("Owner")
                .build();
        Post workspace = Post.builder()
                .idx(10L)
                .UUID("workspace-uuid")
                .build();
        UserPost userPost = UserPost.builder()
                .user(uploader)
                .workspace(workspace)
                .Level(AccessRole.READ)
                .build();
        WorkspaceAsset asset = WorkspaceAsset.builder()
                .idx(77L)
                .workspace(workspace)
                .uploader(uploader)
                .assetType(com.example.WaffleBear.workspace.asset.model.WorkspaceAssetType.FILE)
                .originalName("report.txt")
                .storedFileName("stored-report.txt")
                .objectFolder("asset/workspace-uuid")
                .objectKey("asset/workspace-uuid/stored-report.txt")
                .contentType("text/plain")
                .fileSize(5L)
                .build();

        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(1L, 10L)).thenReturn(Optional.of(userPost));
        when(workspaceAssetRepository.findByIdxAndWorkspace_Idx(77L, 10L)).thenReturn(Optional.of(asset));
    }

    private MockMultipartFile setupSuccessfulUpload() {
        MockMultipartFile upload = setupWorkspaceAccessAndFile();
        lenient().when(workspaceAssetObjectStorageService.resolvePresignedUrlExpirySeconds()).thenReturn(1800);
        lenient().when(workspaceAssetObjectStorageService.generateCloudGetUrl(anyString()))
                .thenReturn("http://download.example/report.txt");
        when(workspaceAssetRepository.save(any(WorkspaceAsset.class))).thenAnswer(invocation -> {
            WorkspaceAsset asset = invocation.getArgument(0);
            return WorkspaceAsset.builder()
                    .idx(99L)
                    .workspace(asset.getWorkspace())
                    .uploader(asset.getUploader())
                    .assetType(asset.getAssetType())
                    .originalName(asset.getOriginalName())
                    .storedFileName(asset.getStoredFileName())
                    .objectFolder(asset.getObjectFolder())
                    .objectKey(asset.getObjectKey())
                    .contentType(asset.getContentType())
                    .fileSize(asset.getFileSize())
                    .createdAt(LocalDateTime.now())
                    .build();
        });
        return upload;
    }

    private MockMultipartFile setupWorkspaceAccessAndFile() {
        return setupWorkspaceAccessAndFile("report.txt");
    }

    private MockMultipartFile setupWorkspaceAccessAndFile(String originalFileName) {
        User uploader = User.builder()
                .idx(1L)
                .email("owner@example.com")
                .name("Owner")
                .build();
        Post workspace = Post.builder()
                .idx(10L)
                .UUID("workspace-uuid")
                .build();
        UserPost userPost = UserPost.builder()
                .user(uploader)
                .workspace(workspace)
                .Level(AccessRole.WRITE)
                .build();
        MockMultipartFile upload = new MockMultipartFile(
                "files",
                originalFileName,
                "text/plain",
                "hello".getBytes(StandardCharsets.UTF_8)
        );

        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(1L, 10L)).thenReturn(Optional.of(userPost));
        when(userRepository.findById(1L)).thenReturn(Optional.of(uploader));
        return upload;
    }
}