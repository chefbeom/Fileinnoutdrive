package com.example.WaffleBear.file.upload;

import com.example.WaffleBear.administrator.StorageAnalyticsService;
import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.service.StoragePlanService;
import com.example.WaffleBear.file.upload.dto.UploadDto;
import com.example.WaffleBear.file.version.FileVersionLifecycleService;
import com.example.WaffleBear.file.version.FileVersionService;
import com.example.WaffleBear.user.model.User;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UploadServiceTest {

    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;

    @Mock
    private UploadObjectStorageService uploadObjectStorageService;

    @Mock
    private StoragePlanService storagePlanService;

    @Mock
    private UploadFolderService uploadFolderService;

    @Mock
    private StorageAnalyticsService storageAnalyticsService;

    @Mock
    private UploadReservationStore uploadReservationStore;

    @Mock
    private FileVersionService fileVersionService;

    @Mock
    private FileVersionLifecycleService fileVersionLifecycleService;

    @Mock
    private TransactionTemplate transactionTemplate;

    @InjectMocks
    private UploadService uploadService;

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
    void completeIsNotTransactionalBecauseStorageVerificationRunsOutsideDbBoundary() throws Exception {
        assertThat(UploadService.class
                .getMethod("complete", Long.class, UploadDto.CompleteReq.class)
                .isAnnotationPresent(Transactional.class))
                .isFalse();
    }
    @Test
    void completeDeletesUploadedObjectsAndReleasesReservationWhenPreSaveValidationFails() throws Exception {
        Long userIdx = 7L;
        String finalObjectKey = "7/final.bin";
        List<String> chunkObjectKeys = List.of("7/tmp/upload.part00001of00002.bin", "7/tmp/upload.part00002of00002.bin");
        UploadDto.CompleteReq request = UploadDto.CompleteReq.builder()
                .fileOriginName("large.bin")
                .fileFormat("bin")
                .fileSize(200L)
                .finalObjectKey(finalObjectKey)
                .chunkObjectKeys(chunkObjectKeys)
                .build();

        when(fileUpDownloadRepository.findByUser_IdxAndFileSavePath(userIdx, finalObjectKey))
                .thenReturn(Optional.empty());
        when(uploadObjectStorageService.resolveCompletedObjectSize(finalObjectKey, 200L)).thenReturn(200L);
        when(storagePlanService.resolveQuota(userIdx)).thenReturn(new StoragePlanService.StorageQuota(
                "FREE",
                "Free",
                "Free",
                100L,
                0L,
                100L,
                false,
                false,
                1_000L,
                10
        ));
        when(uploadReservationStore.reservedBytes(userIdx, finalObjectKey)).thenReturn(0L);

        assertThatThrownBy(() -> uploadService.complete(userIdx, request))
                .isInstanceOf(BaseException.class);

        verify(uploadFolderService, never()).saveCompletedUpload(any(), any(), any(), any(), any(Long.class), any());
        verify(uploadObjectStorageService, times(2)).deleteObjectKeys(any());
        verify(uploadReservationStore).release(finalObjectKey);
        verify(storageAnalyticsService, never()).recordIngress(any(), any(), any(), any(Long.class), any(), any());
    }

    @Test
    void completeIgnoresAnalyticsFailureAfterFileSave() throws Exception {
        Long userIdx = 7L;
        String finalObjectKey = "7/final.bin";
        UploadDto.CompleteReq request = UploadDto.CompleteReq.builder()
                .fileOriginName("ok.bin")
                .fileFormat("bin")
                .fileSize(128L)
                .finalObjectKey(finalObjectKey)
                .chunkObjectKeys(List.of())
                .build();

        when(fileUpDownloadRepository.findByUser_IdxAndFileSavePath(userIdx, finalObjectKey))
                .thenReturn(Optional.empty());
        when(uploadObjectStorageService.resolveCompletedObjectSize(finalObjectKey, 128L)).thenReturn(128L);
        when(storagePlanService.resolveQuota(userIdx)).thenReturn(new StoragePlanService.StorageQuota(
                "FREE",
                "Free",
                "Free",
                1_000L,
                0L,
                1_000L,
                false,
                false,
                1_000L,
                10
        ));
        when(uploadReservationStore.reservedBytes(userIdx, finalObjectKey)).thenReturn(0L);
        doThrow(new RuntimeException("ledger down"))
                .when(storageAnalyticsService)
                .recordIngress(any(), any(), any(), anyLong(), any(), any());

        UploadDto.CompleteRes result = uploadService.complete(userIdx, request);

        assertThat(result.getFinalObjectKey()).isEqualTo(finalObjectKey);
        verify(uploadFolderService).saveCompletedUpload(eq(userIdx), eq(request), eq("ok.bin"), eq("bin"), eq(128L), eq(finalObjectKey));
        verify(uploadReservationStore).release(finalObjectKey);
        verify(uploadObjectStorageService, never()).deleteObjectKeys(any());
    }

    @Test
    void completeReplaceSubtractsPreviousSizeAndDeletesOldObjectAfterSave() throws Exception {
        Long userIdx = 7L;
        Long replaceFileId = 22L;
        String oldObjectKey = "7/old.bin";
        String finalObjectKey = "7/new.bin";
        UploadDto.CompleteReq request = UploadDto.CompleteReq.builder()
                .fileOriginName("new.bin")
                .fileFormat("bin")
                .fileSize(300L)
                .finalObjectKey(finalObjectKey)
                .chunkObjectKeys(List.of())
                .replaceFileId(replaceFileId)
                .build();
        FileInfo replaceTarget = FileInfo.builder()
                .idx(replaceFileId)
                .user(User.builder().idx(userIdx).build())
                .nodeType(FileNodeType.FILE)
                .fileOriginName("old.bin")
                .fileFormat("bin")
                .fileSaveName("old.bin")
                .fileSavePath(oldObjectKey)
                .fileSize(250L)
                .lockedFile(false)
                .trashed(false)
                .build();

        when(fileUpDownloadRepository.findByIdxAndUser_Idx(replaceFileId, userIdx))
                .thenReturn(Optional.of(replaceTarget));
        when(fileUpDownloadRepository.findByUser_IdxAndFileSavePath(userIdx, finalObjectKey))
                .thenReturn(Optional.empty());
        when(fileUpDownloadRepository.sumStoredFileBytesByUser(userIdx, FileNodeType.FILE))
                .thenReturn(900L);
        when(uploadObjectStorageService.resolveCompletedObjectSize(finalObjectKey, 300L)).thenReturn(300L);
        when(storagePlanService.resolveQuota(userIdx)).thenReturn(new StoragePlanService.StorageQuota(
                "FREE",
                "Free",
                "Free",
                1_000L,
                0L,
                1_000L,
                false,
                false,
                1_000L,
                10
        ));
        when(uploadReservationStore.reservedBytes(userIdx, finalObjectKey)).thenReturn(0L);

        UploadDto.CompleteRes result = uploadService.complete(userIdx, request);

        assertThat(result.getFinalObjectKey()).isEqualTo(finalObjectKey);
        verify(fileVersionService).snapshotCurrent(replaceTarget);
        verify(uploadFolderService).saveCompletedUpload(eq(userIdx), eq(request), eq("new.bin"), eq("bin"), eq(300L), eq(finalObjectKey));
        verify(uploadObjectStorageService).deleteObjectKeys(any());
    }

    @Test
    void completeDeletesFinalAndChunksWhenTransactionRollsBackAfterSave() throws Exception {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        Long userIdx = 7L;
        String finalObjectKey = "7/final.bin";
        List<String> chunkObjectKeys = List.of("7/tmp/upload.part00001of00002.bin", "7/tmp/upload.part00002of00002.bin");
        UploadDto.CompleteReq request = UploadDto.CompleteReq.builder()
                .fileOriginName("ok.bin")
                .fileFormat("bin")
                .fileSize(128L)
                .finalObjectKey(finalObjectKey)
                .chunkObjectKeys(chunkObjectKeys)
                .build();

        when(fileUpDownloadRepository.findByUser_IdxAndFileSavePath(userIdx, finalObjectKey))
                .thenReturn(Optional.empty());
        when(uploadObjectStorageService.resolveCompletedObjectSize(finalObjectKey, 128L)).thenReturn(128L);
        when(storagePlanService.resolveQuota(userIdx)).thenReturn(new StoragePlanService.StorageQuota(
                "FREE",
                "Free",
                "Free",
                1_000L,
                0L,
                1_000L,
                false,
                false,
                1_000L,
                10
        ));
        when(uploadReservationStore.reservedBytes(userIdx, finalObjectKey)).thenReturn(0L);

        UploadDto.CompleteRes result = uploadService.complete(userIdx, request);

        assertThat(result.getFinalObjectKey()).isEqualTo(finalObjectKey);
        verify(uploadFolderService).saveCompletedUpload(eq(userIdx), eq(request), eq("ok.bin"), eq("bin"), eq(128L), eq(finalObjectKey));
        verify(uploadObjectStorageService, never()).deleteObjectKeys(any());

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        }

        verify(uploadObjectStorageService, times(2)).deleteObjectKeys(any());
    }

    @Test
    void completeDeletesChunksAndReplacedObjectOnlyAfterTransactionCommit() throws Exception {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        Long userIdx = 7L;
        Long replaceFileId = 22L;
        String oldObjectKey = "7/old.bin";
        String finalObjectKey = "7/new.bin";
        List<String> chunkObjectKeys = List.of("7/tmp/upload.part00001of00001.bin");
        UploadDto.CompleteReq request = UploadDto.CompleteReq.builder()
                .fileOriginName("new.bin")
                .fileFormat("bin")
                .fileSize(300L)
                .finalObjectKey(finalObjectKey)
                .chunkObjectKeys(chunkObjectKeys)
                .replaceFileId(replaceFileId)
                .build();
        FileInfo replaceTarget = FileInfo.builder()
                .idx(replaceFileId)
                .user(User.builder().idx(userIdx).build())
                .nodeType(FileNodeType.FILE)
                .fileOriginName("old.bin")
                .fileFormat("bin")
                .fileSaveName("old.bin")
                .fileSavePath(oldObjectKey)
                .fileSize(250L)
                .lockedFile(false)
                .trashed(false)
                .build();

        when(fileUpDownloadRepository.findByIdxAndUser_Idx(replaceFileId, userIdx))
                .thenReturn(Optional.of(replaceTarget));
        when(fileUpDownloadRepository.findByUser_IdxAndFileSavePath(userIdx, finalObjectKey))
                .thenReturn(Optional.empty());
        when(fileUpDownloadRepository.sumStoredFileBytesByUser(userIdx, FileNodeType.FILE))
                .thenReturn(900L);
        when(uploadObjectStorageService.resolveCompletedObjectSize(finalObjectKey, 300L)).thenReturn(300L);
        when(storagePlanService.resolveQuota(userIdx)).thenReturn(new StoragePlanService.StorageQuota(
                "FREE",
                "Free",
                "Free",
                1_000L,
                0L,
                1_000L,
                false,
                false,
                1_000L,
                10
        ));
        when(uploadReservationStore.reservedBytes(userIdx, finalObjectKey)).thenReturn(0L);

        UploadDto.CompleteRes result = uploadService.complete(userIdx, request);

        assertThat(result.getFinalObjectKey()).isEqualTo(finalObjectKey);
        verify(fileVersionService).snapshotCurrent(replaceTarget);
        verify(uploadFolderService).saveCompletedUpload(eq(userIdx), eq(request), eq("new.bin"), eq("bin"), eq(300L), eq(finalObjectKey));
        verify(uploadObjectStorageService, never()).deleteObjectKeys(any());

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCommit();
        }

        verify(uploadObjectStorageService, times(2)).deleteObjectKeys(any());
    }

    @Test
    void abortIsNotTransactionalBecauseObjectCleanupRunsOutsideDbBoundary() throws Exception {
        assertThat(UploadService.class
                .getMethod("abort", Long.class, UploadDto.AbortReq.class)
                .isAnnotationPresent(Transactional.class))
                .isFalse();
    }

    @Test
    void abortCleansObjectsAndReservationWhenAnalyticsFails() throws Exception {
        Long userIdx = 7L;
        String finalObjectKey = "7/final.bin";
        List<String> chunkObjectKeys = List.of("7/tmp/upload.part00001of00002.bin", "7/tmp/upload.part00002of00002.bin");
        UploadDto.AbortReq request = UploadDto.AbortReq.builder()
                .finalObjectKey(finalObjectKey)
                .chunkObjectKeys(chunkObjectKeys)
                .build();

        when(fileUpDownloadRepository.findByUser_IdxAndFileSavePath(userIdx, finalObjectKey))
                .thenReturn(Optional.empty());
        when(uploadObjectStorageService.sumExistingObjectSizes(any())).thenReturn(64L);
        doThrow(new RuntimeException("ledger down"))
                .when(storageAnalyticsService)
                .recordIngress(any(), any(), any(), anyLong(), any(), any());

        UploadDto.ActionRes result = uploadService.abort(userIdx, request);

        assertThat(result.getAction()).isEqualTo("abort-upload");
        assertThat(result.getAffectedCount()).isEqualTo(3);
        verify(uploadObjectStorageService).deleteObjectKeys(any());
        verify(uploadReservationStore).release(finalObjectKey);
    }
}
