import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from "@/constants/fileTypes.js";
import { formatBytes } from "@/utils/formatBytes.js";

export function getCollectionGridClassName(viewMode) {
  if (viewMode === "icon") {
    return "file-icon-grid";
  }

  if (viewMode === "grid") {
    return "file-card-grid";
  }

  return "";
}

export function buildCollectionStyle(viewMode, resolvedColumns) {
  if (viewMode === "table") {
    return undefined;
  }

  const columns = Math.max(5, Number(resolvedColumns || 5));
  const compactFactor = viewMode === "grid"
    ? Math.max(0.34, Math.min(1, 6 / Math.max(columns, 5)))
    : Math.max(0.3, Math.min(1, 10 / Math.max(columns, 5)));
  const gapPx = viewMode === "grid"
    ? Math.max(4, Math.min(16, Math.round(20 - (columns - 5) * 0.9)))
    : Math.max(3, Math.min(12, Math.round(14 - (columns - 5) * 0.65)));

  return {
    "--collection-columns": String(columns),
    "--collection-gap": `${gapPx}px`,
    "--card-padding": `${Math.max(10, Math.round(20 * compactFactor))}px`,
    "--card-preview-height": `${Math.max(76, Math.round(144 * compactFactor))}px`,
    "--card-preview-icon-size": `${Math.max(22, Math.round(40 * compactFactor))}px`,
    "--card-title-size": `${Math.max(11, 15 * compactFactor)}px`,
    "--card-meta-size": `${Math.max(9.5, 12 * compactFactor)}px`,
    "--card-detail-size": `${Math.max(9.5, 12 * compactFactor)}px`,
    "--card-button-font-size": `${Math.max(9.5, 12.5 * compactFactor)}px`,
    "--card-button-padding-y": `${Math.max(5, Math.round(8 * compactFactor))}px`,
    "--card-button-padding-x": `${Math.max(7, Math.round(12 * compactFactor))}px`,
    "--card-button-radius": `${Math.max(10, Math.round(14 * compactFactor))}px`,
    "--card-button-min-width": `${Math.max(56, Math.round(90 * compactFactor))}px`,
    "--card-status-font-size": `${Math.max(9, 11.5 * compactFactor)}px`,
    "--card-status-padding-y": `${Math.max(4, Math.round(6 * compactFactor))}px`,
    "--card-status-padding-x": `${Math.max(7, Math.round(12 * compactFactor))}px`,
    "--card-status-gap": `${Math.max(4, Math.round(6 * compactFactor))}px`,
    "--card-status-icon-size": `${Math.max(10, Math.round(15 * compactFactor))}px`,
  };
}

export function extractCollectionExtension(fileName = "") {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot < 0 || lastDot === fileName.length - 1) {
    return "";
  }

  return fileName.slice(lastDot + 1).trim().toLowerCase();
}

export function formatCollectionDisplayDate(value) {
  if (!value) {
    return "-";
  }

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

export function formatCollectionDisplaySize(file) {
  if (typeof file?.sizeLabel === "string") {
    return file.sizeLabel;
  }
  if (typeof file?.size === "string") {
    return file.size;
  }

  const bytes = Number(file?.sizeBytes ?? file?.fileSize ?? file?.size ?? 0);
  return formatBytes(bytes);
}

export const getCollectionFileName = (file) => file?.name || file?.fileOriginName || "\uC774\uB984 \uC5C6\uB294 \uD30C\uC77C";

export const getCollectionFileExtension = (file) =>
  String(file?.extension || file?.fileFormat || extractCollectionExtension(getCollectionFileName(file))).toLowerCase();

export const getCollectionUpdatedAt = (file) =>
  file?.updatedAtLabel || formatCollectionDisplayDate(file?.updatedAt || file?.lastModified || file?.uploadDate);

export const getCollectionSharedOwnerLabel = (file) =>
  file?.ownerName || file?.ownerEmail || "\uC54C \uC218 \uC5C6\uB294 \uC0AC\uC6A9\uC790";

export const getCollectionSharedAtLabel = (file) =>
  file?.sharedAtLabel || formatCollectionDisplayDate(file?.sharedAt);

export const getCollectionSharedOwnerText = (file) =>
  `\uACF5\uC720\uC790: ${getCollectionSharedOwnerLabel(file)}`;

export function getCollectionSharedSourceLabel(file) {
  const sharedAtLabel = getCollectionSharedAtLabel(file);

  if (sharedAtLabel && sharedAtLabel !== "-") {
    return `${getCollectionSharedOwnerText(file)} | ${sharedAtLabel}`;
  }

  return getCollectionSharedOwnerText(file);
}

export function getCollectionSentShareLabel(file) {
  const sharedAtLabel = getCollectionSharedAtLabel(file);
  const recipientLabel = file?.shareRecipientsLabel || (
    file?.recipientCount
      ? `\uACF5\uC720 \uB300\uC0C1 ${file.recipientCount}\uBA85`
      : "\uACF5\uC720 \uC911"
  );

  if (sharedAtLabel && sharedAtLabel !== "-") {
    return `${recipientLabel} | ${sharedAtLabel}`;
  }

  return recipientLabel;
}

export const getCollectionPreviewUrl = (file) => file?.downloadUrl || file?.presignedDownloadUrl || "";
export const getCollectionThumbnailUrl = (file) => file?.thumbnailUrl || file?.thumbnailPresignedUrl || "";
export const getCollectionContentType = (file) => String(file?.contentType || file?.raw?.contentType || "").toLowerCase();
export const isCollectionLocked = (file) => Boolean(file?.lockedFile);

export function isCollectionManagedThumbnailCandidate(file) {
  if (!file || file?.type === "folder" || isCollectionLocked(file)) {
    return false;
  }

  const extension = getCollectionFileExtension(file);
  const contentType = getCollectionContentType(file);
  return (
    contentType.startsWith("image/") ||
    contentType.startsWith("video/") ||
    IMAGE_EXTENSIONS.has(extension) ||
    VIDEO_EXTENSIONS.has(extension)
  );
}

export function isCollectionImage(file, hasBrokenPreview = false) {
  const contentType = getCollectionContentType(file);
  return file?.type !== "folder" && !hasBrokenPreview && (
    contentType.startsWith("image/") || IMAGE_EXTENSIONS.has(getCollectionFileExtension(file))
  );
}

export function isCollectionVideo(file) {
  const contentType = getCollectionContentType(file);
  return file?.type !== "folder" && (
    contentType.startsWith("video/") || VIDEO_EXTENSIONS.has(getCollectionFileExtension(file))
  );
}

export function getCollectionActionAvailability(file, options = {}) {
  const sharedLibrary = Boolean(options.sharedLibrary);
  const deleteMode = options.deleteMode || "trash";
  const canCreateShares = Boolean(options.canCreateShares);
  const canCreateLocks = Boolean(options.canCreateLocks);
  const locked = isCollectionLocked(file);
  const sharedWithMe = Boolean(file?.sharedWithMe);
  const isTrash = Boolean(file?.isTrash);
  const isFolder = file?.type === "folder";

  return {
    canDownload: !isFolder && !locked && Boolean(getCollectionPreviewUrl(file) || (sharedWithMe && file?.downloadable)),
    canDelete: !sharedLibrary && !sharedWithMe && !locked,
    canRestore: !sharedLibrary && deleteMode === "permanent" && isTrash,
    canManageFolder: !sharedLibrary && deleteMode !== "permanent" && isFolder && !isTrash,
    canShare: !sharedLibrary && !sharedWithMe && !isTrash && !locked && (canCreateShares || file?.sharedFile),
    canToggleLock: !sharedLibrary && !sharedWithMe && !isFolder && !isTrash && (canCreateLocks || file?.lockedFile),
    canSaveShared: sharedWithMe && !isFolder && !locked && Boolean(getCollectionPreviewUrl(file) || file?.downloadable),
    canManageSentShare: Boolean(sharedLibrary && file?.sharedFile && !sharedWithMe),
    isMovable: !sharedLibrary && deleteMode !== "permanent" && !sharedWithMe && !isTrash && !locked,
  };
}

export function getCollectionDeleteConfirmMessage(file, deleteMode = "trash") {
  if (file?.sharedFile && !file?.sharedWithMe) {
    return "\uACF5\uC720\uD55C \uD30C\uC77C\uC785\uB2C8\uB2E4. \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C? \uACF5\uC720\uBC1B\uC740 \uC0AC\uB78C\uC5D0\uAC8C\uB3C4 \uC0AC\uB77C\uC9D1\uB2C8\uB2E4.";
  }

  const targetLabel = file?.type === "folder" ? "\uD3F4\uB354" : "\uD30C\uC77C";
  return deleteMode === "permanent"
    ? `'${getCollectionFileName(file)}' ${targetLabel}\uC744 \uC601\uAD6C \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?`
    : `'${getCollectionFileName(file)}' ${targetLabel}\uC744 \uD734\uC9C0\uD1B5\uC73C\uB85C \uC774\uB3D9\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?`;
}

export function getCollectionStatusChips(file) {
  const chips = [];

  if (file?.sharedWithMe) {
    chips.push({ key: "shared-with-me", label: "\uACF5\uC720\uBC1B\uC74C", icon: "in", tone: "shared-in" });
  }

  if (file?.sharedFile && !file?.sharedWithMe) {
    chips.push({ key: "shared-file", label: "\uACF5\uC720 \uC911", icon: "out", tone: "shared-out" });
  }

  if (file?.lockedFile) {
    chips.push({ key: "locked", label: "\uC7A0\uAE08", icon: "lock", tone: "locked" });
  }

  if (!chips.length) {
    chips.push({ key: "normal", label: "\uC77C\uBC18", icon: "dot", tone: "normal" });
  }

  return chips;
}

export function getCollectionDragFileIds(file, selectedIds = []) {
  const fileId = String(file?.id || "");
  if (!fileId) {
    return [];
  }

  const normalizedSelectedIds = selectedIds
    .map((id) => String(id))
    .filter(Boolean);

  if (normalizedSelectedIds.length > 0) {
    return normalizedSelectedIds;
  }

  return [fileId];
}

export function readCollectionDraggedFileIds(payload, fallbackIds = []) {
  if (!payload) {
    return [...fallbackIds];
  }

  try {
    const parsed = JSON.parse(payload);
    if (Array.isArray(parsed?.fileIds)) {
      return parsed.fileIds.map((id) => String(id));
    }
  } catch {
    return [...fallbackIds];
  }

  return [...fallbackIds];
}
