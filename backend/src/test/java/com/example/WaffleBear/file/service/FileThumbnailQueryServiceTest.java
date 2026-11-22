package com.example.WaffleBear.file.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.model.FileSpaceType;
import com.example.WaffleBear.file.share.ShareRepository;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.share.model.FileSharePermission;
import com.example.WaffleBear.file.share.model.FileShareStatus;
import com.example.WaffleBear.user.model.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileThumbnailQueryServiceTest {

    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;

    @Mock
    private ShareRepository shareRepository;

    @Mock
    private FileThumbnailService fileThumbnailService;

    private FileThumbnailQueryService queryService;

    @BeforeEach
    void setUp() {
        queryService = new FileThumbnailQueryService(
                fileUpDownloadRepository,
                shareRepository,
                fileThumbnailService
        );
    }

    @Test
    void loadSharedThumbnailFailsClosedWhenPasswordEncoderIsMissing() {
        User owner = User.builder().idx(1L).email("owner@example.com").build();
        User recipient = User.builder().idx(2L).email("recipient@example.com").build();
        FileInfo file = FileInfo.builder()
                .idx(10L)
                .user(owner)
                .nodeType(FileNodeType.FILE)
                .fileOriginName("photo.png")
                .fileFormat("png")
                .fileSavePath("1/photo.png")
                .build();
        FileShare share = FileShare.builder()
                .idx(5L)
                .file(file)
                .owner(owner)
                .recipient(recipient)
                .permission(FileSharePermission.READ)
                .status(FileShareStatus.ACCEPTED)
                .passwordHash("$2a$10$hash")
                .build();

        when(shareRepository.findByFile_IdxAndRecipient_Idx(10L, 2L)).thenReturn(Optional.of(share));

        assertThatThrownBy(() -> queryService.loadSharedThumbnail(2L, 10L, "secret"))
                .isInstanceOf(BaseException.class);
        verifyNoInteractions(fileThumbnailService);
    }

    @Test
    void loadSharedThumbnailRejectsFileInsideHiddenOrVaultFolder() {
        User owner = User.builder().idx(1L).email("owner@example.com").build();
        User recipient = User.builder().idx(2L).email("recipient@example.com").build();
        FileInfo hiddenParent = FileInfo.builder()
                .idx(99L)
                .user(owner)
                .nodeType(FileNodeType.FOLDER)
                .spaceType(FileSpaceType.DRIVE)
                .hiddenFolder(true)
                .build();
        FileInfo file = FileInfo.builder()
                .idx(10L)
                .user(owner)
                .parent(hiddenParent)
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.DRIVE)
                .fileOriginName("secret.png")
                .fileFormat("png")
                .fileSavePath("1/secret.png")
                .build();
        FileShare share = FileShare.builder()
                .idx(6L)
                .file(file)
                .owner(owner)
                .recipient(recipient)
                .permission(FileSharePermission.READ)
                .status(FileShareStatus.ACCEPTED)
                .build();

        when(shareRepository.findByFile_IdxAndRecipient_Idx(10L, 2L)).thenReturn(Optional.of(share));

        assertThatThrownBy(() -> queryService.loadSharedThumbnail(2L, 10L))
                .isInstanceOf(BaseException.class);
        verifyNoInteractions(fileThumbnailService);
    }
}
