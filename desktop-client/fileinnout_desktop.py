#!/usr/bin/env python3
"""FileInNOut Desktop sync client.

This client intentionally uses only the Python standard library so it can run
on a clean Windows VM after Python is installed. It mirrors a FileInNOut cloud
drive into a normal local directory and can poll for changes like a lightweight
Google Drive Desktop style sync folder.
"""

from __future__ import annotations

import argparse
import copy
import ctypes
import http.client
from http.cookies import SimpleCookie
from contextlib import contextmanager
import getpass
import json
import mimetypes
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path
from typing import Any

from fileinnout_desktop_constants import (
    ACCOUNT_PROFILE_FIELDS,
    ACCOUNT_SYNC_FIELDS,
    APP_NAME,
    CHUNK_SIZE_BYTES,
    CONFIG_DIR_NAME,
    DRIVE_ROOT_HUB_FOLDER_NAMES,
    DRIVE_ROOT_SKIPPED_FOLDER_NAMES,
    FILE_ATTRIBUTE_REPARSE_POINT,
    GET_RETRY_ATTEMPTS,
    LOCK_FILE_NAME,
    MY_DRIVE_HUB_NAME,
    PARTITION_SIZE_BYTES,
    ROOT_FILE_SYNC_FOLDER_NAME,
    SHARE_URL_HOSTS,
    SHARE_URL_SCHEME,
    SHARED_DRIVE_HUB_NAME,
    SHARED_ROOT_NAME,
    SKIPPED_FILE_PREFIXES,
    SKIPPED_FILE_SUFFIXES,
    SKIPPED_FILES,
    SKIPPED_ROOTS,
    STATE_DIR_NAME,
    STATE_FILE_NAME,
)
from fileinnout_desktop_models import AuthTokens, DesktopError, SyncStats


def app_config_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
    if base:
        return Path(base) / CONFIG_DIR_NAME
    return Path.home() / ".fileinnout-desktop"


GLOBAL_CONFIG_PATH = app_config_dir() / "config.json"
LEGACY_GLOBAL_CONFIG_PATH = (
    Path(os.environ["APPDATA"]) / APP_NAME / "config.json"
    if os.environ.get("APPDATA")
    else Path.home() / ".fileinnout-desktop" / "config.json"
)


def extract_refresh_token(headers: dict[str, str]) -> str:
    for key, value in (headers or {}).items():
        if key.lower() != "set-cookie":
            continue
        cookie = SimpleCookie()
        cookie.load(value)
        morsel = cookie.get("refresh")
        if morsel is not None:
            return morsel.value
    return ""


class FileInNOutApi:
    def __init__(
        self,
        server: str,
        token: str | None = None,
        refresh_token: str | None = None,
        token_callback: Any = None,
    ):
        self.server = server.rstrip("/")
        self.token = token
        self.refresh_token = refresh_token or ""
        self.token_callback = token_callback

    def request(
        self,
        method: str,
        path: str,
        body: Any = None,
        headers: dict[str, str] | None = None,
        raw_body: bytes | None = None,
    ) -> tuple[int, dict[str, str], bytes]:
        method_name = method.upper()
        attempts = GET_RETRY_ATTEMPTS if method_name == "GET" else 1
        for attempt in range(attempts):
            try:
                return self._request_once(method, path, body=body, headers=headers, raw_body=raw_body)
            except urllib.error.HTTPError as error:
                if error.code == 401 and self.refresh_token and path not in {"/login", "/auth/reissue", "/auth/logout"}:
                    self.reissue()
                    return self._request_once(method, path, body=body, headers=headers, raw_body=raw_body)
                message = error.read().decode("utf-8", errors="replace")
                if error.code == 401 and not self.refresh_token and path not in {"/login", "/auth/reissue", "/auth/logout"}:
                    message = (
                        message
                        + " Saved desktop session cannot be refreshed because refreshToken is missing. "
                        + "Log in again from FileInNOut Desktop."
                    )
                raise DesktopError(f"{method_name} {path} failed: HTTP {error.code} {message}") from error
            except urllib.error.URLError as error:
                if attempt + 1 < attempts:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                raise DesktopError(f"{method_name} {path} failed: {error.reason}") from error
            except (http.client.IncompleteRead, http.client.RemoteDisconnected, ConnectionResetError, TimeoutError) as error:
                if attempt + 1 < attempts:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                raise DesktopError(f"{method_name} {path} failed: {error}") from error

        raise DesktopError(f"{method_name} {path} failed")

    def _request_once(
        self,
        method: str,
        path: str,
        body: Any = None,
        headers: dict[str, str] | None = None,
        raw_body: bytes | None = None,
    ) -> tuple[int, dict[str, str], bytes]:
        url = self.server + path
        req_headers = dict(headers or {})
        if self.token:
            req_headers["Authorization"] = f"Bearer {self.token}"

        data = raw_body
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            req_headers["Content-Type"] = "application/json"

        request = urllib.request.Request(url, data=data, headers=req_headers, method=method.upper())
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.status, dict(response.headers.items()), response.read()

    def json_request(self, method: str, path: str, body: Any = None) -> Any:
        _, _, payload = self.request(method, path, body=body)
        if not payload:
            return None
        return json.loads(payload.decode("utf-8"))

    def login_tokens(self, email: str, password: str) -> AuthTokens:
        _, headers, payload = self.request("POST", "/login", body={"email": email, "password": password})
        auth_header = headers.get("Authorization") or headers.get("authorization")
        access_token = ""
        if auth_header and auth_header.lower().startswith("bearer "):
            access_token = auth_header[7:]

        try:
            data = json.loads(payload.decode("utf-8")) if payload else {}
        except json.JSONDecodeError:
            data = {}
        if not access_token:
            access_token = data.get("accessToken") or data.get("token") or ""
        if not access_token:
            raise DesktopError("login succeeded but no access token was returned")
        refresh_token = extract_refresh_token(headers)
        self.token = access_token
        self.refresh_token = refresh_token
        return AuthTokens(access_token, refresh_token)

    def login(self, email: str, password: str) -> str:
        return self.login_tokens(email, password).access_token

    def reissue(self) -> AuthTokens:
        if not self.refresh_token:
            raise DesktopError("refresh token is missing. Log in again.")
        try:
            _, headers, _ = self._request_once(
                "POST",
                "/auth/reissue",
                headers={"Cookie": f"refresh={self.refresh_token}"},
                body={},
            )
        except urllib.error.HTTPError as error:
            message = error.read().decode("utf-8", errors="replace")
            raise DesktopError(f"POST /auth/reissue failed: HTTP {error.code} {message}") from error
        except urllib.error.URLError as error:
            raise DesktopError(f"POST /auth/reissue failed: {error.reason}") from error
        auth_header = headers.get("Authorization") or headers.get("authorization")
        access_token = auth_header[7:] if auth_header and auth_header.lower().startswith("bearer ") else ""
        if not access_token:
            raise DesktopError("token reissue succeeded but no access token was returned")
        refresh_token = extract_refresh_token(headers) or self.refresh_token
        self.token = access_token
        self.refresh_token = refresh_token
        if self.token_callback:
            self.token_callback(AuthTokens(access_token, refresh_token))
        return AuthTokens(access_token, refresh_token)

    def list_owned(self) -> list[dict[str, Any]]:
        return expect_list(self.json_request("GET", "/file/list"))

    def list_shared(self) -> list[dict[str, Any]]:
        return expect_list(self.json_request("GET", "/file/share/shared/list"))

    def list_pending_shares(self) -> list[dict[str, Any]]:
        return expect_list(self.json_request("GET", "/file/share/shared/pending"))

    def storage_summary(self) -> dict[str, Any]:
        return expect_object(self.json_request("GET", "/file/storage/summary"))

    def create_folder(self, folder_name: str, parent_id: int | None) -> dict[str, Any]:
        return expect_object(
            self.json_request("POST", "/file/folder", {"folderName": folder_name, "parentId": parent_id})
        )

    def trash_file(self, file_id: int) -> None:
        self.json_request("PATCH", f"/file/{file_id}/trash")

    def move_file(self, file_id: int, target_parent_id: int | None) -> None:
        self.json_request("PATCH", f"/file/{file_id}/move", {"targetParentId": target_parent_id})

    def rename_file(self, file_id: int, file_name: str) -> None:
        self.json_request("PATCH", f"/file/{file_id}/rename", {"fileName": file_name})

    def trash_shared_file(self, file_id: int) -> None:
        self.json_request("PATCH", f"/file/share/shared/{file_id}/trash")

    def share(self, file_ids: list[int], email: str, permission: str = "READ") -> Any:
        return self.json_request(
            "POST",
            "/file/share",
            {"fileIdxList": file_ids, "recipientEmail": email, "permission": permission},
        )

    def accept_shared_file(self, file_id_value: int) -> Any:
        return self.json_request("POST", f"/file/share/shared/{file_id_value}/accept")

    def reject_shared_file(self, file_id_value: int) -> Any:
        return self.json_request("POST", f"/file/share/shared/{file_id_value}/reject")

    def create_shared_folder(self, folder_id: int, folder_name: str) -> dict[str, Any]:
        return expect_object(
            self.json_request(
                "POST",
                f"/file/share/shared/{folder_id}/folder",
                {"folderName": folder_name},
            )
        )

    def upload_shared_file(self, folder_id: int, file_path: Path, relative_path: str) -> dict[str, Any]:
        fields = {"relativePath": relative_path}
        files = {"file": file_path}
        return expect_object(self.multipart_request("POST", f"/file/share/shared/{folder_id}/file", fields, files))

    def multipart_request(
        self,
        method: str,
        path: str,
        fields: dict[str, str],
        files: dict[str, Path],
    ) -> Any:
        boundary = f"----FileInNOutDesktop{int(time.time() * 1000)}"
        body = bytearray()

        for name, value in fields.items():
            if value is None:
                continue
            body.extend(f"--{boundary}\r\n".encode("ascii"))
            body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("ascii"))
            body.extend(str(value).encode("utf-8"))
            body.extend(b"\r\n")

        for name, file_path in files.items():
            file_name = file_path.name
            content_type = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
            body.extend(f"--{boundary}\r\n".encode("ascii"))
            body.extend(
                (
                    f'Content-Disposition: form-data; name="{name}"; filename="{file_name}"\r\n'
                    f"Content-Type: {content_type}\r\n\r\n"
                ).encode("utf-8")
            )
            body.extend(file_path.read_bytes())
            body.extend(b"\r\n")

        body.extend(f"--{boundary}--\r\n".encode("ascii"))
        _, _, payload = self.request(
            method,
            path,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            raw_body=bytes(body),
        )
        return json.loads(payload.decode("utf-8")) if payload else None

    def init_upload(self, request_body: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return expect_list(self.json_request("POST", "/file/upload", request_body))

    def complete_upload(self, body: dict[str, Any]) -> Any:
        return self.json_request("POST", "/file/upload/complete", body)

    def abort_upload(self, body: dict[str, Any]) -> None:
        try:
            self.json_request("POST", "/file/upload/abort", body)
        except DesktopError:
            pass

    def put_presigned(self, url: str, data: bytes, content_type: str) -> None:
        request = urllib.request.Request(
            url,
            data=data,
            method="PUT",
            headers={"Content-Type": content_type or "application/octet-stream"},
        )
        try:
            with urllib.request.urlopen(request, timeout=600) as response:
                response.read()
        except urllib.error.HTTPError as error:
            message = error.read().decode("utf-8", errors="replace")
            raise DesktopError(f"presigned upload failed: HTTP {error.code} {message}") from error
        except urllib.error.URLError as error:
            raise DesktopError(f"presigned upload failed: {error.reason}") from error

    def download(self, file_id: int, shared: bool = False) -> bytes:
        path = f"/file/share/shared/{file_id}/download" if shared else f"/file/{file_id}/download"
        _, _, payload = self.request("GET", path)
        return payload


def expect_list(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        for key in ("result", "data"):
            if isinstance(value.get(key), list):
                return [item for item in value[key] if isinstance(item, dict)]
            if isinstance(value.get(key), dict):
                nested = value[key].get("result")
                if isinstance(nested, list):
                    return [item for item in nested if isinstance(item, dict)]
    return []


def expect_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        if isinstance(value.get("result"), dict):
            return value["result"]
        if isinstance(value.get("data"), dict):
            data = value["data"]
            return data.get("result") if isinstance(data.get("result"), dict) else data
        return value
    return {}


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        return default
    except json.JSONDecodeError as error:
        raise DesktopError(f"invalid JSON in {path}: {error}") from error


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    tmp.replace(path)


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


def account_key(email: Any) -> str:
    return str(email or "").strip().lower()


def account_default_sync_dir(email: Any) -> str:
    key = account_key(email) or "default"
    folder = urllib.parse.quote(key, safe="") or "default"
    return str(GLOBAL_CONFIG_PATH.parent / "accounts" / folder / "sync")


def account_profiles(config: dict[str, Any]) -> dict[str, Any]:
    profiles = config.get("accounts")
    if not isinstance(profiles, dict):
        profiles = {}
        config["accounts"] = profiles
    return profiles


def snapshot_account_profile(config: dict[str, Any], email: Any | None = None) -> None:
    key = account_key(email if email is not None else config.get("email"))
    if not key:
        return
    profiles = account_profiles(config)
    profile = profiles.get(key)
    if not isinstance(profile, dict):
        profile = {}
        profiles[key] = profile
    for field in ACCOUNT_PROFILE_FIELDS:
        if field in config:
            profile[field] = copy.deepcopy(config[field])
        else:
            profile.pop(field, None)


def apply_account_profile(config: dict[str, Any], email: Any | None = None, include_tokens: bool = True) -> dict[str, Any]:
    key = account_key(email if email is not None else config.get("email"))
    if not key:
        return config
    profile = account_profiles(config).get(key)
    fields = ACCOUNT_PROFILE_FIELDS if include_tokens else ACCOUNT_SYNC_FIELDS
    if isinstance(profile, dict):
        for field in fields:
            if field in profile:
                config[field] = copy.deepcopy(profile[field])
            elif field in ACCOUNT_SYNC_FIELDS:
                config.pop(field, None)
    else:
        for field in ACCOUNT_SYNC_FIELDS:
            config.pop(field, None)
        config["syncDir"] = account_default_sync_dir(key)
    return config


def load_global_config() -> dict[str, Any]:
    config = read_json(GLOBAL_CONFIG_PATH, None)
    if config is None and LEGACY_GLOBAL_CONFIG_PATH != GLOBAL_CONFIG_PATH:
        config = read_json(LEGACY_GLOBAL_CONFIG_PATH, {})
    if config is None:
        config = {}
    return apply_account_profile(config)


def save_global_config(config: dict[str, Any]) -> None:
    write_json(GLOBAL_CONFIG_PATH, config)


def update_global_config(changes: dict[str, Any]) -> dict[str, Any]:
    config = load_global_config()
    config.update({key: value for key, value in changes.items() if value is not None})
    snapshot_account_profile(config)
    save_global_config(config)
    return config


def remove_global_config_keys(keys: list[str]) -> dict[str, Any]:
    config = load_global_config()
    for key in keys:
        config.pop(key, None)
    snapshot_account_profile(config)
    save_global_config(config)
    return config


def root_state_path(root: Path) -> Path:
    return root / STATE_DIR_NAME / STATE_FILE_NAME


def root_lock_path(root: Path) -> Path:
    return root / STATE_DIR_NAME / LOCK_FILE_NAME


def watch_log_path() -> Path:
    return app_config_dir() / "logs" / "watch.log"


def load_state(root: Path) -> dict[str, Any]:
    state = read_json(root_state_path(root), {})
    state.setdefault("local", {})
    state.setdefault("localFolders", [])
    state.setdefault("remote", {})
    state.setdefault("syncActivity", [])
    state.setdefault("lastSync", None)
    return state


def save_state(root: Path, state: dict[str, Any]) -> None:
    state["lastSync"] = int(time.time())
    write_json(root_state_path(root), state)


def stats_to_dict(stats: SyncStats) -> dict[str, Any]:
    payload: dict[str, Any] = {
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
    runtime: dict[str, Any] = {
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
    write_json(root_state_path(root), state)


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


def lock_info(path: Path) -> dict[str, Any]:
    try:
        value = read_json(path, {})
    except DesktopError:
        return {}
    return value if isinstance(value, dict) else {}


def is_stale_lock(path: Path, info: dict[str, Any], stale_seconds: int) -> bool:
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
def sync_lock(root: Path, stale_seconds: int = 86400):
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


def make_api(args: argparse.Namespace) -> FileInNOutApi:
    config = load_global_config()
    server = args.server or config.get("server")
    token = args.token or config.get("token")
    refresh_token = config.get("refreshToken") if not args.token else ""
    if not server:
        raise DesktopError("server is missing. Run login first or pass --server.")
    if not token and not refresh_token:
        raise DesktopError("token is missing. Run login first or pass --token.")

    def save_tokens(tokens: AuthTokens) -> None:
        update_global_config({
            "token": tokens.access_token,
            "refreshToken": tokens.refresh_token,
        })

    api = FileInNOutApi(server, token, refresh_token, save_tokens)
    if not token and refresh_token:
        api.reissue()
    return api


def resolve_sync_root(args: argparse.Namespace) -> Path:
    raw_dir = getattr(args, "dir", None) or load_global_config().get("syncDir")
    if not raw_dir:
        raise DesktopError("sync directory is missing. Run init first or pass --dir.")
    return Path(raw_dir).expanduser().resolve()


def normalize_rel(path: Path | str) -> str:
    text = str(path).replace("\\", "/").strip("/")
    parts = [part for part in text.split("/") if part and part not in (".", "..")]
    return "/".join(parts)


def safe_segment(name: str) -> str:
    cleaned = "".join("_" if char in '<>:"\\|?*' else char for char in name).strip()
    return cleaned.rstrip(". ") or "unnamed"


def comparable_path(path: Path | str) -> str:
    try:
        return str(Path(path).expanduser().resolve(strict=False)).casefold()
    except (OSError, RuntimeError):
        return str(Path(path).expanduser().absolute()).casefold()


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


def ensure_configured_drive_mapping(config: dict[str, Any]) -> bool:
    drive_root_raw = str(config.get("driveRoot") or "").strip()
    drive_letter = normalize_drive_letter(config.get("driveLetter"))
    if not drive_mapping_supported() or not drive_root_raw or not drive_letter:
        return False

    drive_root = Path(drive_root_raw).expanduser().resolve(strict=False)
    if not ensure_drive_root_hubs(drive_root):
        return False

    changed = False
    target_key = comparable_path(drive_root)
    for candidate in drive_letter_candidates(drive_letter):
        existing_target = get_subst_target(candidate)
        if existing_target:
            if comparable_path(existing_target) == target_key:
                if candidate != drive_letter:
                    config["driveLetter"] = candidate
                    changed = True
                return changed
            continue
        if drive_letter_path_exists(candidate):
            continue

        try:
            result = subprocess.run(
                ["subst", f"{candidate}:", str(drive_root)],
                check=False,
                capture_output=True,
                text=True,
                timeout=5,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        if result.returncode == 0:
            if candidate != drive_letter:
                config["driveLetter"] = candidate
                changed = True
            return changed
    return changed


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


def file_id(item: dict[str, Any]) -> int | None:
    raw = item.get("idx") if item.get("idx") is not None else item.get("id")
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def parent_id(item: dict[str, Any]) -> int | None:
    raw = item.get("parentId")
    try:
        return int(raw) if raw is not None else None
    except (TypeError, ValueError):
        return None


def node_type(item: dict[str, Any]) -> str:
    return str(item.get("nodeType") or "").upper() or "FILE"


def item_name(item: dict[str, Any]) -> str:
    return safe_segment(str(item.get("fileOriginName") or item.get("name") or "unnamed"))


def item_updated(item: dict[str, Any]) -> str:
    return str(item.get("lastModifyDate") or item.get("uploadDate") or "")


def build_item_paths(items: list[dict[str, Any]], prefix: str = "") -> dict[str, dict[str, Any]]:
    by_id = {file_id(item): item for item in items if file_id(item) is not None}
    cache: dict[int, str] = {}

    def path_for(item: dict[str, Any], visiting: set[int] | None = None) -> str:
        current_id = file_id(item)
        if current_id is None:
            return item_name(item)
        if current_id in cache:
            return cache[current_id]
        visiting = visiting or set()
        if current_id in visiting:
            return item_name(item)
        visiting.add(current_id)

        parent = by_id.get(parent_id(item))
        if parent:
            rel = normalize_rel(Path(path_for(parent, visiting)) / item_name(item))
        else:
            rel = item_name(item)
        cache[current_id] = rel
        return rel

    paths: dict[str, dict[str, Any]] = {}
    used: dict[str, int] = {}
    for item in items:
        rel = normalize_rel(Path(prefix) / path_for(item)) if prefix else path_for(item)
        count = used.get(rel, 0)
        used[rel] = count + 1
        if count:
            stem, suffix = os.path.splitext(rel)
            rel = f"{stem} ({file_id(item) or count}){suffix}"
        paths[rel] = item
    return paths


def build_remote_tree(api: FileInNOutApi, include_shared: bool) -> dict[str, dict[str, Any]]:
    owned_paths = build_item_paths([item for item in api.list_owned() if not item.get("trashed")])
    for item in owned_paths.values():
        item["_sharedWithMe"] = False

    if not include_shared:
        return owned_paths

    shared_items = [item for item in api.list_shared() if not item.get("trashed")]
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in shared_items:
        owner = safe_segment(str(item.get("ownerEmail") or item.get("ownerName") or "shared"))
        grouped.setdefault(owner, []).append(item)

    for owner, items in grouped.items():
        for rel, item in build_item_paths(items, prefix=f"Shared/{owner}").items():
            item["_sharedWithMe"] = True
            owned_paths[rel] = item
    return owned_paths


def local_signature(path: Path) -> dict[str, Any]:
    info = path.stat()
    return {
        "size": info.st_size,
        "mtime": int(info.st_mtime),
        "mtimeMs": int(info.st_mtime_ns / 1_000_000),
    }


def local_signature_matches(previous: dict[str, Any] | None, current: dict[str, Any]) -> bool:
    if not previous:
        return False
    if current.get("size") != previous.get("size"):
        return False
    if previous.get("mtimeMs") is not None:
        return current.get("mtimeMs") == previous.get("mtimeMs")
    return current.get("mtime") == previous.get("mtime")


def is_local_dirty(root: Path, rel: str, state: dict[str, Any]) -> bool:
    path = root / Path(rel)
    if not path.is_file():
        return False
    previous = state.get("local", {}).get(rel)
    if not previous:
        return False
    return not local_signature_matches(previous, local_signature(path))


def local_pending_change_count(root: Path, state: dict[str, Any]) -> int:
    if not root.exists():
        return 0
    current = scan_local_signatures(root)
    previous = state.get("local", {}) if isinstance(state.get("local"), dict) else {}
    changed_or_new = [
        rel
        for rel in current
        if rel not in previous or is_local_dirty(root, rel, state)
    ]
    deleted = [rel for rel in previous if rel not in current]
    return len(changed_or_new) + len(deleted)


def remote_state_snapshot(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": file_id(item),
        "nodeType": node_type(item),
        "size": int(item.get("fileSize") or 0),
        "updatedAt": item_updated(item),
        "sharedWithMe": bool(item.get("_sharedWithMe") or item.get("sharedWithMe")),
        "permission": item.get("permission") or ("WRITE" if item.get("writable") else "READ"),
        "readable": is_readable_shared_item(item),
        "downloadable": is_downloadable_shared_item(item),
        "uploadable": is_uploadable_shared_item(item),
        "writable": bool(item.get("writable")),
    }


def remote_changed_since_state(state: dict[str, Any], rel: str, remote_item: dict[str, Any] | None) -> bool:
    if not remote_item or node_type(remote_item) == "FOLDER":
        return False
    previous = state.get("remote", {}).get(rel)
    if not previous:
        return False
    current = remote_state_snapshot(remote_item)
    for key in ("id", "size", "updatedAt"):
        if previous.get(key) != current.get(key):
            return True
    return False


def conflict_copy_path(path: Path) -> Path:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    stem = path.stem
    suffix = path.suffix
    for index in range(1000):
        marker = f"conflict {stamp}" if index == 0 else f"conflict {stamp}-{index}"
        candidate = path.with_name(f"{stem} ({marker}){suffix}")
        if not candidate.exists():
            return candidate
    raise DesktopError(f"could not allocate conflict copy name for {path}")


def preserve_local_conflict(
    api: FileInNOutApi,
    local_path: Path,
    remote_item: dict[str, Any],
    shared: bool,
    stats: SyncStats,
) -> None:
    item_id = file_id(remote_item)
    if item_id is None:
        stats.skipped_dirty += 1
        return

    try:
        payload = api.download(item_id, shared=shared)
    except DesktopError:
        stats.download_failed += 1
        return

    conflict_path = conflict_copy_path(local_path)
    conflict_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(local_path, conflict_path)
    make_file_writable(conflict_path)

    tmp = local_path.with_suffix(local_path.suffix + ".download")
    tmp.write_bytes(payload)
    make_file_writable(local_path)
    tmp.replace(local_path)
    stats.pulled += 1
    stats.skipped_dirty += 1
    stats.conflicts.append({
        "localPath": str(local_path),
        "conflictPath": str(conflict_path),
        "remoteId": item_id,
        "remoteName": item_name(remote_item),
        "scope": "shared" if shared else "owned",
        "resolvedAt": int(time.time()),
    })


def is_descendant_rel(rel: str, parent_rel: str) -> bool:
    rel = normalize_rel(rel)
    parent_rel = normalize_rel(parent_rel)
    return rel == parent_rel or rel.startswith(parent_rel + "/")


def remove_synced_file_if_clean(root: Path, rel: str, state: dict[str, Any], stats: SyncStats) -> bool:
    path = root / Path(rel)
    if not path.is_file():
        return False

    previous = state.get("local", {}).get(rel)
    if previous and not local_signature_matches(previous, local_signature(path)):
        stats.skipped_dirty += 1
        return False

    make_file_writable(path)
    path.unlink()
    stats.deleted += 1
    return True


def remove_synced_tree_if_clean(root: Path, rel: str, state: dict[str, Any], stats: SyncStats) -> bool:
    tree_root = root / Path(rel)
    if not tree_root.exists():
        return False

    removed_any = False
    known_files = [
        file_rel for file_rel in state.get("local", {})
        if is_descendant_rel(file_rel, rel)
    ]
    for file_rel in sorted(known_files, key=lambda value: len(Path(value).parts), reverse=True):
        removed_any = remove_synced_file_if_clean(root, file_rel, state, stats) or removed_any

    known_folders = [
        folder_rel for folder_rel in state.get("localFolders", [])
        if is_descendant_rel(folder_rel, rel)
    ]
    for folder_rel in sorted(known_folders, key=lambda value: len(Path(value).parts), reverse=True):
        folder = root / Path(folder_rel)
        try:
            folder.rmdir()
            stats.deleted += 1
            removed_any = True
        except (FileNotFoundError, OSError):
            pass

    if tree_root.is_dir():
        try:
            make_file_writable(tree_root)
            tree_root.rmdir()
            stats.deleted += 1
            removed_any = True
        except OSError:
            pass

    return removed_any


def replace_rel_prefix(rel: str, old_rel: str, new_rel: str) -> str:
    rel = normalize_rel(rel)
    old_rel = normalize_rel(old_rel)
    new_rel = normalize_rel(new_rel)
    if rel == old_rel:
        return new_rel
    if old_rel and rel.startswith(old_rel + "/"):
        suffix = rel[len(old_rel):].lstrip("/")
        return normalize_rel(Path(new_rel) / suffix)
    return rel


def remap_state_path_prefix(state: dict[str, Any], old_rel: str, new_rel: str) -> None:
    for key in ("local", "remote"):
        values = state.get(key)
        if not isinstance(values, dict):
            continue
        remapped: dict[str, Any] = {}
        for rel, value in list(values.items()):
            if not is_descendant_rel(rel, old_rel):
                continue
            mapped_rel = replace_rel_prefix(rel, old_rel, new_rel)
            remapped[mapped_rel] = value
            values.pop(rel, None)
        values.update(remapped)

    folders = state.get("localFolders")
    if isinstance(folders, list):
        mapped_folders = [
            replace_rel_prefix(rel, old_rel, new_rel) if is_descendant_rel(rel, old_rel) else rel
            for rel in folders
        ]
        state["localFolders"] = sorted(set(mapped_folders))


def local_tree_clean(root: Path, rel: str, state: dict[str, Any]) -> bool:
    for file_rel in state.get("local", {}):
        if not is_descendant_rel(file_rel, rel):
            continue
        path = root / Path(file_rel)
        if not path.is_file():
            continue
        previous = state.get("local", {}).get(file_rel) or {}
        if not local_signature_matches(previous, local_signature(path)):
            return False
    return True


def apply_remote_path_moves(
    root: Path,
    state: dict[str, Any],
    remote: dict[str, dict[str, Any]],
    stats: SyncStats,
) -> None:
    previous_remote = state.get("remote", {})
    if not previous_remote:
        return

    remote_snapshots = {rel: remote_state_snapshot(item) for rel, item in remote.items()}
    current_by_id: dict[Any, list[tuple[str, dict[str, Any]]]] = {}
    for rel, current in remote_snapshots.items():
        current_id = current.get("id")
        if current_id is None:
            continue
        current_by_id.setdefault(current_id, []).append((rel, current))

    moved_roots: set[str] = set()
    missing_rels = sorted(
        (rel for rel in previous_remote if rel not in remote),
        key=lambda value: len(Path(value).parts),
    )
    for old_rel in missing_rels:
        if has_ancestor_rel(old_rel, moved_roots):
            continue
        previous = previous_remote.get(old_rel) or {}
        previous_id = previous.get("id")
        if previous_id is None:
            continue
        candidates = [
            (new_rel, current)
            for new_rel, current in current_by_id.get(previous_id, [])
            if new_rel not in previous_remote
            and current.get("nodeType") == previous.get("nodeType")
        ]
        if len(candidates) != 1:
            continue

        new_rel, current = candidates[0]
        source = root / Path(old_rel)
        target = root / Path(new_rel)
        if target.exists():
            continue

        node = str(previous.get("nodeType") or current.get("nodeType") or "").upper()
        if node == "FOLDER":
            if not source.is_dir() or not local_tree_clean(root, old_rel, state):
                continue
        else:
            if not source.is_file() or is_local_dirty(root, old_rel, state):
                continue

        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            make_tree_writable(source)
            shutil.move(str(source), str(target))
        except OSError:
            continue

        remap_state_path_prefix(state, old_rel, new_rel)
        moved_roots.add(old_rel)
        stats.pulled += 1


def sync_remote_deletions(root: Path, state: dict[str, Any], remote: dict[str, dict[str, Any]], stats: SyncStats) -> None:
    previous_remote = state.get("remote", {})
    removed_roots: set[str] = set()
    missing_rels = sorted(
        (rel for rel in previous_remote if rel not in remote),
        key=lambda value: len(Path(value).parts),
    )

    for rel in missing_rels:
        if has_ancestor_rel(rel, removed_roots):
            continue

        previous = previous_remote.get(rel) or {}
        if previous.get("nodeType") == "FOLDER":
            if remove_synced_tree_if_clean(root, rel, state, stats):
                removed_roots.add(rel)
            continue

        if remove_synced_file_if_clean(root, rel, state, stats):
            removed_roots.add(rel)


def pull(api: FileInNOutApi, root: Path, include_shared: bool = True) -> SyncStats:
    return pull_scoped(api, root, "", include_shared=include_shared)


def scan_local_signatures(root: Path) -> dict[str, dict[str, Any]]:
    signatures: dict[str, dict[str, Any]] = {}
    for path in iter_local_paths(root, files_only=True, include_shared=True):
        rel = normalize_rel(path.relative_to(root))
        signatures[rel] = local_signature(path)
    return signatures


def scan_local_folder_entries(root: Path, include_shared: bool = True) -> list[str]:
    return sorted(
        normalize_rel(path.relative_to(root))
        for path in iter_local_paths(root, files_only=False, include_shared=include_shared)
    )


def scan_owned_local_signatures(root: Path) -> dict[str, dict[str, Any]]:
    signatures: dict[str, dict[str, Any]] = {}
    for path in iter_local_paths(root, files_only=True, include_shared=False):
        rel = normalize_rel(path.relative_to(root))
        signatures[rel] = local_signature(path)
    return signatures


def iter_local_paths(root: Path, files_only: bool, include_shared: bool = False) -> list[Path]:
    paths: list[Path] = []
    for current_root, dir_names, file_names in os.walk(root):
        current = Path(current_root)
        dir_names[:] = [
            name for name in dir_names
            if name not in SKIPPED_ROOTS
            and (include_shared or name != SHARED_ROOT_NAME)
            and not name.startswith(".~")
        ]
        if not files_only:
            for dirname in dir_names:
                paths.append(current / dirname)
        if files_only:
            for file_name in file_names:
                if should_skip_file_name(file_name):
                    continue
                paths.append(current / file_name)
    return paths


def should_skip_file_name(file_name: str) -> bool:
    name = file_name.strip()
    if not name or name in SKIPPED_FILES:
        return True
    lowered = name.lower()
    if any(name.startswith(prefix) for prefix in SKIPPED_FILE_PREFIXES):
        return True
    return any(lowered.endswith(suffix) for suffix in SKIPPED_FILE_SUFFIXES)


def ensure_remote_folder(
    api: FileInNOutApi,
    remote_paths: dict[str, dict[str, Any]],
    rel: str,
    stats: SyncStats,
) -> int | None:
    rel = normalize_rel(rel)
    if not rel:
        return None
    existing = remote_paths.get(rel)
    if existing and node_type(existing) == "FOLDER":
        return file_id(existing)

    parent_rel = normalize_rel(Path(rel).parent)
    if parent_rel == ".":
        parent_rel = ""
    parent = ensure_remote_folder(api, remote_paths, parent_rel, stats) if parent_rel else None
    folder_name = Path(rel).name
    created = api.create_folder(folder_name, parent)
    remote_paths[rel] = created
    stats.folders_created += 1
    return file_id(created)


def upload_file(
    api: FileInNOutApi,
    local_path: Path,
    rel: str,
    parent_id_value: int | None,
    replace_file_id: int | None = None,
) -> None:
    content_type = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"
    suffix = local_path.suffix[1:].lower()
    size = local_path.stat().st_size
    mtime_ms = int(local_path.stat().st_mtime * 1000)
    upload_relative_path = local_path.name if parent_id_value is not None else rel

    init_body = {
            "fileOriginName": local_path.name,
            "fileFormat": suffix,
            "fileSize": size,
            "contentType": content_type,
            "parentId": parent_id_value,
            "relativePath": upload_relative_path,
            "lastModified": mtime_ms,
    }
    if replace_file_id is not None:
        init_body["replaceFileId"] = replace_file_id

    metas = api.init_upload([init_body])
    if not metas:
        raise DesktopError(f"upload init returned no metadata for {rel}")

    first = metas[0]
    chunk_keys = [meta.get("objectKey") for meta in metas if meta.get("objectKey")]
    final_object_key = first.get("finalObjectKey") or first.get("objectKey")
    partitioned = first.get("partitioned") is True

    try:
        with local_path.open("rb") as stream:
            if len(metas) == 1:
                api.put_presigned(first["presignedUploadUrl"], stream.read(), content_type)
            else:
                for meta in metas:
                    api.put_presigned(meta["presignedUploadUrl"], stream.read(CHUNK_SIZE_BYTES), content_type)

        complete_body = {
                "fileOriginName": local_path.name,
                "fileFormat": suffix,
                "fileSize": size,
                "finalObjectKey": final_object_key,
                "chunkObjectKeys": chunk_keys if partitioned else [],
                "parentId": parent_id_value,
                "relativePath": upload_relative_path,
                "lastModified": mtime_ms,
        }
        if replace_file_id is not None:
            complete_body["replaceFileId"] = replace_file_id
        api.complete_upload(complete_body)
    except Exception:
        api.abort_upload(
            {
                "finalObjectKey": final_object_key,
                "chunkObjectKeys": chunk_keys if partitioned else [],
            }
        )
        raise


def remote_id_matches_previous(state: dict[str, Any], rel: str, remote_item: dict[str, Any] | None) -> bool:
    if not remote_item:
        return False
    previous_remote = state.get("remote", {}).get(rel)
    return previous_remote is not None and previous_remote.get("id") == file_id(remote_item)


def has_ancestor_rel(rel: str, ancestors: set[str]) -> bool:
    parent = normalize_rel(Path(rel).parent)
    while parent and parent != ".":
        if parent in ancestors:
            return True
        next_parent = normalize_rel(Path(parent).parent)
        if next_parent == parent:
            break
        parent = next_parent
    return False


def sync_deleted_owned(
    api: FileInNOutApi,
    state: dict[str, Any],
    remote_paths: dict[str, dict[str, Any]],
    current_files: dict[str, dict[str, Any]],
    current_folders: set[str],
    stats: SyncStats,
) -> set[str]:
    deleted_folders: set[str] = set()
    previous_folders = [rel for rel in state.get("localFolders", []) if rel and not is_shared_rel(rel)]

    for rel in sorted(previous_folders, key=lambda value: len(Path(value).parts)):
        if rel in current_folders or has_ancestor_rel(rel, deleted_folders):
            continue
        remote_item = remote_paths.get(rel)
        if node_type(remote_item or {}) != "FOLDER" or not remote_id_matches_previous(state, rel, remote_item):
            continue
        item_id = file_id(remote_item)
        if item_id is None:
            continue
        api.trash_file(item_id)
        remote_paths.pop(rel, None)
        deleted_folders.add(rel)
        stats.deleted += 1

    for rel in list(state.get("local", {}).keys()):
        if is_shared_rel(rel) or rel in current_files or has_ancestor_rel(rel, deleted_folders):
            continue
        remote_item = remote_paths.get(rel)
        if node_type(remote_item or {}) == "FOLDER" or not remote_id_matches_previous(state, rel, remote_item):
            continue
        item_id = file_id(remote_item)
        if item_id is None:
            continue
        api.trash_file(item_id)
        remote_paths.pop(rel, None)
        stats.deleted += 1

    return deleted_folders


def push(api: FileInNOutApi, root: Path) -> SyncStats:
    return push_scoped(api, root, "")


def is_shared_rel(rel: str) -> bool:
    return normalize_rel(rel).split("/", 1)[0] == SHARED_ROOT_NAME


def is_virtual_shared_owner_rel(rel: str) -> bool:
    parts = normalize_rel(rel).split("/")
    return len(parts) <= 2 and parts[0] == SHARED_ROOT_NAME


def is_accepted_shared_item(item: dict[str, Any] | None) -> bool:
    if not item:
        return False
    status = str(item.get("status") or item.get("shareStatus") or "").upper()
    return status in {"", "ACCEPTED"}


def is_writable_shared_item(item: dict[str, Any] | None) -> bool:
    if not is_accepted_shared_item(item):
        return False
    permission = str(item.get("permission") or "").upper()
    return bool(item.get("writable")) or bool(item.get("canWrite")) or permission == "WRITE"


def is_uploadable_shared_item(item: dict[str, Any] | None) -> bool:
    if not is_accepted_shared_item(item):
        return False
    permission = str(item.get("permission") or "").upper()
    return bool(item.get("uploadable")) or bool(item.get("canUpload")) or permission in {"UPLOAD", "WRITE"}


def is_downloadable_shared_item(item: dict[str, Any] | None) -> bool:
    if not is_accepted_shared_item(item):
        return False
    permission = str(item.get("permission") or "").upper()
    return bool(item.get("downloadable")) or bool(item.get("canDownload")) or permission in {"DOWNLOAD", "WRITE"}


def is_readable_shared_item(item: dict[str, Any] | None) -> bool:
    if not is_accepted_shared_item(item):
        return False
    permission = str(item.get("permission") or "").upper()
    return bool(item.get("readable")) or bool(item.get("canRead")) or permission in {"READ", "DOWNLOAD", "UPLOAD", "WRITE"}


def should_apply_local_readonly(remote_rel: str, item: dict[str, Any] | None) -> bool:
    if not item or node_type(item) == "FOLDER":
        return False
    if not is_shared_rel(remote_rel):
        return False
    if not (item.get("_sharedWithMe") or item.get("sharedWithMe")):
        return False
    return not is_uploadable_shared_item(item)


def apply_shared_readonly_attributes(
    local_root: Path,
    remote_path: str,
    remote: dict[str, dict[str, Any]],
) -> None:
    for local_rel, item in remote.items():
        if node_type(item) == "FOLDER":
            continue
        path = local_root / Path(local_rel)
        if not path.exists() or not path.is_file():
            continue
        remote_rel = join_scope_rel(remote_path, local_rel)
        if should_apply_local_readonly(remote_rel, item):
            make_file_readonly(path)
        elif is_shared_rel(remote_rel) and (item.get("_sharedWithMe") or item.get("sharedWithMe")):
            make_file_writable(path)


def is_non_uploadable_shared_file(remote_rel: str, item: dict[str, Any] | None) -> bool:
    if not item or node_type(item) == "FOLDER":
        return False
    if not is_shared_rel(remote_rel):
        return False
    if not (item.get("_sharedWithMe") or item.get("sharedWithMe")):
        return False
    return not is_uploadable_shared_item(item)


def remove_unauthorized_local_shared_file(local_path: Path, stats: SyncStats) -> bool:
    if not local_path.exists():
        return False
    if not local_path.is_file():
        stats.skipped_dirty += 1
        return False
    try:
        make_file_writable(local_path)
        local_path.unlink()
        stats.deleted += 1
        return True
    except OSError:
        stats.skipped_dirty += 1
        return False


def has_writable_shared_anchor(remote_paths: dict[str, dict[str, Any]], rel: str) -> bool:
    current = normalize_rel(rel)
    while current and not is_virtual_shared_owner_rel(current):
        item = remote_paths.get(current)
        if item and node_type(item) == "FOLDER":
            return is_writable_shared_item(item)
        parent = normalize_rel(Path(current).parent)
        if parent == "." or parent == current:
            break
        current = parent
    return False


def has_uploadable_shared_anchor(remote_paths: dict[str, dict[str, Any]], rel: str) -> bool:
    current = normalize_rel(rel)
    while current and not is_virtual_shared_owner_rel(current):
        item = remote_paths.get(current)
        if item and node_type(item) == "FOLDER":
            return is_uploadable_shared_item(item)
        parent = normalize_rel(Path(current).parent)
        if parent == "." or parent == current:
            break
        current = parent
    return False


def iter_shared_paths(root: Path, files_only: bool) -> list[Path]:
    shared_root = root / SHARED_ROOT_NAME
    if not shared_root.exists():
        return []

    paths: list[Path] = []
    for current_root, dir_names, file_names in os.walk(shared_root):
        current = Path(current_root)
        dir_names[:] = [
            name for name in dir_names
            if name not in SKIPPED_ROOTS and not name.startswith(".~")
        ]
        if not files_only:
            for dirname in dir_names:
                paths.append(current / dirname)
        if files_only:
            for file_name in file_names:
                if should_skip_file_name(file_name):
                    continue
                paths.append(current / file_name)
    return paths


def ensure_shared_folder(
    api: FileInNOutApi,
    remote_paths: dict[str, dict[str, Any]],
    rel: str,
    stats: SyncStats,
) -> int:
    rel = normalize_rel(rel)
    item = remote_paths.get(rel)
    if item and node_type(item) == "FOLDER":
        item_id = file_id(item)
        if item_id is None:
            raise DesktopError(f"shared folder has no id: {rel}")
        return item_id

    parent_rel = normalize_rel(Path(rel).parent)
    if parent_rel == "." or parent_rel == SHARED_ROOT_NAME:
        raise DesktopError(f"cannot create shared folder without an existing writable parent: {rel}")

    parent_id_value = ensure_shared_folder(api, remote_paths, parent_rel, stats)
    parent_item = remote_paths.get(parent_rel)
    if not is_uploadable_shared_item(parent_item):
        raise DesktopError(f"shared folder is read-only: {parent_rel}")

    created = api.create_shared_folder(parent_id_value, Path(rel).name)
    created["_sharedWithMe"] = True
    created["permission"] = parent_item.get("permission") or "WRITE"
    created["uploadable"] = is_uploadable_shared_item(parent_item)
    created["writable"] = is_writable_shared_item(parent_item)
    remote_paths[rel] = created
    stats.folders_created += 1
    created_id = file_id(created)
    if created_id is None:
        raise DesktopError(f"created shared folder has no id: {rel}")
    return created_id


def sync_deleted_shared(
    api: FileInNOutApi,
    state: dict[str, Any],
    remote_paths: dict[str, dict[str, Any]],
    current_files: dict[str, dict[str, Any]],
    current_folders: set[str],
    stats: SyncStats,
) -> set[str]:
    deleted_folders: set[str] = set()
    previous_folders = [
        rel for rel in state.get("localFolders", [])
        if rel and is_shared_rel(rel) and not is_virtual_shared_owner_rel(rel)
    ]

    for rel in sorted(previous_folders, key=lambda value: len(Path(value).parts)):
        if rel in current_folders or has_ancestor_rel(rel, deleted_folders):
            continue
        remote_item = remote_paths.get(rel)
        if node_type(remote_item or {}) != "FOLDER" or not remote_id_matches_previous(state, rel, remote_item):
            continue
        if not is_writable_shared_item(remote_item):
            stats.skipped_dirty += 1
            continue
        item_id = file_id(remote_item)
        if item_id is None:
            continue
        api.trash_shared_file(item_id)
        remote_paths.pop(rel, None)
        deleted_folders.add(rel)
        stats.deleted += 1

    for rel in list(state.get("local", {}).keys()):
        if (
            not is_shared_rel(rel)
            or rel in current_files
            or has_ancestor_rel(rel, deleted_folders)
            or is_virtual_shared_owner_rel(rel)
        ):
            continue
        remote_item = remote_paths.get(rel)
        if node_type(remote_item or {}) == "FOLDER" or not remote_id_matches_previous(state, rel, remote_item):
            continue
        if not is_writable_shared_item(remote_item):
            stats.skipped_dirty += 1
            continue
        item_id = file_id(remote_item)
        if item_id is None:
            continue
        api.trash_shared_file(item_id)
        remote_paths.pop(rel, None)
        stats.deleted += 1

    return deleted_folders


def push_shared(api: FileInNOutApi, root: Path, state: dict[str, Any], stats: SyncStats) -> None:
    remote_paths = build_remote_tree(api, include_shared=True)
    current_shared_files = {
        normalize_rel(path.relative_to(root)): local_signature(path)
        for path in iter_shared_paths(root, files_only=True)
    }
    current_shared_folders = {
        normalize_rel(path.relative_to(root))
        for path in iter_shared_paths(root, files_only=False)
    }

    sync_deleted_shared(api, state, remote_paths, current_shared_files, current_shared_folders, stats)

    for folder in sorted(iter_shared_paths(root, files_only=False), key=lambda p: len(p.parts)):
        rel = normalize_rel(folder.relative_to(root))
        if is_virtual_shared_owner_rel(rel):
            continue
        if remote_paths.get(rel):
            continue
        parent_rel = normalize_rel(Path(rel).parent)
        if not has_uploadable_shared_anchor(remote_paths, parent_rel):
            stats.skipped_dirty += 1
            continue
        ensure_shared_folder(api, remote_paths, rel, stats)

    for path in sorted(iter_shared_paths(root, files_only=True)):
        rel = normalize_rel(path.relative_to(root))
        previous_local = state.get("local", {}).get(rel)
        current_sig = local_signature(path)
        remote_item = remote_paths.get(rel)
        local_changed = not local_signature_matches(previous_local, current_sig)

        if not local_changed and remote_item:
            continue

        if local_changed and remote_changed_since_state(state, rel, remote_item):
            if remote_item and not is_downloadable_shared_item(remote_item):
                stats.skipped_dirty += 1
                continue
            preserve_local_conflict(api, path, remote_item, shared=True, stats=stats)
            continue

        parent_rel = normalize_rel(Path(rel).parent)
        if is_virtual_shared_owner_rel(parent_rel):
            stats.skipped_dirty += 1
            continue

        parent_item = remote_paths.get(parent_rel)
        if not parent_item:
            if not has_uploadable_shared_anchor(remote_paths, parent_rel):
                stats.skipped_dirty += 1
                continue
            ensure_shared_folder(api, remote_paths, parent_rel, stats)
            parent_item = remote_paths.get(parent_rel)

        if not is_uploadable_shared_item(parent_item):
            stats.skipped_dirty += 1
            continue

        parent_id_value = file_id(parent_item)
        if parent_id_value is None:
            raise DesktopError(f"shared folder has no id: {parent_rel}")

        uploaded = api.upload_shared_file(parent_id_value, path, path.name)
        uploaded["_sharedWithMe"] = True
        uploaded["permission"] = parent_item.get("permission") or "WRITE"
        uploaded["uploadable"] = is_uploadable_shared_item(parent_item)
        uploaded["writable"] = is_writable_shared_item(parent_item)
        remote_paths[rel] = uploaded
        stats.pushed += 1


def print_stats(label: str, stats: SyncStats) -> None:
    print(
        f"{label}: pulled={stats.pulled} pushed={stats.pushed} deleted={stats.deleted} "
        f"folders_created={stats.folders_created} skipped_dirty={stats.skipped_dirty} "
        f"download_failed={stats.download_failed}"
    )


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


def build_scoped_remote_tree(
    api: FileInNOutApi,
    remote_path: str,
    include_shared: bool = True,
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    full_remote = build_remote_tree(api, include_shared=include_shared)
    scoped: dict[str, dict[str, Any]] = {}
    for remote_rel, item in full_remote.items():
        local_rel = strip_scope_rel(remote_rel, remote_path)
        if local_rel is None or local_rel == "":
            continue
        scoped[local_rel] = item
    return full_remote, scoped


def prepare_scoped_state(state: dict[str, Any], remote_path: str) -> dict[str, Any]:
    remote_path = normalize_rel(remote_path)
    if state.get("scopeRemotePath") == remote_path:
        return state
    if remote_path == "" and "scopeRemotePath" not in state:
        state["scopeRemotePath"] = ""
        state.setdefault("local", {})
        state.setdefault("localFolders", [])
        state.setdefault("remote", {})
        return state
    state["scopeRemotePath"] = remote_path
    state["local"] = {}
    state["localFolders"] = []
    state["remote"] = {}
    return state


def pull_scoped(api: FileInNOutApi, local_root: Path, remote_path: str, include_shared: bool = True) -> SyncStats:
    local_root.mkdir(parents=True, exist_ok=True)
    state = prepare_scoped_state(load_state(local_root), remote_path)
    stats = SyncStats()
    _, remote = build_scoped_remote_tree(api, remote_path, include_shared=include_shared)
    failed_downloads: set[str] = set()

    apply_remote_path_moves(local_root, state, remote, stats)
    sync_remote_deletions(local_root, state, remote, stats)

    for local_rel, item in sorted(remote.items()):
        target = local_root / Path(local_rel)
        remote_rel = join_scope_rel(remote_path, local_rel)
        shared = bool(item.get("_sharedWithMe") or item.get("sharedWithMe"))
        non_uploadable_shared = is_non_uploadable_shared_file(remote_rel, item)
        if node_type(item) == "FOLDER":
            target.mkdir(parents=True, exist_ok=True)
            continue

        local_dirty = is_local_dirty(local_root, local_rel, state)
        if local_dirty:
            if non_uploadable_shared:
                if not is_downloadable_shared_item(item):
                    remove_unauthorized_local_shared_file(target, stats)
                    continue
            else:
                stats.skipped_dirty += 1
                continue

        if shared and not is_downloadable_shared_item(item):
            remove_unauthorized_local_shared_file(target, stats)
            continue

        if local_dirty and not non_uploadable_shared:
            stats.skipped_dirty += 1
            continue

        item_size = int(item.get("fileSize") or 0)
        previous = state.get("remote", {}).get(local_rel, {})
        unchanged = (
            target.exists()
            and target.is_file()
            and target.stat().st_size == item_size
            and previous.get("id") == file_id(item)
            and previous.get("updatedAt") == item_updated(item)
        )
        if unchanged and not (non_uploadable_shared and local_dirty):
            continue

        item_id = file_id(item)
        if item_id is None:
            stats.skipped_dirty += 1
            continue

        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            payload = api.download(item_id, shared=shared)
        except DesktopError:
            failed_downloads.add(local_rel)
            stats.download_failed += 1
            continue
        tmp = target.with_suffix(target.suffix + ".download")
        tmp.write_bytes(payload)
        make_file_writable(target)
        tmp.replace(target)
        stats.pulled += 1

    apply_shared_readonly_attributes(local_root, remote_path, remote)
    state["remote"] = {
        rel: remote_state_snapshot(item)
        for rel, item in remote.items()
        if rel not in failed_downloads
        and ((local_root / Path(rel)).exists() or node_type(item) == "FOLDER")
    }
    state["local"] = scan_local_signatures(local_root)
    state["localFolders"] = scan_local_folder_entries(local_root)
    save_state(local_root, state)
    return stats


def ensure_scope_folder(
    api: FileInNOutApi,
    remote_paths: dict[str, dict[str, Any]],
    remote_path: str,
    local_rel: str,
    stats: SyncStats,
) -> int | None:
    full_rel = join_scope_rel(remote_path, local_rel)
    if not full_rel:
        return None
    if is_shared_rel(full_rel):
        return ensure_shared_folder(api, remote_paths, full_rel, stats)
    return ensure_remote_folder(api, remote_paths, full_rel, stats)


def trash_scoped_item(api: FileInNOutApi, remote_rel: str, remote_item: dict[str, Any] | None) -> bool:
    item_id = file_id(remote_item or {})
    if item_id is None:
        return False
    if is_shared_rel(remote_rel) or bool((remote_item or {}).get("_sharedWithMe")):
        if not is_writable_shared_item(remote_item):
            return False
        api.trash_shared_file(item_id)
    else:
        api.trash_file(item_id)
    return True


def sync_deleted_scoped(
    api: FileInNOutApi,
    state: dict[str, Any],
    remote_path: str,
    remote_paths: dict[str, dict[str, Any]],
    current_files: dict[str, dict[str, Any]],
    current_folders: set[str],
    stats: SyncStats,
    protected_files: set[str] | None = None,
    protected_folders: set[str] | None = None,
) -> set[str]:
    deleted_folders: set[str] = set()
    protected_files = protected_files or set()
    protected_folders = protected_folders or set()

    for local_rel in sorted(state.get("localFolders", []), key=lambda value: len(Path(value).parts)):
        if (
            not local_rel
            or local_rel in current_folders
            or local_rel in protected_folders
            or has_ancestor_rel(local_rel, protected_folders)
            or has_ancestor_rel(local_rel, deleted_folders)
        ):
            continue
        remote_rel = join_scope_rel(remote_path, local_rel)
        remote_item = remote_paths.get(remote_rel)
        if node_type(remote_item or {}) != "FOLDER" or not remote_id_matches_previous(state, local_rel, remote_item):
            continue
        if trash_scoped_item(api, remote_rel, remote_item):
            remote_paths.pop(remote_rel, None)
            deleted_folders.add(local_rel)
            stats.deleted += 1
        else:
            stats.skipped_dirty += 1

    for local_rel in list(state.get("local", {}).keys()):
        if (
            local_rel in current_files
            or local_rel in protected_files
            or has_ancestor_rel(local_rel, protected_folders)
            or has_ancestor_rel(local_rel, deleted_folders)
        ):
            continue
        remote_rel = join_scope_rel(remote_path, local_rel)
        remote_item = remote_paths.get(remote_rel)
        if node_type(remote_item or {}) == "FOLDER" or not remote_id_matches_previous(state, local_rel, remote_item):
            continue
        if trash_scoped_item(api, remote_rel, remote_item):
            remote_paths.pop(remote_rel, None)
            stats.deleted += 1
        else:
            stats.skipped_dirty += 1

    return deleted_folders


def parent_rel_of(rel: str) -> str:
    parent = normalize_rel(Path(rel).parent)
    return "" if parent == "." else parent


def can_treat_as_local_file_move(old_rel: str, new_rel: str) -> bool:
    old_path = Path(old_rel)
    new_path = Path(new_rel)
    return (
        parent_rel_of(old_rel) == parent_rel_of(new_rel)
        or old_path.name.casefold() == new_path.name.casefold()
    )


def can_treat_as_local_folder_move(old_rel: str, new_rel: str) -> bool:
    old_path = Path(old_rel)
    new_path = Path(new_rel)
    return (
        parent_rel_of(old_rel) == parent_rel_of(new_rel)
        or old_path.name.casefold() == new_path.name.casefold()
    )


def rel_suffix_under(rel: str, parent_rel: str) -> str:
    rel = normalize_rel(rel)
    parent_rel = normalize_rel(parent_rel)
    if rel == parent_rel:
        return ""
    if parent_rel and rel.startswith(parent_rel + "/"):
        return rel[len(parent_rel):].lstrip("/")
    return rel


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
        target_parent_id = ensure_scope_folder(api, remote_paths, remote_path, parent_local_rel, stats) if parent_local_rel else None
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
        target_parent_id = ensure_scope_folder(api, remote_paths, remote_path, parent_local_rel, stats) if parent_local_rel else None
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


def push_scoped(api: FileInNOutApi, local_root: Path, remote_path: str) -> SyncStats:
    local_root.mkdir(parents=True, exist_ok=True)
    state = prepare_scoped_state(load_state(local_root), remote_path)
    remote_paths = build_remote_tree(api, include_shared=True)
    stats = SyncStats()
    current_files = scan_local_signatures(local_root)
    current_folders = set(scan_local_folder_entries(local_root))

    if remote_path and not is_shared_rel(remote_path):
        ensure_remote_folder(api, remote_paths, remote_path, stats)

    protected_old_folders = apply_scoped_folder_moves(api, state, remote_path, remote_paths, current_files, current_folders, stats)
    protected_old_files, handled_new_files = apply_scoped_file_moves(api, state, remote_path, remote_paths, current_files, stats)

    sync_deleted_scoped(
        api,
        state,
        remote_path,
        remote_paths,
        current_files,
        current_folders,
        stats,
        protected_old_files,
        protected_old_folders,
    )

    for folder in sorted(iter_local_paths(local_root, files_only=False, include_shared=True), key=lambda p: len(p.parts)):
        local_rel = normalize_rel(folder.relative_to(local_root))
        full_rel = join_scope_rel(remote_path, local_rel)
        parent_full_rel = join_scope_rel(remote_path, normalize_rel(Path(local_rel).parent))
        if is_shared_rel(full_rel) and full_rel not in remote_paths and not has_uploadable_shared_anchor(remote_paths, parent_full_rel):
            stats.skipped_dirty += 1
            continue
        ensure_scope_folder(api, remote_paths, remote_path, local_rel, stats)

    for path in sorted(iter_local_paths(local_root, files_only=True, include_shared=True)):
        local_rel = normalize_rel(path.relative_to(local_root))
        if local_rel in handled_new_files:
            continue
        previous_local = state.get("local", {}).get(local_rel)
        current_sig = local_signature(path)
        remote_rel = join_scope_rel(remote_path, local_rel)
        remote_item = remote_paths.get(remote_rel)
        local_changed = not local_signature_matches(previous_local, current_sig)

        if not local_changed and remote_item:
            continue

        if local_changed and remote_changed_since_state(state, local_rel, remote_item):
            if is_shared_rel(remote_rel) and not is_downloadable_shared_item(remote_item):
                stats.skipped_dirty += 1
                continue
            preserve_local_conflict(api, path, remote_item, shared=is_shared_rel(remote_rel), stats=stats)
            continue

        parent_local_rel = normalize_rel(Path(local_rel).parent)
        if parent_local_rel == ".":
            parent_local_rel = ""
        parent_remote_rel = join_scope_rel(remote_path, parent_local_rel)
        if is_shared_rel(remote_rel) and not has_uploadable_shared_anchor(remote_paths, parent_remote_rel):
            stats.skipped_dirty += 1
            continue
        parent_id_value = ensure_scope_folder(api, remote_paths, remote_path, parent_local_rel, stats)

        replace_file_id = None
        if remote_item and node_type(remote_item) != "FOLDER":
            if is_shared_rel(remote_rel):
                if not trash_scoped_item(api, remote_rel, remote_item):
                    stats.skipped_dirty += 1
                    continue
            else:
                replace_file_id = file_id(remote_item)

        if is_shared_rel(remote_rel):
            parent_item = remote_paths.get(parent_remote_rel)
            if not is_uploadable_shared_item(parent_item):
                stats.skipped_dirty += 1
                continue
            if parent_id_value is None:
                stats.skipped_dirty += 1
                continue
            uploaded = api.upload_shared_file(parent_id_value, path, path.name)
            uploaded["_sharedWithMe"] = True
            uploaded["permission"] = parent_item.get("permission") or "WRITE"
            uploaded["uploadable"] = is_uploadable_shared_item(parent_item)
            uploaded["writable"] = is_writable_shared_item(parent_item)
            remote_paths[remote_rel] = uploaded
        else:
            upload_file(api, path, remote_rel, parent_id_value, replace_file_id=replace_file_id)

        stats.pushed += 1

    refreshed_remote, scoped_remote = build_scoped_remote_tree(api, remote_path, include_shared=True)
    if remote_path and remote_path in refreshed_remote and "" not in scoped_remote:
        pass
    apply_shared_readonly_attributes(local_root, remote_path, scoped_remote)
    state["remote"] = {rel: remote_state_snapshot(item) for rel, item in scoped_remote.items()}
    state["local"] = scan_local_signatures(local_root)
    state["localFolders"] = scan_local_folder_entries(local_root)
    save_state(local_root, state)
    return stats


def sync_profile(api: FileInNOutApi, profile: dict[str, Any], lock_stale_seconds: int) -> tuple[SyncStats, SyncStats]:
    local_root = Path(profile["localPath"]).expanduser().resolve()
    remote_path = normalize_rel(profile.get("remotePath") or safe_segment(local_root.name))
    direction = normalize_sync_direction(profile.get("direction"))
    push_stats = SyncStats()
    pull_stats = SyncStats()

    with sync_lock(local_root, stale_seconds=lock_stale_seconds):
        try:
            if direction in {"two-way", "upload"}:
                push_stats = push_scoped(api, local_root, remote_path)
            if direction in {"two-way", "download"}:
                pull_stats = pull_scoped(api, local_root, remote_path, include_shared=True)
            update_sync_status(local_root, "success", pull_stats=pull_stats, push_stats=push_stats)
        except DesktopError as error:
            update_sync_status(local_root, "error", error=str(error))
            raise

    return push_stats, pull_stats


def prepare_local_drive_config(config: dict[str, Any], ensure_mapping: bool = True) -> bool:
    changed = False
    if ensure_mapping and ensure_configured_drive_mapping(config):
        changed = True
    if adopt_drive_root_folders(config):
        changed = True
    if sync_drive_hub_links(config):
        changed = True
    if changed:
        save_global_config(config)
    return changed


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


def remove_stale_drive_hub_links(root_path: Path, desired_keys: set[str], recursive: bool) -> bool:
    if not root_path.is_dir():
        return False

    changed = False
    try:
        children = sorted(root_path.iterdir(), key=lambda item: item.name.casefold())
    except OSError:
        return False

    for child in children:
        try:
            child_is_link = is_reparse_point(child)
            if child_is_link:
                if comparable_path(child) in desired_keys:
                    continue
                if remove_directory_reparse_point(child):
                    changed = True
                continue
            if recursive and child.is_dir():
                if remove_stale_drive_hub_links(child, desired_keys, recursive):
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


def remove_empty_hub_conflict_directory(path: Path) -> bool:
    if not path.is_dir() or is_reparse_point(path) or owner_folder_has_user_content(path):
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


def prune_empty_shared_owner_folders(shared_drive_hub: Path, desired_links: list[Path]) -> bool:
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
            if is_reparse_point(owner_path) or owner_folder_has_user_content(owner_path):
                continue
            if remove_empty_hub_conflict_directory(owner_path):
                changed = True
        except OSError:
            continue
    return changed


def sync_drive_hub_links(config: dict[str, Any]) -> bool:
    drive_root = configured_drive_root(config)
    if drive_root is None or not drive_hub_junction_supported():
        return False
    if not ensure_drive_root_hubs(drive_root):
        return False

    my_drive_hub = drive_root / MY_DRIVE_HUB_NAME
    shared_drive_hub = drive_root / SHARED_DRIVE_HUB_NAME
    desired = drive_hub_link_targets(config)
    desired_keys = set(desired)
    changed = False

    if remove_stale_drive_hub_links(drive_root, desired_keys, recursive=False):
        changed = True
    if remove_stale_drive_hub_links(my_drive_hub, desired_keys, recursive=False):
        changed = True
    if remove_stale_drive_hub_links(shared_drive_hub, desired_keys, recursive=True):
        changed = True

    for link_path, target_folder in desired.values():
        try:
            link_path.parent.mkdir(parents=True, exist_ok=True)
            if link_path.exists() or is_reparse_point(link_path):
                if is_reparse_point(link_path):
                    if junction_target_matches(link_path, target_folder):
                        continue
                    if not remove_directory_reparse_point(link_path):
                        continue
                else:
                    if not remove_empty_hub_conflict_directory(link_path):
                        continue
                    changed = True
            if create_directory_junction(link_path, target_folder):
                changed = True
        except OSError:
            continue

    if prune_empty_shared_owner_folders(shared_drive_hub, [link_path for link_path, _ in desired.values()]):
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


def frontend_url_from_config(config: dict[str, Any]) -> str:
    raw = str(config.get("frontendUrl") or "").strip().rstrip("/")
    if raw:
        return raw

    server = str(config.get("server") or "").strip().rstrip("/")
    if server.endswith("/api"):
        return server[:-4]
    return server or "http://192.168.35.151"


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


def desktop_web_url_for_cloud_path(config: dict[str, Any], cloud_rel: Path | str) -> str:
    base_url = frontend_url_from_config(config).rstrip("/")
    rel = normalize_rel(cloud_rel)
    route_path = "/main/shareFile" if is_shared_rel(rel) else "/main/home"
    query = {"desktopPath": rel} if rel else {}
    suffix = "?" + urllib.parse.urlencode(query) if query else ""
    return f"{base_url}{route_path}{suffix}"


def build_share_address(config: dict[str, Any], cloud_rel: Path | str) -> str:
    rel = normalize_rel(cloud_rel)
    if not rel:
        raise DesktopError("share path is empty")
    if not is_shared_rel(rel):
        owner = safe_segment(str(config.get("email") or config.get("ownerEmail") or "").strip())
        if not owner:
            raise DesktopError("login email is missing; log in again before creating a share address")
        rel = normalize_rel(Path(SHARED_ROOT_NAME) / owner / Path(rel))

    parts = rel.split("/")
    if len(parts) < 3 or parts[0] != SHARED_ROOT_NAME:
        raise DesktopError(f"share address must point to a shared folder path: {rel}")

    encoded = "/".join(urllib.parse.quote(part, safe="") for part in parts[1:])
    return f"{SHARE_URL_SCHEME}://shared/{encoded}"


def parse_share_address(address: Any) -> str:
    raw = str(address or "").strip().strip('"')
    if not raw:
        raise DesktopError("share address is empty")

    if raw.startswith("\\\\"):
        raw = raw.lstrip("\\").replace("\\", "/")
    normalized_plain = normalize_rel(raw)
    if normalized_plain.startswith(f"{SHARED_ROOT_NAME}/") and len(normalized_plain.split("/")) >= 3:
        return normalized_plain

    parsed = urllib.parse.urlparse(raw)
    if parsed.scheme.lower() != SHARE_URL_SCHEME:
        if len(normalized_plain.split("/")) >= 2:
            return normalize_rel(Path(SHARED_ROOT_NAME) / Path(normalized_plain))
        raise DesktopError(f"unsupported share address: {raw}")

    query = urllib.parse.parse_qs(parsed.query)
    query_path = (query.get("path") or query.get("sharedPath") or query.get("desktopPath") or [""])[0]
    if query_path:
        rel = normalize_rel(urllib.parse.unquote(query_path))
        if not rel.startswith(f"{SHARED_ROOT_NAME}/"):
            rel = normalize_rel(Path(SHARED_ROOT_NAME) / Path(rel))
        if len(rel.split("/")) >= 3:
            return rel

    host = urllib.parse.unquote(parsed.netloc or "").strip("/")
    path_parts = [
        urllib.parse.unquote(part)
        for part in parsed.path.replace("\\", "/").split("/")
        if part
    ]
    host_key = host.casefold()
    if host_key in SHARE_URL_HOSTS:
        parts = path_parts
    else:
        parts = [host, *path_parts] if host else path_parts

    if parts and parts[0].casefold() == SHARED_ROOT_NAME.casefold():
        parts = parts[1:]
    if len(parts) < 2:
        raise DesktopError(f"share address must include owner and folder path: {raw}")
    return normalize_rel(Path(SHARED_ROOT_NAME).joinpath(*parts))


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


def tsv_field(value: Any) -> str:
    return str(value or "").replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()


def sync_profiles(
    api: FileInNOutApi,
    profiles: list[dict[str, Any]],
    lock_stale_seconds: int,
) -> tuple[SyncStats, SyncStats]:
    total_push = SyncStats()
    total_pull = SyncStats()
    for profile in profiles:
        push_stats, pull_stats = sync_profile(api, profile, lock_stale_seconds)
        total_push.pulled += push_stats.pulled
        total_push.pushed += push_stats.pushed
        total_push.deleted += push_stats.deleted
        total_push.folders_created += push_stats.folders_created
        total_push.skipped_dirty += push_stats.skipped_dirty
        total_push.download_failed += push_stats.download_failed
        total_push.conflicts.extend(push_stats.conflicts)
        total_pull.pulled += pull_stats.pulled
        total_pull.pushed += pull_stats.pushed
        total_pull.deleted += pull_stats.deleted
        total_pull.folders_created += pull_stats.folders_created
        total_pull.skipped_dirty += pull_stats.skipped_dirty
        total_pull.download_failed += pull_stats.download_failed
        total_pull.conflicts.extend(pull_stats.conflicts)
        print_stats(f"{profile['name']} push", push_stats)
        print_stats(f"{profile['name']} pull", pull_stats)
    return total_push, total_pull


def cmd_login(args: argparse.Namespace) -> None:
    password = args.password or getpass.getpass("Password: ")
    api = FileInNOutApi(args.server)
    tokens = api.login_tokens(args.email, password)
    config = load_global_config()
    snapshot_account_profile(config)
    config["server"] = args.server.rstrip("/")
    config["email"] = args.email
    apply_account_profile(config, args.email, include_tokens=False)
    config["token"] = tokens.access_token
    config["refreshToken"] = tokens.refresh_token
    snapshot_account_profile(config, args.email)
    save_global_config(config)
    print(f"logged in as {args.email}; config saved to {GLOBAL_CONFIG_PATH}")


def cmd_logout(args: argparse.Namespace) -> None:
    config = load_global_config()
    refresh_token = str(config.get("refreshToken") or "")
    server = str(config.get("server") or "")
    if server and refresh_token:
        try:
            FileInNOutApi(server, refresh_token=refresh_token).request(
                "POST",
                "/auth/logout",
                headers={"Cookie": f"refresh={refresh_token}"},
                body={},
            )
        except DesktopError:
            pass
    remove_global_config_keys(["token", "refreshToken"])
    print(f"logged out; saved user and folder settings remain in {GLOBAL_CONFIG_PATH}")


def cmd_init(args: argparse.Namespace) -> None:
    root = Path(args.dir).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    state = load_state(root)
    save_state(root, state)
    update_global_config({"syncDir": str(root)})
    print(f"sync folder initialized: {root}")


def cmd_add_sync_folder(args: argparse.Namespace) -> None:
    config = load_global_config()
    profile, added = add_or_update_sync_folder_profile(
        config,
        args.target,
        remote_path=getattr(args, "remote_path", "") or "",
        direction=getattr(args, "direction", "two-way"),
        name=getattr(args, "name", "") or "",
    )
    local_root = Path(str(profile["localPath"])).expanduser().resolve(strict=False)
    local_root.mkdir(parents=True, exist_ok=True)
    save_state(local_root, load_state(local_root))
    save_global_config(config)

    action = "added" if added else "updated"
    print(
        f"{action} sync folder: {local_root} -> "
        f"{normalize_rel(profile.get('remotePath') or '')} ({normalize_sync_direction(profile.get('direction'))})"
    )

    if not getattr(args, "sync_now", False):
        return

    try:
        api = make_api(args)
        push_stats, pull_stats = sync_profile(api, profile, getattr(args, "lock_stale_seconds", 86400))
    except DesktopError as error:
        print(f"sync error: {error}", file=sys.stderr)
        return
    print_stats("push", push_stats)
    print_stats("pull", pull_stats)


def cmd_pull(args: argparse.Namespace) -> None:
    root = resolve_sync_root(args)
    with sync_lock(root, stale_seconds=args.lock_stale_seconds):
        try:
            api = make_api(args)
            stats = pull(api, root, include_shared=not args.owned_only)
            update_sync_status(root, "success", pull_stats=stats)
        except DesktopError as error:
            update_sync_status(root, "error", error=str(error))
            raise
    print_stats("pull", stats)


def cmd_push(args: argparse.Namespace) -> None:
    root = resolve_sync_root(args)
    with sync_lock(root, stale_seconds=args.lock_stale_seconds):
        try:
            api = make_api(args)
            stats = push(api, root)
            update_sync_status(root, "success", push_stats=stats)
        except DesktopError as error:
            update_sync_status(root, "error", error=str(error))
            raise
    print_stats("push", stats)


def cmd_sync(args: argparse.Namespace) -> None:
    root = resolve_sync_root(args)
    with sync_lock(root, stale_seconds=args.lock_stale_seconds):
        try:
            api = make_api(args)
            push_stats = push(api, root)
            pull_stats = pull(api, root, include_shared=not args.owned_only)
            update_sync_status(root, "success", pull_stats=pull_stats, push_stats=push_stats)
        except DesktopError as error:
            update_sync_status(root, "error", error=str(error))
            raise
    print_stats("push", push_stats)
    print_stats("pull", pull_stats)


def cmd_sync_configured(args: argparse.Namespace) -> None:
    config = load_global_config()
    prepare_local_drive_config(config)
    api = make_api(args)
    config_changed = False
    if sync_accepted_shared_profiles(api, config):
        config_changed = True
    if config_changed:
        save_global_config(config)
    profiles = [profile for profile in configured_sync_folders(config) if profile.get("enabled")]
    if not profiles:
        raise DesktopError("no sync folders are configured")

    total_push, total_pull = sync_profiles(api, profiles, args.lock_stale_seconds)
    print_stats("push", total_push)
    print_stats("pull", total_pull)


def cmd_sync_target(args: argparse.Namespace) -> None:
    config = load_global_config()
    raw_target = args.target
    prepare_local_drive_config(config, ensure_mapping=False)
    api = make_api(args)
    config_changed = False
    if sync_accepted_shared_profiles(api, config):
        config_changed = True
    if config_changed:
        save_global_config(config)

    target, profiles = target_sync_profiles(config, raw_target)
    if not profiles:
        raise DesktopError(f"target is not inside a configured FileInNOut sync folder: {target}")

    total_push, total_pull = sync_profiles(api, profiles, args.lock_stale_seconds)
    print_stats("push", total_push)
    print_stats("pull", total_pull)


def target_sync_profiles(config: dict[str, Any], raw_target: Path | str) -> tuple[Path, list[dict[str, Any]]]:
    target = logical_desktop_target_path(config, raw_target)
    profiles = configured_sync_folders_for_target(config, target)
    if not profiles:
        profiles = drive_hub_scope_profiles_for_target(config, target)
    return target, profiles


def cmd_doctor_target(args: argparse.Namespace) -> None:
    config = load_global_config()
    prepare_local_drive_config(config, ensure_mapping=False)

    target, profiles = target_sync_profiles(config, args.target)
    if not profiles:
        raise DesktopError(f"target is not inside a configured FileInNOut sync folder: {target}")

    print_check("app", APP_NAME)
    print_check("target", target)
    print_check("matched_sync_folders", len(profiles))
    for index, profile in enumerate(profiles, start=1):
        print_profile_doctor_checks(index, profile)

    if args.local_only:
        print_check("backend", "skipped")
        return

    api = make_api(args)
    _, _, health_payload = api.request("GET", "/test/version")
    print_check("backend", "ok")
    print_check("backend_version", health_payload.decode("utf-8", errors="replace").strip()[:160])


def cmd_open_web(args: argparse.Namespace) -> None:
    config = load_global_config()
    prepare_local_drive_config(config, ensure_mapping=False)
    url = desktop_web_url(config, getattr(args, "target", "") or "")
    print(url)
    if not getattr(args, "print_only", False):
        webbrowser.open(url)


def cmd_search(args: argparse.Namespace) -> None:
    query = str(getattr(args, "query", "") or "").strip()
    terms = [term.casefold() for term in query.split() if term.strip()]
    if not terms:
        return

    config = load_global_config()
    api = make_api(args)
    remote = build_remote_tree(api, include_shared=not getattr(args, "owned_only", False))
    limit = max(1, int(getattr(args, "limit", 100) or 100))
    matched = 0
    for rel, item in sorted(remote.items(), key=lambda entry: entry[0].casefold()):
        searchable = f"{rel} {item_name(item)}".casefold()
        if not all(term in searchable for term in terms):
            continue

        size = int(item.get("fileSize") or 0)
        row = (
            "cloud",
            rel,
            node_type(item),
            size,
            item_updated(item),
            desktop_web_url_for_cloud_path(config, rel),
        )
        print("\t".join(tsv_field(value) for value in row))
        matched += 1
        if matched >= limit:
            break


def cmd_watch(args: argparse.Namespace) -> None:
    root = resolve_sync_root(args)
    with sync_lock(root, stale_seconds=args.lock_stale_seconds):
        try:
            api = make_api(args)
        except DesktopError as error:
            update_sync_status(root, "error", error=str(error))
            raise
        print(f"watching {root}; interval={args.interval}s")
        while True:
            try:
                push_stats = push(api, root)
                pull_stats = pull(api, root, include_shared=not args.owned_only)
                update_sync_status(root, "success", pull_stats=pull_stats, push_stats=push_stats)
                print_stats(time.strftime("%Y-%m-%d %H:%M:%S push"), push_stats)
                print_stats(time.strftime("%Y-%m-%d %H:%M:%S pull"), pull_stats)
            except DesktopError as error:
                update_sync_status(root, "error", error=str(error))
                print(f"sync error: {error}", file=sys.stderr)
            time.sleep(args.interval)


def cmd_watch_configured(args: argparse.Namespace) -> None:
    print(f"watching configured folders; interval={args.interval}s")
    while True:
        try:
            cmd_sync_configured(args)
        except DesktopError as error:
            print(f"sync error: {error}", file=sys.stderr)
        time.sleep(args.interval)


def normalize_recipient_emails(raw_emails: Any) -> list[str]:
    values = raw_emails if isinstance(raw_emails, list) else [raw_emails]
    emails: list[str] = []
    seen: set[str] = set()
    for value in values:
        for email in str(value or "").split(","):
            email = email.strip()
            if not email:
                continue
            key = email.lower()
            if key in seen:
                continue
            seen.add(key)
            emails.append(email)
    if not emails:
        raise DesktopError("at least one --email recipient is required")
    return emails


def cmd_share(args: argparse.Namespace) -> None:
    config = load_global_config()
    api = make_api(args)
    root = resolve_sync_root(args)
    rel = normalize_rel(args.path)
    if not rel:
        raise DesktopError("--path must point to a file or folder inside the sync directory")

    emails = normalize_recipient_emails(args.email)
    remote = build_remote_tree(api, include_shared=True)
    item = remote.get(rel)
    if not item and getattr(args, "push_first", False):
        local_path = root / Path(rel)
        if not local_path.exists():
            raise DesktopError(f"local path not found: {rel}")
        try:
            with sync_lock(root, stale_seconds=getattr(args, "lock_stale_seconds", 86400)):
                push_stats = push_scoped(api, root, "") if is_shared_rel(rel) else push(api, root)
                update_sync_status(root, "success", push_stats=push_stats)
        except DesktopError as error:
            update_sync_status(root, "error", error=str(error))
            raise
        remote = build_remote_tree(api, include_shared=True)
        item = remote.get(rel)
    if not item:
        raise DesktopError(f"remote path not found: {rel}. Run push first if this is a new local folder.")

    item_id = file_id(item)
    if item_id is None:
        raise DesktopError(f"remote path has no shareable id: {rel}")
    for email in emails:
        api.share([item_id], email, args.permission)
        print(f"shared {rel} with {email} as {args.permission}")
    print(f"share address: {build_share_address(config, rel)}")


def cmd_share_target(args: argparse.Namespace) -> None:
    config = load_global_config()
    target = str(args.target or "").strip()
    if not target:
        raise DesktopError("--target is required")

    prepare_local_drive_config(config, ensure_mapping=False)
    resolved = desktop_target_cloud_path(config, target)
    if resolved is None:
        raise DesktopError(f"target is not inside a configured FileInNOut sync folder: {target}")

    profile, cloud_rel, local_rel = resolved
    if not cloud_rel:
        raise DesktopError("select a configured FileInNOut folder or file to share")

    emails = normalize_recipient_emails(args.email)
    api = make_api(args)
    local_root = Path(str(profile.get("localPath") or "")).expanduser().resolve(strict=False)
    remote_root = normalize_rel(profile.get("remotePath") or safe_segment(local_root.name))

    remote = build_remote_tree(api, include_shared=True)
    item = remote.get(cloud_rel)
    if not item and getattr(args, "push_first", False):
        local_target = local_root / Path(local_rel) if local_rel else local_root
        if not local_target.exists():
            raise DesktopError(f"local path not found: {local_target}")
        try:
            with sync_lock(local_root, stale_seconds=getattr(args, "lock_stale_seconds", 86400)):
                push_stats = push_scoped(api, local_root, remote_root)
                update_sync_status(local_root, "success", push_stats=push_stats)
        except DesktopError as error:
            update_sync_status(local_root, "error", error=str(error))
            raise
        remote = build_remote_tree(api, include_shared=True)
        item = remote.get(cloud_rel)

    if not item:
        raise DesktopError(f"remote path not found: {cloud_rel}. Run sync first if this is a new local item.")

    item_id = file_id(item)
    if item_id is None:
        raise DesktopError(f"remote path has no shareable id: {cloud_rel}")

    for email in emails:
        api.share([item_id], email, args.permission)
        print(f"shared {cloud_rel} with {email} as {args.permission}")
    print(f"share address: {build_share_address(config, cloud_rel)}")


def cmd_share_scope(args: argparse.Namespace) -> None:
    config = load_global_config()
    api = make_api(args)
    remote_path = normalize_rel(args.remote_path)
    if not remote_path:
        raise DesktopError("--remote-path must point to a cloud folder path")

    local_root = Path(args.local_path).expanduser().resolve() if args.local_path else None
    if getattr(args, "push_first", False) and local_root is not None:
        if not local_root.exists():
            raise DesktopError(f"local path not found: {local_root}")
        with sync_lock(local_root, stale_seconds=getattr(args, "lock_stale_seconds", 86400)):
            push_stats = push_scoped(api, local_root, remote_path)
            update_sync_status(local_root, "success", push_stats=push_stats)

    remote = build_remote_tree(api, include_shared=True)
    item = remote.get(remote_path)
    if not item:
        raise DesktopError(f"remote folder not found: {remote_path}. Run sync first if this is a new local folder.")
    if node_type(item) != "FOLDER":
        raise DesktopError(f"remote path is not a folder: {remote_path}")

    item_id = file_id(item)
    if item_id is None:
        raise DesktopError(f"remote folder has no shareable id: {remote_path}")

    for email in normalize_recipient_emails(args.email):
        api.share([item_id], email, args.permission)
        print(f"shared {remote_path} with {email} as {args.permission}")
    print(f"share address: {build_share_address(config, remote_path)}")


def find_shared_item_by_rel(paths: dict[str, dict[str, Any]], shared_rel: str) -> tuple[str, dict[str, Any]] | None:
    normalized = normalize_rel(shared_rel)
    item = paths.get(normalized)
    if item is not None:
        return normalized, item

    parts = normalized.split("/")
    if len(parts) < 3 or parts[0] != SHARED_ROOT_NAME:
        return None
    owner_key = parts[1].casefold()
    requested_tail = "/".join(parts[2:]).casefold()
    matches: list[tuple[str, dict[str, Any]]] = []
    for rel, candidate in paths.items():
        candidate_parts = normalize_rel(rel).split("/")
        if len(candidate_parts) < 3 or candidate_parts[0] != SHARED_ROOT_NAME:
            continue
        if candidate_parts[1].casefold() != owner_key:
            continue
        candidate_tail = "/".join(candidate_parts[2:]).casefold()
        if candidate_tail == requested_tail or candidate_tail.endswith("/" + requested_tail):
            matches.append((rel, candidate))
    return matches[0] if len(matches) == 1 else None


def connect_shared_folder_from_address(
    api: FileInNOutApi,
    config: dict[str, Any],
    address: str,
    *,
    accept_pending: bool = True,
    sync_now: bool = True,
    lock_stale_seconds: int = 86400,
) -> dict[str, Any]:
    shared_rel = parse_share_address(address)
    if not is_shared_rel(shared_rel):
        raise DesktopError(f"share address did not resolve to a shared path: {shared_rel}")

    remote = build_remote_tree(api, include_shared=True)
    resolved = find_shared_item_by_rel(remote, shared_rel)
    accepted_now = False

    if resolved is not None:
        resolved_rel, item = resolved
        if not (item.get("_sharedWithMe") or item.get("sharedWithMe")):
            raise DesktopError(f"share is not available to this account: {resolved_rel}")
        if not is_accepted_shared_item(item):
            raise DesktopError(f"share is not accepted yet: {resolved_rel}")
    else:
        pending = build_pending_share_tree(api)
        pending_resolved = find_shared_item_by_rel(pending, shared_rel)
        if pending_resolved is None:
            raise DesktopError(f"shared folder not found or not authorized for this account: {shared_rel}")
        if not accept_pending:
            raise DesktopError(f"share is waiting for acceptance: {pending_resolved[0]}")
        resolved_rel, item = pending_resolved
        item_id = file_id(item)
        if item_id is None:
            raise DesktopError(f"pending share has no id: {resolved_rel}")
        api.accept_shared_file(item_id)
        accepted_now = True
        refreshed = find_shared_item_by_rel(build_remote_tree(api, include_shared=True), resolved_rel)
        if refreshed is not None:
            resolved_rel, item = refreshed
        else:
            item = dict(item)
            item["status"] = "ACCEPTED"

    if node_type(item) != "FOLDER":
        raise DesktopError(f"share address must point to a folder: {resolved_rel}")

    changed = ensure_shared_sync_profile(config, resolved_rel, item)
    if changed:
        save_global_config(config)
    prepare_local_drive_config(config)

    profile = profile_for_remote_path(config, resolved_rel)
    if profile is None:
        raise DesktopError(f"could not configure shared folder profile: {resolved_rel}")
    local_root = Path(str(profile.get("localPath") or "")).expanduser().resolve(strict=False)
    local_root.mkdir(parents=True, exist_ok=True)

    push_stats = SyncStats()
    pull_stats = SyncStats()
    if sync_now:
        push_stats, pull_stats = sync_profile(api, profile, lock_stale_seconds)
        prepare_local_drive_config(config)

    drive_link = drive_hub_link_for_remote_path(config, resolved_rel)
    open_target = drive_link if drive_link and drive_link.exists() else local_root
    return {
        "remotePath": resolved_rel,
        "localPath": str(local_root),
        "drivePath": str(drive_link) if drive_link else "",
        "openPath": str(open_target),
        "accepted": accepted_now,
        "push": push_stats,
        "pull": pull_stats,
    }


def cmd_share_address(args: argparse.Namespace) -> None:
    config = load_global_config()
    if getattr(args, "target", ""):
        prepare_local_drive_config(config, ensure_mapping=False)
        resolved = desktop_target_cloud_path(config, args.target)
        if resolved is None:
            raise DesktopError(f"target is not inside a configured FileInNOut sync folder: {args.target}")
        _, cloud_rel, _ = resolved
        if not cloud_rel:
            raise DesktopError("select a configured FileInNOut folder or file")
        print(build_share_address(config, cloud_rel))
        return

    print(build_share_address(config, args.path))


def cmd_open_address(args: argparse.Namespace) -> None:
    address = str(getattr(args, "address", "") or getattr(args, "address_arg", "") or "").strip()
    config = load_global_config()
    api = make_api(args)
    result = connect_shared_folder_from_address(
        api,
        config,
        address,
        accept_pending=not getattr(args, "no_accept", False),
        sync_now=not getattr(args, "no_sync", False),
        lock_stale_seconds=getattr(args, "lock_stale_seconds", 86400),
    )
    print(f"shared folder: {result['remotePath']}")
    if result["accepted"]:
        print("accepted: true")
    print(f"local folder: {result['localPath']}")
    if result["drivePath"]:
        print(f"drive folder: {result['drivePath']}")
    if not getattr(args, "no_sync", False):
        print_stats("push", result["push"])
        print_stats("pull", result["pull"])
    print(f"open folder: {result['openPath']}")
    if not getattr(args, "print_only", False):
        open_path_in_file_explorer(Path(result["openPath"]))


def build_pending_share_tree(api: FileInNOutApi) -> dict[str, dict[str, Any]]:
    pending_items = [item for item in api.list_pending_shares() if not item.get("trashed")]
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in pending_items:
        owner = safe_segment(str(item.get("ownerEmail") or item.get("ownerName") or "shared"))
        grouped.setdefault(owner, []).append(item)

    paths: dict[str, dict[str, Any]] = {}
    for owner, items in grouped.items():
        paths.update(build_item_paths(items, prefix=f"Shared/{owner}"))
    return paths


def resolve_pending_share(api: FileInNOutApi, args: argparse.Namespace) -> tuple[int, str, dict[str, Any] | None]:
    pending = build_pending_share_tree(api)
    if getattr(args, "id", None) is not None:
        target_id = int(args.id)
        for rel, item in pending.items():
            if file_id(item) == target_id:
                return target_id, rel, item
        return target_id, f"id={args.id}", None

    rel = normalize_rel(getattr(args, "path", "") or "")
    if not rel:
        raise DesktopError("pass --id or --path for the pending share")

    item = pending.get(rel)
    if item is None:
        raise DesktopError(f"pending share not found: {rel}")
    item_id = file_id(item)
    if item_id is None:
        raise DesktopError(f"pending share has no id: {rel}")
    return item_id, rel, item


def resolve_pending_share_id(api: FileInNOutApi, args: argparse.Namespace) -> tuple[int, str]:
    item_id, label, _ = resolve_pending_share(api, args)
    return item_id, label


def cmd_pending_shares(args: argparse.Namespace) -> None:
    api = make_api(args)
    pending = build_pending_share_tree(api)
    if not pending:
        print("pending shares: 0")
        return

    print(f"pending shares: {len(pending)}")
    for rel, item in sorted(pending.items()):
        print(
            f"{file_id(item)}\t{rel}\t"
            f"owner={item.get('ownerEmail') or ''}\t"
            f"permission={item.get('permission') or ''}"
        )


def cmd_accept_share(args: argparse.Namespace) -> None:
    api = make_api(args)
    item_id, label, item = resolve_pending_share(api, args)
    api.accept_shared_file(item_id)
    config = load_global_config()
    if ensure_shared_sync_profile(config, label, item):
        save_global_config(config)
        print(f"configured shared sync folder {label}")
    print(f"accepted share {label}")


def cmd_reject_share(args: argparse.Namespace) -> None:
    api = make_api(args)
    item_id, label = resolve_pending_share_id(api, args)
    api.reject_shared_file(item_id)
    print(f"rejected share {label}")


def cmd_status(args: argparse.Namespace) -> None:
    root = resolve_sync_root(args)
    remote = {}
    if not args.local_only:
        api = make_api(args)
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


def print_check(name: str, value: Any) -> None:
    print(f"{name}: {value}")


def print_profile_doctor_checks(index: int, profile: dict[str, Any]) -> None:
    prefix = f"sync_folder_{index}"
    local_path = str(profile.get("localPath") or "").strip()
    root = Path(local_path).expanduser().resolve(strict=False) if local_path else None
    state = load_state(root) if root else {"local": {}, "localFolders": [], "remote": {}}
    local: dict[str, dict[str, Any]] = {}
    local_folders: list[str] = []
    dirty: list[str] = []
    pending_changes = 0
    exists = bool(root and root.exists())
    if root and exists:
        try:
            local = scan_local_signatures(root)
            local_folders = scan_local_folder_entries(root)
            dirty = [rel for rel in local if is_local_dirty(root, rel, state)]
            pending_changes = local_pending_change_count(root, state)
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
    print_check(f"{prefix}_direction", normalize_sync_direction(profile.get("direction")))
    print_check(f"{prefix}_exists", exists)
    print_check(f"{prefix}_local_files", len(local))
    print_check(f"{prefix}_local_folders", len(local_folders))
    print_check(f"{prefix}_dirty_files", len(dirty))
    print_check(f"{prefix}_pending_changes", pending_changes)
    print_check(f"{prefix}_sync_lock", describe_sync_lock(root) if root else "unconfigured")
    if sync_status:
        print_check(f"{prefix}_sync_status", sync_status.get("status", "unknown"))
        if sync_status.get("error"):
            print_check(f"{prefix}_sync_error", sync_status["error"])


def drive_root_diagnostics(drive_root: Path | None, profiles: list[dict[str, Any]]) -> dict[str, Any]:
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
    for link_path, profile in drive_hub_profile_links(link_config):
        expected_hub_link_paths.add(comparable_path(link_path))
        diagnostics["expected_hub_links"] += 1
        remote_path = normalize_rel(profile.get("remotePath") or "")
        if is_shared_rel(remote_path) and link_path.parent != shared_hub:
            expected_shared_owner_dirs.add(comparable_path(link_path.parent))
        local_path = str(profile.get("localPath") or "").strip()
        local_root = Path(local_path).expanduser().resolve(strict=False) if local_path else None
        local_root_exists = bool(local_root and local_root.exists())
        if not local_root_exists:
            diagnostics["hub_link_targets_missing"] += 1
        link_exists = link_path.exists() or is_reparse_point(link_path)
        if link_exists:
            if is_reparse_point(link_path):
                if local_root_exists and junction_target_matches(link_path, local_root):
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
            state = load_state(local_root)
            sync_status = state.get("syncStatus") or {}
            status_value = str(sync_status.get("status") or "").strip().lower()
            if status_value == "success":
                diagnostics["hub_link_sync_success"] += 1
            elif status_value == "error":
                diagnostics["hub_link_sync_error"] += 1
            else:
                diagnostics["hub_link_sync_unknown"] += 1
            if describe_sync_lock(local_root).startswith("active"):
                diagnostics["hub_link_active_locks"] += 1
            try:
                local = scan_local_signatures(local_root)
                diagnostics["hub_link_dirty_files"] += len([rel for rel in local if is_local_dirty(local_root, rel, state)])
                diagnostics["hub_link_pending_changes"] += local_pending_change_count(local_root, state)
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
    for _, child in iter_drive_root_owned_candidates(drive_root):
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
                if child.is_dir() or should_adopt_drive_root_file(child):
                    diagnostics["shared_hub_manual_items"] += 1
                else:
                    diagnostics["skipped_items"] += 1
                continue
            if child.is_dir():
                diagnostics["direct_folders"] += 1
                if comparable_path(child) not in configured_paths:
                    diagnostics["unconfigured_folders"] += 1
                continue
            if should_adopt_drive_root_file(child):
                diagnostics["direct_files"] += 1
            else:
                diagnostics["skipped_items"] += 1
        except OSError:
            diagnostics["skipped_items"] += 1
    return diagnostics


def cmd_doctor(args: argparse.Namespace) -> None:
    config = load_global_config()
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

    api = make_api(args)
    _, _, health_payload = api.request("GET", "/test/version")
    health_text = health_payload.decode("utf-8", errors="replace").strip()
    print_check("backend", "ok")
    print_check("backend_version", health_text[:160])
    owned_items = api.list_owned()
    print_check("remote_owned_items", len([item for item in owned_items if not item.get("trashed")]))
    if args.owned_only:
        print_check("remote_shared_items", "skipped")
    else:
        shared_items = api.list_shared()
        print_check("remote_shared_items", len([item for item in shared_items if not item.get("trashed")]))


def cmd_storage(args: argparse.Namespace) -> None:
    api = make_api(args)
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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="FileInNOut Desktop sync client")
    parser.add_argument("--server", help="Backend base URL, e.g. http://192.168.35.151/api")
    parser.add_argument("--token", help="Bearer access token. Defaults to saved login token.")

    subparsers = parser.add_subparsers(dest="command", required=True)

    login_parser = subparsers.add_parser("login", help="Log in and save token")
    login_parser.add_argument("--server", required=True, help="Backend base URL")
    login_parser.add_argument("--email", required=True)
    login_parser.add_argument("--password")
    login_parser.set_defaults(func=cmd_login)

    logout_parser = subparsers.add_parser("logout", help="Forget saved login token")
    logout_parser.set_defaults(func=cmd_logout)

    init_parser = subparsers.add_parser("init", help="Initialize a local sync folder")
    init_parser.add_argument("--dir", required=True)
    init_parser.set_defaults(func=cmd_init)

    add_folder_parser = subparsers.add_parser("add-sync-folder", help="Add a selected local folder to configured sync folders")
    add_folder_parser.add_argument("--target", required=True, help="Selected folder path. If a file is passed, its parent folder is added.")
    add_folder_parser.add_argument("--name", default="", help="Display name for the sync folder")
    add_folder_parser.add_argument("--remote-path", default="", help="Cloud folder path. Defaults to a unique name from the local folder.")
    add_folder_parser.add_argument("--direction", choices=["two-way", "upload", "download"], default="two-way")
    add_folder_parser.add_argument("--sync-now", action="store_true", help="Run an immediate sync after adding the folder.")
    add_folder_parser.add_argument(
        "--lock-stale-seconds",
        type=int,
        default=86400,
        help="Remove an existing sync lock after this many seconds when --sync-now is used. Default: 86400.",
    )
    add_folder_parser.set_defaults(func=cmd_add_sync_folder)

    for name, func in (
            ("pull", cmd_pull),
            ("push", cmd_push),
            ("sync", cmd_sync),
            ("watch", cmd_watch),
            ("status", cmd_status),
            ("doctor", cmd_doctor),
    ):
        command_parser = subparsers.add_parser(name)
        command_parser.add_argument("--dir", help="Sync folder. Defaults to the folder saved by init.")
        command_parser.add_argument("--owned-only", action="store_true", help="Do not pull Shared/* items")
        if name in {"pull", "push", "sync", "watch"}:
            command_parser.add_argument(
                "--lock-stale-seconds",
                type=int,
                default=86400,
                help="Remove an existing sync lock after this many seconds. Default: 86400.",
            )
        if name in {"status", "doctor"}:
            command_parser.add_argument("--local-only", action="store_true", help="Do not query the backend.")
        if name == "watch":
            command_parser.add_argument("--interval", type=int, default=30)
        command_parser.set_defaults(func=func)

    sync_configured_parser = subparsers.add_parser("sync-configured", help="Sync only folders configured in config.json")
    sync_configured_parser.add_argument(
        "--lock-stale-seconds",
        type=int,
        default=86400,
        help="Remove an existing sync lock after this many seconds. Default: 86400.",
    )
    sync_configured_parser.set_defaults(func=cmd_sync_configured)

    sync_target_parser = subparsers.add_parser("sync-target", help="Sync the configured folder that contains a selected file or folder")
    sync_target_parser.add_argument("--target", required=True, help="Selected file or folder path")
    sync_target_parser.add_argument(
        "--lock-stale-seconds",
        type=int,
        default=86400,
        help="Remove an existing sync lock after this many seconds. Default: 86400.",
    )
    sync_target_parser.set_defaults(func=cmd_sync_target)

    doctor_target_parser = subparsers.add_parser("doctor-target", help="Show diagnostics for the configured folder that contains a selected file or folder")
    doctor_target_parser.add_argument("--target", required=True, help="Selected file or folder path")
    doctor_target_parser.add_argument("--local-only", action="store_true", help="Do not query the backend.")
    doctor_target_parser.set_defaults(func=cmd_doctor_target)

    open_web_parser = subparsers.add_parser("open-web", help="Open the web app, optionally focused by a selected local file or folder")
    open_web_parser.add_argument("--target", default="", help="Selected file or folder path")
    open_web_parser.add_argument("--print-only", action="store_true", help="Print the URL without opening a browser")
    open_web_parser.set_defaults(func=cmd_open_web)

    search_parser = subparsers.add_parser("search", help="Search cloud files and folders")
    search_parser.add_argument("--query", required=True, help="Search text")
    search_parser.add_argument("--limit", type=int, default=100)
    search_parser.add_argument("--owned-only", action="store_true", help="Do not search Shared/* items")
    search_parser.set_defaults(func=cmd_search)

    watch_configured_parser = subparsers.add_parser("watch-configured", help="Poll and sync configured folders")
    watch_configured_parser.add_argument("--interval", type=int, default=20)
    watch_configured_parser.add_argument(
        "--lock-stale-seconds",
        type=int,
        default=86400,
        help="Remove an existing sync lock after this many seconds. Default: 86400.",
    )
    watch_configured_parser.set_defaults(func=cmd_watch_configured)

    storage_parser = subparsers.add_parser("storage", help="Show current drive capacity and usage")
    storage_parser.set_defaults(func=cmd_storage)

    share_parser = subparsers.add_parser("share", help="Share a remote file or folder by local relative path")
    share_parser.add_argument("--dir", help="Sync folder. Defaults to the folder saved by init.")
    share_parser.add_argument("--path", required=True, help="Relative path inside the sync folder")
    share_parser.add_argument(
        "--email",
        action="append",
        required=True,
        help="Recipient email. Repeat the option or use comma-separated emails for multiple recipients.",
    )
    share_parser.add_argument("--permission", choices=["READ", "DOWNLOAD", "UPLOAD", "WRITE"], default="READ")
    share_parser.add_argument(
        "--push-first",
        action="store_true",
        help="Push the local path first if it is not found on the backend yet.",
    )
    share_parser.add_argument(
        "--lock-stale-seconds",
        type=int,
        default=86400,
        help="Remove an existing sync lock after this many seconds when --push-first is used. Default: 86400.",
    )
    share_parser.set_defaults(func=cmd_share)

    share_target_parser = subparsers.add_parser("share-target", help="Share a selected Explorer file or folder")
    share_target_parser.add_argument("--target", required=True, help="Selected file or folder path")
    share_target_parser.add_argument(
        "--email",
        action="append",
        required=True,
        help="Recipient email. Repeat the option or use comma-separated emails for multiple recipients.",
    )
    share_target_parser.add_argument("--permission", choices=["READ", "DOWNLOAD", "UPLOAD", "WRITE"], default="WRITE")
    share_target_parser.add_argument(
        "--push-first",
        action="store_true",
        help="Push the selected local item first if it is not found on the backend yet.",
    )
    share_target_parser.add_argument(
        "--lock-stale-seconds",
        type=int,
        default=86400,
        help="Remove an existing sync lock after this many seconds when --push-first is used. Default: 86400.",
    )
    share_target_parser.set_defaults(func=cmd_share_target)

    share_scope_parser = subparsers.add_parser("share-scope", help="Share a configured cloud folder")
    share_scope_parser.add_argument("--local-path", help="Local folder to push before sharing")
    share_scope_parser.add_argument("--remote-path", required=True, help="Owned cloud folder path to share")
    share_scope_parser.add_argument(
        "--email",
        action="append",
        required=True,
        help="Recipient email. Repeat the option or use comma-separated emails for multiple recipients.",
    )
    share_scope_parser.add_argument("--permission", choices=["READ", "DOWNLOAD", "UPLOAD", "WRITE"], default="WRITE")
    share_scope_parser.add_argument("--push-first", action="store_true")
    share_scope_parser.add_argument(
        "--lock-stale-seconds",
        type=int,
        default=86400,
        help="Remove an existing sync lock after this many seconds when --push-first is used. Default: 86400.",
    )
    share_scope_parser.set_defaults(func=cmd_share_scope)

    share_address_parser = subparsers.add_parser("share-address", help="Print a FileInNOut shared-folder address")
    share_address_group = share_address_parser.add_mutually_exclusive_group(required=True)
    share_address_group.add_argument("--path", help="Owned cloud path to turn into a fileinnout:// shared-folder address")
    share_address_group.add_argument("--target", help="Local Explorer target inside a configured sync folder")
    share_address_parser.set_defaults(func=cmd_share_address)

    open_address_parser = subparsers.add_parser("open-address", help="Connect and open a shared folder by fileinnout:// address")
    open_address_parser.add_argument("address_arg", nargs="?", help="Shared folder address")
    open_address_parser.add_argument("--address", default="", help="Shared folder address")
    open_address_parser.add_argument("--no-accept", action="store_true", help="Do not auto-accept a pending share")
    open_address_parser.add_argument("--no-sync", action="store_true", help="Create the folder mapping without immediately syncing")
    open_address_parser.add_argument("--print-only", action="store_true", help="Print the resolved folder without opening Explorer")
    open_address_parser.add_argument(
        "--lock-stale-seconds",
        type=int,
        default=86400,
        help="Remove an existing sync lock after this many seconds. Default: 86400.",
    )
    open_address_parser.set_defaults(func=cmd_open_address)

    pending_parser = subparsers.add_parser("pending-shares", help="List pending shares waiting for acceptance")
    pending_parser.set_defaults(func=cmd_pending_shares)

    for name, func, help_text in (
            ("accept-share", cmd_accept_share, "Accept a pending shared file or folder"),
            ("reject-share", cmd_reject_share, "Reject a pending shared file or folder"),
    ):
        decision_parser = subparsers.add_parser(name, help=help_text)
        decision_group = decision_parser.add_mutually_exclusive_group(required=True)
        decision_group.add_argument("--id", type=int, help="Pending shared file or folder id")
        decision_group.add_argument("--path", help="Pending share path, e.g. Shared/owner@example.com/Team")
        decision_parser.set_defaults(func=func)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        args.func(args)
        return 0
    except DesktopError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
