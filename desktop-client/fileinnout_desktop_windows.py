#!/usr/bin/env python3
"""Windows filesystem and drive integration helpers for FileInNOut Desktop."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any

from fileinnout_desktop_constants import FILE_ATTRIBUTE_REPARSE_POINT


def is_reparse_point(path: Path) -> bool:
    try:
        if path.is_symlink():
            return True
        attrs = getattr(path.stat(follow_symlinks=False), "st_file_attributes", 0)
        return bool(attrs & FILE_ATTRIBUTE_REPARSE_POINT)
    except OSError:
        return False


def drive_hub_junction_supported() -> bool:
    return os.name == "nt"


def create_directory_junction(link_path: Path, target_folder: Path) -> bool:
    try:
        result = subprocess.run(
            ["cmd", "/d", "/c", "mklink", "/J", str(link_path), str(target_folder)],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return result.returncode == 0


def remove_directory_reparse_point(path: Path) -> bool:
    try:
        path.rmdir()
        return True
    except OSError:
        return False


def normalize_drive_letter(value: Any) -> str:
    text = str(value or "").strip().rstrip(":").upper()
    return text if len(text) == 1 and "A" <= text <= "Z" else ""


def get_subst_target(letter: Any) -> str:
    normalized = normalize_drive_letter(letter)
    if not normalized:
        return ""
    try:
        result = subprocess.run(
            ["subst"],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return ""

    prefix = f"{normalized}:\\: => "
    for line in (result.stdout or "").splitlines():
        if line.upper().startswith(prefix.upper()):
            return line[len(prefix):].strip()
    return ""


def drive_mapping_supported() -> bool:
    return os.name == "nt"


def drive_letter_candidates(preferred_letter: Any) -> list[str]:
    preferred = normalize_drive_letter(preferred_letter)
    letters: list[str] = []
    if preferred:
        letters.append(preferred)
        for code in range(ord(preferred) + 1, ord("Z") + 1):
            letters.append(chr(code))
    letters.extend(list("GHIJKLMNOPQRSTUVWXYZ"))
    result: list[str] = []
    seen: set[str] = set()
    for letter in letters:
        normalized = normalize_drive_letter(letter)
        if normalized and normalized not in seen:
            result.append(normalized)
            seen.add(normalized)
    return result


def drive_letter_path_exists(letter: Any) -> bool:
    normalized = normalize_drive_letter(letter)
    if not normalized:
        return False
    return Path(f"{normalized}:\\").exists()


def drive_appearance_state(letter: Any) -> dict[str, str]:
    normalized = normalize_drive_letter(letter)
    if not normalized:
        return {"label": "", "icon": ""}
    try:
        import winreg  # type: ignore
    except ImportError:
        return {"label": "", "icon": ""}

    base = rf"Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\{normalized}"
    values = {"label": "", "icon": ""}
    for key_name, field in (("DefaultLabel", "label"), ("DefaultIcon", "icon")):
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, base + "\\" + key_name) as key:
                raw, _ = winreg.QueryValueEx(key, "")
                values[field] = str(raw)
        except OSError:
            values[field] = ""
    return values
