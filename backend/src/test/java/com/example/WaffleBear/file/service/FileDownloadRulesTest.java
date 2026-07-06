package com.example.WaffleBear.file.service;

import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.file.model.FileNodeType;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class FileDownloadRulesTest {

    @Test
    void createsAttachmentQueryParamsWithSanitizedFileNameAndContentType() {
        String fileName = FileDownloadRules.downloadFileName("report\r\n.txt", "fallback.txt");

        assertThat(fileName).isEqualTo("report.txt");
        assertThat(FileDownloadRules.downloadContentType(fileName)).isEqualTo("text/plain");
        assertThat(FileDownloadRules.attachmentQueryParams(fileName, "text/custom"))
                .containsEntry("response-content-type", "text/custom")
                .containsKey("response-content-disposition");
    }

    @Test
    void allowsPresignedDownloadOnlyForUnlockedFileWithObjectKey() {
        assertThat(FileDownloadRules.canGeneratePresignedDownloadUrl(item(FileNodeType.FILE.name(), false, "7/a.txt")))
                .isTrue();
        assertThat(FileDownloadRules.canGeneratePresignedDownloadUrl(item(FileNodeType.FILE.name(), true, "7/a.txt")))
                .isFalse();
        assertThat(FileDownloadRules.canGeneratePresignedDownloadUrl(item(FileNodeType.FOLDER.name(), false, "7/folder")))
                .isFalse();
        assertThat(FileDownloadRules.canGeneratePresignedDownloadUrl(item(FileNodeType.FILE.name(), false, " ")))
                .isFalse();
        assertThat(FileDownloadRules.canGeneratePresignedDownloadUrl(null)).isFalse();
    }

    @Test
    void createsFileInfoSnapshotForThumbnailUrlGeneration() {
        var item = item("invalid", false, "7/a.png");
        item.setIdx(3L);
        item.setFileOriginName("a.png");
        item.setFileSaveName("stored.png");
        item.setFileFormat("png");
        item.setFileSize(12L);
        item.setSharedFile(true);
        item.setTrashed(true);

        var snapshot = FileDownloadRules.toFileInfoUrlSnapshot(item);

        assertThat(snapshot.getIdx()).isEqualTo(3L);
        assertThat(snapshot.getNodeType()).isEqualTo(FileNodeType.FILE);
        assertThat(snapshot.getFileSavePath()).isEqualTo("7/a.png");
        assertThat(snapshot.isSharedFile()).isTrue();
        assertThat(snapshot.isTrashed()).isTrue();
    }

    private static FileCommonDto.FileListItemRes item(String nodeType, boolean locked, String objectKey) {
        return FileCommonDto.FileListItemRes.builder()
                .nodeType(nodeType)
                .lockedFile(locked)
                .fileSavePath(objectKey)
                .build();
    }
}
