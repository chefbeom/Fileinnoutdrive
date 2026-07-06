import { describe, expect, it } from "vitest";

import {
  buildFileTableDeleteConfirmMessage,
  buildSelectedIdSet,
  buildVisibleFileIds,
  canDownloadFileTableFile,
  canDropFileTableMove,
  canManageFileTableFolder,
  extractFileTableExtension,
  formatFileTableSize,
  getFileTableDragFileIds,
  getFileTableExtension,
  getFileTableGridClassName,
  getFileTableName,
  getFileTablePreviewUrl,
  getFileTableUpdatedAt,
  hasInlineVideoThumbnail,
  isFileTableMovable,
  isInlineImagePreviewable,
  isInlineVideoPreviewable,
  normalizeMoveFileIds,
  parseFileTableDraggedIds,
  pruneSelectionByVisibleIds,
  toggleAllVisibleFileSelection,
  toggleFileTableSelection,
} from "./fileTableViewModel.js";

describe("fileTableViewModel", () => {
  it("builds visible ids and selection state", () => {
    expect(buildVisibleFileIds([{ id: 1 }, { id: "2" }, {}])).toEqual(["1", "2"]);
    expect(pruneSelectionByVisibleIds(["1", "3"], ["1", "2"])).toEqual(["1"]);
    expect([...buildSelectedIdSet([1, "2"])]).toEqual(["1", "2"]);
    expect(toggleFileTableSelection(["1"], 2, true)).toEqual(["1", "2"]);
    expect(toggleFileTableSelection(["1", "2"], 2, false)).toEqual(["1"]);
    expect(toggleAllVisibleFileSelection(["1", "2"], true)).toEqual(["1", "2"]);
    expect(toggleAllVisibleFileSelection(["1", "2"], false)).toEqual([]);
  });

  it("formats file display fields and action availability", () => {
    const file = {
      id: 1,
      fileOriginName: "Report.PDF",
      sizeBytes: 1536,
      updatedAtLabel: "방금 전",
      downloadUrl: "/download",
    };

    expect(getFileTableName(file)).toBe("Report.PDF");
    expect(extractFileTableExtension("archive.tar.gz")).toBe("gz");
    expect(getFileTableExtension(file)).toBe("pdf");
    expect(formatFileTableSize(file)).toBe("1.50 KB");
    expect(getFileTableUpdatedAt(file)).toBe("방금 전");
    expect(canDownloadFileTableFile(file)).toBe(true);
    expect(canDownloadFileTableFile({ type: "folder", downloadUrl: "/folder" })).toBe(false);
    expect(canManageFileTableFolder({ type: "folder" }, "trash")).toBe(true);
    expect(canManageFileTableFolder({ type: "folder", isTrash: true }, "trash")).toBe(false);
    expect(isFileTableMovable({ isTrash: false }, "trash")).toBe(true);
    expect(isFileTableMovable({ isTrash: false }, "permanent")).toBe(false);
    expect(buildFileTableDeleteConfirmMessage(file, "permanent")).toBe("'Report.PDF' 파일을 영구 삭제하시겠습니까?");
  });

  it("detects inline preview sources", () => {
    expect(getFileTablePreviewUrl({ presignedDownloadUrl: "/preview" })).toBe("/preview");
    expect(isInlineImagePreviewable({
      name: "photo.webp",
      presignedDownloadUrl: "/photo",
    })).toBe(true);
    expect(isInlineVideoPreviewable({
      contentType: "video/mp4",
    })).toBe(true);
    expect(hasInlineVideoThumbnail({
      fileOriginName: "clip.mov",
      thumbnailUrl: "/thumb",
    })).toBe(true);
  });

  it("normalizes drag payloads and grid classes", () => {
    expect(getFileTableDragFileIds({ id: 2 }, ["1", "2"])).toEqual(["1", "2"]);
    expect(getFileTableDragFileIds({ id: 3 }, ["1", "2"])).toEqual(["3"]);
    expect(parseFileTableDraggedIds(JSON.stringify({ fileIds: [1, "2", null] }), [])).toEqual(["1", "2"]);
    expect(parseFileTableDraggedIds("{bad", ["4"])).toEqual([]);
    expect(parseFileTableDraggedIds("", ["4"])).toEqual(["4"]);
    expect(normalizeMoveFileIds([1, "1", 2, null])).toEqual(["1", "2"]);
    expect(canDropFileTableMove([1, 2], 2)).toBe(false);
    expect(canDropFileTableMove([1, 2], 3)).toBe(true);
    expect(getFileTableGridClassName("large")).toBe("grid-cols-1 sm:grid-cols-2 xl:grid-cols-3");
    expect(getFileTableGridClassName("medium")).toBe("grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4");
  });
});
