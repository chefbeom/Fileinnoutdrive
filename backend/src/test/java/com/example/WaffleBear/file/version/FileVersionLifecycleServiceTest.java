package com.example.WaffleBear.file.version;

import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.version.model.FileVersion;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileVersionLifecycleServiceTest {

    @Mock
    private FileVersionRepository fileVersionRepository;

    @InjectMocks
    private FileVersionLifecycleService lifecycleService;

    @Test
    void sumsStoredVersionBytesSafely() {
        when(fileVersionRepository.sumStoredVersionBytesByUser(7L)).thenReturn(256L);

        assertThat(lifecycleService.sumStoredVersionBytes(7L)).isEqualTo(256L);
    }

    @Test
    void normalizesVersionObjectKeysForFiles() {
        when(fileVersionRepository.findAllByFile_IdxIn(List.of(10L, 11L))).thenReturn(List.of(
                version(" 7/versions/report-v1.txt "),
                version("7/versions/report-v1.txt"),
                version(" "),
                version(null),
                version("7/versions/report-v2.txt")
        ));

        List<String> keys = lifecycleService.findVersionObjectKeys(List.of(file(10L), file(11L), file(10L), file(null)));

        assertThat(keys).containsExactly("7/versions/report-v1.txt", "7/versions/report-v2.txt");
    }

    @Test
    void deletesVersionsForNormalizedFileIds() {
        lifecycleService.deleteVersionsForFiles(List.of(file(10L), file(11L), file(10L), file(null)));

        verify(fileVersionRepository).deleteAllByFile_IdxIn(List.of(10L, 11L));
    }

    @Test
    void skipsVersionDeletionWhenNoFileIdsExist() {
        lifecycleService.deleteVersionsForFiles(List.of(file(null)));

        verify(fileVersionRepository, never()).deleteAllByFile_IdxIn(any());
    }

    private static FileInfo file(Long idx) {
        return FileInfo.builder().idx(idx).build();
    }

    private static FileVersion version(String objectKey) {
        return FileVersion.builder().fileSavePath(objectKey).build();
    }
}