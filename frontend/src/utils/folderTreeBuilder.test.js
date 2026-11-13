import { describe, expect, it } from "vitest";
import {
  buildFolderUploadTree,
  getFileExtension,
  getFileIconMeta,
  hasFolderHierarchy,
} from "./folderTreeBuilder.js";

describe("folderTreeBuilder", () => {
  describe("hasFolderHierarchy", () => {
    it("returns false for flat file list without empty dirs", () => {
      const files = [
        { name: "test.png", webkitRelativePath: "" },
        { name: "readme.txt" },
      ];
      expect(hasFolderHierarchy(files)).toBe(false);
    });

    it("returns true if any file has relative path with slashes", () => {
      const files = [
        { name: "file.txt", webkitRelativePath: "my-folder/sub/file.txt" },
      ];
      expect(hasFolderHierarchy(files)).toBe(true);
    });

    it("returns true if emptyDirectories has items", () => {
      expect(hasFolderHierarchy([], ["empty-folder"])).toBe(true);
    });
  });

  describe("getFileExtension & getFileIconMeta", () => {
    it("extracts file extension", () => {
      expect(getFileExtension("photo.PNG")).toBe("png");
      expect(getFileExtension("archive.tar.gz")).toBe("gz");
      expect(getFileExtension("noextension")).toBe("");
    });

    it("provides icon meta by file type", () => {
      expect(getFileIconMeta("image.png").icon).toContain("file-image");
      expect(getFileIconMeta("script.js").icon).toContain("file-code");
      expect(getFileIconMeta("document.pdf").icon).toContain("file-lines");
      expect(getFileIconMeta("archive.zip").icon).toContain("file-zipper");
      expect(getFileIconMeta("video.mp4").icon).toContain("file-video");
    });
  });

  describe("buildFolderUploadTree", () => {
    it("builds a multi-level hierarchical tree structure with file stats", () => {
      const files = [
        {
          name: "index.js",
          size: 1000,
          webkitRelativePath: "project/src/index.js",
        },
        {
          name: "math.js",
          size: 2000,
          webkitRelativePath: "project/src/utils/math.js",
        },
        {
          name: "readme.md",
          size: 500,
          webkitRelativePath: "project/readme.md",
        },
      ];
      const emptyDirs = ["project/assets/empty"];

      const tree = buildFolderUploadTree(files, emptyDirs);

      expect(tree.totalFiles).toBe(3);
      expect(tree.totalFolders).toBe(5); // project, project/src, project/src/utils, project/assets, project/assets/empty
      expect(tree.totalBytes).toBe(3500);

      // Top level
      expect(tree.rootNodes).toHaveLength(1);
      const root = tree.rootNodes[0];
      expect(root.name).toBe("project");
      expect(root.type).toBe("folder");
      expect(root.fileCount).toBe(3);
      expect(root.totalBytes).toBe(3500);

      // Children of project: folders (assets, src) first, then file (readme.md)
      expect(root.children.map((c) => c.name)).toEqual(["assets", "src", "readme.md"]);

      // src folder
      const srcNode = root.children.find((c) => c.name === "src");
      expect(srcNode.fileCount).toBe(2);
      expect(srcNode.totalBytes).toBe(3000);
      expect(srcNode.children.map((c) => c.name)).toEqual(["utils", "index.js"]);

      // utils folder
      const utilsNode = srcNode.children.find((c) => c.name === "utils");
      expect(utilsNode.fileCount).toBe(1);
      expect(utilsNode.children[0].name).toBe("math.js");
      expect(utilsNode.children[0].type).toBe("file");
      expect(utilsNode.children[0].size).toBe(2000);
    });
  });
});
