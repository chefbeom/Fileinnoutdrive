package com.example.WaffleBear.file.secret;

import com.example.WaffleBear.file.model.FileInfo;

import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class SecretTreeRules {

    private SecretTreeRules() {
    }

    public static Set<Long> collectHiddenOrVaultSubtreeIds(List<FileInfo> files) {
        return collectSubtreeIds(files, true, true);
    }

    public static Set<Long> collectVaultSubtreeIds(List<FileInfo> files) {
        return collectSubtreeIds(files, true, false);
    }

    public static Set<Long> collectHiddenSubtreeIds(List<FileInfo> files) {
        return collectSubtreeIds(files, false, true);
    }

    public static boolean hasHiddenAncestor(FileInfo node) {
        FileInfo cursor = node;
        Set<Long> visited = new HashSet<>();
        while (cursor != null) {
            Long idx = cursor.getIdx();
            if (idx != null && !visited.add(idx)) {
                break;
            }
            if (cursor.isHiddenFolder()) {
                return true;
            }
            cursor = cursor.getParent();
        }
        return false;
    }

    public static boolean hasVaultAncestor(FileInfo node) {
        FileInfo cursor = node;
        Set<Long> visited = new HashSet<>();
        while (cursor != null) {
            Long idx = cursor.getIdx();
            if (idx != null && !visited.add(idx)) {
                break;
            }
            if (cursor.isVaultSpace()) {
                return true;
            }
            cursor = cursor.getParent();
        }
        return false;
    }

    private static Set<Long> collectSubtreeIds(List<FileInfo> files, boolean includeVault, boolean includeHidden) {
        Set<Long> blocked = new HashSet<>();
        if (files == null || files.isEmpty()) {
            return blocked;
        }

        Map<Long, List<FileInfo>> childrenByParent = new HashMap<>();
        ArrayDeque<Long> queue = new ArrayDeque<>();

        for (FileInfo file : files) {
            if (file == null || file.getIdx() == null) {
                continue;
            }
            if (file.getParent() != null && file.getParent().getIdx() != null) {
                childrenByParent
                        .computeIfAbsent(file.getParent().getIdx(), key -> new java.util.ArrayList<>())
                        .add(file);
            }
            boolean matchVault = includeVault && file.isVaultSpace();
            boolean matchHidden = includeHidden && file.isHiddenFolder();
            if ((matchVault || matchHidden) && blocked.add(file.getIdx())) {
                queue.add(file.getIdx());
            }
        }

        while (!queue.isEmpty()) {
            Long currentId = queue.poll();
            List<FileInfo> children = childrenByParent.get(currentId);
            if (children == null) {
                continue;
            }
            for (FileInfo child : children) {
                if (child.getIdx() != null && blocked.add(child.getIdx())) {
                    queue.add(child.getIdx());
                }
            }
        }

        return blocked;
    }
}
