#!/usr/bin/env python3
"""Offline checks for the desktop sync client path and state helpers."""

from __future__ import annotations

from contextlib import redirect_stdout
import http.client
import io
import json
import os
import sys
import tempfile
from argparse import Namespace
from pathlib import Path

import fileinnout_desktop as client
from verify_desktop_client_drive_scenarios import verify_drive_root_and_folder_scenarios
from verify_desktop_client_fakes import FakeSharedApi
from verify_desktop_client_share_scenarios import (
    verify_owned_share_command_scenarios,
    verify_pending_share_scenarios,
    verify_shared_path_share_command_scenario,
)

from verify_desktop_client_sync_scenarios import verify_sync_transfer_scenarios

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

    original_default_server = os.environ.get("FILEINNOUT_DESKTOP_SERVER")
    try:
        os.environ.pop("FILEINNOUT_DESKTOP_SERVER", None)
        assert client.default_backend_url() == "http://localhost/api"
        assert client.frontend_url_from_config({}) == "http://localhost"
        os.environ["FILEINNOUT_DESKTOP_SERVER"] = "https://drive.example.com/api/"
        assert client.default_backend_url() == "https://drive.example.com/api"
        assert client.frontend_url_from_config({}) == "https://drive.example.com"
    finally:
        if original_default_server is None:
            os.environ.pop("FILEINNOUT_DESKTOP_SERVER", None)
        else:
            os.environ["FILEINNOUT_DESKTOP_SERVER"] = original_default_server
    assert client.resolve_login_password(Namespace(password="direct", password_stdin=False)) == "direct"
    original_stdin = sys.stdin
    try:
        sys.stdin = io.StringIO("from-stdin\n")
        assert client.resolve_login_password(Namespace(password=None, password_stdin=True)) == "from-stdin"
        sys.stdin = io.StringIO("")
        try:
            client.resolve_login_password(Namespace(password=None, password_stdin=True))
            raise AssertionError("empty password stdin should fail")
        except client.DesktopError as error:
            assert "stdin" in str(error)
    finally:
        sys.stdin = original_stdin
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

    with tempfile.TemporaryDirectory() as tmp_conflict:
        conflict_root = Path(tmp_conflict)
        local_file = conflict_root / "doc.txt"
        local_file.write_text("local draft", encoding="utf-8")
        conflict_api = FakeSharedApi()
        conflict_api.download_payloads[77] = b"remote draft"
        conflict_stats = client.SyncStats()
        client.preserve_local_conflict(
            conflict_api,
            local_file,
            {"idx": 77, "fileOriginName": "doc.txt", "nodeType": "FILE"},
            shared=False,
            stats=conflict_stats,
        )
        conflict_files = list(conflict_root.glob("doc (conflict *.txt"))
        assert local_file.read_bytes() == b"remote draft"
        assert len(conflict_files) == 1
        assert conflict_files[0].read_text(encoding="utf-8") == "local draft"
        conflict_payload = client.stats_to_dict(conflict_stats)
        assert conflict_payload["skippedDirty"] == 1
        assert conflict_payload["conflicts"][0]["conflictPath"] == str(conflict_files[0])
        assert conflict_payload["conflicts"][0]["remoteName"] == "doc.txt"
        client.update_sync_status(conflict_root, "success", pull_stats=conflict_stats)
        sync_status = client.load_state(conflict_root)["syncStatus"]
        assert sync_status["pull"]["conflicts"][0]["remoteId"] == 77

    verify_shared_path_share_command_scenario()

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

    verify_drive_root_and_folder_scenarios()

    verify_pending_share_scenarios()

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

    original_load_global_config = client.load_global_config
    original_update_global_config = client.update_global_config
    original_urlopen = client.urllib.request.urlopen
    stored_config = {
        "server": "http://example.test/api",
        "refreshToken": "stored-refresh",
    }
    config_updates: list[dict] = []
    make_api_calls: list[str] = []
    try:
        def fake_load_global_config():
            return dict(stored_config)

        def fake_update_global_config(changes):
            config_updates.append(dict(changes))
            stored_config.update(changes)
            return dict(stored_config)

        def fake_make_api_urlopen(request, timeout=120):
            path = client.urllib.parse.urlparse(request.full_url).path
            make_api_calls.append(path)
            assert request.get_header("Cookie") == "refresh=stored-refresh"
            return FakeHttpResponse(
                200,
                {
                    "Authorization": "Bearer restored-access",
                    "Set-Cookie": "refresh=restored-refresh; Path=/; HttpOnly",
                },
                b"ok",
            )

        client.load_global_config = fake_load_global_config
        client.update_global_config = fake_update_global_config
        client.urllib.request.urlopen = fake_make_api_urlopen

        api = client.make_api(Namespace(server=None, token=None))
        assert make_api_calls == ["/api/auth/reissue"]
        assert api.token == "restored-access"
        assert api.refresh_token == "restored-refresh"
        assert stored_config["token"] == "restored-access"
        assert stored_config["refreshToken"] == "restored-refresh"
        assert config_updates == [
            {
                "token": "restored-access",
                "refreshToken": "restored-refresh",
            }
        ]
    finally:
        client.load_global_config = original_load_global_config
        client.update_global_config = original_update_global_config
        client.urllib.request.urlopen = original_urlopen

    account_config = {
        "email": "owner@example.com",
        "token": "owner-token",
        "refreshToken": "owner-refresh",
        "syncDir": "C:/FileInNOut/owner",
        "syncFolders": [
            {
                "name": "Owner",
                "localPath": "C:/FileInNOut/owner",
                "remotePath": "Owner",
                "direction": "two-way",
                "enabled": True,
            }
        ],
    }
    client.snapshot_account_profile(account_config)
    assert account_config["accounts"]["owner@example.com"]["syncDir"] == "C:/FileInNOut/owner"
    account_config["email"] = "recipient@example.com"
    client.apply_account_profile(account_config, "recipient@example.com", include_tokens=False)
    assert "syncFolders" not in account_config
    assert account_config["syncDir"].endswith("recipient%40example.com\\sync") or account_config["syncDir"].endswith("recipient%40example.com/sync")
    account_config["syncDir"] = "C:/FileInNOut/recipient"
    client.snapshot_account_profile(account_config)
    account_config["syncDir"] = "C:/FileInNOut/changed"
    client.apply_account_profile(account_config, "owner@example.com", include_tokens=False)
    assert account_config["syncDir"] == "C:/FileInNOut/owner"

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
            raw_config = json.loads(client.GLOBAL_CONFIG_PATH.read_text(encoding="utf-8"))
            if client.dpapi_available():
                assert "token" not in raw_config
                assert raw_config["tokenProtected"] != "token"
                assert client.dpapi_unprotect_text(raw_config["tokenProtected"]) == "token"
            else:
                assert raw_config["token"] == "token"
            client.update_global_config({"syncDir": str(root), "email": "owner@example.com"})
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

        verify_owned_share_command_scenarios(root)

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

    verify_sync_transfer_scenarios()

    print("desktop client offline verification passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
