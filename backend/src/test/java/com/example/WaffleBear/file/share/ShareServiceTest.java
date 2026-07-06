package com.example.WaffleBear.file.share;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.service.StoragePlanService;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.share.model.FileShareAuditAction;
import com.example.WaffleBear.file.share.model.FileSharePermission;
import com.example.WaffleBear.file.share.model.FileShareStatus;
import com.example.WaffleBear.file.upload.UploadFolderService;
import com.example.WaffleBear.notification.NotificationService;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
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
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ShareServiceTest {

    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;

    @Mock
    private ShareRepository shareRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ShareFileObjectStorageService shareFileObjectStorageService;

    @Mock
    private StoragePlanService storagePlanService;

    @Mock
    private UploadFolderService uploadFolderService;

    @Mock
    private NotificationService notificationService;

    @Mock
    private ShareInheritanceService shareInheritanceService;

    @Mock
    private ShareAuditService shareAuditService;

    @Mock
    private ShareTreeStatusService shareTreeStatusService;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private TransactionTemplate transactionTemplate;

    private ShareResponseMapper shareResponseMapper;

    private ShareFileAccessService shareFileAccessService;

    private ShareService shareService;

    @BeforeEach
    void runTransactionTemplateCallbacks() {
        shareResponseMapper = new ShareResponseMapper(shareFileObjectStorageService);
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
        shareService = new ShareService(
                fileUpDownloadRepository,
                shareRepository,
                userRepository,
                storagePlanService,
                notificationService,
                shareAuditService,
                shareTreeStatusService,
                shareResponseMapper,
                shareFileAccessService,
                passwordEncoder
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
    void cancelAllSharesRevokesLockedChildrenInsideSharedFolder() {
        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo folder = folder(10L, owner, null, "Team", false);
        FileInfo lockedChild = file(11L, owner, folder, "secret.txt", true);
        FileShare folderShare = share(folder, owner, recipient);
        FileShare childShare = share(lockedChild, owner, recipient);

        when(fileUpDownloadRepository.findByIdxAndUser_Idx(folder.getIdx(), owner.getIdx()))
                .thenReturn(Optional.of(folder));
        when(fileUpDownloadRepository.findAllByUser_Idx(owner.getIdx()))
                .thenReturn(List.of(folder, lockedChild));
        when(shareRepository.findAllByFile_Idx(folder.getIdx()))
                .thenReturn(List.of(folderShare));
        when(shareRepository.findAllByFile_Idx(lockedChild.getIdx()))
                .thenReturn(List.of(childShare));

        var result = shareService.cancelAllShares(owner.getIdx(), List.of(folder.getIdx()));

        assertThat(result.getAffectedCount()).isEqualTo(2);
        assertThat(folder.isSharedFile()).isFalse();
        assertThat(lockedChild.isSharedFile()).isFalse();
        verify(shareRepository).deleteAll(List.of(folderShare));
        verify(shareRepository).deleteAll(List.of(childShare));
        verify(fileUpDownloadRepository).save(folder);
        verify(fileUpDownloadRepository).save(lockedChild);
    }

    @Test
    void shareFilesUpdatesExistingWriteShareToRead() {
        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo folder = folder(10L, owner, null, "Team", false);
        FileShare existingShare = share(folder, owner, recipient);

        when(storagePlanService.resolveQuota(owner.getIdx())).thenReturn(shareEnabledQuota());
        when(userRepository.findByEmail(recipient.getEmail())).thenReturn(Optional.of(recipient));
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(folder.getIdx(), owner.getIdx()))
                .thenReturn(Optional.of(folder));
        when(fileUpDownloadRepository.findAllByUser_Idx(owner.getIdx()))
                .thenReturn(List.of(folder));
        when(shareRepository.findByFile_IdxAndRecipient_Idx(folder.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.of(existingShare));

        var result = shareService.shareFiles(
                owner.getIdx(),
                List.of(folder.getIdx()),
                recipient.getEmail(),
                "READ"
        );

        assertThat(result.getAffectedCount()).isEqualTo(1);
        assertThat(existingShare.getEffectivePermission()).isEqualTo(FileSharePermission.READ);
        verify(shareRepository).save(existingShare);
    }

    @Test
    void shareFilesCreatesPendingInvitationUntilRecipientAccepts() {
        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo folder = folder(10L, owner, null, "Team", false);

        when(storagePlanService.resolveQuota(owner.getIdx())).thenReturn(shareEnabledQuota());
        when(userRepository.findByEmail(recipient.getEmail())).thenReturn(Optional.of(recipient));
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(folder.getIdx(), owner.getIdx()))
                .thenReturn(Optional.of(folder));
        when(fileUpDownloadRepository.findAllByUser_Idx(owner.getIdx()))
                .thenReturn(List.of(folder));
        when(shareRepository.findByFile_IdxAndRecipient_Idx(folder.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.empty());

        var result = shareService.shareFiles(
                owner.getIdx(),
                List.of(folder.getIdx()),
                recipient.getEmail(),
                "WRITE"
        );

        ArgumentCaptor<FileShare> shareCaptor = ArgumentCaptor.forClass(FileShare.class);
        verify(shareRepository).save(shareCaptor.capture());
        FileShare savedShare = shareCaptor.getValue();

        assertThat(result.getAffectedCount()).isEqualTo(1);
        assertThat(savedShare.getEffectiveStatus()).isEqualTo(FileShareStatus.PENDING);
        assertThat(savedShare.getEffectivePermission()).isEqualTo(FileSharePermission.WRITE);
        assertThat(folder.isSharedFile()).isTrue();

        when(shareRepository.findAllByRecipient_IdxOrderByCreatedAtDesc(recipient.getIdx()))
                .thenReturn(List.of(savedShare));

        assertThat(shareService.sharedFileList(recipient.getIdx())).isEmpty();

        var pending = shareService.pendingSharedFileList(recipient.getIdx());
        assertThat(pending).hasSize(1);
        assertThat(pending.get(0).idx()).isEqualTo(folder.getIdx());
        assertThat(pending.get(0).status()).isEqualTo(FileShareStatus.PENDING.name());
        assertThat(pending.get(0).readable()).isFalse();
        assertThat(pending.get(0).downloadable()).isFalse();
        assertThat(pending.get(0).uploadable()).isFalse();
        assertThat(pending.get(0).writable()).isFalse();
        assertThat(pending.get(0).presignedDownloadUrl()).isNull();
    }

    @Test
    void shareFilesAllowsWritableRecipientToReshareSharedFolder() {
        User owner = user(1L, "owner@example.com");
        User actor = user(2L, "actor@example.com");
        User recipient = user(3L, "recipient@example.com");
        FileInfo folder = folder(10L, owner, null, "Team", false);
        FileInfo child = file(11L, owner, folder, "a.txt", false);
        FileShare actorShare = share(folder, owner, actor, FileSharePermission.WRITE, FileShareStatus.ACCEPTED);

        when(storagePlanService.resolveQuota(actor.getIdx())).thenReturn(shareEnabledQuota());
        when(userRepository.findByEmail(recipient.getEmail())).thenReturn(Optional.of(recipient));
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(folder.getIdx(), actor.getIdx()))
                .thenReturn(Optional.empty());
        when(shareRepository.findByFile_IdxAndRecipient_Idx(folder.getIdx(), actor.getIdx()))
                .thenReturn(Optional.of(actorShare));
        when(fileUpDownloadRepository.findAllByUser_Idx(owner.getIdx()))
                .thenReturn(List.of(folder, child));
        when(shareRepository.findByFile_IdxAndRecipient_Idx(folder.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.empty());
        when(shareRepository.findByFile_IdxAndRecipient_Idx(child.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.empty());

        var result = shareService.shareFiles(
                actor.getIdx(),
                List.of(folder.getIdx()),
                recipient.getEmail(),
                "READ"
        );

        ArgumentCaptor<FileShare> shareCaptor = ArgumentCaptor.forClass(FileShare.class);
        verify(shareRepository, times(2)).save(shareCaptor.capture());

        assertThat(result.getAffectedCount()).isEqualTo(2);
        assertThat(shareCaptor.getAllValues())
                .extracting(share -> share.getRecipient().getIdx())
                .containsOnly(recipient.getIdx());
        assertThat(shareCaptor.getAllValues())
                .extracting(FileShare::getEffectivePermission)
                .containsOnly(FileSharePermission.READ);
    }

    @Test
    void shareFilesRejectsReadOnlyRecipientReshare() {
        User owner = user(1L, "owner@example.com");
        User actor = user(2L, "actor@example.com");
        User recipient = user(3L, "recipient@example.com");
        FileInfo folder = folder(10L, owner, null, "Team", false);
        FileShare actorShare = share(folder, owner, actor, FileSharePermission.READ, FileShareStatus.ACCEPTED);

        when(storagePlanService.resolveQuota(actor.getIdx())).thenReturn(shareEnabledQuota());
        when(userRepository.findByEmail(recipient.getEmail())).thenReturn(Optional.of(recipient));
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(folder.getIdx(), actor.getIdx()))
                .thenReturn(Optional.empty());
        when(shareRepository.findByFile_IdxAndRecipient_Idx(folder.getIdx(), actor.getIdx()))
                .thenReturn(Optional.of(actorShare));

        assertThatThrownBy(() -> shareService.shareFiles(
                actor.getIdx(),
                List.of(folder.getIdx()),
                recipient.getEmail(),
                "READ"
        )).isInstanceOf(BaseException.class);
    }

    @Test
    void acceptSharedFolderDelegatesTreeStatusChange() {
        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo folder = folder(10L, owner, null, "Team", false);
        FileShare folderShare = share(folder, owner, recipient, FileSharePermission.WRITE, FileShareStatus.PENDING);

        when(shareRepository.findByFile_IdxAndRecipient_Idx(folder.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.of(folderShare));
        when(shareTreeStatusService.changeTreeStatus(
                folderShare,
                FileShareStatus.ACCEPTED,
                recipient.getIdx(),
                FileShareAuditAction.ACCEPTED
        )).thenReturn(2);

        var result = shareService.acceptSharedFile(recipient.getIdx(), folder.getIdx());

        assertThat(result.getAffectedCount()).isEqualTo(2);
        verify(shareTreeStatusService).changeTreeStatus(
                folderShare,
                FileShareStatus.ACCEPTED,
                recipient.getIdx(),
                FileShareAuditAction.ACCEPTED
        );
    }


    @Test
    void shareFilesStoresExpirationAndDownloadLimit() {
        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo file = file(10L, owner, null, "report.txt", false);
        LocalDateTime expiresAt = LocalDateTime.now().plusDays(1);

        when(storagePlanService.resolveQuota(owner.getIdx())).thenReturn(shareEnabledQuota());
        when(userRepository.findByEmail(recipient.getEmail())).thenReturn(Optional.of(recipient));
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(file.getIdx(), owner.getIdx()))
                .thenReturn(Optional.of(file));
        when(fileUpDownloadRepository.findAllByUser_Idx(owner.getIdx()))
                .thenReturn(List.of(file));
        when(shareRepository.findByFile_IdxAndRecipient_Idx(file.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.empty());

        var result = shareService.shareFiles(
                owner.getIdx(),
                List.of(file.getIdx()),
                recipient.getEmail(),
                "DOWNLOAD",
                null,
                expiresAt,
                2
        );

        ArgumentCaptor<FileShare> shareCaptor = ArgumentCaptor.forClass(FileShare.class);
        verify(shareRepository).save(shareCaptor.capture());
        FileShare savedShare = shareCaptor.getValue();

        assertThat(result.getAffectedCount()).isEqualTo(1);
        assertThat(savedShare.getExpiresAt()).isEqualTo(expiresAt);
        assertThat(savedShare.getDownloadLimit()).isEqualTo(2);
        assertThat(savedShare.getDownloadCount()).isZero();
        verify(shareAuditService).record(savedShare, owner.getIdx(), FileShareAuditAction.CREATED);
    }

    @Test
    void shareFilesStoresPasswordHash() {
        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo file = file(10L, owner, null, "report.txt", false);

        when(storagePlanService.resolveQuota(owner.getIdx())).thenReturn(shareEnabledQuota());
        when(userRepository.findByEmail(recipient.getEmail())).thenReturn(Optional.of(recipient));
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(file.getIdx(), owner.getIdx()))
                .thenReturn(Optional.of(file));
        when(fileUpDownloadRepository.findAllByUser_Idx(owner.getIdx()))
                .thenReturn(List.of(file));
        when(shareRepository.findByFile_IdxAndRecipient_Idx(file.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.empty());
        when(passwordEncoder.encode("secret")).thenReturn("{noop}secret");

        var result = shareService.shareFiles(
                owner.getIdx(),
                List.of(file.getIdx()),
                recipient.getEmail(),
                "DOWNLOAD",
                null,
                null,
                null,
                " secret "
        );

        ArgumentCaptor<FileShare> shareCaptor = ArgumentCaptor.forClass(FileShare.class);
        verify(shareRepository).save(shareCaptor.capture());
        FileShare savedShare = shareCaptor.getValue();

        assertThat(result.getAffectedCount()).isEqualTo(1);
        assertThat(savedShare.getPasswordHash()).isEqualTo("{noop}secret");
        assertThat(savedShare.isPasswordProtected()).isTrue();
    }

    private void startTransactionSynchronization() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
    }
    private static User user(Long idx, String email) {
        return User.builder()
                .idx(idx)
                .email(email)
                .name(email)
                .role("ROLE_USER")
                .enable(true)
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

    private static FileShare share(FileInfo file, User owner, User recipient) {
        return share(file, owner, recipient, FileSharePermission.WRITE, null);
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

    private static StoragePlanService.StorageQuota shareEnabledQuota() {
        return new StoragePlanService.StorageQuota(
                "ADMIN",
                "ADMIN",
                "Administrator",
                0L,
                0L,
                Long.MAX_VALUE,
                true,
                true,
                Long.MAX_VALUE,
                500
        );
    }
}
