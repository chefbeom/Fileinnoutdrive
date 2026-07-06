package com.example.WaffleBear.file.share;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.user.model.User;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ShareFileTreeTest {

    @Test
    void groupChildrenByParentIdSkipsRootAndNullEntries() {
        User owner = user(1L);
        FileInfo folder = folder(10L, owner, null, "Team", false, false);
        FileInfo child = file(11L, owner, folder, "report.txt", false, false);

        var grouped = ShareFileTree.groupChildrenByParentId(List.of(folder, child));

        assertThat(grouped).containsOnlyKeys(folder.getIdx());
        assertThat(grouped.get(folder.getIdx())).containsExactly(child);
    }

    @Test
    void collectShareableTreeSkipsLockedAndTrashedDescendants() {
        User owner = user(1L);
        FileInfo folder = folder(10L, owner, null, "Team", false, false);
        FileInfo openChild = file(11L, owner, folder, "report.txt", false, false);
        FileInfo lockedChild = file(12L, owner, folder, "locked.txt", true, false);
        FileInfo trashedChild = file(13L, owner, folder, "trashed.txt", false, true);
        var childrenByParentId = ShareFileTree.groupChildrenByParentId(List.of(folder, openChild, lockedChild, trashedChild));

        var shareable = ShareFileTree.collectShareableTree(folder, childrenByParentId);

        assertThat(shareable).containsExactly(folder, openChild);
    }

    @Test
    void collectShareableTreeRejectsLockedRoot() {
        FileInfo lockedFolder = folder(10L, user(1L), null, "Team", true, false);

        assertThatThrownBy(() -> ShareFileTree.collectShareableTree(lockedFolder, null))
                .isInstanceOf(BaseException.class);
    }

    @Test
    void collectRevocableShareTreeIncludesLockedChildren() {
        User owner = user(1L);
        FileInfo folder = folder(10L, owner, null, "Team", false, false);
        FileInfo lockedChild = file(11L, owner, folder, "locked.txt", true, false);
        var childrenByParentId = ShareFileTree.groupChildrenByParentId(List.of(folder, lockedChild));

        var revocable = ShareFileTree.collectRevocableShareTree(folder, childrenByParentId);

        assertThat(revocable).containsExactly(folder, lockedChild);
    }

    @Test
    void collectTrashTreeLeavesLockedFileValidationToCaller() {
        User owner = user(1L);
        FileInfo folder = folder(10L, owner, null, "Team", false, false);
        FileInfo lockedChild = file(11L, owner, folder, "locked.txt", true, false);
        var childrenByParentId = ShareFileTree.groupChildrenByParentId(List.of(folder, lockedChild));

        var trashTree = ShareFileTree.collectTrashTree(folder, childrenByParentId);

        assertThat(trashTree).containsExactly(folder, lockedChild);
        assertThatThrownBy(() -> ShareFileTree.ensureNoLockedFileNodes(trashTree))
                .isInstanceOf(BaseException.class);
    }

    @Test
    void resolveNodeTypeDefaultsMissingTypeToFile() {
        FileInfo file = FileInfo.builder()
                .idx(20L)
                .user(user(1L))
                .fileOriginName("legacy")
                .fileFormat("txt")
                .fileSaveName("legacy")
                .trashed(false)
                .build();

        assertThat(ShareFileTree.resolveNodeType(file)).isEqualTo(FileNodeType.FILE);
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
                .sharedFile(true)
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
                .sharedFile(true)
                .trashed(trashed)
                .build();
    }
}
