package com.example.WaffleBear.file.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.user.model.User;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FileTreeRulesTest {

    @Test
    void collectTargetTreeReturnsRootAndDescendantsBreadthFirst() {
        User owner = user(1L);
        FileInfo folder = folder(10L, owner, null, "Team", false, false);
        FileInfo childFolder = folder(11L, owner, folder, "Docs", false, false);
        FileInfo childFile = file(12L, owner, folder, "root.txt", false, false);
        FileInfo nestedFile = file(13L, owner, childFolder, "nested.txt", false, false);

        var tree = FileTreeRules.collectTargetTree(folder, List.of(folder, childFolder, childFile, nestedFile));

        assertThat(tree).containsExactly(folder, childFolder, childFile, nestedFile);
    }

    @Test
    void sortForDeleteOrdersChildrenBeforeParents() {
        User owner = user(1L);
        FileInfo folder = folder(10L, owner, null, "Team", false, false);
        FileInfo childFolder = folder(11L, owner, folder, "Docs", false, false);
        FileInfo nestedFile = file(12L, owner, childFolder, "nested.txt", false, false);

        var sorted = FileTreeRules.sortForDelete(List.of(folder, childFolder, nestedFile));

        assertThat(sorted).containsExactly(nestedFile, childFolder, folder);
    }

    @Test
    void hasSelectedAncestorDetectsNestedSelectedParent() {
        User owner = user(1L);
        FileInfo folder = folder(10L, owner, null, "Team", false, false);
        FileInfo child = file(11L, owner, folder, "report.txt", false, false);
        Map<Long, FileInfo> fileById = new HashMap<>();
        fileById.put(folder.getIdx(), folder);
        fileById.put(child.getIdx(), child);

        assertThat(FileTreeRules.hasSelectedAncestor(child, Set.of(folder.getIdx()), fileById)).isTrue();
        assertThat(FileTreeRules.hasSelectedAncestor(folder, Set.of(child.getIdx()), fileById)).isFalse();
    }

    @Test
    void hasTrashedAncestorDetectsDeletedParent() {
        User owner = user(1L);
        FileInfo trashedFolder = folder(10L, owner, null, "Team", false, true);
        FileInfo child = file(11L, owner, trashedFolder, "report.txt", false, false);
        Map<Long, FileInfo> fileById = Map.of(trashedFolder.getIdx(), trashedFolder, child.getIdx(), child);

        assertThat(FileTreeRules.hasTrashedAncestor(child, fileById)).isTrue();
    }

    @Test
    void ensureNoLockedFileNodesRejectsLockedFilesButAllowsLockedFolders() {
        User owner = user(1L);
        FileInfo lockedFolder = folder(10L, owner, null, "Team", true, false);
        FileInfo lockedFile = file(11L, owner, lockedFolder, "secret.txt", true, false);

        FileTreeRules.ensureNoLockedFileNodes(List.of(lockedFolder));

        assertThatThrownBy(() -> FileTreeRules.ensureNoLockedFileNodes(List.of(lockedFile)))
                .isInstanceOf(BaseException.class);
    }

    @Test
    void resolveNodeTypeDefaultsMissingTypeToFile() {
        FileInfo legacy = FileInfo.builder()
                .idx(20L)
                .user(user(1L))
                .fileOriginName("legacy")
                .fileFormat("txt")
                .fileSaveName("legacy")
                .trashed(false)
                .build();

        assertThat(FileTreeRules.resolveNodeType(legacy)).isEqualTo(FileNodeType.FILE);
    }

    private static User user(Long idx) {
        return User.builder()
                .idx(idx)
                .email("user" + idx + "@example.com")
                .name("User " + idx)
                .role("ROLE_USER")
                .enable(true)
                .build();
    }

    private static FileInfo folder(Long idx, User owner, FileInfo parent, String name, boolean locked, boolean trashed) {
        return FileInfo.builder()
                .idx(idx)
                .user(owner)
                .parent(parent)
                .nodeType(FileNodeType.FOLDER)
                .fileOriginName(name)
                .fileFormat("folder")
                .fileSaveName(name)
                .lockedFile(locked)
                .sharedFile(false)
                .trashed(trashed)
                .build();
    }

    private static FileInfo file(Long idx, User owner, FileInfo parent, String name, boolean locked, boolean trashed) {
        return FileInfo.builder()
                .idx(idx)
                .user(owner)
                .parent(parent)
                .nodeType(FileNodeType.FILE)
                .fileOriginName(name)
                .fileFormat("txt")
                .fileSaveName(name)
                .fileSavePath(owner.getIdx() + "/" + name)
                .fileSize(128L)
                .lockedFile(locked)
                .sharedFile(false)
                .trashed(trashed)
                .build();
    }
}
