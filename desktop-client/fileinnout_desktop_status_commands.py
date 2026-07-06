from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fileinnout_desktop_constants import APP_NAME
from fileinnout_desktop_config import GLOBAL_CONFIG_PATH
from fileinnout_desktop_diagnostics import (
    drive_root_diagnostics as diagnostics_drive_root_diagnostics,
    print_check,
    print_profile_doctor_checks as diagnostics_print_profile_doctor_checks,
)
from fileinnout_desktop_drive_hub import drive_hub_profile_links, junction_target_matches
from fileinnout_desktop_drive_adoption import iter_drive_root_owned_candidates, should_adopt_drive_root_file
from fileinnout_desktop_paths import comparable_path
from fileinnout_desktop_profiles import configured_sync_folders, normalize_sync_direction
from fileinnout_desktop_remote import build_remote_tree
from fileinnout_desktop_state import (
    describe_sync_lock,
    load_state,
    root_lock_path,
    root_state_path,
    watch_log_path,
)
from fileinnout_desktop_sync import (
    is_local_dirty,
    local_pending_change_count,
    scan_local_folder_entries,
    scan_local_signatures,
)
from fileinnout_desktop_sync_shared import is_shared_rel
from fileinnout_desktop_windows import drive_appearance_state, get_subst_target, normalize_drive_letter


@dataclass(frozen=True)
class DesktopStatusCommandDeps:
    make_api: Any
    resolve_sync_root: Any
    load_global_config: Any


def cmd_status(args: argparse.Namespace, deps: DesktopStatusCommandDeps) -> None:
    root = deps.resolve_sync_root(args)
    remote = {}
    if not args.local_only:
        api = deps.make_api(args)
        remote = build_remote_tree(api, include_shared=not args.owned_only)
    local = scan_local_signatures(root) if root.exists() else {}
    state = load_state(root)
    print(f"root: {root}")
    print(f"config: {GLOBAL_CONFIG_PATH}")
    print(f"remote_items: {len(remote)}")
    print(f"local_files: {len(local)}")
    dirty = [rel for rel in local if is_local_dirty(root, rel, state)]
    print(f"local_dirty_files: {len(dirty)}")
    print(f"local_pending_changes: {local_pending_change_count(root, state)}")
    print(f"sync_lock: {describe_sync_lock(root)}")
    sync_status = state.get("syncStatus") or {}
    if sync_status:
        print(f"sync_status: {sync_status.get('status', 'unknown')} updatedAt={sync_status.get('updatedAt', 'unknown')}")
        if sync_status.get("error"):
            print(f"sync_error: {sync_status['error']}")

def print_profile_doctor_checks(index: int, profile: dict[str, Any]) -> None:
    diagnostics_print_profile_doctor_checks(
        index,
        profile,
        load_state_fn=load_state,
        scan_local_signatures_fn=scan_local_signatures,
        scan_local_folder_entries_fn=scan_local_folder_entries,
        is_local_dirty_fn=is_local_dirty,
        local_pending_change_count_fn=local_pending_change_count,
        normalize_sync_direction_fn=normalize_sync_direction,
        describe_sync_lock_fn=describe_sync_lock,
    )


def drive_root_diagnostics(drive_root: Path | None, profiles: list[dict[str, Any]]) -> dict[str, Any]:
    return diagnostics_drive_root_diagnostics(
        drive_root,
        profiles,
        drive_hub_profile_links_fn=drive_hub_profile_links,
        is_shared_rel_fn=is_shared_rel,
        junction_target_matches_fn=junction_target_matches,
        should_adopt_drive_root_file_fn=should_adopt_drive_root_file,
        iter_drive_root_owned_candidates_fn=iter_drive_root_owned_candidates,
        load_state_fn=load_state,
        scan_local_signatures_fn=scan_local_signatures,
        is_local_dirty_fn=is_local_dirty,
        local_pending_change_count_fn=local_pending_change_count,
        describe_sync_lock_fn=describe_sync_lock,
    )
def cmd_doctor(args: argparse.Namespace, deps: DesktopStatusCommandDeps) -> None:
    config = deps.load_global_config()
    raw_root = getattr(args, "dir", None) or config.get("syncDir")
    root = Path(raw_root).expanduser().resolve() if raw_root else None
    state_path = root_state_path(root) if root else None
    state = load_state(root) if state_path and state_path.exists() else {"local": {}, "localFolders": [], "remote": {}}
    local = scan_local_signatures(root) if root and root.exists() else {}
    local_folders = scan_local_folder_entries(root) if root and root.exists() else []
    dirty = [rel for rel in local if is_local_dirty(root, rel, state)]
    sync_status = state.get("syncStatus") or {}
    profiles = configured_sync_folders(config)
    enabled_profiles = [profile for profile in profiles if profile.get("enabled")]
    enabled_roots = [
        Path(str(profile.get("localPath") or "")).expanduser().resolve(strict=False)
        for profile in enabled_profiles
        if str(profile.get("localPath") or "").strip()
    ]
    missing_enabled_roots = [root for root in enabled_roots if not root.exists()]
    active_sync_locks = [
        root for root in enabled_roots
        if root_lock_path(root).exists() and describe_sync_lock(root).startswith("active")
    ]
    drive_letter = normalize_drive_letter(config.get("driveLetter"))
    drive_root_raw = str(config.get("driveRoot") or "").strip()
    drive_root = Path(drive_root_raw).expanduser().resolve(strict=False) if drive_root_raw else None
    subst_target = get_subst_target(drive_letter)
    subst_target_path = Path(subst_target).expanduser().resolve(strict=False) if subst_target else None
    appearance = drive_appearance_state(drive_letter)
    drive_diag = drive_root_diagnostics(drive_root, profiles)
    drive_mapped = bool(drive_root and subst_target_path and comparable_path(drive_root) == comparable_path(subst_target_path))
    drive_hub_consistent = bool(
        drive_diag["my_drive_hub_exists"]
        and drive_diag["shared_drive_hub_exists"]
        and drive_diag["missing_hub_links"] == 0
        and drive_diag["hub_link_conflicts"] == 0
        and drive_diag["hub_link_targets_missing"] == 0
        and not drive_diag["read_error"]
    )
    drive_root_needs_attention = bool(
        missing_enabled_roots
        or drive_diag["direct_files"]
        or drive_diag["unconfigured_folders"]
        or drive_diag["shared_hub_manual_items"]
        or drive_diag["missing_hub_links"]
        or drive_diag["hub_link_conflicts"]
        or drive_diag["hub_link_targets_missing"]
        or drive_diag["read_error"]
    )
    drive_ready = bool(
        drive_root
        and drive_root.exists()
        and drive_mapped
        and drive_hub_consistent
        and not drive_root_needs_attention
    )

    print_check("app", APP_NAME)
    print_check("python", sys.executable)
    print_check("config_path", GLOBAL_CONFIG_PATH)
    print_check("config_exists", GLOBAL_CONFIG_PATH.exists())
    print_check("server", args.server or config.get("server") or "")
    print_check("email", config.get("email") or "")
    print_check("sync_root_configured", root is not None)
    print_check("sync_root", root or "")
    print_check("sync_root_exists", root.exists() if root else False)
    print_check("state_path", state_path or "")
    print_check("state_exists", state_path.exists() if state_path else False)
    print_check("watch_log", watch_log_path())
    print_check("watch_log_exists", watch_log_path().exists())
    print_check("sync_lock", describe_sync_lock(root) if root else "unconfigured")
    print_check("local_files", len(local))
    print_check("local_folders", len(local_folders))
    print_check("local_dirty_files", len(dirty))
    print_check("local_pending_changes", local_pending_change_count(root, state) if root else 0)
    print_check("configured_sync_folders", len(profiles))
    print_check("enabled_sync_folders", len(enabled_profiles))
    print_check("sync_folders_all_exist", len(missing_enabled_roots) == 0)
    print_check("sync_folders_missing", len(missing_enabled_roots))
    print_check("sync_locks_active", len(active_sync_locks))
    for index, profile in enumerate(profiles, start=1):
        print_profile_doctor_checks(index, profile)
    print_check("drive_letter", drive_letter)
    print_check("drive_root_configured", drive_root is not None)
    print_check("drive_root", drive_root or "")
    print_check("drive_root_exists", drive_root.exists() if drive_root else False)
    print_check("drive_subst_target", subst_target_path or "")
    print_check("drive_mapped", drive_mapped)
    print_check("drive_root_hub_categories", drive_diag["hub_categories"])
    print_check("drive_my_drive_hub_exists", drive_diag["my_drive_hub_exists"])
    print_check("drive_shared_hub_exists", drive_diag["shared_drive_hub_exists"])
    print_check("drive_root_hub_links", drive_diag["hub_links"])
    print_check("drive_hub_expected_links", drive_diag["expected_hub_links"])
    print_check("drive_hub_existing_links", drive_diag["existing_hub_links"])
    print_check("drive_hub_missing_links", drive_diag["missing_hub_links"])
    print_check("drive_hub_link_conflicts", drive_diag["hub_link_conflicts"])
    print_check("drive_hub_targets_missing", drive_diag["hub_link_targets_missing"])
    print_check("drive_hub_dirty_files", drive_diag["hub_link_dirty_files"])
    print_check("drive_hub_pending_changes", drive_diag["hub_link_pending_changes"])
    print_check("drive_hub_sync_success", drive_diag["hub_link_sync_success"])
    print_check("drive_hub_sync_error", drive_diag["hub_link_sync_error"])
    print_check("drive_hub_sync_unknown", drive_diag["hub_link_sync_unknown"])
    print_check("drive_hub_active_locks", drive_diag["hub_link_active_locks"])
    print_check("drive_hub_consistent", drive_hub_consistent)
    print_check("drive_root_direct_files", drive_diag["direct_files"])
    print_check("drive_root_direct_folders", drive_diag["direct_folders"])
    print_check("drive_root_unconfigured_folders", drive_diag["unconfigured_folders"])
    print_check("drive_shared_hub_manual_items", drive_diag["shared_hub_manual_items"])
    print_check("drive_root_pending_adoption", bool(drive_diag["direct_files"] or drive_diag["unconfigured_folders"]))
    print_check("drive_root_needs_attention", drive_root_needs_attention)
    print_check("drive_root_read_error", drive_diag["read_error"])
    print_check("drive_ready", drive_ready)
    print_check("drive_label", appearance.get("label", ""))
    print_check("drive_icon", appearance.get("icon", ""))
    print_check("drive_label_registered", appearance.get("label", "") == "FileInNOut")
    print_check("drive_icon_registered", "FileInNOutDesktop.ico" in appearance.get("icon", ""))
    if sync_status:
        print_check("sync_status", sync_status.get("status", "unknown"))
        print_check("sync_status_updatedAt", sync_status.get("updatedAt", "unknown"))
        if sync_status.get("error"):
            print_check("sync_error", sync_status["error"])

    if args.local_only:
        print_check("backend", "skipped")
        return

    api = deps.make_api(args)
    _, _, health_payload = api.request("GET", "/actuator/health")
    health_text = health_payload.decode("utf-8", errors="replace").strip()
    print_check("backend", "ok")
    print_check("backend_health", health_text[:160])
    owned_items = api.list_owned()
    print_check("remote_owned_items", len([item for item in owned_items if not item.get("trashed")]))
    if args.owned_only:
        print_check("remote_shared_items", "skipped")
    else:
        shared_items = api.list_shared()
        print_check("remote_shared_items", len([item for item in shared_items if not item.get("trashed")]))

def cmd_storage(args: argparse.Namespace, deps: DesktopStatusCommandDeps) -> None:
    api = deps.make_api(args)
    summary = api.storage_summary()
    for key in (
        "planCode",
        "planLabel",
        "quotaBytes",
        "usedBytes",
        "activeUsedBytes",
        "trashUsedBytes",
        "remainingBytes",
        "usagePercent",
        "activeFileCount",
        "activeFolderCount",
    ):
        value = summary.get(key)
        if value is not None:
            print_check(key, value)
