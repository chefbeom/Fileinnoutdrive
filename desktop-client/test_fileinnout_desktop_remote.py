import unittest

from fileinnout_desktop_remote import (
    build_item_paths,
    build_remote_tree,
    file_id,
    is_downloadable_shared_item,
    is_readable_shared_item,
    is_uploadable_shared_item,
    is_writable_shared_item,
    item_name,
    node_type,
    parent_id,
    remote_changed_since_state,
    remote_id_matches_previous,
    remote_state_snapshot,
)


class FakeRemoteApi:
    def __init__(self, owned_items, shared_items):
        self._owned_items = owned_items
        self._shared_items = shared_items

    def list_owned(self):
        return list(self._owned_items)

    def list_shared(self):
        return list(self._shared_items)


class DesktopRemoteHelperTest(unittest.TestCase):
    def test_item_identity_and_name_helpers_are_tolerant(self) -> None:
        self.assertEqual(file_id({"idx": "42"}), 42)
        self.assertEqual(file_id({"id": 7}), 7)
        self.assertIsNone(file_id({"idx": "bad"}))
        self.assertEqual(parent_id({"parentId": "11"}), 11)
        self.assertIsNone(parent_id({"parentId": "bad"}))
        self.assertEqual(node_type({}), "FILE")
        self.assertEqual(node_type({"nodeType": "folder"}), "FOLDER")
        self.assertEqual(item_name({"fileOriginName": r'bad<>:"\|?*name. '}), "bad________name")

    def test_build_item_paths_resolves_parents_and_duplicate_names(self) -> None:
        root = {"idx": 1, "fileOriginName": "Team", "nodeType": "FOLDER"}
        doc = {"idx": 2, "parentId": 1, "fileOriginName": "Plan.txt", "nodeType": "FILE"}
        duplicate = {"idx": 3, "parentId": 1, "fileOriginName": "Plan.txt", "nodeType": "FILE"}
        paths = build_item_paths([doc, duplicate, root])

        self.assertIs(paths["Team"], root)
        self.assertIs(paths["Team/Plan.txt"], doc)
        self.assertIs(paths["Team/Plan (3).txt"], duplicate)

    def test_build_remote_tree_groups_shared_items_under_owner(self) -> None:
        owned = [
            {"idx": 1, "fileOriginName": "Owned", "nodeType": "FOLDER"},
            {"idx": 2, "fileOriginName": "Trash", "nodeType": "FILE", "trashed": True},
        ]
        shared = [
            {"idx": 10, "fileOriginName": "SharedTeam", "nodeType": "FOLDER", "ownerEmail": "owner@example.com"},
            {"idx": 11, "parentId": 10, "fileOriginName": "Notes.txt", "nodeType": "FILE", "ownerEmail": "owner@example.com"},
        ]
        tree = build_remote_tree(FakeRemoteApi(owned, shared), include_shared=True)

        self.assertIn("Owned", tree)
        self.assertNotIn("Trash", tree)
        self.assertFalse(tree["Owned"]["_sharedWithMe"])
        self.assertTrue(tree["Shared/owner@example.com/SharedTeam"]["_sharedWithMe"])
        self.assertTrue(tree["Shared/owner@example.com/SharedTeam/Notes.txt"]["_sharedWithMe"])

    def test_shared_permission_helpers_and_snapshots(self) -> None:
        read_item = {"idx": 5, "nodeType": "FILE", "permission": "READ", "fileSize": "9", "lastModifyDate": "t1", "_sharedWithMe": True}
        upload_item = {"idx": 6, "nodeType": "FILE", "permission": "UPLOAD", "fileSize": 1, "lastModifyDate": "t2"}
        write_item = {"idx": 7, "nodeType": "FILE", "permission": "WRITE", "fileSize": 1, "lastModifyDate": "t3"}
        pending_item = {"idx": 8, "nodeType": "FILE", "permission": "WRITE", "shareStatus": "PENDING"}

        self.assertTrue(is_readable_shared_item(read_item))
        self.assertFalse(is_downloadable_shared_item(read_item))
        self.assertTrue(is_uploadable_shared_item(upload_item))
        self.assertFalse(is_downloadable_shared_item(upload_item))
        self.assertTrue(is_writable_shared_item(write_item))
        self.assertFalse(is_writable_shared_item(pending_item))

        snapshot = remote_state_snapshot(read_item)
        self.assertEqual(snapshot["id"], 5)
        self.assertEqual(snapshot["size"], 9)
        self.assertTrue(snapshot["sharedWithMe"])
        self.assertTrue(snapshot["readable"])
        self.assertFalse(snapshot["downloadable"])

    def test_remote_state_change_and_id_matching(self) -> None:
        item = {"idx": 2, "nodeType": "FILE", "fileSize": 10, "lastModifyDate": "v1"}
        state = {"remote": {"Team/file.txt": remote_state_snapshot(item)}}

        self.assertFalse(remote_changed_since_state(state, "Team/file.txt", dict(item)))
        self.assertTrue(remote_changed_since_state(state, "Team/file.txt", {**item, "fileSize": 11}))
        self.assertFalse(remote_changed_since_state(state, "Team/folder", {"idx": 3, "nodeType": "FOLDER"}))
        self.assertTrue(remote_id_matches_previous(state, "Team/file.txt", {"idx": "2"}))
        self.assertFalse(remote_id_matches_previous(state, "Team/file.txt", {"idx": "3"}))


if __name__ == "__main__":
    unittest.main()
