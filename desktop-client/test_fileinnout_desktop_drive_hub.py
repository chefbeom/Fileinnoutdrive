from pathlib import Path
import tempfile
import unittest

from fileinnout_desktop_constants import MY_DRIVE_HUB_NAME, SHARED_DRIVE_HUB_NAME
from fileinnout_desktop_drive_hub import (
    configured_sync_folders_for_target,
    desktop_target_cloud_path,
    desktop_web_url,
    drive_hub_profile_links,
    drive_hub_scope_profiles_for_target,
)


class DesktopDriveHubHelperTest(unittest.TestCase):
    def test_builds_owned_and_shared_hub_links(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            owned = base / "Owned Project"
            shared = base / "Shared Team"
            drive_root = base / "Drive"
            owned.mkdir()
            shared.mkdir()
            config = {
                "frontendUrl": "http://desktop.example",
                "driveRoot": str(drive_root),
                "syncFolders": [
                    {
                        "name": "Owned Project",
                        "localPath": str(owned),
                        "remotePath": "Owned Project",
                        "enabled": True,
                    },
                    {
                        "name": "Team",
                        "localPath": str(shared),
                        "remotePath": "Shared/owner@example.com/Team",
                        "enabled": True,
                    },
                ],
            }

            links = dict(drive_hub_profile_links(config))

            self.assertIn(drive_root / MY_DRIVE_HUB_NAME / "Owned Project", links)
            self.assertIn(drive_root / SHARED_DRIVE_HUB_NAME / "owner@example.com" / "Team", links)

    def test_resolves_targets_to_cloud_paths_and_web_urls(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            owned = base / "Owned Project"
            shared = base / "Shared Team"
            drive_root = base / "Drive"
            owned.mkdir()
            shared.mkdir()
            owned_file = owned / "plan.txt"
            shared_file = shared / "notes.txt"
            owned_file.write_text("plan", encoding="utf-8")
            shared_file.write_text("notes", encoding="utf-8")
            config = {
                "frontendUrl": "http://desktop.example",
                "driveRoot": str(drive_root),
                "syncFolders": [
                    {
                        "name": "Owned Project",
                        "localPath": str(owned),
                        "remotePath": "Owned Project",
                        "enabled": True,
                    },
                    {
                        "name": "Team",
                        "localPath": str(shared),
                        "remotePath": "Shared/owner@example.com/Team",
                        "enabled": True,
                    },
                ],
            }

            owned_target = desktop_target_cloud_path(config, owned_file)
            shared_target = desktop_target_cloud_path(config, shared_file)

            self.assertEqual(owned_target[1], "Owned Project/plan.txt")
            self.assertEqual(shared_target[1], "Shared/owner@example.com/Team/notes.txt")
            self.assertEqual(
                desktop_web_url(config, drive_root / MY_DRIVE_HUB_NAME),
                "http://desktop.example/main/home",
            )
            self.assertEqual(
                desktop_web_url(config, shared_file),
                "http://desktop.example/main/shareFile?desktopPath=Shared%2Fowner%40example.com%2FTeam%2Fnotes.txt",
            )

    def test_finds_sync_scope_from_drive_hub_targets(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            owned = base / "Owned Project"
            shared = base / "Shared Team"
            drive_root = base / "Drive"
            owned.mkdir()
            shared.mkdir()
            config = {
                "driveRoot": str(drive_root),
                "syncFolders": [
                    {"name": "Owned", "localPath": str(owned), "remotePath": "Owned", "enabled": True},
                    {"name": "Team", "localPath": str(shared), "remotePath": "Shared/owner@example.com/Team", "enabled": True},
                ],
            }

            self.assertEqual(
                [profile["name"] for profile in drive_hub_scope_profiles_for_target(config, drive_root)],
                ["Owned", "Team"],
            )
            self.assertEqual(
                configured_sync_folders_for_target(config, drive_root / SHARED_DRIVE_HUB_NAME / "owner@example.com" / "Team")[0]["name"],
                "Team",
            )


if __name__ == "__main__":
    unittest.main()
