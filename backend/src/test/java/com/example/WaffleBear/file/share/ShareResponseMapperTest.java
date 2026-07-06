package com.example.WaffleBear.file.share;

import com.example.WaffleBear.file.info.dto.FileInfoDto;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.share.model.FileSharePermission;
import com.example.WaffleBear.file.share.model.FileShareStatus;
import com.example.WaffleBear.user.model.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ShareResponseMapperTest {

    @Mock
    private ShareFileObjectStorageService shareFileObjectStorageService;

    @InjectMocks
    private ShareResponseMapper shareResponseMapper;

    @Test
    void mapsAcceptedSharedVideoWithDirectUrlsWhenNoTrackingPolicyIsRequired() {
        User owner = user(1L, "Owner", "owner@example.com");
        User recipient = user(2L, "Writer", "writer@example.com");
        FileInfo file = file(10L, owner, "demo.mp4", "mp4", false);
        FileShare share = share(100L, file, owner, recipient, FileSharePermission.WRITE, FileShareStatus.ACCEPTED, null, null, 0);

        when(shareFileObjectStorageService.presignedUrlExpirySeconds()).thenReturn(300);
        when(shareFileObjectStorageService.generateDownloadUrl("1/demo.mp4")).thenReturn("http://download.example/demo.mp4");
        when(shareFileObjectStorageService.generateThumbnailUrl("1/demo.mp4")).thenReturn("http://download.example/demo.jpg");

        var result = shareResponseMapper.toSharedFileRes(share);

        assertThat(result.idx()).isEqualTo(10L);
        assertThat(result.nodeType()).isEqualTo("FILE");
        assertThat(result.sharedWithMe()).isTrue();
        assertThat(result.permission()).isEqualTo("WRITE");
        assertThat(result.writable()).isTrue();
        assertThat(result.readable()).isTrue();
        assertThat(result.downloadable()).isTrue();
        assertThat(result.uploadable()).isTrue();
        assertThat(result.presignedDownloadUrl()).isEqualTo("http://download.example/demo.mp4");
        assertThat(result.thumbnailPresignedUrl()).isEqualTo("http://download.example/demo.jpg");
        assertThat(result.presignedUrlExpiresIn()).isEqualTo(300);
        assertThat(result.ownerEmail()).isEqualTo("owner@example.com");
        assertThat(result.status()).isEqualTo("ACCEPTED");
    }

    @Test
    void omitsDirectSharedDownloadUrlWhenDownloadMustBeTracked() {
        User owner = user(1L, "Owner", "owner@example.com");
        User recipient = user(2L, "Reader", "reader@example.com");
        FileInfo file = file(11L, owner, "report.pdf", "pdf", false);
        FileShare share = share(101L, file, owner, recipient, FileSharePermission.DOWNLOAD, FileShareStatus.ACCEPTED, null, 3, 1);

        when(shareFileObjectStorageService.presignedUrlExpirySeconds()).thenReturn(300);

        var result = shareResponseMapper.toSharedFileRes(share);

        assertThat(result.downloadable()).isTrue();
        assertThat(result.presignedDownloadUrl()).isNull();
        verify(shareFileObjectStorageService, never()).generateDownloadUrl("1/report.pdf");
    }

    @Test
    void mapsSentShareRecipientsAndFileListItemUrls() {
        User owner = user(1L, "Owner", "owner@example.com");
        User firstRecipient = user(2L, "Writer", "writer@example.com");
        User secondRecipient = user(3L, "Reader", "reader@example.com");
        FileInfo file = file(12L, owner, "plan.txt", "txt", false);
        FileShare firstShare = share(102L, file, owner, firstRecipient, FileSharePermission.WRITE, FileShareStatus.ACCEPTED, null, null, 0);
        FileShare secondShare = share(103L, file, owner, secondRecipient, FileSharePermission.READ, FileShareStatus.PENDING, null, null, 0);

        when(shareFileObjectStorageService.presignedUrlExpirySeconds()).thenReturn(300);
        when(shareFileObjectStorageService.generateDownloadUrl("1/plan.txt")).thenReturn("http://download.example/plan.txt");

        var sent = shareResponseMapper.toSentSharedFileRes(List.of(firstShare, secondShare));
        var listItem = shareResponseMapper.toFileListItem(file);

        assertThat(sent.recipientCount()).isEqualTo(2);
        assertThat(sent.recipients()).extracting(recipient -> recipient.recipientEmail())
                .containsExactly("writer@example.com", "reader@example.com");
        assertThat(sent.sharedWithMe()).isFalse();
        assertThat(sent.presignedDownloadUrl()).isEqualTo("http://download.example/plan.txt");
        assertThat(listItem.getPresignedDownloadUrl()).isEqualTo("http://download.example/plan.txt");
        assertThat(listItem.getPresignedUrlExpiresIn()).isEqualTo(300);
    }

    @Test
    void buildsKoreanShareNotificationMessage() {
        User owner = user(1L, "홍길동", "owner@example.com");
        FileInfo first = file(13L, owner, "보고서.pdf", "pdf", false);
        FileInfo second = file(14L, owner, "회의록.txt", "txt", false);

        assertThat(shareResponseMapper.buildFileShareMessage(List.of(first)))
                .isEqualTo("홍길동 님이 '보고서.pdf' 파일을 공유했습니다.");
        assertThat(shareResponseMapper.buildFileShareMessage(List.of(first, second)))
                .isEqualTo("홍길동 님이 '보고서.pdf' 외 1개 파일을 공유했습니다.");
    }

    @Test
    void mapsShareInfoPolicyFlags() {
        User owner = user(1L, "Owner", "owner@example.com");
        User recipient = user(2L, "Reader", "reader@example.com");
        FileInfo file = file(15L, owner, "limited.pdf", "pdf", false);
        FileShare share = share(
                104L,
                file,
                owner,
                recipient,
                FileSharePermission.DOWNLOAD,
                FileShareStatus.ACCEPTED,
                LocalDateTime.now().plusDays(1),
                2,
                2
        );

        var result = shareResponseMapper.toShareInfo(share);

        assertThat(result.downloadLimitReached()).isTrue();
        assertThat(result.downloadable()).isFalse();
        assertThat(result.readable()).isTrue();
        assertThat(result.uploadable()).isFalse();
        assertThat(result.writable()).isFalse();
    }

    private static User user(Long idx, String name, String email) {
        return User.builder()
                .idx(idx)
                .name(name)
                .email(email)
                .build();
    }

    private static FileInfo file(Long idx, User owner, String fileName, String format, boolean locked) {
        return FileInfo.builder()
                .idx(idx)
                .user(owner)
                .nodeType(FileNodeType.FILE)
                .fileOriginName(fileName)
                .fileFormat(format)
                .fileSaveName(fileName)
                .fileSavePath(owner.getIdx() + "/" + fileName)
                .fileSize(128L)
                .lockedFile(locked)
                .sharedFile(true)
                .trashed(false)
                .uploadDate(LocalDateTime.parse("2026-01-01T10:00:00"))
                .lastModifyDate(LocalDateTime.parse("2026-01-02T10:00:00"))
                .build();
    }

    private static FileShare share(
            Long idx,
            FileInfo file,
            User owner,
            User recipient,
            FileSharePermission permission,
            FileShareStatus status,
            LocalDateTime expiresAt,
            Integer downloadLimit,
            int downloadCount
    ) {
        return FileShare.builder()
                .idx(idx)
                .file(file)
                .owner(owner)
                .recipient(recipient)
                .permission(permission)
                .status(status)
                .createdAt(LocalDateTime.parse("2026-01-03T10:00:00"))
                .respondedAt(LocalDateTime.parse("2026-01-03T11:00:00"))
                .expiresAt(expiresAt)
                .downloadLimit(downloadLimit)
                .downloadCount(downloadCount)
                .build();
    }
}