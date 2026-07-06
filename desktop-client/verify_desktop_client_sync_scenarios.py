#!/usr/bin/env python3
"""Upload, delete, move, and conflict sync scenarios for desktop verification."""

from __future__ import annotations

import shutil
import stat
import tempfile
from pathlib import Path

import fileinnout_desktop as client
from verify_desktop_client_fakes import FakeSharedApi


def verify_sync_transfer_scenarios() -> None:
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
