from __future__ import annotations

import base64
import copy
import ctypes
import ctypes.wintypes
import os
from typing import Any

from fileinnout_desktop_models import DesktopError


TOKEN_STORAGE_FIELDS = ("token", "refreshToken")
PROTECTED_TOKEN_SUFFIX = "Protected"


class DataBlob(ctypes.Structure):
    _fields_ = [
        ("cbData", ctypes.wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_byte)),
    ]


def dpapi_available() -> bool:
    return os.name == "nt" and hasattr(ctypes, "windll")


def dpapi_protect_text(value: str) -> str:
    if not dpapi_available():
        return value
    data = value.encode("utf-8")
    input_buffer = ctypes.create_string_buffer(data)
    input_blob = DataBlob(len(data), ctypes.cast(input_buffer, ctypes.POINTER(ctypes.c_byte)))
    output_blob = DataBlob()
    if not ctypes.windll.crypt32.CryptProtectData(
        ctypes.byref(input_blob),
        None,
        None,
        None,
        None,
        0,
        ctypes.byref(output_blob),
    ):
        raise DesktopError("failed to protect desktop token with Windows DPAPI")
    try:
        protected = ctypes.string_at(output_blob.pbData, output_blob.cbData)
        return base64.b64encode(protected).decode("ascii")
    finally:
        ctypes.windll.kernel32.LocalFree(output_blob.pbData)


def dpapi_unprotect_text(value: str) -> str:
    if not value:
        return ""
    if not dpapi_available():
        return value
    try:
        data = base64.b64decode(value.encode("ascii"), validate=True)
    except (ValueError, TypeError):
        return ""
    input_buffer = ctypes.create_string_buffer(data)
    input_blob = DataBlob(len(data), ctypes.cast(input_buffer, ctypes.POINTER(ctypes.c_byte)))
    output_blob = DataBlob()
    if not ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(input_blob),
        None,
        None,
        None,
        None,
        0,
        ctypes.byref(output_blob),
    ):
        return ""
    try:
        unprotected = ctypes.string_at(output_blob.pbData, output_blob.cbData)
        return unprotected.decode("utf-8")
    finally:
        ctypes.windll.kernel32.LocalFree(output_blob.pbData)


def protected_token_key(key: str) -> str:
    return key + PROTECTED_TOKEN_SUFFIX


def unprotect_token_fields(values: dict[str, Any]) -> None:
    for key in TOKEN_STORAGE_FIELDS:
        if values.get(key):
            continue
        protected_value = values.get(protected_token_key(key))
        if isinstance(protected_value, str) and protected_value:
            plain_value = dpapi_unprotect_text(protected_value)
            if plain_value:
                values[key] = plain_value


def protect_token_fields_for_storage(values: dict[str, Any]) -> None:
    if not dpapi_available():
        return
    for key in TOKEN_STORAGE_FIELDS:
        protected_key = protected_token_key(key)
        value = values.get(key)
        if isinstance(value, str) and value:
            values[protected_key] = dpapi_protect_text(value)
        else:
            values.pop(protected_key, None)
        values.pop(key, None)


def unprotect_config_tokens(config: dict[str, Any]) -> dict[str, Any]:
    unprotect_token_fields(config)
    profiles = config.get("accounts")
    if isinstance(profiles, dict):
        for profile in profiles.values():
            if isinstance(profile, dict):
                unprotect_token_fields(profile)
    return config


def protect_config_tokens_for_storage(config: dict[str, Any]) -> dict[str, Any]:
    stored = copy.deepcopy(config)
    protect_token_fields_for_storage(stored)
    profiles = stored.get("accounts")
    if isinstance(profiles, dict):
        for profile in profiles.values():
            if isinstance(profile, dict):
                protect_token_fields_for_storage(profile)
    return stored