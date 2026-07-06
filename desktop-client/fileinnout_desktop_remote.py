from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fileinnout_desktop_api import FileInNOutApi
from fileinnout_desktop_paths import normalize_rel, safe_segment


def file_id(item: dict[str, Any]) -> int | None:
    raw = item.get("idx") if item.get("idx") is not None else item.get("id")
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def parent_id(item: dict[str, Any]) -> int | None:
    raw = item.get("parentId")
    try:
        return int(raw) if raw is not None else None
    except (TypeError, ValueError):
        return None


def node_type(item: dict[str, Any]) -> str:
    return str(item.get("nodeType") or "").upper() or "FILE"


def item_name(item: dict[str, Any]) -> str:
    return safe_segment(str(item.get("fileOriginName") or item.get("name") or "unnamed"))


def item_updated(item: dict[str, Any]) -> str:
    return str(item.get("lastModifyDate") or item.get("uploadDate") or "")


def build_item_paths(items: list[dict[str, Any]], prefix: str = "") -> dict[str, dict[str, Any]]:
    by_id = {file_id(item): item for item in items if file_id(item) is not None}
    cache: dict[int, str] = {}

    def path_for(item: dict[str, Any], visiting: set[int] | None = None) -> str:
        current_id = file_id(item)
        if current_id is None:
            return item_name(item)
        if current_id in cache:
            return cache[current_id]
        visiting = visiting or set()
        if current_id in visiting:
            return item_name(item)
        visiting.add(current_id)

        parent = by_id.get(parent_id(item))
        if parent:
            rel = normalize_rel(Path(path_for(parent, visiting)) / item_name(item))
        else:
            rel = item_name(item)
        cache[current_id] = rel
        return rel

    paths: dict[str, dict[str, Any]] = {}
    used: dict[str, int] = {}
    for item in items:
        rel = normalize_rel(Path(prefix) / path_for(item)) if prefix else path_for(item)
        count = used.get(rel, 0)
        used[rel] = count + 1
        if count:
            stem, suffix = os.path.splitext(rel)
            rel = f"{stem} ({file_id(item) or count}){suffix}"
        paths[rel] = item
    return paths


def build_remote_tree(api: FileInNOutApi, include_shared: bool) -> dict[str, dict[str, Any]]:
    owned_paths = build_item_paths([item for item in api.list_owned() if not item.get("trashed")])
    for item in owned_paths.values():
        item["_sharedWithMe"] = False

    if not include_shared:
        return owned_paths

    shared_items = [item for item in api.list_shared() if not item.get("trashed")]
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in shared_items:
        owner = safe_segment(str(item.get("ownerEmail") or item.get("ownerName") or "shared"))
        grouped.setdefault(owner, []).append(item)

    for owner, items in grouped.items():
        for rel, item in build_item_paths(items, prefix=f"Shared/{owner}").items():
            item["_sharedWithMe"] = True
            owned_paths[rel] = item
    return owned_paths


def is_accepted_shared_item(item: dict[str, Any] | None) -> bool:
    if not item:
        return False
    status = str(item.get("status") or item.get("shareStatus") or "").upper()
    return status in {"", "ACCEPTED"}


def is_writable_shared_item(item: dict[str, Any] | None) -> bool:
    if not is_accepted_shared_item(item):
        return False
    permission = str(item.get("permission") or "").upper()
    return bool(item.get("writable")) or bool(item.get("canWrite")) or permission == "WRITE"


def is_uploadable_shared_item(item: dict[str, Any] | None) -> bool:
    if not is_accepted_shared_item(item):
        return False
    permission = str(item.get("permission") or "").upper()
    return bool(item.get("uploadable")) or bool(item.get("canUpload")) or permission in {"UPLOAD", "WRITE"}


def is_downloadable_shared_item(item: dict[str, Any] | None) -> bool:
    if not is_accepted_shared_item(item):
        return False
    permission = str(item.get("permission") or "").upper()
    return bool(item.get("downloadable")) or bool(item.get("canDownload")) or permission in {"DOWNLOAD", "WRITE"}


def is_readable_shared_item(item: dict[str, Any] | None) -> bool:
    if not is_accepted_shared_item(item):
        return False
    permission = str(item.get("permission") or "").upper()
    return bool(item.get("readable")) or bool(item.get("canRead")) or permission in {"READ", "DOWNLOAD", "UPLOAD", "WRITE"}


def remote_state_snapshot(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": file_id(item),
        "nodeType": node_type(item),
        "size": int(item.get("fileSize") or 0),
        "updatedAt": item_updated(item),
        "sharedWithMe": bool(item.get("_sharedWithMe") or item.get("sharedWithMe")),
        "permission": item.get("permission") or ("WRITE" if item.get("writable") else "READ"),
        "readable": is_readable_shared_item(item),
        "downloadable": is_downloadable_shared_item(item),
        "uploadable": is_uploadable_shared_item(item),
        "writable": bool(item.get("writable")),
    }


def remote_changed_since_state(state: dict[str, Any], rel: str, remote_item: dict[str, Any] | None) -> bool:
    if not remote_item or node_type(remote_item) == "FOLDER":
        return False
    previous = state.get("remote", {}).get(rel)
    if not previous:
        return False
    current = remote_state_snapshot(remote_item)
    for key in ("id", "size", "updatedAt"):
        if previous.get(key) != current.get(key):
            return True
    return False


def remote_id_matches_previous(state: dict[str, Any], rel: str, remote_item: dict[str, Any] | None) -> bool:
    if not remote_item:
        return False
    previous_remote = state.get("remote", {}).get(rel)
    return previous_remote is not None and previous_remote.get("id") == file_id(remote_item)
