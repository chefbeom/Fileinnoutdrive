import argparse
import unittest

from fileinnout_desktop_models import DesktopError
from fileinnout_desktop_sharing import (
    build_pending_share_tree,
    find_shared_item_by_rel,
    normalize_recipient_emails,
    resolve_pending_share,
    resolve_pending_share_id,
)


class FakeShareApi:
    def __init__(self, pending_items):
        self._pending_items = pending_items

    def list_pending_shares(self):
        return list(self._pending_items)


class DesktopSharingHelperTest(unittest.TestCase):
    def test_normalize_recipient_emails_accepts_csv_and_list_values(self) -> None:
        self.assertEqual(
            normalize_recipient_emails([" Alice@example.com, bob@example.com ", "alice@EXAMPLE.com", ""]),
            ["Alice@example.com", "bob@example.com"],
        )

        with self.assertRaises(DesktopError):
            normalize_recipient_emails(["", " , "])

    def test_find_shared_item_by_rel_matches_exact_and_unique_tail_paths(self) -> None:
        team = {"idx": 1}
        nested = {"idx": 2}
        paths = {
            "Shared/owner@example.com/Team": team,
            "Shared/owner@example.com/Archive/Reports": nested,
        }

        self.assertEqual(find_shared_item_by_rel(paths, "Shared/owner@example.com/Team"), ("Shared/owner@example.com/Team", team))
        self.assertEqual(
            find_shared_item_by_rel(paths, "Shared/OWNER@example.com/reports"),
            ("Shared/owner@example.com/Archive/Reports", nested),
        )
        self.assertIsNone(find_shared_item_by_rel(paths, "Team"))

    def test_find_shared_item_by_rel_rejects_ambiguous_tail_matches(self) -> None:
        paths = {
            "Shared/owner@example.com/A/Reports": {"idx": 1},
            "Shared/owner@example.com/B/Reports": {"idx": 2},
        }

        self.assertIsNone(find_shared_item_by_rel(paths, "Shared/owner@example.com/Reports"))

    def test_build_pending_share_tree_groups_by_owner_and_skips_trashed_items(self) -> None:
        folder = {"idx": 10, "fileOriginName": "Team", "nodeType": "FOLDER", "ownerEmail": "owner@example.com"}
        child = {"idx": 11, "parentId": 10, "fileOriginName": "Plan.txt", "nodeType": "FILE", "ownerEmail": "owner@example.com"}
        trashed = {"idx": 12, "fileOriginName": "Trash.txt", "ownerEmail": "owner@example.com", "trashed": True}
        tree = build_pending_share_tree(FakeShareApi([child, folder, trashed]))

        self.assertIs(tree["Shared/owner@example.com/Team"], folder)
        self.assertIs(tree["Shared/owner@example.com/Team/Plan.txt"], child)
        self.assertNotIn("Shared/owner@example.com/Trash.txt", tree)

    def test_resolve_pending_share_supports_id_and_path_selection(self) -> None:
        folder = {"idx": 10, "fileOriginName": "Team", "nodeType": "FOLDER", "ownerEmail": "owner@example.com"}
        api = FakeShareApi([folder])

        self.assertEqual(
            resolve_pending_share(api, argparse.Namespace(id=None, path="Shared/owner@example.com/Team")),
            (10, "Shared/owner@example.com/Team", folder),
        )
        self.assertEqual(
            resolve_pending_share(api, argparse.Namespace(id=10, path="")),
            (10, "Shared/owner@example.com/Team", folder),
        )
        self.assertEqual(
            resolve_pending_share_id(api, argparse.Namespace(id=999, path="")),
            (999, "id=999"),
        )

        with self.assertRaises(DesktopError):
            resolve_pending_share(api, argparse.Namespace(id=None, path=""))


if __name__ == "__main__":
    unittest.main()
