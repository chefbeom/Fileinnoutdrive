from __future__ import annotations

import os
import stat
from pathlib import Path


def make_file_writable(path: Path) -> None:
    try:
        if path.exists():
            mode = path.stat().st_mode
            path.chmod(mode | stat.S_IWRITE | stat.S_IWUSR)
    except OSError:
        pass


def make_file_readonly(path: Path) -> None:
    try:
        if path.exists() and path.is_file():
            mode = path.stat().st_mode
            path.chmod(mode & ~(stat.S_IWRITE | stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH))
    except OSError:
        pass


def is_file_writable(path: Path) -> bool:
    try:
        return path.exists() and path.is_file() and bool(path.stat().st_mode & stat.S_IWRITE)
    except OSError:
        return False


def make_tree_writable(path: Path) -> None:
    if path.is_file():
        make_file_writable(path)
        return
    if not path.exists():
        return
    try:
        for current_root, dir_names, file_names in os.walk(path):
            current = Path(current_root)
            make_file_writable(current)
            for file_name in file_names:
                make_file_writable(current / file_name)
            for dir_name in dir_names:
                make_file_writable(current / dir_name)
    except OSError:
        pass