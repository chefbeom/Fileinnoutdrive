#!/usr/bin/env python3
"""Share command and pending-share scenarios for desktop client verification."""

from __future__ import annotations

from argparse import Namespace
from contextlib import redirect_stdout
import io
import tempfile
from pathlib import Path

import fileinnout_desktop as client
from verify_desktop_client_fakes import FakeSharedApi


def verify_shared_path_share_command_scenario() -> None:
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


def verify_pending_share_scenarios() -> None:
    original_make_api = client.make_api
    original_config_path = client.GLOBAL_CONFIG_PATH
    original_legacy_config_path = client.LEGACY_GLOBAL_CONFIG_PATH
    original_prepare_local_drive_config = client.prepare_local_drive_config
    original_sync_profile = client.sync_profile
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


def verify_owned_share_command_scenarios(root: Path) -> None:
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
        client.GLOBAL_CONFIG_PATH = root / ".fileinnout-share-config.json"
        client.LEGACY_GLOBAL_CONFIG_PATH = root / ".fileinnout-share-legacy-config.json"
        client.save_global_config({
            "server": "http://desktop.example/api",
            "token": "share-token",
            "email": "owner@example.com",
            "syncDir": str(root),
        })
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
        client.update_global_config({
            "server": "http://desktop.example/api",
            "token": "saved-token",
            "email": "owner@example.com",
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
