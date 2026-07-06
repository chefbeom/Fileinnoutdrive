from __future__ import annotations

from pathlib import Path


def normalize_rel(path: Path | str) -> str:
    text = str(path).replace("\\", "/").strip("/")
    parts = [part for part in text.split("/") if part and part not in (".", "..")]
    return "/".join(parts)


def safe_segment(name: str) -> str:
    cleaned = "".join("_" if char in '<>:"\\|?*' else char for char in name).strip()
    return cleaned.rstrip(". ") or "unnamed"


def comparable_path(path: Path | str) -> str:
    try:
        return str(Path(path).expanduser().resolve(strict=False)).casefold()
    except (OSError, RuntimeError):
        return str(Path(path).expanduser().absolute()).casefold()


def is_descendant_rel(rel: str, parent_rel: str) -> bool:
    rel = normalize_rel(rel)
    parent_rel = normalize_rel(parent_rel)
    return rel == parent_rel or rel.startswith(parent_rel + "/")


def replace_rel_prefix(rel: str, old_rel: str, new_rel: str) -> str:
    rel = normalize_rel(rel)
    old_rel = normalize_rel(old_rel)
    new_rel = normalize_rel(new_rel)
    if rel == old_rel:
        return new_rel
    if old_rel and rel.startswith(old_rel + "/"):
        suffix = rel[len(old_rel):].lstrip("/")
        return normalize_rel(Path(new_rel) / suffix)
    return rel


def has_ancestor_rel(rel: str, ancestors: set[str]) -> bool:
    parent = normalize_rel(Path(rel).parent)
    while parent and parent != ".":
        if parent in ancestors:
            return True
        next_parent = normalize_rel(Path(parent).parent)
        if next_parent == parent:
            break
        parent = next_parent
    return False


def parent_rel_of(rel: str) -> str:
    parent = normalize_rel(Path(rel).parent)
    return "" if parent == "." else parent


def can_treat_as_local_file_move(old_rel: str, new_rel: str) -> bool:
    old_path = Path(old_rel)
    new_path = Path(new_rel)
    return (
        parent_rel_of(old_rel) == parent_rel_of(new_rel)
        or old_path.name.casefold() == new_path.name.casefold()
    )


def can_treat_as_local_folder_move(old_rel: str, new_rel: str) -> bool:
    old_path = Path(old_rel)
    new_path = Path(new_rel)
    return (
        parent_rel_of(old_rel) == parent_rel_of(new_rel)
        or old_path.name.casefold() == new_path.name.casefold()
    )


def rel_suffix_under(rel: str, parent_rel: str) -> str:
    rel = normalize_rel(rel)
    parent_rel = normalize_rel(parent_rel)
    if rel == parent_rel:
        return ""
    if parent_rel and rel.startswith(parent_rel + "/"):
        return rel[len(parent_rel):].lstrip("/")
    return rel