from __future__ import annotations

import mimetypes
import os
import shutil
import time
from pathlib import Path
from typing import Any

from fileinnout_desktop_constants import (
    CHUNK_SIZE_BYTES,
    DRIVE_ROOT_SKIPPED_FOLDER_NAMES,
    MY_DRIVE_HUB_NAME,
    ROOT_FILE_SYNC_FOLDER_NAME,
    SHARED_DRIVE_HUB_NAME,
    SHARED_ROOT_NAME,
    SKIPPED_FILE_PREFIXES,
    SKIPPED_FILE_SUFFIXES,
    SKIPPED_FILES,
    SKIPPED_ROOTS,
)
from fileinnout_desktop_models import DesktopError, SyncStats
from fileinnout_desktop_state import load_state, save_state, sync_lock, update_sync_status
from fileinnout_desktop_files import is_file_writable, make_file_readonly, make_file_writable, make_tree_writable
from fileinnout_desktop_api import FileInNOutApi
from fileinnout_desktop_windows import is_reparse_point
from fileinnout_desktop_paths import (
    can_treat_as_local_file_move,
    can_treat_as_local_folder_move,
    comparable_path,
    has_ancestor_rel,
    is_descendant_rel,
    normalize_rel,
    parent_rel_of,
    rel_suffix_under,
    replace_rel_prefix,
    safe_segment,
)
from fileinnout_desktop_remote import (
    build_remote_tree,
    file_id,
    is_downloadable_shared_item,
    is_uploadable_shared_item,
    is_writable_shared_item,
    item_name,
    item_updated,
    node_type,
    parent_id,
    remote_changed_since_state,
    remote_id_matches_previous,
    remote_state_snapshot,
)
from fileinnout_desktop_profiles import (
    join_scope_rel,
    legacy_sync_folder_profile,
    normalize_sync_direction,
    strip_scope_rel,
    unique_local_child_path,
    unique_remote_path,
)
from fileinnout_desktop_sync_moves import (
    apply_scoped_file_moves as _apply_scoped_file_moves,
    apply_scoped_folder_moves as _apply_scoped_folder_moves,
    folder_tree_matches,
    folder_tree_shape_matches,
    remote_folder_tree_matches_state,
    remap_remote_paths_prefix,
)
from fileinnout_desktop_sync_shared import (
    apply_shared_readonly_attributes,
    ensure_shared_folder,
    has_uploadable_shared_anchor,
    has_writable_shared_anchor,
    is_non_uploadable_shared_file,
    is_shared_rel,
    is_virtual_shared_owner_rel,
    iter_shared_paths,
    push_shared,
    remove_unauthorized_local_shared_file,
    should_apply_local_readonly,
    sync_deleted_shared,
)
from fileinnout_desktop_drive_adoption import (
    adopt_drive_root_folders,
    drive_root_owned_candidate_roots,
    ensure_drive_root_file_profile,
    ensure_drive_root_hubs,
    iter_drive_root_owned_candidates,
    normalize_drive_root_owned_child,
    should_adopt_drive_root_file,
)
from fileinnout_desktop_sync_local import (
    apply_remote_path_moves,
    conflict_copy_path,
    is_local_dirty,
    iter_local_paths,
    local_pending_change_count,
    local_signature,
    local_signature_matches,
    local_tree_clean,
    preserve_local_conflict,
    remap_state_path_prefix,
    remove_synced_file_if_clean,
    remove_synced_tree_if_clean,
    scan_local_folder_entries,
    scan_local_signatures,
    scan_owned_local_signatures,
    should_skip_file_name,
    sync_remote_deletions,
)

def pull(api: FileInNOutApi, root: Path, include_shared: bool = True) -> SyncStats:
    return pull_scoped(api, root, "", include_shared=include_shared)

def ensure_remote_folder(
    api: FileInNOutApi,
    remote_paths: dict[str, dict[str, Any]],
    rel: str,
    stats: SyncStats,
) -> int | None:
    rel = normalize_rel(rel)
    if not rel:
        return None
    existing = remote_paths.get(rel)
    if existing and node_type(existing) == "FOLDER":
        return file_id(existing)

    parent_rel = normalize_rel(Path(rel).parent)
    if parent_rel == ".":
        parent_rel = ""
    parent = ensure_remote_folder(api, remote_paths, parent_rel, stats) if parent_rel else None
    folder_name = Path(rel).name
    created = api.create_folder(folder_name, parent)
    remote_paths[rel] = created
    stats.folders_created += 1
    return file_id(created)

def upload_file(
    api: FileInNOutApi,
    local_path: Path,
    rel: str,
    parent_id_value: int | None,
    replace_file_id: int | None = None,
) -> None:
    content_type = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"
    suffix = local_path.suffix[1:].lower()
    size = local_path.stat().st_size
    mtime_ms = int(local_path.stat().st_mtime * 1000)
    upload_relative_path = local_path.name if parent_id_value is not None else rel

    init_body = {
            "fileOriginName": local_path.name,
            "fileFormat": suffix,
            "fileSize": size,
            "contentType": content_type,
            "parentId": parent_id_value,
            "relativePath": upload_relative_path,
            "lastModified": mtime_ms,
    }
    if replace_file_id is not None:
        init_body["replaceFileId"] = replace_file_id

    metas = api.init_upload([init_body])
    if not metas:
        raise DesktopError(f"upload init returned no metadata for {rel}")

    first = metas[0]
    chunk_keys = [meta.get("objectKey") for meta in metas if meta.get("objectKey")]
    final_object_key = first.get("finalObjectKey") or first.get("objectKey")
    partitioned = first.get("partitioned") is True

    try:
        with local_path.open("rb") as stream:
            if len(metas) == 1:
                api.put_presigned(first["presignedUploadUrl"], stream.read(), content_type)
            else:
                for meta in metas:
                    api.put_presigned(meta["presignedUploadUrl"], stream.read(CHUNK_SIZE_BYTES), content_type)

        complete_body = {
                "fileOriginName": local_path.name,
                "fileFormat": suffix,
                "fileSize": size,
                "finalObjectKey": final_object_key,
                "chunkObjectKeys": chunk_keys if partitioned else [],
                "parentId": parent_id_value,
                "relativePath": upload_relative_path,
                "lastModified": mtime_ms,
        }
        if replace_file_id is not None:
            complete_body["replaceFileId"] = replace_file_id
        api.complete_upload(complete_body)
    except Exception:
        api.abort_upload(
            {
                "finalObjectKey": final_object_key,
                "chunkObjectKeys": chunk_keys if partitioned else [],
            }
        )
        raise

def sync_deleted_owned(
    api: FileInNOutApi,
    state: dict[str, Any],
    remote_paths: dict[str, dict[str, Any]],
    current_files: dict[str, dict[str, Any]],
    current_folders: set[str],
    stats: SyncStats,
) -> set[str]:
    deleted_folders: set[str] = set()
    previous_folders = [rel for rel in state.get("localFolders", []) if rel and not is_shared_rel(rel)]

    for rel in sorted(previous_folders, key=lambda value: len(Path(value).parts)):
        if rel in current_folders or has_ancestor_rel(rel, deleted_folders):
            continue
        remote_item = remote_paths.get(rel)
        if node_type(remote_item or {}) != "FOLDER" or not remote_id_matches_previous(state, rel, remote_item):
            continue
        item_id = file_id(remote_item)
        if item_id is None:
            continue
        api.trash_file(item_id)
        remote_paths.pop(rel, None)
        deleted_folders.add(rel)
        stats.deleted += 1

    for rel in list(state.get("local", {}).keys()):
        if is_shared_rel(rel) or rel in current_files or has_ancestor_rel(rel, deleted_folders):
            continue
        remote_item = remote_paths.get(rel)
        if node_type(remote_item or {}) == "FOLDER" or not remote_id_matches_previous(state, rel, remote_item):
            continue
        item_id = file_id(remote_item)
        if item_id is None:
            continue
        api.trash_file(item_id)
        remote_paths.pop(rel, None)
        stats.deleted += 1

    return deleted_folders

def push(api: FileInNOutApi, root: Path) -> SyncStats:
    return push_scoped(api, root, "")

def print_stats(label: str, stats: SyncStats) -> None:
    print(
        f"{label}: pulled={stats.pulled} pushed={stats.pushed} deleted={stats.deleted} "
        f"folders_created={stats.folders_created} skipped_dirty={stats.skipped_dirty} "
        f"download_failed={stats.download_failed}"
    )

def build_scoped_remote_tree(
    api: FileInNOutApi,
    remote_path: str,
    include_shared: bool = True,
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    full_remote = build_remote_tree(api, include_shared=include_shared)
    scoped: dict[str, dict[str, Any]] = {}
    for remote_rel, item in full_remote.items():
        local_rel = strip_scope_rel(remote_rel, remote_path)
        if local_rel is None or local_rel == "":
            continue
        scoped[local_rel] = item
    return full_remote, scoped

def prepare_scoped_state(state: dict[str, Any], remote_path: str) -> dict[str, Any]:
    remote_path = normalize_rel(remote_path)
    if state.get("scopeRemotePath") == remote_path:
        return state
    if remote_path == "" and "scopeRemotePath" not in state:
        state["scopeRemotePath"] = ""
        state.setdefault("local", {})
        state.setdefault("localFolders", [])
        state.setdefault("remote", {})
        return state
    state["scopeRemotePath"] = remote_path
    state["local"] = {}
    state["localFolders"] = []
    state["remote"] = {}
    return state

def pull_scoped(api: FileInNOutApi, local_root: Path, remote_path: str, include_shared: bool = True) -> SyncStats:
    local_root.mkdir(parents=True, exist_ok=True)
    state = prepare_scoped_state(load_state(local_root), remote_path)
    stats = SyncStats()
    _, remote = build_scoped_remote_tree(api, remote_path, include_shared=include_shared)
    failed_downloads: set[str] = set()

    apply_remote_path_moves(local_root, state, remote, stats)
    sync_remote_deletions(local_root, state, remote, stats)

    for local_rel, item in sorted(remote.items()):
        target = local_root / Path(local_rel)
        remote_rel = join_scope_rel(remote_path, local_rel)
        shared = bool(item.get("_sharedWithMe") or item.get("sharedWithMe"))
        non_uploadable_shared = is_non_uploadable_shared_file(remote_rel, item)
        if node_type(item) == "FOLDER":
            target.mkdir(parents=True, exist_ok=True)
            continue

        local_dirty = is_local_dirty(local_root, local_rel, state)
        readonly_policy_tampered = non_uploadable_shared and is_file_writable(target)
        if local_dirty or readonly_policy_tampered:
            if non_uploadable_shared:
                if not is_downloadable_shared_item(item):
                    remove_unauthorized_local_shared_file(target, stats)
                    continue
            else:
                stats.skipped_dirty += 1
                continue

        if shared and not is_downloadable_shared_item(item):
            remove_unauthorized_local_shared_file(target, stats)
            continue

        item_size = int(item.get("fileSize") or 0)
        previous = state.get("remote", {}).get(local_rel, {})
        unchanged = (
            target.exists()
            and target.is_file()
            and target.stat().st_size == item_size
            and previous.get("id") == file_id(item)
            and previous.get("updatedAt") == item_updated(item)
        )
        if unchanged and not (non_uploadable_shared and (local_dirty or readonly_policy_tampered)):
            continue

        item_id = file_id(item)
        if item_id is None:
            stats.skipped_dirty += 1
            continue

        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            payload = api.download(item_id, shared=shared)
        except DesktopError:
            failed_downloads.add(local_rel)
            stats.download_failed += 1
            continue
        tmp = target.with_suffix(target.suffix + ".download")
        tmp.write_bytes(payload)
        make_file_writable(target)
        tmp.replace(target)
        stats.pulled += 1

    apply_shared_readonly_attributes(local_root, remote_path, remote)
    state["remote"] = {
        rel: remote_state_snapshot(item)
        for rel, item in remote.items()
        if rel not in failed_downloads
        and ((local_root / Path(rel)).exists() or node_type(item) == "FOLDER")
    }
    state["local"] = scan_local_signatures(local_root)
    state["localFolders"] = scan_local_folder_entries(local_root)
    save_state(local_root, state)
    return stats

def ensure_scope_folder(
    api: FileInNOutApi,
    remote_paths: dict[str, dict[str, Any]],
    remote_path: str,
    local_rel: str,
    stats: SyncStats,
) -> int | None:
    full_rel = join_scope_rel(remote_path, local_rel)
    if not full_rel:
        return None
    if is_shared_rel(full_rel):
        return ensure_shared_folder(api, remote_paths, full_rel, stats)
    return ensure_remote_folder(api, remote_paths, full_rel, stats)

def trash_scoped_item(api: FileInNOutApi, remote_rel: str, remote_item: dict[str, Any] | None) -> bool:
    item_id = file_id(remote_item or {})
    if item_id is None:
        return False
    if is_shared_rel(remote_rel) or bool((remote_item or {}).get("_sharedWithMe")):
        if not is_writable_shared_item(remote_item):
            return False
        api.trash_shared_file(item_id)
    else:
        api.trash_file(item_id)
    return True

def sync_deleted_scoped(
    api: FileInNOutApi,
    state: dict[str, Any],
    remote_path: str,
    remote_paths: dict[str, dict[str, Any]],
    current_files: dict[str, dict[str, Any]],
    current_folders: set[str],
    stats: SyncStats,
    protected_files: set[str] | None = None,
    protected_folders: set[str] | None = None,
) -> set[str]:
    deleted_folders: set[str] = set()
    protected_files = protected_files or set()
    protected_folders = protected_folders or set()

    for local_rel in sorted(state.get("localFolders", []), key=lambda value: len(Path(value).parts)):
        if (
            not local_rel
            or local_rel in current_folders
            or local_rel in protected_folders
            or has_ancestor_rel(local_rel, protected_folders)
            or has_ancestor_rel(local_rel, deleted_folders)
        ):
            continue
        remote_rel = join_scope_rel(remote_path, local_rel)
        remote_item = remote_paths.get(remote_rel)
        if node_type(remote_item or {}) != "FOLDER" or not remote_id_matches_previous(state, local_rel, remote_item):
            continue
        if trash_scoped_item(api, remote_rel, remote_item):
            remote_paths.pop(remote_rel, None)
            deleted_folders.add(local_rel)
            stats.deleted += 1
        else:
            stats.skipped_dirty += 1

    for local_rel in list(state.get("local", {}).keys()):
        if (
            local_rel in current_files
            or local_rel in protected_files
            or has_ancestor_rel(local_rel, protected_folders)
            or has_ancestor_rel(local_rel, deleted_folders)
        ):
            continue
        remote_rel = join_scope_rel(remote_path, local_rel)
        remote_item = remote_paths.get(remote_rel)
        if node_type(remote_item or {}) == "FOLDER" or not remote_id_matches_previous(state, local_rel, remote_item):
            continue
        if trash_scoped_item(api, remote_rel, remote_item):
            remote_paths.pop(remote_rel, None)
            stats.deleted += 1
        else:
            stats.skipped_dirty += 1

    return deleted_folders

def apply_scoped_folder_moves(
    api: FileInNOutApi,
    state: dict[str, Any],
    remote_path: str,
    remote_paths: dict[str, dict[str, Any]],
    current_files: dict[str, dict[str, Any]],
    current_folders: set[str],
    stats: SyncStats,
) -> set[str]:
    return _apply_scoped_folder_moves(
        api,
        state,
        remote_path,
        remote_paths,
        current_files,
        current_folders,
        stats,
        ensure_scope_folder,
    )


def apply_scoped_file_moves(
    api: FileInNOutApi,
    state: dict[str, Any],
    remote_path: str,
    remote_paths: dict[str, dict[str, Any]],
    current_files: dict[str, dict[str, Any]],
    stats: SyncStats,
) -> tuple[set[str], set[str]]:
    return _apply_scoped_file_moves(
        api,
        state,
        remote_path,
        remote_paths,
        current_files,
        stats,
        ensure_scope_folder,
    )

def push_scoped(api: FileInNOutApi, local_root: Path, remote_path: str) -> SyncStats:
    local_root.mkdir(parents=True, exist_ok=True)
    state = prepare_scoped_state(load_state(local_root), remote_path)
    remote_paths = build_remote_tree(api, include_shared=True)
    stats = SyncStats()
    current_files = scan_local_signatures(local_root)
    current_folders = set(scan_local_folder_entries(local_root))

    if remote_path and not is_shared_rel(remote_path):
        ensure_remote_folder(api, remote_paths, remote_path, stats)

    protected_old_folders = apply_scoped_folder_moves(api, state, remote_path, remote_paths, current_files, current_folders, stats)
    protected_old_files, handled_new_files = apply_scoped_file_moves(api, state, remote_path, remote_paths, current_files, stats)

    sync_deleted_scoped(
        api,
        state,
        remote_path,
        remote_paths,
        current_files,
        current_folders,
        stats,
        protected_old_files,
        protected_old_folders,
    )

    for folder in sorted(iter_local_paths(local_root, files_only=False, include_shared=True), key=lambda p: len(p.parts)):
        local_rel = normalize_rel(folder.relative_to(local_root))
        full_rel = join_scope_rel(remote_path, local_rel)
        parent_full_rel = join_scope_rel(remote_path, normalize_rel(Path(local_rel).parent))
        if is_shared_rel(full_rel) and full_rel not in remote_paths and not has_uploadable_shared_anchor(remote_paths, parent_full_rel):
            stats.skipped_dirty += 1
            continue
        ensure_scope_folder(api, remote_paths, remote_path, local_rel, stats)

    for path in sorted(iter_local_paths(local_root, files_only=True, include_shared=True)):
        local_rel = normalize_rel(path.relative_to(local_root))
        if local_rel in handled_new_files:
            continue
        previous_local = state.get("local", {}).get(local_rel)
        current_sig = local_signature(path)
        remote_rel = join_scope_rel(remote_path, local_rel)
        remote_item = remote_paths.get(remote_rel)
        local_changed = not local_signature_matches(previous_local, current_sig)

        if not local_changed and remote_item:
            continue

        if local_changed and remote_changed_since_state(state, local_rel, remote_item):
            if is_shared_rel(remote_rel) and not is_downloadable_shared_item(remote_item):
                stats.skipped_dirty += 1
                continue
            preserve_local_conflict(api, path, remote_item, shared=is_shared_rel(remote_rel), stats=stats)
            continue

        parent_local_rel = normalize_rel(Path(local_rel).parent)
        if parent_local_rel == ".":
            parent_local_rel = ""
        parent_remote_rel = join_scope_rel(remote_path, parent_local_rel)
        if is_shared_rel(remote_rel) and not has_uploadable_shared_anchor(remote_paths, parent_remote_rel):
            stats.skipped_dirty += 1
            continue
        parent_id_value = ensure_scope_folder(api, remote_paths, remote_path, parent_local_rel, stats)

        replace_file_id = None
        if remote_item and node_type(remote_item) != "FOLDER":
            if is_shared_rel(remote_rel):
                if not trash_scoped_item(api, remote_rel, remote_item):
                    stats.skipped_dirty += 1
                    continue
            else:
                replace_file_id = file_id(remote_item)

        if is_shared_rel(remote_rel):
            parent_item = remote_paths.get(parent_remote_rel)
            if not is_uploadable_shared_item(parent_item):
                stats.skipped_dirty += 1
                continue
            if parent_id_value is None:
                stats.skipped_dirty += 1
                continue
            uploaded = api.upload_shared_file(parent_id_value, path, path.name)
            uploaded["_sharedWithMe"] = True
            uploaded["permission"] = parent_item.get("permission") or "WRITE"
            uploaded["uploadable"] = is_uploadable_shared_item(parent_item)
            uploaded["writable"] = is_writable_shared_item(parent_item)
            remote_paths[remote_rel] = uploaded
        else:
            upload_file(api, path, remote_rel, parent_id_value, replace_file_id=replace_file_id)

        stats.pushed += 1

    refreshed_remote, scoped_remote = build_scoped_remote_tree(api, remote_path, include_shared=True)
    if remote_path and remote_path in refreshed_remote and "" not in scoped_remote:
        pass
    apply_shared_readonly_attributes(local_root, remote_path, scoped_remote)
    state["remote"] = {rel: remote_state_snapshot(item) for rel, item in scoped_remote.items()}
    state["local"] = scan_local_signatures(local_root)
    state["localFolders"] = scan_local_folder_entries(local_root)
    save_state(local_root, state)
    return stats

def sync_profile(api: FileInNOutApi, profile: dict[str, Any], lock_stale_seconds: int) -> tuple[SyncStats, SyncStats]:
    local_root = Path(profile["localPath"]).expanduser().resolve()
    remote_path = normalize_rel(profile.get("remotePath") or safe_segment(local_root.name))
    direction = normalize_sync_direction(profile.get("direction"))
    push_stats = SyncStats()
    pull_stats = SyncStats()

    with sync_lock(local_root, stale_seconds=lock_stale_seconds):
        try:
            if direction in {"two-way", "upload"}:
                push_stats = push_scoped(api, local_root, remote_path)
            if direction in {"two-way", "download"}:
                pull_stats = pull_scoped(api, local_root, remote_path, include_shared=True)
            update_sync_status(local_root, "success", pull_stats=pull_stats, push_stats=push_stats)
        except DesktopError as error:
            update_sync_status(local_root, "error", error=str(error))
            raise

    return push_stats, pull_stats
