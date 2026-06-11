#!/usr/bin/env python3
"""Offline checks for the desktop sync client path and state helpers."""

from __future__ import annotations

from contextlib import redirect_stdout
import http.client
import io
import os
import shutil
import stat
import tempfile
from argparse import Namespace
from pathlib import Path

import fileinnout_desktop as client


class FakeSharedApi:
    def __init__(
        self,
        owned_items: list[dict] | None = None,
        shared_items: list[dict] | None = None,
        pending_items: list[dict] | None = None,
    ) -> None:
        self.created_folders: list[tuple[int, str]] = []
        self.uploads: list[tuple[int, str, str]] = []
        self.trashed_owned: list[int] = []
        self.trashed_shared: list[int] = []
        self.moved_owned: list[tuple[int, int | None]] = []
        self.renamed_owned: list[tuple[int, str]] = []
        self.shares: list[tuple[list[int], str, str]] = []
        self.accepted_pending: list[int] = []
        self.rejected_pending: list[int] = []
        self.download_payloads: dict[int, bytes] = {}
        self.downloads: list[tuple[int, bool]] = []
        self.created_owned_folders: list[tuple[int | None, str]] = []
        self.init_uploads: list[dict] = []
        self.complete_uploads: list[dict] = []
        self.presigned_puts: list[tuple[str, int, str]] = []
        self.next_id = 10
        self.owned_items = owned_items if owned_items is not None else []
        self.shared_items = shared_items if shared_items is not None else [
            {
                "idx": 1,
                "fileOriginName": "Team",
                "nodeType": "FOLDER",
                "parentId": None,
                "ownerEmail": "admin@example.com",
                "permission": "WRITE",
                "writable": True,
            }
        ]
        self.pending_items = pending_items if pending_items is not None else []

    def list_owned(self) -> list[dict]:
        return self.owned_items

    def list_shared(self) -> list[dict]:
        return self.shared_items

    def list_pending_shares(self) -> list[dict]:
        return self.pending_items

    def accept_shared_file(self, file_id_value: int) -> dict:
        self.accepted_pending.append(file_id_value)
        self.pending_items = [
            item for item in self.pending_items
            if client.file_id(item) != file_id_value
        ]
        return {"action": "accept-share", "targetIdx": file_id_value}

    def reject_shared_file(self, file_id_value: int) -> dict:
        self.rejected_pending.append(file_id_value)
        self.pending_items = [
            item for item in self.pending_items
            if client.file_id(item) != file_id_value
        ]
        return {"action": "reject-share", "targetIdx": file_id_value}

    def trash_file(self, file_id: int) -> None:
        self.trashed_owned.append(file_id)

    def move_file(self, file_id: int, target_parent_id: int | None) -> None:
        self.moved_owned.append((file_id, target_parent_id))
        for item in self.owned_items:
            if client.file_id(item) == file_id:
                item["parentId"] = target_parent_id
                break

    def rename_file(self, file_id: int, file_name: str) -> None:
        self.renamed_owned.append((file_id, file_name))
        for item in self.owned_items:
            if client.file_id(item) == file_id:
                item["fileOriginName"] = file_name
                break

    def create_folder(self, folder_name: str, parent_id: int | None) -> dict:
        self.created_owned_folders.append((parent_id, folder_name))
        self.next_id += 1
        item = {
            "idx": self.next_id,
            "fileOriginName": folder_name,
            "nodeType": "FOLDER",
            "parentId": parent_id,
        }
        self.owned_items.append(item)
        return item

    def init_upload(self, request_body: list[dict]) -> list[dict]:
        self.init_uploads.extend(request_body)
        responses = []
        for request in request_body:
            self.next_id += 1
            object_key = f"{self.next_id}-{request['fileOriginName']}"
            responses.append({
                **request,
                "presignedUploadUrl": f"memory://{object_key}",
                "objectKey": object_key,
                "finalObjectKey": object_key,
                "partitioned": False,
            })
        return responses

    def put_presigned(self, url: str, data: bytes, content_type: str) -> None:
        self.presigned_puts.append((url, len(data), content_type))

    def complete_upload(self, body: dict) -> None:
        self.complete_uploads.append(body)
        replace_file_id = body.get("replaceFileId")
        if replace_file_id is not None:
            for item in self.owned_items:
                if client.file_id(item) == replace_file_id:
                    item["fileOriginName"] = body["fileOriginName"]
                    item["nodeType"] = "FILE"
                    item["parentId"] = body.get("parentId")
                    item["fileSize"] = body.get("fileSize", 0)
                    item["lastModifyDate"] = str(body.get("lastModified") or "")
                    return
        self.next_id += 1
        self.owned_items.append({
            "idx": self.next_id,
            "fileOriginName": body["fileOriginName"],
            "nodeType": "FILE",
            "parentId": body.get("parentId"),
            "fileSize": body.get("fileSize", 0),
        })

    def abort_upload(self, body: dict) -> None:
        pass

    def trash_shared_file(self, file_id: int) -> None:
        self.trashed_shared.append(file_id)

    def download(self, file_id: int, shared: bool = False) -> bytes:
        self.downloads.append((file_id, shared))
        return self.download_payloads.get(file_id, b"remote")

    def create_shared_folder(self, folder_id: int, folder_name: str) -> dict:
        self.created_folders.append((folder_id, folder_name))
        self.next_id += 1
        return {
            "idx": self.next_id,
            "fileOriginName": folder_name,
            "nodeType": "FOLDER",
            "parentId": folder_id,
            "ownerEmail": "admin@example.com",
            "permission": "WRITE",
            "writable": True,
        }

    def upload_shared_file(self, folder_id: int, file_path: Path, relative_path: str) -> dict:
        self.uploads.append((folder_id, file_path.name, relative_path))
        self.next_id += 1
        return {
            "idx": self.next_id,
            "fileOriginName": file_path.name,
            "nodeType": "FILE",
            "parentId": folder_id,
            "fileSize": file_path.stat().st_size,
            "ownerEmail": "admin@example.com",
            "permission": "WRITE",
            "writable": True,
        }

    def share(self, file_ids: list[int], email: str, permission: str = "READ") -> None:
        self.shares.append((file_ids, email, permission))


def main() -> int:
    items = [
        {"idx": 1, "fileOriginName": "Team", "nodeType": "FOLDER", "parentId": None},
        {"idx": 2, "fileOriginName": "Plans", "nodeType": "FOLDER", "parentId": 1},
        {"idx": 3, "fileOriginName": "launch.txt", "nodeType": "FILE", "parentId": 2, "fileSize": 5},
    ]
    paths = client.build_item_paths(items)
    assert "Team" in paths
    assert "Team/Plans" in paths
    assert "Team/Plans/launch.txt" in paths

    shared_paths = client.build_item_paths(items, prefix="Shared/admin@example.com")
    assert "Shared/admin@example.com/Team/Plans/launch.txt" in shared_paths
    assert client.is_virtual_shared_owner_rel("Shared/admin@example.com")
    assert not client.is_virtual_shared_owner_rel("Shared/admin@example.com/Team")
    assert client.is_writable_shared_item({"permission": "WRITE"})
    assert not client.is_writable_shared_item({"permission": "READ"})
    assert client.extract_refresh_token({"Set-Cookie": "refresh=abc123; Path=/; HttpOnly"}) == "abc123"
    assert client.build_share_address({"email": "owner@example.com"}, "Team") == "fileinnout://shared/owner%40example.com/Team"
    assert client.build_share_address({}, "Shared/owner@example.com/Team") == "fileinnout://shared/owner%40example.com/Team"
    assert client.parse_share_address("fileinnout://shared/owner%40example.com/Team") == "Shared/owner@example.com/Team"
    assert client.parse_share_address("fileinnout://owner%40example.com/Team") == "Shared/owner@example.com/Team"
    assert client.parse_share_address("Shared/owner@example.com/Team") == "Shared/owner@example.com/Team"
    assert client.parse_share_address("fileinnout://shared?path=Shared%2Fowner%40example.com%2FTeam") == "Shared/owner@example.com/Team"

    retry_api = client.FileInNOutApi("http://server")
    retry_attempts = {"count": 0}

    def flaky_get(method, path, body=None, headers=None, raw_body=None):
        retry_attempts["count"] += 1
        if retry_attempts["count"] < 3:
            raise http.client.IncompleteRead(b"partial", 10)
        return 200, {}, b"ok"

    retry_api._request_once = flaky_get
    assert retry_api.request("GET", "/file/1/download")[2] == b"ok"
    assert retry_attempts["count"] == 3

    no_retry_api = client.FileInNOutApi("http://server")
    post_attempts = {"count": 0}

    def flaky_post(method, path, body=None, headers=None, raw_body=None):
        post_attempts["count"] += 1
        raise http.client.IncompleteRead(b"partial", 10)

    no_retry_api._request_once = flaky_post
    try:
        no_retry_api.request("POST", "/file/upload/complete", body={})
        raise AssertionError("POST requests should not be retried after partial reads")
    except client.DesktopError:
        pass
    assert post_attempts["count"] == 1

    with tempfile.TemporaryDirectory() as tmp_download:
        download_root = Path(tmp_download)
        failing_download_api = FakeSharedApi(owned_items=[
            {
                "idx": 101,
                "fileOriginName": "broken.bin",
                "nodeType": "FILE",
                "parentId": None,
                "fileSize": 10,
            }
        ])

        def failing_download(file_id_value: int, shared: bool = False) -> bytes:
            raise client.DesktopError("simulated partial download")

        failing_download_api.download = failing_download
        failed_pull = client.pull(failing_download_api, download_root, include_shared=False)
        assert failed_pull.pulled == 0
        assert failed_pull.skipped_dirty == 0
        assert failed_pull.download_failed == 1
        assert client.stats_to_dict(failed_pull)["downloadFailed"] == 1
        assert not (download_root / "broken.bin").exists()
        assert "broken.bin" not in client.load_state(download_root)["remote"]

    share_api = FakeSharedApi(shared_items=[
        {
            "idx": 30,
            "fileOriginName": "Team",
            "nodeType": "FOLDER",
            "parentId": None,
            "ownerEmail": "owner@example.com",
            "permission": "WRITE",
            "writable": True,
        }
    ])
    original_make_api = client.make_api
    try:
        client.make_api = lambda args: share_api  # type: ignore[assignment]
        client.cmd_share(Namespace(
            server="http://server",
            token="token",
            path="Shared/owner@example.com/Team",
            email=["friend@example.com"],
            permission="READ",
            push_first=False,
            dir=Path("."),
        ))
    finally:
        client.make_api = original_make_api  # type: ignore[assignment]
    assert share_api.shares == [([30], "friend@example.com", "READ")]

    original_make_api = client.make_api
    original_config_path = client.GLOBAL_CONFIG_PATH
    original_legacy_config_path = client.LEGACY_GLOBAL_CONFIG_PATH
    original_prepare_local_drive_config = client.prepare_local_drive_config
    original_sync_profile = client.sync_profile
    try:
        with tempfile.TemporaryDirectory() as tmp:
            config_root = Path(tmp) / "appdata"
            client.GLOBAL_CONFIG_PATH = config_root / "config.json"
            client.LEGACY_GLOBAL_CONFIG_PATH = Path(tmp) / "legacy" / "config.json"
            client.update_global_config({
                "server": "http://cloud.example/api",
                "token": "access",
                "refreshToken": "refresh",
            })
            search_api = FakeSharedApi(
                owned_items=[
                    {"idx": 11, "fileOriginName": "Team", "nodeType": "FOLDER", "parentId": None},
                    {"idx": 12, "fileOriginName": "Plans", "nodeType": "FOLDER", "parentId": 11},
                    {"idx": 13, "fileOriginName": "launch.txt", "nodeType": "FILE", "parentId": 12, "fileSize": 5},
                ],
                shared_items=[
                    {
                        "idx": 21,
                        "fileOriginName": "Team",
                        "nodeType": "FOLDER",
                        "parentId": None,
                        "ownerEmail": "owner@example.com",
                        "permission": "READ",
                    },
                    {
                        "idx": 22,
                        "fileOriginName": "Launch Notes.pdf",
                        "nodeType": "FILE",
                        "parentId": 21,
                        "ownerEmail": "owner@example.com",
                        "permission": "READ",
                        "fileSize": 128,
                    },
                ],
            )
            client.make_api = lambda args: search_api

            search_output = io.StringIO()
            with redirect_stdout(search_output):
                client.cmd_search(Namespace(query="launch", limit=20, owned_only=False, server=None, token=None))
            rows = [line.split("\t") for line in search_output.getvalue().splitlines() if line.strip()]
            assert any(row[1] == "Team/Plans/launch.txt" and "/main/home?desktopPath=Team%2FPlans%2Flaunch.txt" in row[5] for row in rows)
            assert any(row[1] == "Shared/owner@example.com/Team/Launch Notes.pdf" and "/main/shareFile?desktopPath=Shared%2Fowner%40example.com%2FTeam%2FLaunch+Notes.pdf" in row[5] for row in rows)
            assert all(len(row) == 6 and row[0] == "cloud" for row in rows)

            owned_only_output = io.StringIO()
            with redirect_stdout(owned_only_output):
                client.cmd_search(Namespace(query="launch", limit=20, owned_only=True, server=None, token=None))
            assert "Shared/owner@example.com" not in owned_only_output.getvalue()
    finally:
        client.make_api = original_make_api
        client.GLOBAL_CONFIG_PATH = original_config_path
        client.LEGACY_GLOBAL_CONFIG_PATH = original_legacy_config_path

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
        config["server"] = "http://192.168.35.151/api"
        assert client.desktop_web_url(config, drive_root) == "http://192.168.35.151/main/home"
        assert client.desktop_web_url(config, drive_root / client.MY_DRIVE_HUB_NAME) == "http://192.168.35.151/main/home"
        assert client.desktop_web_url(config, drive_root / client.SHARED_DRIVE_HUB_NAME) == "http://192.168.35.151/main/shareFile"
        assert client.desktop_web_url(config, "Q:\\") == "http://192.168.35.151/main/home"
        assert client.desktop_web_url(config, f"Q:\\{client.SHARED_DRIVE_HUB_NAME}") == "http://192.168.35.151/main/shareFile"
        web_url = client.desktop_web_url(config, moved_direct_root / "client.txt")
        assert web_url == "http://192.168.35.151/main/home?desktopPath=New+Project+2%2Fclient.txt"
        mapped_web_url = client.desktop_web_url(config, mapped_owned_file)
        assert mapped_web_url == "http://192.168.35.151/main/home?desktopPath=New+Project+2%2Fclient.txt"
        adopted_original_web_url = client.desktop_web_url(config, "Q:\\New Project\\client.txt")
        assert adopted_original_web_url == "http://192.168.35.151/main/home?desktopPath=New+Project+2%2Fclient.txt"
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
        assert shared_web_url == "http://192.168.35.151/main/shareFile?desktopPath=Shared%2Fowner%40example.com%2FTeam%2Fnotes.txt"
        shared_hub_links = dict(client.drive_hub_profile_links(config))
        assert drive_root / client.SHARED_DRIVE_HUB_NAME / "owner@example.com" / "Team" in shared_hub_links
        mapped_shared_web_url = client.desktop_web_url(config, f"Q:\\{client.SHARED_DRIVE_HUB_NAME}\\owner@example.com\\Team\\notes.txt")
        assert mapped_shared_web_url == "http://192.168.35.151/main/shareFile?desktopPath=Shared%2Fowner%40example.com%2FTeam%2Fnotes.txt"
        legacy_mapped_shared_web_url = client.desktop_web_url(config, f"Q:\\{client.SHARED_DRIVE_HUB_NAME}\\Team\\notes.txt")
        assert legacy_mapped_shared_web_url == "http://192.168.35.151/main/shareFile?desktopPath=Shared%2Fowner%40example.com%2FTeam%2Fnotes.txt"
        shared_cloud_target = client.desktop_target_cloud_path(config, f"Q:\\{client.SHARED_DRIVE_HUB_NAME}\\owner@example.com\\Team\\notes.txt")
        assert shared_cloud_target is not None
        assert shared_cloud_target[1] == "Shared/owner@example.com/Team/notes.txt"
        assert shared_cloud_target[2] == "notes.txt"
        shared_hub_web_url = client.desktop_web_url(config, drive_root / client.SHARED_DRIVE_HUB_NAME / "owner@example.com")
        assert shared_hub_web_url == "http://192.168.35.151/main/shareFile?desktopPath=Shared%2Fowner%40example.com"
        mapped_shared_owner_web_url = client.desktop_web_url(config, f"Q:\\{client.SHARED_DRIVE_HUB_NAME}\\owner@example.com")
        assert mapped_shared_owner_web_url == "http://192.168.35.151/main/shareFile?desktopPath=Shared%2Fowner%40example.com"
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
            "server": "http://192.168.35.151/api",
            "driveRoot": str(drive_root),
            "driveLetter": "Q",
            "syncDir": str(legacy_sync_root),
        }
        legacy_profiles = client.configured_sync_folders(legacy_config)
        assert len(legacy_profiles) == 1
        assert legacy_profiles[0]["remotePath"] == "FileInNOut"
        legacy_mapped_file = f"Q:\\{client.MY_DRIVE_HUB_NAME}\\FileInNOut\\legacy-note.txt"
        assert client.desktop_web_url(legacy_config, legacy_mapped_file) == "http://192.168.35.151/main/home?desktopPath=FileInNOut%2Flegacy-note.txt"
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
                "server": "http://192.168.35.151/api",
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
                "server": "http://192.168.35.151/api",
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
            assert open_web_output.getvalue().strip() == "http://192.168.35.151/main/home?desktopPath=Instant+Project%2Fdraft.txt"
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

    pending_api = FakeSharedApi(
        pending_items=[
            {
                "idx": 81,
                "fileOriginName": "Team",
                "nodeType": "FOLDER",
                "parentId": None,
                "ownerEmail": "owner@example.com",
                "permission": "WRITE",
                "status": "PENDING",
                "downloadable": False,
                "uploadable": False,
                "writable": False,
            },
            {
                "idx": 82,
                "fileOriginName": "ReadOnly",
                "nodeType": "FOLDER",
                "parentId": None,
                "ownerEmail": "owner@example.com",
                "permission": "READ",
                "status": "PENDING",
                "downloadable": False,
                "uploadable": False,
                "writable": False,
            },
        ]
    )
    pending_tree = client.build_pending_share_tree(pending_api)
    assert "Shared/owner@example.com/Team" in pending_tree
    assert "Shared/owner@example.com/ReadOnly" in pending_tree
    assert not client.is_downloadable_shared_item(pending_tree["Shared/owner@example.com/Team"])
    original_make_api = client.make_api
    original_config_path = client.GLOBAL_CONFIG_PATH
    original_legacy_config_path = client.LEGACY_GLOBAL_CONFIG_PATH
    try:
        with tempfile.TemporaryDirectory() as tmp:
            config_root = Path(tmp) / "appdata" / "FileInNOutDesktop"
            client.GLOBAL_CONFIG_PATH = config_root / "config.json"
            client.LEGACY_GLOBAL_CONFIG_PATH = Path(tmp) / "legacy" / "config.json"
            client.update_global_config({"syncDir": str(Path(tmp) / "FileInNOut")})
            client.make_api = lambda args: pending_api
            output = io.StringIO()
            with redirect_stdout(output):
                client.cmd_pending_shares(Namespace())
            pending_output = output.getvalue()
            assert "pending shares: 2" in pending_output
            assert "81\tShared/owner@example.com/Team\towner=owner@example.com\tpermission=WRITE" in pending_output

            output = io.StringIO()
            with redirect_stdout(output):
                client.cmd_accept_share(Namespace(id=None, path="Shared/owner@example.com/Team"))
            assert pending_api.accepted_pending == [81]
            accept_output = output.getvalue()
            assert "configured shared sync folder Shared/owner@example.com/Team" in accept_output
            assert "accepted share Shared/owner@example.com/Team" in accept_output
            profiles = client.configured_sync_folders(client.load_global_config())
            shared_profiles = [profile for profile in profiles if profile["remotePath"] == "Shared/owner@example.com/Team"]
            assert len(shared_profiles) == 1
            assert shared_profiles[0]["name"] == "Team (owner@example.com)"
            assert shared_profiles[0]["direction"] == "two-way"
            assert shared_profiles[0]["permission"] == "WRITE"
            assert "shared-folders" in shared_profiles[0]["localPath"]
            shared_profiles[0]["name"] = "Shared - owner@example.com - Team"
            config = client.load_global_config()
            config["syncFolders"] = profiles
            client.save_global_config(config)
            config = client.load_global_config()
            assert client.ensure_shared_sync_profile(
                config,
                "Shared/owner@example.com/Team",
                {"fileOriginName": "Team", "nodeType": "FOLDER", "permission": "WRITE"},
            )
            client.save_global_config(config)
            profiles = client.configured_sync_folders(client.load_global_config())
            shared_profiles = [profile for profile in profiles if profile["remotePath"] == "Shared/owner@example.com/Team"]
            assert shared_profiles[0]["name"] == "Team (owner@example.com)"

            output = io.StringIO()
            with redirect_stdout(output):
                client.cmd_accept_share(Namespace(id=82, path=""))
            assert pending_api.accepted_pending == [81, 82]
            profiles = client.configured_sync_folders(client.load_global_config())
            readonly_profiles = [profile for profile in profiles if profile["remotePath"] == "Shared/owner@example.com/ReadOnly"]
            assert len(readonly_profiles) == 1
            assert readonly_profiles[0]["name"] == "ReadOnly (owner@example.com)"
            assert readonly_profiles[0]["direction"] == "download"
            assert readonly_profiles[0]["permission"] == "READ"
            assert pending_api.list_pending_shares() == []

            accepted_api = FakeSharedApi(
                shared_items=[
                    {
                        "idx": 91,
                        "fileOriginName": "AcceptedTeam",
                        "nodeType": "FOLDER",
                        "parentId": None,
                        "ownerEmail": "owner@example.com",
                        "permission": "WRITE",
                        "status": "ACCEPTED",
                        "writable": True,
                    }
                ],
                pending_items=[],
            )
            config = {"syncFolders": []}
            assert client.sync_accepted_shared_profiles(accepted_api, config)
            profiles = client.configured_sync_folders(config)
            accepted_profiles = [profile for profile in profiles if profile["remotePath"] == "Shared/owner@example.com/AcceptedTeam"]
            assert len(accepted_profiles) == 1
            assert accepted_profiles[0]["name"] == "AcceptedTeam (owner@example.com)"
            assert accepted_profiles[0]["direction"] == "two-way"
            assert accepted_profiles[0]["permission"] == "WRITE"

            accepted_profiles[0]["enabled"] = False
            config["syncFolders"] = profiles
            assert not client.sync_accepted_shared_profiles(accepted_api, config)
            profiles = client.configured_sync_folders(config)
            disabled_profiles = [profile for profile in profiles if profile["remotePath"] == "Shared/owner@example.com/AcceptedTeam"]
            assert len(disabled_profiles) == 1
            assert disabled_profiles[0]["enabled"] is False

            connect_api = FakeSharedApi(
                shared_items=[],
                pending_items=[
                    {
                        "idx": 181,
                        "fileOriginName": "AddressTeam",
                        "nodeType": "FOLDER",
                        "parentId": None,
                        "ownerEmail": "owner@example.com",
                        "permission": "WRITE",
                        "status": "PENDING",
                        "writable": True,
                    }
                ],
            )
            sync_calls: list[tuple[str, int]] = []

            def fake_sync_profile(api_arg, profile: dict, lock_stale_seconds: int) -> tuple[client.SyncStats, client.SyncStats]:
                assert api_arg is connect_api
                sync_calls.append((profile["remotePath"], lock_stale_seconds))
                return client.SyncStats(pushed=1), client.SyncStats(pulled=2)

            client.prepare_local_drive_config = lambda config_arg, ensure_mapping=True: False  # type: ignore[assignment]
            client.sync_profile = fake_sync_profile  # type: ignore[assignment]
            connect_config = {"syncFolders": []}
            result = client.connect_shared_folder_from_address(
                connect_api,
                connect_config,
                "fileinnout://shared/owner%40example.com/AddressTeam",
                sync_now=True,
                lock_stale_seconds=17,
            )
            assert connect_api.accepted_pending == [181]
            assert result["accepted"] is True
            assert result["remotePath"] == "Shared/owner@example.com/AddressTeam"
            assert result["push"].pushed == 1
            assert result["pull"].pulled == 2
            assert sync_calls == [("Shared/owner@example.com/AddressTeam", 17)]
            connected_profiles = [
                profile for profile in client.configured_sync_folders(connect_config)
                if profile["remotePath"] == "Shared/owner@example.com/AddressTeam"
            ]
            assert len(connected_profiles) == 1
            assert connected_profiles[0]["name"] == "AddressTeam (owner@example.com)"
            assert connected_profiles[0]["direction"] == "two-way"
    finally:
        client.make_api = original_make_api
        client.GLOBAL_CONFIG_PATH = original_config_path
        client.LEGACY_GLOBAL_CONFIG_PATH = original_legacy_config_path
        client.prepare_local_drive_config = original_prepare_local_drive_config
        client.sync_profile = original_sync_profile

    class FakeHttpResponse:
        def __init__(self, status: int, headers: dict, payload: bytes) -> None:
            self.status = status
            self.headers = headers
            self.payload = payload

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def read(self) -> bytes:
            return self.payload

    original_urlopen = client.urllib.request.urlopen
    refresh_updates: list[client.AuthTokens] = []
    http_calls: list[str] = []
    try:
        def fake_urlopen(request, timeout=120):
            path = client.urllib.parse.urlparse(request.full_url).path
            http_calls.append(path)
            if path.endswith("/file/list") and http_calls.count(path) == 1:
                raise client.urllib.error.HTTPError(
                    request.full_url,
                    401,
                    "Unauthorized",
                    {},
                    io.BytesIO(b'{"error":"access token expired"}'),
                )
            if path.endswith("/auth/reissue"):
                assert request.get_header("Cookie") == "refresh=old-refresh"
                return FakeHttpResponse(
                    200,
                    {
                        "Authorization": "Bearer fresh-access",
                        "Set-Cookie": "refresh=fresh-refresh; Path=/; HttpOnly",
                    },
                    b"ok",
                )
            if path.endswith("/file/list"):
                assert request.get_header("Authorization") == "Bearer fresh-access"
                return FakeHttpResponse(200, {}, b"[]")
            raise AssertionError(f"unexpected request path: {path}")

        client.urllib.request.urlopen = fake_urlopen
        api = client.FileInNOutApi(
            "http://example.test/api",
            "expired-access",
            "old-refresh",
            refresh_updates.append,
        )
        assert api.list_owned() == []
        assert http_calls == ["/api/file/list", "/api/auth/reissue", "/api/file/list"]
        assert api.token == "fresh-access"
        assert api.refresh_token == "fresh-refresh"
        assert refresh_updates == [client.AuthTokens("fresh-access", "fresh-refresh")]
    finally:
        client.urllib.request.urlopen = original_urlopen

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "Team").mkdir()
        (root / "Team" / "launch.txt").write_text("ready", encoding="utf-8")
        (root / "Shared" / "admin@example.com" / "Team").mkdir(parents=True)
        (root / "Shared" / "admin@example.com" / "Team" / "shared.txt").write_text("shared", encoding="utf-8")
        (root / "Team" / "~$draft.docx").write_text("office lock", encoding="utf-8")
        (root / "Team" / "download.crdownload").write_text("partial", encoding="utf-8")
        (root / "Team" / "scratch.tmp").write_text("temporary", encoding="utf-8")
        (root / "Shared" / "admin@example.com" / "Team" / "shared.tmp").write_text("temporary", encoding="utf-8")
        (root / ".fileinnout").mkdir()
        (root / ".fileinnout" / "ignored.txt").write_text("ignored", encoding="utf-8")

        signatures = client.scan_local_signatures(root)
        assert "Team/launch.txt" in signatures
        assert "Shared/admin@example.com/Team/shared.txt" in signatures
        assert "Team/~$draft.docx" not in signatures
        assert "Team/download.crdownload" not in signatures
        assert "Team/scratch.tmp" not in signatures
        assert "Shared/admin@example.com/Team/shared.tmp" not in signatures
        assert ".fileinnout/ignored.txt" not in signatures

        state = client.load_state(root)
        state["local"] = signatures
        client.save_state(root, state)
        assert not client.is_local_dirty(root, "Team/launch.txt", client.load_state(root))

        original_config_path = client.GLOBAL_CONFIG_PATH
        original_legacy_config_path = client.LEGACY_GLOBAL_CONFIG_PATH
        try:
            client.GLOBAL_CONFIG_PATH = root / "appdata" / "config.json"
            client.LEGACY_GLOBAL_CONFIG_PATH = root / "legacy-appdata" / "config.json"
            client.LEGACY_GLOBAL_CONFIG_PATH.parent.mkdir(parents=True)
            client.LEGACY_GLOBAL_CONFIG_PATH.write_text(
                '{"server":"http://legacy.example/api","token":"legacy"}',
                encoding="utf-8",
            )
            assert client.load_global_config()["server"] == "http://legacy.example/api"
            client.update_global_config({"server": "http://example.test/api", "token": "token"})
            client.update_global_config({"syncDir": str(root)})
            saved_config = client.load_global_config()
            assert saved_config["server"] == "http://example.test/api"
            assert saved_config["syncDir"] == str(root)
            assert client.resolve_sync_root(Namespace(dir=None)) == root.resolve()
            assert client.resolve_sync_root(Namespace(dir=str(root / "override"))) == (root / "override").resolve()
            drive_root_for_doctor = root / "drive-root"
            drive_root_for_doctor.mkdir()
            (drive_root_for_doctor / "Loose Folder").mkdir()
            (drive_root_for_doctor / "loose.txt").write_text("waiting for adoption", encoding="utf-8")
            client.update_global_config({
                "driveLetter": "Z",
                "driveRoot": str(drive_root_for_doctor),
                "syncFolders": [
                    {
                        "name": "Team",
                        "localPath": str(root),
                        "remotePath": "Team",
                        "direction": "two-way",
                        "enabled": True,
                    }
                ],
            })
            doctor_output = io.StringIO()
            with redirect_stdout(doctor_output):
                client.cmd_doctor(Namespace(dir=None, local_only=True, owned_only=False, server=None, token=None))
            output = doctor_output.getvalue()
            assert "configured_sync_folders: 1" in output
            assert "enabled_sync_folders: 1" in output
            assert "sync_folder_1_name: Team" in output
            assert "sync_folder_1_remote_path: Team" in output
            assert "sync_folder_1_direction: two-way" in output
            assert "sync_folder_1_exists: True" in output
            assert "sync_folders_all_exist: True" in output
            assert "sync_folders_missing: 0" in output
            assert "sync_locks_active: 0" in output
            assert "drive_letter: Z" in output
            assert "drive_root_configured: True" in output
            assert "drive_root_exists: True" in output
            assert "drive_mapped: False" in output
            assert "drive_root_hub_categories: 0" in output
            assert "drive_my_drive_hub_exists: False" in output
            assert "drive_shared_hub_exists: False" in output
            assert "drive_root_direct_files: 1" in output
            assert "drive_root_direct_folders: 1" in output
            assert "drive_root_unconfigured_folders: 1" in output
            assert "drive_shared_hub_manual_items: 0" in output
            assert "drive_root_pending_adoption: True" in output
            assert "drive_hub_consistent: False" in output
            assert "drive_root_needs_attention: True" in output
            assert "drive_ready: False" in output

            original_drive_mapping_supported = client.drive_mapping_supported
            original_get_subst_target = client.get_subst_target
            original_drive_letter_path_exists = client.drive_letter_path_exists
            original_subprocess_run = client.subprocess.run
            try:
                class FakeSubstResult:
                    returncode = 0
                    stdout = ""
                    stderr = ""

                client.drive_mapping_supported = lambda: True
                client.drive_letter_path_exists = lambda letter: False

                repair_drive_root = root / "repair-drive-root"
                subst_calls: list[list[str]] = []

                def fake_subst_run(command, **kwargs):
                    subst_calls.append([str(part) for part in command])
                    return FakeSubstResult()

                client.get_subst_target = lambda letter: ""
                client.subprocess.run = fake_subst_run
                repair_config = {"driveRoot": str(repair_drive_root), "driveLetter": "G"}
                changed = client.ensure_configured_drive_mapping(repair_config)
                assert changed is False
                assert repair_config["driveLetter"] == "G"
                assert subst_calls == [["subst", "G:", str(repair_drive_root.resolve(strict=False))]]
                assert (repair_drive_root / client.MY_DRIVE_HUB_NAME).is_dir()
                assert (repair_drive_root / client.SHARED_DRIVE_HUB_NAME).is_dir()

                fallback_root = root / "fallback-drive-root"
                subst_calls.clear()
                client.get_subst_target = lambda letter: str(root / "other-drive-target") if letter == "G" else ""
                fallback_config = {"driveRoot": str(fallback_root), "driveLetter": "G"}
                changed = client.ensure_configured_drive_mapping(fallback_config)
                assert changed is True
                assert fallback_config["driveLetter"] == "H"
                assert subst_calls == [["subst", "H:", str(fallback_root.resolve(strict=False))]]
            finally:
                client.drive_mapping_supported = original_drive_mapping_supported
                client.get_subst_target = original_get_subst_target
                client.drive_letter_path_exists = original_drive_letter_path_exists
                client.subprocess.run = original_subprocess_run

            missing_config = root / "missing-appdata" / "config.json"
            missing_legacy_config = root / "missing-legacy-appdata" / "config.json"
            client.GLOBAL_CONFIG_PATH = missing_config
            client.LEGACY_GLOBAL_CONFIG_PATH = missing_legacy_config
            doctor_output = io.StringIO()
            with redirect_stdout(doctor_output):
                client.cmd_doctor(Namespace(dir=None, local_only=True, owned_only=False, server=None, token=None))
            output = doctor_output.getvalue()
            assert "config_exists: False" in output
            assert "sync_root_configured: False" in output
            assert "sync_lock: unconfigured" in output
            assert "backend: skipped" in output
        finally:
            client.GLOBAL_CONFIG_PATH = original_config_path
            client.LEGACY_GLOBAL_CONFIG_PATH = original_legacy_config_path

        lock_path = client.acquire_sync_lock(root)
        assert lock_path.exists()
        assert "active" in client.describe_sync_lock(root)
        try:
            client.acquire_sync_lock(root)
            raise AssertionError("second sync lock acquisition should have failed")
        except client.DesktopError:
            pass
        client.release_sync_lock(lock_path)
        assert not lock_path.exists()

        stale_lock = client.root_lock_path(root)
        stale_lock.parent.mkdir(parents=True, exist_ok=True)
        stale_lock.write_text('{"pid": 999999, "createdAt": 1}', encoding="utf-8")
        os.utime(stale_lock, (1, 1))
        replacement_lock = client.acquire_sync_lock(root, stale_seconds=1)
        assert replacement_lock.exists()
        client.release_sync_lock(replacement_lock)

        client.update_sync_status(root, "success", pull_stats=client.SyncStats(pulled=2), push_stats=client.SyncStats(pushed=1))
        sync_status = client.load_state(root)["syncStatus"]
        assert sync_status["status"] == "success"
        assert sync_status["pull"]["pulled"] == 2
        assert sync_status["push"]["pushed"] == 1
        sync_activity = client.load_state(root)["syncActivity"]
        assert sync_activity[0]["status"] == "success"
        assert sync_activity[0]["pull"]["pulled"] == 2
        assert sync_activity[0]["push"]["pushed"] == 1
        client.update_sync_status(root, "error", error="simulated")
        sync_status = client.load_state(root)["syncStatus"]
        assert sync_status["status"] == "error"
        assert sync_status["error"] == "simulated"
        sync_activity = client.load_state(root)["syncActivity"]
        assert sync_activity[0]["status"] == "error"
        assert sync_activity[0]["error"] == "simulated"
        assert sync_activity[1]["status"] == "success"

        sync_order_api = object()
        sync_calls: list[str] = []
        original_make_api = client.make_api
        original_push = client.push
        original_pull = client.pull
        try:
            client.make_api = lambda args: sync_order_api

            def ordered_push(api, pushed_root: Path) -> client.SyncStats:
                assert api is sync_order_api
                assert pushed_root == root
                sync_calls.append("push")
                return client.SyncStats(pushed=1)

            def ordered_pull(api, pulled_root: Path, include_shared: bool = True) -> client.SyncStats:
                assert api is sync_order_api
                assert pulled_root == root
                assert include_shared is True
                sync_calls.append("pull")
                return client.SyncStats(pulled=1)

            client.push = ordered_push
            client.pull = ordered_pull
            sync_output = io.StringIO()
            with redirect_stdout(sync_output):
                client.cmd_sync(Namespace(
                    dir=str(root),
                    owned_only=False,
                    lock_stale_seconds=1,
                    server=None,
                    token=None,
                ))
            assert sync_calls == ["push", "pull"]
            assert "push: " in sync_output.getvalue()
            assert "pull: " in sync_output.getvalue()
        finally:
            client.make_api = original_make_api
            client.push = original_push
            client.pull = original_pull

        share_api = FakeSharedApi(
            owned_items=[
                {"idx": 701, "fileOriginName": "Team", "nodeType": "FOLDER", "parentId": None},
                {"idx": 702, "fileOriginName": "roadmap.txt", "nodeType": "FILE", "parentId": 701, "fileSize": 4},
            ],
            shared_items=[],
        )
        original_make_api = client.make_api
        original_push = client.push
        original_push_scoped = client.push_scoped
        original_config_path = client.GLOBAL_CONFIG_PATH
        original_legacy_config_path = client.LEGACY_GLOBAL_CONFIG_PATH
        try:
            client.make_api = lambda args: share_api
            share_output = io.StringIO()
            with redirect_stdout(share_output):
                client.cmd_share(Namespace(
                    dir=str(root),
                    path="Team",
                    email="teammate@example.com",
                    permission="WRITE",
                    server=None,
                    token=None,
                ))
            assert share_api.shares == [([701], "teammate@example.com", "WRITE")]
            assert "shared Team with teammate@example.com as WRITE" in share_output.getvalue()

            multi_output = io.StringIO()
            with redirect_stdout(multi_output):
                client.cmd_share(Namespace(
                    dir=str(root),
                    path="Team",
                    email=["first@example.com,second@example.com", "FIRST@example.com"],
                    permission="READ",
                    server=None,
                    token=None,
                ))
            assert share_api.shares[-2:] == [
                ([701], "first@example.com", "READ"),
                ([701], "second@example.com", "READ"),
            ]
            assert "shared Team with first@example.com as READ" in multi_output.getvalue()
            assert "shared Team with second@example.com as READ" in multi_output.getvalue()

            try:
                client.cmd_share(Namespace(
                    dir=str(root),
                    path="Missing",
                    email="teammate@example.com",
                    permission="READ",
                    server=None,
                    token=None,
                ))
                raise AssertionError("sharing an unsynced path should fail")
            except client.DesktopError as error:
                assert "Run push first" in str(error)

            push_first_api = FakeSharedApi(owned_items=[], shared_items=[])
            push_calls: list[tuple[FakeSharedApi, Path]] = []

            def fake_push(api: FakeSharedApi, pushed_root: Path) -> client.SyncStats:
                push_calls.append((api, pushed_root))
                api.owned_items = [
                    {"idx": 801, "fileOriginName": "NewShare", "nodeType": "FOLDER", "parentId": None},
                ]
                return client.SyncStats(pushed=1)

            (root / "NewShare").mkdir()
            client.make_api = lambda args: push_first_api
            client.push = fake_push
            push_first_output = io.StringIO()
            with redirect_stdout(push_first_output):
                client.cmd_share(Namespace(
                    dir=str(root),
                    path="NewShare",
                    email=["new@example.com"],
                    permission="WRITE",
                    server=None,
                    token=None,
                    push_first=True,
                    lock_stale_seconds=1,
                ))
            assert push_calls == [(push_first_api, root)]
            assert push_first_api.shares == [([801], "new@example.com", "WRITE")]
            assert "shared NewShare with new@example.com as WRITE" in push_first_output.getvalue()
            assert client.load_state(root)["syncStatus"]["push"]["pushed"] == 1

            (root / "Team").mkdir(exist_ok=True)
            (root / "Team" / "roadmap.txt").write_text("road", encoding="utf-8")
            target_share_api = FakeSharedApi(
                owned_items=[
                    {"idx": 700, "fileOriginName": "Root", "nodeType": "FOLDER", "parentId": None},
                    {"idx": 701, "fileOriginName": "Team", "nodeType": "FOLDER", "parentId": 700},
                    {"idx": 702, "fileOriginName": "roadmap.txt", "nodeType": "FILE", "parentId": 701, "fileSize": 4},
                ],
                shared_items=[],
            )
            client.GLOBAL_CONFIG_PATH = root / ".fileinnout-target-config.json"
            client.LEGACY_GLOBAL_CONFIG_PATH = root / ".fileinnout-target-legacy-config.json"
            client.save_global_config({
                "server": "http://192.168.35.151/api",
                "token": "saved-token",
                "syncFolders": [
                    {
                        "name": "Main",
                        "localPath": str(root),
                        "remotePath": "Root",
                        "direction": "two-way",
                        "enabled": True,
                    }
                ],
            })
            client.make_api = lambda args: target_share_api
            target_output = io.StringIO()
            with redirect_stdout(target_output):
                client.cmd_share_target(Namespace(
                    target=str(root / "Team" / "roadmap.txt"),
                    email=["explorer@example.com"],
                    permission="DOWNLOAD",
                    server=None,
                    token=None,
                    push_first=False,
                    lock_stale_seconds=1,
                ))
            assert target_share_api.shares == [([702], "explorer@example.com", "DOWNLOAD")]
            assert "shared Root/Team/roadmap.txt with explorer@example.com as DOWNLOAD" in target_output.getvalue()

            push_target_api = FakeSharedApi(owned_items=[], shared_items=[])
            push_scoped_calls: list[tuple[FakeSharedApi, Path, str]] = []

            def fake_push_scoped(api: FakeSharedApi, local_root: Path, remote_path: str) -> client.SyncStats:
                push_scoped_calls.append((api, local_root, remote_path))
                api.owned_items = [
                    {"idx": 900, "fileOriginName": "Root", "nodeType": "FOLDER", "parentId": None},
                    {"idx": 901, "fileOriginName": "ExplorerShare", "nodeType": "FOLDER", "parentId": 900},
                ]
                return client.SyncStats(pushed=1)

            (root / "ExplorerShare").mkdir()
            client.make_api = lambda args: push_target_api
            client.push_scoped = fake_push_scoped
            target_push_output = io.StringIO()
            with redirect_stdout(target_push_output):
                client.cmd_share_target(Namespace(
                    target=str(root / "ExplorerShare"),
                    email=["drive@example.com"],
                    permission="WRITE",
                    server=None,
                    token=None,
                    push_first=True,
                    lock_stale_seconds=1,
                ))
            assert push_scoped_calls == [(push_target_api, root, "Root")]
            assert push_target_api.shares == [([901], "drive@example.com", "WRITE")]
            assert "shared Root/ExplorerShare with drive@example.com as WRITE" in target_push_output.getvalue()
        finally:
            client.make_api = original_make_api
            client.push = original_push
            client.push_scoped = original_push_scoped
            client.GLOBAL_CONFIG_PATH = original_config_path
            client.LEGACY_GLOBAL_CONFIG_PATH = original_legacy_config_path

        (root / "Shared" / "admin@example.com" / "Team" / "NewChild").mkdir()
        (root / "Shared" / "admin@example.com" / "Team" / "NewChild" / "draft.txt").write_text("draft", encoding="utf-8")
        (root / "Shared" / "admin@example.com" / "BlockedTop").mkdir()
        (root / "Shared" / "admin@example.com" / "BlockedTop" / "skip.txt").write_text("skip", encoding="utf-8")

        fake_api = FakeSharedApi()
        stats = client.SyncStats()
        client.push_shared(fake_api, root, {"local": {}}, stats)
        assert (1, "NewChild") in fake_api.created_folders
        assert any(upload[1] == "draft.txt" for upload in fake_api.uploads)
        assert not any(upload[1] == "skip.txt" for upload in fake_api.uploads)
        assert stats.pushed == 2
        assert stats.skipped_dirty >= 1

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        local_file = root / "Team" / "launch.txt"
        local_file.parent.mkdir()
        local_file.write_text("ready", encoding="utf-8")
        owned_upload_api = FakeSharedApi(owned_items=[], shared_items=[])
        stats = client.push(owned_upload_api, root)
        folder_id = next(
            item["idx"]
            for item in owned_upload_api.owned_items
            if item["nodeType"] == "FOLDER" and item["fileOriginName"] == "Team"
        )
        assert owned_upload_api.created_owned_folders == [(None, "Team")]
        assert owned_upload_api.init_uploads[0]["parentId"] == folder_id
        assert owned_upload_api.init_uploads[0]["relativePath"] == "launch.txt"
        assert owned_upload_api.complete_uploads[0]["parentId"] == folder_id
        assert owned_upload_api.complete_uploads[0]["relativePath"] == "launch.txt"
        remote_tree = client.build_remote_tree(owned_upload_api, include_shared=False)
        assert "Team/launch.txt" in remote_tree
        assert "Team/Team/launch.txt" not in remote_tree
        assert stats.pushed == 1

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        owned_items = [
            {"idx": 101, "fileOriginName": "Team", "nodeType": "FOLDER", "parentId": None},
            {"idx": 102, "fileOriginName": "launch.txt", "nodeType": "FILE", "parentId": 101, "fileSize": 5},
        ]
        delete_api = FakeSharedApi(owned_items=owned_items, shared_items=[])
        state = client.load_state(root)
        state["local"] = {"Team/launch.txt": {"size": 5, "mtime": 1}}
        state["localFolders"] = ["Team"]
        state["remote"] = {
            "Team": {"id": 101, "nodeType": "FOLDER"},
            "Team/launch.txt": {"id": 102, "nodeType": "FILE"},
        }
        client.save_state(root, state)
        stats = client.push(delete_api, root)
        assert delete_api.trashed_owned == [101]
        assert stats.deleted == 1

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        team = root / "Team"
        team.mkdir()
        renamed_file = team / "roadmap.txt"
        renamed_file.write_text("same file", encoding="utf-8")
        signature = client.local_signature(renamed_file)
        rename_api = FakeSharedApi(owned_items=[
            {"idx": 101, "fileOriginName": "Team", "nodeType": "FOLDER", "parentId": None},
            {"idx": 102, "fileOriginName": "plan.txt", "nodeType": "FILE", "parentId": 101, "fileSize": signature["size"]},
        ], shared_items=[])
        state = client.load_state(root)
        state["scopeRemotePath"] = ""
        state["local"] = {"Team/plan.txt": signature}
        state["localFolders"] = ["Team"]
        state["remote"] = {
            "Team": {"id": 101, "nodeType": "FOLDER"},
            "Team/plan.txt": {"id": 102, "nodeType": "FILE", "size": signature["size"], "updatedAt": ""},
        }
        client.save_state(root, state)
        stats = client.push_scoped(rename_api, root, "")
        assert rename_api.renamed_owned == [(102, "roadmap.txt")]
        assert rename_api.moved_owned == []
        assert rename_api.trashed_owned == []
        assert rename_api.complete_uploads == []
        assert stats.pushed == 1

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        archive = root / "Archive"
        archive.mkdir()
        moved_file = archive / "plan.txt"
        moved_file.write_text("same file", encoding="utf-8")
        signature = client.local_signature(moved_file)
        move_api = FakeSharedApi(owned_items=[
            {"idx": 201, "fileOriginName": "Inbox", "nodeType": "FOLDER", "parentId": None},
            {"idx": 202, "fileOriginName": "Archive", "nodeType": "FOLDER", "parentId": None},
            {"idx": 203, "fileOriginName": "plan.txt", "nodeType": "FILE", "parentId": 201, "fileSize": signature["size"]},
        ], shared_items=[])
        state = client.load_state(root)
        state["scopeRemotePath"] = ""
        state["local"] = {"Inbox/plan.txt": signature}
        state["localFolders"] = ["Inbox", "Archive"]
        state["remote"] = {
            "Inbox": {"id": 201, "nodeType": "FOLDER"},
            "Archive": {"id": 202, "nodeType": "FOLDER"},
            "Inbox/plan.txt": {"id": 203, "nodeType": "FILE", "size": signature["size"], "updatedAt": ""},
        }
        client.save_state(root, state)
        stats = client.push_scoped(move_api, root, "")
        assert move_api.moved_owned == [(203, 202)]
        assert move_api.renamed_owned == []
        assert move_api.complete_uploads == []
        assert 203 not in move_api.trashed_owned
        assert stats.pushed == 1

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        team = root / "Team"
        team.mkdir()
        edited_file = team / "plan.txt"
        edited_file.write_text("edited same file", encoding="utf-8")
        old_signature = {"size": 9, "mtime": 1}
        edit_api = FakeSharedApi(owned_items=[
            {"idx": 211, "fileOriginName": "Team", "nodeType": "FOLDER", "parentId": None},
            {"idx": 212, "fileOriginName": "plan.txt", "nodeType": "FILE", "parentId": 211, "fileSize": old_signature["size"], "lastModifyDate": ""},
        ], shared_items=[])
        state = client.load_state(root)
        state["scopeRemotePath"] = ""
        state["local"] = {"Team/plan.txt": old_signature}
        state["localFolders"] = ["Team"]
        state["remote"] = {
            "Team": {"id": 211, "nodeType": "FOLDER"},
            "Team/plan.txt": {"id": 212, "nodeType": "FILE", "size": old_signature["size"], "updatedAt": ""},
        }
        client.save_state(root, state)
        stats = client.push_scoped(edit_api, root, "")
        assert edit_api.trashed_owned == []
        assert edit_api.complete_uploads[0]["replaceFileId"] == 212
        assert edit_api.init_uploads[0]["replaceFileId"] == 212
        assert stats.pushed == 1

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        team = root / "Team"
        team.mkdir()
        renamed_file = team / "roadmap.txt"
        renamed_file.write_text("renamed and edited", encoding="utf-8")
        old_signature = {"size": 9, "mtime": 1}
        dirty_rename_api = FakeSharedApi(owned_items=[
            {"idx": 221, "fileOriginName": "Team", "nodeType": "FOLDER", "parentId": None},
            {"idx": 222, "fileOriginName": "plan.txt", "nodeType": "FILE", "parentId": 221, "fileSize": old_signature["size"], "lastModifyDate": ""},
        ], shared_items=[])
        state = client.load_state(root)
        state["scopeRemotePath"] = ""
        state["local"] = {"Team/plan.txt": old_signature}
        state["localFolders"] = ["Team"]
        state["remote"] = {
            "Team": {"id": 221, "nodeType": "FOLDER"},
            "Team/plan.txt": {"id": 222, "nodeType": "FILE", "size": old_signature["size"], "updatedAt": ""},
        }
        client.save_state(root, state)
        stats = client.push_scoped(dirty_rename_api, root, "")
        assert dirty_rename_api.renamed_owned == [(222, "roadmap.txt")]
        assert dirty_rename_api.moved_owned == []
        assert dirty_rename_api.trashed_owned == []
        assert dirty_rename_api.complete_uploads[0]["replaceFileId"] == 222
        assert stats.pushed == 2
        saved_state = client.load_state(root)
        assert "Team/roadmap.txt" in saved_state["local"]
        assert "Team/plan.txt" not in saved_state["local"]

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        team = root / "Team"
        team.mkdir()
        renamed_file = team / "roadmap.txt"
        renamed_file.write_text("local renamed conflict", encoding="utf-8")
        old_signature = {"size": 9, "mtime": 1}
        dirty_conflict_file_api = FakeSharedApi(owned_items=[
            {"idx": 231, "fileOriginName": "Team", "nodeType": "FOLDER", "parentId": None},
            {"idx": 232, "fileOriginName": "plan.txt", "nodeType": "FILE", "parentId": 231, "fileSize": 99, "lastModifyDate": "remote-change"},
        ], shared_items=[])
        state = client.load_state(root)
        state["scopeRemotePath"] = ""
        state["local"] = {"Team/plan.txt": old_signature}
        state["localFolders"] = ["Team"]
        state["remote"] = {
            "Team": {"id": 231, "nodeType": "FOLDER"},
            "Team/plan.txt": {"id": 232, "nodeType": "FILE", "size": old_signature["size"], "updatedAt": ""},
        }
        client.save_state(root, state)
        stats = client.push_scoped(dirty_conflict_file_api, root, "")
        assert dirty_conflict_file_api.renamed_owned == []
        assert dirty_conflict_file_api.moved_owned == []
        assert 232 not in dirty_conflict_file_api.trashed_owned
        assert "replaceFileId" not in dirty_conflict_file_api.complete_uploads[0]
        assert stats.skipped_dirty >= 1

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        team_renamed = root / "Team Renamed"
        team_renamed.mkdir()
        plan_file = team_renamed / "plan.txt"
        plan_file.write_text("folder rename keeps children", encoding="utf-8")
        signature = client.local_signature(plan_file)
        folder_rename_api = FakeSharedApi(owned_items=[
            {"idx": 301, "fileOriginName": "Team", "nodeType": "FOLDER", "parentId": None},
            {"idx": 302, "fileOriginName": "plan.txt", "nodeType": "FILE", "parentId": 301, "fileSize": signature["size"]},
        ], shared_items=[])
        state = client.load_state(root)
        state["scopeRemotePath"] = ""
        state["local"] = {"Team/plan.txt": signature}
        state["localFolders"] = ["Team"]
        state["remote"] = {
            "Team": {"id": 301, "nodeType": "FOLDER"},
            "Team/plan.txt": {"id": 302, "nodeType": "FILE", "size": signature["size"], "updatedAt": ""},
        }
        client.save_state(root, state)
        stats = client.push_scoped(folder_rename_api, root, "")
        assert folder_rename_api.renamed_owned == [(301, "Team Renamed")]
        assert folder_rename_api.moved_owned == []
        assert folder_rename_api.trashed_owned == []
        assert folder_rename_api.complete_uploads == []
        assert stats.pushed == 1
        saved_state = client.load_state(root)
        assert "Team Renamed/plan.txt" in saved_state["local"]
        assert "Team/plan.txt" not in saved_state["local"]

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        archive = root / "Archive"
        archive.mkdir()
        moved_team = archive / "Team"
        moved_team.mkdir()
        plan_file = moved_team / "plan.txt"
        plan_file.write_text("folder move keeps children", encoding="utf-8")
        signature = client.local_signature(plan_file)
        folder_move_api = FakeSharedApi(owned_items=[
            {"idx": 401, "fileOriginName": "Archive", "nodeType": "FOLDER", "parentId": None},
            {"idx": 402, "fileOriginName": "Team", "nodeType": "FOLDER", "parentId": None},
            {"idx": 403, "fileOriginName": "plan.txt", "nodeType": "FILE", "parentId": 402, "fileSize": signature["size"]},
        ], shared_items=[])
        state = client.load_state(root)
        state["scopeRemotePath"] = ""
        state["local"] = {"Team/plan.txt": signature}
        state["localFolders"] = ["Archive", "Team"]
        state["remote"] = {
            "Archive": {"id": 401, "nodeType": "FOLDER"},
            "Team": {"id": 402, "nodeType": "FOLDER"},
            "Team/plan.txt": {"id": 403, "nodeType": "FILE", "size": signature["size"], "updatedAt": ""},
        }
        client.save_state(root, state)
        stats = client.push_scoped(folder_move_api, root, "")
        assert folder_move_api.moved_owned == [(402, 401)]
        assert folder_move_api.renamed_owned == []
        assert folder_move_api.trashed_owned == []
        assert folder_move_api.complete_uploads == []
        assert stats.pushed == 1
        saved_state = client.load_state(root)
        assert "Archive/Team/plan.txt" in saved_state["local"]
        assert "Team/plan.txt" not in saved_state["local"]

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        team_renamed = root / "Team Renamed"
        team_renamed.mkdir()
        plan_file = team_renamed / "plan.txt"
        old_signature = {"size": 8, "mtime": 1}
        plan_file.write_text("edited while renaming folder", encoding="utf-8")
        dirty_folder_api = FakeSharedApi(owned_items=[
            {"idx": 501, "fileOriginName": "Team", "nodeType": "FOLDER", "parentId": None},
            {"idx": 502, "fileOriginName": "plan.txt", "nodeType": "FILE", "parentId": 501, "fileSize": old_signature["size"]},
        ], shared_items=[])
        state = client.load_state(root)
        state["scopeRemotePath"] = ""
        state["local"] = {"Team/plan.txt": old_signature}
        state["localFolders"] = ["Team"]
        state["remote"] = {
            "Team": {"id": 501, "nodeType": "FOLDER"},
            "Team/plan.txt": {"id": 502, "nodeType": "FILE", "size": old_signature["size"], "updatedAt": ""},
        }
        client.save_state(root, state)
        stats = client.push_scoped(dirty_folder_api, root, "")
        assert dirty_folder_api.renamed_owned == [(501, "Team Renamed")]
        assert dirty_folder_api.moved_owned == []
        assert 501 not in dirty_folder_api.trashed_owned
        assert 502 not in dirty_folder_api.trashed_owned
        assert dirty_folder_api.complete_uploads[0]["replaceFileId"] == 502
        assert stats.pushed >= 2
        saved_state = client.load_state(root)
        assert "Team Renamed/plan.txt" in saved_state["local"]
        assert "Team/plan.txt" not in saved_state["local"]

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        team_renamed = root / "Team Renamed"
        team_renamed.mkdir()
        plan_file = team_renamed / "plan.txt"
        old_signature = {"size": 8, "mtime": 1}
        plan_file.write_text("local conflict while renaming folder", encoding="utf-8")
        dirty_conflict_api = FakeSharedApi(owned_items=[
            {"idx": 601, "fileOriginName": "Team", "nodeType": "FOLDER", "parentId": None},
            {"idx": 602, "fileOriginName": "plan.txt", "nodeType": "FILE", "parentId": 601, "fileSize": 99, "updatedAt": "remote-change"},
        ], shared_items=[])
        state = client.load_state(root)
        state["scopeRemotePath"] = ""
        state["local"] = {"Team/plan.txt": old_signature}
        state["localFolders"] = ["Team"]
        state["remote"] = {
            "Team": {"id": 601, "nodeType": "FOLDER"},
            "Team/plan.txt": {"id": 602, "nodeType": "FILE", "size": old_signature["size"], "updatedAt": ""},
        }
        client.save_state(root, state)
        stats = client.push_scoped(dirty_conflict_api, root, "")
        assert dirty_conflict_api.renamed_owned == []
        assert dirty_conflict_api.moved_owned == []
        assert 601 not in dirty_conflict_api.trashed_owned
        assert 602 not in dirty_conflict_api.trashed_owned
        assert dirty_conflict_api.complete_uploads
        assert stats.skipped_dirty >= 1

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "Shared" / "admin@example.com").mkdir(parents=True)
        shared_items = [
            {
                "idx": 201,
                "fileOriginName": "Team",
                "nodeType": "FOLDER",
                "parentId": None,
                "ownerEmail": "admin@example.com",
                "permission": "WRITE",
                "writable": True,
            },
            {
                "idx": 202,
                "fileOriginName": "shared.txt",
                "nodeType": "FILE",
                "parentId": 201,
                "fileSize": 6,
                "ownerEmail": "admin@example.com",
                "permission": "WRITE",
                "writable": True,
            },
        ]
        shared_delete_api = FakeSharedApi(shared_items=shared_items)
        state = client.load_state(root)
        state["local"] = {"Shared/admin@example.com/Team/shared.txt": {"size": 6, "mtime": 1}}
        state["localFolders"] = ["Shared/admin@example.com", "Shared/admin@example.com/Team"]
        state["remote"] = {
            "Shared/admin@example.com/Team": {"id": 201, "nodeType": "FOLDER", "sharedWithMe": True, "permission": "WRITE", "writable": True},
            "Shared/admin@example.com/Team/shared.txt": {"id": 202, "nodeType": "FILE", "sharedWithMe": True, "permission": "WRITE", "writable": True},
        }
        client.save_state(root, state)
        stats = client.SyncStats()
        client.push_shared(shared_delete_api, root, client.load_state(root), stats)
        assert shared_delete_api.trashed_shared == [201]
        assert stats.deleted == 1

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "RemoteGone").mkdir()
        removed_file = root / "RemoteGone" / "removed.txt"
        removed_file.write_text("synced", encoding="utf-8")
        dirty_file = root / "dirty.txt"
        dirty_file.write_text("changed", encoding="utf-8")
        state = client.load_state(root)
        state["local"] = {
            "RemoteGone/removed.txt": client.local_signature(removed_file),
            "dirty.txt": {"size": 6, "mtime": 1},
        }
        state["localFolders"] = ["RemoteGone"]
        state["remote"] = {
            "RemoteGone": {"id": 301, "nodeType": "FOLDER"},
            "RemoteGone/removed.txt": {"id": 302, "nodeType": "FILE"},
            "dirty.txt": {"id": 303, "nodeType": "FILE"},
        }
        client.save_state(root, state)
        stats = client.pull(FakeSharedApi(owned_items=[], shared_items=[]), root)
        assert not removed_file.exists()
        assert not (root / "RemoteGone").exists()
        assert dirty_file.exists()
        assert stats.deleted >= 2
        assert stats.skipped_dirty == 1

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        team = root / "Team"
        team.mkdir()
        old_file = team / "old.txt"
        old_file.write_text("same remote file", encoding="utf-8")
        signature = client.local_signature(old_file)
        rename_api = FakeSharedApi(owned_items=[
            {"idx": 801, "fileOriginName": "Team", "nodeType": "FOLDER", "parentId": None},
            {
                "idx": 802,
                "fileOriginName": "new.txt",
                "nodeType": "FILE",
                "parentId": 801,
                "fileSize": signature["size"],
                "lastModifyDate": "same",
            },
        ], shared_items=[])
        state = client.load_state(root)
        state["local"] = {"Team/old.txt": signature}
        state["localFolders"] = ["Team"]
        state["remote"] = {
            "Team": {"id": 801, "nodeType": "FOLDER"},
            "Team/old.txt": {"id": 802, "nodeType": "FILE", "size": signature["size"], "updatedAt": "same"},
        }
        client.save_state(root, state)
        stats = client.pull(rename_api, root, include_shared=False)
        assert not old_file.exists()
        assert (team / "new.txt").read_text(encoding="utf-8") == "same remote file"
        assert rename_api.downloads == []
        assert stats.pulled == 1
        saved_state = client.load_state(root)
        assert "Team/new.txt" in saved_state["local"]
        assert "Team/old.txt" not in saved_state["local"]

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        docs = root / "Docs"
        docs.mkdir()
        child_file = docs / "plan.txt"
        child_file.write_text("folder moved without download", encoding="utf-8")
        signature = client.local_signature(child_file)
        folder_move_api = FakeSharedApi(owned_items=[
            {"idx": 901, "fileOriginName": "Archive", "nodeType": "FOLDER", "parentId": None},
            {
                "idx": 902,
                "fileOriginName": "plan.txt",
                "nodeType": "FILE",
                "parentId": 901,
                "fileSize": signature["size"],
                "lastModifyDate": "same",
            },
        ], shared_items=[])
        state = client.load_state(root)
        state["local"] = {"Docs/plan.txt": signature}
        state["localFolders"] = ["Docs"]
        state["remote"] = {
            "Docs": {"id": 901, "nodeType": "FOLDER"},
            "Docs/plan.txt": {"id": 902, "nodeType": "FILE", "size": signature["size"], "updatedAt": "same"},
        }
        client.save_state(root, state)
        stats = client.pull(folder_move_api, root, include_shared=False)
        assert not docs.exists()
        assert (root / "Archive" / "plan.txt").read_text(encoding="utf-8") == "folder moved without download"
        assert folder_move_api.downloads == []
        assert stats.pulled == 1
        saved_state = client.load_state(root)
        assert "Archive/plan.txt" in saved_state["local"]
        assert "Docs/plan.txt" not in saved_state["local"]

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        docs = root / "Docs"
        docs.mkdir()
        dirty_child = docs / "plan.txt"
        dirty_child.write_text("dirty local folder move edit", encoding="utf-8")
        old_signature = {"size": 18, "mtime": 1}
        dirty_remote_move_api = FakeSharedApi(owned_items=[
            {"idx": 951, "fileOriginName": "Archive", "nodeType": "FOLDER", "parentId": None},
            {
                "idx": 952,
                "fileOriginName": "plan.txt",
                "nodeType": "FILE",
                "parentId": 951,
                "fileSize": len(b"remote moved"),
                "lastModifyDate": "same",
            },
        ], shared_items=[])
        dirty_remote_move_api.download_payloads[952] = b"remote moved"
        state = client.load_state(root)
        state["local"] = {"Docs/plan.txt": old_signature}
        state["localFolders"] = ["Docs"]
        state["remote"] = {
            "Docs": {"id": 951, "nodeType": "FOLDER"},
            "Docs/plan.txt": {"id": 952, "nodeType": "FILE", "size": old_signature["size"], "updatedAt": "same"},
        }
        client.save_state(root, state)
        stats = client.pull(dirty_remote_move_api, root, include_shared=False)
        assert dirty_child.read_text(encoding="utf-8") == "dirty local folder move edit"
        assert (root / "Archive" / "plan.txt").read_text(encoding="utf-8") == "remote moved"
        assert dirty_remote_move_api.downloads == [(952, False)]
        assert stats.skipped_dirty >= 1

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "Team").mkdir()
        local_file = root / "Team" / "launch.txt"
        local_file.write_text("local", encoding="utf-8")
        owned_items = [
            {"idx": 401, "fileOriginName": "Team", "nodeType": "FOLDER", "parentId": None},
            {
                "idx": 403,
                "fileOriginName": "launch.txt",
                "nodeType": "FILE",
                "parentId": 401,
                "fileSize": 6,
                "lastModifyDate": "new",
            },
        ]
        conflict_api = FakeSharedApi(owned_items=owned_items, shared_items=[])
        conflict_api.download_payloads[403] = b"remote"
        state = client.load_state(root)
        state["local"] = {"Team/launch.txt": {"size": 5, "mtime": 1}}
        state["localFolders"] = ["Team"]
        state["remote"] = {
            "Team": {"id": 401, "nodeType": "FOLDER"},
            "Team/launch.txt": {"id": 402, "nodeType": "FILE", "size": 5, "updatedAt": "old"},
        }
        client.save_state(root, state)
        stats = client.push(conflict_api, root)
        conflict_files = list((root / "Team").glob("launch (conflict *).txt"))
        assert local_file.read_text(encoding="utf-8") == "remote"
        assert len(conflict_files) == 1
        assert conflict_files[0].read_text(encoding="utf-8") == "local"
        assert conflict_api.downloads == [(403, False)]
        assert conflict_api.trashed_owned == []
        assert conflict_api.uploads == []
        assert stats.pulled == 1
        assert stats.skipped_dirty == 1

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        shared_file = root / "Shared" / "admin@example.com" / "Team" / "shared.txt"
        shared_file.parent.mkdir(parents=True)
        shared_file.write_text("local shared", encoding="utf-8")
        shared_items = [
            {
                "idx": 501,
                "fileOriginName": "Team",
                "nodeType": "FOLDER",
                "parentId": None,
                "ownerEmail": "admin@example.com",
                "permission": "WRITE",
                "writable": True,
            },
            {
                "idx": 503,
                "fileOriginName": "shared.txt",
                "nodeType": "FILE",
                "parentId": 501,
                "fileSize": 13,
                "lastModifyDate": "new",
                "ownerEmail": "admin@example.com",
                "permission": "WRITE",
                "writable": True,
            },
        ]
        shared_conflict_api = FakeSharedApi(shared_items=shared_items)
        shared_conflict_api.download_payloads[503] = b"remote shared"
        state = client.load_state(root)
        state["local"] = {"Shared/admin@example.com/Team/shared.txt": {"size": 12, "mtime": 1}}
        state["localFolders"] = ["Shared/admin@example.com", "Shared/admin@example.com/Team"]
        state["remote"] = {
            "Shared/admin@example.com/Team": {
                "id": 501,
                "nodeType": "FOLDER",
                "sharedWithMe": True,
                "permission": "WRITE",
                "writable": True,
            },
            "Shared/admin@example.com/Team/shared.txt": {
                "id": 502,
                "nodeType": "FILE",
                "size": 12,
                "updatedAt": "old",
                "sharedWithMe": True,
                "permission": "WRITE",
                "writable": True,
            },
        }
        stats = client.SyncStats()
        client.push_shared(shared_conflict_api, root, state, stats)
        conflict_files = list(shared_file.parent.glob("shared (conflict *).txt"))
        assert shared_file.read_text(encoding="utf-8") == "remote shared"
        assert len(conflict_files) == 1
        assert conflict_files[0].read_text(encoding="utf-8") == "local shared"
        assert shared_conflict_api.downloads == [(503, True)]
        assert shared_conflict_api.trashed_shared == []
        assert shared_conflict_api.uploads == []
        assert stats.pulled == 1
        assert stats.skipped_dirty == 1

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        download_only_file = root / "Shared" / "admin@example.com" / "DownloadOnly" / "notes.txt"
        download_only_file.parent.mkdir(parents=True)
        download_only_file.write_text("local edit", encoding="utf-8")
        (download_only_file.parent / "local-only.txt").write_text("new local file", encoding="utf-8")
        shared_items = [
            {
                "idx": 601,
                "fileOriginName": "DownloadOnly",
                "nodeType": "FOLDER",
                "parentId": None,
                "ownerEmail": "admin@example.com",
                "permission": "DOWNLOAD",
                "writable": False,
                "downloadable": True,
            },
            {
                "idx": 602,
                "fileOriginName": "notes.txt",
                "nodeType": "FILE",
                "parentId": 601,
                "fileSize": 12,
                "lastModifyDate": "same",
                "ownerEmail": "admin@example.com",
                "permission": "DOWNLOAD",
                "writable": False,
                "downloadable": True,
            },
            {
                "idx": 603,
                "fileOriginName": "deleted.txt",
                "nodeType": "FILE",
                "parentId": 601,
                "fileSize": 7,
                "lastModifyDate": "same",
                "ownerEmail": "admin@example.com",
                "permission": "DOWNLOAD",
                "writable": False,
                "downloadable": True,
            },
        ]
        read_only_api = FakeSharedApi(shared_items=shared_items)
        state = client.load_state(root)
        state["local"] = {
            "Shared/admin@example.com/DownloadOnly/notes.txt": {"size": 11, "mtime": 1},
            "Shared/admin@example.com/DownloadOnly/deleted.txt": {"size": 7, "mtime": 1},
        }
        state["localFolders"] = ["Shared/admin@example.com", "Shared/admin@example.com/DownloadOnly"]
        state["remote"] = {
            "Shared/admin@example.com/DownloadOnly": {
                "id": 601,
                "nodeType": "FOLDER",
                "sharedWithMe": True,
                "permission": "DOWNLOAD",
                "writable": False,
                "downloadable": True,
            },
            "Shared/admin@example.com/DownloadOnly/notes.txt": {
                "id": 602,
                "nodeType": "FILE",
                "size": 12,
                "updatedAt": "same",
                "sharedWithMe": True,
                "permission": "DOWNLOAD",
                "writable": False,
                "downloadable": True,
            },
            "Shared/admin@example.com/DownloadOnly/deleted.txt": {
                "id": 603,
                "nodeType": "FILE",
                "size": 7,
                "updatedAt": "same",
                "sharedWithMe": True,
                "permission": "DOWNLOAD",
                "writable": False,
                "downloadable": True,
            },
        }
        stats = client.SyncStats()
        client.push_shared(read_only_api, root, state, stats)
        assert read_only_api.uploads == []
        assert read_only_api.created_folders == []
        assert read_only_api.trashed_shared == []
        assert stats.pushed == 0
        assert stats.deleted == 0
        assert stats.skipped_dirty >= 3

        current_remote = client.build_remote_tree(read_only_api, include_shared=True)
        state["remote"] = {
            rel: client.remote_state_snapshot(item) for rel, item in current_remote.items()
        }
        state["local"] = client.scan_local_signatures(root)
        state["localFolders"] = client.scan_local_folder_entries(root)
        client.save_state(root, state)
        read_only_api.download_payloads[602] = b"remote notes"
        read_only_api.download_payloads[603] = b"remote deleted"
        shutil.rmtree(download_only_file.parent)

        restore_stats = client.pull(read_only_api, root, include_shared=True)
        assert (download_only_file.parent / "notes.txt").read_text(encoding="utf-8") == "remote notes"
        assert (download_only_file.parent / "deleted.txt").read_text(encoding="utf-8") == "remote deleted"
        assert not (download_only_file.parent / "local-only.txt").exists()
        assert not ((download_only_file.parent / "notes.txt").stat().st_mode & stat.S_IWRITE)
        assert not ((download_only_file.parent / "deleted.txt").stat().st_mode & stat.S_IWRITE)
        assert restore_stats.pulled == 2

        client.make_file_writable(download_only_file.parent / "notes.txt")
        (download_only_file.parent / "notes.txt").write_text("local notes!", encoding="utf-8")
        forced_restore_stats = client.pull(read_only_api, root, include_shared=True)
        assert (download_only_file.parent / "notes.txt").read_text(encoding="utf-8") == "remote notes"
        assert not ((download_only_file.parent / "notes.txt").stat().st_mode & stat.S_IWRITE)
        assert forced_restore_stats.pulled >= 1

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        view_only_file = root / "Shared" / "admin@example.com" / "ViewOnly" / "secret.txt"
        view_only_file.parent.mkdir(parents=True)
        view_only_file.write_text("stale local copy", encoding="utf-8")
        shared_items = [
            {
                "idx": 701,
                "fileOriginName": "ViewOnly",
                "nodeType": "FOLDER",
                "parentId": None,
                "ownerEmail": "admin@example.com",
                "permission": "READ",
                "writable": False,
                "downloadable": False,
            },
            {
                "idx": 702,
                "fileOriginName": "secret.txt",
                "nodeType": "FILE",
                "parentId": 701,
                "fileSize": 12,
                "lastModifyDate": "new",
                "ownerEmail": "admin@example.com",
                "permission": "READ",
                "writable": False,
                "downloadable": False,
            },
        ]
        view_only_api = FakeSharedApi(shared_items=shared_items)
        state = client.load_state(root)
        state["local"] = {
            "Shared/admin@example.com/ViewOnly/secret.txt": client.local_signature(view_only_file),
        }
        state["localFolders"] = ["Shared/admin@example.com", "Shared/admin@example.com/ViewOnly"]
        state["remote"] = {
            "Shared/admin@example.com/ViewOnly": {"id": 701, "nodeType": "FOLDER", "sharedWithMe": True, "permission": "READ"},
            "Shared/admin@example.com/ViewOnly/secret.txt": {
                "id": 702,
                "nodeType": "FILE",
                "size": 12,
                "updatedAt": "old",
                "sharedWithMe": True,
                "permission": "READ",
                "downloadable": False,
            },
        }
        client.save_state(root, state)
        pull_stats = client.pull(view_only_api, root, include_shared=True)
        assert view_only_api.downloads == []
        assert not view_only_file.exists()
        assert pull_stats.deleted == 1

    print("desktop client offline verification passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
