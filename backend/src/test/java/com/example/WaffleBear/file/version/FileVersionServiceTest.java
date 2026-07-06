package com.example.WaffleBear.file.version;

import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.version.model.FileVersion;
import com.example.WaffleBear.user.model.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileVersionServiceTest {

    @Mock
    private FileVersionRepository fileVersionRepository;

    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;

    @InjectMocks
    private FileVersionService fileVersionService;

    @Test
    void snapshotCurrentStoresCurrentFileMetadataAsNextVersion() {
        User owner = user(1L);
        FileInfo file = file(10L, owner, "report.txt", "old-key", 128L);

        when(fileVersionRepository.findTopByFile_IdxOrderByVersionNumberDesc(file.getIdx()))
                .thenReturn(Optional.empty());

        fileVersionService.snapshotCurrent(file);

        ArgumentCaptor<FileVersion> captor = ArgumentCaptor.forClass(FileVersion.class);
        verify(fileVersionRepository).save(captor.capture());
        FileVersion version = captor.getValue();

        assertThat(version.getFile()).isEqualTo(file);
        assertThat(version.getUser()).isEqualTo(owner);
        assertThat(version.getVersionNumber()).isEqualTo(1);
        assertThat(version.getFileOriginName()).isEqualTo("report.txt");
        assertThat(version.getFileSavePath()).isEqualTo("old-key");
        assertThat(version.getFileSize()).isEqualTo(128L);
    }

    @Test
    void restoreVersionSnapshotsCurrentThenReplacesFileMetadata() {
        User owner = user(1L);
        FileInfo file = file(10L, owner, "report.txt", "current-key", 256L);
        FileVersion version = FileVersion.builder()
                .idx(5L)
                .file(file)
                .user(owner)
                .versionNumber(1)
                .fileOriginName("report-old.txt")
                .fileFormat("txt")
                .fileSaveName("old.txt")
                .fileSavePath("old-key")
                .fileSize(128L)
                .build();

        when(fileUpDownloadRepository.findByIdxAndUser_Idx(file.getIdx(), owner.getIdx()))
                .thenReturn(Optional.of(file));
        when(fileVersionRepository.findByIdxAndFile_IdxAndUser_Idx(version.getIdx(), file.getIdx(), owner.getIdx()))
                .thenReturn(Optional.of(version));
        when(fileVersionRepository.findTopByFile_IdxOrderByVersionNumberDesc(file.getIdx()))
                .thenReturn(Optional.of(version));
        when(fileUpDownloadRepository.save(file)).thenReturn(file);

        var result = fileVersionService.restoreVersion(owner.getIdx(), file.getIdx(), version.getIdx());

        ArgumentCaptor<FileVersion> snapshotCaptor = ArgumentCaptor.forClass(FileVersion.class);
        verify(fileVersionRepository).save(snapshotCaptor.capture());
        assertThat(snapshotCaptor.getValue().getVersionNumber()).isEqualTo(2);
        assertThat(snapshotCaptor.getValue().getFileSavePath()).isEqualTo("current-key");
        assertThat(file.getFileOriginName()).isEqualTo("report-old.txt");
        assertThat(file.getFileSavePath()).isEqualTo("old-key");
        assertThat(file.getFileSize()).isEqualTo(128L);
        verify(fileVersionRepository).delete(version);
        assertThat(result.getIdx()).isEqualTo(file.getIdx());
    }

    private static User user(Long idx) {
        return User.builder()
                .idx(idx)
                .email("user" + idx + "@example.com")
                .role("ROLE_USER")
                .enable(true)
                .build();
    }

    private static FileInfo file(Long idx, User owner, String name, String objectKey, Long size) {
        return FileInfo.builder()
                .idx(idx)
                .user(owner)
                .nodeType(FileNodeType.FILE)
                .fileOriginName(name)
                .fileFormat("txt")
                .fileSaveName(name)
                .fileSavePath(objectKey)
                .fileSize(size)
                .lockedFile(false)
                .sharedFile(false)
                .trashed(false)
                .build();
    }
}