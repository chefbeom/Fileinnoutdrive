import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from "@/constants/fileTypes.js";
import { formatBytes } from "@/utils/formatBytes.js";
import {
  resolveFilePlaybackUrl,
  resolveFileThumbnailFallbackUrl,
} from "@/utils/fileMediaUrl.js";

const MAX_MANAGED_IMAGE_THUMBNAIL_BYTES = 50 * 1024 * 1024;

export function getCollectionGridClassName(viewMode) {
  if (viewMode === "icon") {
    return "file-icon-grid";
  }

  if (viewMode === "grid") {
    return "file-card-grid";
  }

  return "";
}

export function buildCollectionStyle(viewMode, resolvedColumns, itemSize = "large") {
  if (viewMode === "table") {
    return undefined;
  }

  const baseColumns = Math.max(5, Number(resolvedColumns || 5));
  let columnMultiplier = 1;
  let scaleFactor = 1;

  if (itemSize === "small") {
    columnMultiplier = viewMode === "icon" ? 2.0 : 1.6;
    scaleFactor = 0.58;
  } else if (itemSize === "medium") {
    columnMultiplier = viewMode === "icon" ? 1.4 : 1.2;
    scaleFactor = 0.78;
  } else {
    columnMultiplier = 1;
    scaleFactor = 1.0;
  }

  const columns = Math.max(5, Math.round(baseColumns * columnMultiplier));
  const compactFactor = (viewMode === "grid"
    ? Math.max(0.34, Math.min(1, 6 / Math.max(columns, 5)))
    : Math.max(0.25, Math.min(1, 10 / Math.max(columns, 5)))) * scaleFactor;

  const gapPx = viewMode === "grid"
    ? Math.max(4, Math.min(16, Math.round((20 - (baseColumns - 5) * 0.9) * (itemSize === "large" ? 1 : scaleFactor))))
    : Math.max(3, Math.min(12, Math.round((14 - (baseColumns - 5) * 0.65) * (itemSize === "large" ? 1 : scaleFactor))));

  const cardPreviewHeight = viewMode === "icon"
    ? "auto"
    : `${Math.max(64, Math.round(144 * compactFactor))}px`;
  const previewIconSize = viewMode === "icon"
    ? Math.max(28, Math.round(58 * compactFactor))
    : Math.max(18, Math.round(40 * compactFactor));
  const titleFontSize = viewMode === "icon"
    ? Math.max(12, Math.round(15 * Math.max(0.78, scaleFactor) * 10) / 10)
    : Math.max(11, 15 * compactFactor);

  return {
    "--collection-columns": String(columns),
    "--collection-gap": `${gapPx}px`,
    "--card-padding": `${Math.max(8, Math.round(20 * compactFactor))}px`,
    "--card-preview-height": cardPreviewHeight,
    "--card-preview-icon-size": `${previewIconSize}px`,
    "--card-title-size": `${titleFontSize}px`,
    "--card-meta-size": `${Math.max(9, 12 * compactFactor)}px`,
    "--card-detail-size": `${Math.max(9, 12 * compactFactor)}px`,
    "--card-button-font-size": `${Math.max(9, 12.5 * compactFactor)}px`,
    "--card-button-padding-y": `${Math.max(4, Math.round(8 * compactFactor))}px`,
    "--card-button-padding-x": `${Math.max(6, Math.round(12 * compactFactor))}px`,
    "--card-button-radius": `${Math.max(8, Math.round(14 * compactFactor))}px`,
    "--card-button-min-width": `${Math.max(48, Math.round(90 * compactFactor))}px`,
    "--card-status-font-size": `${Math.max(8.5, 11.5 * compactFactor)}px`,
    "--card-status-padding-y": `${Math.max(3, Math.round(6 * compactFactor))}px`,
    "--card-status-padding-x": `${Math.max(6, Math.round(12 * compactFactor))}px`,
    "--card-status-gap": `${Math.max(3, Math.round(6 * compactFactor))}px`,
    "--card-status-icon-size": `${Math.max(9, Math.round(15 * compactFactor))}px`,
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

export const getCollectionFileName = (file) => file?.name || file?.fileOriginName || "이름 없는 파일";

export const getCollectionFileExtension = (file) =>
  String(file?.extension || file?.fileFormat || extractCollectionExtension(getCollectionFileName(file))).toLowerCase();

export const getCollectionUpdatedAt = (file) =>
  file?.updatedAtLabel || formatCollectionDisplayDate(file?.updatedAt || file?.lastModified || file?.uploadDate);

export const getCollectionSharedOwnerLabel = (file) =>
  file?.ownerName || file?.ownerEmail || "알 수 없는 사용자";

export const getCollectionSharedAtLabel = (file) =>
  file?.sharedAtLabel || formatCollectionDisplayDate(file?.sharedAt);

export const getCollectionSharedOwnerText = (file) =>
  `공유자: ${getCollectionSharedOwnerLabel(file)}`;

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
      ? `공유 대상 ${file.recipientCount}명`
      : "공유 중"
  );

  if (sharedAtLabel && sharedAtLabel !== "-") {
    return `${recipientLabel} | ${sharedAtLabel}`;
  }

  return recipientLabel;
}

export const getCollectionPreviewUrl = (file) => resolveFilePlaybackUrl(file);
export const getCollectionThumbnailUrl = (file) => resolveFileThumbnailFallbackUrl(file);
export const getCollectionContentType = (file) => String(file?.contentType || file?.raw?.contentType || "").toLowerCase();
export const isCollectionLocked = (file) => Boolean(file?.lockedFile);
export const isCollectionSharedFolder = (file) => {
  if (!file || file?.type !== "folder") {
    return false;
  }
  return Boolean(
    file.isSharedFolder ||
    file.sharedFile ||
    file.isShared ||
    file.sharedWithMe ||
    String(file.fileSaveName || "").startsWith("shared-storage-")
  );
};

export function isCollectionManagedThumbnailCandidate(file) {
  if (!file || file?.type === "folder" || isCollectionLocked(file)) {
    return false;
  }

  const extension = getCollectionFileExtension(file);
  const contentType = getCollectionContentType(file);
  const sizeBytes = Number(file?.sizeBytes ?? file?.fileSize ?? 0) || 0;
  const isImageCandidate = contentType.startsWith("image/") || IMAGE_EXTENSIONS.has(extension);
  const isVideoCandidate = contentType.startsWith("video/") || VIDEO_EXTENSIONS.has(extension);

  if (isVideoCandidate) {
    return true;
  }

  if (isImageCandidate) {
    if (sizeBytes > MAX_MANAGED_IMAGE_THUMBNAIL_BYTES) {
      return false;
    }
    return true;
  }

  return false;
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
  const vaultMode = Boolean(options.vaultMode);
  const hiddenContext = Boolean(options.hiddenContext);
  const deleteMode = options.deleteMode || "trash";
  const canCreateShares = Boolean(options.canCreateShares);
  const canCreateLocks = Boolean(options.canCreateLocks);
  const locked = isCollectionLocked(file);
  const sharedWithMe = Boolean(file?.sharedWithMe);
  const isTrash = Boolean(file?.isTrash);
  const isFolder = file?.type === "folder";

  const canDownloadFolder = isFolder && !locked && !isTrash && deleteMode !== "permanent";
  const canDownloadFile = !isFolder && !locked && Boolean(getCollectionPreviewUrl(file) || (sharedWithMe && file?.downloadable));
  const isVaultSpace = Boolean(file?.isVaultSpace || String(file?.spaceType || "").toUpperCase() === "VAULT");
  const isSecretNode = Boolean(file?.hiddenFolder || isVaultSpace);
  const isSharedOut = Boolean(file?.sharedFile || isCollectionSharedFolder(file));

  return {
    canDownload: canDownloadFolder || canDownloadFile,
    canDelete: !sharedLibrary && !sharedWithMe && !locked,
    canRestore: !sharedLibrary && deleteMode === "permanent" && isTrash,
    canManageFolder: !sharedLibrary && deleteMode !== "permanent" && isFolder && !isTrash,
    canConfigureSecret: !sharedLibrary && deleteMode !== "permanent" && isFolder && !isTrash && !sharedWithMe && !isCollectionSharedFolder(file) && !isVaultSpace,
    canMoveToVault: !sharedLibrary && !vaultMode && deleteMode !== "permanent" && !sharedWithMe && !isTrash && !locked && !isVaultSpace && !isSharedOut,
    canMoveFromVault: !sharedLibrary && vaultMode && deleteMode !== "permanent" && !sharedWithMe && !isTrash && !locked && isVaultSpace,
    canShare: !sharedLibrary && !sharedWithMe && !isTrash && !locked && !isSecretNode && (canCreateShares || file?.sharedFile),
    canShareDownloadLink: !sharedLibrary && !sharedWithMe && !isFolder && !isTrash && !locked && !isSecretNode && !vaultMode && !hiddenContext,
    canToggleLock: !sharedLibrary && !sharedWithMe && !isFolder && !isTrash && (canCreateLocks || file?.lockedFile),
    canToggleFavorite: !sharedLibrary && deleteMode !== "permanent" && !sharedWithMe && !isTrash,
    canSaveShared: sharedWithMe && !isFolder && !locked && Boolean(getCollectionPreviewUrl(file) || file?.downloadable),
    canManageSentShare: Boolean(sharedLibrary && file?.sharedFile && !sharedWithMe),
    isMovable: !sharedLibrary && deleteMode !== "permanent" && !sharedWithMe && !isTrash && !locked,
  };
}

export function getCollectionDeleteConfirmMessage(file, deleteMode = "trash") {
  if (isCollectionSharedFolder(file) && !file?.sharedWithMe) {
    return deleteMode === "permanent"
      ? `'${getCollectionFileName(file)}' 공유 폴더를 영구 삭제하시겠습니까?`
      : `'${getCollectionFileName(file)}' 공유 폴더를 삭제하시겠습니까?\n(참여자가 2명 이상인 경우 전원 승인 투표가 진행됩니다.)`;
  }

  if (file?.sharedFile && !file?.sharedWithMe) {
    return "공유한 파일입니다. 삭제하시겠습니까? 공유받은 사람에게도 사라집니다.";
  }

  const targetLabel = file?.type === "folder" ? "폴더" : "파일";
  return deleteMode === "permanent"
    ? `'${getCollectionFileName(file)}' ${targetLabel}을 영구 삭제하시겠습니까?`
    : `'${getCollectionFileName(file)}' ${targetLabel}을 휴지통으로 이동하시겠습니까?`;
}

export function getCollectionStatusChips(file) {
  const chips = [];

  if (file?.favorite || file?.isFavorite) {
    chips.push({ key: "favorite", label: "즐겨찾기", icon: "star", tone: "amber" });
  }

  if (file?.sharedWithMe) {
    chips.push({ key: "shared-with-me", label: "공유받음", icon: "in", tone: "shared-in" });
  }

  if ((file?.sharedFile || isCollectionSharedFolder(file)) && !file?.sharedWithMe) {
    chips.push({
      key: "shared-file",
      label: file?.type === "folder" ? "공유 폴더" : "공유 중",
      icon: "out",
      tone: "shared-out",
    });
  }

  if (file?.lockedFile) {
    chips.push({ key: "locked", label: "잠금", icon: "lock", tone: "locked" });
  }

  if (file?.hiddenFolder) {
    chips.push({ key: "hidden-folder", label: "숨긴 폴더", icon: "hidden", tone: "hidden" });
    if (file?.pinEnabled) {
      chips.push({
        key: "folder-pin",
        label: file?.pinRegistered ? "PIN 잠금" : "PIN 미등록",
        icon: "lock",
        tone: "locked",
      });
    }
  }

  if (!chips.length) {
    chips.push({ key: "normal", label: "일반", icon: "dot", tone: "normal" });
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

export function computeRangeSelectionIds(
  files = [],
  currentSelectedIds = [],
  anchorId = null,
  targetId = null,
  shouldSelect = true,
) {
  const normalizedTargetId = String(targetId ?? "");
  const normalizedCurrent = currentSelectedIds.map((id) => String(id)).filter(Boolean);
  if (!normalizedTargetId) {
    return normalizedCurrent;
  }

  const fileIds = (Array.isArray(files) ? files : [])
    .map((file) => String(file?.id ?? file?.idx ?? ""))
    .filter(Boolean);

  const targetIndex = fileIds.indexOf(normalizedTargetId);
  if (targetIndex < 0) {
    if (shouldSelect) {
      return [...new Set([...normalizedCurrent, normalizedTargetId])];
    }
    return normalizedCurrent.filter((id) => id !== normalizedTargetId);
  }

  const normalizedAnchorId = anchorId != null ? String(anchorId) : "";
  const anchorIndex = normalizedAnchorId ? fileIds.indexOf(normalizedAnchorId) : -1;
  const startIndex = anchorIndex >= 0 ? Math.min(anchorIndex, targetIndex) : targetIndex;
  const endIndex = anchorIndex >= 0 ? Math.max(anchorIndex, targetIndex) : targetIndex;
  const rangeIds = fileIds.slice(startIndex, endIndex + 1);

  if (shouldSelect) {
    return [...new Set([...normalizedCurrent, ...rangeIds])];
  }

  const rangeIdSet = new Set(rangeIds);
  return normalizedCurrent.filter((id) => !rangeIdSet.has(id));
}
