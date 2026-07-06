from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fileinnout_desktop_api import FileInNOutApi
from fileinnout_desktop_models import DesktopError, SyncStats
from fileinnout_desktop_drive_hub import (
    desktop_target_cloud_path,
    drive_hub_link_for_remote_path,
    open_path_in_file_explorer,
    profile_for_remote_path,
)
from fileinnout_desktop_paths import normalize_rel, safe_segment
from fileinnout_desktop_profiles import ensure_shared_sync_profile
from fileinnout_desktop_remote import (
    build_remote_tree,
    file_id,
    is_accepted_shared_item,
    node_type,
)
from fileinnout_desktop_sharing import (
    build_pending_share_tree,
    find_shared_item_by_rel,
    normalize_recipient_emails,
    resolve_pending_share,
    resolve_pending_share_id,
)
from fileinnout_desktop_state import sync_lock, update_sync_status
from fileinnout_desktop_sync import print_stats
from fileinnout_desktop_sync_shared import is_shared_rel
from fileinnout_desktop_web import build_share_address, parse_share_address


@dataclass(frozen=True)
class DesktopShareCommandDeps:
    make_api: Any
    resolve_sync_root: Any
    load_global_config: Any
    save_global_config: Any
    prepare_local_drive_config: Any
    sync_profile: Any
    push: Any
    push_scoped: Any


def cmd_share(args: argparse.Namespace, deps: DesktopShareCommandDeps) -> None:
    config = deps.load_global_config()
    api = deps.make_api(args)
    root = deps.resolve_sync_root(args)
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
                push_stats = deps.push_scoped(api, root, "") if is_shared_rel(rel) else deps.push(api, root)
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

def cmd_share_target(args: argparse.Namespace, deps: DesktopShareCommandDeps) -> None:
    config = deps.load_global_config()
    target = str(args.target or "").strip()
    if not target:
        raise DesktopError("--target is required")

    deps.prepare_local_drive_config(config, ensure_mapping=False)
    resolved = desktop_target_cloud_path(config, target)
    if resolved is None:
        raise DesktopError(f"target is not inside a configured FileInNOut sync folder: {target}")

    profile, cloud_rel, local_rel = resolved
    if not cloud_rel:
        raise DesktopError("select a configured FileInNOut folder or file to share")

    emails = normalize_recipient_emails(args.email)
    api = deps.make_api(args)
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
                push_stats = deps.push_scoped(api, local_root, remote_root)
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

def cmd_share_scope(args: argparse.Namespace, deps: DesktopShareCommandDeps) -> None:
    config = deps.load_global_config()
    api = deps.make_api(args)
    remote_path = normalize_rel(args.remote_path)
    if not remote_path:
        raise DesktopError("--remote-path must point to a cloud folder path")

    local_root = Path(args.local_path).expanduser().resolve() if args.local_path else None
    if getattr(args, "push_first", False) and local_root is not None:
        if not local_root.exists():
            raise DesktopError(f"local path not found: {local_root}")
        with sync_lock(local_root, stale_seconds=getattr(args, "lock_stale_seconds", 86400)):
            push_stats = deps.push_scoped(api, local_root, remote_path)
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

def connect_shared_folder_from_address(
    api: FileInNOutApi,
    config: dict[str, Any],
    address: str,
    *,
    deps: DesktopShareCommandDeps,
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
        deps.save_global_config(config)
    deps.prepare_local_drive_config(config)

    profile = profile_for_remote_path(config, resolved_rel)
    if profile is None:
        raise DesktopError(f"could not configure shared folder profile: {resolved_rel}")
    local_root = Path(str(profile.get("localPath") or "")).expanduser().resolve(strict=False)
    local_root.mkdir(parents=True, exist_ok=True)

    push_stats = SyncStats()
    pull_stats = SyncStats()
    if sync_now:
        push_stats, pull_stats = deps.sync_profile(api, profile, lock_stale_seconds)
        deps.prepare_local_drive_config(config)

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

def cmd_share_address(args: argparse.Namespace, deps: DesktopShareCommandDeps) -> None:
    config = deps.load_global_config()
    if getattr(args, "target", ""):
        deps.prepare_local_drive_config(config, ensure_mapping=False)
        resolved = desktop_target_cloud_path(config, args.target)
        if resolved is None:
            raise DesktopError(f"target is not inside a configured FileInNOut sync folder: {args.target}")
        _, cloud_rel, _ = resolved
        if not cloud_rel:
            raise DesktopError("select a configured FileInNOut folder or file")
        print(build_share_address(config, cloud_rel))
        return

    print(build_share_address(config, args.path))

def cmd_open_address(args: argparse.Namespace, deps: DesktopShareCommandDeps) -> None:
    address = str(getattr(args, "address", "") or getattr(args, "address_arg", "") or "").strip()
    config = deps.load_global_config()
    api = deps.make_api(args)
    result = connect_shared_folder_from_address(
        api,
        config,
        address,
        deps=deps,
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

def cmd_pending_shares(args: argparse.Namespace, deps: DesktopShareCommandDeps) -> None:
    api = deps.make_api(args)
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

def cmd_accept_share(args: argparse.Namespace, deps: DesktopShareCommandDeps) -> None:
    api = deps.make_api(args)
    item_id, label, item = resolve_pending_share(api, args)
    api.accept_shared_file(item_id)
    config = deps.load_global_config()
    if ensure_shared_sync_profile(config, label, item):
        deps.save_global_config(config)
        print(f"configured shared sync folder {label}")
    print(f"accepted share {label}")

def cmd_reject_share(args: argparse.Namespace, deps: DesktopShareCommandDeps) -> None:
    api = deps.make_api(args)
    item_id, label = resolve_pending_share_id(api, args)
    api.reject_shared_file(item_id)
    print(f"rejected share {label}")
