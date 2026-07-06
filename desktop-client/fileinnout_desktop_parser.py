from __future__ import annotations

import argparse
from collections.abc import Callable

CommandHandler = Callable[[argparse.Namespace], None]


def build_parser(command_handlers: dict[str, CommandHandler]) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="FileInNOut Desktop sync client")
    parser.add_argument("--server", help="Backend base URL, e.g. https://drive.example.com/api")
    parser.add_argument("--token", help="Bearer access token. Defaults to saved login token.")

    subparsers = parser.add_subparsers(dest="command", required=True)

    login_parser = subparsers.add_parser("login", help="Log in and save token")
    login_parser.add_argument("--server", required=True, help="Backend base URL")
    login_parser.add_argument("--email", required=True)
    login_parser.add_argument("--password")
    login_parser.add_argument("--password-stdin", action="store_true", help="Read the login password from standard input instead of the process arguments.")
    login_parser.set_defaults(func=command_handlers["login"])

    logout_parser = subparsers.add_parser("logout", help="Forget saved login token")
    logout_parser.set_defaults(func=command_handlers["logout"])

    init_parser = subparsers.add_parser("init", help="Initialize a local sync folder")
    init_parser.add_argument("--dir", required=True)
    init_parser.set_defaults(func=command_handlers["init"])

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
    add_folder_parser.set_defaults(func=command_handlers["add_sync_folder"])

    for name, func in (
            ("pull", command_handlers["pull"]),
            ("push", command_handlers["push"]),
            ("sync", command_handlers["sync"]),
            ("watch", command_handlers["watch"]),
            ("status", command_handlers["status"]),
            ("doctor", command_handlers["doctor"]),
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
    sync_configured_parser.set_defaults(func=command_handlers["sync_configured"])

    sync_target_parser = subparsers.add_parser("sync-target", help="Sync the configured folder that contains a selected file or folder")
    sync_target_parser.add_argument("--target", required=True, help="Selected file or folder path")
    sync_target_parser.add_argument(
        "--lock-stale-seconds",
        type=int,
        default=86400,
        help="Remove an existing sync lock after this many seconds. Default: 86400.",
    )
    sync_target_parser.set_defaults(func=command_handlers["sync_target"])

    doctor_target_parser = subparsers.add_parser("doctor-target", help="Show diagnostics for the configured folder that contains a selected file or folder")
    doctor_target_parser.add_argument("--target", required=True, help="Selected file or folder path")
    doctor_target_parser.add_argument("--local-only", action="store_true", help="Do not query the backend.")
    doctor_target_parser.set_defaults(func=command_handlers["doctor_target"])

    open_web_parser = subparsers.add_parser("open-web", help="Open the web app, optionally focused by a selected local file or folder")
    open_web_parser.add_argument("--target", default="", help="Selected file or folder path")
    open_web_parser.add_argument("--print-only", action="store_true", help="Print the URL without opening a browser")
    open_web_parser.set_defaults(func=command_handlers["open_web"])

    search_parser = subparsers.add_parser("search", help="Search cloud files and folders")
    search_parser.add_argument("--query", required=True, help="Search text")
    search_parser.add_argument("--limit", type=int, default=100)
    search_parser.add_argument("--owned-only", action="store_true", help="Do not search Shared/* items")
    search_parser.set_defaults(func=command_handlers["search"])

    watch_configured_parser = subparsers.add_parser("watch-configured", help="Poll and sync configured folders")
    watch_configured_parser.add_argument("--interval", type=int, default=20)
    watch_configured_parser.add_argument(
        "--lock-stale-seconds",
        type=int,
        default=86400,
        help="Remove an existing sync lock after this many seconds. Default: 86400.",
    )
    watch_configured_parser.set_defaults(func=command_handlers["watch_configured"])

    storage_parser = subparsers.add_parser("storage", help="Show current drive capacity and usage")
    storage_parser.set_defaults(func=command_handlers["storage"])

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
    share_parser.set_defaults(func=command_handlers["share"])

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
    share_target_parser.set_defaults(func=command_handlers["share_target"])

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
    share_scope_parser.set_defaults(func=command_handlers["share_scope"])

    share_address_parser = subparsers.add_parser("share-address", help="Print a FileInNOut shared-folder address")
    share_address_group = share_address_parser.add_mutually_exclusive_group(required=True)
    share_address_group.add_argument("--path", help="Owned cloud path to turn into a fileinnout:// shared-folder address")
    share_address_group.add_argument("--target", help="Local Explorer target inside a configured sync folder")
    share_address_parser.set_defaults(func=command_handlers["share_address"])

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
    open_address_parser.set_defaults(func=command_handlers["open_address"])

    pending_parser = subparsers.add_parser("pending-shares", help="List pending shares waiting for acceptance")
    pending_parser.set_defaults(func=command_handlers["pending_shares"])

    for name, func, help_text in (
            ("accept-share", command_handlers["accept_share"], "Accept a pending shared file or folder"),
            ("reject-share", command_handlers["reject_share"], "Reject a pending shared file or folder"),
    ):
        decision_parser = subparsers.add_parser(name, help=help_text)
        decision_group = decision_parser.add_mutually_exclusive_group(required=True)
        decision_group.add_argument("--id", type=int, help="Pending shared file or folder id")
        decision_group.add_argument("--path", help="Pending share path, e.g. Shared/owner@example.com/Team")
        decision_parser.set_defaults(func=func)

    return parser
