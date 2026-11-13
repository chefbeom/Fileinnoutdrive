export const INTERNAL_DRAG_MIME = "application/x-fileinnout-move";

export function isDesktopDragEvent(event) {
  if (!event || !event.dataTransfer) {
    return false;
  }

  const types = Array.from(event.dataTransfer.types || []);
  return types.includes("Files") && !types.includes(INTERNAL_DRAG_MIME);
}

export function readDirectoryEntries(dirReader) {
  return new Promise((resolve, reject) => {
    const entries = [];

    function readBatch() {
      dirReader.readEntries((batch) => {
        if (!batch || batch.length === 0) {
          resolve(entries);
        } else {
          entries.push(...batch);
          readBatch();
        }
      }, reject);
    }

    readBatch();
  });
}

export async function traverseFileSystemEntry(entry, parentPath = "", emptyDirs = []) {
  if (!entry) {
    return [];
  }

  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => {
      entry.file(resolve, reject);
    });

    if (parentPath) {
      const relativePath = `${parentPath}/${entry.name}`;
      try {
        Object.defineProperty(file, "webkitRelativePath", {
          value: relativePath,
          writable: true,
          configurable: true,
        });
      } catch {
        // Ignore if property cannot be modified
      }
    }

    return [file];
  }

  if (entry.isDirectory) {
    const dirPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    const reader = typeof entry.createReader === "function" ? entry.createReader() : null;

    if (!reader) {
      return [];
    }

    const children = await readDirectoryEntries(reader);
    if (children.length === 0) {
      emptyDirs.push(dirPath);
      return [];
    }

    const childResults = await Promise.all(
      children.map((child) => traverseFileSystemEntry(child, dirPath, emptyDirs)),
    );

    return childResults.flat();
  }

  return [];
}

export async function extractFilesFromDataTransfer(dataTransfer) {
  const result = await extractDropItems(dataTransfer);
  return result.files;
}

export async function extractDropItems(dataTransfer) {
  if (!dataTransfer) {
    return { files: [], emptyDirectories: [] };
  }

  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
  const entries = [];
  const directFiles = [];
  const emptyDirectories = [];

  for (const item of items) {
    if (item?.kind === "file") {
      const entry = typeof item.webkitGetAsEntry === "function"
        ? item.webkitGetAsEntry()
        : (typeof item.getAsEntry === "function" ? item.getAsEntry() : null);

      if (entry) {
        entries.push(entry);
      } else {
        const file = typeof item.getAsFile === "function" ? item.getAsFile() : null;
        if (file) {
          directFiles.push(file);
        }
      }
    }
  }

  if (entries.length > 0) {
    const nestedFiles = await Promise.all(
      entries.map((entry) => traverseFileSystemEntry(entry, "", emptyDirectories)),
    );
    const allFiles = [...directFiles, ...nestedFiles.flat()];
    return {
      files: allFiles,
      emptyDirectories,
    };
  }

  if (dataTransfer.files && dataTransfer.files.length > 0) {
    return {
      files: Array.from(dataTransfer.files),
      emptyDirectories: [],
    };
  }

  return {
    files: directFiles,
    emptyDirectories,
  };
}

export function triggerDesktopUpload(files, parentId = null, emptyDirectories = []) {
  const normalizedFiles = Array.isArray(files) ? files : Array.from(files || []);
  const normalizedEmptyDirs = Array.isArray(emptyDirectories) ? emptyDirectories : [];

  if (normalizedFiles.length === 0 && normalizedEmptyDirs.length === 0) {
    return false;
  }

  window.dispatchEvent(
    new CustomEvent("start-desktop-upload", {
      detail: {
        files: normalizedFiles,
        parentId,
        emptyDirectories: normalizedEmptyDirs,
      },
    }),
  );
  return true;
}
