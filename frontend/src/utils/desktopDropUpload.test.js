import { describe, expect, it, vi } from "vitest";
import {
  INTERNAL_DRAG_MIME,
  extractDropItems,
  extractFilesFromDataTransfer,
  isDesktopDragEvent,
  readDirectoryEntries,
  traverseFileSystemEntry,
  triggerDesktopUpload,
} from "./desktopDropUpload.js";

describe("desktopDropUpload", () => {
  describe("isDesktopDragEvent", () => {
    it("returns true for external file drag", () => {
      const event = {
        dataTransfer: {
          types: ["Files"],
        },
      };
      expect(isDesktopDragEvent(event)).toBe(true);
    });

    it("returns false for internal fileinnout move drag", () => {
      const event = {
        dataTransfer: {
          types: ["Files", INTERNAL_DRAG_MIME, "text/plain"],
        },
      };
      expect(isDesktopDragEvent(event)).toBe(false);
    });

    it("returns false for plain text or missing types", () => {
      expect(isDesktopDragEvent(null)).toBe(false);
      expect(isDesktopDragEvent({})).toBe(false);
      expect(isDesktopDragEvent({ dataTransfer: { types: ["text/plain"] } })).toBe(false);
    });
  });

  describe("readDirectoryEntries", () => {
    it("reads multiple batches until empty batch is returned", async () => {
      let callCount = 0;
      const batch1 = [{ name: "file1.txt" }, { name: "file2.txt" }];
      const batch2 = [{ name: "file3.txt" }];
      const batch3 = [];

      const mockReader = {
        readEntries: vi.fn((callback) => {
          callCount += 1;
          if (callCount === 1) callback(batch1);
          else if (callCount === 2) callback(batch2);
          else callback(batch3);
        }),
      };

      const result = await readDirectoryEntries(mockReader);
      expect(result).toHaveLength(3);
      expect(result.map((e) => e.name)).toEqual(["file1.txt", "file2.txt", "file3.txt"]);
      expect(mockReader.readEntries).toHaveBeenCalledTimes(3);
    });
  });

  describe("traverseFileSystemEntry", () => {
    it("reads a file entry and sets webkitRelativePath when parentPath is provided", async () => {
      const mockFile = new File(["hello"], "document.txt", { type: "text/plain" });
      const fileEntry = {
        isFile: true,
        isDirectory: false,
        name: "document.txt",
        file: vi.fn((callback) => callback(mockFile)),
      };

      const files = await traverseFileSystemEntry(fileEntry, "folder1/subfolder");
      expect(files).toHaveLength(1);
      expect(files[0].webkitRelativePath).toBe("folder1/subfolder/document.txt");
    });

    it("traverses nested directories and records empty directories", async () => {
      const fileA = new File(["a"], "a.txt", { type: "text/plain" });
      const fileEntryA = {
        isFile: true,
        isDirectory: false,
        name: "a.txt",
        file: vi.fn((callback) => callback(fileA)),
      };

      const emptySubdir = {
        isFile: false,
        isDirectory: true,
        name: "empty_dir",
        createReader: () => ({
          readEntries: (callback) => callback([]),
        }),
      };

      const populatedSubdir = {
        isFile: false,
        isDirectory: true,
        name: "populated_dir",
        createReader: () => {
          let called = false;
          return {
            readEntries: (callback) => {
              if (!called) {
                called = true;
                callback([fileEntryA]);
              } else {
                callback([]);
              }
            },
          };
        },
      };

      const rootDir = {
        isFile: false,
        isDirectory: true,
        name: "root_dir",
        createReader: () => {
          let called = false;
          return {
            readEntries: (callback) => {
              if (!called) {
                called = true;
                callback([emptySubdir, populatedSubdir]);
              } else {
                callback([]);
              }
            },
          };
        },
      };

      const emptyDirs = [];
      const files = await traverseFileSystemEntry(rootDir, "", emptyDirs);

      expect(files).toHaveLength(1);
      expect(files[0].webkitRelativePath).toBe("root_dir/populated_dir/a.txt");
      expect(emptyDirs).toEqual(["root_dir/empty_dir"]);
    });
  });

  describe("extractDropItems", () => {
    it("extracts from items using webkitGetAsEntry", async () => {
      const mockFile = new File(["test"], "test.png", { type: "image/png" });
      const dataTransfer = {
        items: [
          {
            kind: "file",
            webkitGetAsEntry: () => ({
              isFile: true,
              isDirectory: false,
              name: "test.png",
              file: (cb) => cb(mockFile),
            }),
          },
        ],
      };

      const items = await extractDropItems(dataTransfer);
      expect(items.files).toHaveLength(1);
      expect(items.files[0].name).toBe("test.png");
    });

    it("falls back to dataTransfer.files if items are empty", async () => {
      const fallbackFile = new File(["123"], "fallback.txt", { type: "text/plain" });
      const dataTransfer = {
        items: [],
        files: [fallbackFile],
      };

      const files = await extractFilesFromDataTransfer(dataTransfer);
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe("fallback.txt");
    });
  });

  describe("triggerDesktopUpload", () => {
    it("dispatches custom event on window", () => {
      const handler = vi.fn();
      window.addEventListener("start-desktop-upload", handler);

      const files = [new File(["dummy"], "upload.zip")];
      const result = triggerDesktopUpload(files, 50);

      expect(result).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
      const customEvent = handler.mock.calls[0][0];
      expect(customEvent.detail.parentId).toBe(50);
      expect(customEvent.detail.files).toEqual(files);

      window.removeEventListener("start-desktop-upload", handler);
    });

    it("returns false if files and emptyDirs are empty", () => {
      const result = triggerDesktopUpload([], null, []);
      expect(result).toBe(false);
    });
  });
});
