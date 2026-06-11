import argparse
import http.cookiejar
import json
import os
from pathlib import Path
import shutil
import shlex
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
DESKTOP_CLIENT_DIR = ROOT / "desktop-client"
sys.path.insert(0, str(DESKTOP_CLIENT_DIR))

try:
    import fileinnout_desktop as desktop
except ImportError as exc:
    raise SystemExit(f"Cannot import desktop client from {DESKTOP_CLIENT_DIR}: {exc}") from exc

def parse_args():
    parser = argparse.ArgumentParser(description="Verify the FileInNOut two-VM deployment.")
    parser.add_argument("--base-url", default="http://192.168.35.151/api")
    parser.add_argument("--vm152", default="192.168.35.152")
    parser.add_argument("--ssh-user", default="test")
    parser.add_argument("--ssh-password", default=os.environ.get("VM_PASSWORD"))
    parser.add_argument("--admin-email", default=os.environ.get("FILEINNOUT_ADMIN_EMAIL", "admin@fileinnout.local"))
    parser.add_argument("--admin-password", default=os.environ.get("FILEINNOUT_ADMIN_PASSWORD", os.environ.get("VM_PASSWORD")))
    parser.add_argument("--db-password", default=os.environ.get("FILEINNOUT_DB_PASS", os.environ.get("VM_PASSWORD")))
    parser.add_argument("--user-password", default=os.environ.get("FILEINNOUT_TEST_USER_PASSWORD", os.environ.get("VM_PASSWORD")))
    parser.add_argument("--skip-desktop-sync", action="store_true")
    return parser.parse_args()


class Verifier:
    def __init__(self, args):
        missing = [
            name for name, value in {
                "VM_PASSWORD or --ssh-password": args.ssh_password,
                "FILEINNOUT_ADMIN_PASSWORD or --admin-password": args.admin_password,
                "FILEINNOUT_DB_PASS or --db-password": args.db_password,
                "FILEINNOUT_TEST_USER_PASSWORD or --user-password": args.user_password,
            }.items()
            if not value
        ]
        if missing:
            raise SystemExit("Missing required secret(s): " + ", ".join(missing))

        self.args = args
        self.cookiejar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookiejar))

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

    def api(self, method, path, token=None, body=None, raw_data=None, headers=None, expected=(200, 201, 204)):
        url = path if path.startswith(("http://", "https://")) else self.args.base_url + path
        data = raw_data
        req_headers = dict(headers or {})
        if token:
            req_headers["Authorization"] = "Bearer " + token
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            req_headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
        try:
            with self.opener.open(req, timeout=20) as resp:
                parsed = self.decode(resp.read())
                if resp.status not in expected:
                    raise RuntimeError(f"{method} {url} status {resp.status}: {parsed}")
                return parsed, resp.headers, resp.status
        except urllib.error.HTTPError as exc:
            parsed = self.decode(exc.read())
            raise RuntimeError(f"{method} {url} HTTP {exc.code}: {parsed}") from exc

    def unwrap(self, value):
        if isinstance(value, dict) and "result" in value:
            result = value["result"]
            if isinstance(result, dict) and "body" in result:
                return result["body"]
            return result
        return value

    def login(self, email, password):
        data, _, _ = self.api("POST", "/login", body={"email": email, "password": password})
        token = data.get("accessToken") if isinstance(data, dict) else None
        if not token:
            raise RuntimeError("login did not return accessToken")
        self.log("login", email)
        return token

    def ssh_command(self, command, sudo=False):
        try:
            import paramiko
        except ImportError as exc:
            raise RuntimeError(
                "paramiko is required for SSH verification. Install it or set PYTHONPATH to a directory that contains paramiko."
            ) from exc

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            self.args.vm152,
            username=self.args.ssh_user,
            password=self.args.ssh_password,
            timeout=15,
            banner_timeout=15,
            auth_timeout=15,
        )
        try:
            if sudo:
                command = 'sudo -S -p "" ' + command
            stdin, stdout, stderr = client.exec_command(command, get_pty=sudo, timeout=30)
            if sudo:
                stdin.write(self.args.ssh_password + "\n")
                stdin.flush()
            out = stdout.read().decode("utf-8", errors="replace")
            err = stderr.read().decode("utf-8", errors="replace")
            code = stdout.channel.recv_exit_status()
            if code != 0:
                raise RuntimeError(f"ssh exit {code}: {err.strip() or out.strip()}")
            return out.strip()
        finally:
            client.close()

    def get_verify_token(self, email):
        escaped_email = email.replace("'", "''")
        sql = (
            "SELECT token FROM email_verify "
            f"WHERE email='{escaped_email}' "
            "ORDER BY expiry_date DESC LIMIT 1;"
        )
        remote = (
            "docker exec fileinnout-mariadb mariadb "
            f"-uroot -p{shlex.quote(self.args.db_password)} -N -B web -e {shlex.quote(sql)}"
        )
        token = self.ssh_command(remote, sudo=True).strip()
        if not token:
            raise RuntimeError(f"no email verify token found for {email}")
        return token.splitlines()[-1].strip()

    def ensure_file(self, admin_token):
        previewable_formats = {
            "txt", "md", "csv", "log", "json", "xml", "html", "htm",
            "css", "js", "ts", "java", "py", "sql", "yml", "yaml",
            "properties", "sh", "bat",
        }
        items, _, _ = self.api("GET", "/file/list", token=admin_token)
        for item in items or []:
            extension = (item.get("fileFormat") or "").strip().lower()
            if item.get("nodeType") == "FILE" and not item.get("trashed") and extension in previewable_formats:
                return item["idx"]

        content = b"codex two-vm e2e upload smoke file\n"
        filename = "codex-e2e-upload.txt"
        init_body = [{
            "fileOriginName": filename,
            "fileFormat": "txt",
            "fileSize": len(content),
            "contentType": "text/plain",
            "parentId": None,
            "relativePath": None,
            "lastModified": int(time.time() * 1000),
        }]
        chunks, _, _ = self.api("POST", "/file/upload", token=admin_token, body=init_body)
        chunk = chunks[0]
        self.api(
            "PUT",
            chunk["presignedUploadUrl"],
            raw_data=content,
            headers={"Content-Type": "text/plain"},
            expected=(200, 201),
        )
        self.api("POST", "/file/upload/complete", token=admin_token, body={
            "fileOriginName": chunk["fileOriginName"],
            "fileFormat": chunk["fileFormat"],
            "fileSize": chunk["fileSize"],
            "finalObjectKey": chunk["finalObjectKey"],
            "chunkObjectKeys": [chunk["objectKey"]] if chunk.get("objectKey") else [],
            "parentId": chunk.get("parentId"),
            "relativePath": chunk.get("relativePath"),
            "lastModified": chunk.get("lastModified"),
        })

        items, _, _ = self.api("GET", "/file/list", token=admin_token)
        for item in items or []:
            if item.get("fileOriginName") == filename and item.get("nodeType") == "FILE" and not item.get("trashed"):
                self.log("file upload", f"fileId={item['idx']}")
                return item["idx"]
        raise RuntimeError("uploaded file not found in file list")

    def create_temp_folder(self, admin_token, ts):
        folder, _, _ = self.api("POST", "/file/folder", token=admin_token, body={
            "folderName": f"codex-e2e-folder-{ts}",
            "parentId": None,
        })
        folder_id = folder["idx"]
        self.api("GET", f"/file/{folder_id}/properties", token=admin_token)
        self.log("folder create/properties", f"folderId={folder_id}")
        return folder_id

    def require_desktop_file_text(self, path, expected):
        if not path.is_file():
            raise RuntimeError(f"expected desktop sync file is missing: {path}")
        actual = path.read_text(encoding="utf-8")
        if actual != expected:
            raise RuntimeError(f"desktop sync content mismatch in {path}: {actual!r}")

    def require_desktop_remote_file_text(self, api, rel, expected):
        item = desktop.build_remote_tree(api, include_shared=False).get(rel)
        if not item:
            raise RuntimeError(f"expected remote desktop sync file is missing: {rel}")
        item_id = desktop.file_id(item)
        if item_id is None:
            raise RuntimeError(f"remote desktop sync file has no id: {rel}")
        actual = api.download(item_id, shared=False).decode("utf-8")
        if actual != expected:
            raise RuntimeError(f"desktop sync remote content mismatch in {rel}: {actual!r}")

    def write_desktop_file_text(self, path, text):
        path.write_bytes(text.encode("utf-8"))

    def verify_desktop_shared_sync(self, admin_token, user_token, user_email, ts):
        if self.args.skip_desktop_sync:
            self.log("desktop shared sync skipped")
            return

        admin_api = desktop.FileInNOutApi(self.args.base_url, admin_token)
        user_api = desktop.FileInNOutApi(self.args.base_url, user_token)

        with tempfile.TemporaryDirectory(prefix="fileinnout-two-vm-desktop-") as temp:
            work_dir = Path(temp)
            owner_root = work_dir / "owner"
            recipient_root = work_dir / "recipient"
            owner_root.mkdir()
            recipient_root.mkdir()

            folder_name = f"desktop-e2e-{ts}"
            owner_text = "owner desktop shared seed\n"
            owner_after_share_text = "owner desktop post-share write\n"
            recipient_text = "recipient desktop shared write\n"
            readonly_edit_text = "owner desktop readonly edit source\n"
            readonly_delete_text = "owner desktop readonly delete source\n"
            owner_folder = owner_root / folder_name
            owner_folder.mkdir()
            self.write_desktop_file_text(owner_folder / "owner.txt", owner_text)

            owner_push = desktop.push(admin_api, owner_root)
            if owner_push.pushed < 1:
                raise RuntimeError("owner desktop push did not upload seed file")
            folder_item = desktop.build_remote_tree(admin_api, include_shared=False).get(folder_name)
            folder_id = desktop.file_id(folder_item or {})
            if folder_id is None:
                raise RuntimeError("owner desktop folder was not visible remotely")
            admin_api.share([folder_id], user_email, "WRITE")
            self.log("desktop owner push/share", f"folder={folder_name}")

            recipient_pull = desktop.pull(user_api, recipient_root, include_shared=True)
            shared_prefix = Path("Shared") / desktop.safe_segment(self.args.admin_email) / folder_name
            recipient_owner_file = recipient_root / shared_prefix / "owner.txt"
            self.require_desktop_file_text(recipient_owner_file, owner_text)
            self.log("desktop recipient pull shared folder", f"pulled={recipient_pull.pulled}")

            owner_after_share_file = owner_folder / "owner-after-share.txt"
            self.write_desktop_file_text(owner_after_share_file, owner_after_share_text)
            owner_after_share_push = desktop.push(admin_api, owner_root)
            if owner_after_share_push.pushed < 1:
                raise RuntimeError("owner desktop push did not upload post-share file")
            recipient_after_share_pull = desktop.pull(user_api, recipient_root, include_shared=True)
            self.require_desktop_file_text(recipient_owner_file.parent / "owner-after-share.txt", owner_after_share_text)
            self.log(
                "desktop owner post-share inheritance",
                f"pushed={owner_after_share_push.pushed} pulled={recipient_after_share_pull.pulled}",
            )

            recipient_file = recipient_owner_file.parent / "recipient.txt"
            self.write_desktop_file_text(recipient_file, recipient_text)
            recipient_push = desktop.push(user_api, recipient_root)
            if recipient_push.pushed < 1:
                raise RuntimeError("recipient desktop push did not upload into shared folder")
            self.log("desktop recipient writable upload", f"pushed={recipient_push.pushed}")

            owner_pull = desktop.pull(admin_api, owner_root, include_shared=True)
            self.require_desktop_file_text(owner_folder / "recipient.txt", recipient_text)
            self.log("desktop owner pull recipient upload", f"pulled={owner_pull.pulled}")

            recipient_file.unlink()
            recipient_delete = desktop.push(user_api, recipient_root)
            if recipient_delete.deleted < 1:
                raise RuntimeError("recipient desktop delete did not reach cloud")
            owner_delete_pull = desktop.pull(admin_api, owner_root, include_shared=True)
            if (owner_folder / "recipient.txt").exists():
                raise RuntimeError("owner desktop still has recipient.txt after shared deletion")
            self.log(
                "desktop shared delete round trip",
                f"recipientDeleted={recipient_delete.deleted} ownerDeleted={owner_delete_pull.deleted}",
            )

            readonly_folder_name = f"desktop-readonly-e2e-{ts}"
            readonly_owner_folder = owner_root / readonly_folder_name
            readonly_owner_folder.mkdir()
            self.write_desktop_file_text(readonly_owner_folder / "readonly-edit.txt", readonly_edit_text)
            self.write_desktop_file_text(readonly_owner_folder / "readonly-delete.txt", readonly_delete_text)

            readonly_owner_push = desktop.push(admin_api, owner_root)
            if readonly_owner_push.pushed < 2:
                raise RuntimeError("owner desktop push did not upload read-only shared folder")
            readonly_folder_item = desktop.build_remote_tree(admin_api, include_shared=False).get(readonly_folder_name)
            readonly_folder_id = desktop.file_id(readonly_folder_item or {})
            if readonly_folder_id is None:
                raise RuntimeError("owner desktop read-only folder was not visible remotely")
            admin_api.share([readonly_folder_id], user_email, "READ")

            readonly_pull = desktop.pull(user_api, recipient_root, include_shared=True)
            readonly_shared_prefix = Path("Shared") / desktop.safe_segment(self.args.admin_email) / readonly_folder_name
            readonly_recipient_folder = recipient_root / readonly_shared_prefix
            self.require_desktop_file_text(readonly_recipient_folder / "readonly-edit.txt", readonly_edit_text)
            self.require_desktop_file_text(readonly_recipient_folder / "readonly-delete.txt", readonly_delete_text)

            self.write_desktop_file_text(readonly_recipient_folder / "readonly-edit.txt", "recipient readonly edit blocked\n")
            self.write_desktop_file_text(readonly_recipient_folder / "local-only.txt", "recipient readonly new blocked\n")
            (readonly_recipient_folder / "readonly-delete.txt").unlink()
            readonly_blocked_push = desktop.push(user_api, recipient_root)
            if readonly_blocked_push.pushed != 0 or readonly_blocked_push.deleted != 0 or readonly_blocked_push.skipped_dirty < 3:
                raise RuntimeError("read-only shared folder allowed desktop write/delete")
            self.require_desktop_remote_file_text(admin_api, f"{readonly_folder_name}/readonly-edit.txt", readonly_edit_text)
            self.require_desktop_remote_file_text(admin_api, f"{readonly_folder_name}/readonly-delete.txt", readonly_delete_text)
            if f"{readonly_folder_name}/local-only.txt" in desktop.build_remote_tree(admin_api, include_shared=False):
                raise RuntimeError("read-only shared local-only file reached owner cloud")
            self.log(
                "desktop read-only shared write block",
                f"pulled={readonly_pull.pulled} skipped={readonly_blocked_push.skipped_dirty}",
            )

            shutil.rmtree(readonly_recipient_folder)
            readonly_restore_pull = desktop.pull(user_api, recipient_root, include_shared=True)
            self.require_desktop_file_text(readonly_recipient_folder / "readonly-edit.txt", readonly_edit_text)
            self.require_desktop_file_text(readonly_recipient_folder / "readonly-delete.txt", readonly_delete_text)
            self.log("desktop read-only shared restore", f"pulled={readonly_restore_pull.pulled}")

            for folder in (owner_folder, readonly_owner_folder):
                if folder.exists():
                    shutil.rmtree(folder)
            cleanup_push = desktop.push(admin_api, owner_root)
            desktop.pull(user_api, recipient_root, include_shared=True)
            if (recipient_root / shared_prefix).exists():
                raise RuntimeError("recipient desktop shared folder remained after owner cleanup")
            if (recipient_root / readonly_shared_prefix).exists():
                raise RuntimeError("recipient desktop read-only shared folder remained after owner cleanup")
            self.log("desktop shared cleanup", f"deleted={cleanup_push.deleted}")

    def run(self):
        ts = time.strftime("%Y%m%d%H%M%S")
        user_email = f"codex-user-{ts}@fileinnout.local"
        user_name = f"Codex User {ts}"

        admin_token = self.login(self.args.admin_email, self.args.admin_password)

        signup, _, _ = self.api("POST", "/user/signup", body={
            "email": user_email,
            "name": user_name,
            "password": self.args.user_password,
        })
        user_id = self.unwrap(signup)["idx"]
        self.log("user signup", f"userId={user_id}")

        verify_token = self.get_verify_token(user_email)
        self.api("GET", "/user/verify?token=" + urllib.parse.quote(verify_token, safe=""))
        self.log("user email verify endpoint", user_email)

        user_token = self.login(user_email, self.args.user_password)

        rel_invite = self.unwrap(self.api("POST", "/group/invites", token=admin_token, body={
            "email": user_email,
            "type": "FRIEND",
        })[0])
        invite_id = rel_invite["inviteId"]
        self.log("relationship invite create", f"inviteId={invite_id}")
        self.api("PATCH", f"/group/invites/{invite_id}/accept", token=user_token)
        self.log("relationship invite accept")

        admin_rels = self.unwrap(self.api("GET", "/group/relationships", token=admin_token)[0])
        rel_id = None
        for rel in admin_rels.get("relationships", []):
            target = rel.get("targetUser") or {}
            if target.get("email") == user_email:
                rel_id = rel["relationshipId"]
                break
        if rel_id is None:
            raise RuntimeError("accepted relationship not visible to admin")
        self.log("relationship list", f"relationshipId={rel_id}")

        group = self.unwrap(self.api("POST", "/group/groups", token=admin_token, body={
            "name": f"codex-e2e-group-{ts}",
        })[0])
        group_id = group["groupId"]
        self.log("group create", f"groupId={group_id}")
        self.api("POST", f"/group/relationships/{rel_id}/groups", token=admin_token, body={"groupId": group_id})
        self.log("relationship add to group")
        group_invite = self.unwrap(self.api("POST", "/group/group-invites", token=admin_token, body={
            "groupId": group_id,
            "toUserId": user_id,
        })[0])
        group_invite_id = group_invite["groupInviteId"]
        self.log("group invite create", f"groupInviteId={group_invite_id}")
        self.api("PATCH", f"/group/group-invites/{group_invite_id}/accept", token=user_token)
        self.log("group invite accept")

        file_id = self.ensure_file(admin_token)
        folder_id = self.create_temp_folder(admin_token, ts)
        self.api("PATCH", "/file/lock", token=admin_token, body={"fileIdxList": [file_id], "locked": True})
        self.api("PATCH", "/file/lock", token=admin_token, body={"fileIdxList": [file_id], "locked": False})
        self.log("file lock/unlock", f"fileId={file_id}")
        self.api("GET", f"/file/{file_id}/text-preview", token=admin_token)
        self.api("GET", f"/file/{file_id}/download-link", token=admin_token)
        self.log("file preview/download-link")

        self.api("POST", "/file/share", token=admin_token, body={
            "fileIdxList": [file_id],
            "recipientEmail": user_email,
        })
        shared = self.api("GET", "/file/share/shared/list", token=user_token)[0]
        if not any(item.get("idx") == file_id for item in shared):
            raise RuntimeError("shared file not visible to recipient")
        self.log("file share received", f"fileId={file_id}")
        self.api("GET", f"/file/share/shared/{file_id}/download-link", token=user_token)
        self.api("POST", f"/file/share/shared/{file_id}/save", token=user_token, body={"parentId": None})
        self.log("shared file download-link/save-to-drive")

        self.verify_desktop_shared_sync(admin_token, user_token, user_email, ts)

        workspace = self.unwrap(self.api("POST", "/workspace/save", token=admin_token, body={
            "idx": None,
            "title": f"codex-e2e-workspace-{ts}",
            "contents": "{\"blocks\":[]}",
        })[0])
        workspace_id = workspace["idx"]
        workspace_uuid = workspace["uuid"]
        self.log("workspace create", f"workspaceId={workspace_id}")
        self.api("POST", f"/workspace/isShared/{workspace_id}", token=admin_token, body={
            "type": True,
            "status": "Shared",
        })
        self.api(
            "POST",
            "/workspace/invite?uuid="
            + urllib.parse.quote(workspace_uuid, safe="")
            + "&email="
            + urllib.parse.quote(user_email, safe=""),
            token=admin_token,
        )
        self.api("GET", "/workspace/verify?uuid=" + urllib.parse.quote(workspace_uuid, safe="") + "&type=accept", token=user_token)
        self.api("GET", f"/workspace/read/{workspace_id}", token=user_token)
        self.log("workspace invite/accept/read")
        self.api("POST", f"/workspace/{workspace_id}/role/{user_id}", token=admin_token, body={"role": "READ"})
        self.api("DELETE", f"/workspace/{workspace_id}/member/{user_id}", token=admin_token)
        self.log("workspace role change/member remove")

        room_id = self.api("POST", "/chatRoom/create", token=admin_token, body={
            "title": f"codex-e2e-chat-{ts}",
            "participantsEmail": [user_email],
        }, expected=(201,))[0]
        self.log("chat room create", f"roomId={room_id}")
        self.api("GET", "/chatRoom/list?page=0&size=5", token=user_token)
        self.api("POST", f"/chatRoom/{room_id}/enter", token=user_token, expected=(200, 204))
        self.api("POST", f"/chatRoom/{room_id}/heartbeat", token=user_token, expected=(200, 204))
        self.api("POST", f"/chatRoom/{room_id}/leave", token=user_token, expected=(200, 204))
        self.api("GET", f"/chat/{room_id}/history?page=0&size=10", token=user_token)
        self.log("chat list/presence/history")

        inbox = self.api("GET", "/notification/list", token=user_token)[0]
        inbox_items = (((inbox or {}).get("result") or {}).get("body") or []) if isinstance(inbox, dict) else []
        if inbox_items:
            first = inbox_items[0]
            self.api("PATCH", "/notification/read", token=user_token, body={
                "id": first.get("idx"),
                "uuid": first.get("uuid"),
            })
            self.api("DELETE", "/notification", token=user_token, body={
                "id": first.get("idx"),
                "uuid": first.get("uuid"),
            })
            self.log("notification list/read/delete", f"count={len(inbox_items)}")
        else:
            self.log("notification list", "empty inbox")

        order = self.unwrap(self.api("POST", "/orders", token=user_token, body={"productCode": "PLUS"})[0])
        self.log("order draft create", f"orderId={order['orderId']} amount={order['amount']}")

        self.cleanup(admin_token, user_token, file_id, folder_id, group_id, workspace_id, room_id, user_email)
        print("DONE two-user e2e smoke verification", flush=True)

    def cleanup(self, admin_token, user_token, file_id, folder_id, group_id, workspace_id, room_id, user_email):
        cleanups = [
            ("cleanup file share cancel", lambda: self.api("POST", "/file/share/cancel", token=admin_token, body={
                "fileIdxList": [file_id],
                "recipientEmail": user_email,
            })),
            ("cleanup group delete", lambda: self.api("DELETE", f"/group/groups/{group_id}", token=admin_token)),
            ("cleanup folder delete", lambda: self.api("DELETE", f"/file/{folder_id}", token=admin_token)),
            ("cleanup workspace delete", lambda: self.api("POST", f"/workspace/delete/{workspace_id}", token=admin_token)),
            ("cleanup user chat exit", lambda: self.api("DELETE", f"/chatRoom/{room_id}/exit", token=user_token)),
            ("cleanup admin chat exit", lambda: self.api("DELETE", f"/chatRoom/{room_id}/exit", token=admin_token)),
        ]
        for name, action in cleanups:
            try:
                action()
                self.log(name)
            except Exception as exc:
                print(f"WARN {name}: {exc}", flush=True)


def main():
    Verifier(parse_args()).run()


if __name__ == "__main__":
    main()
