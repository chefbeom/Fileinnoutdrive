package com.example.WaffleBear.file.service;

import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import org.springframework.http.ContentDisposition;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import static com.example.WaffleBear.file.util.FileContentUtils.resolveDownloadContentType;
import static com.example.WaffleBear.file.util.FileContentUtils.sanitizeDownloadFileName;

final class FileDownloadRules {

    private FileDownloadRules() {
    }

    static String downloadFileName(String preferredName, String fallbackName) {
        return sanitizeDownloadFileName(preferredName, fallbackName);
    }

    static String downloadContentType(String fileName) {
        return resolveDownloadContentType(fileName);
    }

    static Map<String, String> attachmentQueryParams(String fileName, String contentType) {
        Map<String, String> queryParams = new HashMap<>();
        queryParams.put(
                "response-content-disposition",
                ContentDisposition.attachment()
                        .filename(fileName, StandardCharsets.UTF_8)
                        .build()
                        .toString()
        );
        queryParams.put("response-content-type", resolveDownloadContentType(fileName));
        if (contentType != null && !contentType.isBlank()) {
            queryParams.put("response-content-type", contentType);
        }
        return queryParams;
    }

    static boolean canGeneratePresignedDownloadUrl(FileCommonDto.FileListItemRes item) {
        if (item == null || Boolean.TRUE.equals(item.getLockedFile())) {
            return false;
        }
        if (parseNodeType(item.getNodeType()) != FileNodeType.FILE) {
            return false;
        }
        String objectKey = item.getFileSavePath();
        return objectKey != null && !objectKey.isBlank();
    }

    static FileInfo toFileInfoUrlSnapshot(FileCommonDto.FileListItemRes item) {
        return FileInfo.builder()
                .idx(item.getIdx())
                .nodeType(parseNodeType(item.getNodeType()))
                .fileOriginName(item.getFileOriginName())
                .fileSaveName(item.getFileSaveName())
                .fileSavePath(item.getFileSavePath())
                .fileFormat(item.getFileFormat())
                .fileSize(item.getFileSize())
                .lockedFile(Boolean.TRUE.equals(item.getLockedFile()))
                .sharedFile(Boolean.TRUE.equals(item.getSharedFile()))
                .trashed(Boolean.TRUE.equals(item.getTrashed()))
                .build();
    }

    static FileNodeType parseNodeType(String nodeType) {
        try {
            return nodeType == null ? FileNodeType.FILE : FileNodeType.valueOf(nodeType);
        } catch (IllegalArgumentException exception) {
            return FileNodeType.FILE;
        }
    }
}
