package com.example.WaffleBear.file.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class FileTreeRules {

    private FileTreeRules() {
    }

    static FileNodeType resolveNodeType(FileInfo entity) {
        return entity.getNodeType() == null ? FileNodeType.FILE : entity.getNodeType();
    }

    static List<FileInfo> collectTargetTree(FileInfo target, Collection<FileInfo> userFiles) {
        Map<Long, List<FileInfo>> childrenByParent = new HashMap<>();
        for (FileInfo file : userFiles == null ? List.<FileInfo>of() : userFiles) {
            Long parentId = file.getParent() != null ? file.getParent().getIdx() : null;
            if (parentId == null) {
                continue;
            }
            childrenByParent.computeIfAbsent(parentId, ignored -> new ArrayList<>()).add(file);
        }

        List<FileInfo> result = new ArrayList<>();
        Set<Long> visited = new HashSet<>();
        ArrayDeque<FileInfo> queue = new ArrayDeque<>();
        queue.add(target);

        while (!queue.isEmpty()) {
            FileInfo current = queue.removeFirst();
            if (current.getIdx() == null || !visited.add(current.getIdx())) {
                continue;
            }

            result.add(current);
            for (FileInfo child : childrenByParent.getOrDefault(current.getIdx(), List.of())) {
                queue.addLast(child);
            }
        }

        return result;
    }

    static List<FileInfo> sortForDelete(Collection<FileInfo> targetTree) {
        List<FileInfo> files = targetTree == null ? List.of() : List.copyOf(targetTree);
        Map<Long, FileInfo> fileById = files.stream()
                .filter(file -> file.getIdx() != null)
                .collect(HashMap::new, (map, file) -> map.put(file.getIdx(), file), HashMap::putAll);

        return files.stream()
                .sorted(Comparator.comparingInt((FileInfo file) -> calculateDepth(file, fileById)).reversed())
                .toList();
    }

    static boolean hasSelectedAncestor(FileInfo file, Set<Long> selectedIds, Map<Long, FileInfo> fileById) {
        FileInfo parent = file.getParent();
        Set<Long> visited = new HashSet<>();

        while (parent != null && parent.getIdx() != null && visited.add(parent.getIdx())) {
            if (selectedIds != null && selectedIds.contains(parent.getIdx())) {
                return true;
            }

            parent = resolveParent(parent, fileById).getParent();
        }

        return false;
    }

    static boolean hasTrashedAncestor(FileInfo file, Map<Long, FileInfo> fileById) {
        FileInfo parent = file.getParent();
        Set<Long> visited = new HashSet<>();

        while (parent != null && parent.getIdx() != null && visited.add(parent.getIdx())) {
            FileInfo resolved = resolveParent(parent, fileById);
            if (resolved.isTrashed()) {
                return true;
            }
            parent = resolved.getParent();
        }

        return false;
    }

    static void ensureNoLockedFileNodes(Collection<FileInfo> files) {
        boolean hasLockedFile = (files == null ? List.<FileInfo>of() : files).stream()
                .anyMatch(file -> resolveNodeType(file) == FileNodeType.FILE && file.isLockedFile());

        if (hasLockedFile) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    private static int calculateDepth(FileInfo file, Map<Long, FileInfo> fileById) {
        int depth = 0;
        Set<Long> visited = new HashSet<>();
        FileInfo current = file.getParent();

        while (current != null && current.getIdx() != null && visited.add(current.getIdx())) {
            depth += 1;
            FileInfo resolved = fileById.get(current.getIdx());
            current = resolved != null ? resolved.getParent() : current.getParent();
        }

        return depth;
    }

    private static FileInfo resolveParent(FileInfo parent, Map<Long, FileInfo> fileById) {
        return fileById == null ? parent : fileById.getOrDefault(parent.getIdx(), parent);
    }
}
