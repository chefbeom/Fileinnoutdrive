import os
from pathlib import Path
import tempfile
import time
import unittest

from fileinnout_desktop_models import DesktopError, SyncStats
from fileinnout_desktop_state import (
    acquire_sync_lock,
    describe_sync_lock,
    load_state,
    release_sync_lock,
    root_lock_path,
    root_state_path,
    save_state,
    stats_to_dict,
    sync_lock,
    update_sync_status,
)


class DesktopStateHelperTest(unittest.TestCase):
    def test_load_and_save_state_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)

            state = load_state(root)
            self.assertEqual(state["local"], {})
            self.assertEqual(state["localFolders"], [])
            self.assertEqual(state["remote"], {})
            self.assertEqual(state["syncActivity"], [])
            self.assertIsNone(state["lastSync"])

            state["local"] = {"a.txt": {"size": 1}}
            save_state(root, state)

            saved = load_state(root)
            self.assertEqual(saved["local"], {"a.txt": {"size": 1}})
            self.assertIsInstance(saved["lastSync"], int)
            self.assertTrue(root_state_path(root).exists())

    def test_stats_to_dict_trims_conflict_history(self) -> None:
        conflicts = [{"path": f"file-{index}.txt"} for index in range(30)]

        payload = stats_to_dict(
            SyncStats(
                pulled=1,
                pushed=2,
                deleted=3,
                folders_created=4,
                skipped_dirty=5,
                download_failed=6,
                conflicts=conflicts,
            )
        )

        self.assertEqual(payload["pulled"], 1)
        self.assertEqual(payload["pushed"], 2)
        self.assertEqual(payload["deleted"], 3)
        self.assertEqual(payload["foldersCreated"], 4)
        self.assertEqual(payload["skippedDirty"], 5)
        self.assertEqual(payload["downloadFailed"], 6)
        self.assertEqual(len(payload["conflicts"]), 25)
        self.assertEqual(payload["conflicts"][0], {"path": "file-5.txt"})

    def test_update_sync_status_keeps_recent_activity_first(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)

            update_sync_status(root, "success", pull_stats=SyncStats(pulled=2))
            update_sync_status(root, "error", error="simulated")

            state = load_state(root)
            self.assertEqual(state["syncStatus"]["status"], "error")
            self.assertEqual(state["syncStatus"]["error"], "simulated")
            self.assertEqual(state["syncActivity"][0]["status"], "error")
            self.assertEqual(state["syncActivity"][1]["pull"]["pulled"], 2)

    def test_sync_lock_lifecycle_and_stale_replacement(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)

            lock_path = acquire_sync_lock(root)
            self.assertTrue(lock_path.exists())
            self.assertTrue(describe_sync_lock(root).startswith("active"))
            with self.assertRaises(DesktopError):
                acquire_sync_lock(root)
            release_sync_lock(lock_path)
            self.assertFalse(lock_path.exists())

            stale_lock = root_lock_path(root)
            stale_lock.parent.mkdir(parents=True, exist_ok=True)
            stale_lock.write_text('{"pid": 999999999, "createdAt": 1}', encoding="utf-8")
            old_time = time.time() - 3600
            os.utime(stale_lock, (old_time, old_time))

            replacement_lock = acquire_sync_lock(root, stale_seconds=1)
            self.assertTrue(replacement_lock.exists())
            release_sync_lock(replacement_lock)

    def test_sync_lock_context_releases_lock(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)

            with sync_lock(root):
                self.assertTrue(root_lock_path(root).exists())

            self.assertFalse(root_lock_path(root).exists())


if __name__ == "__main__":
    unittest.main()
