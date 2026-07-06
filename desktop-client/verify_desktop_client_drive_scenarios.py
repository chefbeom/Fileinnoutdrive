#!/usr/bin/env python3
"""Drive-root and Explorer folder scenarios for desktop client verification."""

from __future__ import annotations

from argparse import Namespace
from contextlib import redirect_stdout
import io
import tempfile
from pathlib import Path

import fileinnout_desktop as client


def verify_drive_root_and_folder_scenarios() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        drive_root = base / "drive-root"
        existing_root = base / "Existing"
        direct_root = drive_root / "New Project"
        moved_direct_root = drive_root / client.MY_DRIVE_HUB_NAME / "New Project"
        drive_root.mkdir()
        existing_root.mkdir()
        direct_root.mkdir()
        (drive_root / "root-note.txt").write_text("from drive root", encoding="utf-8")
        (drive_root / "desktop.ini").write_text("ignored", encoding="utf-8")
        (existing_root / "root-note.txt").write_text("already synced", encoding="utf-8")
        config = {
            "driveRoot": str(drive_root),
            "syncFolders": [
                {
                    "name": "Existing",
                    "localPath": str(existing_root),
                    "remotePath": "New Project",
                    "direction": "two-way",
                    "enabled": True,
                }
            ],
        }

        assert client.adopt_drive_root_folders(config)
        profiles = client.configured_sync_folders(config)
        adopted = [profile for profile in profiles if Path(profile["localPath"]) == moved_direct_root.resolve()]
        assert len(adopted) == 1
        assert adopted[0]["name"] == "New Project"
        assert adopted[0]["remotePath"] == "New Project 2"
        assert adopted[0]["direction"] == "two-way"
        assert not direct_root.exists()
        assert moved_direct_root.exists()
        assert (drive_root / client.SHARED_DRIVE_HUB_NAME).is_dir()
        assert not (drive_root / "root-note.txt").exists()
        assert (existing_root / "root-note.txt").read_text(encoding="utf-8") == "already synced"
        assert (existing_root / "root-note (2).txt").read_text(encoding="utf-8") == "from drive root"
        assert (drive_root / "desktop.ini").exists()
        assert client.configured_sync_folders_for_target(config, existing_root / "root-note.txt")[0]["name"] == "Existing"
        assert client.configured_sync_folders_for_target(config, moved_direct_root / "client.txt")[0]["name"] == "New Project"
        assert client.configured_sync_folders_for_target(config, base / "outside.txt") == []
        assert client.target_is_drive_root_path(config, drive_root / client.MY_DRIVE_HUB_NAME)
        config["driveLetter"] = "Q"
        mapped_owned_file = f"Q:\\{client.MY_DRIVE_HUB_NAME}\\New Project\\client.txt"
        assert client.configured_sync_folders_for_target(config, mapped_owned_file)[0]["name"] == "New Project"
        assert client.target_is_drive_root_path(config, f"Q:\\{client.MY_DRIVE_HUB_NAME}")
        config["server"] = "http://desktop.example/api"
        assert client.desktop_web_url(config, drive_root) == "http://desktop.example/main/home"
        assert client.desktop_web_url(config, drive_root / client.MY_DRIVE_HUB_NAME) == "http://desktop.example/main/home"
        assert client.desktop_web_url(config, drive_root / client.SHARED_DRIVE_HUB_NAME) == "http://desktop.example/main/shareFile"
        assert client.desktop_web_url(config, "Q:\\") == "http://desktop.example/main/home"
        assert client.desktop_web_url(config, f"Q:\\{client.SHARED_DRIVE_HUB_NAME}") == "http://desktop.example/main/shareFile"
        web_url = client.desktop_web_url(config, moved_direct_root / "client.txt")
        assert web_url == "http://desktop.example/main/home?desktopPath=New+Project+2%2Fclient.txt"
        mapped_web_url = client.desktop_web_url(config, mapped_owned_file)
        assert mapped_web_url == "http://desktop.example/main/home?desktopPath=New+Project+2%2Fclient.txt"
        adopted_original_web_url = client.desktop_web_url(config, "Q:\\New Project\\client.txt")
        assert adopted_original_web_url == "http://desktop.example/main/home?desktopPath=New+Project+2%2Fclient.txt"
        owned_cloud_target = client.desktop_target_cloud_path(config, mapped_owned_file)
        assert owned_cloud_target is not None
        assert owned_cloud_target[1] == "New Project 2/client.txt"
        assert owned_cloud_target[2] == "client.txt"
        adopted_original_cloud_target = client.desktop_target_cloud_path(config, "Q:\\New Project\\client.txt")
        assert adopted_original_cloud_target is not None
        assert adopted_original_cloud_target[1] == "New Project 2/client.txt"
        assert adopted_original_cloud_target[2] == "client.txt"
        shared_local = drive_root / client.SHARED_DRIVE_HUB_NAME / "owner@example.com" / "Team"
        shared_local.mkdir(parents=True)
        (shared_local / "notes.txt").write_text("shared note", encoding="utf-8")
        config["syncFolders"].append(
            {
                "name": "Team",
                "localPath": str(shared_local),
                "remotePath": "Shared/owner@example.com/Team",
                "direction": "two-way",
                "enabled": True,
            }
        )
        shared_web_url = client.desktop_web_url(config, shared_local / "notes.txt")
        assert shared_web_url == "http://desktop.example/main/shareFile?desktopPath=Shared%2Fowner%40example.com%2FTeam%2Fnotes.txt"
        shared_hub_links = dict(client.drive_hub_profile_links(config))
        assert drive_root / client.SHARED_DRIVE_HUB_NAME / "owner@example.com" / "Team" in shared_hub_links
        mapped_shared_web_url = client.desktop_web_url(config, f"Q:\\{client.SHARED_DRIVE_HUB_NAME}\\owner@example.com\\Team\\notes.txt")
        assert mapped_shared_web_url == "http://desktop.example/main/shareFile?desktopPath=Shared%2Fowner%40example.com%2FTeam%2Fnotes.txt"
        legacy_mapped_shared_web_url = client.desktop_web_url(config, f"Q:\\{client.SHARED_DRIVE_HUB_NAME}\\Team\\notes.txt")
        assert legacy_mapped_shared_web_url == "http://desktop.example/main/shareFile?desktopPath=Shared%2Fowner%40example.com%2FTeam%2Fnotes.txt"
        shared_cloud_target = client.desktop_target_cloud_path(config, f"Q:\\{client.SHARED_DRIVE_HUB_NAME}\\owner@example.com\\Team\\notes.txt")
        assert shared_cloud_target is not None
        assert shared_cloud_target[1] == "Shared/owner@example.com/Team/notes.txt"
        assert shared_cloud_target[2] == "notes.txt"
        shared_hub_web_url = client.desktop_web_url(config, drive_root / client.SHARED_DRIVE_HUB_NAME / "owner@example.com")
        assert shared_hub_web_url == "http://desktop.example/main/shareFile?desktopPath=Shared%2Fowner%40example.com"
        mapped_shared_owner_web_url = client.desktop_web_url(config, f"Q:\\{client.SHARED_DRIVE_HUB_NAME}\\owner@example.com")
        assert mapped_shared_owner_web_url == "http://desktop.example/main/shareFile?desktopPath=Shared%2Fowner%40example.com"
        _, root_scope_profiles = client.target_sync_profiles(config, "Q:\\")
        assert {profile["remotePath"] for profile in root_scope_profiles} == {
            "New Project",
            "New Project 2",
            "Shared/owner@example.com/Team",
        }
        _, my_drive_scope_profiles = client.target_sync_profiles(config, f"Q:\\{client.MY_DRIVE_HUB_NAME}")
        assert {profile["remotePath"] for profile in my_drive_scope_profiles} == {"New Project", "New Project 2"}
        _, shared_scope_profiles = client.target_sync_profiles(config, f"Q:\\{client.SHARED_DRIVE_HUB_NAME}")
        assert [profile["remotePath"] for profile in shared_scope_profiles] == ["Shared/owner@example.com/Team"]
        _, owner_scope_profiles = client.target_sync_profiles(config, f"Q:\\{client.SHARED_DRIVE_HUB_NAME}\\owner@example.com")
        assert [profile["remotePath"] for profile in owner_scope_profiles] == ["Shared/owner@example.com/Team"]
        _, direct_owned_scope_profiles = client.target_sync_profiles(config, "Q:\\Loose Project\\draft.txt")
        assert {profile["remotePath"] for profile in direct_owned_scope_profiles} == {"New Project", "New Project 2"}
        _, nested_owned_scope_profiles = client.target_sync_profiles(config, f"Q:\\{client.MY_DRIVE_HUB_NAME}\\Loose Project\\draft.txt")
        assert {profile["remotePath"] for profile in nested_owned_scope_profiles} == {"New Project", "New Project 2"}
        _, nested_owner_scope_profiles = client.target_sync_profiles(config, f"Q:\\{client.SHARED_DRIVE_HUB_NAME}\\owner@example.com\\Manual Folder\\draft.txt")
        assert [profile["remotePath"] for profile in nested_owner_scope_profiles] == ["Shared/owner@example.com/Team"]

        legacy_sync_root = base / "FileInNOut"
        legacy_sync_root.mkdir()
        (legacy_sync_root / "legacy-note.txt").write_text("legacy", encoding="utf-8")
        legacy_config = {
            "server": "http://desktop.example/api",
            "driveRoot": str(drive_root),
            "driveLetter": "Q",
            "syncDir": str(legacy_sync_root),
        }
        legacy_profiles = client.configured_sync_folders(legacy_config)
        assert len(legacy_profiles) == 1
        assert legacy_profiles[0]["remotePath"] == "FileInNOut"
        legacy_mapped_file = f"Q:\\{client.MY_DRIVE_HUB_NAME}\\FileInNOut\\legacy-note.txt"
        assert client.desktop_web_url(legacy_config, legacy_mapped_file) == "http://desktop.example/main/home?desktopPath=FileInNOut%2Flegacy-note.txt"
        legacy_cloud_target = client.desktop_target_cloud_path(legacy_config, legacy_mapped_file)
        assert legacy_cloud_target is not None
        assert legacy_cloud_target[1] == "FileInNOut/legacy-note.txt"
        assert legacy_cloud_target[2] == "legacy-note.txt"

        external_shared_root = base / "External Shared Team"
        external_shared_root.mkdir()
        config["syncFolders"].append(
            {
                "name": "External Team",
                "localPath": str(external_shared_root),
                "remotePath": "Shared/owner2@example.com/External Team",
                "direction": "two-way",
                "enabled": True,
            }
        )

        original_junction_supported = client.drive_hub_junction_supported
        original_create_junction = client.create_directory_junction
        try:
            created_junctions: list[tuple[Path, Path]] = []
            client.drive_hub_junction_supported = lambda: True

            def fake_create_junction(link_path: Path, target_folder: Path) -> bool:
                created_junctions.append((link_path, target_folder))
                link_path.parent.mkdir(parents=True, exist_ok=True)
                return True

            client.create_directory_junction = fake_create_junction
            assert client.sync_drive_hub_links(config)
            assert (drive_root / client.MY_DRIVE_HUB_NAME / "Existing", existing_root.resolve(strict=False)) in created_junctions
            assert (drive_root / client.SHARED_DRIVE_HUB_NAME / "owner2@example.com" / "External Team", external_shared_root.resolve(strict=False)) in created_junctions
        finally:
            client.drive_hub_junction_supported = original_junction_supported
            client.create_directory_junction = original_create_junction
        original_config_path = client.GLOBAL_CONFIG_PATH
        original_legacy_config_path = client.LEGACY_GLOBAL_CONFIG_PATH
        try:
            client.GLOBAL_CONFIG_PATH = base / "appdata" / "config.json"
            client.LEGACY_GLOBAL_CONFIG_PATH = base / "legacy-appdata" / "config.json"
            doctor_config = {
                "server": "http://desktop.example/api",
                "driveRoot": str(drive_root),
                "syncFolders": [
                    {
                        "name": "New Project",
                        "localPath": str(moved_direct_root),
                        "remotePath": "New Project 2",
                        "direction": "two-way",
                        "enabled": True,
                    }
                ],
            }
            client.save_global_config(doctor_config)
            doctor_target_output = io.StringIO()
            with redirect_stdout(doctor_target_output):
                client.cmd_doctor_target(Namespace(
                    target=str(moved_direct_root / "client.txt"),
                    local_only=True,
                    server=None,
                    token=None,
                ))
            output = doctor_target_output.getvalue()
            assert "matched_sync_folders: 1" in output
            assert "sync_folder_1_name: New Project" in output
            assert "sync_folder_1_remote_path: New Project 2" in output
            assert "backend: skipped" in output
        finally:
            client.GLOBAL_CONFIG_PATH = original_config_path
            client.LEGACY_GLOBAL_CONFIG_PATH = original_legacy_config_path
        assert not client.adopt_drive_root_folders(config)

        open_web_config_path = base / "appdata-open-web" / "config.json"
        open_web_legacy_config_path = base / "legacy-open-web" / "config.json"
        open_web_drive_root = base / "drive-root-open-web"
        open_web_direct = open_web_drive_root / "Instant Project"
        open_web_direct.mkdir(parents=True)
        original_config_path = client.GLOBAL_CONFIG_PATH
        original_legacy_config_path = client.LEGACY_GLOBAL_CONFIG_PATH
        try:
            client.GLOBAL_CONFIG_PATH = open_web_config_path
            client.LEGACY_GLOBAL_CONFIG_PATH = open_web_legacy_config_path
            client.save_global_config({
                "server": "http://desktop.example/api",
                "driveRoot": str(open_web_drive_root),
                "driveLetter": "Q",
                "syncFolders": [],
            })
            open_web_output = io.StringIO()
            with redirect_stdout(open_web_output):
                client.cmd_open_web(Namespace(
                    target="Q:\\Instant Project\\draft.txt",
                    print_only=True,
                ))
            assert open_web_output.getvalue().strip() == "http://desktop.example/main/home?desktopPath=Instant+Project%2Fdraft.txt"
            saved_open_web_profiles = client.configured_sync_folders(client.load_global_config())
            assert saved_open_web_profiles[0]["name"] == "Instant Project"
            assert not open_web_direct.exists()
            assert (open_web_drive_root / client.MY_DRIVE_HUB_NAME / "Instant Project").is_dir()
        finally:
            client.GLOBAL_CONFIG_PATH = original_config_path
            client.LEGACY_GLOBAL_CONFIG_PATH = original_legacy_config_path

        hub_drive_root = base / "drive-root-hub"
        my_drive_root = hub_drive_root / client.MY_DRIVE_HUB_NAME
        shared_drive_root = hub_drive_root / client.SHARED_DRIVE_HUB_NAME
        owned_hub_folder = my_drive_root / "Client Work"
        shared_hub_folder = shared_drive_root / "Do Not Adopt"
        expected_shared_owner_dir = shared_drive_root / "owner@example.com"
        expected_shared_link = expected_shared_owner_dir / "Team Share"
        unexpected_shared_owner_item = expected_shared_owner_dir / "Manual Shared Folder"
        default_root = base / "DefaultOwned"
        my_drive_root.mkdir(parents=True)
        shared_hub_folder.mkdir(parents=True)
        expected_shared_link.mkdir(parents=True)
        unexpected_shared_owner_item.mkdir()
        owned_hub_folder.mkdir()
        (my_drive_root / "loose-hub.txt").write_text("hub loose file", encoding="utf-8")
        default_root.mkdir()
        hub_config = {
            "driveRoot": str(hub_drive_root),
            "syncFolders": [
                {
                    "name": "DefaultOwned",
                    "localPath": str(default_root),
                    "remotePath": "DefaultOwned",
                    "direction": "two-way",
                    "enabled": True,
                },
                {
                    "name": "Team Share",
                    "localPath": str(expected_shared_link),
                    "remotePath": "Shared/owner@example.com/Team Share",
                    "direction": "two-way",
                    "enabled": True,
                }
            ],
        }

        assert client.adopt_drive_root_folders(hub_config)
        hub_profiles = client.configured_sync_folders(hub_config)
        owned_profiles = [profile for profile in hub_profiles if Path(profile["localPath"]) == owned_hub_folder.resolve()]
        shared_profiles = [profile for profile in hub_profiles if Path(profile["localPath"]) == shared_hub_folder.resolve()]
        assert len(owned_profiles) == 1
        assert owned_profiles[0]["remotePath"] == "Client Work"
        assert shared_profiles == []
        assert not (my_drive_root / "loose-hub.txt").exists()
        assert (default_root / "loose-hub.txt").read_text(encoding="utf-8") == "hub loose file"
        owned_state = client.load_state(owned_hub_folder)
        owned_state["local"] = {}
        client.save_state(owned_hub_folder, owned_state)
        client.update_sync_status(owned_hub_folder, "success", pull_stats=client.SyncStats(pulled=1))
        default_dirty = default_root / "dirty.txt"
        default_dirty.write_text("needs sync", encoding="utf-8")
        default_state = client.load_state(default_root)
        default_state["local"] = {}
        client.save_state(default_root, default_state)
        client.update_sync_status(default_root, "error", error="simulated")
        blocking_default_link = my_drive_root / "DefaultOwned"
        blocking_default_link.mkdir()
        (blocking_default_link / "desktop.ini").write_text("empty branded folder", encoding="utf-8")
        hub_diag = client.drive_root_diagnostics(hub_drive_root, hub_profiles)
        assert hub_diag["hub_categories"] == 2
        assert hub_diag["my_drive_hub_exists"] is True
        assert hub_diag["shared_drive_hub_exists"] is True
        assert hub_diag["shared_hub_manual_items"] == 2
        assert hub_diag["unconfigured_folders"] == 0
        assert hub_diag["expected_hub_links"] == 3
        assert hub_diag["existing_hub_links"] == 2
        assert hub_diag["missing_hub_links"] == 0
        assert hub_diag["hub_link_conflicts"] == 1
        assert hub_diag["hub_link_targets_missing"] == 0
        assert hub_diag["hub_link_sync_success"] == 1
        assert hub_diag["hub_link_sync_error"] == 1
        assert hub_diag["hub_link_pending_changes"] >= 1
        original_junction_supported = client.drive_hub_junction_supported
        original_create_junction = client.create_directory_junction
        try:
            created_junctions: list[tuple[Path, Path]] = []
            client.drive_hub_junction_supported = lambda: True

            def fake_create_junction(link_path: Path, target_folder: Path) -> bool:
                created_junctions.append((link_path, target_folder))
                return True

            client.create_directory_junction = fake_create_junction
            assert client.sync_drive_hub_links(hub_config)
            assert not blocking_default_link.exists()
            assert (blocking_default_link, default_root.resolve(strict=False)) in created_junctions
        finally:
            client.drive_hub_junction_supported = original_junction_supported
            client.create_directory_junction = original_create_junction

        no_default_drive_root = base / "drive-root-no-default"
        no_default_my_drive = no_default_drive_root / client.MY_DRIVE_HUB_NAME
        no_default_my_drive.mkdir(parents=True)
        loose_top_file = no_default_my_drive / "top-note.txt"
        loose_top_file.write_text("top file", encoding="utf-8")
        no_default_config = {
            "driveRoot": str(no_default_drive_root),
            "syncFolders": [],
        }

        assert client.adopt_drive_root_folders(no_default_config)
        no_default_profiles = client.configured_sync_folders(no_default_config)
        root_file_profiles = [
            profile
            for profile in no_default_profiles
            if profile["name"] == client.ROOT_FILE_SYNC_FOLDER_NAME
        ]
        assert len(root_file_profiles) == 1
        root_file_profile_path = Path(root_file_profiles[0]["localPath"])
        assert root_file_profiles[0]["remotePath"] == client.ROOT_FILE_SYNC_FOLDER_NAME
        assert root_file_profiles[0]["direction"] == "two-way"
        assert not loose_top_file.exists()
        assert (root_file_profile_path / "top-note.txt").read_text(encoding="utf-8") == "top file"

        offline_config_path = base / "appdata-offline-drive" / "config.json"
        offline_legacy_config_path = base / "legacy-offline-drive" / "config.json"
        offline_drive_root = base / "drive-root-offline"
        offline_folder = offline_drive_root / "Offline Project"
        offline_folder.mkdir(parents=True)
        original_config_path = client.GLOBAL_CONFIG_PATH
        original_legacy_config_path = client.LEGACY_GLOBAL_CONFIG_PATH
        original_make_api = client.make_api
        try:
            client.GLOBAL_CONFIG_PATH = offline_config_path
            client.LEGACY_GLOBAL_CONFIG_PATH = offline_legacy_config_path
            client.save_global_config({
                "driveRoot": str(offline_drive_root),
                "syncFolders": [],
            })
            client.make_api = lambda args: (_ for _ in ()).throw(client.DesktopError("not logged in"))
            try:
                client.cmd_sync_configured(Namespace(
                    lock_stale_seconds=1,
                    server=None,
                    token=None,
                    owned_only=False,
                ))
                raise AssertionError("sync-configured should fail when login is missing")
            except client.DesktopError as error:
                assert "not logged in" in str(error)

            saved_profiles = client.configured_sync_folders(client.load_global_config())
            moved_offline_folder = offline_drive_root / client.MY_DRIVE_HUB_NAME / "Offline Project"
            assert len(saved_profiles) == 1
            assert saved_profiles[0]["name"] == "Offline Project"
            assert saved_profiles[0]["remotePath"] == "Offline Project"
            assert Path(saved_profiles[0]["localPath"]) == moved_offline_folder.resolve(strict=False)
            assert not offline_folder.exists()
            assert moved_offline_folder.exists()
        finally:
            client.GLOBAL_CONFIG_PATH = original_config_path
            client.LEGACY_GLOBAL_CONFIG_PATH = original_legacy_config_path
            client.make_api = original_make_api

        add_config_path = base / "appdata-add-folder" / "config.json"
        add_legacy_config_path = base / "legacy-add-folder" / "config.json"
        add_root = base / "Explorer Added"
        add_child = add_root / "nested"
        add_file = add_root / "seed.txt"
        sync_now_root = base / "Explorer Sync Now"
        add_child.mkdir(parents=True)
        add_file.write_text("seed", encoding="utf-8")
        sync_now_root.mkdir()
        original_config_path = client.GLOBAL_CONFIG_PATH
        original_legacy_config_path = client.LEGACY_GLOBAL_CONFIG_PATH
        original_make_api = client.make_api
        original_sync_profile = client.sync_profile
        try:
            client.GLOBAL_CONFIG_PATH = add_config_path
            client.LEGACY_GLOBAL_CONFIG_PATH = add_legacy_config_path
            add_output = io.StringIO()
            with redirect_stdout(add_output):
                client.cmd_add_sync_folder(Namespace(
                    target=str(add_root),
                    name="",
                    remote_path="",
                    direction="two-way",
                    sync_now=False,
                    lock_stale_seconds=1,
                    server=None,
                    token=None,
                ))
            add_config = client.load_global_config()
            add_profiles = client.configured_sync_folders(add_config)
            assert len(add_profiles) == 1
            assert add_profiles[0]["name"] == "Explorer Added"
            assert add_profiles[0]["remotePath"] == "Explorer Added"
            assert add_profiles[0]["direction"] == "two-way"
            assert Path(add_profiles[0]["localPath"]) == add_root.resolve(strict=False)
            assert "added sync folder" in add_output.getvalue()

            update_output = io.StringIO()
            with redirect_stdout(update_output):
                client.cmd_add_sync_folder(Namespace(
                    target=str(add_file),
                    name="Explorer Parent",
                    remote_path="Explorer Parent Cloud",
                    direction="upload",
                    sync_now=False,
                    lock_stale_seconds=1,
                    server=None,
                    token=None,
                ))
            updated_profiles = client.configured_sync_folders(client.load_global_config())
            assert len(updated_profiles) == 1
            assert updated_profiles[0]["name"] == "Explorer Parent"
            assert updated_profiles[0]["remotePath"] == "Explorer Parent Cloud"
            assert updated_profiles[0]["direction"] == "upload"
            assert "updated sync folder" in update_output.getvalue()

            try:
                client.cmd_add_sync_folder(Namespace(
                    target=str(add_child),
                    name="Nested",
                    remote_path="",
                    direction="two-way",
                    sync_now=False,
                    lock_stale_seconds=1,
                    server=None,
                    token=None,
                ))
                raise AssertionError("nested sync folder should be rejected")
            except client.DesktopError as error:
                assert "overlaps an existing sync folder" in str(error)

            fake_api = object()
            sync_calls: list[tuple[object, str, int]] = []
            client.make_api = lambda args: fake_api

            def fake_sync_profile(api, profile, lock_stale_seconds: int):
                sync_calls.append((api, profile["remotePath"], lock_stale_seconds))
                return client.SyncStats(pushed=1), client.SyncStats(pulled=2)

            client.sync_profile = fake_sync_profile
            sync_now_output = io.StringIO()
            with redirect_stdout(sync_now_output):
                client.cmd_add_sync_folder(Namespace(
                    target=str(sync_now_root),
                    name="Sync Now",
                    remote_path="Sync Now Cloud",
                    direction="two-way",
                    sync_now=True,
                    lock_stale_seconds=7,
                    server=None,
                    token=None,
                ))
            assert sync_calls == [(fake_api, "Sync Now Cloud", 7)]
            assert "push: pulled=0 pushed=1" in sync_now_output.getvalue()
            assert "pull: pulled=2 pushed=0" in sync_now_output.getvalue()
        finally:
            client.GLOBAL_CONFIG_PATH = original_config_path
            client.LEGACY_GLOBAL_CONFIG_PATH = original_legacy_config_path
            client.make_api = original_make_api
            client.sync_profile = original_sync_profile
