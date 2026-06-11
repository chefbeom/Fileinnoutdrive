package com.example.WaffleBear.file.share;

import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.share.model.FileSharePermission;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ShareInheritanceServiceTest {

    @Mock
    private ShareRepository shareRepository;

    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;

    @InjectMocks
    private ShareInheritanceService shareInheritanceService;

    @Test
    void inheritParentSharesCreatesChildShareWithSamePermission() {
        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo parent = folder(10L, owner, "Team");
        FileInfo child = file(11L, owner, "plan.txt");

        when(shareRepository.findAllByFile_Idx(parent.getIdx()))
                .thenReturn(List.of(share(parent, owner, recipient, FileSharePermission.WRITE)));
        when(shareRepository.findByFile_IdxAndRecipient_Idx(child.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.empty());

        shareInheritanceService.inheritParentShares(parent, child);

        ArgumentCaptor<FileShare> shareCaptor = ArgumentCaptor.forClass(FileShare.class);
        verify(shareRepository).save(shareCaptor.capture());
        FileShare inherited = shareCaptor.getValue();

        assertThat(inherited.getFile()).isEqualTo(child);
        assertThat(inherited.getOwner()).isEqualTo(owner);
        assertThat(inherited.getRecipient()).isEqualTo(recipient);
        assertThat(inherited.getEffectivePermission()).isEqualTo(FileSharePermission.WRITE);
        assertThat(child.isSharedFile()).isTrue();
        verify(fileUpDownloadRepository).save(child);
    }

    @Test
    void inheritParentSharesUpgradesExistingReadShareToWrite() {
        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo parent = folder(10L, owner, "Team");
        FileInfo child = file(11L, owner, "plan.txt");
        FileShare existingChildShare = share(child, owner, recipient, FileSharePermission.READ);

        when(shareRepository.findAllByFile_Idx(parent.getIdx()))
                .thenReturn(List.of(share(parent, owner, recipient, FileSharePermission.WRITE)));
        when(shareRepository.findByFile_IdxAndRecipient_Idx(child.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.of(existingChildShare));

        shareInheritanceService.inheritParentShares(parent, child);

        assertThat(existingChildShare.getEffectivePermission()).isEqualTo(FileSharePermission.WRITE);
        verify(shareRepository).save(existingChildShare);
    }

    @Test
    void inheritParentSharesDoesNotDowngradeExistingWriteShare() {
        User owner = user(1L, "owner@example.com");
        User recipient = user(2L, "recipient@example.com");
        FileInfo parent = folder(10L, owner, "Team");
        FileInfo child = file(11L, owner, "plan.txt");
        FileShare existingChildShare = share(child, owner, recipient, FileSharePermission.WRITE);

        when(shareRepository.findAllByFile_Idx(parent.getIdx()))
                .thenReturn(List.of(share(parent, owner, recipient, FileSharePermission.READ)));
        when(shareRepository.findByFile_IdxAndRecipient_Idx(child.getIdx(), recipient.getIdx()))
                .thenReturn(Optional.of(existingChildShare));

        shareInheritanceService.inheritParentShares(parent, child);

        assertThat(existingChildShare.getEffectivePermission()).isEqualTo(FileSharePermission.WRITE);
        verify(shareRepository, never()).save(any(FileShare.class));
        verify(fileUpDownloadRepository, never()).save(any(FileInfo.class));
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

    private static FileInfo folder(Long idx, User owner, String name) {
        return FileInfo.builder()
                .idx(idx)
                .user(owner)
                .nodeType(FileNodeType.FOLDER)
                .fileOriginName(name)
                .fileFormat("folder")
                .fileSaveName(name)
                .trashed(false)
                .build();
    }

    private static FileInfo file(Long idx, User owner, String name) {
        return FileInfo.builder()
                .idx(idx)
                .user(owner)
                .nodeType(FileNodeType.FILE)
                .fileOriginName(name)
                .fileFormat("txt")
                .fileSaveName(name)
                .trashed(false)
                .build();
    }

    private static FileShare share(
            FileInfo file,
            User owner,
            User recipient,
            FileSharePermission permission
    ) {
        return FileShare.builder()
                .file(file)
                .owner(owner)
                .recipient(recipient)
                .permission(permission)
                .build();
    }
}
