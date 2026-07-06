from __future__ import annotations

import http.client
import json
import mimetypes
import time
import urllib.error
import urllib.request
from http.cookies import SimpleCookie
from pathlib import Path
from typing import Any

from fileinnout_desktop_constants import GET_RETRY_ATTEMPTS
from fileinnout_desktop_models import AuthTokens, DesktopError

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
