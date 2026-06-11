#!/usr/bin/env python3
"""Live end-to-end verification for FileInNOut Desktop sync.

This script needs a running backend and two login-capable users. It creates two
temporary local sync folders, treats one as the owner desktop and the other as a
recipient desktop, then verifies writable shared-folder round trips.
"""

from __future__ import annotations

import argparse
import shutil
import tempfile
import time
from pathlib import Path

import fileinnout_desktop as desktop


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify live FileInNOut Desktop sync behavior.")
    parser.add_argument("--server", required=True, help="Backend base URL, e.g. http://192.168.35.151/api")
    parser.add_argument("--owner-email", required=True)
    parser.add_argument("--owner-password")
    parser.add_argument("--owner-token")
    parser.add_argument("--recipient-email", required=True)
    parser.add_argument("--recipient-password")
    parser.add_argument("--recipient-token")
    parser.add_argument("--work-dir", help="Directory for owner/recipient local sync folders.")
    parser.add_argument("--keep-work-dir", action="store_true")
    parser.add_argument("--skip-cleanup", action="store_true", help="Leave the test cloud folder in place.")
    return parser.parse_args()


def make_api(server: str, email: str, password: str | None, token: str | None) -> desktop.FileInNOutApi:
    api = desktop.FileInNOutApi(server, token)
    if token:
        return api
    if not password:
        raise desktop.DesktopError(f"password or token is required for {email}")
    tokens = api.login_tokens(email, password)
    return desktop.FileInNOutApi(server, tokens.access_token, tokens.refresh_token)


def require_remote_path(
    api: desktop.FileInNOutApi,
    rel: str,
    include_shared: bool,
) -> dict:
    remote = desktop.build_remote_tree(api, include_shared=include_shared)
    item = remote.get(rel)
    if not item:
        raise desktop.DesktopError(f"remote path not found: {rel}")
    return item


def require_file_text(path: Path, expected: str) -> None:
    if not path.is_file():
        raise desktop.DesktopError(f"expected file is missing: {path}")
    actual = path.read_text(encoding="utf-8")
    if actual != expected:
        raise desktop.DesktopError(f"unexpected content in {path}: {actual!r}")


def require_remote_file_text(api: desktop.FileInNOutApi, rel: str, expected: str) -> None:
    item = require_remote_path(api, rel, include_shared=False)
    item_id = desktop.file_id(item)
    if item_id is None:
        raise desktop.DesktopError(f"remote file has no id: {rel}")
    actual = api.download(item_id, shared=False).decode("utf-8")
    if actual != expected:
        raise desktop.DesktopError(f"unexpected remote content in {rel}: {actual!r}")


def accept_share(api: desktop.FileInNOutApi, file_id: int, label: str) -> None:
    pending_before = {
        desktop.file_id(item)
        for item in api.list_pending_shares()
        if desktop.file_id(item) is not None
    }
    if file_id not in pending_before:
        raise desktop.DesktopError(f"pending share not found before accept: {label}")
    api.accept_shared_file(file_id)
    pending_after = {
        desktop.file_id(item)
        for item in api.list_pending_shares()
        if desktop.file_id(item) is not None
    }
    if file_id in pending_after:
        raise desktop.DesktopError(f"pending share still visible after accept: {label}")


def write_file_text(path: Path, text: str) -> None:
    path.write_bytes(text.encode("utf-8"))


def run(args: argparse.Namespace) -> None:
    owner_api = make_api(args.server, args.owner_email, args.owner_password, args.owner_token)
    recipient_api = make_api(args.server, args.recipient_email, args.recipient_password, args.recipient_token)

    temp_context = None
    if args.work_dir:
        work_dir = Path(args.work_dir).expanduser().resolve()
        work_dir.mkdir(parents=True, exist_ok=True)
    else:
        temp_context = tempfile.TemporaryDirectory(prefix="fileinnout-desktop-live-")
        work_dir = Path(temp_context.name)

    owner_root = work_dir / "owner"
    recipient_root = work_dir / "recipient"
    owner_root.mkdir(parents=True, exist_ok=True)
    recipient_root.mkdir(parents=True, exist_ok=True)

    stamp = time.strftime("%Y%m%d%H%M%S")
    folder_name = f"desktop-e2e-{stamp}"
    owner_text = "owner-created\n"
    owner_after_share_text = "owner-created-after-share\n"
    recipient_text = "recipient-created\n"
    readonly_edit_text = "owner-readonly-edit-source\n"
    readonly_delete_text = "owner-readonly-delete-source\n"
    viewonly_text = "owner-viewonly-source\n"
    owner_folder = owner_root / folder_name
    owner_folder.mkdir()
    write_file_text(owner_folder / "owner.txt", owner_text)

    try:
        push_stats = desktop.push(owner_api, owner_root)
        if push_stats.pushed < 1:
            raise desktop.DesktopError("owner push did not upload the seed file")
        folder_item = require_remote_path(owner_api, folder_name, include_shared=False)
        folder_id = desktop.file_id(folder_item)
        if folder_id is None:
            raise desktop.DesktopError("created owner folder has no remote id")
        owner_api.share([folder_id], args.recipient_email, "WRITE")
        accept_share(recipient_api, folder_id, folder_name)
        print(f"PASS owner push/share/recipient accept - folder={folder_name}")

        pull_stats = desktop.pull(recipient_api, recipient_root, include_shared=True)
        shared_prefix = f"Shared/{desktop.safe_segment(args.owner_email)}/{folder_name}"
        recipient_owner_file = recipient_root / Path(shared_prefix) / "owner.txt"
        require_file_text(recipient_owner_file, owner_text)
        print(f"PASS recipient pull shared folder - pulled={pull_stats.pulled}")

        owner_after_share_file = owner_folder / "owner-after-share.txt"
        write_file_text(owner_after_share_file, owner_after_share_text)
        owner_after_share_push = desktop.push(owner_api, owner_root)
        if owner_after_share_push.pushed < 1:
            raise desktop.DesktopError("owner push did not upload the post-share file")
        recipient_after_share_pull = desktop.pull(recipient_api, recipient_root, include_shared=True)
        require_file_text(recipient_owner_file.parent / "owner-after-share.txt", owner_after_share_text)
        print(
            "PASS owner post-share upload inheritance - "
            f"pushed={owner_after_share_push.pushed} pulled={recipient_after_share_pull.pulled}"
        )

        recipient_file = recipient_owner_file.parent / "recipient.txt"
        write_file_text(recipient_file, recipient_text)
        recipient_push = desktop.push(recipient_api, recipient_root)
        if recipient_push.pushed < 1:
            raise desktop.DesktopError("recipient push did not upload into the writable shared folder")
        print(f"PASS recipient writable shared upload - pushed={recipient_push.pushed}")

        owner_pull = desktop.pull(owner_api, owner_root, include_shared=True)
        require_file_text(owner_folder / "recipient.txt", recipient_text)
        print(f"PASS owner pull recipient upload - pulled={owner_pull.pulled}")

        recipient_file.unlink()
        recipient_delete_push = desktop.push(recipient_api, recipient_root)
        if recipient_delete_push.deleted < 1:
            raise desktop.DesktopError("recipient deletion was not sent to the cloud")
        owner_delete_pull = desktop.pull(owner_api, owner_root, include_shared=True)
        if (owner_folder / "recipient.txt").exists():
            raise desktop.DesktopError("owner still has recipient.txt after shared deletion pull")
        print(
            "PASS shared deletion round trip - "
            f"recipient_deleted={recipient_delete_push.deleted} owner_deleted={owner_delete_pull.deleted}"
        )

        readonly_folder_name = f"desktop-readonly-e2e-{stamp}"
        readonly_owner_folder = owner_root / readonly_folder_name
        readonly_owner_folder.mkdir()
        write_file_text(readonly_owner_folder / "readonly-edit.txt", readonly_edit_text)
        write_file_text(readonly_owner_folder / "readonly-delete.txt", readonly_delete_text)

        readonly_owner_push = desktop.push(owner_api, owner_root)
        if readonly_owner_push.pushed < 2:
            raise desktop.DesktopError("owner push did not upload the read-only shared folder files")
        readonly_folder_item = require_remote_path(owner_api, readonly_folder_name, include_shared=False)
        readonly_folder_id = desktop.file_id(readonly_folder_item)
        if readonly_folder_id is None:
            raise desktop.DesktopError("created read-only owner folder has no remote id")
        owner_api.share([readonly_folder_id], args.recipient_email, "DOWNLOAD")
        accept_share(recipient_api, readonly_folder_id, readonly_folder_name)

        readonly_pull = desktop.pull(recipient_api, recipient_root, include_shared=True)
        readonly_shared_prefix = f"Shared/{desktop.safe_segment(args.owner_email)}/{readonly_folder_name}"
        readonly_recipient_folder = recipient_root / Path(readonly_shared_prefix)
        require_file_text(readonly_recipient_folder / "readonly-edit.txt", readonly_edit_text)
        require_file_text(readonly_recipient_folder / "readonly-delete.txt", readonly_delete_text)

        write_file_text(readonly_recipient_folder / "readonly-edit.txt", "recipient-readonly-edit-blocked\n")
        write_file_text(readonly_recipient_folder / "local-only.txt", "recipient-readonly-new-blocked\n")
        (readonly_recipient_folder / "readonly-delete.txt").unlink()
        readonly_blocked_push = desktop.push(recipient_api, recipient_root)
        if readonly_blocked_push.pushed != 0 or readonly_blocked_push.deleted != 0 or readonly_blocked_push.skipped_dirty < 3:
            raise desktop.DesktopError(
                "read-only shared folder allowed a local write/delete or did not report dirty skips"
            )
        require_remote_file_text(owner_api, f"{readonly_folder_name}/readonly-edit.txt", readonly_edit_text)
        require_remote_file_text(owner_api, f"{readonly_folder_name}/readonly-delete.txt", readonly_delete_text)
        owner_remote_after_readonly = desktop.build_remote_tree(owner_api, include_shared=False)
        if f"{readonly_folder_name}/local-only.txt" in owner_remote_after_readonly:
            raise desktop.DesktopError("read-only shared local-only file was uploaded to owner cloud")
        print(
            "PASS recipient download-only shared folder blocked writes - "
            f"pulled={readonly_pull.pulled} skipped={readonly_blocked_push.skipped_dirty}"
        )

        shutil.rmtree(readonly_recipient_folder)
        readonly_restore_pull = desktop.pull(recipient_api, recipient_root, include_shared=True)
        require_file_text(readonly_recipient_folder / "readonly-edit.txt", readonly_edit_text)
        require_file_text(readonly_recipient_folder / "readonly-delete.txt", readonly_delete_text)
        print(f"PASS recipient download-only restore - pulled={readonly_restore_pull.pulled}")

        viewonly_folder_name = f"desktop-viewonly-e2e-{stamp}"
        viewonly_owner_folder = owner_root / viewonly_folder_name
        viewonly_owner_folder.mkdir()
        write_file_text(viewonly_owner_folder / "view-only.txt", viewonly_text)

        viewonly_owner_push = desktop.push(owner_api, owner_root)
        if viewonly_owner_push.pushed < 1:
            raise desktop.DesktopError("owner push did not upload the view-only shared folder file")
        viewonly_folder_item = require_remote_path(owner_api, viewonly_folder_name, include_shared=False)
        viewonly_folder_id = desktop.file_id(viewonly_folder_item)
        if viewonly_folder_id is None:
            raise desktop.DesktopError("created view-only owner folder has no remote id")
        owner_api.share([viewonly_folder_id], args.recipient_email, "READ")
        accept_share(recipient_api, viewonly_folder_id, viewonly_folder_name)

        viewonly_pull = desktop.pull(recipient_api, recipient_root, include_shared=True)
        viewonly_shared_prefix = f"Shared/{desktop.safe_segment(args.owner_email)}/{viewonly_folder_name}"
        viewonly_recipient_folder = recipient_root / Path(viewonly_shared_prefix)
        if not viewonly_recipient_folder.is_dir():
            raise desktop.DesktopError("view-only shared folder was not created locally")
        if (viewonly_recipient_folder / "view-only.txt").exists():
            raise desktop.DesktopError("view-only shared file was downloaded locally")

        write_file_text(viewonly_recipient_folder / "local-only.txt", "recipient-viewonly-new-blocked\n")
        viewonly_blocked_push = desktop.push(recipient_api, recipient_root)
        if viewonly_blocked_push.pushed != 0 or viewonly_blocked_push.deleted != 0 or viewonly_blocked_push.skipped_dirty < 1:
            raise desktop.DesktopError("view-only shared folder allowed a local upload")
        owner_remote_after_viewonly = desktop.build_remote_tree(owner_api, include_shared=False)
        if f"{viewonly_folder_name}/local-only.txt" in owner_remote_after_viewonly:
            raise desktop.DesktopError("view-only shared local-only file was uploaded to owner cloud")
        print(
            "PASS recipient view-only shared folder blocked download/upload - "
            f"pulled={viewonly_pull.pulled} skipped={viewonly_blocked_push.skipped_dirty}"
        )

        if not args.skip_cleanup:
            for folder in (owner_folder, readonly_owner_folder, viewonly_owner_folder):
                if folder.exists():
                    shutil.rmtree(folder)
            cleanup_push = desktop.push(owner_api, owner_root)
            desktop.pull(recipient_api, recipient_root, include_shared=True)
            if (recipient_root / Path(shared_prefix)).exists():
                raise desktop.DesktopError("recipient shared folder remained after owner cleanup")
            if (recipient_root / Path(readonly_shared_prefix)).exists():
                raise desktop.DesktopError("recipient read-only shared folder remained after owner cleanup")
            if (recipient_root / Path(viewonly_shared_prefix)).exists():
                raise desktop.DesktopError("recipient view-only shared folder remained after owner cleanup")
            print(f"PASS cleanup - deleted={cleanup_push.deleted}")

        print(f"DONE live desktop sync verification - work_dir={work_dir}")
    finally:
        if temp_context and not args.keep_work_dir:
            temp_context.cleanup()


def main() -> int:
    try:
        run(parse_args())
        return 0
    except desktop.DesktopError as error:
        print(f"FAIL {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
