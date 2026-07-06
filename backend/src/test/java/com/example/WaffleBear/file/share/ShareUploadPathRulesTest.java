package com.example.WaffleBear.file.share;

import com.example.WaffleBear.common.exception.BaseException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ShareUploadPathRulesTest {

    @Test
    void extractsSanitizedFolderSegmentsFromRelativePath() {
        assertThat(ShareUploadPathRules.extractFolderSegments(" Team / Docs / report.txt ", "report.txt"))
                .containsExactly("Team", "Docs");

        assertThat(ShareUploadPathRules.extractFolderSegments(null, "report.txt"))
                .isEqualTo(List.of());
    }

    @Test
    void rejectsUnsafeFolderSegments() {
        assertThatThrownBy(() -> ShareUploadPathRules.extractFolderSegments("../secret/report.txt", "report.txt"))
                .isInstanceOf(BaseException.class);
    }

    @Test
    void sanitizesUploadFileNameAndRejectsUnsafeNames() {
        assertThat(ShareUploadPathRules.sanitizeUploadFileName(" report.TXT ")).isEqualTo("report.TXT");

        assertThatThrownBy(() -> ShareUploadPathRules.sanitizeUploadFileName("../report.txt"))
                .isInstanceOf(BaseException.class);
        assertThatThrownBy(() -> ShareUploadPathRules.sanitizeUploadFileName("folder/report.txt"))
                .isInstanceOf(BaseException.class);
        assertThatThrownBy(() -> ShareUploadPathRules.sanitizeUploadFileName(""))
                .isInstanceOf(BaseException.class);
    }

    @Test
    void resolvesLowercaseFileFormat() {
        assertThat(ShareUploadPathRules.resolveFileFormat("report.PDF")).isEqualTo("pdf");

        assertThatThrownBy(() -> ShareUploadPathRules.resolveFileFormat("report"))
                .isInstanceOf(BaseException.class);
        assertThatThrownBy(() -> ShareUploadPathRules.resolveFileFormat("report.bad-ext"))
                .isInstanceOf(BaseException.class);
    }

    @Test
    void validatesMultipartFileAndExtractsObjectFileName() {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "report.txt",
                "text/plain",
                "hello".getBytes()
        );

        ShareUploadPathRules.validateMultipartFile(file);
        assertThat(ShareUploadPathRules.extractFileSaveName("users/1/report-save.txt"))
                .isEqualTo("report-save.txt");
        assertThat(ShareUploadPathRules.extractFileSaveName("report-save.txt"))
                .isEqualTo("report-save.txt");

        MockMultipartFile empty = new MockMultipartFile("file", "empty.txt", "text/plain", new byte[0]);
        assertThatThrownBy(() -> ShareUploadPathRules.validateMultipartFile(empty))
                .isInstanceOf(BaseException.class);
    }
}
