from __future__ import annotations

from pathlib import Path
from typing import Any

from fileinnout_desktop_config import GLOBAL_CONFIG_PATH
from fileinnout_desktop_constants import SHARED_ROOT_NAME
from fileinnout_desktop_drive import path_is_inside
from fileinnout_desktop_models import DesktopError
from fileinnout_desktop_paths import comparable_path, normalize_rel, safe_segment
from fileinnout_desktop_remote import build_remote_tree, is_accepted_shared_item, node_type

def normalize_sync_direction(value: Any) -> str:
    raw = str(value or "two-way").strip().lower().replace("_", "-")
    if raw in {"upload", "push", "local-to-cloud", "local-cloud", "a-to-b"}:
        return "upload"
    if raw in {"download", "pull", "cloud-to-local", "cloud-local", "b-to-a"}:
        return "download"
    return "two-way"

def join_scope_rel(remote_path: str, local_rel: str) -> str:
    remote_path = normalize_rel(remote_path)
    local_rel = normalize_rel(local_rel)
    if not remote_path:
        return local_rel
    if not local_rel:
        return remote_path
    return normalize_rel(Path(remote_path) / local_rel)

def strip_scope_rel(remote_rel: str, remote_path: str) -> str | None:
    remote_rel = normalize_rel(remote_rel)
    remote_path = normalize_rel(remote_path)
    if not remote_path:
        return remote_rel
    if remote_rel == remote_path:
        return ""
    prefix = remote_path + "/"
    if remote_rel.startswith(prefix):
        return remote_rel[len(prefix):]
    return None

def configured_sync_folders(config: dict[str, Any]) -> list[dict[str, Any]]:
    raw_profiles = config.get("syncFolders")
    profiles = raw_profiles if isinstance(raw_profiles, list) else []
    normalized: list[dict[str, Any]] = []

    for index, profile in enumerate(profiles):
        if not isinstance(profile, dict):
            continue
        local_path = str(profile.get("localPath") or profile.get("syncDir") or "").strip()
        if not local_path:
            continue
        remote_path = normalize_rel(profile.get("remotePath") or safe_segment(Path(local_path).name))
        normalized_profile = {
            "name": str(profile.get("name") or Path(local_path).name or f"Folder {index + 1}"),
            "localPath": local_path,
            "remotePath": remote_path,
            "direction": normalize_sync_direction(profile.get("direction")),
            "enabled": profile.get("enabled") is not False,
        }
        permission = str(profile.get("permission") or "").upper()
        if permission in {"READ", "DOWNLOAD", "UPLOAD", "WRITE"}:
            normalized_profile["permission"] = permission
        normalized.append(normalized_profile)

    if normalized:
        return normalized

    legacy_profile = legacy_sync_folder_profile(config)
    if legacy_profile:
        return [legacy_profile]

    return []

def legacy_sync_folder_profile(config: dict[str, Any]) -> dict[str, Any] | None:
    legacy_dir = str(config.get("syncDir") or "").strip()
    if not legacy_dir:
        return None
    legacy_name = Path(legacy_dir).name or "FileInNOut"
    return {
        "name": legacy_name,
        "localPath": legacy_dir,
        "remotePath": safe_segment(legacy_name),
        "direction": "two-way",
        "enabled": True,
    }

def sync_folder_profiles_for_update(config: dict[str, Any]) -> list[dict[str, Any]]:
    raw_profiles = config.get("syncFolders")
    if isinstance(raw_profiles, list):
        profiles = raw_profiles
    else:
        profiles = []
        config["syncFolders"] = profiles

    if profiles:
        return profiles

    legacy_profile = legacy_sync_folder_profile(config)
    if legacy_profile:
        profiles.append(legacy_profile)
    return profiles

def unique_remote_path(preferred: str, used_remote_paths: set[str]) -> str:
    base = normalize_rel(safe_segment(preferred)) or "Folder"
    candidate = base
    suffix = 2
    while candidate.casefold() in used_remote_paths:
        candidate = f"{base} {suffix}"
        suffix += 1
    used_remote_paths.add(candidate.casefold())
    return candidate

def add_or_update_sync_folder_profile(
    config: dict[str, Any],
    target: Path | str,
    *,
    remote_path: str = "",
    direction: str = "two-way",
    name: str = "",
) -> tuple[dict[str, Any], bool]:
    target_path = Path(target).expanduser().resolve(strict=False)
    if target_path.exists() and target_path.is_file():
        target_path = target_path.parent.resolve(strict=False)
    if not target_path.exists() or not target_path.is_dir():
        raise DesktopError(f"target folder does not exist: {target_path}")

    profiles = sync_folder_profiles_for_update(config)
    target_key = comparable_path(target_path)
    matched_profile: dict[str, Any] | None = None
    used_remote_paths: set[str] = set()

    for profile in profiles:
        if not isinstance(profile, dict):
            continue
        local_path = str(profile.get("localPath") or profile.get("syncDir") or "").strip()
        profile_remote = normalize_rel(profile.get("remotePath") or safe_segment(Path(local_path).name))
        if local_path and profile_remote:
            used_remote_paths.add(profile_remote.casefold())
        if not local_path:
            continue
        profile_path = Path(local_path).expanduser().resolve(strict=False)
        profile_key = comparable_path(profile_path)
        if profile_key == target_key:
            matched_profile = profile
            continue
        if path_is_inside(profile_path, target_path) or path_is_inside(target_path, profile_path):
            raise DesktopError(f"target overlaps an existing sync folder: {local_path}")

    normalized_remote = normalize_rel(remote_path)
    normalized_direction = normalize_sync_direction(direction)
    display_name = str(name or target_path.name or "Sync folder").strip()
    if matched_profile is None:
        if not normalized_remote:
            normalized_remote = unique_remote_path(display_name, used_remote_paths)
        matched_profile = {
            "name": display_name,
            "localPath": str(target_path),
            "remotePath": normalized_remote,
            "direction": normalized_direction,
            "enabled": True,
        }
        profiles.append(matched_profile)
        added = True
    else:
        current_remote = normalize_rel(matched_profile.get("remotePath") or "")
        if current_remote:
            used_remote_paths.discard(current_remote.casefold())
        if not normalized_remote:
            normalized_remote = current_remote or unique_remote_path(display_name, used_remote_paths)
        matched_profile.update(
            {
                "name": display_name or str(matched_profile.get("name") or target_path.name or "Sync folder"),
                "localPath": str(target_path),
                "remotePath": normalized_remote,
                "direction": normalized_direction,
                "enabled": True,
            }
        )
        added = False

    if not str(config.get("syncDir") or "").strip():
        config["syncDir"] = str(target_path)
    config["syncFolders"] = profiles
    return matched_profile, added

def unique_local_child_path(parent: Path, name: str) -> Path:
    candidate = parent / name
    if not candidate.exists():
        return candidate
    source = Path(name)
    stem = source.stem or source.name
    suffix = source.suffix
    index = 2
    while True:
        candidate = parent / f"{stem} ({index}){suffix}"
        if not candidate.exists():
            return candidate
        index += 1

def shared_profile_direction(item: dict[str, Any] | None) -> str:
    permission = str((item or {}).get("permission") or "").upper()
    if permission == "UPLOAD":
        return "upload"
    if permission in {"READ", "DOWNLOAD"}:
        return "download"
    return "two-way"

def unique_profile_name(profiles: list[dict[str, Any]], preferred: str, remote_path: str) -> str:
    base = safe_segment(preferred) or "Shared folder"
    used = {
        str(profile.get("name") or "").casefold()
        for profile in profiles
        if normalize_rel(profile.get("remotePath") or "") != normalize_rel(remote_path)
    }
    candidate = base
    suffix = 2
    while candidate.casefold() in used:
        candidate = f"{base} {suffix}"
        suffix += 1
    return candidate

def shared_profile_display_name(owner: str, folder_name: str) -> str:
    owner = safe_segment(owner)
    folder_name = safe_segment(folder_name)
    return f"{folder_name} ({owner})" if owner else folder_name

def is_legacy_shared_profile_name(value: Any) -> bool:
    return str(value or "").strip().casefold().startswith("shared - ")

def ensure_shared_sync_profile(
    config: dict[str, Any],
    shared_rel: str,
    item: dict[str, Any] | None,
    force_enable: bool = True,
) -> bool:
    shared_rel = normalize_rel(shared_rel)
    parts = shared_rel.split("/")
    if len(parts) < 3 or parts[0] != SHARED_ROOT_NAME:
        return False
    if node_type(item or {}) != "FOLDER":
        return False

    profiles = config.get("syncFolders")
    if not isinstance(profiles, list):
        profiles = configured_sync_folders(config)
        config["syncFolders"] = profiles

    owner = safe_segment(parts[1])
    folder_name = safe_segment(parts[-1])
    local_root = GLOBAL_CONFIG_PATH.parent / "shared-folders" / owner / folder_name
    local_root.mkdir(parents=True, exist_ok=True)
    direction = shared_profile_direction(item)
    permission = str((item or {}).get("permission") or "").upper()
    if permission not in {"READ", "DOWNLOAD", "UPLOAD", "WRITE"}:
        permission = ""
    preferred_name = shared_profile_display_name(owner, folder_name)
    name = unique_profile_name(profiles, preferred_name, shared_rel)

    changed = False
    for profile in profiles:
        if not isinstance(profile, dict):
            continue
        if normalize_rel(profile.get("remotePath") or "") != shared_rel:
            continue
        if profile.get("enabled") is False and not force_enable:
            return False
        if profile.get("localPath") != str(local_root):
            profile["localPath"] = str(local_root)
            changed = True
        if profile.get("direction") != direction:
            profile["direction"] = direction
            changed = True
        if permission and profile.get("permission") != permission:
            profile["permission"] = permission
            changed = True
        if profile.get("enabled") is False:
            profile["enabled"] = True
            changed = True
        if not profile.get("name") or is_legacy_shared_profile_name(profile.get("name")):
            profile["name"] = name
            changed = True
        return changed

    profiles.append({
        "name": name,
        "localPath": str(local_root),
        "remotePath": shared_rel,
        "direction": direction,
        "permission": permission,
        "enabled": True,
    })
    return True

def sync_accepted_shared_profiles(api: FileInNOutApi, config: dict[str, Any]) -> bool:
    changed = False
    remote = build_remote_tree(api, include_shared=True)
    for rel, item in sorted(remote.items()):
        parts = normalize_rel(rel).split("/")
        if len(parts) != 3 or parts[0] != SHARED_ROOT_NAME:
            continue
        if not item.get("_sharedWithMe") and not item.get("sharedWithMe"):
            continue
        if node_type(item) != "FOLDER" or not is_accepted_shared_item(item):
            continue
        if ensure_shared_sync_profile(config, rel, item, force_enable=False):
            changed = True
    return changed
