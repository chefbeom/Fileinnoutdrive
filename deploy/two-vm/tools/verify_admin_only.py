import argparse
from pathlib import Path
import http.cookiejar
import json
import os
import shutil
import shlex
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[3]
DESKTOP_CLIENT_DIR = ROOT / "desktop-client"
sys.path.insert(0, str(DESKTOP_CLIENT_DIR))

try:
    import fileinnout_desktop as desktop
except ImportError as exc:
    raise SystemExit(f"Cannot import desktop client from {DESKTOP_CLIENT_DIR}: {exc}") from exc


def parse_args():
    parser = argparse.ArgumentParser(description="Verify the admin-only two-VM deployment.")
    parser.add_argument("--base-url", default="http://192.168.35.151/api")
    parser.add_argument("--frontend-url", default="http://192.168.35.151")
    parser.add_argument("--yjs-url", default="http://192.168.35.151/wss/statusz")
    parser.add_argument("--admin-email", default=os.environ.get("FILEINNOUT_ADMIN_EMAIL", "admin@fileinnout.local"))
    parser.add_argument("--admin-password", default=os.environ.get("FILEINNOUT_ADMIN_PASSWORD", os.environ.get("VM_PASSWORD")))
    parser.add_argument("--blocked-email", default=os.environ.get("FILEINNOUT_BLOCKED_USER_EMAIL", ""))
    parser.add_argument("--blocked-password", default=os.environ.get("FILEINNOUT_BLOCKED_USER_PASSWORD", os.environ.get("VM_PASSWORD", "")))
    parser.add_argument("--shared-admin-email", default=os.environ.get("FILEINNOUT_SHARED_ADMIN_EMAIL", ""))
    parser.add_argument("--shared-admin-password", default=os.environ.get("FILEINNOUT_SHARED_ADMIN_PASSWORD", ""))
    parser.add_argument("--skip-desktop-sync", action="store_true")
    parser.add_argument("--diagnostics-on-fail", action="store_true", help="Collect SSH diagnostics from both VMs if verification fails.")
    parser.add_argument("--vm151", default=os.environ.get("FILEINNOUT_VM151", "192.168.35.151"))
    parser.add_argument("--vm152", default=os.environ.get("FILEINNOUT_VM152", "192.168.35.152"))
    parser.add_argument("--ssh-user", default=os.environ.get("FILEINNOUT_SSH_USER", "test"))
    parser.add_argument("--ssh-password", default=os.environ.get("FILEINNOUT_SSH_PASSWORD", os.environ.get("VM_PASSWORD", "")))
    parser.add_argument("--remote-root", default=os.environ.get("FILEINNOUT_REMOTE_ROOT", "/home/test/fileinnout"))
    return parser.parse_args()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Verifier:
    def __init__(self, args):
        if not args.admin_password:
            raise SystemExit("Missing admin password. Set VM_PASSWORD or FILEINNOUT_ADMIN_PASSWORD.")
        self.args = args
        self.cookiejar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookiejar),
            NoRedirect,
        )

    def log(self, name, detail=""):
        suffix = f" - {detail}" if detail else ""
        print(f"PASS {name}{suffix}", flush=True)

    def decode(self, raw):
        text = raw.decode("utf-8", errors="replace")
        if not text:
            return None
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text

    def request(self, method, url, token=None, body=None, expected=(200,)):
        data = None
        headers = {}
        if token:
            headers["Authorization"] = "Bearer " + token
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with self.opener.open(req, timeout=20) as resp:
                parsed = self.decode(resp.read())
                if resp.status not in expected:
                    raise RuntimeError(f"{method} {url} status {resp.status}: {parsed}")
                return parsed, resp.headers, resp.status
        except urllib.error.HTTPError as exc:
            parsed = self.decode(exc.read())
            if exc.code in expected:
                return parsed, exc.headers, exc.code
            raise RuntimeError(f"{method} {url} HTTP {exc.code}: {parsed}") from exc

    def api(self, method, path, **kwargs):
        return self.request(method, self.args.base_url + path, **kwargs)

    def login(self, email, password, expected=(200,)):
        data, _, status = self.api("POST", "/login", body={"email": email, "password": password}, expected=expected)
        if status == 200:
            token = data.get("accessToken") if isinstance(data, dict) else None
            if not token:
                raise RuntimeError("login did not return accessToken")
            return token
        return None

    def verify_refresh_reissue(self):
        _, headers, _ = self.api("POST", "/auth/reissue")
        auth_header = headers.get("Authorization") or headers.get("authorization") or ""
        if not auth_header.startswith("Bearer "):
            raise RuntimeError("refresh reissue did not return Authorization bearer token")

        set_cookie_headers = []
        if hasattr(headers, "get_all"):
            set_cookie_headers = headers.get_all("Set-Cookie") or []
        else:
            raw_cookie = headers.get("Set-Cookie")
            if raw_cookie:
                set_cookie_headers = [raw_cookie]
        if not any("refresh=" in cookie for cookie in set_cookie_headers):
            raise RuntimeError("refresh reissue did not rotate refresh cookie")

        self.log("refresh token reissue")
        return auth_header[7:]

    def verify_desktop_sync(self, admin_token):
        if self.args.skip_desktop_sync:
            self.log("desktop sync skipped")
            return

        api = desktop.FileInNOutApi(self.args.base_url, admin_token)
        with tempfile.TemporaryDirectory(prefix="fileinnout-admin-desktop-") as temp:
            temp_root = Path(temp)
            owner_root = temp_root / "owner"
            mirror_root = temp_root / "mirror"
            owner_root.mkdir()
            mirror_root.mkdir()

            stamp = time.strftime("%Y%m%d%H%M%S")
            folder_name = f"admin-desktop-smoke-{stamp}"
            folder = owner_root / folder_name
            folder.mkdir()
            expected = "admin desktop sync smoke\n"
            (folder / "admin.txt").write_text(expected, encoding="utf-8")

            push_stats = desktop.push(api, owner_root)
            if push_stats.pushed < 1:
                raise RuntimeError("desktop push did not upload admin smoke file")

            pull_stats = desktop.pull(api, mirror_root, include_shared=False)
            pulled_file = mirror_root / folder_name / "admin.txt"
            if not pulled_file.is_file():
                raise RuntimeError("desktop pull did not download admin smoke file")
            actual = pulled_file.read_text(encoding="utf-8")
            if actual != expected:
                raise RuntimeError(f"desktop pull content mismatch: {actual!r}")

            remote_before_rename = desktop.build_remote_tree(api, include_shared=False)
            original_remote = remote_before_rename.get(f"{folder_name}/admin.txt")
            original_file_id = desktop.file_id(original_remote or {})
            if original_file_id is None:
                raise RuntimeError("desktop uploaded file has no remote id before rename")

            renamed_owner_file = folder / "admin-renamed.txt"
            (folder / "admin.txt").rename(renamed_owner_file)
            rename_stats = desktop.push(api, owner_root)
            if rename_stats.pushed < 1:
                raise RuntimeError("desktop local rename was not pushed")
            remote_after_rename = desktop.build_remote_tree(api, include_shared=False)
            if f"{folder_name}/admin.txt" in remote_after_rename:
                raise RuntimeError("desktop local rename left the old remote path")
            renamed_remote = remote_after_rename.get(f"{folder_name}/admin-renamed.txt")
            if desktop.file_id(renamed_remote or {}) != original_file_id:
                raise RuntimeError("desktop local rename did not preserve the remote file id")

            rename_pull_stats = desktop.pull(api, mirror_root, include_shared=False)
            if (mirror_root / folder_name / "admin.txt").exists():
                raise RuntimeError("desktop pull left the old renamed file locally")
            renamed_mirror_file = mirror_root / folder_name / "admin-renamed.txt"
            if not renamed_mirror_file.is_file():
                raise RuntimeError("desktop pull did not download the renamed file")
            if renamed_mirror_file.read_text(encoding="utf-8") != expected:
                raise RuntimeError("desktop renamed file content changed")

            archive_folder = folder / "Archive"
            archive_folder.mkdir()
            moved_owner_file = archive_folder / "admin-renamed.txt"
            renamed_owner_file.rename(moved_owner_file)
            move_stats = desktop.push(api, owner_root)
            if move_stats.pushed < 1:
                raise RuntimeError("desktop local move was not pushed")
            remote_after_move = desktop.build_remote_tree(api, include_shared=False)
            if f"{folder_name}/admin-renamed.txt" in remote_after_move:
                raise RuntimeError("desktop local move left the old remote path")
            moved_remote = remote_after_move.get(f"{folder_name}/Archive/admin-renamed.txt")
            if desktop.file_id(moved_remote or {}) != original_file_id:
                raise RuntimeError("desktop local move did not preserve the remote file id")

            move_pull_stats = desktop.pull(api, mirror_root, include_shared=False)
            if renamed_mirror_file.exists():
                raise RuntimeError("desktop pull left the old moved file locally")
            moved_mirror_file = mirror_root / folder_name / "Archive" / "admin-renamed.txt"
            if not moved_mirror_file.is_file():
                raise RuntimeError("desktop pull did not download the moved file")
            if moved_mirror_file.read_text(encoding="utf-8") != expected:
                raise RuntimeError("desktop moved file content changed")

            folder_child_text = "admin desktop folder rename move smoke\n"
            folder_before_rename = folder / "FolderToRename"
            folder_before_rename.mkdir()
            (folder_before_rename / "child.txt").write_text(folder_child_text, encoding="utf-8")
            folder_seed_stats = desktop.push(api, owner_root)
            if folder_seed_stats.pushed < 1:
                raise RuntimeError("desktop push did not upload folder rename seed file")

            remote_before_folder_rename = desktop.build_remote_tree(api, include_shared=False)
            folder_remote = remote_before_folder_rename.get(f"{folder_name}/FolderToRename")
            folder_id = desktop.file_id(folder_remote or {})
            child_remote = remote_before_folder_rename.get(f"{folder_name}/FolderToRename/child.txt")
            child_id = desktop.file_id(child_remote or {})
            if folder_id is None:
                raise RuntimeError("desktop folder rename seed has no remote folder id")
            if child_id is None:
                raise RuntimeError("desktop folder rename seed child has no remote file id")

            folder_seed_pull_stats = desktop.pull(api, mirror_root, include_shared=False)
            folder_seed_mirror_file = mirror_root / folder_name / "FolderToRename" / "child.txt"
            if not folder_seed_mirror_file.is_file():
                raise RuntimeError("desktop pull did not download folder rename seed file")
            if folder_seed_mirror_file.read_text(encoding="utf-8") != folder_child_text:
                raise RuntimeError("desktop folder rename seed content mismatch")

            folder_after_rename = folder / "FolderRenamed"
            folder_before_rename.rename(folder_after_rename)
            folder_rename_stats = desktop.push(api, owner_root)
            if folder_rename_stats.pushed < 1:
                raise RuntimeError("desktop local folder rename was not pushed")
            remote_after_folder_rename = desktop.build_remote_tree(api, include_shared=False)
            if f"{folder_name}/FolderToRename" in remote_after_folder_rename:
                raise RuntimeError("desktop local folder rename left the old remote folder path")
            renamed_folder_remote = remote_after_folder_rename.get(f"{folder_name}/FolderRenamed")
            renamed_child_remote = remote_after_folder_rename.get(f"{folder_name}/FolderRenamed/child.txt")
            if desktop.file_id(renamed_folder_remote or {}) != folder_id:
                raise RuntimeError("desktop local folder rename did not preserve the remote folder id")
            if desktop.file_id(renamed_child_remote or {}) != child_id:
                raise RuntimeError("desktop local folder rename did not preserve the child file id")

            folder_rename_pull_stats = desktop.pull(api, mirror_root, include_shared=False)
            if folder_seed_mirror_file.exists():
                raise RuntimeError("desktop pull left the old renamed folder locally")
            renamed_folder_mirror_file = mirror_root / folder_name / "FolderRenamed" / "child.txt"
            if not renamed_folder_mirror_file.is_file():
                raise RuntimeError("desktop pull did not expose the renamed folder locally")
            if renamed_folder_mirror_file.read_text(encoding="utf-8") != folder_child_text:
                raise RuntimeError("desktop renamed folder child content changed")

            folder_after_move = archive_folder / "FolderRenamed"
            folder_after_rename.rename(folder_after_move)
            folder_move_stats = desktop.push(api, owner_root)
            if folder_move_stats.pushed < 1:
                raise RuntimeError("desktop local folder move was not pushed")
            remote_after_folder_move = desktop.build_remote_tree(api, include_shared=False)
            if f"{folder_name}/FolderRenamed" in remote_after_folder_move:
                raise RuntimeError("desktop local folder move left the old remote folder path")
            moved_folder_remote = remote_after_folder_move.get(f"{folder_name}/Archive/FolderRenamed")
            moved_child_remote = remote_after_folder_move.get(f"{folder_name}/Archive/FolderRenamed/child.txt")
            if desktop.file_id(moved_folder_remote or {}) != folder_id:
                raise RuntimeError("desktop local folder move did not preserve the remote folder id")
            if desktop.file_id(moved_child_remote or {}) != child_id:
                raise RuntimeError("desktop local folder move did not preserve the child file id")

            folder_move_pull_stats = desktop.pull(api, mirror_root, include_shared=False)
            if renamed_folder_mirror_file.exists():
                raise RuntimeError("desktop pull left the old moved folder locally")
            moved_folder_mirror_file = mirror_root / folder_name / "Archive" / "FolderRenamed" / "child.txt"
            if not moved_folder_mirror_file.is_file():
                raise RuntimeError("desktop pull did not expose the moved folder locally")
            if moved_folder_mirror_file.read_text(encoding="utf-8") != folder_child_text:
                raise RuntimeError("desktop moved folder child content changed")

            shutil.rmtree(folder)
            delete_stats = desktop.push(api, owner_root)
            if delete_stats.deleted < 1:
                raise RuntimeError("desktop push did not send admin smoke deletion")

            cleanup_pull_stats = desktop.pull(api, mirror_root, include_shared=False)
            if (mirror_root / folder_name).exists():
                raise RuntimeError("desktop pull did not remove deleted admin smoke folder")

            self.log(
                "desktop sync upload/pull/rename/move/delete",
                (
                    f"pushed={push_stats.pushed} pulled={pull_stats.pulled} "
                    f"renamed={rename_stats.pushed} renamePulled={rename_pull_stats.pulled} "
                    f"moved={move_stats.pushed} movePulled={move_pull_stats.pulled} "
                    f"folderSeed={folder_seed_stats.pushed} folderSeedPulled={folder_seed_pull_stats.pulled} "
                    f"folderRenamed={folder_rename_stats.pushed} folderRenamePulled={folder_rename_pull_stats.pulled} "
                    f"folderMoved={folder_move_stats.pushed} folderMovePulled={folder_move_pull_stats.pulled} "
                    f"deleted={delete_stats.deleted} cleanupDeleted={cleanup_pull_stats.deleted}"
                ),
            )

    def verify_shared_admin_desktop_sync(self, admin_token):
        if not self.args.shared_admin_email:
            return
        if not self.args.shared_admin_password:
            raise RuntimeError("set --shared-admin-password when --shared-admin-email is used")

        command = [
            sys.executable,
            str(ROOT / "desktop-client" / "verify_live_desktop_sync.py"),
            "--server",
            self.args.base_url,
            "--owner-email",
            self.args.admin_email,
            "--owner-token",
            admin_token,
            "--recipient-email",
            self.args.shared_admin_email,
            "--recipient-password",
            self.args.shared_admin_password,
        ]
        completed = subprocess.run(
            command,
            cwd=ROOT,
            text=True,
            encoding="utf-8",
            errors="replace",
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=600,
        )
        if completed.stdout:
            print(completed.stdout.rstrip(), flush=True)
        if completed.returncode != 0:
            raise RuntimeError(f"shared admin desktop sync failed ({completed.returncode})")
        self.log("shared admin desktop sync", self.args.shared_admin_email)

    def run(self):
        self.request("HEAD", self.args.frontend_url, expected=(200,))
        self.log("frontend http")

        self.api("GET", "/test/version")
        self.log("backend health")

        self.request("GET", self.args.yjs_url, expected=(200,))
        self.log("yjs status")

        admin_token = self.login(self.args.admin_email, self.args.admin_password)
        self.log("admin login", self.args.admin_email)
        admin_token = self.verify_refresh_reissue()

        self.api("GET", "/administrator/dashboard", token=admin_token)
        self.log("admin dashboard")

        self.verify_desktop_sync(admin_token)
        self.verify_shared_admin_desktop_sync(admin_token)

        self.api("POST", "/user/signup", body={
            "email": "blocked-signup@fileinnout.local",
            "name": "Blocked Signup",
            "password": "BlockedSignupPassword1!",
        }, expected=(403,))
        self.log("signup blocked")

        self.api("GET", "/oauth2/authorization/google", expected=(401, 403, 404))
        self.log("oauth route blocked")

        if self.args.blocked_email:
            self.login(self.args.blocked_email, self.args.blocked_password, expected=(403,))
            self.log("non-admin login blocked", self.args.blocked_email)

        print("DONE admin-only verification", flush=True)


def ssh_diagnostic_command(host, args, command, *, sudo=False, timeout=45):
    try:
        import paramiko
    except ImportError as exc:
        raise RuntimeError("paramiko is required for SSH diagnostics") from exc

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=host,
        username=args.ssh_user,
        password=args.ssh_password,
        look_for_keys=False,
        allow_agent=False,
        timeout=15,
        banner_timeout=15,
        auth_timeout=15,
    )
    try:
        if sudo:
            quoted = shlex.quote(command + " || true")
            command = f"printf '%s\\n' {shlex.quote(args.ssh_password)} | sudo -S bash -lc {quoted}"
        stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
        output = stdout.read().decode("utf-8", errors="replace")
        error = stderr.read().decode("utf-8", errors="replace")
        stdout.channel.recv_exit_status()
        return (output + error).strip()
    finally:
        client.close()


def collect_host_diagnostics(label, host, args, commands):
    print(f"DIAG {label} {host}", flush=True)
    for title, command in commands:
        print(f"DIAG {label}: {title}", flush=True)
        try:
            output = ssh_diagnostic_command(host, args, command, sudo=True)
        except Exception as exc:
            print(f"DIAG {label}: {title} failed: {exc}", flush=True)
            continue
        if output:
            print(output, flush=True)
        else:
            print("(no output)", flush=True)


def collect_diagnostics(args):
    if not args.ssh_password:
        print("DIAG skipped: set VM_PASSWORD or FILEINNOUT_SSH_PASSWORD for SSH diagnostics", flush=True)
        return

    remote_root = shlex.quote(args.remote_root)
    vm151_commands = [
        ("system", "hostname; date; uptime; ip -br addr"),
        ("docker ps", "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'"),
        ("compose ps", f"cd {remote_root} && docker compose -f deploy/two-vm/docker-compose.vm151.yml --env-file deploy/two-vm/.env.vm151 ps"),
        ("backend health", "curl -fsS http://localhost:8080/api/test/version"),
        ("frontend head", "curl -fsSI http://localhost | head -n 10"),
        ("backend logs", "docker logs --tail=160 fileinnout-backend"),
        ("frontend logs", "docker logs --tail=120 fileinnout-frontend"),
    ]
    vm152_commands = [
        ("system", "hostname; date; uptime; ip -br addr"),
        ("docker ps", "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'"),
        ("compose ps", f"cd {remote_root} && docker compose -f deploy/two-vm/docker-compose.vm152.yml --env-file deploy/two-vm/.env.vm152 ps"),
        ("redis ping", "docker exec fileinnout-redis redis-cli ping"),
        ("mariadb ping", "docker exec fileinnout-mariadb sh -lc 'mariadb-admin ping -h 127.0.0.1 -uroot -p\"$MARIADB_ROOT_PASSWORD\" --silent'"),
        ("yjs status", "curl -fsS http://localhost:1234/statusz"),
        ("mariadb logs", "docker logs --tail=120 fileinnout-mariadb"),
        ("redis logs", "docker logs --tail=80 fileinnout-redis"),
        ("minio logs", "docker logs --tail=120 fileinnout-minio"),
        ("websocket logs", "docker logs --tail=120 fileinnout-websocket"),
    ]
    collect_host_diagnostics("vm151", args.vm151, args, vm151_commands)
    collect_host_diagnostics("vm152", args.vm152, args, vm152_commands)


def main():
    args = parse_args()
    try:
        Verifier(args).run()
    except Exception as exc:
        print(f"FAIL admin-only verification: {exc}", flush=True)
        if args.diagnostics_on_fail:
            collect_diagnostics(args)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
