package com.example.WaffleBear.workspace.asset;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.workspace.asset.model.WorkspaceAsset;
import com.example.WaffleBear.workspace.asset.model.WorkspaceAssetType;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorkspaceAssetRulesTest {

    @Test
    void validateFileSanitizesPathSegmentsAndKeepsOriginalCase() {
        MockMultipartFile file = new MockMultipartFile(
                "files",
                "..\\reports/Quarterly.PDF",
                "application/pdf",
                "content".getBytes()
        );

        String originalName = WorkspaceAssetRules.validateFile(file);

        assertThat(originalName).isEqualTo("Quarterly.PDF");
        assertThat(WorkspaceAssetRules.extractExtension(originalName)).isEqualTo("pdf");
    }

    @Test
    void validateFileRejectsEmptyFileAndInvalidName() {
        MockMultipartFile empty = new MockMultipartFile(
                "files",
                "empty.txt",
                "text/plain",
                new byte[0]
        );
        MockMultipartFile invalidName = new MockMultipartFile(
                "files",
                " ",
                "text/plain",
                "content".getBytes()
        );

        assertThatThrownBy(() -> WorkspaceAssetRules.validateFile(empty))
                .isInstanceOfSatisfying(BaseException.class, exception ->
                        assertThat(exception.getStatus()).isEqualTo(BaseResponseStatus.FILE_EMPTY));
        assertThatThrownBy(() -> WorkspaceAssetRules.validateFile(invalidName))
                .isInstanceOfSatisfying(BaseException.class, exception ->
                        assertThat(exception.getStatus()).isEqualTo(BaseResponseStatus.FILE_NAME_WRONG));
    }

    @Test
    void imageRulesAcceptContentTypeOrExtension() {
        assertThat(WorkspaceAssetRules.isImageFile("image/png", "")).isTrue();
        assertThat(WorkspaceAssetRules.isImageFile("application/octet-stream", "WEBP")).isTrue();
        assertThat(WorkspaceAssetRules.isImageFile("text/plain", "txt")).isFalse();

        assertThat(WorkspaceAssetRules.resolveAssetType("image/jpeg", "bin"))
                .isEqualTo(WorkspaceAssetType.IMAGE);
        assertThat(WorkspaceAssetRules.resolveAssetType("application/octet-stream", "png"))
                .isEqualTo(WorkspaceAssetType.IMAGE);
        assertThat(WorkspaceAssetRules.resolveAssetType("application/pdf", "pdf"))
                .isEqualTo(WorkspaceAssetType.FILE);
    }

    @Test
    void resolveDriveFileFormatPrefersOriginalThenStoredNameThenBin() {
        WorkspaceAsset fromOriginal = WorkspaceAsset.builder()
                .originalName("report.PDF")
                .storedFileName("stored.bin")
                .build();
        WorkspaceAsset fromStored = WorkspaceAsset.builder()
                .originalName("report")
                .storedFileName("stored.TXT")
                .build();
        WorkspaceAsset withoutExtension = WorkspaceAsset.builder()
                .originalName("report")
                .storedFileName("stored")
                .build();

        assertThat(WorkspaceAssetRules.resolveDriveFileFormat(fromOriginal)).isEqualTo("pdf");
        assertThat(WorkspaceAssetRules.resolveDriveFileFormat(fromStored)).isEqualTo("txt");
        assertThat(WorkspaceAssetRules.resolveDriveFileFormat(withoutExtension)).isEqualTo("bin");
    }

    @Test
    void buildDriveStoredFileNameCreatesUuidWithNormalizedExtension() {
        assertThat(WorkspaceAssetRules.buildDriveStoredFileName(" PDF "))
                .matches("[0-9a-f\\-]{36}\\.pdf");
        assertThat(WorkspaceAssetRules.buildDriveStoredFileName(""))
                .matches("[0-9a-f\\-]{36}");
    }

    @Test
    void normalizeObjectKeysFiltersBlanksAndDuplicates() {
        List<String> normalized = WorkspaceAssetRules.normalizeObjectKeys(
                Arrays.asList(" a.txt ", null, "", "a.txt", "b.txt")
        );

        assertThat(normalized).containsExactly("a.txt", "b.txt");
    }

    @Test
    void sanitizeDownloadFileNameRemovesHeaderUnsafeLineBreaks() {
        assertThat(WorkspaceAssetRules.sanitizeDownloadFileName(" report\r\n.txt ", "fallback.txt"))
                .isEqualTo("report.txt");
        assertThat(WorkspaceAssetRules.sanitizeDownloadFileName(" ", "fallback.txt"))
                .isEqualTo("fallback.txt");
        assertThat(WorkspaceAssetRules.sanitizeDownloadFileName(null, null))
                .isEqualTo("file");
    }
}
