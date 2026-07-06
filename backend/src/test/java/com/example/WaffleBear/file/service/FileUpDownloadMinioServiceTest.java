package com.example.WaffleBear.file.service;

import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.file.info.dto.FileInfoDto;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.manage.dto.FileManageDto;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.share.ShareInheritanceService;
import com.example.WaffleBear.file.share.ShareRepository;
import com.example.WaffleBear.file.version.FileVersionLifecycleService;
import com.example.WaffleBear.user.model.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileUpDownloadMinioServiceTest {

    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;


    @Mock
    private FileListItemUrlService fileListItemUrlService;

    @Mock
    private FileObjectDownloadService fileObjectDownloadService;

    @Mock
    private FileObjectDeletionService fileObjectDeletionService;

    @Mock
    private FileStorageSummaryService fileStorageSummaryService;

    @Mock
    private StoragePlanService storagePlanService;

    @Mock
    private ShareRepository shareRepository;

    @Mock
    private ShareInheritanceService shareInheritanceService;

    @Mock
    private FileVersionLifecycleService fileVersionLifecycleService;

    @Mock
    private TransactionTemplate transactionTemplate;

    @InjectMocks
    private FileUpDownloadMinioService fileService;

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
    void deletePermanentlyRemovesObjectsOnlyAfterTransactionCommit() throws Exception {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        FileInfo file = file(10L, 7L, "7/report.mp4", "mp4");
        stubPermanentDelete(file);

        var result = fileService.deletePermanently(7L, 10L);

        assertThat(result.getAffectedCount()).isEqualTo(1);
        verify(fileObjectDeletionService, never()).deleteObjects(any());

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCommit();
        }

        verify(fileObjectDeletionService).deleteObjects(any());
        verify(fileUpDownloadRepository).deleteAll(List.of(file));
    }

    @Test
    void deletePermanentlyKeepsObjectsWhenTransactionRollsBack() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        FileInfo file = file(10L, 7L, "7/report.txt", "txt");
        stubPermanentDelete(file);

        fileService.deletePermanently(7L, 10L);

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        }

        verify(fileObjectDeletionService, never()).deleteObjects(any());
    }

    @Test
    void deletePermanentlyDeletesObjectsImmediatelyWhenNoActualTransactionIsActive() throws Exception {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(false);
        FileInfo file = file(10L, 7L, "7/report.txt", "txt");
        stubPermanentDelete(file);

        fileService.deletePermanently(7L, 10L);

        verify(fileObjectDeletionService).deleteObjects(any());
    }

    @Test
    void clearTrashRemovesObjectsOnlyAfterTransactionCommit() throws Exception {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        FileInfo file = trashedFile(10L, 7L, "7/report.txt", "txt");
        stubClearTrash(file);

        var result = fileService.clearTrash(7L);

        assertThat(result.getAffectedCount()).isEqualTo(1);
        verify(fileObjectDeletionService, never()).deleteObjects(any());

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCommit();
        }

        verify(fileObjectDeletionService).deleteObjects(any());
        verify(fileUpDownloadRepository).deleteAll(List.of(file));
    }

    @Test
    void clearTrashKeepsObjectsWhenTransactionRollsBack() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        FileInfo file = trashedFile(10L, 7L, "7/report.txt", "txt");
        stubClearTrash(file);

        fileService.clearTrash(7L);

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        }

        verify(fileObjectDeletionService, never()).deleteObjects(any());
    }

    @Test
    void fileListPageGeneratesUrlsOutsideReadTransaction() throws Exception {
        runTransactionTemplateCallbacksWithActiveTransaction();
        FileInfo file = file(10L, 7L, "7/report.txt", "txt");
        when(fileUpDownloadRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(file), PageRequest.of(0, 20), 1));
        when(fileUpDownloadRepository.findDistinctFileFormatsByUserAndParent(7L, null, FileNodeType.FILE))
                .thenReturn(List.of("txt"));
        when(fileListItemUrlService.attachUrls(any(FileCommonDto.FileListItemRes.class))).thenAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            FileCommonDto.FileListItemRes item = invocation.getArgument(0);
            item.setPresignedDownloadUrl("http://download.example/report.txt");
            item.setPresignedUrlExpiresIn(1800);
            return item;
        });

        var result = fileService.fileListPage(7L, FileManageDto.ListPageReq.builder().page(0).size(20).build());

        assertThat(result.getFileList()).hasSize(1);
        assertThat(result.getFileList().get(0).getPresignedDownloadUrl()).isEqualTo("http://download.example/report.txt");
        assertThat(result.getAvailableExtensions()).containsExactly("txt");
    }

    @Test
    void getTextPreviewReadsObjectOutsideMetadataTransaction() {
        runTransactionTemplateCallbacksWithActiveTransaction();
        FileInfo file = file(10L, 7L, "7/report.txt", "txt");
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(10L, 7L)).thenReturn(Optional.of(file));
        when(fileObjectDownloadService.readTextPreview(
                eq(10L), eq("7/report.txt"), eq("report.txt"), eq("txt"), eq(128L)
        )).thenAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return FileInfoDto.TextPreviewRes.builder()
                    .idx(10L)
                    .fileOriginName("report.txt")
                    .fileFormat("txt")
                    .contentType("text/plain")
                    .content("hello preview")
                    .truncated(false)
                    .fileSize(128L)
                    .build();
        });

        var preview = fileService.getTextPreview(7L, 10L);

        assertThat(preview.getContent()).isEqualTo("hello preview");
        assertThat(preview.getTruncated()).isFalse();
    }

    @Test
    void downloadFileReadsObjectOutsideMetadataTransaction() {
        runTransactionTemplateCallbacksWithActiveTransaction();
        FileInfo file = file(10L, 7L, "7/report.txt", "txt");
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(10L, 7L)).thenReturn(Optional.of(file));
        when(fileObjectDownloadService.readObjectBytes("7/report.txt")).thenAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return "hello".getBytes(StandardCharsets.UTF_8);
        });

        var payload = fileService.downloadFile(7L, 10L);

        assertThat(payload.bytes()).isEqualTo("hello".getBytes(StandardCharsets.UTF_8));
        assertThat(payload.contentType()).isEqualTo("text/plain");
        assertThat(payload.fileName()).isEqualTo("report.txt");
        assertThat(payload.contentLength()).isEqualTo(128L);
    }

    @Test
    void getDownloadUrlGeneratesPresignedUrlOutsideMetadataTransaction() {
        runTransactionTemplateCallbacksWithActiveTransaction();
        FileInfo file = file(10L, 7L, "7/report.txt", "txt");
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(10L, 7L)).thenReturn(Optional.of(file));
        when(fileObjectDownloadService.generateAttachmentDownloadUrl(
                eq("7/report.txt"), eq("report.txt"), eq("text/plain")
        )).thenAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return "http://download.example/report.txt";
        });

        String url = fileService.getDownloadUrl(7L, 10L);

        assertThat(url).isEqualTo("http://download.example/report.txt");
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

    private void stubPermanentDelete(FileInfo file) {
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(file.getIdx(), file.getUser().getIdx()))
                .thenReturn(Optional.of(file));
        when(fileUpDownloadRepository.findAllByUser_Idx(file.getUser().getIdx())).thenReturn(List.of(file));
        when(fileVersionLifecycleService.findVersionObjectKeys(List.of(file))).thenReturn(List.of("7/versions/report-v1.txt"));
        when(shareRepository.findAllByFile_IdxIn(List.of(file.getIdx()))).thenReturn(List.of());
    }


    private void stubClearTrash(FileInfo file) {
        when(fileUpDownloadRepository.findAllByUser_Idx(file.getUser().getIdx())).thenReturn(List.of(file));
        when(fileVersionLifecycleService.findVersionObjectKeys(List.of(file))).thenReturn(List.of("7/versions/report-v1.txt"));
        when(shareRepository.findAllByFile_IdxIn(List.of(file.getIdx()))).thenReturn(List.of());
    }

    private static FileInfo trashedFile(Long idx, Long userIdx, String objectKey, String format) {
        FileInfo file = file(idx, userIdx, objectKey, format);
        file.markTrashed(LocalDateTime.now());
        return file;
    }
    private static FileInfo file(Long idx, Long userIdx, String objectKey, String format) {
        return FileInfo.builder()
                .idx(idx)
                .user(User.builder().idx(userIdx).build())
                .nodeType(FileNodeType.FILE)
                .fileOriginName("report." + format)
                .fileFormat(format)
                .fileSaveName("report." + format)
                .fileSavePath(objectKey)
                .fileSize(128L)
                .lockedFile(false)
                .sharedFile(false)
                .trashed(false)
                .build();
    }
}