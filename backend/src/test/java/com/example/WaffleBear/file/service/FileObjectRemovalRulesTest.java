package com.example.WaffleBear.file.service;

import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class FileObjectRemovalRulesTest {

    @Test
    void collectsFileVideoThumbnailAndVersionObjectKeys() {
        FileInfo video = file(1L, FileNodeType.FILE, "7/video.mp4", "mp4");
        FileInfo document = file(2L, null, "7/report.txt", "txt");
        FileInfo folder = file(3L, FileNodeType.FOLDER, "ignored/folder", "folder");

        List<String> objectKeys = FileObjectRemovalRules.collectObjectKeysForRemoval(
                List.of(video, document, folder),
                Arrays.asList("7/version/report-v1.txt", " 7/report.txt ", "", null)
        );

        assertThat(objectKeys).containsExactly(
                "7/video.mp4",
                "7/thumbnails/video.jpg",
                "7/report.txt",
                "7/version/report-v1.txt"
        );
    }

    @Test
    void collectsOnlyFileNodeIds() {
        List<Long> fileIds = FileObjectRemovalRules.collectFileIds(List.of(
                file(1L, FileNodeType.FILE, "7/a.txt", "txt"),
                file(2L, FileNodeType.FOLDER, null, "folder"),
                file(null, FileNodeType.FILE, "7/no-id.txt", "txt"),
                file(1L, FileNodeType.FILE, "7/a-copy.txt", "txt")
        ));

        assertThat(fileIds).containsExactly(1L);
    }

    @Test
    void normalizesObjectKeys() {
        assertThat(FileObjectRemovalRules.normalizeObjectKeys(List.of(
                " a ",
                "",
                "a",
                "b",
                "   "
        ))).containsExactly("a", "b");
        assertThat(FileObjectRemovalRules.normalizeObjectKeys(null)).isEmpty();
    }

    private static FileInfo file(Long idx, FileNodeType nodeType, String objectKey, String format) {
        return FileInfo.builder()
                .idx(idx)
                .nodeType(nodeType)
                .fileOriginName(idx + "." + format)
                .fileSaveName(idx + "." + format)
                .fileSavePath(objectKey)
                .fileFormat(format)
                .build();
    }
}
