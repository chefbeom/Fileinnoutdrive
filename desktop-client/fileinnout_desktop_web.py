from __future__ import annotations

import os
import urllib.parse
from pathlib import Path
from typing import Any

from fileinnout_desktop_constants import SHARE_URL_HOSTS, SHARE_URL_SCHEME, SHARED_ROOT_NAME
from fileinnout_desktop_models import DesktopError
from fileinnout_desktop_paths import normalize_rel, safe_segment


def default_backend_url() -> str:
    raw = os.environ.get("FILEINNOUT_DESKTOP_SERVER", "").strip().rstrip("/")
    return raw or "http://localhost/api"


def frontend_url_from_config(config: dict[str, Any]) -> str:
    raw = str(config.get("frontendUrl") or "").strip().rstrip("/")
    if raw:
        return raw

    server = str(config.get("server") or "").strip().rstrip("/") or default_backend_url()
    if server.endswith("/api"):
        return server[:-4]
    return server


def is_shared_rel(rel: str) -> bool:
    return normalize_rel(rel).split("/", 1)[0] == SHARED_ROOT_NAME


def desktop_web_url_for_cloud_path(config: dict[str, Any], cloud_rel: Path | str) -> str:
    base_url = frontend_url_from_config(config).rstrip("/")
    rel = normalize_rel(cloud_rel)
    route_path = "/main/shareFile" if is_shared_rel(rel) else "/main/home"
    query = {"desktopPath": rel} if rel else {}
    suffix = "?" + urllib.parse.urlencode(query) if query else ""
    return f"{base_url}{route_path}{suffix}"


def build_share_address(config: dict[str, Any], cloud_rel: Path | str) -> str:
    rel = normalize_rel(cloud_rel)
    if not rel:
        raise DesktopError("share path is empty")
    if not is_shared_rel(rel):
        raw_owner = str(config.get("email") or config.get("ownerEmail") or "").strip()
        if not raw_owner:
            raise DesktopError("login email is missing; log in again before creating a share address")
        owner = safe_segment(raw_owner)
        rel = normalize_rel(Path(SHARED_ROOT_NAME) / owner / Path(rel))

    parts = rel.split("/")
    if len(parts) < 3 or parts[0] != SHARED_ROOT_NAME:
        raise DesktopError(f"share address must point to a shared folder path: {rel}")

    encoded = "/".join(urllib.parse.quote(part, safe="") for part in parts[1:])
    return f"{SHARE_URL_SCHEME}://shared/{encoded}"


def parse_share_address(address: Any) -> str:
    raw = str(address or "").strip().strip('"')
    if not raw:
        raise DesktopError("share address is empty")

    if raw.startswith("\\"):
        raw = raw.lstrip("\\").replace("\\", "/")
    normalized_plain = normalize_rel(raw)
    if normalized_plain.startswith(f"{SHARED_ROOT_NAME}/") and len(normalized_plain.split("/")) >= 3:
        return normalized_plain

    parsed = urllib.parse.urlparse(raw)
    if parsed.scheme.lower() != SHARE_URL_SCHEME:
        if len(normalized_plain.split("/")) >= 2:
            return normalize_rel(Path(SHARED_ROOT_NAME) / Path(normalized_plain))
        raise DesktopError(f"unsupported share address: {raw}")

    query = urllib.parse.parse_qs(parsed.query)
    query_path = (query.get("path") or query.get("sharedPath") or query.get("desktopPath") or [""])[0]
    if query_path:
        rel = normalize_rel(urllib.parse.unquote(query_path))
        if not rel.startswith(f"{SHARED_ROOT_NAME}/"):
            rel = normalize_rel(Path(SHARED_ROOT_NAME) / Path(rel))
        if len(rel.split("/")) >= 3:
            return rel

    host = urllib.parse.unquote(parsed.netloc or "").strip("/")
    path_parts = [
        urllib.parse.unquote(part)
        for part in parsed.path.replace("\\", "/").split("/")
        if part
    ]
    host_key = host.casefold()
    if host_key in SHARE_URL_HOSTS:
        parts = path_parts
    else:
        parts = [host, *path_parts] if host else path_parts

    if parts and parts[0].casefold() == SHARED_ROOT_NAME.casefold():
        parts = parts[1:]
    if len(parts) < 2:
        raise DesktopError(f"share address must include owner and folder path: {raw}")
    return normalize_rel(Path(SHARED_ROOT_NAME).joinpath(*parts))


def tsv_field(value: Any) -> str:
    return str(value or "").replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()
