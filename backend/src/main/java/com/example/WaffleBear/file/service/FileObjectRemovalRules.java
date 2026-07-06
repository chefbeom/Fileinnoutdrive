package com.example.WaffleBear.file.service;

import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import static com.example.WaffleBear.file.util.FileContentUtils.buildThumbnailObjectKey;
import static com.example.WaffleBear.file.util.FileContentUtils.isVideoFile;

final class FileObjectRemovalRules {

    private FileObjectRemovalRules() {
    }

    static List<String> collectObjectKeysForRemoval(
            List<FileInfo> files,
            List<String> versionObjectKeys
    ) {
        List<String> objectKeys = new ArrayList<>();
        if (files != null) {
            files.stream()
                    .filter(FileObjectRemovalRules::isFileNode)
                    .flatMap(file -> buildFileObjectKeysForRemoval(file).stream())
                    .forEach(objectKeys::add);
        }
        if (versionObjectKeys != null) {
            objectKeys.addAll(versionObjectKeys);
        }
        return normalizeObjectKeys(objectKeys);
    }

    static List<Long> collectFileIds(List<FileInfo> files) {
        if (files == null) {
            return List.of();
        }
        return files.stream()
                .filter(FileObjectRemovalRules::isFileNode)
                .map(FileInfo::getIdx)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }

    static List<String> normalizeObjectKeys(List<String> objectKeys) {
        if (objectKeys == null) {
            return List.of();
        }
        return objectKeys.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(path -> !path.isBlank())
                .distinct()
                .toList();
    }

    private static List<String> buildFileObjectKeysForRemoval(FileInfo entity) {
        List<String> objectKeys = new ArrayList<>();
        String fileObjectKey = entity.getFileSavePath();
        if (fileObjectKey != null && !fileObjectKey.isBlank()) {
            objectKeys.add(fileObjectKey);
            if (isVideoFile(entity.getFileFormat())) {
                objectKeys.add(buildThumbnailObjectKey(fileObjectKey));
            }
        }
        return objectKeys;
    }

    private static boolean isFileNode(FileInfo file) {
        if (file == null) {
            return false;
        }
        FileNodeType nodeType = file.getNodeType() == null ? FileNodeType.FILE : file.getNodeType();
        return nodeType == FileNodeType.FILE;
    }
}
