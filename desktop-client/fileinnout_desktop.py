#!/usr/bin/env python3
"""FileInNOut Desktop sync client.

This client intentionally uses only the Python standard library so it can run
on a clean Windows VM after Python is installed. It mirrors a FileInNOut cloud
drive into a normal local directory and can poll for changes like a lightweight
Google Drive Desktop style sync folder.
"""

from __future__ import annotations

import argparse
import http.client
import mimetypes
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from typing import Any

from fileinnout_desktop_constants import (
    APP_NAME,
    CHUNK_SIZE_BYTES,
    DRIVE_ROOT_HUB_FOLDER_NAMES,
    DRIVE_ROOT_SKIPPED_FOLDER_NAMES,
    MY_DRIVE_HUB_NAME,
    PARTITION_SIZE_BYTES,
    ROOT_FILE_SYNC_FOLDER_NAME,
    SHARED_DRIVE_HUB_NAME,
    SKIPPED_FILE_PREFIXES,
    SKIPPED_FILE_SUFFIXES,
    SKIPPED_FILES,
    SKIPPED_ROOTS,
)
from fileinnout_desktop_models import AuthTokens, DesktopError, SyncStats
from fileinnout_desktop_state import (
    acquire_sync_lock,
    describe_sync_lock,
    load_state,
    release_sync_lock,
    root_lock_path,
    root_state_path,
    save_state,
    stats_to_dict,
    sync_lock,
    update_sync_status,
    watch_log_path,
)
import fileinnout_desktop_config as desktop_config
from fileinnout_desktop_config import (
    GLOBAL_CONFIG_PATH,
    LEGACY_GLOBAL_CONFIG_PATH,
)
from fileinnout_desktop_files import (
    make_file_readonly,
    make_file_writable,
    make_tree_writable,
)
from fileinnout_desktop_api import (
    FileInNOutApi,
    expect_list,
    expect_object,
    extract_refresh_token,
)
from fileinnout_desktop_security import (
    dpapi_available,
    dpapi_protect_text,
    dpapi_unprotect_text,
    protect_token_fields_for_storage,
    protected_token_key,
    unprotect_token_fields,
)

from fileinnout_desktop_windows import (
    create_directory_junction,
    drive_appearance_state,
    drive_hub_junction_supported,
    drive_letter_candidates,
    drive_letter_path_exists,
    drive_mapping_supported,
    get_subst_target,
    is_reparse_point,
    normalize_drive_letter,
    remove_directory_reparse_point,
)

from fileinnout_desktop_paths import (
    can_treat_as_local_file_move,
    can_treat_as_local_folder_move,
    comparable_path,
    has_ancestor_rel,
    is_descendant_rel,
    parent_rel_of,
    rel_suffix_under,
    replace_rel_prefix,
    safe_segment,
)
from fileinnout_desktop_remote import (
    build_item_paths,
    build_remote_tree,
    file_id,
    is_accepted_shared_item,
    is_downloadable_shared_item,
    is_readable_shared_item,
    is_uploadable_shared_item,
    is_writable_shared_item,
    item_name,
    item_updated,
    node_type,
    parent_id,
    remote_changed_since_state,
    remote_id_matches_previous,
    remote_state_snapshot,
)
from fileinnout_desktop_sharing import (
    build_pending_share_tree,
    find_shared_item_by_rel,
    normalize_recipient_emails,
    resolve_pending_share,
    resolve_pending_share_id,
)
from fileinnout_desktop_web import (
    build_share_address,
    default_backend_url,
    desktop_web_url_for_cloud_path,
    frontend_url_from_config,
    parse_share_address,
    tsv_field,
)
from fileinnout_desktop_drive import (
    comparable_logical_path,
    configured_drive_root,
    drive_letter_target_to_drive_root,
    logical_desktop_target_path,
    logical_relative_path,
    path_is_inside,
    path_is_inside_logical,
    safe_drive_link_name,
    shared_drive_link_name,
    shared_remote_parts,
)
from fileinnout_desktop_profiles import (
    configured_sync_folders,
    ensure_shared_sync_profile,
    join_scope_rel,
    legacy_sync_folder_profile,
    strip_scope_rel,
    sync_accepted_shared_profiles,
    unique_local_child_path,
    unique_remote_path,
)
from fileinnout_desktop_parser import build_parser as build_desktop_parser
from fileinnout_desktop_account_commands import (
    DesktopAccountCommandDeps,
    cmd_add_sync_folder as run_add_sync_folder_command,
    cmd_init as run_init_command,
    cmd_login as run_login_command,
    cmd_logout as run_logout_command,
    resolve_login_password,
)
from fileinnout_desktop_share_commands import (
    DesktopShareCommandDeps,
    cmd_accept_share as run_accept_share_command,
    cmd_open_address as run_open_address_command,
    cmd_pending_shares as run_pending_shares_command,
    cmd_reject_share as run_reject_share_command,
    cmd_share as run_share_command,
    cmd_share_address as run_share_address_command,
    cmd_share_scope as run_share_scope_command,
    cmd_share_target as run_share_target_command,
    connect_shared_folder_from_address as run_connect_shared_folder_from_address,
)
from fileinnout_desktop_status_commands import (
    DesktopStatusCommandDeps,
    cmd_doctor as run_doctor_command,
    cmd_status as run_status_command,
    cmd_storage as run_storage_command,
    drive_root_diagnostics,
    print_profile_doctor_checks,
)
from fileinnout_desktop_diagnostics import (
    drive_root_diagnostics as diagnostics_drive_root_diagnostics,
    print_check,
    print_profile_doctor_checks as diagnostics_print_profile_doctor_checks,
)

def _sync_config_module_paths() -> None:
    desktop_config.GLOBAL_CONFIG_PATH = GLOBAL_CONFIG_PATH
    desktop_config.LEGACY_GLOBAL_CONFIG_PATH = LEGACY_GLOBAL_CONFIG_PATH


def app_config_dir() -> Path:
    return desktop_config.app_config_dir()


def read_json(path: Path, default: Any) -> Any:
    return desktop_config.read_json(path, default)


def write_json(path: Path, data: Any) -> None:
    desktop_config.write_json(path, data)


def account_key(email: Any) -> str:
    return desktop_config.account_key(email)


def account_default_sync_dir(email: Any) -> str:
    _sync_config_module_paths()
    return desktop_config.account_default_sync_dir(email)


def account_profiles(config: dict[str, Any]) -> dict[str, Any]:
    return desktop_config.account_profiles(config)


def snapshot_account_profile(config: dict[str, Any], email: Any | None = None) -> None:
    _sync_config_module_paths()
    desktop_config.snapshot_account_profile(config, email)


def apply_account_profile(config: dict[str, Any], email: Any | None = None, include_tokens: bool = True) -> dict[str, Any]:
    _sync_config_module_paths()
    return desktop_config.apply_account_profile(config, email, include_tokens)


def load_global_config() -> dict[str, Any]:
    _sync_config_module_paths()
    return desktop_config.load_global_config()


def save_global_config(config: dict[str, Any]) -> None:
    _sync_config_module_paths()
    desktop_config.save_global_config(config)


def update_global_config(changes: dict[str, Any]) -> dict[str, Any]:
    _sync_config_module_paths()
    return desktop_config.update_global_config(changes)


def remove_global_config_keys(keys: list[str]) -> dict[str, Any]:
    _sync_config_module_paths()
    return desktop_config.remove_global_config_keys(keys)

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

from fileinnout_desktop_sync import (
    adopt_drive_root_folders,
    apply_remote_path_moves,
    apply_scoped_file_moves,
    apply_scoped_folder_moves,
    apply_shared_readonly_attributes,
    build_scoped_remote_tree,
    conflict_copy_path,
    drive_root_owned_candidate_roots,
    ensure_drive_root_file_profile,
    ensure_drive_root_hubs,
    ensure_remote_folder,
    ensure_scope_folder,
    ensure_shared_folder,
    folder_tree_matches,
    folder_tree_shape_matches,
    has_uploadable_shared_anchor,
    has_writable_shared_anchor,
    is_local_dirty,
    is_non_uploadable_shared_file,
    is_shared_rel,
    is_virtual_shared_owner_rel,
    iter_drive_root_owned_candidates,
    iter_local_paths,
    iter_shared_paths,
    local_pending_change_count,
    local_signature,
    local_signature_matches,
    local_tree_clean,
    normalize_drive_root_owned_child,
    prepare_scoped_state,
    preserve_local_conflict,
    print_stats,
    pull,
    pull_scoped,
    push,
    push_scoped,
    push_shared,
    remote_folder_tree_matches_state,
    remap_remote_paths_prefix,
    remap_state_path_prefix,
    remove_synced_file_if_clean,
    remove_synced_tree_if_clean,
    remove_unauthorized_local_shared_file,
    scan_local_folder_entries,
    scan_local_signatures,
    scan_owned_local_signatures,
    should_adopt_drive_root_file,
    should_apply_local_readonly,
    should_skip_file_name,
    sync_deleted_owned,
    sync_deleted_scoped,
    sync_deleted_shared,
    sync_profile,
    sync_remote_deletions,
    trash_scoped_item,
    upload_file,
)
from fileinnout_desktop_drive_hub import (
    configured_sync_folders_for_target,
    desktop_target_cloud_path,
    desktop_web_url,
    drive_hub_link_for_remote_path,
    drive_hub_link_targets,
    drive_hub_profile_for_target,
    drive_hub_profile_links,
    drive_hub_scope_profiles_for_target,
    junction_target_matches,
    open_path_in_file_explorer,
    profile_for_remote_path,
    shared_drive_owner_for_target,
    sync_drive_hub_links as _sync_drive_hub_links_impl,
    target_drive_hub_route,
    target_is_drive_root_path,
    target_is_shared_drive_hub_path,
)

def sync_drive_hub_links(config: dict[str, Any]) -> bool:
    return _sync_drive_hub_links_impl(
        config,
        drive_hub_junction_supported_fn=drive_hub_junction_supported,
        create_directory_junction_fn=create_directory_junction,
        is_reparse_point_fn=is_reparse_point,
        remove_directory_reparse_point_fn=remove_directory_reparse_point,
    )

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

def _account_command_deps() -> DesktopAccountCommandDeps:
    return DesktopAccountCommandDeps(
        api_class=FileInNOutApi,
        make_api=make_api,
        sync_profile=sync_profile,
        load_global_config=load_global_config,
        save_global_config=save_global_config,
        update_global_config=update_global_config,
        remove_global_config_keys=remove_global_config_keys,
        snapshot_account_profile=snapshot_account_profile,
        apply_account_profile=apply_account_profile,
    )


def cmd_login(args: argparse.Namespace) -> None: run_login_command(args, _account_command_deps())


def cmd_logout(args: argparse.Namespace) -> None: run_logout_command(args, _account_command_deps())


def cmd_init(args: argparse.Namespace) -> None: run_init_command(args, _account_command_deps())


def cmd_add_sync_folder(args: argparse.Namespace) -> None: run_add_sync_folder_command(args, _account_command_deps())


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
    _, _, health_payload = api.request("GET", "/actuator/health")
    print_check("backend", "ok")
    print_check("backend_health", health_payload.decode("utf-8", errors="replace").strip()[:160])

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

def _share_command_deps() -> DesktopShareCommandDeps:
    return DesktopShareCommandDeps(
        make_api=make_api,
        resolve_sync_root=resolve_sync_root,
        load_global_config=load_global_config,
        save_global_config=save_global_config,
        prepare_local_drive_config=prepare_local_drive_config,
        sync_profile=sync_profile,
        push=push,
        push_scoped=push_scoped,
    )

def cmd_share(args: argparse.Namespace) -> None: run_share_command(args, _share_command_deps())

def cmd_share_target(args: argparse.Namespace) -> None: run_share_target_command(args, _share_command_deps())

def cmd_share_scope(args: argparse.Namespace) -> None: run_share_scope_command(args, _share_command_deps())

def connect_shared_folder_from_address(
    api: FileInNOutApi,
    config: dict[str, Any],
    address: str,
    *,
    accept_pending: bool = True,
    sync_now: bool = True,
    lock_stale_seconds: int = 86400,
) -> dict[str, Any]:
    return run_connect_shared_folder_from_address(
        api,
        config,
        address,
        deps=_share_command_deps(),
        accept_pending=accept_pending,
        sync_now=sync_now,
        lock_stale_seconds=lock_stale_seconds,
    )

def cmd_share_address(args: argparse.Namespace) -> None: run_share_address_command(args, _share_command_deps())

def cmd_open_address(args: argparse.Namespace) -> None: run_open_address_command(args, _share_command_deps())

def cmd_pending_shares(args: argparse.Namespace) -> None: run_pending_shares_command(args, _share_command_deps())

def cmd_accept_share(args: argparse.Namespace) -> None: run_accept_share_command(args, _share_command_deps())

def cmd_reject_share(args: argparse.Namespace) -> None: run_reject_share_command(args, _share_command_deps())

def _status_command_deps() -> DesktopStatusCommandDeps:
    return DesktopStatusCommandDeps(
        make_api=make_api,
        resolve_sync_root=resolve_sync_root,
        load_global_config=load_global_config,
    )

def cmd_status(args: argparse.Namespace) -> None: run_status_command(args, _status_command_deps())

def cmd_doctor(args: argparse.Namespace) -> None: run_doctor_command(args, _status_command_deps())

def cmd_storage(args: argparse.Namespace) -> None: run_storage_command(args, _status_command_deps())

def build_parser() -> argparse.ArgumentParser:
    return build_desktop_parser(
        {
            "login": cmd_login,
            "logout": cmd_logout,
            "init": cmd_init,
            "add_sync_folder": cmd_add_sync_folder,
            "pull": cmd_pull,
            "push": cmd_push,
            "sync": cmd_sync,
            "watch": cmd_watch,
            "status": cmd_status,
            "doctor": cmd_doctor,
            "sync_configured": cmd_sync_configured,
            "sync_target": cmd_sync_target,
            "doctor_target": cmd_doctor_target,
            "open_web": cmd_open_web,
            "search": cmd_search,
            "watch_configured": cmd_watch_configured,
            "storage": cmd_storage,
            "share": cmd_share,
            "share_target": cmd_share_target,
            "share_scope": cmd_share_scope,
            "share_address": cmd_share_address,
            "open_address": cmd_open_address,
            "pending_shares": cmd_pending_shares,
            "accept_share": cmd_accept_share,
            "reject_share": cmd_reject_share,
        }
    )

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
