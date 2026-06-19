from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


class DesktopError(RuntimeError):
    pass


@dataclass
class SyncStats:
    pulled: int = 0
    pushed: int = 0
    deleted: int = 0
    folders_created: int = 0
    skipped_dirty: int = 0
    download_failed: int = 0
    conflicts: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class AuthTokens:
    access_token: str
    refresh_token: str = ""
