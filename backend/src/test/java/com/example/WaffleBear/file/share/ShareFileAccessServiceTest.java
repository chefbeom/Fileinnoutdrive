package com.example.WaffleBear.file.share;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.share.model.FileShareAuditAction;
import com.example.WaffleBear.file.share.model.FileSharePermission;
import com.example.WaffleBear.file.share.model.FileShareStatus;
import com.example.WaffleBear.file.upload.UploadFolderService;
import com.example.WaffleBear.user.model.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ShareFileAccessServiceTest {

    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;

    @Mock
    private ShareRepository shareRepository;

    @Mock
    private ShareFileObjectStorageService shareFileObjectStorageService;

    @Mock
    private UploadFolderService uploadFolderService;

    @Mock
    private ShareInheritanceService shareInheritanceService;

    @Mock
    private ShareAuditService shareAuditService;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private TransactionTemplate transactionTemplate;

    private ShareFileAccessService shareFileAccessService;

    @BeforeEach
    void setUp() {
        ShareResponseMapper shareResponseMapper = new ShareResponseMapper(shareFileObjectStorageService);
        shareFileAccessService = new ShareFileAccessService(
                fileUpDownloadRepository,
                shareRepository,
                shareFileObjectStorageService,
                uploadFolderService,
                shareInheritanceService,
                shareAuditService,
                shareResponseMapper,
                passwordEncoder,
                transactionTemplate
        );
        lenient().when(shareFileObjectStorageService.presignedUrlExpirySeconds()).thenReturn(300);
        lenient().when(shareFileObjectStorageService.generateDownloadUrl(anyString()))
                .thenReturn("http://download.example/report.txt");
        lenient().when(shareFileObjectStorageService.generateAttachmentDownloadUrl(anyString(), anyString(), anyString()))
                .thenReturn("http://download.example/report.txt");
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
    void protectedSharedDownloadLinkRequiresPassword() {
        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo file = file(10L, owner, null, "report.txt", false);
        FileShare share = FileShare.builder()
                .file(file)
                .owner(owner)
                .recipient(recipient)
                .permission(FileSharePermission.DOWNLOAD)
                .status(FileShareStatus.ACCEPTED)
                .passwordHash("{noop}secret")
                .build();

        when(shareRepository.findByFile_IdxAndRecipient_Idx(file.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.of(share));
        when(passwordEncoder.matches("bad", "{noop}secret")).thenReturn(false);
        when(passwordEncoder.matches("secret", "{noop}secret")).thenReturn(true);

        assertThatThrownBy(() -> shareFileAccessService.getSharedFileDownloadUrl(recipient.getIdx(), file.getIdx()))
                .isInstanceOf(BaseException.class);
        assertThatThrownBy(() -> shareFileAccessService.getSharedFileDownloadUrl(recipient.getIdx(), file.getIdx(), "bad"))
                .isInstanceOf(BaseException.class);
        assertThat(shareFileAccessService.getSharedFileDownloadUrl(recipient.getIdx(), file.getIdx(), " secret "))
                .isEqualTo("http://download.example/report.txt");
        verify(shareAuditService).record(share, recipient.getIdx(), FileShareAuditAction.DOWNLOAD_LINK_CREATED);
    }

    @Test
    void sharedDownloadLinkConsumesDownloadLimitAndRejectsWhenLimitReached() {
        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo file = file(10L, owner, null, "report.txt", false);
        FileShare share = FileShare.builder()
                .file(file)
                .owner(owner)
                .recipient(recipient)
                .permission(FileSharePermission.DOWNLOAD)
                .status(FileShareStatus.ACCEPTED)
                .downloadLimit(1)
                .build();

        when(shareRepository.findByFile_IdxAndRecipient_Idx(file.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.of(share));

        assertThat(shareFileAccessService.getSharedFileDownloadUrl(recipient.getIdx(), file.getIdx()))
                .isEqualTo("http://download.example/report.txt");
        assertThat(share.getDownloadCount()).isEqualTo(1);
        verify(shareRepository).save(share);
        verify(shareAuditService).record(share, recipient.getIdx(), FileShareAuditAction.DOWNLOAD_LINK_CREATED);

        assertThatThrownBy(() -> shareFileAccessService.getSharedFileDownloadUrl(recipient.getIdx(), file.getIdx()))
                .isInstanceOf(BaseException.class);
    }

    @Test
    void saveSharedFileToDriveCopiesObjectBetweenShortDatabaseTransactions() {
        List<String> events = new ArrayList<>();
        doAnswer(invocation -> {
            events.add("tx");
            TransactionCallback<?> callback = invocation.getArgument(0);
            return callback.doInTransaction(new SimpleTransactionStatus());
        }).when(transactionTemplate).execute(any());

        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo original = file(10L, owner, null, "report.txt", false);
        FileShare share = share(original, owner, recipient, FileSharePermission.DOWNLOAD, FileShareStatus.ACCEPTED);

        when(shareRepository.findByFile_IdxAndRecipient_Idx(original.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.of(share), Optional.of(share));
        doAnswer(invocation -> {
            events.add("copy");
            return null;
        }).when(shareFileObjectStorageService).copyObject(anyString(), anyString());
        when(fileUpDownloadRepository.save(any(FileInfo.class))).thenAnswer(invocation -> {
            events.add("save");
            FileInfo copy = invocation.getArgument(0);
            return savedFile(copy, 99L);
        });

        var result = shareFileAccessService.saveSharedFileToDrive(recipient.getIdx(), original.getIdx(), null);

        assertThat(result.getIdx()).isEqualTo(99L);
        assertThat(events).containsExactly("tx", "copy", "tx", "save");
        verify(shareAuditService).record(share, recipient.getIdx(), FileShareAuditAction.SAVED_TO_DRIVE);
    }

    @Test
    void saveSharedFileToDriveDeletesCopiedObjectWhenPersistFails() {
        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo original = file(10L, owner, null, "report.txt", false);
        FileShare share = share(original, owner, recipient, FileSharePermission.DOWNLOAD, FileShareStatus.ACCEPTED);

        when(shareRepository.findByFile_IdxAndRecipient_Idx(original.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.of(share), Optional.of(share));
        when(fileUpDownloadRepository.save(any(FileInfo.class)))
                .thenThrow(new IllegalStateException("database failed"));

        assertThatThrownBy(() -> shareFileAccessService.saveSharedFileToDrive(recipient.getIdx(), original.getIdx(), null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("database failed");

        verify(shareFileObjectStorageService).copyObject(anyString(), anyString());
        verify(shareFileObjectStorageService).deleteObjectQuietly(anyString());
        verify(shareAuditService, never()).record(share, recipient.getIdx(), FileShareAuditAction.SAVED_TO_DRIVE);
    }

    @Test
    void saveSharedFileToDriveDeletesCopiedObjectWhenTransactionRollsBackAfterDbSave() {
        startTransactionSynchronization();
        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo original = file(10L, owner, null, "report.txt", false);
        FileShare share = share(original, owner, recipient, FileSharePermission.DOWNLOAD, FileShareStatus.ACCEPTED);

        when(shareRepository.findByFile_IdxAndRecipient_Idx(original.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.of(share), Optional.of(share));
        when(fileUpDownloadRepository.save(any(FileInfo.class))).thenAnswer(invocation -> savedFile(invocation.getArgument(0), 99L));

        var result = shareFileAccessService.saveSharedFileToDrive(recipient.getIdx(), original.getIdx(), null);

        assertThat(result.getIdx()).isEqualTo(99L);
        verify(shareFileObjectStorageService).copyObject(anyString(), anyString());
        verify(shareFileObjectStorageService, never()).deleteObjectQuietly(anyString());

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        }

        verify(shareFileObjectStorageService).deleteObjectQuietly(anyString());
    }

    @Test
    void uploadFileToSharedFolderUploadsObjectBetweenShortDatabaseTransactions() {
        List<String> events = new ArrayList<>();
        doAnswer(invocation -> {
            events.add("tx");
            TransactionCallback<?> callback = invocation.getArgument(0);
            return callback.doInTransaction(new SimpleTransactionStatus());
        }).when(transactionTemplate).execute(any());

        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo sharedFolder = folder(10L, owner, null, "Team", false);
        FileShare folderShare = share(sharedFolder, owner, recipient, FileSharePermission.WRITE, FileShareStatus.ACCEPTED);
        MockMultipartFile upload = uploadFile();

        when(shareRepository.findByFile_IdxAndRecipient_Idx(sharedFolder.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.of(folderShare));
        when(fileUpDownloadRepository.findByUser_IdxAndParent_IdxAndFileOriginNameAndTrashedFalse(
                owner.getIdx(),
                sharedFolder.getIdx(),
                "report.txt"
        )).thenReturn(Optional.empty());
        doAnswer(invocation -> {
            events.add("put");
            return null;
        }).when(shareFileObjectStorageService).putObject(any(), anyString(), anyLong(), anyString());
        when(fileUpDownloadRepository.save(any(FileInfo.class))).thenAnswer(invocation -> {
            events.add("save");
            return savedFile(invocation.getArgument(0), 99L);
        });

        var result = shareFileAccessService.uploadFileToSharedFolder(recipient.getIdx(), sharedFolder.getIdx(), upload, null);

        assertThat(result.getIdx()).isEqualTo(99L);
        assertThat(events).containsExactly("tx", "put", "tx", "save");
        verify(shareInheritanceService).inheritParentShares(any(FileInfo.class), any(FileInfo.class));
    }

    @Test
    void uploadFileToSharedFolderDeletesUploadedObjectWhenPersistFails() {
        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo sharedFolder = folder(10L, owner, null, "Team", false);
        FileShare folderShare = share(sharedFolder, owner, recipient, FileSharePermission.WRITE, FileShareStatus.ACCEPTED);
        MockMultipartFile upload = uploadFile();

        when(shareRepository.findByFile_IdxAndRecipient_Idx(sharedFolder.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.of(folderShare));
        when(fileUpDownloadRepository.findByUser_IdxAndParent_IdxAndFileOriginNameAndTrashedFalse(
                owner.getIdx(),
                sharedFolder.getIdx(),
                "report.txt"
        )).thenReturn(Optional.empty());
        when(fileUpDownloadRepository.save(any(FileInfo.class))).thenAnswer(invocation -> savedFile(invocation.getArgument(0), 99L));
        doThrow(new IllegalStateException("share propagation failed"))
                .when(shareInheritanceService)
                .inheritParentShares(any(FileInfo.class), any(FileInfo.class));

        assertThatThrownBy(() -> shareFileAccessService.uploadFileToSharedFolder(recipient.getIdx(), sharedFolder.getIdx(), upload, null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("share propagation failed");

        verify(shareFileObjectStorageService).putObject(any(), anyString(), anyLong(), anyString());
        verify(shareFileObjectStorageService).deleteObjectQuietly(anyString());
    }

    @Test
    void uploadFileToSharedFolderDeletesUploadedObjectWhenTransactionRollsBackAfterDbSave() {
        startTransactionSynchronization();
        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo sharedFolder = folder(10L, owner, null, "Team", false);
        FileShare folderShare = share(sharedFolder, owner, recipient, FileSharePermission.WRITE, FileShareStatus.ACCEPTED);
        MockMultipartFile upload = uploadFile();

        when(shareRepository.findByFile_IdxAndRecipient_Idx(sharedFolder.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.of(folderShare), Optional.of(folderShare));
        when(fileUpDownloadRepository.findByUser_IdxAndParent_IdxAndFileOriginNameAndTrashedFalse(
                owner.getIdx(),
                sharedFolder.getIdx(),
                "report.txt"
        )).thenReturn(Optional.empty());
        when(fileUpDownloadRepository.save(any(FileInfo.class))).thenAnswer(invocation -> savedFile(invocation.getArgument(0), 99L));

        var result = shareFileAccessService.uploadFileToSharedFolder(recipient.getIdx(), sharedFolder.getIdx(), upload, null);

        assertThat(result.getIdx()).isEqualTo(99L);
        verify(shareFileObjectStorageService).putObject(any(), anyString(), anyLong(), anyString());
        verify(shareFileObjectStorageService, never()).deleteObjectQuietly(anyString());

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        }

        verify(shareFileObjectStorageService).deleteObjectQuietly(anyString());
    }

    @Test
    void expiredAcceptedShareIsNotAccessible() {
        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo file = file(10L, owner, null, "report.txt", false);
        FileShare share = FileShare.builder()
                .file(file)
                .owner(owner)
                .recipient(recipient)
                .permission(FileSharePermission.READ)
                .status(FileShareStatus.ACCEPTED)
                .expiresAt(LocalDateTime.now().minusMinutes(1))
                .build();

        when(shareRepository.findByFile_IdxAndRecipient_Idx(file.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.of(share));

        assertThatThrownBy(() -> shareFileAccessService.getSharedTextPreview(recipient.getIdx(), file.getIdx()))
                .isInstanceOf(BaseException.class);
    }

    private void startTransactionSynchronization() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
    }

    private static MockMultipartFile uploadFile() {
        return new MockMultipartFile(
                "file",
                "report.txt",
                "text/plain",
                "hello".getBytes()
        );
    }

    private static User user(Long idx, String email) {
        return User.builder()
                .idx(idx)
                .email(email)
                .name(email)
                .build();
    }

    private static FileInfo folder(Long idx, User owner, FileInfo parent, String name, boolean locked) {
        return FileInfo.builder()
                .idx(idx)
                .user(owner)
                .parent(parent)
                .nodeType(FileNodeType.FOLDER)
                .fileOriginName(name)
                .fileFormat("folder")
                .fileSaveName(name)
                .lockedFile(locked)
                .sharedFile(true)
                .trashed(false)
                .build();
    }

    private static FileInfo file(Long idx, User owner, FileInfo parent, String name, boolean locked) {
        return FileInfo.builder()
                .idx(idx)
                .user(owner)
                .parent(parent)
                .nodeType(FileNodeType.FILE)
                .fileOriginName(name)
                .fileFormat("txt")
                .fileSaveName(name)
                .fileSavePath(owner.getIdx() + "/" + name)
                .fileSize(128L)
                .lockedFile(locked)
                .sharedFile(true)
                .trashed(false)
                .build();
    }

    private static FileInfo savedFile(FileInfo file, Long idx) {
        return FileInfo.builder()
                .idx(idx)
                .user(file.getUser())
                .parent(file.getParent())
                .nodeType(file.getNodeType())
                .fileOriginName(file.getFileOriginName())
                .fileFormat(file.getFileFormat())
                .fileSaveName(file.getFileSaveName())
                .fileSavePath(file.getFileSavePath())
                .fileSize(file.getFileSize())
                .lockedFile(file.isLockedFile())
                .sharedFile(file.isSharedFile())
                .trashed(false)
                .build();
    }

    private static FileShare share(
            FileInfo file,
            User owner,
            User recipient,
            FileSharePermission permission,
            FileShareStatus status
    ) {
        return FileShare.builder()
                .file(file)
                .owner(owner)
                .recipient(recipient)
                .permission(permission)
                .status(status)
                .build();
    }
}