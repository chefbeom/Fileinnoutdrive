package com.example.WaffleBear.file.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FileListQueryRulesTest {

    @Test
    void normalizeSearchScopeRecognizesSupportedScopes() {
        assertThat(FileListQueryRules.normalizeSearchScope(null)).isEqualTo("current");
        assertThat(FileListQueryRules.normalizeSearchScope("")).isEqualTo("current");
        assertThat(FileListQueryRules.normalizeSearchScope("CURRENT")).isEqualTo("current");
        assertThat(FileListQueryRules.normalizeSearchScope("subtree")).isEqualTo("subtree");
        assertThat(FileListQueryRules.normalizeSearchScope("recursive")).isEqualTo("subtree");
        assertThat(FileListQueryRules.normalizeSearchScope("root")).isEqualTo("root");
        assertThat(FileListQueryRules.normalizeSearchScope("all")).isEqualTo("root");
        assertThat(FileListQueryRules.normalizeSearchScope("unknown")).isEqualTo("current");
    }

    @Test
    void parseExtensionFiltersNormalizesWildcardsDotsAndMultiTokens() {
        assertThat(FileListQueryRules.parseExtensionFilters(null)).isEmpty();
        assertThat(FileListQueryRules.parseExtensionFilters("all")).isEmpty();
        assertThat(FileListQueryRules.parseExtensionFilters(".PDF")).containsExactly("pdf");
        assertThat(FileListQueryRules.parseExtensionFilters("*.jpg, .PNG; webp all *"))
                .containsExactly("jpg", "png", "webp");
    }

    @Test
    void parseSearchKeywordExtractsInlineExtensionsAndPreservesTextTerms() {
        FileListQueryRules.ParsedSearchKeyword plain = FileListQueryRules.parseSearchKeyword("  2026 Report  ");
        assertThat(plain.textTerm()).isEqualTo("2026 report");
        assertThat(plain.inlineExtensions()).isEmpty();

        FileListQueryRules.ParsedSearchKeyword dotExt = FileListQueryRules.parseSearchKeyword(".pdf");
        assertThat(dotExt.textTerm()).isEmpty();
        assertThat(dotExt.inlineExtensions()).containsExactly("pdf");

        FileListQueryRules.ParsedSearchKeyword combined = FileListQueryRules.parseSearchKeyword("예산 보고서 ext:xlsx,csv *.pdf");
        assertThat(combined.textTerm()).isEqualTo("예산 보고서");
        assertThat(combined.inlineExtensions()).containsExactly("xlsx", "csv", "pdf");
    }

    @Test
    void escapeLikePatternEscapesBackslashPercentAndUnderscore() {
        assertThat(FileListQueryRules.escapeLikePattern("100%_final\\v1"))
                .isEqualTo("100\\%\\_final\\\\v1");
    }

    @Test
    void sanitizeFolderNameAllowsEllipsisAnd255CharsWhileRejectingTraversalSegments() {
        String longName = "가".repeat(255);
        assertThat(FileListQueryRules.sanitizeFolderName(" 영상 모음...2026 ")).isEqualTo("영상 모음...2026");
        assertThat(FileListQueryRules.sanitizeFolderName(longName)).isEqualTo(longName);

        for (String invalidName : new String[]{".", "..", "a/b", "a\\b", "가".repeat(256)}) {
            assertThatThrownBy(() -> FileListQueryRules.sanitizeFolderName(invalidName))
                    .isInstanceOfSatisfying(BaseException.class, ex ->
                            assertThat(ex.getStatus()).isEqualTo(BaseResponseStatus.FILE_NAME_WRONG));
        }
    }
}
