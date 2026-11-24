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
      { parentId: null, page: 0, size: 10, sortOption: "updatedAt-desc", searchQuery: "a", vaultMode: true, includeHidden: true, trashedOnly: false },
      { parentId: null, page: "0", size: "10", sortOption: "updatedAt-desc", searchQuery: "a", vaultMode: true, includeHidden: true, trashedOnly: false },
    )).toBe(true);
    expect(areDriveQueriesEqual({ page: 0, vaultMode: false }, { page: 0, vaultMode: true })).toBe(false);
    expect(areDriveQueriesEqual({ page: 0, includeHidden: false }, { page: 0, includeHidden: true })).toBe(false);
    expect(areDriveQueriesEqual({ page: 0 }, { page: 1 })).toBe(false);
    expect(areDriveQueriesEqual({ page: 0, searchScope: "current" }, { page: 0, searchScope: "root" })).toBe(false);
    expect(areDriveQueriesEqual({ page: 0, searchScope: "root", searchRootFolderId: 1 }, { page: 0, searchScope: "root", searchRootFolderId: 2 })).toBe(false);

    const located = normalizeFileRecord({
      idx: 88,
      fileOriginName: "budget.pdf",
      locationPath: "홈 / Docs / 2026",
    });
    expect(located.location).toBe("홈 / Docs / 2026");
    expect(located.locationPath).toBe("홈 / Docs / 2026");

    const hiddenFolder = normalizeFileRecord({
      idx: 99,
      fileOriginName: "Secret",
      nodeType: "FOLDER",
      spaceType: "VAULT",
      hiddenFolder: true,
      pinEnabled: true,
      pinRegistered: false,
    });
    expect(hiddenFolder).toMatchObject({
      spaceType: "VAULT",
      isVaultSpace: true,
      hiddenFolder: true,
      pinEnabled: true,
      pinRegistered: false,
    });
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

  it("preserves vault encryption metadata and never reuses cached encrypted stream urls", () => {
    const normalized = normalizeFileRecord({
      idx: 55,
      fileOriginName: "vault-movie.mp4",
      spaceType: "VAULT",
      encrypted: true,
      encryptionMode: "SERVER_ENVELOPE_V1",
      presignedDownloadUrl: "/api/file/secret/stream/55?st=fresh-st",
      thumbnailPresignedUrl: "should-be-cleared",
    });

    expect(normalized).toMatchObject({
      id: 55,
      isVaultSpace: true,
      encrypted: true,
      encryptionMode: "SERVER_ENVELOPE_V1",
      downloadUrl: "/api/file/secret/stream/55?st=fresh-st",
      thumbnailUrl: "",
      thumbnailPresignedUrl: "",
    });

    const previousEncrypted = {
      ...normalized,
      downloadUrl: "/api/file/secret/stream/55?st=old-st",
      presignedDownloadUrl: "/api/file/secret/stream/55?st=old-st",
      assetUrlExpiresAt: Date.now() + 60_000,
    };

    const [fresh] = reuseCachedAssetUrls([previousEncrypted], [normalized]);
    expect(fresh.downloadUrl).toBe("/api/file/secret/stream/55?st=fresh-st");
  });
});