from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from fileinnout_desktop_api import FileInNOutApi
from fileinnout_desktop_models import SyncStats
from fileinnout_desktop_paths import (
    can_treat_as_local_file_move,
    can_treat_as_local_folder_move,
    has_ancestor_rel,
    is_descendant_rel,
    parent_rel_of,
    rel_suffix_under,
    replace_rel_prefix,
    safe_segment,
)
from fileinnout_desktop_profiles import join_scope_rel
from fileinnout_desktop_remote import (
    file_id,
    item_name,
    node_type,
    parent_id,
    remote_changed_since_state,
    remote_id_matches_previous,
)
from fileinnout_desktop_sync_local import remap_state_path_prefix
from fileinnout_desktop_sync_shared import is_shared_rel

EnsureScopeFolder = Callable[[FileInNOutApi, dict[str, dict[str, Any]], str, str, SyncStats], int | None]

def folder_tree_matches(
    state: dict[str, Any],
    old_rel: str,
    current_files: dict[str, dict[str, Any]],
    current_folders: set[str],
    new_rel: str,
) -> bool:
    old_files = {
        rel_suffix_under(rel, old_rel): sig
        for rel, sig in state.get("local", {}).items()
        if is_descendant_rel(rel, old_rel)
    }
    new_files = {
        rel_suffix_under(rel, new_rel): sig
        for rel, sig in current_files.items()
        if is_descendant_rel(rel, new_rel)
    }
    if old_files != new_files:
        return False

    old_folders = {
        rel_suffix_under(rel, old_rel)
        for rel in state.get("localFolders", [])
        if rel != old_rel and is_descendant_rel(rel, old_rel)
    }
    new_folders = {
        rel_suffix_under(rel, new_rel)
        for rel in current_folders
        if rel != new_rel and is_descendant_rel(rel, new_rel)
    }
    return old_folders == new_folders

def folder_tree_shape_matches(
    state: dict[str, Any],
    old_rel: str,
    current_files: dict[str, dict[str, Any]],
    current_folders: set[str],
    new_rel: str,
) -> bool:
    old_files = {
        rel_suffix_under(rel, old_rel)
        for rel in state.get("local", {})
        if is_descendant_rel(rel, old_rel)
    }
    new_files = {
        rel_suffix_under(rel, new_rel)
        for rel in current_files
        if is_descendant_rel(rel, new_rel)
    }
    if old_files != new_files:
        return False

    old_folders = {
        rel_suffix_under(rel, old_rel)
        for rel in state.get("localFolders", [])
        if rel != old_rel and is_descendant_rel(rel, old_rel)
    }
    new_folders = {
        rel_suffix_under(rel, new_rel)
        for rel in current_folders
        if rel != new_rel and is_descendant_rel(rel, new_rel)
    }
    return old_folders == new_folders

def remap_remote_paths_prefix(remote_paths: dict[str, dict[str, Any]], old_rel: str, new_rel: str) -> None:
    remapped: dict[str, dict[str, Any]] = {}
    for rel, item in list(remote_paths.items()):
        if not is_descendant_rel(rel, old_rel):
            continue
        mapped_rel = replace_rel_prefix(rel, old_rel, new_rel)
        remapped[mapped_rel] = item
        remote_paths.pop(rel, None)
    remote_paths.update(remapped)

def remote_folder_tree_matches_state(
    state: dict[str, Any],
    remote_paths: dict[str, dict[str, Any]],
    old_rel: str,
    remote_path: str,
) -> bool:
    for local_rel in state.get("localFolders", []):
        if not is_descendant_rel(local_rel, old_rel):
            continue
        remote_rel = join_scope_rel(remote_path, local_rel)
        remote_item = remote_paths.get(remote_rel)
        if node_type(remote_item or {}) != "FOLDER" or not remote_id_matches_previous(state, local_rel, remote_item):
            return False
    for local_rel in state.get("local", {}):
        if not is_descendant_rel(local_rel, old_rel):
            continue
        remote_rel = join_scope_rel(remote_path, local_rel)
        remote_item = remote_paths.get(remote_rel)
        if node_type(remote_item or {}) == "FOLDER" or not remote_id_matches_previous(state, local_rel, remote_item):
            return False
        if remote_changed_since_state(state, local_rel, remote_item):
            return False
    return True

def apply_scoped_folder_moves(
    api: FileInNOutApi,
    state: dict[str, Any],
    remote_path: str,
    remote_paths: dict[str, dict[str, Any]],
    current_files: dict[str, dict[str, Any]],
    current_folders: set[str],
    stats: SyncStats,
    ensure_scope_folder_fn: EnsureScopeFolder,
) -> set[str]:
    previous_folders = set(state.get("localFolders", []))
    missing_previous = {
        rel
        for rel in previous_folders
        if rel and rel not in current_folders
    }
    new_folders = {
        rel
        for rel in current_folders
        if rel and rel not in previous_folders
    }
    protected_old_rels: set[str] = set()

    def protect_old_rel(old_rel: str) -> None:
        if old_rel in protected_old_rels:
            return
        protected_old_rels.add(old_rel)
        stats.skipped_dirty += 1

    for new_rel in sorted(new_folders, key=lambda value: len(Path(value).parts)):
        if is_shared_rel(join_scope_rel(remote_path, new_rel)):
            continue

        candidates: list[str] = []
        blocked_candidates: set[str] = set()
        for old_rel in sorted(missing_previous, key=lambda value: len(Path(value).parts)):
            if old_rel in protected_old_rels or has_ancestor_rel(old_rel, protected_old_rels):
                continue
            if is_descendant_rel(new_rel, old_rel):
                continue
            if not can_treat_as_local_folder_move(old_rel, new_rel):
                continue
            if not folder_tree_shape_matches(state, old_rel, current_files, current_folders, new_rel):
                continue
            old_remote_rel = join_scope_rel(remote_path, old_rel)
            old_remote_item = remote_paths.get(old_remote_rel)
            if is_shared_rel(old_remote_rel) or node_type(old_remote_item or {}) != "FOLDER":
                continue
            if not remote_id_matches_previous(state, old_rel, old_remote_item):
                continue
            if not remote_folder_tree_matches_state(state, remote_paths, old_rel, remote_path):
                blocked_candidates.add(old_rel)
                continue
            if join_scope_rel(remote_path, new_rel) in remote_paths:
                blocked_candidates.add(old_rel)
                continue
            candidates.append(old_rel)

        if len(candidates) != 1:
            for old_rel in blocked_candidates.union(candidates):
                protect_old_rel(old_rel)
            continue

        old_rel = candidates[0]
        old_remote_rel = join_scope_rel(remote_path, old_rel)
        new_remote_rel = join_scope_rel(remote_path, new_rel)
        remote_item = remote_paths.get(old_remote_rel)
        item_id = file_id(remote_item or {})
        if item_id is None:
            continue

        parent_local_rel = parent_rel_of(new_rel)
        target_parent_id = ensure_scope_folder_fn(api, remote_paths, remote_path, parent_local_rel, stats) if parent_local_rel else None
        old_parent_id = parent_id(remote_item or {})
        new_name = Path(new_rel).name
        old_name = item_name(remote_item or {})

        if old_parent_id != target_parent_id:
            api.move_file(item_id, target_parent_id)
        if old_name != safe_segment(new_name):
            api.rename_file(item_id, new_name)

        remap_remote_paths_prefix(remote_paths, old_remote_rel, new_remote_rel)
        remap_state_path_prefix(state, old_rel, new_rel)
        moved_item = remote_paths.get(new_remote_rel)
        if moved_item is not None:
            moved_item["parentId"] = target_parent_id
            moved_item["fileOriginName"] = new_name

        protected_old_rels.add(old_rel)
        stats.pushed += 1

    return protected_old_rels

def apply_scoped_file_moves(
    api: FileInNOutApi,
    state: dict[str, Any],
    remote_path: str,
    remote_paths: dict[str, dict[str, Any]],
    current_files: dict[str, dict[str, Any]],
    stats: SyncStats,
    ensure_scope_folder_fn: EnsureScopeFolder,
) -> tuple[set[str], set[str]]:
    previous_files = state.get("local", {})
    missing_previous = {
        rel: sig
        for rel, sig in previous_files.items()
        if rel not in current_files
    }
    new_files = {
        rel: sig
        for rel, sig in current_files.items()
        if rel not in previous_files
    }
    protected_old_rels: set[str] = set()
    handled_new_rels: set[str] = set()

    def protect_old_rel(old_rel: str) -> None:
        if old_rel in protected_old_rels:
            return
        protected_old_rels.add(old_rel)
        stats.skipped_dirty += 1

    for new_rel, current_sig in sorted(new_files.items()):
        if is_shared_rel(join_scope_rel(remote_path, new_rel)):
            continue

        candidates: list[str] = []
        blocked_candidates: set[str] = set()
        for old_rel, previous_sig in missing_previous.items():
            if old_rel in protected_old_rels:
                continue
            if not can_treat_as_local_file_move(old_rel, new_rel):
                continue
            old_remote_rel = join_scope_rel(remote_path, old_rel)
            old_remote_item = remote_paths.get(old_remote_rel)
            if is_shared_rel(old_remote_rel) or node_type(old_remote_item or {}) == "FOLDER":
                continue
            if not remote_id_matches_previous(state, old_rel, old_remote_item):
                continue
            if remote_changed_since_state(state, old_rel, old_remote_item):
                blocked_candidates.add(old_rel)
                continue
            if join_scope_rel(remote_path, new_rel) in remote_paths:
                blocked_candidates.add(old_rel)
                continue
            candidates.append(old_rel)

        if len(candidates) != 1:
            for old_rel in blocked_candidates.union(candidates):
                protect_old_rel(old_rel)
            continue

        old_rel = candidates[0]
        old_remote_rel = join_scope_rel(remote_path, old_rel)
        new_remote_rel = join_scope_rel(remote_path, new_rel)
        remote_item = remote_paths.get(old_remote_rel)
        item_id = file_id(remote_item or {})
        if item_id is None:
            continue

        parent_local_rel = parent_rel_of(new_rel)
        target_parent_id = ensure_scope_folder_fn(api, remote_paths, remote_path, parent_local_rel, stats) if parent_local_rel else None
        old_parent_id = parent_id(remote_item or {})
        new_name = Path(new_rel).name
        old_name = item_name(remote_item or {})

        if old_parent_id != target_parent_id:
            api.move_file(item_id, target_parent_id)
        if old_name != safe_segment(new_name):
            api.rename_file(item_id, new_name)

        if remote_item is not None:
            remote_item["parentId"] = target_parent_id
            remote_item["fileOriginName"] = new_name
            remote_paths.pop(old_remote_rel, None)
            remote_paths[new_remote_rel] = remote_item

        remap_state_path_prefix(state, old_rel, new_rel)
        protected_old_rels.add(old_rel)
        if previous_files.get(new_rel) == current_sig:
            handled_new_rels.add(new_rel)
        stats.pushed += 1

    return protected_old_rels, handled_new_rels
