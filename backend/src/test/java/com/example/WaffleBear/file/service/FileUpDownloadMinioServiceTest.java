package com.example.WaffleBear.file.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.crypto.VaultFileCryptoService;
import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.file.info.dto.FileInfoDto;
import com.example.WaffleBear.file.model.FileEncryptionMode;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.manage.dto.FileManageDto;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.model.FileSpaceType;
import com.example.WaffleBear.file.secret.SecretAccessGuard;
import com.example.WaffleBear.file.share.ShareInheritanceService;
import com.example.WaffleBear.file.share.ShareRepository;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.version.FileVersionLifecycleService;
import com.example.WaffleBear.user.model.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
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
        ReflectionTestUtils.setField(fileService, "secretAccessGuard", null);
        ReflectionTestUtils.setField(fileService, "vaultFileCryptoService", null);
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
        assertThat(result.getFileList().get(0).getLocationPath()).isEqualTo("홈");
        assertThat(result.getAvailableExtensions()).containsExactly("txt");
    }

    @Test
    void fileListPageRootScopeExcludesHiddenSubtreesResolvesLocationPathsAndRootFolders() {
        User owner = User.builder().idx(7L).build();
        FileInfo docs = folder(10L, owner, null, FileSpaceType.DRIVE);
        docs.rename("Docs");
        FileInfo year2026 = folder(11L, owner, docs, FileSpaceType.DRIVE);
        year2026.rename("2026");
        FileInfo secretRoot = folder(12L, owner, null, FileSpaceType.DRIVE);
        secretRoot.rename("HiddenRoot");
        secretRoot.updateHiddenSettings(true, false, null);
        FileInfo hiddenChild = folder(13L, owner, docs, FileSpaceType.DRIVE);
        hiddenChild.rename("HiddenSub");
        hiddenChild.updateHiddenSettings(true, false, null);

        FileInfo nestedPdf = FileInfo.builder()
                .idx(20L)
                .user(owner)
                .parent(year2026)
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.DRIVE)
                .fileOriginName("plan.pdf")
                .fileFormat("pdf")
                .fileSaveName("saved-20.pdf")
                .fileSavePath("7/saved-20.pdf")
                .fileSize(128L)
                .lockedFile(false)
                .sharedFile(false)
                .trashed(false)
                .build();

        when(fileUpDownloadRepository.findActiveFoldersByUserAndSpace(7L, FileNodeType.FOLDER, false))
                .thenReturn(List.of(docs, year2026, secretRoot, hiddenChild));
        when(fileUpDownloadRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(nestedPdf), PageRequest.of(0, 20), 1));
        when(fileUpDownloadRepository.findDistinctFileFormatsByUserInRootOrParents(
                eq(7L),
                any(),
                eq(FileNodeType.FILE),
                eq(false),
                eq(false)
        )).thenReturn(List.of(".pdf", "JPG", " "));
        when(fileListItemUrlService.attachUrls(any(FileCommonDto.FileListItemRes.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var result = fileService.fileListPage(7L, FileManageDto.ListPageReq.builder()
                .page(0)
                .size(20)
                .searchScope("root")
                .searchQuery(".pdf")
                .extensionFilter("*.pdf, jpg")
                .includeHidden(false)
                .vaultMode(false)
                .build());

        assertThat(result.getRootFolders()).hasSize(1);
        assertThat(result.getRootFolders().get(0).getIdx()).isEqualTo(10L);
        assertThat(result.getRootFolders().get(0).getFileOriginName()).isEqualTo("Docs");
        assertThat(result.getAvailableExtensions()).containsExactly("jpg", "pdf");
        assertThat(result.getFileList()).hasSize(1);
        assertThat(result.getFileList().get(0).getLocationPath()).isEqualTo("홈 / Docs / 2026");

        ArgumentCaptor<java.util.Collection<Long>> parentIdsCaptor = ArgumentCaptor.forClass(java.util.Collection.class);
        verify(fileUpDownloadRepository).findDistinctFileFormatsByUserInRootOrParents(
                eq(7L),
                parentIdsCaptor.capture(),
                eq(FileNodeType.FILE),
                eq(false),
                eq(false)
        );
        assertThat(parentIdsCaptor.getValue()).containsExactlyInAnyOrder(10L, 11L);
    }

    @Test
    void fileListPageSelectedRootFolderRejectsHiddenFolderWhenHiddenNotRevealed() {
        User owner = User.builder().idx(7L).build();
        FileInfo docs = folder(10L, owner, null, FileSpaceType.DRIVE);
        docs.updateHiddenSettings(true, false, null);
        FileInfo child = folder(11L, owner, docs, FileSpaceType.DRIVE);

        when(fileUpDownloadRepository.findActiveFoldersByUserAndSpace(7L, FileNodeType.FOLDER, false))
                .thenReturn(List.of(docs, child));

        assertThatThrownBy(() -> fileService.fileListPage(7L, FileManageDto.ListPageReq.builder()
                .searchScope("root")
                .searchRootFolderId(11L)
                .includeHidden(false)
                .vaultMode(false)
                .build()))
                .isInstanceOf(BaseException.class);
    }

    @Test
    void fileListPageSelectedRootFolderUsesSubtreeExtensionQuery() {
        User owner = User.builder().idx(7L).build();
        FileInfo docs = folder(10L, owner, null, FileSpaceType.DRIVE);
        docs.rename("Docs");
        FileInfo child = folder(11L, owner, docs, FileSpaceType.DRIVE);
        child.rename("Child");

        when(fileUpDownloadRepository.findActiveFoldersByUserAndSpace(7L, FileNodeType.FOLDER, false))
                .thenReturn(List.of(docs, child));
        when(fileUpDownloadRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));
        when(fileUpDownloadRepository.findDistinctFileFormatsByUserAndParentIn(
                eq(7L),
                any(),
                eq(FileNodeType.FILE),
                eq(false),
                eq(false)
        )).thenReturn(List.of("pdf", "docx"));

        var result = fileService.fileListPage(7L, FileManageDto.ListPageReq.builder()
                .searchScope("root")
                .searchRootFolderId(10L)
                .includeHidden(false)
                .vaultMode(false)
                .build());

        assertThat(result.getAvailableExtensions()).containsExactly("docx", "pdf");
        ArgumentCaptor<java.util.Collection<Long>> captor = ArgumentCaptor.forClass(java.util.Collection.class);
        verify(fileUpDownloadRepository).findDistinctFileFormatsByUserAndParentIn(
                eq(7L),
                captor.capture(),
                eq(FileNodeType.FILE),
                eq(false),
                eq(false)
        );
        assertThat(captor.getValue()).containsExactlyInAnyOrder(10L, 11L);
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

    @Test
    void fileListExcludesVaultAndHiddenFolderSubtrees() {
        FileInfo normalFile = file(1L, 7L, "7/public.txt", "txt");
        FileInfo hiddenFolder = FileInfo.builder()
                .idx(2L)
                .user(User.builder().idx(7L).build())
                .nodeType(FileNodeType.FOLDER)
                .spaceType(com.example.WaffleBear.file.model.FileSpaceType.DRIVE)
                .hiddenFolder(true)
                .fileOriginName("Hidden")
                .fileFormat("folder")
                .fileSaveName("folder-hidden")
                .trashed(false)
                .build();
        FileInfo hiddenChild = FileInfo.builder()
                .idx(3L)
                .parent(hiddenFolder)
                .user(User.builder().idx(7L).build())
                .nodeType(FileNodeType.FILE)
                .spaceType(com.example.WaffleBear.file.model.FileSpaceType.DRIVE)
                .fileOriginName("secret.txt")
                .fileFormat("txt")
                .fileSaveName("secret.txt")
                .fileSavePath("7/secret.txt")
                .fileSize(64L)
                .trashed(false)
                .build();
        FileInfo vaultFile = FileInfo.builder()
                .idx(4L)
                .user(User.builder().idx(7L).build())
                .nodeType(FileNodeType.FILE)
                .spaceType(com.example.WaffleBear.file.model.FileSpaceType.VAULT)
                .fileOriginName("vault.txt")
                .fileFormat("txt")
                .fileSaveName("vault.txt")
                .fileSavePath("7/vault.txt")
                .fileSize(64L)
                .trashed(false)
                .build();

        when(fileUpDownloadRepository.findAllByUser_IdxOrderByLastModifyDateDescUploadDateDesc(7L))
                .thenReturn(List.of(normalFile, hiddenFolder, hiddenChild, vaultFile));
        when(fileListItemUrlService.attachUrls(any(FileCommonDto.FileListItemRes.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        List<FileCommonDto.FileListItemRes> visible = fileService.fileList(7L);

        assertThat(visible)
                .extracting(FileCommonDto.FileListItemRes::getIdx)
                .containsExactly(1L);
    }

    @Test
    void normalClearTrashDoesNotDeleteVaultTrashedFiles() {
        FileInfo normalTrashed = trashedFile(11L, 7L, "7/normal-trash.txt", "txt");
        FileInfo vaultTrashed = FileInfo.builder()
                .idx(12L)
                .user(User.builder().idx(7L).build())
                .nodeType(FileNodeType.FILE)
                .spaceType(com.example.WaffleBear.file.model.FileSpaceType.VAULT)
                .fileOriginName("vault-trash.txt")
                .fileFormat("txt")
                .fileSaveName("vault-trash.txt")
                .fileSavePath("7/vault-trash.txt")
                .fileSize(64L)
                .trashed(true)
                .deletedAt(LocalDateTime.now())
                .build();

        when(fileUpDownloadRepository.findAllByUser_Idx(7L))
                .thenReturn(List.of(normalTrashed, vaultTrashed));
        when(fileVersionLifecycleService.findVersionObjectKeys(List.of(normalTrashed))).thenReturn(List.of());
        when(shareRepository.findAllByFile_IdxIn(List.of(11L))).thenReturn(List.of());

        FileCommonDto.FileActionRes result = fileService.clearTrash(7L, false);

        assertThat(result.getAffectedCount()).isEqualTo(1);
        verify(fileUpDownloadRepository).deleteAll(List.of(normalTrashed));
    }

    @Test
    void downloadFolderZipSanitizesTraversalSegmentsInRelativeEntries() throws Exception {
        User owner = User.builder().idx(7L).build();
        FileInfo rootFolder = FileInfo.builder()
                .idx(100L)
                .user(owner)
                .nodeType(FileNodeType.FOLDER)
                .fileOriginName("docs")
                .fileFormat("folder")
                .fileSaveName("folder-100")
                .trashed(false)
                .build();
        FileInfo maliciousChild = FileInfo.builder()
                .idx(101L)
                .user(owner)
                .parent(rootFolder)
                .nodeType(FileNodeType.FILE)
                .fileOriginName("../../evil\\payload.txt")
                .fileFormat("txt")
                .fileSaveName("saved-101.txt")
                .fileSavePath("7/saved-101.txt")
                .fileSize(4L)
                .lockedFile(false)
                .sharedFile(false)
                .trashed(false)
                .build();

        when(fileUpDownloadRepository.findByIdxAndUser_Idx(100L, 7L)).thenReturn(Optional.of(rootFolder));
        when(fileUpDownloadRepository.findAllByUser_Idx(7L)).thenReturn(List.of(rootFolder, maliciousChild));
        when(fileObjectDownloadService.openObjectStream("7/saved-101.txt"))
                .thenReturn(new ByteArrayInputStream("safe".getBytes(StandardCharsets.UTF_8)));

        FileCommonDto.FolderZipDownloadPayload payload = fileService.downloadFolderZip(7L, 100L);
        ByteArrayOutputStream zipOut = new ByteArrayOutputStream();
        payload.streamingBody().writeTo(zipOut);

        List<String> entryNames = new ArrayList<>();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipOut.toByteArray()))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                entryNames.add(entry.getName());
            }
        }

        assertThat(entryNames).isNotEmpty();
        assertThat(entryNames).noneMatch(name -> name.contains("..") || name.contains("\\"));
    }

    @Test
    void moveToVaultMovesFolderAndNestedDescendantsAndDetachesTrashedChild() {
        SecretAccessGuard guard = mock(SecretAccessGuard.class);
        ReflectionTestUtils.setField(fileService, "secretAccessGuard", guard);
        User owner = User.builder().idx(7L).build();
        FileInfo oldParent = folder(5L, owner, null, FileSpaceType.DRIVE);
        FileInfo rootFolder = folder(10L, owner, oldParent, FileSpaceType.DRIVE);
        FileInfo subFolder = folder(11L, owner, rootFolder, FileSpaceType.DRIVE);
        FileInfo nestedFile = fileWithParent(12L, owner, subFolder, FileSpaceType.DRIVE, false, false);
        FileInfo trashedChild = fileWithParent(13L, owner, rootFolder, FileSpaceType.DRIVE, false, false);
        trashedChild.markTrashed(LocalDateTime.now());

        when(fileUpDownloadRepository.findAllByUser_Idx(7L))
                .thenReturn(List.of(oldParent, rootFolder, subFolder, nestedFile, trashedChild));
        when(shareRepository.findAllByFile_IdxIn(anyList())).thenReturn(List.of());

        FileCommonDto.FileActionRes result = fileService.moveToVault(7L, 10L, null);

        verify(guard).requireVaultUnlocked(7L);
        assertThat(result.getAction()).isEqualTo("move-to-vault");
        assertThat(result.getAffectedCount()).isEqualTo(1);
        assertThat(rootFolder.getParent()).isNull();
        assertThat(rootFolder.resolveSpaceType()).isEqualTo(FileSpaceType.VAULT);
        assertThat(subFolder.resolveSpaceType()).isEqualTo(FileSpaceType.VAULT);
        assertThat(nestedFile.resolveSpaceType()).isEqualTo(FileSpaceType.VAULT);
        assertThat(trashedChild.isTrashed()).isTrue();
        assertThat(trashedChild.resolveSpaceType()).isEqualTo(FileSpaceType.DRIVE);
        assertThat(trashedChild.getParent()).isNull();
        verify(fileUpDownloadRepository).saveAll(anyList());
    }

    @Test
    void moveToVaultMovesDriveFileIntoExistingVaultFolder() {
        SecretAccessGuard guard = mock(SecretAccessGuard.class);
        ReflectionTestUtils.setField(fileService, "secretAccessGuard", guard);
        User owner = User.builder().idx(7L).build();
        FileInfo vaultFolder = folder(20L, owner, null, FileSpaceType.VAULT);
        FileInfo driveFile = fileWithParent(30L, owner, null, FileSpaceType.DRIVE, false, false);

        when(fileUpDownloadRepository.findByIdxAndUser_Idx(20L, 7L)).thenReturn(Optional.of(vaultFolder));
        when(fileUpDownloadRepository.findAllByUser_Idx(7L)).thenReturn(List.of(vaultFolder, driveFile));
        when(shareRepository.findAllByFile_IdxIn(anyList())).thenReturn(List.of());

        FileCommonDto.FileActionRes result = fileService.moveToVault(7L, 30L, 20L);

        verify(guard).requireVaultUnlocked(7L);
        assertThat(result.getTargetIdx()).isEqualTo(20L);
        assertThat(driveFile.getParent()).isSameAs(vaultFolder);
        assertThat(driveFile.resolveSpaceType()).isEqualTo(FileSpaceType.VAULT);
    }

    @Test
    void moveToVaultRejectsWhenVaultLocked() {
        SecretAccessGuard guard = mock(SecretAccessGuard.class);
        ReflectionTestUtils.setField(fileService, "secretAccessGuard", guard);
        doThrow(BaseException.from(BaseResponseStatus.VAULT_UNLOCK_REQUIRED))
                .when(guard).requireVaultUnlocked(7L);

        assertThatThrownBy(() -> fileService.moveToVault(7L, 10L, null))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.VAULT_UNLOCK_REQUIRED);
        verify(fileUpDownloadRepository, never()).saveAll(anyList());
    }

    @Test
    void moveToVaultRejectsFolderContainingSharedDescendant() {
        SecretAccessGuard guard = mock(SecretAccessGuard.class);
        ReflectionTestUtils.setField(fileService, "secretAccessGuard", guard);
        User owner = User.builder().idx(7L).build();
        FileInfo sharedRootFolder = folder(10L, owner, null, FileSpaceType.DRIVE);
        FileInfo sharedDescendant = fileWithParent(11L, owner, sharedRootFolder, FileSpaceType.DRIVE, false, false);

        when(fileUpDownloadRepository.findAllByUser_Idx(7L))
                .thenReturn(List.of(sharedRootFolder, sharedDescendant));
        when(shareRepository.findAllByFile_IdxIn(anyList()))
                .thenReturn(List.of(mock(FileShare.class)));

        assertThatThrownBy(() -> fileService.moveToVault(7L, 10L, null))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.SECRET_FOLDER_NOT_ALLOWED);

        verify(fileUpDownloadRepository, never()).saveAll(anyList());
    }

    @Test
    void moveToVaultRejectsFolderContainingLockedDescendantAndNonVaultTargetParent() {
        SecretAccessGuard guard = mock(SecretAccessGuard.class);
        ReflectionTestUtils.setField(fileService, "secretAccessGuard", guard);
        User owner = User.builder().idx(7L).build();
        FileInfo lockedRootFolder = folder(20L, owner, null, FileSpaceType.DRIVE);
        FileInfo lockedDescendant = fileWithParent(21L, owner, lockedRootFolder, FileSpaceType.DRIVE, true, false);
        FileInfo driveParent = folder(99L, owner, null, FileSpaceType.DRIVE);

        when(fileUpDownloadRepository.findAllByUser_Idx(7L))
                .thenReturn(List.of(lockedRootFolder, lockedDescendant));

        assertThatThrownBy(() -> fileService.moveToVault(7L, 20L, null))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.REQUEST_ERROR);

        when(fileUpDownloadRepository.findByIdxAndUser_Idx(99L, 7L)).thenReturn(Optional.of(driveParent));
        assertThatThrownBy(() -> fileService.moveToVault(7L, 20L, 99L))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.REQUEST_ERROR);

        verify(fileUpDownloadRepository, never()).saveAll(anyList());
    }

    @Test
    void moveToVaultPromotesUnlockedHiddenPinFolderTreeAndClearsDriveHiddenFlags() {
        SecretAccessGuard guard = mock(SecretAccessGuard.class);
        ReflectionTestUtils.setField(fileService, "secretAccessGuard", guard);
        User owner = User.builder().idx(7L).build();
        FileInfo targetVaultFolder = folder(20L, owner, null, FileSpaceType.VAULT);
        FileInfo hiddenRoot = FileInfo.builder()
                .idx(30L)
                .user(owner)
                .nodeType(FileNodeType.FOLDER)
                .spaceType(FileSpaceType.DRIVE)
                .hiddenFolder(true)
                .folderPinEnabled(true)
                .folderPinHash("$2a$10$encodedpin")
                .fileOriginName("히미츠")
                .fileFormat("folder")
                .fileSaveName("folder-30")
                .trashed(false)
                .build();
        FileInfo hiddenChildFolder = FileInfo.builder()
                .idx(31L)
                .user(owner)
                .parent(hiddenRoot)
                .nodeType(FileNodeType.FOLDER)
                .spaceType(FileSpaceType.DRIVE)
                .hiddenFolder(true)
                .folderPinEnabled(false)
                .fileOriginName("서브비밀")
                .fileFormat("folder")
                .fileSaveName("folder-31")
                .trashed(false)
                .build();
        FileInfo secretDoc = fileWithParent(32L, owner, hiddenChildFolder, FileSpaceType.DRIVE, false, false);

        when(fileUpDownloadRepository.findByIdxAndUser_Idx(20L, 7L)).thenReturn(Optional.of(targetVaultFolder));
        when(fileUpDownloadRepository.findAllByUser_Idx(7L))
                .thenReturn(List.of(targetVaultFolder, hiddenRoot, hiddenChildFolder, secretDoc));
        when(shareRepository.findAllByFile_IdxIn(anyList())).thenReturn(List.of());

        FileCommonDto.FileActionRes result = fileService.moveToVault(7L, 30L, 20L);

        verify(guard).requireVaultUnlocked(7L);
        verify(guard).assertNodeAccess(7L, hiddenRoot, true);
        verify(guard).assertNodeAccess(7L, hiddenChildFolder, true);
        assertThat(result.getTargetIdx()).isEqualTo(20L);
        assertThat(hiddenRoot.getParent()).isSameAs(targetVaultFolder);
        assertThat(hiddenRoot.resolveSpaceType()).isEqualTo(FileSpaceType.VAULT);
        assertThat(hiddenRoot.isHiddenFolder()).isFalse();
        assertThat(hiddenRoot.isFolderPinEnabled()).isFalse();
        assertThat(hiddenRoot.hasFolderPin()).isFalse();
        assertThat(hiddenChildFolder.resolveSpaceType()).isEqualTo(FileSpaceType.VAULT);
        assertThat(hiddenChildFolder.isHiddenFolder()).isFalse();
        assertThat(secretDoc.resolveSpaceType()).isEqualTo(FileSpaceType.VAULT);
        verify(fileUpDownloadRepository).saveAll(anyList());
    }

    @Test
    void moveToVaultRejectsLockedHiddenFolderWhenGuardDeniesAccess() {
        SecretAccessGuard guard = mock(SecretAccessGuard.class);
        ReflectionTestUtils.setField(fileService, "secretAccessGuard", guard);
        User owner = User.builder().idx(7L).build();
        FileInfo hiddenRoot = FileInfo.builder()
                .idx(40L)
                .user(owner)
                .nodeType(FileNodeType.FOLDER)
                .spaceType(FileSpaceType.DRIVE)
                .hiddenFolder(true)
                .folderPinEnabled(true)
                .folderPinHash("$2a$10$encodedpin")
                .fileOriginName("히미츠")
                .fileFormat("folder")
                .fileSaveName("folder-40")
                .trashed(false)
                .build();

        when(fileUpDownloadRepository.findAllByUser_Idx(7L)).thenReturn(List.of(hiddenRoot));
        doThrow(BaseException.from(BaseResponseStatus.SECRET_FOLDER_UNLOCK_REQUIRED))
                .when(guard).assertNodeAccess(7L, hiddenRoot, true);

        assertThatThrownBy(() -> fileService.moveToVault(7L, 40L, null))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.SECRET_FOLDER_UNLOCK_REQUIRED);

        verify(fileUpDownloadRepository, never()).saveAll(anyList());
    }

    @Test
    void vaultFileListRejectsWhenVaultIsLocked() {
        SecretAccessGuard guard = mock(SecretAccessGuard.class);
        ReflectionTestUtils.setField(fileService, "secretAccessGuard", guard);
        doThrow(BaseException.from(BaseResponseStatus.VAULT_UNLOCK_REQUIRED))
                .when(guard).requireVaultUnlocked(7L);

        assertThatThrownBy(() -> fileService.vaultFileList(7L))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.VAULT_UNLOCK_REQUIRED);

        verify(fileUpDownloadRepository, never()).findAllByUser_IdxOrderByLastModifyDateDescUploadDateDesc(7L);
    }

    @Test
    void vaultFileListReturnsOnlyAccessibleNonTrashedVaultItems() {
        SecretAccessGuard guard = mock(SecretAccessGuard.class);
        ReflectionTestUtils.setField(fileService, "secretAccessGuard", guard);
        User owner = User.builder().idx(7L).build();

        FileInfo driveFile = fileWithParent(10L, owner, null, FileSpaceType.DRIVE, false, false);
        FileInfo vaultFolder = folder(20L, owner, null, FileSpaceType.VAULT);
        FileInfo vaultVideo = fileWithParent(21L, owner, vaultFolder, FileSpaceType.VAULT, false, false);
        FileInfo trashedVaultFolder = folder(30L, owner, null, FileSpaceType.VAULT);
        trashedVaultFolder.markTrashed(LocalDateTime.now());
        FileInfo childOfTrashedVault = fileWithParent(31L, owner, trashedVaultFolder, FileSpaceType.VAULT, false, false);
        FileInfo directTrashedVaultFile = fileWithParent(32L, owner, vaultFolder, FileSpaceType.VAULT, false, false);
        directTrashedVaultFile.markTrashed(LocalDateTime.now());
        FileInfo pinLockedVaultSubfolder = folder(40L, owner, vaultFolder, FileSpaceType.VAULT);
        org.mockito.Mockito.doAnswer(invocation -> {
            FileInfo node = invocation.getArgument(1);
            if (node != null && Long.valueOf(40L).equals(node.getIdx())) {
                throw BaseException.from(BaseResponseStatus.SECRET_FOLDER_UNLOCK_REQUIRED);
            }
            return null;
        }).when(guard).assertNodeAccess(eq(7L), any(FileInfo.class), eq(true));

        when(fileUpDownloadRepository.findAllByUser_IdxOrderByLastModifyDateDescUploadDateDesc(7L))
                .thenReturn(List.of(
                        driveFile,
                        vaultFolder,
                        vaultVideo,
                        trashedVaultFolder,
                        childOfTrashedVault,
                        directTrashedVaultFile,
                        pinLockedVaultSubfolder
                ));
        when(fileListItemUrlService.attachUrls(any())).thenAnswer(invocation -> invocation.getArgument(0));

        List<FileCommonDto.FileListItemRes> result = fileService.vaultFileList(7L);

        verify(guard).requireVaultUnlocked(7L);
        verify(fileListItemUrlService).prepareThumbnailUrls(anyList());
        assertThat(result)
                .extracting(FileCommonDto.FileListItemRes::getIdx)
                .containsExactlyInAnyOrder(20L, 21L);
    }

    @Test
    void fileListPageRootSearchExcludesLockedPinHiddenFoldersEvenWhenIncludeHiddenIsTrue() {
        SecretAccessGuard guard = mock(SecretAccessGuard.class);
        ReflectionTestUtils.setField(fileService, "secretAccessGuard", guard);
        User owner = User.builder().idx(7L).build();
        FileInfo normalFolder = folder(10L, owner, null, FileSpaceType.DRIVE);
        normalFolder.rename("Docs");
        FileInfo lockedHiddenFolder = FileInfo.builder()
                .idx(12L)
                .user(owner)
                .nodeType(FileNodeType.FOLDER)
                .spaceType(FileSpaceType.DRIVE)
                .hiddenFolder(true)
                .folderPinEnabled(true)
                .folderPinHash("$2a$10$hash")
                .fileOriginName("LockedHidden")
                .fileFormat("folder")
                .fileSaveName("folder-12")
                .trashed(false)
                .build();

        org.mockito.Mockito.doThrow(BaseException.from(BaseResponseStatus.SECRET_FOLDER_UNLOCK_REQUIRED))
                .when(guard).assertNodeAccess(7L, lockedHiddenFolder, true);
        when(fileUpDownloadRepository.findActiveFoldersByUserAndSpace(7L, FileNodeType.FOLDER, false))
                .thenReturn(List.of(normalFolder, lockedHiddenFolder));
        when(fileUpDownloadRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));
        when(fileUpDownloadRepository.findDistinctFileFormatsByUserInRootOrParents(
                eq(7L), any(), eq(FileNodeType.FILE), eq(false), eq(true)
        )).thenReturn(List.of());

        fileService.fileListPage(7L, FileManageDto.ListPageReq.builder()
                .searchScope("root")
                .includeHidden(true)
                .vaultMode(false)
                .build());

        ArgumentCaptor<java.util.Collection<Long>> parentIdsCaptor = ArgumentCaptor.forClass(java.util.Collection.class);
        verify(fileUpDownloadRepository).findDistinctFileFormatsByUserInRootOrParents(
                eq(7L), parentIdsCaptor.capture(), eq(FileNodeType.FILE), eq(false), eq(true)
        );
        assertThat(parentIdsCaptor.getValue()).containsExactly(10L);
    }

    @Test
    void downloadFolderZipSkipsLockedNestedHiddenSubfolder() throws Exception {
        SecretAccessGuard guard = mock(SecretAccessGuard.class);
        ReflectionTestUtils.setField(fileService, "secretAccessGuard", guard);
        User owner = User.builder().idx(7L).build();
        FileInfo rootFolder = folder(100L, owner, null, FileSpaceType.DRIVE);
        rootFolder.rename("docs");
        FileInfo publicFile = fileWithParent(101L, owner, rootFolder, FileSpaceType.DRIVE, false, false);
        FileInfo lockedSubfolder = FileInfo.builder()
                .idx(102L)
                .user(owner)
                .parent(rootFolder)
                .nodeType(FileNodeType.FOLDER)
                .spaceType(FileSpaceType.DRIVE)
                .hiddenFolder(true)
                .folderPinEnabled(true)
                .folderPinHash("$2a$10$hash")
                .fileOriginName("SecretSub")
                .fileFormat("folder")
                .fileSaveName("folder-102")
                .trashed(false)
                .build();
        FileInfo lockedSecretFile = fileWithParent(103L, owner, lockedSubfolder, FileSpaceType.DRIVE, false, false);

        org.mockito.Mockito.doAnswer(invocation -> {
            FileInfo node = invocation.getArgument(1);
            if (node != null && Long.valueOf(102L).equals(node.getIdx())) {
                throw BaseException.from(BaseResponseStatus.SECRET_FOLDER_UNLOCK_REQUIRED);
            }
            return null;
        }).when(guard).assertNodeAccess(eq(7L), any(FileInfo.class), eq(true));
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(100L, 7L)).thenReturn(Optional.of(rootFolder));
        when(fileUpDownloadRepository.findAllByUser_Idx(7L))
                .thenReturn(List.of(rootFolder, publicFile, lockedSubfolder, lockedSecretFile));
        when(fileObjectDownloadService.openObjectStream("7/saved-101.txt"))
                .thenReturn(new ByteArrayInputStream("public".getBytes(StandardCharsets.UTF_8)));

        FileCommonDto.FolderZipDownloadPayload payload = fileService.downloadFolderZip(7L, 100L);
        ByteArrayOutputStream zipOut = new ByteArrayOutputStream();
        payload.streamingBody().writeTo(zipOut);

        List<String> entryNames = new ArrayList<>();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipOut.toByteArray()))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                entryNames.add(entry.getName());
            }
        }

        assertThat(entryNames).containsExactly("docs/", "docs/file-101.txt");
    }

    @Test
    void moveFilesToVaultRecordsOriginParentIdAndEncrypts() {
        SecretAccessGuard guard = mock(SecretAccessGuard.class);
        VaultFileCryptoService crypto = mock(VaultFileCryptoService.class);
        ReflectionTestUtils.setField(fileService, "secretAccessGuard", guard);
        ReflectionTestUtils.setField(fileService, "vaultFileCryptoService", crypto);

        User owner = User.builder().idx(7L).build();
        FileInfo driveParent = folder(5L, owner, null, FileSpaceType.DRIVE);
        FileInfo driveSubfolder = folder(10L, owner, driveParent, FileSpaceType.DRIVE);
        FileInfo driveChildFile = fileWithParent(11L, owner, driveSubfolder, FileSpaceType.DRIVE, false, false);

        when(fileUpDownloadRepository.findAllByUser_Idx(7L)).thenReturn(List.of(driveParent, driveSubfolder, driveChildFile));
        when(crypto.encryptPlaintextObject(7L, "7/saved-11.txt", 128L))
                .thenReturn(new VaultFileCryptoService.VaultEncryptionResult(
                        "7/vault/enc-11.enc",
                        "enc-11.enc",
                        1,
                        "wrapped-dek",
                        "nonce",
                        1048576,
                        128L,
                        156L
                ));

        FileCommonDto.FileActionRes res = fileService.moveToVault(7L, 10L, null);

        assertThat(res.getAction()).isEqualTo("move-to-vault");
        assertThat(driveSubfolder.isVaultSpace()).isTrue();
        assertThat(driveSubfolder.getParent()).isNull();
        assertThat(driveSubfolder.getVaultOriginParentId()).isEqualTo(5L);
        assertThat(driveChildFile.isVaultSpace()).isTrue();
        assertThat(driveChildFile.isEncrypted()).isTrue();
        assertThat(driveChildFile.getFileSavePath()).isEqualTo("7/vault/enc-11.enc");
        verify(fileObjectDeletionService).deleteObjects(List.of("7/saved-11.txt", "7/thumbnails/saved-11.jpg"));
    }

    @Test
    void moveFilesFromVaultRestoresOriginParentDecryptsAndCleansUpEncryptedObjects() {
        SecretAccessGuard guard = mock(SecretAccessGuard.class);
        VaultFileCryptoService crypto = mock(VaultFileCryptoService.class);
        ReflectionTestUtils.setField(fileService, "secretAccessGuard", guard);
        ReflectionTestUtils.setField(fileService, "vaultFileCryptoService", crypto);

        User owner = User.builder().idx(7L).build();
        FileInfo originDriveFolder = folder(5L, owner, null, FileSpaceType.DRIVE);
        FileInfo vaultFolder = folder(20L, owner, null, FileSpaceType.VAULT);
        vaultFolder.rememberVaultOriginParent(5L);

        FileInfo encryptedFile = FileInfo.builder()
                .idx(21L)
                .user(owner)
                .parent(vaultFolder)
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.VAULT)
                .encryptionMode(FileEncryptionMode.SERVER_ENVELOPE_V1)
                .encryptionKeyVersion(1)
                .wrappedDek("wrapped")
                .encryptionNoncePrefix("nonce")
                .encryptionChunkSize(1048576)
                .fileOriginName("secret.mp4")
                .fileFormat("mp4")
                .fileSaveName("enc-21.enc")
                .fileSavePath("7/vault/enc-21.enc")
                .fileSize(2048L)
                .encryptedFileSize(2076L)
                .trashed(false)
                .build();

        when(fileUpDownloadRepository.findAllByUser_Idx(7L))
                .thenReturn(List.of(originDriveFolder, vaultFolder, encryptedFile));
        when(crypto.decryptToPlaintextObject(7L, encryptedFile))
                .thenReturn(new VaultFileCryptoService.VaultDecryptionResult(
                        "7/plain-21.mp4",
                        "plain-21.mp4",
                        2048L
                ));

        FileCommonDto.FileActionRes res = fileService.moveFilesFromVault(7L, List.of(20L), null, true);

        verify(guard).requireVaultUnlocked(7L);
        assertThat(res.getAction()).isEqualTo("move-from-vault");
        assertThat(res.getTargetIdx()).isEqualTo(5L);
        assertThat(res.getAffectedCount()).isEqualTo(1);
        assertThat(vaultFolder.resolveSpaceType()).isEqualTo(FileSpaceType.DRIVE);
        assertThat(vaultFolder.getParent()).isSameAs(originDriveFolder);
        assertThat(vaultFolder.getVaultOriginParentId()).isNull();
        assertThat(encryptedFile.resolveSpaceType()).isEqualTo(FileSpaceType.DRIVE);
        assertThat(encryptedFile.isEncrypted()).isFalse();
        assertThat(encryptedFile.getFileSavePath()).isEqualTo("7/plain-21.mp4");
        assertThat(encryptedFile.getFileSaveName()).isEqualTo("plain-21.mp4");
        verify(fileObjectDeletionService).deleteObjects(List.of("7/vault/enc-21.enc", "7/vault/thumbnails/enc-21.vthumb"));
    }

    @Test
    void moveFilesFromVaultFallsBackToRootWhenOriginDeletedAndSupportsExplicitDriveTarget() {
        SecretAccessGuard guard = mock(SecretAccessGuard.class);
        VaultFileCryptoService crypto = mock(VaultFileCryptoService.class);
        ReflectionTestUtils.setField(fileService, "secretAccessGuard", guard);
        ReflectionTestUtils.setField(fileService, "vaultFileCryptoService", crypto);

        User owner = User.builder().idx(7L).build();
        FileInfo trashedOrigin = folder(5L, owner, null, FileSpaceType.DRIVE);
        trashedOrigin.markTrashed(LocalDateTime.now());
        FileInfo explicitDriveFolder = folder(30L, owner, null, FileSpaceType.DRIVE);
        FileInfo vaultFile = FileInfo.builder()
                .idx(25L)
                .user(owner)
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.VAULT)
                .vaultOriginParentId(5L)
                .encryptionMode(FileEncryptionMode.SERVER_ENVELOPE_V1)
                .wrappedDek("dek")
                .encryptionNoncePrefix("nonce")
                .fileOriginName("doc.pdf")
                .fileFormat("pdf")
                .fileSaveName("enc-25.enc")
                .fileSavePath("7/vault/enc-25.enc")
                .fileSize(512L)
                .trashed(false)
                .build();

        when(fileUpDownloadRepository.findAllByUser_Idx(7L))
                .thenReturn(List.of(trashedOrigin, explicitDriveFolder, vaultFile));
        when(crypto.decryptToPlaintextObject(7L, vaultFile))
                .thenReturn(new VaultFileCryptoService.VaultDecryptionResult("7/plain-25.pdf", "plain-25.pdf", 512L));

        FileCommonDto.FileActionRes fallbackRes = fileService.moveFilesFromVault(7L, List.of(25L), null, true);
        assertThat(fallbackRes.getTargetIdx()).isNull();
        assertThat(vaultFile.getParent()).isNull();
        assertThat(vaultFile.isEncrypted()).isFalse();

        // Cross-space plain moveFilesToFolder must still reject VAULT -> DRIVE
        vaultFile.changeSpaceType(FileSpaceType.VAULT);
        assertThatThrownBy(() -> fileService.moveFilesToFolder(7L, List.of(25L), 30L))
                .isInstanceOf(BaseException.class);
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

    private static FileInfo folder(Long idx, User owner, FileInfo parent, FileSpaceType spaceType) {
        return FileInfo.builder()
                .idx(idx)
                .user(owner)
                .parent(parent)
                .nodeType(FileNodeType.FOLDER)
                .spaceType(spaceType)
                .fileOriginName("folder-" + idx)
                .fileFormat("folder")
                .fileSaveName("folder-" + idx)
                .trashed(false)
                .build();
    }

    private static FileInfo fileWithParent(
            Long idx,
            User owner,
            FileInfo parent,
            FileSpaceType spaceType,
            boolean lockedFile,
            boolean sharedFile
    ) {
        return FileInfo.builder()
                .idx(idx)
                .user(owner)
                .parent(parent)
                .nodeType(FileNodeType.FILE)
                .spaceType(spaceType)
                .fileOriginName("file-" + idx + ".txt")
                .fileFormat("txt")
                .fileSaveName("saved-" + idx + ".txt")
                .fileSavePath(owner.getIdx() + "/saved-" + idx + ".txt")
                .fileSize(128L)
                .lockedFile(lockedFile)
                .sharedFile(sharedFile)
                .trashed(false)
                .build();
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