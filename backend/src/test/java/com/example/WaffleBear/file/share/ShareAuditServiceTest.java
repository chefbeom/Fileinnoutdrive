package com.example.WaffleBear.file.share;

import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.share.model.FileShareAuditAction;
import com.example.WaffleBear.file.share.model.FileShareAuditLog;
import com.example.WaffleBear.file.share.model.FileSharePermission;
import com.example.WaffleBear.file.share.model.FileShareStatus;
import com.example.WaffleBear.user.model.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ShareAuditServiceTest {

    @Mock
    private ShareAuditLogRepository shareAuditLogRepository;

    @InjectMocks
    private ShareAuditService shareAuditService;

    @Test
    void recordSnapshotsShareStateWithoutForeignKeyDependency() {
        User owner = user(1L, "owner@example.com", "Owner");
        User recipient = user(2L, "recipient@example.com", "Recipient");
        FileInfo file = FileInfo.builder()
                .idx(10L)
                .user(owner)
                .nodeType(FileNodeType.FILE)
                .fileOriginName("report.txt")
                .build();
        FileShare share = FileShare.builder()
                .idx(20L)
                .file(file)
                .owner(owner)
                .recipient(recipient)
                .permission(FileSharePermission.DOWNLOAD)
                .status(FileShareStatus.ACCEPTED)
                .downloadLimit(3)
                .downloadCount(1)
                .build();

        shareAuditService.record(share, recipient.getIdx(), FileShareAuditAction.DOWNLOADED);

        ArgumentCaptor<FileShareAuditLog> captor = ArgumentCaptor.forClass(FileShareAuditLog.class);
        verify(shareAuditLogRepository).save(captor.capture());
        FileShareAuditLog saved = captor.getValue();

        assertThat(saved.getShareIdx()).isEqualTo(20L);
        assertThat(saved.getFileIdx()).isEqualTo(10L);
        assertThat(saved.getFileName()).isEqualTo("report.txt");
        assertThat(saved.getOwnerEmail()).isEqualTo("owner@example.com");
        assertThat(saved.getRecipientEmail()).isEqualTo("recipient@example.com");
        assertThat(saved.getActorEmail()).isEqualTo("recipient@example.com");
        assertThat(saved.getAction()).isEqualTo(FileShareAuditAction.DOWNLOADED);
        assertThat(saved.getPermission()).isEqualTo("DOWNLOAD");
        assertThat(saved.getStatus()).isEqualTo("ACCEPTED");
        assertThat(saved.getDownloadLimit()).isEqualTo(3);
        assertThat(saved.getDownloadCount()).isEqualTo(1);
    }

    @Test
    void listForUserMapsRecentAuditRows() {
        LocalDateTime createdAt = LocalDateTime.now();
        FileShareAuditLog log = FileShareAuditLog.builder()
                .idx(1L)
                .shareIdx(20L)
                .fileIdx(10L)
                .fileName("report.txt")
                .ownerIdx(1L)
                .ownerEmail("owner@example.com")
                .recipientIdx(2L)
                .recipientEmail("recipient@example.com")
                .actorIdx(2L)
                .actorEmail("recipient@example.com")
                .action(FileShareAuditAction.DOWNLOAD_LINK_CREATED)
                .permission("DOWNLOAD")
                .status("ACCEPTED")
                .downloadLimit(1)
                .downloadCount(1)
                .createdAt(createdAt)
                .build();
        when(shareAuditLogRepository.findTop100ByOwnerIdxOrRecipientIdxOrActorIdxOrderByCreatedAtDesc(2L, 2L, 2L))
                .thenReturn(List.of(log));

        var result = shareAuditService.listForUser(2L);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).idx()).isEqualTo(1L);
        assertThat(result.get(0).action()).isEqualTo("DOWNLOAD_LINK_CREATED");
        assertThat(result.get(0).recipientEmail()).isEqualTo("recipient@example.com");
        assertThat(result.get(0).createdAt()).isEqualTo(createdAt);
    }

    private static User user(Long idx, String email, String name) {
        return User.builder()
                .idx(idx)
                .email(email)
                .name(name)
                .build();
    }
}
