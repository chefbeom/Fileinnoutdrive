import { describe, expect, it } from "vitest";

import {
  buildCollectionStyle,
  extractCollectionExtension,
  formatCollectionDisplaySize,
  getCollectionActionAvailability,
  getCollectionDragFileIds,
  getCollectionFileExtension,
  getCollectionFileName,
  getCollectionGridClassName,
  getCollectionSentShareLabel,
  getCollectionSharedSourceLabel,
  getCollectionStatusChips,
  isCollectionImage,
  isCollectionManagedThumbnailCandidate,
  isCollectionVideo,
  readCollectionDraggedFileIds,
} from "./fileCollectionViewModel.js";

describe("fileCollectionViewModel", () => {
  it("formats collection layout and file metadata", () => {
    expect(getCollectionGridClassName("icon")).toBe("file-icon-grid");
    expect(getCollectionGridClassName("grid")).toBe("file-card-grid");
    expect(getCollectionGridClassName("table")).toBe("");
    expect(buildCollectionStyle("table", 8)).toBeUndefined();
    expect(buildCollectionStyle("grid", 8)).toMatchObject({
      "--collection-columns": "8",
      "--collection-gap": "16px",
    });

    expect(extractCollectionExtension("Report.PDF")).toBe("pdf");
    expect(extractCollectionExtension("no-extension")).toBe("");
    expect(getCollectionFileName({ fileOriginName: "origin.txt" })).toBe("origin.txt");
    expect(getCollectionFileExtension({ name: "image.PNG" })).toBe("png");
    expect(formatCollectionDisplaySize({ fileSize: 1536 })).toBe("1.50 KB");
  });

  it("builds shared labels and status chips", () => {
    expect(getCollectionSharedSourceLabel({ ownerEmail: "owner@example.com", sharedAtLabel: "2026-07-05" }))
      .toBe("\uACF5\uC720\uC790: owner@example.com | 2026-07-05");
    expect(getCollectionSentShareLabel({ recipientCount: 2, sharedAtLabel: "2026-07-05" }))
      .toBe("\uACF5\uC720 \uB300\uC0C1 2\uBA85 | 2026-07-05");
    expect(getCollectionStatusChips({ sharedWithMe: true, lockedFile: true }).map((chip) => chip.key))
      .toEqual(["shared-with-me", "locked"]);
    expect(getCollectionStatusChips({}).map((chip) => chip.key)).toEqual(["normal"]);
  });

  it("classifies media and action availability", () => {
    expect(isCollectionImage({ type: "file", contentType: "image/png" })).toBe(true);
    expect(isCollectionImage({ type: "file", contentType: "image/png" }, true)).toBe(false);
    expect(isCollectionVideo({ type: "file", name: "clip.mp4" })).toBe(true);
    expect(isCollectionManagedThumbnailCandidate({ type: "file", name: "clip.mp4" })).toBe(true);
    expect(isCollectionManagedThumbnailCandidate({ type: "folder", name: "clip.mp4" })).toBe(false);

    expect(getCollectionActionAvailability({ type: "file", downloadUrl: "/d" }, {
      canCreateShares: true,
      canCreateLocks: true,
    })).toMatchObject({
      canDownload: true,
      canDelete: true,
      canShare: true,
      canToggleLock: true,
      isMovable: true,
    });
    expect(getCollectionActionAvailability({ type: "file", sharedWithMe: true, downloadable: true })).toMatchObject({
      canDownload: true,
      canDelete: false,
      canSaveShared: true,
      isMovable: false,
    });
  });

  it("normalizes drag payloads", () => {
    expect(getCollectionDragFileIds({ id: 7 }, [])).toEqual(["7"]);
    expect(getCollectionDragFileIds({ id: 7 }, [1, "2"])).toEqual(["1", "2"]);
    expect(readCollectionDraggedFileIds('{"fileIds":[1,"2"]}', [])).toEqual(["1", "2"]);
    expect(readCollectionDraggedFileIds("not-json", ["fallback"])).toEqual(["fallback"]);
  });
});
