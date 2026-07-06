#!/usr/bin/env python3
"""Verify the A/B/C shared-folder desktop scenario against a deployed VM.

By default this verifier uses existing A/B/C accounts supplied by arguments or
environment variables. If the deployment has no spare accounts, pass
--create-temp-users to create short-lived admin-role users directly in the VM
database, exercise the scenario, then remove those users and their rows.
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
from pathlib import Path
import sys
import tempfile
import time
import urllib.error

import bcrypt
import paramiko


ROOT = Path(__file__).resolve().parents[3]
DESKTOP_CLIENT_DIR = ROOT / "desktop-client"
sys.path.insert(0, str(DESKTOP_CLIENT_DIR))

try:
    import fileinnout_desktop as desktop
except ImportError as exc:
    raise SystemExit(f"Cannot import desktop client from {DESKTOP_CLIENT_DIR}: {exc}") from exc


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify FileInNOut A/B/C desktop share scenario.")
    parser.add_argument("--base-url", default=os.environ.get("FILEINNOUT_BASE_URL", "http://192.168.35.151/api"))
    parser.add_argument("--vm152", default=os.environ.get("FILEINNOUT_VM152", "192.168.35.152"))
    parser.add_argument("--ssh-user", default=os.environ.get("FILEINNOUT_SSH_USER", "test"))
    parser.add_argument("--ssh-password", default=os.environ.get("FILEINNOUT_SSH_PASSWORD", os.environ.get("VM_PASSWORD", "")))
    parser.add_argument("--password", default=os.environ.get("FILEINNOUT_SCENARIO_PASSWORD", ""))
    parser.add_argument("--a-email", default=os.environ.get("FILEINNOUT_SCENARIO_A_EMAIL", ""))
    parser.add_argument("--b-email", default=os.environ.get("FILEINNOUT_SCENARIO_B_EMAIL", ""))
    parser.add_argument("--c-email", default=os.environ.get("FILEINNOUT_SCENARIO_C_EMAIL", ""))
    parser.add_argument("--a-password", default=os.environ.get("FILEINNOUT_SCENARIO_A_PASSWORD", ""))
    parser.add_argument("--b-password", default=os.environ.get("FILEINNOUT_SCENARIO_B_PASSWORD", ""))
    parser.add_argument("--c-password", default=os.environ.get("FILEINNOUT_SCENARIO_C_PASSWORD", ""))
    parser.add_argument("--create-temp-users", action="store_true", help="Create and later delete temporary A/B/C users.")
    parser.add_argument("--keep-users", action="store_true", help="Leave temporary A/B/C users in the database.")
    parser.add_argument("--keep-work-dir", action="store_true", help="Leave local temp sync folders on this machine.")
    parser.add_argument("--skip-cloud-cleanup", action="store_true", help="Leave test cloud folders in A's drive.")
    return parser.parse_args()


def log(name: str, detail: str = "") -> None:
    suffix = f" - {detail}" if detail else ""
    print(f"PASS {name}{suffix}", flush=True)


def sql_quote(value: str) -> str:
    return "'" + str(value).replace("\\", "\\\\").replace("'", "''") + "'"


class RemoteMysql:
    def __init__(self, host: str, username: str, password: str):
        if not password:
            raise RuntimeError("SSH password is required. Set VM_PASSWORD or --ssh-password.")
        self.host = host
        self.username = username
        self.password = password
        self.client = paramiko.SSHClient()
        self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    def __enter__(self):
        self.client.connect(
            hostname=self.host,
            username=self.username,
            password=self.password,
            look_for_keys=False,
            allow_agent=False,
            timeout=20,
        )
        return self

    def __exit__(self, exc_type, exc, tb):
        self.client.close()

    def run_sql(self, sql: str, timeout: int = 60) -> str:
        command = (
            "docker exec -i fileinnout-mariadb "
            "sh -lc 'mariadb --batch --raw --skip-column-names "
            '-uroot -p"$MARIADB_ROOT_PASSWORD" web\''
        )
        stdin, stdout, stderr = self.client.exec_command(command, timeout=timeout)
        stdin.write(sql)
        if not sql.endswith("\n"):
            stdin.write("\n")
        stdin.channel.shutdown_write()
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        status = stdout.channel.recv_exit_status()
        if status != 0:
            raise RuntimeError(f"SQL failed ({status})\nSQL:\n{sql}\nSTDOUT:\n{out}\nSTDERR:\n{err}")
        return out


def bcrypt_password(raw_password: str) -> str:
    hashed = bcrypt.hashpw(raw_password.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")
    return "{bcrypt}" + hashed


def create_temp_users(mysql: RemoteMysql, users: list[tuple[str, str]], password: str) -> dict[str, int]:
    password_hash = bcrypt_password(password)
    values = ",\n".join(
        "("
        + ", ".join(
            [
                sql_quote(email),
                sql_quote(name),
                sql_quote(password_hash),
                "1",
                sql_quote("ROLE_ADMIN"),
                sql_quote("ACTIVE"),
            ]
        )
        + ")"
        for email, name in users
    )
    mysql.run_sql(
        f"""
        INSERT INTO `user` (email, name, password, enable, role, account_status)
        VALUES {values}
        ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            password = VALUES(password),
            enable = VALUES(enable),
            role = VALUES(role),
            account_status = VALUES(account_status);
        """
    )
    rows = mysql.run_sql(
        "SELECT idx, email FROM `user` WHERE email IN ("
        + ", ".join(sql_quote(email) for email, _ in users)
        + ");"
    )
    user_ids: dict[str, int] = {}
    for line in rows.splitlines():
        if not line.strip():
            continue
        idx, email = line.split("\t", 1)
        user_ids[email] = int(idx)
    missing = [email for email, _ in users if email not in user_ids]
    if missing:
        raise RuntimeError(f"temporary users were not created: {missing}")
    return user_ids


def cleanup_temp_users(mysql: RemoteMysql, emails: list[str]) -> None:
    email_list = ", ".join(sql_quote(email) for email in emails)
    mysql.run_sql(
        f"""
        SET FOREIGN_KEY_CHECKS=0;
        CREATE TEMPORARY TABLE IF NOT EXISTS tmp_fileinnout_scenario_users AS
            SELECT idx FROM `user` WHERE email IN ({email_list});
        DELETE FROM file_share
          WHERE owner_idx IN (SELECT idx FROM tmp_fileinnout_scenario_users)
             OR recipient_idx IN (SELECT idx FROM tmp_fileinnout_scenario_users)
             OR file_idx IN (
                SELECT idx FROM file_info WHERE user_idx IN (SELECT idx FROM tmp_fileinnout_scenario_users)
             );
        DELETE FROM notification_list WHERE receiver_user_idx IN (SELECT idx FROM tmp_fileinnout_scenario_users);
        DELETE FROM notification WHERE user_idx IN (SELECT idx FROM tmp_fileinnout_scenario_users);
        DELETE FROM refresh_token WHERE email IN ({email_list});
        DELETE FROM file_info WHERE user_idx IN (SELECT idx FROM tmp_fileinnout_scenario_users);
        DELETE FROM `user` WHERE idx IN (SELECT idx FROM tmp_fileinnout_scenario_users);
        DROP TEMPORARY TABLE IF EXISTS tmp_fileinnout_scenario_users;
        SET FOREIGN_KEY_CHECKS=1;
        """
    )


def api_for(base_url: str, email: str, password: str) -> desktop.FileInNOutApi:
    api = desktop.FileInNOutApi(base_url)
    tokens = api.login_tokens(email, password)
    return desktop.FileInNOutApi(base_url, tokens.access_token, tokens.refresh_token)


def file_text(api: desktop.FileInNOutApi, rel: str) -> str:
    item = require_remote(api, rel, include_shared=False)
    item_id = desktop.file_id(item)
    if item_id is None:
        raise RuntimeError(f"remote file has no id: {rel}")
    return api.download(item_id, shared=False).decode("utf-8")


def require_remote(api: desktop.FileInNOutApi, rel: str, include_shared: bool) -> dict:
    item = desktop.build_remote_tree(api, include_shared=include_shared).get(rel)
    if not item:
        raise RuntimeError(f"remote path not found: {rel}")
    return item


def normalize_text(value: str) -> str:
    return value.replace("\r\n", "\n")


def require_file(path: Path, expected: str) -> None:
    if not path.is_file():
        raise RuntimeError(f"expected file is missing: {path}")
    actual = path.read_text(encoding="utf-8")
    if normalize_text(actual) != normalize_text(expected):
        raise RuntimeError(f"unexpected content in {path}: {actual!r}")


def accept_pending(api: desktop.FileInNOutApi, file_id: int, label: str) -> None:
    pending = {desktop.file_id(item): item for item in api.list_pending_shares()}
    if file_id not in pending:
        raise RuntimeError(f"{label} was not visible in pending shares")
    if pending[file_id].get("presignedDownloadUrl") or pending[file_id].get("downloadable"):
        raise RuntimeError(f"{label} pending share exposed download capability before accept")
    api.accept_shared_file(file_id)
    if any(desktop.file_id(item) == file_id for item in api.list_pending_shares()):
        raise RuntimeError(f"{label} still appears as pending after accept")


def assert_download_denied(api: desktop.FileInNOutApi, file_id: int, label: str) -> None:
    try:
        api.json_request("GET", f"/file/share/shared/{file_id}/download-link")
    except desktop.DesktopError:
        return
    raise RuntimeError(f"{label} unexpectedly allowed shared download-link")


def assert_text_preview(api: desktop.FileInNOutApi, file_id: int, expected: str, label: str) -> None:
    preview = api.json_request("GET", f"/file/share/shared/{file_id}/text-preview")
    content = preview.get("content") if isinstance(preview, dict) else ""
    if normalize_text(content) != normalize_text(expected):
        raise RuntimeError(f"{label} text preview mismatch: {content!r}")


def generated_secret(label: str) -> str:
    return f"{label}-{secrets.token_urlsafe(24)}"


def ensure_temp_user_password(args: argparse.Namespace) -> None:
    if args.create_temp_users and not args.password:
        args.password = generated_secret("scenario")


def require_existing_account_args(args: argparse.Namespace) -> tuple[str, str, str, str, str, str]:
    values = {
        "a-email": args.a_email,
        "b-email": args.b_email,
        "c-email": args.c_email,
    }
    missing = [name for name, value in values.items() if not value]
    if missing:
        raise RuntimeError(
            "existing account mode requires --a-email, --b-email, and --c-email "
            f"(missing: {', '.join(missing)}). Pass --create-temp-users only when temporary DB users are approved."
        )
    passwords = {
        "a-password or FILEINNOUT_SCENARIO_PASSWORD": args.a_password or args.password,
        "b-password or FILEINNOUT_SCENARIO_PASSWORD": args.b_password or args.password,
        "c-password or FILEINNOUT_SCENARIO_PASSWORD": args.c_password or args.password,
    }
    missing_passwords = [name for name, value in passwords.items() if not value]
    if missing_passwords:
        raise RuntimeError("existing account mode requires explicit password(s): " + ", ".join(missing_passwords))
    return (
        args.a_email.strip().lower(),
        args.b_email.strip().lower(),
        args.c_email.strip().lower(),
        passwords["a-password or FILEINNOUT_SCENARIO_PASSWORD"],
        passwords["b-password or FILEINNOUT_SCENARIO_PASSWORD"],
        passwords["c-password or FILEINNOUT_SCENARIO_PASSWORD"],
    )


def run_scenario_with_accounts(
    args: argparse.Namespace,
    stamp: str,
    a_email: str,
    b_email: str,
    c_email: str,
    a_password: str,
    b_password: str,
    c_password: str,
) -> None:
    temp_context = tempfile.TemporaryDirectory(prefix="fileinnout-abc-scenario-")
    try:
        work_dir = Path(temp_context.name)

        a_api = api_for(args.base_url, a_email, a_password)
        b_api = api_for(args.base_url, b_email, b_password)
        c_api = api_for(args.base_url, c_email, c_password)
        log("A/B/C login")

        a_root = work_dir / "a"
        b_root = work_dir / "b"
        c_root = work_dir / "c"
        for root in (a_root, b_root, c_root):
            root.mkdir(parents=True, exist_ok=True)

        shared_folder = f"shared-{stamp}"
        a_shared = a_root / shared_folder
        a_shared.mkdir()
        files = {
            "a.txt": "A file\n",
            "ac.txt": "AC file\n",
            "b.txt": "B file\n",
        }
        for name, content in files.items():
            (a_shared / name).write_text(content, encoding="utf-8")

        a_push = desktop.push(a_api, a_root)
        if a_push.pushed < 3:
            raise RuntimeError(f"A initial push uploaded too few files: {a_push}")
        shared_item = require_remote(a_api, shared_folder, include_shared=False)
        shared_id = desktop.file_id(shared_item)
        if shared_id is None:
            raise RuntimeError("A shared folder has no id")
        a_api.share([shared_id], b_email, "WRITE")
        shared_item = require_remote(a_api, shared_folder, include_shared=False)
        if not shared_item.get("sharedFile"):
            raise RuntimeError("A folder did not become shared")
        accept_pending(b_api, shared_id, shared_folder)
        b_shared_tree = desktop.build_remote_tree(b_api, include_shared=True)
        b_shared_prefix = f"Shared/{desktop.safe_segment(a_email)}/{shared_folder}"
        if b_shared_prefix not in b_shared_tree:
            raise RuntimeError("B cloud does not contain accepted shared folder")
        b_shared_meta = b_shared_tree[b_shared_prefix]
        if not b_shared_meta.get("writable") or not b_shared_meta.get("uploadable") or not b_shared_meta.get("downloadable"):
            raise RuntimeError("B accepted folder does not have full shared capabilities")
        log("A shared folder converted and B accepted", shared_folder)

        b_pull = desktop.pull(b_api, b_root, include_shared=True)
        for name, content in files.items():
            require_file(b_root / b_shared_prefix / name, content)
        log("B desktop pulled accepted shared folder", f"pulled={b_pull.pulled}")

        poop_name = "응가조아.txt"
        poop_text = "B added this from the shared desktop folder\n"
        (b_root / b_shared_prefix / poop_name).write_text(poop_text, encoding="utf-8")
        b_push = desktop.push(b_api, b_root)
        if b_push.pushed < 1:
            raise RuntimeError("B upload into shared folder was not pushed")
        a_pull = desktop.pull(a_api, a_root, include_shared=False)
        require_file(a_shared / poop_name, poop_text)
        actual_poop_text = file_text(a_api, f"{shared_folder}/{poop_name}")
        if normalize_text(actual_poop_text) != normalize_text(poop_text):
            raise RuntimeError(
                "B uploaded file did not appear in A cloud with expected content "
                f"(actual={actual_poop_text!r}, expected={poop_text!r}, "
                f"bPush={b_push}, aPull={a_pull})"
            )
        log("B upload appeared in A cloud and desktop", f"pushed={b_push.pushed} pulled={a_pull.pulled}")

        stopcondo = f"stopcondo-{stamp}"
        stopcondo_text = "stopcondo shared notice\n"
        a_stop = a_root / stopcondo
        a_stop.mkdir()
        (a_stop / "notice.txt").write_text(stopcondo_text, encoding="utf-8")
        stop_push = desktop.push(a_api, a_root)
        if stop_push.pushed < 1:
            raise RuntimeError("A stopcondo push did not upload notice")
        stop_item = require_remote(a_api, stopcondo, include_shared=False)
        stop_id = desktop.file_id(stop_item)
        if stop_id is None:
            raise RuntimeError("stopcondo folder has no id")
        a_api.share([stop_id], b_email, "WRITE")
        a_api.share([stop_id], c_email, "READ")
        accept_pending(b_api, stop_id, stopcondo)
        accept_pending(c_api, stop_id, stopcondo)
        log("A shared stopcondo to B full and C read-only")

        b_stop_prefix = f"Shared/{desktop.safe_segment(a_email)}/{stopcondo}"
        c_stop_prefix = b_stop_prefix
        b_stop_tree = desktop.build_remote_tree(b_api, include_shared=True)
        c_stop_tree = desktop.build_remote_tree(c_api, include_shared=True)
        b_notice = b_stop_tree.get(f"{b_stop_prefix}/notice.txt")
        c_notice = c_stop_tree.get(f"{c_stop_prefix}/notice.txt")
        if not b_notice or not c_notice:
            raise RuntimeError("B or C cannot see stopcondo notice in shared cloud tree")
        if not b_notice.get("downloadable") or not b_notice.get("uploadable") or not b_notice.get("writable"):
            raise RuntimeError("B stopcondo file does not expose full capabilities")
        if c_notice.get("downloadable") or c_notice.get("uploadable") or c_notice.get("writable"):
            raise RuntimeError("C read-only file exposes download/upload/write capabilities")

        b_stop_pull = desktop.pull(b_api, b_root, include_shared=True)
        require_file(b_root / b_stop_prefix / "notice.txt", stopcondo_text)
        b_stop_upload_text = "B can upload to stopcondo\n"
        (b_root / b_stop_prefix / "b-upload.txt").write_text(b_stop_upload_text, encoding="utf-8")
        b_stop_push = desktop.push(b_api, b_root)
        if b_stop_push.pushed < 1:
            raise RuntimeError("B full-permission stopcondo upload did not push")
        desktop.pull(a_api, a_root, include_shared=False)
        require_file(a_stop / "b-upload.txt", b_stop_upload_text)
        log("B full permission download/upload verified", f"pulled={b_stop_pull.pulled} pushed={b_stop_push.pushed}")

        c_stop_pull = desktop.pull(c_api, c_root, include_shared=True)
        c_stop_dir = c_root / c_stop_prefix
        if not c_stop_dir.is_dir():
            raise RuntimeError("C read-only shared folder was not created locally")
        if (c_stop_dir / "notice.txt").exists():
            raise RuntimeError("C read-only desktop downloaded notice.txt")
        c_notice_id = desktop.file_id(c_notice)
        if c_notice_id is None:
            raise RuntimeError("C notice item has no id")
        assert_text_preview(c_api, c_notice_id, stopcondo_text, "C read-only")
        assert_download_denied(c_api, c_notice_id, "C read-only")
        (c_stop_dir / "c-upload-blocked.txt").write_text("C must not upload\n", encoding="utf-8")
        c_push = desktop.push(c_api, c_root)
        if c_push.pushed != 0 or c_push.deleted != 0 or c_push.skipped_dirty < 1:
            raise RuntimeError("C read-only desktop upload was not blocked")
        if f"{stopcondo}/c-upload-blocked.txt" in desktop.build_remote_tree(a_api, include_shared=False):
            raise RuntimeError("C blocked upload appeared in A cloud")
        log("C read-only preview allowed and download/upload blocked", f"pulled={c_stop_pull.pulled} skipped={c_push.skipped_dirty}")

        if not args.skip_cloud_cleanup:
            for folder in (a_shared, a_stop):
                if folder.exists():
                    desktop.shutil.rmtree(folder)
            cleanup_push = desktop.push(a_api, a_root)
            desktop.pull(b_api, b_root, include_shared=True)
            desktop.pull(c_api, c_root, include_shared=True)
            log("scenario cloud cleanup", f"deleted={cleanup_push.deleted}")

        print("DONE A/B/C desktop share scenario verification", flush=True)
    finally:
        if not args.keep_work_dir:
            temp_context.cleanup()


def run_scenario(args: argparse.Namespace) -> None:
    stamp = time.strftime("%Y%m%d%H%M%S")
    if args.create_temp_users:
        a_email = f"scenario-a-{stamp}@fileinnout.local"
        b_email = f"scenario-b-{stamp}@fileinnout.local"
        c_email = f"scenario-c-{stamp}@fileinnout.local"
        users = [
            (a_email, f"Scenario A {stamp}"),
            (b_email, f"Scenario B {stamp}"),
            (c_email, f"Scenario C {stamp}"),
        ]

        with RemoteMysql(args.vm152, args.ssh_user, args.ssh_password) as mysql:
            user_ids = create_temp_users(mysql, users, args.password)
            log("temporary A/B/C users created", json.dumps(user_ids, ensure_ascii=False))
            try:
                run_scenario_with_accounts(
                    args,
                    stamp,
                    a_email,
                    b_email,
                    c_email,
                    args.password,
                    args.password,
                    args.password,
                )
            finally:
                if not args.keep_users:
                    cleanup_temp_users(mysql, [a_email, b_email, c_email])
                    log("temporary A/B/C users cleaned")
        return

    account_args = require_existing_account_args(args)
    run_scenario_with_accounts(args, stamp, *account_args)


def main() -> int:
    try:
        run_scenario(parse_args())
        return 0
    except (RuntimeError, desktop.DesktopError, urllib.error.URLError) as error:
        print(f"FAIL {error}", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
