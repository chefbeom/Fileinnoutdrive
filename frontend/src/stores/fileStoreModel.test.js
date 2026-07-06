import { describe, expect, it } from "vitest";
import {
  areDriveQueriesEqual,
  decorateLocations,
  decorateSharedPaths,
  normalizeFileRecord,
  normalizeIdList,
  normalizePathSegments,
  reuseCachedAssetUrls,
} from "./fileStoreModel.js";

describe("fileStoreModel", () => {
  it("normalizes file records with sharing, media, and recipient metadata", () => {
    const record = normalizeFileRecord({
      idx: 10,
      fileOriginName: "photo.JPG",
      fileSize: 1536,
      ownerName: "Kim",
      sharedWithMe: true,
      permission: "download",
      recipients: [
        { recipientName: "Lee", recipientEmail: "lee@example.com", permission: "write" },
      ],
      presignedUrlExpiresIn: 60,
    });

    expect(record).toMatchObject({
      id: 10,
      name: "photo.JPG",
      extension: "jpg",
      type: "file",
      ownerName: "Kim",
      location: "공유 문서함",
      permission: "DOWNLOAD",
      downloadable: true,
      isImage: true,
      recipientCount: 1,
      shareRecipientsLabel: "공유 대상: Lee",
    });
    expect(record.assetUrlExpiresAt).toBeGreaterThan(Date.now());
  });

  it("decorates locations and shared desktop paths from parent relationships", () => {
    const root = normalizeFileRecord({ idx: 1, fileOriginName: "Root", nodeType: "FOLDER" });
    const child = normalizeFileRecord({ idx: 2, fileOriginName: "child.txt", parentId: 1 });
    const shared = decorateSharedPaths([
      { ...root, ownerEmail: "owner@example.com" },
      { ...child, ownerEmail: "owner@example.com" },
    ]);

    expect(decorateLocations([root, child])[1].location).toBe("Root");
    expect(shared[1].sharedPathSegments).toEqual(["Shared", "owner@example.com", "Root", "child.txt"]);
    expect(shared[1].desktopPath).toBe("Shared/owner@example.com/Root/child.txt");
  });

  it("normalizes id/path values and compares drive queries", () => {
    expect(normalizeIdList(["1", 1, "2", "x", null])).toEqual([1, 2]);
    expect(normalizePathSegments("Root\\Folder / file.txt")).toEqual(["Root", "Folder", "file.txt"]);
    expect(areDriveQueriesEqual(
      { parentId: null, page: 0, size: 10, sortOption: "updatedAt-desc", searchQuery: "a" },
      { parentId: null, page: "0", size: "10", sortOption: "updatedAt-desc", searchQuery: "a" },
    )).toBe(true);
    expect(areDriveQueriesEqual({ page: 0 }, { page: 1 })).toBe(false);
  });

  it("reuses non-expired asset urls only for the same object revision", () => {
    const previous = {
      id: 10,
      fileSavePath: "objects/a",
      updatedAt: "2026-07-05T00:00:00Z",
      downloadUrl: "old-download",
      thumbnailUrl: "old-thumbnail",
      assetUrlExpiresAt: Date.now() + 60_000,
    };

    const [reused, changed] = reuseCachedAssetUrls([previous], [
      { id: 10, fileSavePath: "objects/a", updatedAt: "2026-07-05T00:00:00Z", downloadUrl: "new-download" },
      { id: 10, fileSavePath: "objects/b", updatedAt: "2026-07-05T00:00:00Z", downloadUrl: "new-object" },
    ]);

    expect(reused.downloadUrl).toBe("old-download");
    expect(reused.thumbnailUrl).toBe("old-thumbnail");
    expect(changed.downloadUrl).toBe("new-object");
  });
});