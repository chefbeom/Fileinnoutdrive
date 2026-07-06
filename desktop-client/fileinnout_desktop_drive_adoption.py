from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from fileinnout_desktop_constants import (
    DRIVE_ROOT_SKIPPED_FOLDER_NAMES,
    MY_DRIVE_HUB_NAME,
    ROOT_FILE_SYNC_FOLDER_NAME,
    SHARED_DRIVE_HUB_NAME,
    SHARED_ROOT_NAME,
    SKIPPED_FILE_PREFIXES,
    SKIPPED_FILE_SUFFIXES,
    SKIPPED_FILES,
)
from fileinnout_desktop_windows import is_reparse_point
from fileinnout_desktop_paths import comparable_path, normalize_rel, safe_segment
from fileinnout_desktop_profiles import (
    legacy_sync_folder_profile,
    normalize_sync_direction,
    unique_local_child_path,
    unique_remote_path,
)


def is_shared_rel(rel: str) -> bool:
    return normalize_rel(rel).split("/", 1)[0] == SHARED_ROOT_NAME


def should_adopt_drive_root_file(path: Path) -> bool:
    name = path.name
    if not name or name in SKIPPED_FILES:
        return False
    if any(name.startswith(prefix) for prefix in SKIPPED_FILE_PREFIXES):
        return False
    lower = name.lower()
    if any(lower.endswith(suffix) for suffix in SKIPPED_FILE_SUFFIXES):
        return False
    try:
        return path.is_file() and not is_reparse_point(path)
    except OSError:
        return False

def ensure_drive_root_hubs(drive_root: Path) -> bool:
    try:
        drive_root.mkdir(parents=True, exist_ok=True)
        (drive_root / MY_DRIVE_HUB_NAME).mkdir(parents=True, exist_ok=True)
        (drive_root / SHARED_DRIVE_HUB_NAME).mkdir(parents=True, exist_ok=True)
        return True
    except OSError:
        return False

def drive_root_owned_candidate_roots(drive_root: Path) -> list[Path]:
    roots = [drive_root]
    my_drive_root = drive_root / MY_DRIVE_HUB_NAME
    try:
        if my_drive_root.is_dir():
            roots.append(my_drive_root)
    except OSError:
        pass
    return roots

def iter_drive_root_owned_candidates(drive_root: Path) -> list[tuple[Path, Path]]:
    candidates: list[tuple[Path, Path]] = []
    seen: set[str] = set()
    for root in drive_root_owned_candidate_roots(drive_root):
        try:
            children = sorted(root.iterdir(), key=lambda item: item.name.casefold())
        except OSError:
            continue
        for child in children:
            key = comparable_path(child)
            if key in seen:
                continue
            seen.add(key)
            candidates.append((root, child))
    return candidates

def normalize_drive_root_owned_child(parent: Path, child: Path, drive_root: Path) -> Path:
    if comparable_path(parent) != comparable_path(drive_root):
        return child

    my_drive_root = drive_root / MY_DRIVE_HUB_NAME
    try:
        if not my_drive_root.is_dir():
            return child
        if child.name.casefold() in DRIVE_ROOT_SKIPPED_FOLDER_NAMES:
            return child
        if is_reparse_point(child) or not child.is_dir():
            return child
        target = unique_local_child_path(my_drive_root, child.name)
        shutil.move(str(child), str(target))
        return target
    except OSError:
        return child

def ensure_drive_root_file_profile(
    drive_root: Path,
    profiles: list[dict[str, Any]],
    existing_paths: set[str],
    used_remote_paths: set[str],
) -> tuple[str, bool]:
    my_drive_root = drive_root / MY_DRIVE_HUB_NAME
    try:
        my_drive_root.mkdir(parents=True, exist_ok=True)
    except OSError:
        return "", False

    local_root = my_drive_root / ROOT_FILE_SYNC_FOLDER_NAME
    if not local_root.exists():
        try:
            local_root.mkdir(parents=True, exist_ok=True)
        except OSError:
            return "", False

    local_key = comparable_path(local_root)
    resolved_local = str(local_root.resolve(strict=False))
    changed = False
    for profile in profiles:
        if not isinstance(profile, dict):
            continue
        profile_local = str(profile.get("localPath") or profile.get("syncDir") or "").strip()
        if not profile_local or comparable_path(profile_local) != local_key:
            continue
        if profile.get("enabled") is False:
            profile["enabled"] = True
            changed = True
        if not profile.get("name"):
            profile["name"] = ROOT_FILE_SYNC_FOLDER_NAME
            changed = True
        if not normalize_rel(profile.get("remotePath") or ""):
            remote_path = unique_remote_path(ROOT_FILE_SYNC_FOLDER_NAME, used_remote_paths)
            profile["remotePath"] = remote_path
            used_remote_paths.add(remote_path.casefold())
            changed = True
        if normalize_sync_direction(profile.get("direction")) != "two-way":
            profile["direction"] = "two-way"
            changed = True
        existing_paths.add(local_key)
        return resolved_local, changed

    remote_path = unique_remote_path(ROOT_FILE_SYNC_FOLDER_NAME, used_remote_paths)
    profiles.append(
        {
            "name": ROOT_FILE_SYNC_FOLDER_NAME,
            "localPath": resolved_local,
            "remotePath": remote_path,
            "direction": "two-way",
            "enabled": True,
        }
    )
    existing_paths.add(local_key)
    used_remote_paths.add(remote_path.casefold())
    changed = True

    return resolved_local, changed

def adopt_drive_root_folders(config: dict[str, Any]) -> bool:
    drive_root_raw = str(config.get("driveRoot") or "").strip()
    if not drive_root_raw:
        return False

    drive_root = Path(drive_root_raw).expanduser()
    if not ensure_drive_root_hubs(drive_root):
        return False

    raw_profiles = config.get("syncFolders")
    profiles = raw_profiles if isinstance(raw_profiles, list) else []
    changed = not isinstance(raw_profiles, list)

    if not profiles:
        legacy_profile = legacy_sync_folder_profile(config)
        if legacy_profile:
            profiles.append(legacy_profile)
            changed = True

    existing_paths: set[str] = set()
    used_remote_paths: set[str] = set()
    default_local_path = ""
    for profile in profiles:
        if not isinstance(profile, dict):
            continue
        local_path = str(profile.get("localPath") or profile.get("syncDir") or "").strip()
        if local_path:
            existing_paths.add(comparable_path(local_path))
        remote_path = normalize_rel(profile.get("remotePath") or safe_segment(Path(local_path).name))
        if remote_path:
            used_remote_paths.add(remote_path.casefold())
        if (
            local_path
            and not default_local_path
            and profile.get("enabled") is not False
            and not is_shared_rel(remote_path)
        ):
            default_local_path = local_path

    candidates = iter_drive_root_owned_candidates(drive_root)
    loose_file_candidates = [
        child
        for _, child in candidates
        if should_adopt_drive_root_file(child)
    ]

    for parent, child in candidates:
        try:
            if child.name.casefold() in DRIVE_ROOT_SKIPPED_FOLDER_NAMES:
                continue
            if is_reparse_point(child):
                continue
            if not child.is_dir():
                continue
            child = normalize_drive_root_owned_child(parent, child, drive_root)
        except OSError:
            continue

        child_key = comparable_path(child)
        if child_key in existing_paths:
            continue

        remote_path = unique_remote_path(child.name, used_remote_paths)
        profiles.append(
            {
                "name": child.name,
                "localPath": str(child.resolve(strict=False)),
                "remotePath": remote_path,
                "direction": "two-way",
                "enabled": True,
            }
        )
        existing_paths.add(child_key)
        changed = True

    if not default_local_path and loose_file_candidates:
        default_local_path, file_profile_changed = ensure_drive_root_file_profile(
            drive_root,
            profiles,
            existing_paths,
            used_remote_paths,
        )
        changed = changed or file_profile_changed

    if default_local_path:
        target_root = Path(default_local_path).expanduser().resolve(strict=False)
        if comparable_path(target_root) != comparable_path(drive_root):
            try:
                target_root.mkdir(parents=True, exist_ok=True)
            except OSError:
                target_root = None
            if target_root is not None:
                for _, child in candidates:
                    if not should_adopt_drive_root_file(child):
                        continue
                    target = unique_local_child_path(target_root, child.name)
                    try:
                        shutil.move(str(child), str(target))
                    except OSError:
                        continue

    if changed:
        config["syncFolders"] = profiles
    return changed
