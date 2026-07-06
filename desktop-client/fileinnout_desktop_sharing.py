from __future__ import annotations

from typing import Any

from fileinnout_desktop_constants import SHARED_ROOT_NAME
from fileinnout_desktop_models import DesktopError
from fileinnout_desktop_paths import normalize_rel, safe_segment
from fileinnout_desktop_remote import build_item_paths, file_id


def normalize_recipient_emails(raw_emails: Any) -> list[str]:
    values = raw_emails if isinstance(raw_emails, list) else [raw_emails]
    emails: list[str] = []
    seen: set[str] = set()
    for value in values:
        for email in str(value or "").split(","):
            email = email.strip()
            if not email:
                continue
            key = email.lower()
            if key in seen:
                continue
            seen.add(key)
            emails.append(email)
    if not emails:
        raise DesktopError("at least one --email recipient is required")
    return emails


def find_shared_item_by_rel(paths: dict[str, dict[str, Any]], shared_rel: str) -> tuple[str, dict[str, Any]] | None:
    normalized = normalize_rel(shared_rel)
    item = paths.get(normalized)
    if item is not None:
        return normalized, item

    parts = normalized.split("/")
    if len(parts) < 3 or parts[0] != SHARED_ROOT_NAME:
        return None
    owner_key = parts[1].casefold()
    requested_tail = "/".join(parts[2:]).casefold()
    matches: list[tuple[str, dict[str, Any]]] = []
    for rel, candidate in paths.items():
        candidate_parts = normalize_rel(rel).split("/")
        if len(candidate_parts) < 3 or candidate_parts[0] != SHARED_ROOT_NAME:
            continue
        if candidate_parts[1].casefold() != owner_key:
            continue
        candidate_tail = "/".join(candidate_parts[2:]).casefold()
        if candidate_tail == requested_tail or candidate_tail.endswith("/" + requested_tail):
            matches.append((rel, candidate))
    return matches[0] if len(matches) == 1 else None


def build_pending_share_tree(api: Any) -> dict[str, dict[str, Any]]:
    pending_items = [item for item in api.list_pending_shares() if not item.get("trashed")]
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in pending_items:
        owner = safe_segment(str(item.get("ownerEmail") or item.get("ownerName") or "shared"))
        grouped.setdefault(owner, []).append(item)

    paths: dict[str, dict[str, Any]] = {}
    for owner, items in grouped.items():
        paths.update(build_item_paths(items, prefix=f"{SHARED_ROOT_NAME}/{owner}"))
    return paths


def resolve_pending_share(api: Any, args: Any) -> tuple[int, str, dict[str, Any] | None]:
    pending = build_pending_share_tree(api)
    if getattr(args, "id", None) is not None:
        target_id = int(args.id)
        for rel, item in pending.items():
            if file_id(item) == target_id:
                return target_id, rel, item
        return target_id, f"id={args.id}", None

    rel = normalize_rel(getattr(args, "path", "") or "")
    if not rel:
        raise DesktopError("pass --id or --path for the pending share")

    item = pending.get(rel)
    if item is None:
        raise DesktopError(f"pending share not found: {rel}")
    item_id = file_id(item)
    if item_id is None:
        raise DesktopError(f"pending share has no id: {rel}")
    return item_id, rel, item


def resolve_pending_share_id(api: Any, args: Any) -> tuple[int, str]:
    item_id, label, _ = resolve_pending_share(api, args)
    return item_id, label
