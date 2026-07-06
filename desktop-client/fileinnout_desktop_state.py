from __future__ import annotations

import ctypes
import json
import os
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import fileinnout_desktop_config as desktop_config
from fileinnout_desktop_constants import LOCK_FILE_NAME, STATE_DIR_NAME, STATE_FILE_NAME
from fileinnout_desktop_models import DesktopError, SyncStats


def root_state_path(root: Path) -> Path:
    return root / STATE_DIR_NAME / STATE_FILE_NAME


def root_lock_path(root: Path) -> Path:
    return root / STATE_DIR_NAME / LOCK_FILE_NAME


def watch_log_path() -> Path:
    return desktop_config.app_config_dir() / "logs" / "watch.log"


def load_state(root: Path) -> dict[str, object]:
    state = desktop_config.read_json(root_state_path(root), {})
    state.setdefault("local", {})
    state.setdefault("localFolders", [])
    state.setdefault("remote", {})
    state.setdefault("syncActivity", [])
    state.setdefault("lastSync", None)
    return state


def save_state(root: Path, state: dict[str, object]) -> None:
    state["lastSync"] = int(time.time())
    desktop_config.write_json(root_state_path(root), state)


def stats_to_dict(stats: SyncStats) -> dict[str, object]:
    payload: dict[str, object] = {
        "pulled": stats.pulled,
        "pushed": stats.pushed,
        "deleted": stats.deleted,
        "foldersCreated": stats.folders_created,
        "skippedDirty": stats.skipped_dirty,
        "downloadFailed": stats.download_failed,
    }
    if stats.conflicts:
        payload["conflicts"] = stats.conflicts[-25:]
    return payload


def update_sync_status(
    root: Path,
    status: str,
    *,
    pull_stats: SyncStats | None = None,
    push_stats: SyncStats | None = None,
    error: str | None = None,
) -> None:
    state = load_state(root)
    runtime: dict[str, object] = {
        "status": status,
        "updatedAt": int(time.time()),
    }
    if pull_stats is not None:
        runtime["pull"] = stats_to_dict(pull_stats)
    if push_stats is not None:
        runtime["push"] = stats_to_dict(push_stats)
    if error:
        runtime["error"] = error
    state["syncStatus"] = runtime
    activity = dict(runtime)
    history = state.get("syncActivity")
    if not isinstance(history, list):
        history = []
    state["syncActivity"] = [activity, *history][:50]
    desktop_config.write_json(root_state_path(root), state)


def process_exists(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        kernel32 = ctypes.windll.kernel32
        process_query_limited_information = 0x1000
        handle = kernel32.OpenProcess(process_query_limited_information, False, pid)
        if handle:
            kernel32.CloseHandle(handle)
            return True
        # ERROR_ACCESS_DENIED means the process exists but cannot be queried.
        return kernel32.GetLastError() == 5
    try:
        os.kill(pid, 0)
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def lock_info(path: Path) -> dict[str, object]:
    try:
        value = desktop_config.read_json(path, {})
    except DesktopError:
        return {}
    return value if isinstance(value, dict) else {}


def is_stale_lock(path: Path, info: dict[str, object], stale_seconds: int) -> bool:
    if stale_seconds > 0:
        try:
            if time.time() - path.stat().st_mtime > stale_seconds:
                return True
        except FileNotFoundError:
            return True

    try:
        pid = int(info.get("pid") or 0)
    except (TypeError, ValueError):
        return stale_seconds > 0
    return pid > 0 and not process_exists(pid)


def acquire_sync_lock(root: Path, stale_seconds: int = 86400) -> Path:
    path = root_lock_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "pid": os.getpid(),
        "createdAt": int(time.time()),
        "root": str(root),
    }

    for _ in range(2):
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            existing = lock_info(path)
            if is_stale_lock(path, existing, stale_seconds):
                try:
                    path.unlink()
                except FileNotFoundError:
                    pass
                continue
            detail = f"pid={existing.get('pid', 'unknown')} createdAt={existing.get('createdAt', 'unknown')}"
            raise DesktopError(f"sync folder is already locked by another FileInNOut process ({detail})")
        else:
            with os.fdopen(fd, "w", encoding="utf-8") as file:
                json.dump(payload, file, ensure_ascii=False, indent=2, sort_keys=True)
            return path

    raise DesktopError(f"could not acquire sync lock: {path}")


def release_sync_lock(path: Path) -> None:
    info = lock_info(path)
    try:
        owner_pid = int(info.get("pid") or 0)
    except (TypeError, ValueError):
        owner_pid = 0
    if owner_pid == os.getpid():
        try:
            path.unlink()
        except FileNotFoundError:
            pass


@contextmanager
def sync_lock(root: Path, stale_seconds: int = 86400) -> Iterator[None]:
    path = acquire_sync_lock(root, stale_seconds=stale_seconds)
    try:
        yield
    finally:
        release_sync_lock(path)


def describe_sync_lock(root: Path, stale_seconds: int = 86400) -> str:
    path = root_lock_path(root)
    if not path.exists():
        return "none"
    info = lock_info(path)
    state = "stale" if is_stale_lock(path, info, stale_seconds) else "active"
    return f"{state} pid={info.get('pid', 'unknown')} createdAt={info.get('createdAt', 'unknown')}"
