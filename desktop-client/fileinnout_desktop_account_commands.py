from __future__ import annotations

import argparse
import getpass
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fileinnout_desktop_config import GLOBAL_CONFIG_PATH
from fileinnout_desktop_models import DesktopError
from fileinnout_desktop_paths import normalize_rel
from fileinnout_desktop_profiles import add_or_update_sync_folder_profile, normalize_sync_direction
from fileinnout_desktop_state import load_state, save_state
from fileinnout_desktop_sync import print_stats


@dataclass(frozen=True)
class DesktopAccountCommandDeps:
    api_class: Any
    make_api: Any
    sync_profile: Any
    load_global_config: Any
    save_global_config: Any
    update_global_config: Any
    remove_global_config_keys: Any
    snapshot_account_profile: Any
    apply_account_profile: Any


def resolve_login_password(args: argparse.Namespace) -> str:
    if getattr(args, "password_stdin", False):
        password = sys.stdin.read()
        if password.endswith("\r\n"):
            password = password[:-2]
        elif password.endswith("\n") or password.endswith("\r"):
            password = password[:-1]
        if not password:
            raise DesktopError("password is missing from stdin")
        return password
    return args.password or getpass.getpass("Password: ")


def cmd_login(args: argparse.Namespace, deps: DesktopAccountCommandDeps) -> None:
    password = resolve_login_password(args)
    api = deps.api_class(args.server)
    tokens = api.login_tokens(args.email, password)
    config = deps.load_global_config()
    deps.snapshot_account_profile(config)
    config["server"] = args.server.rstrip("/")
    config["email"] = args.email
    deps.apply_account_profile(config, args.email, include_tokens=False)
    config["token"] = tokens.access_token
    config["refreshToken"] = tokens.refresh_token
    deps.snapshot_account_profile(config, args.email)
    deps.save_global_config(config)
    print(f"logged in as {args.email}; config saved to {GLOBAL_CONFIG_PATH}")


def cmd_logout(args: argparse.Namespace, deps: DesktopAccountCommandDeps) -> None:
    config = deps.load_global_config()
    refresh_token = str(config.get("refreshToken") or "")
    server = str(config.get("server") or "")
    if server and refresh_token:
        try:
            deps.api_class(server, refresh_token=refresh_token).request(
                "POST",
                "/auth/logout",
                headers={"Cookie": f"refresh={refresh_token}"},
                body={},
            )
        except DesktopError:
            pass
    deps.remove_global_config_keys(["token", "refreshToken"])
    print(f"logged out; saved user and folder settings remain in {GLOBAL_CONFIG_PATH}")


def cmd_init(args: argparse.Namespace, deps: DesktopAccountCommandDeps) -> None:
    root = Path(args.dir).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    state = load_state(root)
    save_state(root, state)
    deps.update_global_config({"syncDir": str(root)})
    print(f"sync folder initialized: {root}")


def cmd_add_sync_folder(args: argparse.Namespace, deps: DesktopAccountCommandDeps) -> None:
    config = deps.load_global_config()
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
    deps.save_global_config(config)

    action = "added" if added else "updated"
    print(
        f"{action} sync folder: {local_root} -> "
        f"{normalize_rel(profile.get('remotePath') or '')} ({normalize_sync_direction(profile.get('direction'))})"
    )

    if not getattr(args, "sync_now", False):
        return

    try:
        api = deps.make_api(args)
        push_stats, pull_stats = deps.sync_profile(api, profile, getattr(args, "lock_stale_seconds", 86400))
    except DesktopError as error:
        print(f"sync error: {error}", file=sys.stderr)
        return
    print_stats("push", push_stats)
    print_stats("pull", pull_stats)
