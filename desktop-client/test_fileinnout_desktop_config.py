from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import fileinnout_desktop_config as config_helpers


class DesktopConfigHelperTest(unittest.TestCase):
    def test_account_key_and_default_sync_dir(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.json"
            with patch.object(config_helpers, "GLOBAL_CONFIG_PATH", config_path):
                self.assertEqual(config_helpers.account_key(" User@Example.COM "), "user@example.com")
                self.assertEqual(
                    config_helpers.account_default_sync_dir("User+Team@Example.COM"),
                    str(Path(temp_dir) / "accounts" / "user%2Bteam%40example.com" / "sync"),
                )

    def test_snapshot_account_profile_uses_deep_copy(self) -> None:
        config = {
            "email": "admin@example.com",
            "syncDir": "C:/sync",
            "driveLetter": "X:",
            "syncFolders": [{"id": 1}],
        }

        config_helpers.snapshot_account_profile(config)
        config["syncFolders"][0]["id"] = 2

        profile = config["accounts"]["admin@example.com"]
        self.assertEqual(profile["syncDir"], "C:/sync")
        self.assertEqual(profile["syncFolders"], [{"id": 1}])

    def test_apply_account_profile_restores_sync_fields_without_tokens(self) -> None:
        config = {
            "email": "admin@example.com",
            "syncDir": "C:/old",
            "token": "current-token",
            "accounts": {
                "admin@example.com": {
                    "syncDir": "D:/drive",
                    "driveLetter": "Z:",
                    "token": "stored-token",
                    "refreshToken": "stored-refresh",
                }
            },
        }

        result = config_helpers.apply_account_profile(config, include_tokens=False)

        self.assertIs(result, config)
        self.assertEqual(result["syncDir"], "D:/drive")
        self.assertEqual(result["driveLetter"], "Z:")
        self.assertEqual(result["token"], "current-token")
        self.assertNotEqual(result["token"], "stored-token")

    def test_apply_account_profile_sets_isolated_default_for_new_account(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.json"
            config = {"email": "new@example.com", "syncDir": "C:/old"}
            with patch.object(config_helpers, "GLOBAL_CONFIG_PATH", config_path):
                config_helpers.apply_account_profile(config)

            self.assertEqual(
                config["syncDir"],
                str(Path(temp_dir) / "accounts" / "new%40example.com" / "sync"),
            )

    def test_read_json_accepts_utf8_bom_and_write_json_is_atomic(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "nested" / "config.json"
            config_helpers.write_json(path, {"name": "파일"})
            self.assertEqual(config_helpers.read_json(path, {}), {"name": "파일"})

            path.write_text('\ufeff{"ok": true}', encoding="utf-8")
            self.assertEqual(config_helpers.read_json(path, {}), {"ok": True})


if __name__ == "__main__":
    unittest.main()