from __future__ import annotations

import os
import shutil
import time
from pathlib import Path
from typing import Any

from fileinnout_desktop_constants import (
    SHARED_ROOT_NAME,
    SKIPPED_FILE_PREFIXES,
    SKIPPED_FILE_SUFFIXES,
    SKIPPED_FILES,
    SKIPPED_ROOTS,
)
from fileinnout_desktop_models import DesktopError, SyncStats
from fileinnout_desktop_files import make_file_writable, make_tree_writable
from fileinnout_desktop_api import FileInNOutApi
from fileinnout_desktop_paths import (
    has_ancestor_rel,
    is_descendant_rel,
    normalize_rel,
    replace_rel_prefix,
)
from fileinnout_desktop_remote import (
    file_id,
    item_name,
    node_type,
    remote_state_snapshot,
)

def local_signature(path: Path) -> dict[str, Any]:
    info = path.stat()
    return {
        "size": info.st_size,
        "mtime": int(info.st_mtime),
        "mtimeMs": int(info.st_mtime_ns / 1_000_000),
    }

def local_signature_matches(previous: dict[str, Any] | None, current: dict[str, Any]) -> bool:
    if not previous:
        return False
    if current.get("size") != previous.get("size"):
        return False
    if previous.get("mtimeMs") is not None:
        return current.get("mtimeMs") == previous.get("mtimeMs")
    return current.get("mtime") == previous.get("mtime")

def is_local_dirty(root: Path, rel: str, state: dict[str, Any]) -> bool:
    path = root / Path(rel)
    if not path.is_file():
        return False
    previous = state.get("local", {}).get(rel)
    if not previous:
        return False
    return not local_signature_matches(previous, local_signature(path))

def local_pending_change_count(root: Path, state: dict[str, Any]) -> int:
    if not root.exists():
        return 0
    current = scan_local_signatures(root)
    previous = state.get("local", {}) if isinstance(state.get("local"), dict) else {}
    changed_or_new = [
        rel
        for rel in current
        if rel not in previous or is_local_dirty(root, rel, state)
    ]
    deleted = [rel for rel in previous if rel not in current]
    return len(changed_or_new) + len(deleted)

def conflict_copy_path(path: Path) -> Path:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    stem = path.stem
    suffix = path.suffix
    for index in range(1000):
        marker = f"conflict {stamp}" if index == 0 else f"conflict {stamp}-{index}"
        candidate = path.with_name(f"{stem} ({marker}){suffix}")
        if not candidate.exists():
            return candidate
    raise DesktopError(f"could not allocate conflict copy name for {path}")

def preserve_local_conflict(
    api: FileInNOutApi,
    local_path: Path,
    remote_item: dict[str, Any],
    shared: bool,
    stats: SyncStats,
) -> None:
    item_id = file_id(remote_item)
    if item_id is None:
        stats.skipped_dirty += 1
        return

    try:
        payload = api.download(item_id, shared=shared)
    except DesktopError:
        stats.download_failed += 1
        return

    conflict_path = conflict_copy_path(local_path)
    conflict_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(local_path, conflict_path)
    make_file_writable(conflict_path)

    tmp = local_path.with_suffix(local_path.suffix + ".download")
    tmp.write_bytes(payload)
    make_file_writable(local_path)
    tmp.replace(local_path)
    stats.pulled += 1
    stats.skipped_dirty += 1
    stats.conflicts.append({
        "localPath": str(local_path),
        "conflictPath": str(conflict_path),
        "remoteId": item_id,
        "remoteName": item_name(remote_item),
        "scope": "shared" if shared else "owned",
        "resolvedAt": int(time.time()),
    })

def remove_synced_file_if_clean(root: Path, rel: str, state: dict[str, Any], stats: SyncStats) -> bool:
    path = root / Path(rel)
    if not path.is_file():
        return False

    previous = state.get("local", {}).get(rel)
    if previous and not local_signature_matches(previous, local_signature(path)):
        stats.skipped_dirty += 1
        return False

    make_file_writable(path)
    path.unlink()
    stats.deleted += 1
    return True

def remove_synced_tree_if_clean(root: Path, rel: str, state: dict[str, Any], stats: SyncStats) -> bool:
    tree_root = root / Path(rel)
    if not tree_root.exists():
        return False

    removed_any = False
    known_files = [
        file_rel for file_rel in state.get("local", {})
        if is_descendant_rel(file_rel, rel)
    ]
    for file_rel in sorted(known_files, key=lambda value: len(Path(value).parts), reverse=True):
        removed_any = remove_synced_file_if_clean(root, file_rel, state, stats) or removed_any

    known_folders = [
        folder_rel for folder_rel in state.get("localFolders", [])
        if is_descendant_rel(folder_rel, rel)
    ]
    for folder_rel in sorted(known_folders, key=lambda value: len(Path(value).parts), reverse=True):
        folder = root / Path(folder_rel)
        try:
            folder.rmdir()
            stats.deleted += 1
            removed_any = True
        except (FileNotFoundError, OSError):
            pass

    if tree_root.is_dir():
        try:
            make_file_writable(tree_root)
            tree_root.rmdir()
            stats.deleted += 1
            removed_any = True
        except OSError:
            pass

    return removed_any

def remap_state_path_prefix(state: dict[str, Any], old_rel: str, new_rel: str) -> None:
    for key in ("local", "remote"):
        values = state.get(key)
        if not isinstance(values, dict):
            continue
        remapped: dict[str, Any] = {}
        for rel, value in list(values.items()):
            if not is_descendant_rel(rel, old_rel):
                continue
            mapped_rel = replace_rel_prefix(rel, old_rel, new_rel)
            remapped[mapped_rel] = value
            values.pop(rel, None)
        values.update(remapped)

    folders = state.get("localFolders")
    if isinstance(folders, list):
        mapped_folders = [
            replace_rel_prefix(rel, old_rel, new_rel) if is_descendant_rel(rel, old_rel) else rel
            for rel in folders
        ]
        state["localFolders"] = sorted(set(mapped_folders))

def local_tree_clean(root: Path, rel: str, state: dict[str, Any]) -> bool:
    for file_rel in state.get("local", {}):
        if not is_descendant_rel(file_rel, rel):
            continue
        path = root / Path(file_rel)
        if not path.is_file():
            continue
        previous = state.get("local", {}).get(file_rel) or {}
        if not local_signature_matches(previous, local_signature(path)):
            return False
    return True

def apply_remote_path_moves(
    root: Path,
    state: dict[str, Any],
    remote: dict[str, dict[str, Any]],
    stats: SyncStats,
) -> None:
    previous_remote = state.get("remote", {})
    if not previous_remote:
        return

    remote_snapshots = {rel: remote_state_snapshot(item) for rel, item in remote.items()}
    current_by_id: dict[Any, list[tuple[str, dict[str, Any]]]] = {}
    for rel, current in remote_snapshots.items():
        current_id = current.get("id")
        if current_id is None:
            continue
        current_by_id.setdefault(current_id, []).append((rel, current))

    moved_roots: set[str] = set()
    missing_rels = sorted(
        (rel for rel in previous_remote if rel not in remote),
        key=lambda value: len(Path(value).parts),
    )
    for old_rel in missing_rels:
        if has_ancestor_rel(old_rel, moved_roots):
            continue
        previous = previous_remote.get(old_rel) or {}
        previous_id = previous.get("id")
        if previous_id is None:
            continue
        candidates = [
            (new_rel, current)
            for new_rel, current in current_by_id.get(previous_id, [])
            if new_rel not in previous_remote
            and current.get("nodeType") == previous.get("nodeType")
        ]
        if len(candidates) != 1:
            continue

        new_rel, current = candidates[0]
        source = root / Path(old_rel)
        target = root / Path(new_rel)
        if target.exists():
            continue

        node = str(previous.get("nodeType") or current.get("nodeType") or "").upper()
        if node == "FOLDER":
            if not source.is_dir() or not local_tree_clean(root, old_rel, state):
                continue
        else:
            if not source.is_file() or is_local_dirty(root, old_rel, state):
                continue

        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            make_tree_writable(source)
            shutil.move(str(source), str(target))
        except OSError:
            continue

        remap_state_path_prefix(state, old_rel, new_rel)
        moved_roots.add(old_rel)
        stats.pulled += 1

def sync_remote_deletions(root: Path, state: dict[str, Any], remote: dict[str, dict[str, Any]], stats: SyncStats) -> None:
    previous_remote = state.get("remote", {})
    removed_roots: set[str] = set()
    missing_rels = sorted(
        (rel for rel in previous_remote if rel not in remote),
        key=lambda value: len(Path(value).parts),
    )

    for rel in missing_rels:
        if has_ancestor_rel(rel, removed_roots):
            continue

        previous = previous_remote.get(rel) or {}
        if previous.get("nodeType") == "FOLDER":
            if remove_synced_tree_if_clean(root, rel, state, stats):
                removed_roots.add(rel)
            continue

        if remove_synced_file_if_clean(root, rel, state, stats):
            removed_roots.add(rel)

def scan_local_signatures(root: Path) -> dict[str, dict[str, Any]]:
    signatures: dict[str, dict[str, Any]] = {}
    for path in iter_local_paths(root, files_only=True, include_shared=True):
        rel = normalize_rel(path.relative_to(root))
        signatures[rel] = local_signature(path)
    return signatures

def scan_local_folder_entries(root: Path, include_shared: bool = True) -> list[str]:
    return sorted(
        normalize_rel(path.relative_to(root))
        for path in iter_local_paths(root, files_only=False, include_shared=include_shared)
    )

def scan_owned_local_signatures(root: Path) -> dict[str, dict[str, Any]]:
    signatures: dict[str, dict[str, Any]] = {}
    for path in iter_local_paths(root, files_only=True, include_shared=False):
        rel = normalize_rel(path.relative_to(root))
        signatures[rel] = local_signature(path)
    return signatures

def iter_local_paths(root: Path, files_only: bool, include_shared: bool = False) -> list[Path]:
    paths: list[Path] = []
    for current_root, dir_names, file_names in os.walk(root):
        current = Path(current_root)
        dir_names[:] = [
            name for name in dir_names
            if name not in SKIPPED_ROOTS
            and (include_shared or name != SHARED_ROOT_NAME)
            and not name.startswith(".~")
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

def should_skip_file_name(file_name: str) -> bool:
    name = file_name.strip()
    if not name or name in SKIPPED_FILES:
        return True
    lowered = name.lower()
    if any(name.startswith(prefix) for prefix in SKIPPED_FILE_PREFIXES):
        return True
    return any(lowered.endswith(suffix) for suffix in SKIPPED_FILE_SUFFIXES)
