from __future__ import annotations

import copy
import json
import os
import urllib.parse
from pathlib import Path
from typing import Any

from fileinnout_desktop_constants import (
    ACCOUNT_PROFILE_FIELDS,
    ACCOUNT_SYNC_FIELDS,
    APP_NAME,
    CONFIG_DIR_NAME,
)
from fileinnout_desktop_models import DesktopError
from fileinnout_desktop_security import (
    protect_config_tokens_for_storage,
    unprotect_config_tokens,
)


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
    return apply_account_profile(unprotect_config_tokens(config))


def save_global_config(config: dict[str, Any]) -> None:
    write_json(GLOBAL_CONFIG_PATH, protect_config_tokens_for_storage(config))


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