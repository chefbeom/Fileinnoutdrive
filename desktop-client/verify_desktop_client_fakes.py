#!/usr/bin/env python3
"""Shared fake API fixtures for offline desktop client verification."""

from __future__ import annotations

from pathlib import Path

import fileinnout_desktop as client


class FakeSharedApi:
    def __init__(
        self,
        owned_items: list[dict] | None = None,
        shared_items: list[dict] | None = None,
        pending_items: list[dict] | None = None,
    ) -> None:
        self.created_folders: list[tuple[int, str]] = []
        self.uploads: list[tuple[int, str, str]] = []
        self.trashed_owned: list[int] = []
        self.trashed_shared: list[int] = []
        self.moved_owned: list[tuple[int, int | None]] = []
        self.renamed_owned: list[tuple[int, str]] = []
        self.shares: list[tuple[list[int], str, str]] = []
        self.accepted_pending: list[int] = []
        self.rejected_pending: list[int] = []
        self.download_payloads: dict[int, bytes] = {}
        self.downloads: list[tuple[int, bool]] = []
        self.created_owned_folders: list[tuple[int | None, str]] = []
        self.init_uploads: list[dict] = []
        self.complete_uploads: list[dict] = []
        self.presigned_puts: list[tuple[str, int, str]] = []
        self.next_id = 10
        self.owned_items = owned_items if owned_items is not None else []
        self.shared_items = shared_items if shared_items is not None else [
            {
                "idx": 1,
                "fileOriginName": "Team",
                "nodeType": "FOLDER",
                "parentId": None,
                "ownerEmail": "admin@example.com",
                "permission": "WRITE",
                "writable": True,
            }
        ]
        self.pending_items = pending_items if pending_items is not None else []

    def list_owned(self) -> list[dict]:
        return self.owned_items

    def list_shared(self) -> list[dict]:
        return self.shared_items

    def list_pending_shares(self) -> list[dict]:
        return self.pending_items

    def accept_shared_file(self, file_id_value: int) -> dict:
        self.accepted_pending.append(file_id_value)
        self.pending_items = [
            item for item in self.pending_items
            if client.file_id(item) != file_id_value
        ]
        return {"action": "accept-share", "targetIdx": file_id_value}

    def reject_shared_file(self, file_id_value: int) -> dict:
        self.rejected_pending.append(file_id_value)
        self.pending_items = [
            item for item in self.pending_items
            if client.file_id(item) != file_id_value
        ]
        return {"action": "reject-share", "targetIdx": file_id_value}

    def trash_file(self, file_id: int) -> None:
        self.trashed_owned.append(file_id)

    def move_file(self, file_id: int, target_parent_id: int | None) -> None:
        self.moved_owned.append((file_id, target_parent_id))
        for item in self.owned_items:
            if client.file_id(item) == file_id:
                item["parentId"] = target_parent_id
                break

    def rename_file(self, file_id: int, file_name: str) -> None:
        self.renamed_owned.append((file_id, file_name))
        for item in self.owned_items:
            if client.file_id(item) == file_id:
                item["fileOriginName"] = file_name
                break

    def create_folder(self, folder_name: str, parent_id: int | None) -> dict:
        self.created_owned_folders.append((parent_id, folder_name))
        self.next_id += 1
        item = {
            "idx": self.next_id,
            "fileOriginName": folder_name,
            "nodeType": "FOLDER",
            "parentId": parent_id,
        }
        self.owned_items.append(item)
        return item

    def init_upload(self, request_body: list[dict]) -> list[dict]:
        self.init_uploads.extend(request_body)
        responses = []
        for request in request_body:
            self.next_id += 1
            object_key = f"{self.next_id}-{request['fileOriginName']}"
            responses.append({
                **request,
                "presignedUploadUrl": f"memory://{object_key}",
                "objectKey": object_key,
                "finalObjectKey": object_key,
                "partitioned": False,
            })
        return responses

    def put_presigned(self, url: str, data: bytes, content_type: str) -> None:
        self.presigned_puts.append((url, len(data), content_type))

    def complete_upload(self, body: dict) -> None:
        self.complete_uploads.append(body)
        replace_file_id = body.get("replaceFileId")
        if replace_file_id is not None:
            for item in self.owned_items:
                if client.file_id(item) == replace_file_id:
                    item["fileOriginName"] = body["fileOriginName"]
                    item["nodeType"] = "FILE"
                    item["parentId"] = body.get("parentId")
                    item["fileSize"] = body.get("fileSize", 0)
                    item["lastModifyDate"] = str(body.get("lastModified") or "")
                    return
        self.next_id += 1
        self.owned_items.append({
            "idx": self.next_id,
            "fileOriginName": body["fileOriginName"],
            "nodeType": "FILE",
            "parentId": body.get("parentId"),
            "fileSize": body.get("fileSize", 0),
        })

    def abort_upload(self, body: dict) -> None:
        pass

    def trash_shared_file(self, file_id: int) -> None:
        self.trashed_shared.append(file_id)

    def download(self, file_id: int, shared: bool = False) -> bytes:
        self.downloads.append((file_id, shared))
        return self.download_payloads.get(file_id, b"remote")

    def create_shared_folder(self, folder_id: int, folder_name: str) -> dict:
        self.created_folders.append((folder_id, folder_name))
        self.next_id += 1
        return {
            "idx": self.next_id,
            "fileOriginName": folder_name,
            "nodeType": "FOLDER",
            "parentId": folder_id,
            "ownerEmail": "admin@example.com",
            "permission": "WRITE",
            "writable": True,
        }

    def upload_shared_file(self, folder_id: int, file_path: Path, relative_path: str) -> dict:
        self.uploads.append((folder_id, file_path.name, relative_path))
        self.next_id += 1
        return {
            "idx": self.next_id,
            "fileOriginName": file_path.name,
            "nodeType": "FILE",
            "parentId": folder_id,
            "fileSize": file_path.stat().st_size,
            "ownerEmail": "admin@example.com",
            "permission": "WRITE",
            "writable": True,
        }

    def share(self, file_ids: list[int], email: str, permission: str = "READ") -> None:
        self.shares.append((file_ids, email, permission))
