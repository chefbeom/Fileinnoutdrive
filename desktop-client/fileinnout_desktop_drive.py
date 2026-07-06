from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fileinnout_desktop_constants import SHARED_ROOT_NAME
from fileinnout_desktop_paths import comparable_path, normalize_rel, safe_segment
from fileinnout_desktop_windows import normalize_drive_letter


def path_is_inside(root: Path | str, target: Path | str) -> bool:
    try:
        root_path = Path(root).expanduser().resolve(strict=False)
        target_path = Path(target).expanduser().resolve(strict=False)
        if comparable_path(root_path) == comparable_path(target_path):
            return True
        target_path.relative_to(root_path)
        return True
    except (OSError, RuntimeError, ValueError):
        root_text = comparable_path(root).rstrip("\\/")
        target_text = comparable_path(target).rstrip("\\/")
        return target_text == root_text or target_text.startswith(root_text + os.sep)

def comparable_logical_path(path: Path | str) -> str:
    text = os.path.expanduser(str(path or ""))
    return os.path.normcase(os.path.abspath(text)).rstrip("\\/").casefold()

def path_is_inside_logical(root: Path | str, target: Path | str) -> bool:
    root_text = comparable_logical_path(root)
    target_text = comparable_logical_path(target)
    if not root_text or not target_text:
        return False
    return target_text == root_text or target_text.startswith(root_text + os.sep)

def logical_relative_path(root: Path | str, target: Path | str) -> str | None:
    if not path_is_inside_logical(root, target):
        return None
    try:
        rel = os.path.relpath(
            os.path.abspath(os.path.expanduser(str(target))),
            os.path.abspath(os.path.expanduser(str(root))),
        )
    except ValueError:
        return None
    if rel in {"", "."}:
        return ""
    return normalize_rel(rel)

def configured_drive_root(config: dict[str, Any]) -> Path | None:
    drive_root_raw = str(config.get("driveRoot") or "").strip()
    if not drive_root_raw:
        return None
    return Path(drive_root_raw).expanduser()

def drive_letter_target_to_drive_root(config: dict[str, Any], target: Path | str) -> Path | None:
    drive_root = configured_drive_root(config)
    drive_letter = normalize_drive_letter(config.get("driveLetter"))
    if drive_root is None or not drive_letter:
        return None

    target_text = str(target or "").strip().strip('"').replace("/", "\\")
    drive_prefix = f"{drive_letter}:"
    drive_root_prefix = f"{drive_prefix}\\"
    target_key = target_text.casefold()
    if target_key in {drive_prefix.casefold(), drive_root_prefix.casefold()}:
        return drive_root
    if not target_key.startswith(drive_root_prefix.casefold()):
        return None

    rel = target_text[len(drive_root_prefix):]
    return drive_root / Path(rel)

def logical_desktop_target_path(config: dict[str, Any], target: Path | str) -> Path:
    mapped = drive_letter_target_to_drive_root(config, target)
    if mapped is not None:
        return mapped
    return Path(str(target or "")).expanduser()

def safe_drive_link_name(preferred_name: Any, target_path: Any) -> str:
    name = str(preferred_name or "").strip()
    if not name:
        name = Path(str(target_path or "").strip().rstrip("\\/")).name
    if not name:
        name = "Sync folder"

    invalid = set('<>:"/\\|?*')
    invalid.update(chr(code) for code in range(32))
    cleaned = "".join("_" if char in invalid else char for char in name).strip().rstrip(".")
    return cleaned or "Sync folder"

def shared_remote_parts(remote_path: Any) -> tuple[str, str]:
    parts = normalize_rel(remote_path).split("/")
    if len(parts) < 3 or parts[0] != SHARED_ROOT_NAME:
        return "", ""
    return safe_segment(parts[1]), safe_segment(parts[-1])

def shared_drive_link_name(profile: dict[str, Any], remote_path: str, local_path: str) -> str:
    owner, folder_name = shared_remote_parts(remote_path)
    preferred = str(profile.get("name") or "").strip()
    owner_suffix = f" ({owner})" if owner else ""
    if owner_suffix and preferred.endswith(owner_suffix):
        preferred = preferred[: -len(owner_suffix)].strip()
    if not preferred:
        preferred = folder_name
    return safe_drive_link_name(preferred, local_path)
