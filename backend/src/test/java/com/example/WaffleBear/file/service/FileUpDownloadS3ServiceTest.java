package com.example.WaffleBear.file.service;

import com.example.WaffleBear.file.dto.FileCommonDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.env.MockEnvironment;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileUpDownloadS3ServiceTest {

    @Mock
    private FileUpDownloadMinioService minioService;

    private FileUpDownloadS3Service s3Service;

    @BeforeEach
    void setUp() {
        MockEnvironment environment = new MockEnvironment()
                .withProperty("storage.provider", "minio");
        s3Service = new FileUpDownloadS3Service(minioService, environment);
    }

    @Test
    void delegatesFavoriteAndVaultMoveOperationsToResolvedDelegate() {
        FileCommonDto.FileActionRes favRes = FileCommonDto.FileActionRes.builder()
                .action("favorite")
                .affectedCount(2)
                .build();
        FileCommonDto.FileActionRes moveSingleRes = FileCommonDto.FileActionRes.builder()
                .action("move-from-vault")
                .targetIdx(10L)
                .affectedCount(1)
                .build();
        FileCommonDto.FileActionRes moveBatchRes = FileCommonDto.FileActionRes.builder()
                .action("move-from-vault")
                .targetIdx(10L)
                .affectedCount(2)
                .build();

        when(minioService.setFavoriteFiles(7L, List.of(1L, 2L), true)).thenReturn(favRes);
        when(minioService.moveFromVault(7L, 55L, null, true)).thenReturn(moveSingleRes);
        when(minioService.moveFilesFromVault(7L, List.of(55L, 56L), 10L, false)).thenReturn(moveBatchRes);

        assertThat(s3Service.setFavoriteFiles(7L, List.of(1L, 2L), true)).isSameAs(favRes);
        assertThat(s3Service.moveFromVault(7L, 55L, null, true)).isSameAs(moveSingleRes);
        assertThat(s3Service.moveFilesFromVault(7L, List.of(55L, 56L), 10L, false)).isSameAs(moveBatchRes);

        verify(minioService).setFavoriteFiles(7L, List.of(1L, 2L), true);
        verify(minioService).moveFromVault(7L, 55L, null, true);
        verify(minioService).moveFilesFromVault(7L, List.of(55L, 56L), 10L, false);
    }
}
