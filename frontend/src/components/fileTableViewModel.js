export const FILE_TABLE_PARENT_DROP_TARGET_ID = "__parent__";

export const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "svg",
  "webp",
  "bmp",
  "heic",
  "avif",
  "apng",
  "jfif",
  "tif",
  "tiff",
]);

export const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "webm",
  "mov",
  "mkv",
  "avi",
  "wmv",
  "m4v",
  "mpeg",
  "mpg",
  "ogv",
  "3gp",
]);

export function normalizeFileTableId(id) {
  return id == null ? "" : String(id);
}

export function buildVisibleFileIds(files = []) {
  return files
    .map((file) => normalizeFileTableId(file?.id))
    .filter(Boolean);
}

export function pruneSelectionByVisibleIds(selectedIds = [], visibleIds = []) {
  const visibleSet = new Set(visibleIds.map((id) => normalizeFileTableId(id)));
  return selectedIds.filter((id) => visibleSet.has(normalizeFileTableId(id)));
}

export function buildSelectedIdSet(selectedIds = []) {
  return new Set(selectedIds.map((id) => normalizeFileTableId(id)).filter(Boolean));
}

export function toggleFileTableSelection(selectedIds = [], fileId, checked = false) {
  const normalizedId = normalizeFileTableId(fileId);
  if (!normalizedId) return selectedIds;

  const selectedSet = buildSelectedIdSet(selectedIds);
  if (checked) {
    return selectedSet.has(normalizedId) ? selectedIds : [...selectedIds, normalizedId];
  }

  return selectedIds.filter((id) => normalizeFileTableId(id) !== normalizedId);
}

export function toggleAllVisibleFileSelection(visibleIds = [], checked = false) {
  return checked ? [...visibleIds] : [];
}

export function extractFileTableExtension(fileName = "") {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot < 0 || lastDot === fileName.length - 1) {
    return "";
  }

  return fileName.slice(lastDot + 1).trim().toLowerCase();
}

export function formatFileTableDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatFileTableSize(file = {}) {
  if (typeof file?.sizeLabel === "string") return file.sizeLabel;
  if (typeof file?.size === "string") return file.size;

  const bytes = Number(file?.sizeBytes ?? file?.fileSize ?? file?.size ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unitIndex;
  const fractionDigits = unitIndex === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;

  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

export function getFileTableName(file = {}) {
  return file?.name || file?.fileOriginName || "이름 없는 파일";
}

export function getFileTableExtension(file = {}) {
  return (
    file?.extension ||
    file?.fileFormat ||
    extractFileTableExtension(getFileTableName(file))
  ).toLowerCase();
}

export function getFileTableUpdatedAt(file = {}) {
  return (
    file?.updatedAtLabel ||
    file?.date ||
    formatFileTableDate(file?.updatedAt || file?.lastModified || file?.uploadDate)
  );
}

export function canDownloadFileTableFile(file = {}) {
  return file?.type !== "folder" && Boolean(
    file?.downloadUrl ||
    file?.presignedDownloadUrl ||
    (file?.sharedWithMe && file?.downloadable),
  );
}

export function canManageFileTableFolder(file = {}, deleteMode = "trash") {
  return deleteMode !== "permanent" && file?.type === "folder" && !file?.isTrash;
}

export function buildFileTableDeleteConfirmMessage(file = {}, deleteMode = "trash") {
  if (file?.sharedFile && !file?.sharedWithMe) {
    return "공유된 파일입니다 삭제하시겠습니까? 공유된 사람에게도 사라집니다.";
  }

  const targetLabel = file?.type === "folder" ? "폴더" : "파일";
  return deleteMode === "permanent"
    ? `'${getFileTableName(file)}' ${targetLabel}을 영구 삭제하시겠습니까?`
    : `'${getFileTableName(file)}' ${targetLabel}을 휴지통으로 이동하시겠습니까?`;
}

export function isFileTableMovable(file = {}, deleteMode = "trash") {
  return deleteMode !== "permanent" && !file?.isTrash;
}

export const isFileTableFolderDropTarget = canManageFileTableFolder;

export function getFileTablePreviewUrl(file = {}) {
  return file?.downloadUrl || file?.presignedDownloadUrl || "";
}

export const getFileTableContentType = (file = {}) =>
  String(file?.contentType || file?.raw?.contentType || "").toLowerCase();

export const getFileTableVideoThumbnailUrl = (file = {}) =>
  file?.thumbnailUrl || file?.thumbnailPresignedUrl || "";

export function hasFileTablePreviewSource(file = {}) {
  return file?.type !== "folder" && Boolean(getFileTablePreviewUrl(file));
}

export function isInlineImagePreviewable(file = {}) {
  const contentType = getFileTableContentType(file);
  return hasFileTablePreviewSource(file) && (
    contentType.startsWith("image/") ||
    IMAGE_EXTENSIONS.has(getFileTableExtension(file))
  );
}

export function isInlineVideoPreviewable(file = {}) {
  const contentType = getFileTableContentType(file);
  return (
    contentType.startsWith("video/") ||
    VIDEO_EXTENSIONS.has(getFileTableExtension(file))
  );
}

export function hasInlineVideoThumbnail(file = {}) {
  return isInlineVideoPreviewable(file) && Boolean(getFileTableVideoThumbnailUrl(file));
}

export function getFileTableDragFileIds(file = {}, selectedIds = []) {
  const fileId = normalizeFileTableId(file?.id);
  if (!fileId) return [];

  const selectedSet = buildSelectedIdSet(selectedIds);
  return selectedSet.has(fileId) ? [...selectedIds] : [fileId];
}

export function parseFileTableDraggedIds(payload = "", fallbackIds = []) {
  if (payload) {
    try {
      const parsed = JSON.parse(payload);
      if (Array.isArray(parsed?.fileIds)) {
        return parsed.fileIds.map((id) => normalizeFileTableId(id)).filter(Boolean);
      }
    } catch {
      return [];
    }
  }

  return fallbackIds.map((id) => normalizeFileTableId(id)).filter(Boolean);
}

export function normalizeMoveFileIds(fileIds = []) {
  return Array.from(
    new Set((fileIds || []).map((id) => normalizeFileTableId(id)).filter(Boolean)),
  );
}

export function canDropFileTableMove(fileIds = [], targetFolderId = null) {
  const normalizedIds = normalizeMoveFileIds(fileIds);
  const normalizedTargetId = normalizeFileTableId(targetFolderId);
  return normalizedIds.length > 0 && !normalizedIds.includes(normalizedTargetId);
}

export function getFileTableGridClassName(gridSize = "medium") {
  if (gridSize === "large") {
    return "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";
  }

  if (gridSize === "xsmall") {
    return "grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7";
  }

  if (gridSize === "small") {
    return "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5";
  }

  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
}
