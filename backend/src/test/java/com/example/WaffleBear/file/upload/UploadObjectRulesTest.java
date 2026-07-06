package com.example.WaffleBear.file.upload;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UploadObjectRulesTest {

    @Test
    void normalizeOriginNameTrimsAndRejectsBlankNames() {
        assertThat(UploadObjectRules.normalizeOriginName(" report.txt ")).isEqualTo("report.txt");

        assertThatThrownBy(() -> UploadObjectRules.normalizeOriginName(" "))
                .isInstanceOfSatisfying(BaseException.class, exception ->
                        assertThat(exception.getStatus()).isEqualTo(BaseResponseStatus.FILE_NAME_WRONG));
    }

    @Test
    void normalizeFormatUsesExplicitFormatOrOriginExtension() {
        assertThat(UploadObjectRules.normalizeFormat(" PDF ", "report.txt")).isEqualTo("pdf");
        assertThat(UploadObjectRules.normalizeFormat(".TXT", "report.bin")).isEqualTo("txt");
        assertThat(UploadObjectRules.normalizeFormat("", "archive.ZIP")).isEqualTo("zip");
    }

    @Test
    void normalizeFormatRejectsMissingOrUnsafeFormats() {
        assertThatThrownBy(() -> UploadObjectRules.normalizeFormat("", "README"))
                .isInstanceOfSatisfying(BaseException.class, exception ->
                        assertThat(exception.getStatus()).isEqualTo(BaseResponseStatus.FILE_FORMAT_NOTHING));
        assertThatThrownBy(() -> UploadObjectRules.normalizeFormat("tar.gz", "archive.tar.gz"))
                .isInstanceOfSatisfying(BaseException.class, exception ->
                        assertThat(exception.getStatus()).isEqualTo(BaseResponseStatus.FILE_FORMAT_WRONG));
        assertThatThrownBy(() -> UploadObjectRules.normalizeFormat("abcdefghijklmnopqrstu", "file.txt"))
                .isInstanceOfSatisfying(BaseException.class, exception ->
                        assertThat(exception.getStatus()).isEqualTo(BaseResponseStatus.FILE_FORMAT_WRONG));
    }

    @Test
    void normalizeOwnedObjectKeysKeepsOnlyKeysUnderUserPrefix() {
        assertThat(UploadObjectRules.normalizeOwnedObjectKey(7L, " 7/final.bin "))
                .isEqualTo("7/final.bin");
        assertThat(UploadObjectRules.normalizeOwnedObjectKeys(
                7L,
                Arrays.asList(" 7/a.bin ", null, "", "7/a.bin", "7/b.bin")
        )).containsExactly("7/a.bin", "7/b.bin");

        assertThatThrownBy(() -> UploadObjectRules.normalizeOwnedObjectKey(7L, "8/final.bin"))
                .isInstanceOfSatisfying(BaseException.class, exception ->
                        assertThat(exception.getStatus()).isEqualTo(BaseResponseStatus.REQUEST_ERROR));
    }

    @Test
    void normalizeDeleteObjectKeysFiltersBlanksAndDuplicates() {
        List<String> normalized = UploadObjectRules.normalizeDeleteObjectKeys(
                Arrays.asList(" a.bin ", null, "", "a.bin", "b.bin")
        );

        assertThat(normalized).containsExactly("a.bin", "b.bin");
        assertThat(UploadObjectRules.normalizeDeleteObjectKeys(null)).isEmpty();
    }

    @Test
    void extractFileSaveNameUsesLastPathSegment() {
        assertThat(UploadObjectRules.extractFileSaveName("7/folder/report.txt")).isEqualTo("report.txt");
        assertThat(UploadObjectRules.extractFileSaveName("report.txt")).isEqualTo("report.txt");
        assertThat(UploadObjectRules.extractFileSaveName("7/folder/")).isEqualTo("7/folder/");
    }
}
