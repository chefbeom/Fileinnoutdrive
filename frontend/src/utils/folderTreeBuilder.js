import { formatBytes } from "./formatBytes.js";

/**
 * Checks if a given collection of files or emptyDirectories represents a folder upload.
 *
 * @param {File[]} files
 * @param {string[]} [emptyDirectories=[]]
 * @returns {boolean}
 */
export function hasFolderHierarchy(files = [], emptyDirectories = []) {
  if (Array.isArray(emptyDirectories) && emptyDirectories.length > 0) {
    return true;
  }

  return (files || []).some((file) => {
    const path = String(file?.webkitRelativePath || file?.relativePath || "").replace(/\\/g, "/");
    return path.includes("/");
  });
}

/**
 * Resolves a file extension in lowercase.
 *
 * @param {string} fileName
 * @returns {string}
 */
export function getFileExtension(fileName = "") {
  if (typeof fileName !== "string") return "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === fileName.length - 1) return "";
  return fileName.slice(dotIndex + 1).toLowerCase();
}

/**
 * Returns an appropriate FontAwesome icon class and color for a file name.
 *
 * @param {string} fileName
 * @returns {{ icon: string, colorClass: string }}
 */
export function getFileIconMeta(fileName = "") {
  const ext = getFileExtension(fileName);

  const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"];
  const videoExts = ["mp4", "webm", "mkv", "avi", "mov", "wmv"];
  const audioExts = ["mp3", "wav", "ogg", "flac", "m4a", "aac"];
  const codeExts = ["js", "ts", "jsx", "tsx", "vue", "html", "css", "scss", "json", "py", "java", "c", "cpp", "go", "rs", "sql", "sh", "yaml", "yml", "xml"];
  const docExts = ["txt", "md", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv"];
  const zipExts = ["zip", "tar", "gz", "7z", "rar", "bz2", "xz"];

  if (imageExts.includes(ext)) {
    return { icon: "fa-regular fa-file-image", colorClass: "text-emerald-400" };
  }
  if (videoExts.includes(ext)) {
    return { icon: "fa-regular fa-file-video", colorClass: "text-rose-400" };
  }
  if (audioExts.includes(ext)) {
    return { icon: "fa-regular fa-file-audio", colorClass: "text-purple-400" };
  }
  if (codeExts.includes(ext)) {
    return { icon: "fa-regular fa-file-code", colorClass: "text-cyan-400" };
  }
  if (docExts.includes(ext)) {
    return { icon: "fa-regular fa-file-lines", colorClass: "text-blue-400" };
  }
  if (zipExts.includes(ext)) {
    return { icon: "fa-regular fa-file-zipper", colorClass: "text-amber-400" };
  }

  return { icon: "fa-regular fa-file", colorClass: "text-slate-400" };
}

/**
 * Builds a hierarchical tree from a list of files and empty directories.
 *
 * @param {File[]} files
 * @param {string[]} [emptyDirectories=[]]
 * @returns {{
 *   rootNodes: Array,
 *   totalFiles: number,
 *   totalFolders: number,
 *   totalBytes: number,
 *   totalBytesFormatted: string
 * }}
 */
export function buildFolderUploadTree(files = [], emptyDirectories = []) {
  const rootNodes = [];
  const folderMap = new Map(); // path -> folderNode
  let totalFiles = 0;
  let totalBytes = 0;
  const uniqueFolderPaths = new Set();

  function getOrCreateFolder(folderPath) {
    if (!folderPath) return null;
    if (folderMap.has(folderPath)) {
      return folderMap.get(folderPath);
    }

    const segments = folderPath.split("/").filter(Boolean);
    const name = segments[segments.length - 1];
    uniqueFolderPaths.add(folderPath);

    const folderNode = {
      id: `folder:${folderPath}`,
      name,
      type: "folder",
      path: folderPath,
      children: [],
      fileCount: 0,
      totalBytes: 0,
      totalBytesFormatted: "0 B",
      subfolderCount: 0,
      isOpen: true,
    };

    folderMap.set(folderPath, folderNode);

    if (segments.length === 1) {
      rootNodes.push(folderNode);
    } else {
      const parentPath = segments.slice(0, -1).join("/");
      const parentNode = getOrCreateFolder(parentPath);
      if (parentNode) {
        parentNode.children.push(folderNode);
      }
    }

    return folderNode;
  }

  // 1. Process empty directories first to ensure empty folders appear in the tree
  for (const dirPath of emptyDirectories || []) {
    if (!dirPath || typeof dirPath !== "string") continue;
    const cleanPath = dirPath.replace(/\\/g, "/").replace(/\/+$/, "").trim();
    if (cleanPath) {
      getOrCreateFolder(cleanPath);
    }
  }

  // 2. Process all files
  for (const file of files || []) {
    if (!file) continue;
    const rawPath = String(file.webkitRelativePath || file.relativePath || file.name || "unnamed").replace(/\\/g, "/");
    const segments = rawPath.split("/").filter(Boolean);
    const fileName = segments[segments.length - 1];
    const fileSize = Number(file.size || 0);

    totalFiles += 1;
    totalBytes += fileSize;

    const fileNode = {
      id: `file:${rawPath}`,
      name: fileName,
      type: "file",
      path: rawPath,
      size: fileSize,
      sizeFormatted: formatBytes(fileSize),
      file,
      format: getFileExtension(fileName).toUpperCase(),
      iconMeta: getFileIconMeta(fileName),
    };

    if (segments.length > 1) {
      const parentFolderPath = segments.slice(0, -1).join("/");
      const parentFolder = getOrCreateFolder(parentFolderPath);
      if (parentFolder) {
        parentFolder.children.push(fileNode);
      } else {
        rootNodes.push(fileNode);
      }
    } else {
      rootNodes.push(fileNode);
    }
  }

  // 3. Post-process: compute fileCount and totalBytes recursively, and sort children
  function finalizeFolderNode(node) {
    let folderFileCount = 0;
    let folderBytes = 0;
    let subfolderCount = 0;

    for (const child of node.children) {
      if (child.type === "folder") {
        finalizeFolderNode(child);
        folderFileCount += child.fileCount;
        folderBytes += child.totalBytes;
        subfolderCount += 1 + child.subfolderCount;
      } else if (child.type === "file") {
        folderFileCount += 1;
        folderBytes += child.size;
      }
    }

    node.fileCount = folderFileCount;
    node.totalBytes = folderBytes;
    node.totalBytesFormatted = formatBytes(folderBytes);
    node.subfolderCount = subfolderCount;

    // Sort: folders first (alphabetical), then files (alphabetical)
    node.children.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
  }

  for (const rootNode of rootNodes) {
    if (rootNode.type === "folder") {
      finalizeFolderNode(rootNode);
    }
  }

  // Sort top-level nodes as well
  rootNodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });

  return {
    roots: rootNodes,
    rootNodes,
    totalFiles,
    totalFolders: uniqueFolderPaths.size,
    totalBytes,
    totalBytesFormatted: formatBytes(totalBytes),
  };
}
