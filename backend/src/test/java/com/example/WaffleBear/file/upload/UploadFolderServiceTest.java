package com.example.WaffleBear.file.upload;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.model.FileSpaceType;
import com.example.WaffleBear.file.share.ShareInheritanceService;
import com.example.WaffleBear.file.upload.dto.UploadDto;
import com.example.WaffleBear.user.model.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UploadFolderServiceTest {

    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;

    @Mock
    private ShareInheritanceService shareInheritanceService;

    @Mock
    private PlatformTransactionManager transactionManager;

    @InjectMocks
    private UploadFolderService uploadFolderService;

    @BeforeEach
    void setUpTransactionManager() {
        lenient().when(transactionManager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
    }

    @Test
    void ensureFolderHierarchiesAllowsEllipsisLongNamesLeadingSlashesAndCachesRepeatedFolders() {
        Long userIdx = 7L;
        String folder255 = "폴".repeat(255);
        String folderEllipsis = "여행...2026";
        AtomicLong sequence = new AtomicLong(100L);
        Map<Long, FileInfo> savedFolders = new HashMap<>();

        when(fileUpDownloadRepository.findFirstRootFolderByNameAndSpace(userIdx, folder255, FileSpaceType.DRIVE))
                .thenReturn(Optional.empty());
        when(fileUpDownloadRepository.findFirstByUser_IdxAndParent_IdxAndFileOriginNameAndTrashedFalseOrderByIdxAsc(
                eq(userIdx), eq(101L), eq(folderEllipsis)))
                .thenReturn(Optional.empty());
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(any(), eq(userIdx)))
                .thenAnswer(invocation -> Optional.ofNullable(savedFolders.get(invocation.getArgument(0))));
        when(fileUpDownloadRepository.saveAndFlush(any(FileInfo.class))).thenAnswer(invocation -> {
            FileInfo entity = invocation.getArgument(0);
            FileInfo saved = FileInfo.builder()
                    .idx(sequence.incrementAndGet())
                    .user(User.builder().idx(userIdx).build())
                    .parent(entity.getParent())
                    .nodeType(FileNodeType.FOLDER)
                    .spaceType(entity.resolveSpaceType())
                    .fileOriginName(entity.getFileOriginName())
                    .fileFormat("folder")
                    .fileSaveName(entity.getFileSaveName())
                    .trashed(false)
                    .build();
            savedFolders.put(saved.getIdx(), saved);
            return saved;
        });

        List<UploadDto.InitReq> requests = List.of(
                UploadDto.InitReq.builder()
                        .fileOriginName("clip1.mp4")
                        .relativePath("/" + folder255 + "//" + folderEllipsis + "/clip1.mp4")
                        .build(),
                UploadDto.InitReq.builder()
                        .fileOriginName("clip2.mp4")
                        .relativePath(folder255 + "/" + folderEllipsis + "/clip2.mp4")
                        .build(),
                UploadDto.InitReq.builder()
                        .fileOriginName("clip3.mp4")
                        .relativePath(folder255 + "/" + folderEllipsis + "/clip3.mp4")
                        .build()
        );

        uploadFolderService.ensureFolderHierarchies(userIdx, requests);

        verify(fileUpDownloadRepository, times(1))
                .findFirstRootFolderByNameAndSpace(userIdx, folder255, FileSpaceType.DRIVE);
        verify(fileUpDownloadRepository, times(1))
                .findFirstByUser_IdxAndParent_IdxAndFileOriginNameAndTrashedFalseOrderByIdxAsc(
                        userIdx, 101L, folderEllipsis
                );
        verify(fileUpDownloadRepository, times(2)).saveAndFlush(any(FileInfo.class));
    }

    @Test
    void ensureFolderHierarchiesRejectsTraversalAndOver255CharFolderNamesWithContext() {
        Long userIdx = 7L;
        String folder256 = "폴".repeat(256);

        UploadDto.InitReq traversalReq = UploadDto.InitReq.builder()
                .fileOriginName("secret.mp4")
                .relativePath("videos/../secret/secret.mp4")
                .build();
        assertThatThrownBy(() -> uploadFolderService.ensureFolderHierarchies(userIdx, List.of(traversalReq)))
                .isInstanceOfSatisfying(BaseException.class, ex -> {
                    assertThat(ex.getStatus()).isEqualTo(BaseResponseStatus.FILE_NAME_WRONG);
                    assertThat(ex.resolveMessage()).contains("..");
                });

        UploadDto.InitReq dotSegmentReq = UploadDto.InitReq.builder()
                .fileOriginName("secret.mp4")
                .relativePath("./secret/secret.mp4")
                .build();
        assertThatThrownBy(() -> uploadFolderService.ensureFolderHierarchies(userIdx, List.of(dotSegmentReq)))
                .isInstanceOfSatisfying(BaseException.class, ex ->
                        assertThat(ex.getStatus()).isEqualTo(BaseResponseStatus.FILE_NAME_WRONG));

        UploadDto.InitReq tooLongReq = UploadDto.InitReq.builder()
                .fileOriginName("clip.mp4")
                .relativePath(folder256 + "/clip.mp4")
                .build();
        assertThatThrownBy(() -> uploadFolderService.ensureFolderHierarchies(userIdx, List.of(tooLongReq)))
                .isInstanceOfSatisfying(BaseException.class, ex -> {
                    assertThat(ex.getStatus()).isEqualTo(BaseResponseStatus.FILE_NAME_LENGTH_WRONG);
                    assertThat(ex.resolveMessage()).contains("255자");
                });
    }
}
