from __future__ import annotations

import os
import subprocess
import urllib.parse
import webbrowser
from pathlib import Path
from typing import Any

from fileinnout_desktop_constants import (
    DRIVE_ROOT_HUB_FOLDER_NAMES,
    DRIVE_ROOT_SKIPPED_FOLDER_NAMES,
    MY_DRIVE_HUB_NAME,
    SHARED_DRIVE_HUB_NAME,
    SHARED_ROOT_NAME,
)
from fileinnout_desktop_drive import (
    comparable_logical_path,
    configured_drive_root,
    logical_desktop_target_path,
    logical_relative_path,
    path_is_inside,
    path_is_inside_logical,
    safe_drive_link_name,
    shared_drive_link_name,
    shared_remote_parts,
)
from fileinnout_desktop_paths import comparable_path, normalize_rel, safe_segment
from fileinnout_desktop_profiles import configured_sync_folders, join_scope_rel
from fileinnout_desktop_sync import ensure_drive_root_hubs, is_shared_rel
from fileinnout_desktop_web import frontend_url_from_config
from fileinnout_desktop_windows import (
    create_directory_junction,
    drive_hub_junction_supported,
    is_reparse_point,
    remove_directory_reparse_point,
)

def drive_hub_profile_links(
    config: dict[str, Any],
    include_legacy_shared_aliases: bool = False,
) -> list[tuple[Path, dict[str, Any]]]:
    drive_root = configured_drive_root(config)
    if drive_root is None:
        return []

    my_drive_hub = drive_root / MY_DRIVE_HUB_NAME
    shared_drive_hub = drive_root / SHARED_DRIVE_HUB_NAME
    desired: dict[str, tuple[Path, dict[str, Any], str]] = {}
    legacy_aliases: list[tuple[Path, dict[str, Any]]] = []

    for profile in configured_sync_folders(config):
        if profile.get("enabled") is False:
            continue
        local_path = str(profile.get("localPath") or "").strip()
        if not local_path:
            continue

        remote_path = normalize_rel(profile.get("remotePath") or safe_segment(Path(local_path).name))
        if is_shared_rel(remote_path):
            owner, _ = shared_remote_parts(remote_path)
            hub_root = shared_drive_hub / owner if owner else shared_drive_hub
            base_name = shared_drive_link_name(profile, remote_path, local_path)
            if include_legacy_shared_aliases:
                legacy_aliases.append((shared_drive_hub / base_name, profile))
        else:
            hub_root = my_drive_hub
            base_name = safe_drive_link_name(profile.get("name"), local_path)
        unique_name = base_name
        suffix = 2
        link_path = hub_root / unique_name
        local_key = comparable_path(local_path)

        while True:
            existing = desired.get(comparable_logical_path(link_path))
            if existing is None or existing[2] == local_key:
                break
            unique_name = f"{base_name} {suffix}"
            suffix += 1
            link_path = hub_root / unique_name

        desired[comparable_logical_path(link_path)] = (link_path, profile, local_key)

    links = [(link_path, profile) for link_path, profile, _ in desired.values()]
    if include_legacy_shared_aliases:
        existing = {comparable_logical_path(link_path) for link_path, _ in links}
        for link_path, profile in legacy_aliases:
            key = comparable_logical_path(link_path)
            if key not in existing:
                links.append((link_path, profile))
                existing.add(key)
    return links

def drive_hub_link_targets(config: dict[str, Any]) -> dict[str, tuple[Path, Path]]:
    desired: dict[str, tuple[Path, Path]] = {}
    for link_path, profile in drive_hub_profile_links(config):
        local_path = str(profile.get("localPath") or "").strip()
        if not local_path:
            continue
        target_folder = Path(local_path).expanduser().resolve(strict=False)
        if not target_folder.exists() or not target_folder.is_dir():
            continue
        if comparable_path(link_path) == comparable_path(target_folder):
            continue
        desired[comparable_path(link_path)] = (link_path, target_folder)
    return desired

def junction_target_matches(link_path: Path, target_folder: Path) -> bool:
    try:
        return comparable_path(link_path.resolve(strict=False)) == comparable_path(target_folder)
    except (OSError, RuntimeError):
        return False

def remove_stale_drive_hub_links(
    root_path: Path,
    desired_keys: set[str],
    recursive: bool,
    *,
    is_reparse_point_fn=is_reparse_point,
    remove_directory_reparse_point_fn=remove_directory_reparse_point,
) -> bool:
    if not root_path.is_dir():
        return False

    changed = False
    try:
        children = sorted(root_path.iterdir(), key=lambda item: item.name.casefold())
    except OSError:
        return False

    for child in children:
        try:
            child_is_link = is_reparse_point_fn(child)
            if child_is_link:
                if comparable_path(child) in desired_keys:
                    continue
                if remove_directory_reparse_point_fn(child):
                    changed = True
                continue
            if recursive and child.is_dir():
                if remove_stale_drive_hub_links(
                    child,
                    desired_keys,
                    recursive,
                    is_reparse_point_fn=is_reparse_point_fn,
                    remove_directory_reparse_point_fn=remove_directory_reparse_point_fn,
                ):
                    changed = True
        except OSError:
            continue
    return changed

def owner_folder_has_user_content(owner_path: Path) -> bool:
    if not owner_path.is_dir():
        return False
    try:
        for child in owner_path.iterdir():
            if child.name.casefold() == "desktop.ini":
                continue
            return True
    except OSError:
        return True
    return False

def remove_empty_hub_conflict_directory(path: Path, *, is_reparse_point_fn=is_reparse_point) -> bool:
    if not path.is_dir() or is_reparse_point_fn(path) or owner_folder_has_user_content(path):
        return False
    desktop_ini = path / "desktop.ini"
    if desktop_ini.exists():
        try:
            desktop_ini.unlink()
        except OSError:
            pass
    if owner_folder_has_user_content(path):
        return False
    try:
        path.rmdir()
        return True
    except OSError:
        return False

def prune_empty_shared_owner_folders(
    shared_drive_hub: Path,
    desired_links: list[Path],
    *,
    is_reparse_point_fn=is_reparse_point,
) -> bool:
    if not shared_drive_hub.is_dir():
        return False

    active_owner_paths: set[str] = set()
    for link_path in desired_links:
        try:
            owner_path = link_path.parent
            if comparable_path(owner_path.parent) == comparable_path(shared_drive_hub):
                active_owner_paths.add(comparable_path(owner_path))
        except (OSError, RuntimeError):
            continue

    changed = False
    try:
        owner_dirs = sorted(shared_drive_hub.iterdir(), key=lambda item: item.name.casefold())
    except OSError:
        return False

    for owner_path in owner_dirs:
        try:
            if comparable_path(owner_path) in active_owner_paths:
                continue
            if is_reparse_point_fn(owner_path) or owner_folder_has_user_content(owner_path):
                continue
            if remove_empty_hub_conflict_directory(owner_path, is_reparse_point_fn=is_reparse_point_fn):
                changed = True
        except OSError:
            continue
    return changed

def sync_drive_hub_links(
    config: dict[str, Any],
    *,
    drive_hub_junction_supported_fn=drive_hub_junction_supported,
    create_directory_junction_fn=create_directory_junction,
    is_reparse_point_fn=is_reparse_point,
    remove_directory_reparse_point_fn=remove_directory_reparse_point,
) -> bool:
    drive_root = configured_drive_root(config)
    if drive_root is None or not drive_hub_junction_supported_fn():
        return False
    if not ensure_drive_root_hubs(drive_root):
        return False

    my_drive_hub = drive_root / MY_DRIVE_HUB_NAME
    shared_drive_hub = drive_root / SHARED_DRIVE_HUB_NAME
    desired = drive_hub_link_targets(config)
    desired_keys = set(desired)
    changed = False

    if remove_stale_drive_hub_links(
        drive_root,
        desired_keys,
        recursive=False,
        is_reparse_point_fn=is_reparse_point_fn,
        remove_directory_reparse_point_fn=remove_directory_reparse_point_fn,
    ):
        changed = True
    if remove_stale_drive_hub_links(
        my_drive_hub,
        desired_keys,
        recursive=False,
        is_reparse_point_fn=is_reparse_point_fn,
        remove_directory_reparse_point_fn=remove_directory_reparse_point_fn,
    ):
        changed = True
    if remove_stale_drive_hub_links(
        shared_drive_hub,
        desired_keys,
        recursive=True,
        is_reparse_point_fn=is_reparse_point_fn,
        remove_directory_reparse_point_fn=remove_directory_reparse_point_fn,
    ):
        changed = True

    for link_path, target_folder in desired.values():
        try:
            link_path.parent.mkdir(parents=True, exist_ok=True)
            if link_path.exists() or is_reparse_point_fn(link_path):
                if is_reparse_point_fn(link_path):
                    if junction_target_matches(link_path, target_folder):
                        continue
                    if not remove_directory_reparse_point_fn(link_path):
                        continue
                else:
                    if not remove_empty_hub_conflict_directory(link_path, is_reparse_point_fn=is_reparse_point_fn):
                        continue
                    changed = True
            if create_directory_junction_fn(link_path, target_folder):
                changed = True
        except OSError:
            continue

    if prune_empty_shared_owner_folders(
        shared_drive_hub,
        [link_path for link_path, _ in desired.values()],
        is_reparse_point_fn=is_reparse_point_fn,
    ):
        changed = True
    return changed

def drive_hub_profile_for_target(config: dict[str, Any], target: Path | str) -> tuple[dict[str, Any], str] | None:
    logical_target = logical_desktop_target_path(config, target)
    matches: list[tuple[int, dict[str, Any], str]] = []
    for link_path, profile in drive_hub_profile_links(config, include_legacy_shared_aliases=True):
        rel = logical_relative_path(link_path, logical_target)
        if rel is None:
            continue
        matches.append((len(comparable_logical_path(link_path)), profile, rel))

    if not matches:
        return None
    matches.sort(key=lambda item: item[0], reverse=True)
    _, profile, rel = matches[0]
    return profile, rel

def target_is_drive_root_path(config: dict[str, Any], target: Path | str) -> bool:
    drive_root = configured_drive_root(config)
    if drive_root is None:
        return False
    return path_is_inside_logical(drive_root, logical_desktop_target_path(config, target))

def target_is_shared_drive_hub_path(config: dict[str, Any], target: Path | str) -> bool:
    drive_root = configured_drive_root(config)
    if drive_root is None:
        return False
    shared_hub = drive_root / SHARED_DRIVE_HUB_NAME
    return path_is_inside_logical(shared_hub, logical_desktop_target_path(config, target))

def target_drive_hub_route(config: dict[str, Any], target: Path | str) -> str | None:
    drive_root = configured_drive_root(config)
    if drive_root is None:
        return None

    target_path = logical_desktop_target_path(config, target)
    if comparable_logical_path(target_path) == comparable_logical_path(drive_root):
        return "/main/home"
    if comparable_logical_path(target_path) == comparable_logical_path(drive_root / MY_DRIVE_HUB_NAME):
        return "/main/home"
    if comparable_logical_path(target_path) == comparable_logical_path(drive_root / SHARED_DRIVE_HUB_NAME):
        return "/main/shareFile"
    return None

def shared_drive_owner_for_target(config: dict[str, Any], target: Path | str) -> str | None:
    drive_root = configured_drive_root(config)
    if drive_root is None:
        return None

    target_path = logical_desktop_target_path(config, target)
    shared_hub = drive_root / SHARED_DRIVE_HUB_NAME
    shared_rel = logical_relative_path(shared_hub, target_path)
    if shared_rel is None:
        return None

    rel = normalize_rel(shared_rel)
    if not rel or rel == ".":
        return None
    parts = rel.split("/")
    if len(parts) != 1 or not parts[0]:
        return None
    return safe_segment(parts[0])

def configured_sync_folders_for_target(config: dict[str, Any], target: Path | str) -> list[dict[str, Any]]:
    target_text = str(target or "").strip()
    if not target_text:
        return []

    matches: list[tuple[int, dict[str, Any]]] = []
    for profile in configured_sync_folders(config):
        if profile.get("enabled") is False:
            continue
        local_path = str(profile.get("localPath") or "").strip()
        if not local_path:
            continue
        if path_is_inside(local_path, target_text):
            matches.append((len(comparable_path(local_path)), profile))

    matches.sort(key=lambda item: item[0], reverse=True)
    if matches:
        return [matches[0][1]]

    hub_match = drive_hub_profile_for_target(config, target)
    return [hub_match[0]] if hub_match else []

def first_owned_sync_profile(config: dict[str, Any]) -> dict[str, Any] | None:
    for profile in configured_sync_folders(config):
        if profile.get("enabled") is False:
            continue
        if is_shared_rel(profile.get("remotePath") or ""):
            continue
        if str(profile.get("localPath") or "").strip():
            return profile
    return None

def resolve_adopted_drive_root_target(config: dict[str, Any], target: Path | str) -> Path:
    target_path = logical_desktop_target_path(config, target)
    drive_root = configured_drive_root(config)
    if drive_root is None:
        return target_path

    rel = logical_relative_path(drive_root, target_path)
    if rel is None:
        return target_path
    rel = normalize_rel(rel)
    if not rel or rel == ".":
        return target_path

    parts = rel.split("/")
    first_part = parts[0].casefold()
    if first_part in DRIVE_ROOT_HUB_FOLDER_NAMES or first_part in DRIVE_ROOT_SKIPPED_FOLDER_NAMES:
        return target_path

    my_drive_target = drive_root / MY_DRIVE_HUB_NAME / Path(rel)
    if my_drive_target.exists():
        return my_drive_target

    for profile in configured_sync_folders(config):
        if profile.get("enabled") is False:
            continue
        if is_shared_rel(profile.get("remotePath") or ""):
            continue
        local_path = str(profile.get("localPath") or "").strip()
        if local_path and path_is_inside(local_path, my_drive_target):
            return my_drive_target

    if len(parts) == 1:
        default_profile = first_owned_sync_profile(config)
        if default_profile:
            local_root = Path(str(default_profile.get("localPath") or "")).expanduser().resolve(strict=False)
            default_target = local_root / parts[0]
            if default_target.exists():
                return default_target

    return target_path

def enabled_sync_folders(config: dict[str, Any]) -> list[dict[str, Any]]:
    return [profile for profile in configured_sync_folders(config) if profile.get("enabled")]

def drive_hub_scope_profiles_for_target(config: dict[str, Any], target: Path | str) -> list[dict[str, Any]]:
    drive_root = configured_drive_root(config)
    if drive_root is None:
        return []

    target_path = logical_desktop_target_path(config, target)
    enabled = enabled_sync_folders(config)
    my_drive_hub = drive_root / MY_DRIVE_HUB_NAME
    shared_hub = drive_root / SHARED_DRIVE_HUB_NAME
    owned_profiles = [
        profile for profile in enabled
        if not is_shared_rel(profile.get("remotePath") or "")
    ]
    shared_profiles = [
        profile for profile in enabled
        if is_shared_rel(profile.get("remotePath") or "")
    ]

    if comparable_logical_path(target_path) == comparable_logical_path(drive_root):
        return enabled
    if comparable_logical_path(target_path) == comparable_logical_path(my_drive_hub):
        return owned_profiles
    if comparable_logical_path(target_path) == comparable_logical_path(shared_hub):
        return shared_profiles

    if path_is_inside_logical(my_drive_hub, target_path):
        return owned_profiles

    shared_rel = logical_relative_path(shared_hub, target_path)
    if shared_rel is None:
        if path_is_inside_logical(drive_root, target_path):
            return owned_profiles
        return []
    parts = normalize_rel(shared_rel).split("/")
    if not parts or not parts[0]:
        return shared_profiles

    owner = safe_segment(parts[0]).casefold()
    return [
        profile
        for profile in shared_profiles
        if shared_remote_parts(profile.get("remotePath") or "")[0].casefold() == owner
    ]

def desktop_target_cloud_path(config: dict[str, Any], target: Path | str) -> tuple[dict[str, Any], str, str] | None:
    target_text = str(target or "").strip()
    if not target_text:
        return None

    target_path = resolve_adopted_drive_root_target(config, target_text)
    hub_match = drive_hub_profile_for_target(config, target_path)
    if hub_match:
        profile, local_rel = hub_match
    else:
        profiles = configured_sync_folders_for_target(config, target_path)
        if not profiles:
            return None
        profile = profiles[0]
        local_root = Path(str(profile.get("localPath") or "")).expanduser().resolve(strict=False)
        try:
            local_rel = normalize_rel(target_path.expanduser().resolve(strict=False).relative_to(local_root))
        except ValueError:
            local_rel = ""

    local_root = Path(str(profile.get("localPath") or "")).expanduser().resolve(strict=False)
    remote_root = normalize_rel(profile.get("remotePath") or safe_segment(local_root.name))
    cloud_rel = join_scope_rel(remote_root, local_rel)
    return profile, cloud_rel, local_rel


def desktop_web_url(config: dict[str, Any], target: Path | str | None = None) -> str:

    base_url = frontend_url_from_config(config).rstrip("/")
    route_path = "/main/home"
    query: dict[str, str] = {}
    target_text = str(target or "").strip()
    if target_text:
        target_path = resolve_adopted_drive_root_target(config, target_text)
        hub_route = target_drive_hub_route(config, target_path)
        hub_profile = None if hub_route else drive_hub_profile_for_target(config, target_path)
        shared_owner = None if hub_route or hub_profile else shared_drive_owner_for_target(config, target_path)
        profiles = [] if hub_route or hub_profile or shared_owner else configured_sync_folders_for_target(config, target_path)
        if hub_route:
            route_path = hub_route
        elif hub_profile:
            profile, local_rel = hub_profile
            local_root = Path(str(profile.get("localPath") or "")).expanduser().resolve(strict=False)
            remote_root = normalize_rel(profile.get("remotePath") or safe_segment(local_root.name))
            cloud_rel = join_scope_rel(remote_root, local_rel)
            if cloud_rel:
                query["desktopPath"] = cloud_rel
                if is_shared_rel(cloud_rel):
                    route_path = "/main/shareFile"
        elif shared_owner:
            route_path = "/main/shareFile"
            query["desktopPath"] = f"{SHARED_ROOT_NAME}/{shared_owner}"
        elif profiles:
            profile = profiles[0]
            local_root = Path(str(profile.get("localPath") or "")).expanduser().resolve(strict=False)
            remote_root = normalize_rel(profile.get("remotePath") or safe_segment(local_root.name))
            try:
                local_rel = normalize_rel(target_path.expanduser().resolve(strict=False).relative_to(local_root))
            except ValueError:
                local_rel = ""
            cloud_rel = join_scope_rel(remote_root, local_rel)
            if cloud_rel:
                query["desktopPath"] = cloud_rel
                if is_shared_rel(cloud_rel):
                    route_path = "/main/shareFile"
        else:
            query["desktopTarget"] = target_path.name or target_text
            if target_is_shared_drive_hub_path(config, target_path):
                route_path = "/main/shareFile"

    suffix = ""
    if query:
        suffix = "?" + urllib.parse.urlencode(query)
    return f"{base_url}{route_path}{suffix}"


def profile_for_remote_path(config: dict[str, Any], remote_path: str) -> dict[str, Any] | None:

    normalized = normalize_rel(remote_path)
    for profile in configured_sync_folders(config):
        if normalize_rel(profile.get("remotePath") or "") == normalized:
            return profile
    return None

def drive_hub_link_for_remote_path(config: dict[str, Any], remote_path: str) -> Path | None:
    normalized = normalize_rel(remote_path)
    for link_path, profile in drive_hub_profile_links(config):
        if normalize_rel(profile.get("remotePath") or "") == normalized:
            return link_path
    return None

def open_path_in_file_explorer(path: Path) -> None:
    if os.name == "nt":
        try:
            subprocess.Popen(["explorer.exe", str(path)])
            return
        except OSError:
            pass
    try:
        webbrowser.open(path.resolve(strict=False).as_uri())
    except (OSError, ValueError):
        webbrowser.open(str(path))
