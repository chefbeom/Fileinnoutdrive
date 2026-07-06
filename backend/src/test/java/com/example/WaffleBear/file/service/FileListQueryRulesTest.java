package com.example.WaffleBear.file.service;

import com.example.WaffleBear.common.exception.BaseException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FileListQueryRulesTest {

    @Test
    void sanitizesFolderName() {
        assertThat(FileListQueryRules.sanitizeFolderName("  reports  ")).isEqualTo("reports");
    }

    @Test
    void rejectsUnsafeFolderNames() {
        assertThatThrownBy(() -> FileListQueryRules.sanitizeFolderName("../secret"))
                .isInstanceOf(BaseException.class);
        assertThatThrownBy(() -> FileListQueryRules.sanitizeFolderName("bad/name"))
                .isInstanceOf(BaseException.class);
        assertThatThrownBy(() -> FileListQueryRules.sanitizeFolderName(""))
                .isInstanceOf(BaseException.class);
    }

    @Test
    void normalizesPagingBounds() {
        assertThat(FileListQueryRules.sanitizePage(null)).isZero();
        assertThat(FileListQueryRules.sanitizePage(-1)).isZero();
        assertThat(FileListQueryRules.sanitizePage(3)).isEqualTo(3);
        assertThat(FileListQueryRules.sanitizePageSize(null)).isEqualTo(10);
        assertThat(FileListQueryRules.sanitizePageSize(0)).isEqualTo(10);
        assertThat(FileListQueryRules.sanitizePageSize(31)).isEqualTo(30);
        assertThat(FileListQueryRules.sanitizePageSize(20)).isEqualTo(20);
    }

    @Test
    void normalizesSearchAndFilterText() {
        assertThat(FileListQueryRules.normalizeSearchKeyword("  Report  ")).isEqualTo("report");
        assertThat(FileListQueryRules.normalizeSearchKeyword(null)).isEmpty();
        assertThat(FileListQueryRules.normalizeFilterValue("  Size-Desc  ", "all")).isEqualTo("size-desc");
        assertThat(FileListQueryRules.normalizeFilterValue("   ", "all")).isEqualTo("all");
    }

    @Test
    void parsesMegabytesToBytes() {
        assertThat(FileListQueryRules.megabytesToBytes(2L)).isEqualTo(2L * 1024L * 1024L);
        assertThat(FileListQueryRules.parseMegabytesToBytes("1.5")).isEqualTo(Math.round(1.5D * 1024D * 1024D));
        assertThat(FileListQueryRules.parseMegabytesToBytes(null)).isNull();
        assertThat(FileListQueryRules.parseMegabytesToBytes("-1")).isNull();
        assertThat(FileListQueryRules.parseMegabytesToBytes("NaN")).isNull();
        assertThat(FileListQueryRules.parseMegabytesToBytes("abc")).isNull();
    }
}
