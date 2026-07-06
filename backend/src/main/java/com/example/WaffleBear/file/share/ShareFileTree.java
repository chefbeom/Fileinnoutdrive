package com.example.WaffleBear.file.share;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class ShareFileTree {

    private ShareFileTree() {
    }

    static Map<Long, List<FileInfo>> groupChildrenByParentId(Collection<FileInfo> userFiles) {
        Map<Long, List<FileInfo>> childrenByParentId = new LinkedHashMap<>();
        for (FileInfo file : userFiles == null ? List.<FileInfo>of() : userFiles) {
            if (file == null || file.getParent() == null || file.getParent().getIdx() == null) {
                continue;
            }
            childrenByParentId
                    .computeIfAbsent(file.getParent().getIdx(), ignored -> new ArrayList<>())
                    .add(file);
        }
        return childrenByParentId;
    }

    static List<FileInfo> collectShareableTree(FileInfo root, Map<Long, List<FileInfo>> childrenByParentId) {
        Map<Long, FileInfo> expandedTargets = new LinkedHashMap<>();
        collectShareableTree(root, safeChildren(childrenByParentId), expandedTargets);
        return new ArrayList<>(expandedTargets.values());
    }

    static List<FileInfo> collectRevocableShareTree(FileInfo root, Map<Long, List<FileInfo>> childrenByParentId) {
        Map<Long, FileInfo> expandedTargets = new LinkedHashMap<>();
        collectRevocableShareTree(root, safeChildren(childrenByParentId), expandedTargets);
        return new ArrayList<>(expandedTargets.values());
    }

    static List<FileInfo> collectTrashTree(FileInfo root, Map<Long, List<FileInfo>> childrenByParentId) {
        Map<Long, FileInfo> targetTreeById = new LinkedHashMap<>();
        collectTrashTree(root, safeChildren(childrenByParentId), targetTreeById);
        return new ArrayList<>(targetTreeById.values());
    }

    static void ensureShareableNode(FileInfo file) {
        FileNodeType nodeType = file != null ? resolveNodeType(file) : null;
        boolean shareableNodeType = nodeType == FileNodeType.FILE || nodeType == FileNodeType.FOLDER;
        if (file == null || file.isTrashed() || file.isLockedFile() || !shareableNodeType) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    static void ensureNoLockedFileNodes(Collection<FileInfo> files) {
        boolean hasLockedFile = (files == null ? List.<FileInfo>of() : files).stream()
                .anyMatch(file -> file != null && resolveNodeType(file) == FileNodeType.FILE && file.isLockedFile());

        if (hasLockedFile) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    static FileNodeType resolveNodeType(FileInfo entity) {
        return entity.getNodeType() == null ? FileNodeType.FILE : entity.getNodeType();
    }

    private static void collectShareableTree(
            FileInfo file,
            Map<Long, List<FileInfo>> childrenByParentId,
            Map<Long, FileInfo> expandedTargets
    ) {
        ensureShareableNode(file);
        expandedTargets.putIfAbsent(file.getIdx(), file);

        if (resolveNodeType(file) != FileNodeType.FOLDER) {
            return;
        }

        for (FileInfo child : childrenByParentId.getOrDefault(file.getIdx(), List.of())) {
            if (child == null || child.isTrashed() || child.isLockedFile()) {
                continue;
            }
            collectShareableTree(child, childrenByParentId, expandedTargets);
        }
    }

    private static void collectRevocableShareTree(
            FileInfo file,
            Map<Long, List<FileInfo>> childrenByParentId,
            Map<Long, FileInfo> expandedTargets
    ) {
        FileNodeType nodeType = file != null ? resolveNodeType(file) : null;
        if (file == null || file.getIdx() == null || (nodeType != FileNodeType.FILE && nodeType != FileNodeType.FOLDER)) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        expandedTargets.putIfAbsent(file.getIdx(), file);

        if (nodeType != FileNodeType.FOLDER) {
            return;
        }

        for (FileInfo child : childrenByParentId.getOrDefault(file.getIdx(), List.of())) {
            collectRevocableShareTree(child, childrenByParentId, expandedTargets);
        }
    }

    private static void collectTrashTree(
            FileInfo file,
            Map<Long, List<FileInfo>> childrenByParentId,
            Map<Long, FileInfo> targetTreeById
    ) {
        if (file == null || file.getIdx() == null || file.isTrashed()) {
            return;
        }

        FileNodeType nodeType = resolveNodeType(file);
        if (nodeType != FileNodeType.FILE && nodeType != FileNodeType.FOLDER) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        targetTreeById.putIfAbsent(file.getIdx(), file);

        if (nodeType != FileNodeType.FOLDER) {
            return;
        }

        for (FileInfo child : childrenByParentId.getOrDefault(file.getIdx(), List.of())) {
            collectTrashTree(child, childrenByParentId, targetTreeById);
        }
    }

    private static Map<Long, List<FileInfo>> safeChildren(Map<Long, List<FileInfo>> childrenByParentId) {
        return childrenByParentId == null ? Map.of() : childrenByParentId;
    }
}
