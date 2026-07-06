package com.example.WaffleBear.file.share;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.share.model.FileShareAuditAction;
import com.example.WaffleBear.file.share.model.FileSharePermission;
import com.example.WaffleBear.file.share.model.FileShareStatus;
import com.example.WaffleBear.user.model.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ShareTreeStatusServiceTest {

    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;

    @Mock
    private ShareRepository shareRepository;

    @Mock
    private ShareAuditService shareAuditService;

    @InjectMocks
    private ShareTreeStatusService shareTreeStatusService;

    @Test
    void changeTreeStatusAcceptsChildSharesTogether() {
        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo folder = folder(10L, owner, null, "Team");
        FileInfo child = file(11L, owner, folder, "a.txt");
        FileShare folderShare = share(folder, owner, recipient, FileSharePermission.WRITE, FileShareStatus.PENDING);
        FileShare childShare = share(child, owner, recipient, FileSharePermission.WRITE, FileShareStatus.PENDING);

        when(fileUpDownloadRepository.findAllByUser_Idx(owner.getIdx()))
                .thenReturn(List.of(folder, child));
        when(shareRepository.findByFile_IdxAndRecipient_Idx(folder.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.of(folderShare));
        when(shareRepository.findByFile_IdxAndRecipient_Idx(child.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.of(childShare));

        int affectedCount = shareTreeStatusService.changeTreeStatus(
                folderShare,
                FileShareStatus.ACCEPTED,
                recipient.getIdx(),
                FileShareAuditAction.ACCEPTED
        );

        ArgumentCaptor<List<FileShare>> changedCaptor = ArgumentCaptor.forClass(List.class);
        verify(shareRepository).saveAll(changedCaptor.capture());

        assertThat(affectedCount).isEqualTo(2);
        assertThat(folderShare.getEffectiveStatus()).isEqualTo(FileShareStatus.ACCEPTED);
        assertThat(childShare.getEffectiveStatus()).isEqualTo(FileShareStatus.ACCEPTED);
        assertThat(changedCaptor.getValue()).containsExactly(folderShare, childShare);
        verify(shareAuditService).record(folderShare, recipient.getIdx(), FileShareAuditAction.ACCEPTED);
        verify(shareAuditService).record(childShare, recipient.getIdx(), FileShareAuditAction.ACCEPTED);
    }

    @Test
    void changeTreeStatusSkipsAlreadyMatchingStatus() {
        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo file = file(10L, owner, null, "report.txt");
        FileShare share = share(file, owner, recipient, FileSharePermission.READ, FileShareStatus.ACCEPTED);

        when(fileUpDownloadRepository.findAllByUser_Idx(owner.getIdx()))
                .thenReturn(List.of(file));
        when(shareRepository.findByFile_IdxAndRecipient_Idx(file.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.of(share));

        int affectedCount = shareTreeStatusService.changeTreeStatus(
                share,
                FileShareStatus.ACCEPTED,
                recipient.getIdx(),
                FileShareAuditAction.ACCEPTED
        );

        assertThat(affectedCount).isZero();
        verify(shareRepository, never()).saveAll(org.mockito.ArgumentMatchers.any());
        verify(shareAuditService, never()).record(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void changeTreeStatusRejectsInvalidRootShare() {
        assertThatThrownBy(() -> shareTreeStatusService.changeTreeStatus(
                null,
                FileShareStatus.ACCEPTED,
                2L,
                FileShareAuditAction.ACCEPTED
        )).isInstanceOf(BaseException.class);
    }

    private User user(Long idx, String email) {
        return User.builder()
                .idx(idx)
                .email(email)
                .name(email)
                .role("ROLE_USER")
                .enable(true)
                .build();
    }

    private FileInfo folder(Long idx, User owner, FileInfo parent, String name) {
        return FileInfo.builder()
                .idx(idx)
                .user(owner)
                .parent(parent)
                .nodeType(FileNodeType.FOLDER)
                .fileOriginName(name)
                .fileFormat("folder")
                .lockedFile(false)
                .trashed(false)
                .build();
    }

    private FileInfo file(Long idx, User owner, FileInfo parent, String name) {
        return FileInfo.builder()
                .idx(idx)
                .user(owner)
                .parent(parent)
                .nodeType(FileNodeType.FILE)
                .fileOriginName(name)
                .fileFormat("txt")
                .fileSavePath(owner.getIdx() + "/" + name)
                .lockedFile(false)
                .trashed(false)
                .build();
    }

    private FileShare share(
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