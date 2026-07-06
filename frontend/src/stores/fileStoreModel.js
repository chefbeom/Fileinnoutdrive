import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from "@/constants/fileTypes.js";
import { formatBytes as formatFileSize } from "@/utils/formatBytes.js";

export const ROOT_LOCATION_LABEL = "홈";
const SHARED_LOCATION_LABEL = "공유 문서함";
const PRESIGNED_URL_SAFETY_MARGIN_MS = 30 * 1000;

export const extractFileExtension = (fileName = "") => {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot < 0 || lastDot === fileName.length - 1) {
    return "";
  }

  return fileName.slice(lastDot + 1).trim().toLowerCase();
};

export const parseFileDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatFileDateLabel = (value) => {
  const date = parseFileDate(value);
  if (!date) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const normalizeIdList = (ids) => {
  return Array.from(
    new Set(
      (ids || [])
        .filter((value) => value !== null && value !== undefined && value !== "")
        .map((value) => Number(value))
        .filter(Number.isFinite),
    ),
  );
};

export const normalizePathSegments = (value = "") => String(value || "")
  .replace(/\\/g, "/")
  .split("/")
  .map((segment) => segment.trim())
  .filter(Boolean);

export const normalizeLookupValue = (value = "") => String(value || "").trim().toLocaleLowerCase("ko-KR");

export const areDriveQueriesEqual = (left, right) => {
  if (!left || !right) {
    return false;
  }

  return (
    (left.parentId ?? null) === (right.parentId ?? null) &&
    Number(left.page ?? 0) === Number(right.page ?? 0) &&
    Number(left.size ?? 0) === Number(right.size ?? 0) &&
    String(left.sortOption || "") === String(right.sortOption || "") &&
    String(left.searchQuery || "") === String(right.searchQuery || "") &&
    String(left.extensionFilter || "") === String(right.extensionFilter || "") &&
    String(left.sizeFilter || "") === String(right.sizeFilter || "") &&
    String(left.customMinSize || "") === String(right.customMinSize || "") &&
    String(left.customMaxSize || "") === String(right.customMaxSize || "") &&
    String(left.statusFilter || "") === String(right.statusFilter || "")
  );
};

export const normalizeFileRecord = (rawFile, options = {}) => {
  const name = rawFile?.fileOriginName || rawFile?.name || "이름 없는 파일";
  const nodeType = String(rawFile?.nodeType || rawFile?.type || "FILE").toUpperCase();
  const type = nodeType === "FOLDER" ? "folder" : "file";
  const extension = type === "folder"
    ? ""
    : String(rawFile?.fileFormat || rawFile?.extension || extractFileExtension(name)).toLowerCase();
  const sizeBytes = Number(rawFile?.fileSize ?? rawFile?.sizeBytes ?? rawFile?.size ?? 0) || 0;
  const uploadDate = rawFile?.uploadDate || rawFile?.uploadedAt || rawFile?.createdAt || null;
  const updatedAt = rawFile?.lastModifyDate || rawFile?.updatedAt || rawFile?.lastModified || uploadDate;
  const updatedDate = parseFileDate(updatedAt);
  const uploadedDate = parseFileDate(uploadDate);
  const sharedAt = rawFile?.sharedAt || rawFile?.shareDate || null;
  const sharedWithMe = Boolean(rawFile?.sharedWithMe || options.shared);
  const permission = String(rawFile?.permission || "READ").toUpperCase();
  const readable = Boolean(rawFile?.readable ?? rawFile?.canRead ?? true);
  const downloadable = Boolean(rawFile?.downloadable ?? rawFile?.canDownload ?? (permission === "DOWNLOAD" || permission === "WRITE"));
  const uploadable = Boolean(rawFile?.uploadable ?? rawFile?.canUpload ?? (permission === "UPLOAD" || permission === "WRITE"));
  const writable = Boolean(rawFile?.writable ?? rawFile?.canWrite ?? (permission === "WRITE"));
  const recipients = Array.isArray(rawFile?.recipients)
    ? rawFile.recipients
      .map((recipient) => ({
        recipientName: recipient?.recipientName || "",
        recipientEmail: recipient?.recipientEmail || "",
        permission: String(recipient?.permission || "READ").toUpperCase(),
        sharedAt: recipient?.sharedAt || null,
        status: String(recipient?.status || "").toUpperCase(),
        readable: Boolean(recipient?.readable ?? recipient?.canRead ?? true),
        downloadable: Boolean(recipient?.downloadable ?? recipient?.canDownload ?? false),
        uploadable: Boolean(recipient?.uploadable ?? recipient?.canUpload ?? false),
        writable: Boolean(recipient?.writable ?? recipient?.canWrite ?? false),
        expiresAt: recipient?.expiresAt || null,
        downloadLimit: recipient?.downloadLimit ?? null,
        downloadCount: Number(recipient?.downloadCount ?? 0) || 0,
        expired: Boolean(recipient?.expired),
        downloadLimitReached: Boolean(recipient?.downloadLimitReached),
        passwordProtected: Boolean(recipient?.passwordProtected),
      }))
      .filter((recipient) => recipient.recipientName || recipient.recipientEmail)
    : [];
  const recipientCount = Number(rawFile?.recipientCount ?? recipients.length) || 0;
  const recipientNames = recipients
    .map((recipient) => recipient.recipientName || recipient.recipientEmail)
    .filter(Boolean);
  const shareRecipientsLabel = recipientCount <= 0
    ? ""
    : recipientCount <= 2
      ? `공유 대상: ${recipientNames.join(", ")}`
      : `공유 대상: ${recipientNames.slice(0, 2).join(", ")} 외 ${recipientCount - 2}명`;
  const downloadUrl = rawFile?.presignedDownloadUrl || rawFile?.downloadUrl || "";
  const thumbnailUrl = rawFile?.thumbnailPresignedUrl || rawFile?.thumbnailUrl || "";
  const presignedUrlExpiresIn = Number(rawFile?.presignedUrlExpiresIn ?? 0) || 0;
  const assetUrlExpiresAt = presignedUrlExpiresIn > 0
    ? Date.now() + (presignedUrlExpiresIn * 1000)
    : 0;

  return {
    id: rawFile?.idx ?? rawFile?.id ?? `${name}-${uploadDate || Date.now()}`,
    idx: rawFile?.idx ?? rawFile?.id ?? null,
    name,
    fileOriginName: name,
    extension,
    fileFormat: extension,
    type,
    nodeType,
    sizeBytes,
    sizeLabel: type === "folder" ? "-" : formatFileSize(sizeBytes),
    size: type === "folder" ? "-" : formatFileSize(sizeBytes),
    uploadDate,
    uploadedAt: uploadDate,
    uploadDateLabel: formatFileDateLabel(uploadDate),
    updatedAt,
    updatedAtLabel: formatFileDateLabel(updatedAt),
    lastModified: updatedAt,
    lastModifiedMs: updatedDate?.getTime() ?? 0,
    uploadedAtMs: uploadedDate?.getTime() ?? 0,
    owner: rawFile?.ownerName || rawFile?.owner || "-",
    ownerName: rawFile?.ownerName || rawFile?.owner || "",
    ownerEmail: rawFile?.ownerEmail || "",
    location: sharedWithMe ? SHARED_LOCATION_LABEL : (options.sentShared ? "내가 공유함" : ROOT_LOCATION_LABEL),
    reason:
      rawFile?.reason ||
      (type === "folder" ? "폴더" : `${extension ? extension.toUpperCase() : "FILE"} · ${formatFileSize(sizeBytes)}`),
    isTrash: Boolean(rawFile?.trashed ?? rawFile?.isTrash),
    isShared: Boolean(rawFile?.sharedFile ?? rawFile?.isShared),
    sharedFile: Boolean(rawFile?.sharedFile ?? rawFile?.isShared),
    lockedFile: Boolean(rawFile?.lockedFile),
    parentId: rawFile?.parentId ?? null,
    deletedAt: rawFile?.deletedAt || null,
    downloadUrl,
    presignedDownloadUrl: rawFile?.presignedDownloadUrl || "",
    thumbnailUrl,
    thumbnailPresignedUrl: rawFile?.thumbnailPresignedUrl || "",
    contentType: rawFile?.contentType || rawFile?.mimeType || rawFile?.fileContentType || "",
    fileSaveName: rawFile?.fileSaveName || "",
    fileSavePath: rawFile?.fileSavePath || rawFile?.objectKey || "",
    presignedUrlExpiresIn,
    assetUrlExpiresAt,
    sharedWithMe,
    permission,
    status: String(rawFile?.status || "").toUpperCase(),
    respondedAt: rawFile?.respondedAt || null,
    expiresAt: rawFile?.expiresAt || null,
    downloadLimit: rawFile?.downloadLimit ?? null,
    downloadCount: Number(rawFile?.downloadCount ?? 0) || 0,
    expired: Boolean(rawFile?.expired),
    downloadLimitReached: Boolean(rawFile?.downloadLimitReached),
    passwordProtected: Boolean(rawFile?.passwordProtected),
    readable,
    downloadable,
    uploadable,
    writable,
    sharedAt,
    sharedAtLabel: formatFileDateLabel(sharedAt),
    recipientCount,
    recipients,
    shareRecipientsLabel,
    isImage: IMAGE_EXTENSIONS.has(extension),
    isVideo: VIDEO_EXTENSIONS.has(extension),
    raw: rawFile,
  };
};

export const buildSharedPathSegments = (file, fileById) => {
  const path = [];
  const visited = new Set();
  let cursor = file;

  while (cursor && !visited.has(String(cursor.id))) {
    visited.add(String(cursor.id));
    path.unshift(cursor.name || cursor.fileOriginName || "");
    if (cursor.parentId == null) {
      break;
    }
    cursor = fileById.get(String(cursor.parentId)) || null;
  }

  const owner = file.ownerEmail || file.ownerName || "shared";
  return ["Shared", owner, ...path].filter(Boolean);
};

export const decorateSharedPaths = (files) => {
  const fileById = new Map(files.map((file) => [String(file.id), file]));

  return files.map((file) => {
    const sharedPathSegments = buildSharedPathSegments(file, fileById);
    const sharedPath = sharedPathSegments.join("/");
    return {
      ...file,
      sharedPath,
      sharedPathSegments,
      desktopPath: sharedPath,
    };
  });
};

export const decorateLocations = (files) => {
  const fileById = new Map(files.map((file) => [String(file.id), file]));

  return files.map((file) => ({
    ...file,
    location:
      file.parentId != null
        ? fileById.get(String(file.parentId))?.name || ROOT_LOCATION_LABEL
        : ROOT_LOCATION_LABEL,
  }));
};

export const normalizeBreadcrumbRecord = (rawFolder) => normalizeFileRecord({
  idx: rawFolder?.idx ?? rawFolder?.id ?? null,
  fileOriginName: rawFolder?.fileOriginName || rawFolder?.name || "폴더",
  fileFormat: "folder",
  fileSize: 0,
  nodeType: "FOLDER",
  parentId: rawFolder?.parentId ?? null,
  trashed: false,
});

export const rememberFolderRecords = (currentRecords, nextRecords) => {
  const folderMap = new Map(
    (currentRecords || [])
      .filter((record) => record?.id != null && record?.type === "folder")
      .map((record) => [String(record.id), record]),
  );

  (nextRecords || [])
    .filter((record) => record?.id != null && record?.type === "folder")
    .forEach((record) => {
      folderMap.set(String(record.id), record);
    });

  return [...folderMap.values()];
};

export const reuseCachedAssetUrls = (previousRecords, nextRecords) => {
  const previousById = new Map(
    (previousRecords || [])
      .filter((record) => record?.id != null)
      .map((record) => [String(record.id), record]),
  );

  return (nextRecords || []).map((record) => {
    const previous = previousById.get(String(record?.id));
    const notExpired = Number(previous?.assetUrlExpiresAt || 0) > (Date.now() + PRESIGNED_URL_SAFETY_MARGIN_MS);
    const sameObject = String(previous?.fileSavePath || "") === String(record?.fileSavePath || "");
    const sameRevision = String(previous?.updatedAt || "") === String(record?.updatedAt || "");

    if (!previous || !notExpired || !sameObject || !sameRevision) {
      return record;
    }

    return {
      ...record,
      downloadUrl: previous.downloadUrl || record.downloadUrl,
      presignedDownloadUrl: previous.presignedDownloadUrl || record.presignedDownloadUrl,
      thumbnailUrl: previous.thumbnailUrl || record.thumbnailUrl,
      thumbnailPresignedUrl: previous.thumbnailPresignedUrl || record.thumbnailPresignedUrl,
      presignedUrlExpiresIn: previous.presignedUrlExpiresIn || record.presignedUrlExpiresIn,
      assetUrlExpiresAt: previous.assetUrlExpiresAt || record.assetUrlExpiresAt,
    };
  });
};