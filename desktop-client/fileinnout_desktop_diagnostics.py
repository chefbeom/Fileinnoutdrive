from __future__ import annotations

from pathlib import Path
from typing import Any

from fileinnout_desktop_constants import (
    DRIVE_ROOT_HUB_FOLDER_NAMES,
    DRIVE_ROOT_SKIPPED_FOLDER_NAMES,
    MY_DRIVE_HUB_NAME,
    SHARED_DRIVE_HUB_NAME,
)
from fileinnout_desktop_paths import comparable_path, normalize_rel
from fileinnout_desktop_windows import is_reparse_point


def print_check(name: str, value: Any) -> None:
    print(f"{name}: {value}")


def print_profile_doctor_checks(
    index: int,
    profile: dict[str, Any],
    *,
    load_state_fn: Any,
    scan_local_signatures_fn: Any,
    scan_local_folder_entries_fn: Any,
    is_local_dirty_fn: Any,
    local_pending_change_count_fn: Any,
    normalize_sync_direction_fn: Any,
    describe_sync_lock_fn: Any,
) -> None:
    prefix = f"sync_folder_{index}"
    local_path = str(profile.get("localPath") or "").strip()
    root = Path(local_path).expanduser().resolve(strict=False) if local_path else None
    state = load_state_fn(root) if root else {"local": {}, "localFolders": [], "remote": {}}
    local: dict[str, dict[str, Any]] = {}
    local_folders: list[str] = []
    dirty: list[str] = []
    pending_changes = 0
    exists = bool(root and root.exists())
    if root and exists:
        try:
            local = scan_local_signatures_fn(root)
            local_folders = scan_local_folder_entries_fn(root)
            dirty = [rel for rel in local if is_local_dirty_fn(root, rel, state)]
            pending_changes = local_pending_change_count_fn(root, state)
        except OSError:
            local = {}
            local_folders = []
            dirty = []
            pending_changes = 0

    sync_status = state.get("syncStatus") or {}
    print_check(f"{prefix}_name", profile.get("name") or "")
    print_check(f"{prefix}_enabled", profile.get("enabled") is not False)
    print_check(f"{prefix}_local_path", root or "")
    print_check(f"{prefix}_remote_path", profile.get("remotePath") or "")
    print_check(f"{prefix}_direction", normalize_sync_direction_fn(profile.get("direction")))
    print_check(f"{prefix}_exists", exists)
    print_check(f"{prefix}_local_files", len(local))
    print_check(f"{prefix}_local_folders", len(local_folders))
    print_check(f"{prefix}_dirty_files", len(dirty))
    print_check(f"{prefix}_pending_changes", pending_changes)
    print_check(f"{prefix}_sync_lock", describe_sync_lock_fn(root) if root else "unconfigured")
    if sync_status:
        print_check(f"{prefix}_sync_status", sync_status.get("status", "unknown"))
        if sync_status.get("error"):
            print_check(f"{prefix}_sync_error", sync_status["error"])


def drive_root_diagnostics(
    drive_root: Path | None,
    profiles: list[dict[str, Any]],
    *,
    drive_hub_profile_links_fn: Any,
    is_shared_rel_fn: Any,
    junction_target_matches_fn: Any,
    should_adopt_drive_root_file_fn: Any,
    iter_drive_root_owned_candidates_fn: Any,
    load_state_fn: Any,
    scan_local_signatures_fn: Any,
    is_local_dirty_fn: Any,
    local_pending_change_count_fn: Any,
    describe_sync_lock_fn: Any,
) -> dict[str, Any]:
    diagnostics: dict[str, Any] = {
        "hub_categories": 0,
        "my_drive_hub_exists": False,
        "shared_drive_hub_exists": False,
        "hub_links": 0,
        "expected_hub_links": 0,
        "existing_hub_links": 0,
        "missing_hub_links": 0,
        "hub_link_conflicts": 0,
        "hub_link_targets_missing": 0,
        "hub_link_dirty_files": 0,
        "hub_link_sync_success": 0,
        "hub_link_sync_error": 0,
        "hub_link_sync_unknown": 0,
        "hub_link_active_locks": 0,
        "hub_link_pending_changes": 0,
        "direct_files": 0,
        "direct_folders": 0,
        "unconfigured_folders": 0,
        "shared_hub_manual_items": 0,
        "skipped_items": 0,
        "read_error": "",
    }
    if not drive_root or not drive_root.exists():
        return diagnostics

    configured_paths: set[str] = set()
    for profile in profiles:
        local_path = str(profile.get("localPath") or "").strip()
        if local_path:
            configured_paths.add(comparable_path(local_path))

    try:
        root_children = sorted(drive_root.iterdir(), key=lambda item: item.name.casefold())
    except OSError as error:
        diagnostics["read_error"] = str(error)
        return diagnostics

    my_drive_hub = drive_root / MY_DRIVE_HUB_NAME
    shared_hub = drive_root / SHARED_DRIVE_HUB_NAME
    diagnostics["my_drive_hub_exists"] = my_drive_hub.is_dir()
    diagnostics["shared_drive_hub_exists"] = shared_hub.is_dir()

    link_config = {"driveRoot": str(drive_root), "syncFolders": profiles}
    expected_shared_owner_dirs: set[str] = set()
    expected_hub_link_paths: set[str] = set()
    for link_path, profile in drive_hub_profile_links_fn(link_config):
        expected_hub_link_paths.add(comparable_path(link_path))
        diagnostics["expected_hub_links"] += 1
        remote_path = normalize_rel(profile.get("remotePath") or "")
        if is_shared_rel_fn(remote_path) and link_path.parent != shared_hub:
            expected_shared_owner_dirs.add(comparable_path(link_path.parent))
        local_path = str(profile.get("localPath") or "").strip()
        local_root = Path(local_path).expanduser().resolve(strict=False) if local_path else None
        local_root_exists = bool(local_root and local_root.exists())
        if not local_root_exists:
            diagnostics["hub_link_targets_missing"] += 1
        link_exists = link_path.exists() or is_reparse_point(link_path)
        if link_exists:
            if is_reparse_point(link_path):
                if local_root_exists and junction_target_matches_fn(link_path, local_root):
                    diagnostics["existing_hub_links"] += 1
                else:
                    diagnostics["hub_link_conflicts"] += 1
            elif local_root_exists and comparable_path(link_path) == comparable_path(local_root):
                diagnostics["existing_hub_links"] += 1
            else:
                diagnostics["hub_link_conflicts"] += 1
        else:
            diagnostics["missing_hub_links"] += 1

        if local_root_exists:
            state = load_state_fn(local_root)
            sync_status = state.get("syncStatus") or {}
            status_value = str(sync_status.get("status") or "").strip().lower()
            if status_value == "success":
                diagnostics["hub_link_sync_success"] += 1
            elif status_value == "error":
                diagnostics["hub_link_sync_error"] += 1
            else:
                diagnostics["hub_link_sync_unknown"] += 1
            if describe_sync_lock_fn(local_root).startswith("active"):
                diagnostics["hub_link_active_locks"] += 1
            try:
                local = scan_local_signatures_fn(local_root)
                diagnostics["hub_link_dirty_files"] += len(
                    [rel for rel in local if is_local_dirty_fn(local_root, rel, state)]
                )
                diagnostics["hub_link_pending_changes"] += local_pending_change_count_fn(local_root, state)
            except OSError:
                diagnostics["skipped_items"] += 1
        else:
            diagnostics["hub_link_sync_unknown"] += 1

    children: list[tuple[str, Path]] = []
    for child in root_children:
        try:
            if child.name.casefold() in DRIVE_ROOT_HUB_FOLDER_NAMES:
                diagnostics["hub_categories"] += 1
                continue
        except OSError:
            diagnostics["skipped_items"] += 1
            continue
        children.append(("root", child))
    for _, child in iter_drive_root_owned_candidates_fn(drive_root):
        if child.name.casefold() in DRIVE_ROOT_HUB_FOLDER_NAMES:
            continue
        children.append(("owned", child))
    try:
        if shared_hub.is_dir():
            for child in sorted(shared_hub.iterdir(), key=lambda item: item.name.casefold()):
                children.append(("shared", child))
                child_key = comparable_path(child)
                if child_key in expected_shared_owner_dirs:
                    try:
                        for owner_child in sorted(child.iterdir(), key=lambda item: item.name.casefold()):
                            children.append(("shared-owner", owner_child))
                    except OSError:
                        diagnostics["skipped_items"] += 1
    except OSError:
        diagnostics["skipped_items"] += 1

    seen: set[str] = set()
    for scope, child in children:
        child_key = comparable_path(child)
        if child_key in seen:
            continue
        seen.add(child_key)
        try:
            if child.name.casefold() in DRIVE_ROOT_SKIPPED_FOLDER_NAMES:
                diagnostics["skipped_items"] += 1
                continue
            if is_reparse_point(child):
                diagnostics["hub_links"] += 1
                continue
            if child_key in expected_hub_link_paths:
                continue
            if scope in {"shared", "shared-owner"}:
                if child_key in expected_shared_owner_dirs:
                    continue
                if child_key in expected_hub_link_paths:
                    continue
                if child.is_dir() or should_adopt_drive_root_file_fn(child):
                    diagnostics["shared_hub_manual_items"] += 1
                else:
                    diagnostics["skipped_items"] += 1
                continue
            if child.is_dir():
                diagnostics["direct_folders"] += 1
                if comparable_path(child) not in configured_paths:
                    diagnostics["unconfigured_folders"] += 1
                continue
            if should_adopt_drive_root_file_fn(child):
                diagnostics["direct_files"] += 1
            else:
                diagnostics["skipped_items"] += 1
        except OSError:
            diagnostics["skipped_items"] += 1
    return diagnostics