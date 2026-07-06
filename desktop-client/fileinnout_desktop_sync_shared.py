from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fileinnout_desktop_constants import SHARED_ROOT_NAME, SKIPPED_ROOTS
from fileinnout_desktop_models import DesktopError, SyncStats
from fileinnout_desktop_files import make_file_readonly, make_file_writable
from fileinnout_desktop_api import FileInNOutApi
from fileinnout_desktop_paths import has_ancestor_rel, normalize_rel
from fileinnout_desktop_profiles import join_scope_rel
from fileinnout_desktop_remote import (
    build_remote_tree,
    file_id,
    is_downloadable_shared_item,
    is_uploadable_shared_item,
    is_writable_shared_item,
    node_type,
    remote_changed_since_state,
    remote_id_matches_previous,
)
from fileinnout_desktop_sync_local import (
    local_signature,
    local_signature_matches,
    preserve_local_conflict,
    should_skip_file_name,
)

def is_shared_rel(rel: str) -> bool:
    return normalize_rel(rel).split("/", 1)[0] == SHARED_ROOT_NAME

def is_virtual_shared_owner_rel(rel: str) -> bool:
    parts = normalize_rel(rel).split("/")
    return len(parts) <= 2 and parts[0] == SHARED_ROOT_NAME

def should_apply_local_readonly(remote_rel: str, item: dict[str, Any] | None) -> bool:
    if not item or node_type(item) == "FOLDER":
        return False
    if not is_shared_rel(remote_rel):
        return False
    if not (item.get("_sharedWithMe") or item.get("sharedWithMe")):
        return False
    return not is_uploadable_shared_item(item)

def apply_shared_readonly_attributes(
    local_root: Path,
    remote_path: str,
    remote: dict[str, dict[str, Any]],
) -> None:
    for local_rel, item in remote.items():
        if node_type(item) == "FOLDER":
            continue
        path = local_root / Path(local_rel)
        if not path.exists() or not path.is_file():
            continue
        remote_rel = join_scope_rel(remote_path, local_rel)
        if should_apply_local_readonly(remote_rel, item):
            make_file_readonly(path)
        elif is_shared_rel(remote_rel) and (item.get("_sharedWithMe") or item.get("sharedWithMe")):
            make_file_writable(path)

def is_non_uploadable_shared_file(remote_rel: str, item: dict[str, Any] | None) -> bool:
    if not item or node_type(item) == "FOLDER":
        return False
    if not is_shared_rel(remote_rel):
        return False
    if not (item.get("_sharedWithMe") or item.get("sharedWithMe")):
        return False
    return not is_uploadable_shared_item(item)

def remove_unauthorized_local_shared_file(local_path: Path, stats: SyncStats) -> bool:
    if not local_path.exists():
        return False
    if not local_path.is_file():
        stats.skipped_dirty += 1
        return False
    try:
        make_file_writable(local_path)
        local_path.unlink()
        stats.deleted += 1
        return True
    except OSError:
        stats.skipped_dirty += 1
        return False

def has_writable_shared_anchor(remote_paths: dict[str, dict[str, Any]], rel: str) -> bool:
    current = normalize_rel(rel)
    while current and not is_virtual_shared_owner_rel(current):
        item = remote_paths.get(current)
        if item and node_type(item) == "FOLDER":
            return is_writable_shared_item(item)
        parent = normalize_rel(Path(current).parent)
        if parent == "." or parent == current:
            break
        current = parent
    return False

def has_uploadable_shared_anchor(remote_paths: dict[str, dict[str, Any]], rel: str) -> bool:
    current = normalize_rel(rel)
    while current and not is_virtual_shared_owner_rel(current):
        item = remote_paths.get(current)
        if item and node_type(item) == "FOLDER":
            return is_uploadable_shared_item(item)
        parent = normalize_rel(Path(current).parent)
        if parent == "." or parent == current:
            break
        current = parent
    return False

def iter_shared_paths(root: Path, files_only: bool) -> list[Path]:
    shared_root = root / SHARED_ROOT_NAME
    if not shared_root.exists():
        return []

    paths: list[Path] = []
    for current_root, dir_names, file_names in os.walk(shared_root):
        current = Path(current_root)
        dir_names[:] = [
            name for name in dir_names
            if name not in SKIPPED_ROOTS and not name.startswith(".~")
        ]
        if not files_only:
            for dirname in dir_names:
                paths.append(current / dirname)
        if files_only:
            for file_name in file_names:
                if should_skip_file_name(file_name):
                    continue
                paths.append(current / file_name)
    return paths

def ensure_shared_folder(
    api: FileInNOutApi,
    remote_paths: dict[str, dict[str, Any]],
    rel: str,
    stats: SyncStats,
) -> int:
    rel = normalize_rel(rel)
    item = remote_paths.get(rel)
    if item and node_type(item) == "FOLDER":
        item_id = file_id(item)
        if item_id is None:
            raise DesktopError(f"shared folder has no id: {rel}")
        return item_id

    parent_rel = normalize_rel(Path(rel).parent)
    if parent_rel == "." or parent_rel == SHARED_ROOT_NAME:
        raise DesktopError(f"cannot create shared folder without an existing writable parent: {rel}")

    parent_id_value = ensure_shared_folder(api, remote_paths, parent_rel, stats)
    parent_item = remote_paths.get(parent_rel)
    if not is_uploadable_shared_item(parent_item):
        raise DesktopError(f"shared folder is read-only: {parent_rel}")

    created = api.create_shared_folder(parent_id_value, Path(rel).name)
    created["_sharedWithMe"] = True
    created["permission"] = parent_item.get("permission") or "WRITE"
    created["uploadable"] = is_uploadable_shared_item(parent_item)
    created["writable"] = is_writable_shared_item(parent_item)
    remote_paths[rel] = created
    stats.folders_created += 1
    created_id = file_id(created)
    if created_id is None:
        raise DesktopError(f"created shared folder has no id: {rel}")
    return created_id

def sync_deleted_shared(
    api: FileInNOutApi,
    state: dict[str, Any],
    remote_paths: dict[str, dict[str, Any]],
    current_files: dict[str, dict[str, Any]],
    current_folders: set[str],
    stats: SyncStats,
) -> set[str]:
    deleted_folders: set[str] = set()
    previous_folders = [
        rel for rel in state.get("localFolders", [])
        if rel and is_shared_rel(rel) and not is_virtual_shared_owner_rel(rel)
    ]

    for rel in sorted(previous_folders, key=lambda value: len(Path(value).parts)):
        if rel in current_folders or has_ancestor_rel(rel, deleted_folders):
            continue
        remote_item = remote_paths.get(rel)
        if node_type(remote_item or {}) != "FOLDER" or not remote_id_matches_previous(state, rel, remote_item):
            continue
        if not is_writable_shared_item(remote_item):
            stats.skipped_dirty += 1
            continue
        item_id = file_id(remote_item)
        if item_id is None:
            continue
        api.trash_shared_file(item_id)
        remote_paths.pop(rel, None)
        deleted_folders.add(rel)
        stats.deleted += 1

    for rel in list(state.get("local", {}).keys()):
        if (
            not is_shared_rel(rel)
            or rel in current_files
            or has_ancestor_rel(rel, deleted_folders)
            or is_virtual_shared_owner_rel(rel)
        ):
            continue
        remote_item = remote_paths.get(rel)
        if node_type(remote_item or {}) == "FOLDER" or not remote_id_matches_previous(state, rel, remote_item):
            continue
        if not is_writable_shared_item(remote_item):
            stats.skipped_dirty += 1
            continue
        item_id = file_id(remote_item)
        if item_id is None:
            continue
        api.trash_shared_file(item_id)
        remote_paths.pop(rel, None)
        stats.deleted += 1

    return deleted_folders

def push_shared(api: FileInNOutApi, root: Path, state: dict[str, Any], stats: SyncStats) -> None:
    remote_paths = build_remote_tree(api, include_shared=True)
    current_shared_files = {
        normalize_rel(path.relative_to(root)): local_signature(path)
        for path in iter_shared_paths(root, files_only=True)
    }
    current_shared_folders = {
        normalize_rel(path.relative_to(root))
        for path in iter_shared_paths(root, files_only=False)
    }

    sync_deleted_shared(api, state, remote_paths, current_shared_files, current_shared_folders, stats)

    for folder in sorted(iter_shared_paths(root, files_only=False), key=lambda p: len(p.parts)):
        rel = normalize_rel(folder.relative_to(root))
        if is_virtual_shared_owner_rel(rel):
            continue
        if remote_paths.get(rel):
            continue
        parent_rel = normalize_rel(Path(rel).parent)
        if not has_uploadable_shared_anchor(remote_paths, parent_rel):
            stats.skipped_dirty += 1
            continue
        ensure_shared_folder(api, remote_paths, rel, stats)

    for path in sorted(iter_shared_paths(root, files_only=True)):
        rel = normalize_rel(path.relative_to(root))
        previous_local = state.get("local", {}).get(rel)
        current_sig = local_signature(path)
        remote_item = remote_paths.get(rel)
        local_changed = not local_signature_matches(previous_local, current_sig)

        if not local_changed and remote_item:
            continue

        if local_changed and remote_changed_since_state(state, rel, remote_item):
            if remote_item and not is_downloadable_shared_item(remote_item):
                stats.skipped_dirty += 1
                continue
            preserve_local_conflict(api, path, remote_item, shared=True, stats=stats)
            continue

        parent_rel = normalize_rel(Path(rel).parent)
        if is_virtual_shared_owner_rel(parent_rel):
            stats.skipped_dirty += 1
            continue

        parent_item = remote_paths.get(parent_rel)
        if not parent_item:
            if not has_uploadable_shared_anchor(remote_paths, parent_rel):
                stats.skipped_dirty += 1
                continue
            ensure_shared_folder(api, remote_paths, parent_rel, stats)
            parent_item = remote_paths.get(parent_rel)

        if not is_uploadable_shared_item(parent_item):
            stats.skipped_dirty += 1
            continue

        parent_id_value = file_id(parent_item)
        if parent_id_value is None:
            raise DesktopError(f"shared folder has no id: {parent_rel}")

        uploaded = api.upload_shared_file(parent_id_value, path, path.name)
        uploaded["_sharedWithMe"] = True
        uploaded["permission"] = parent_item.get("permission") or "WRITE"
        uploaded["uploadable"] = is_uploadable_shared_item(parent_item)
        uploaded["writable"] = is_writable_shared_item(parent_item)
        remote_paths[rel] = uploaded
        stats.pushed += 1
