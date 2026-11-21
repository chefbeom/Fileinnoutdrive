import { api } from "@/plugins/axiosinterceptor.js";

const normalizeFileFormat = (file) => {
  if (typeof file?.name !== "string") return "bin";

  const lastDot = file.name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot >= file.name.length - 1) {
    return "bin";
  }

  const ext = file.name
    .slice(lastDot + 1)
    .trim()
    .replace(/^\.+/, "")
    .toLowerCase();
  return /^[a-z0-9]{1,20}$/.test(ext) ? ext : "bin";
};

const toUploadRequestList = (files, parentId = null, options = {}) => {
  const vaultMode = Boolean(options?.vaultMode);
  const spaceType = options?.spaceType || (vaultMode ? "VAULT" : undefined);
  return Array.from(files ?? []).map((file) => {
    const fileFormat = normalizeFileFormat(file);
    const payload = {
      fileOriginName: file?.name || "unnamed-file",
      fileFormat,
      fileSize: file?.size ?? 0,
      contentType: file?.type || "application/octet-stream",
      parentId,
      relativePath: file?.webkitRelativePath || file?.name || "unnamed-file",
      lastModified: Number(file?.lastModified ?? 0) || 0,
    };
    if (vaultMode) {
      payload.vaultMode = true;
    }
    if (spaceType) {
      payload.spaceType = spaceType;
    }
    return payload;
  });
};

const extractArrayResult = (responseData) => {
  if (!responseData) return [];
  if (Array.isArray(responseData)) return responseData;
  if (Array.isArray(responseData?.result)) return responseData.result;
  if (Array.isArray(responseData?.data)) return responseData.data;
  if (Array.isArray(responseData?.data?.result)) return responseData.data.result;
  return [];
};

const extractObjectResult = (responseData) => {
  if (!responseData) return null;
  if (responseData?.result && typeof responseData.result === "object") return responseData.result;
  if (responseData?.data?.result && typeof responseData.data.result === "object") return responseData.data.result;
  if (typeof responseData === "object") return responseData;
  return null;
};

export const parseUploadResponse = (responseData) => {
  return extractArrayResult(responseData);
};

const resolveDownloadUrl = (fileOrUrl) => {
  if (typeof fileOrUrl === "string") return fileOrUrl;
  return fileOrUrl?.downloadUrl || fileOrUrl?.presignedDownloadUrl || "";
};

const resolveDownloadFileName = (fileOrUrl, fallbackFileName = "file") => {
  if (typeof fileOrUrl === "string") return fallbackFileName;
  return fileOrUrl?.name || fileOrUrl?.fileOriginName || fallbackFileName;
};

const triggerDirectDownload = (downloadUrl, fileName) => {
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = fileName || "file";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

const resolveDownloadLinkPath = (fileOrUrl) => {
  if (!fileOrUrl || typeof fileOrUrl === "string") return "";

  const fileId = fileOrUrl?.idx ?? fileOrUrl?.id ?? null;
  if (fileId == null) return "";

  if (fileOrUrl?.workspaceId != null) {
    return `/workspace/${fileOrUrl.workspaceId}/assets/${fileId}/download-link`;
  }

  if (fileOrUrl?.sharedWithMe) {
    return `/file/share/shared/${fileId}/download-link`;
  }

  return `/file/${fileId}/download-link`;
};

const extractDownloadLink = (responseData) => {
  const objectResult = extractObjectResult(responseData);
  return objectResult?.downloadUrl || responseData?.downloadUrl || responseData?.result?.downloadUrl || "";
};

export async function downloadFolderZip(folderOrId, fallbackFolderName = "folder") {
  const folderId = typeof folderOrId === "object" ? (folderOrId?.idx ?? folderOrId?.id) : folderOrId;
  const rawName = typeof folderOrId === "object" ? (folderOrId?.name || folderOrId?.fileOriginName || fallbackFolderName) : fallbackFolderName;
  const folderName = (typeof rawName === "string" && rawName.trim()) ? rawName.trim() : fallbackFolderName;
  const zipFileName = folderName.endsWith(".zip") ? folderName : `${folderName}.zip`;

  try {
    const response = await api.get(`/file/${folderId}/download-folder`, {
      responseType: "blob",
      timeout: 300000,
    });

    const blob = new Blob([response.data], { type: "application/zip" });
    const objectUrl = window.URL.createObjectURL(blob);
    triggerDirectDownload(objectUrl, zipFileName);
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);
  } catch (error) {
    if (error?.response?.data instanceof Blob && error.response.data.type?.includes("json")) {
      try {
        const text = await error.response.data.text();
        const json = JSON.parse(text);
        if (json?.message) {
          throw new Error(json.message);
        }
      } catch (parseErr) {
        if (parseErr.message && parseErr !== error) throw parseErr;
      }
    }
    throw error;
  }
}

export async function downloadFileAsset(fileOrUrl, fallbackFileName = "file", options = {}) {
  const isFolder = fileOrUrl?.type === "folder" || fileOrUrl?.nodeType === "FOLDER";
  if (isFolder) {
    return downloadFolderZip(fileOrUrl, fallbackFileName);
  }

  const downloadUrl = resolveDownloadUrl(fileOrUrl);
  const fileName = resolveDownloadFileName(fileOrUrl, fallbackFileName);
  const downloadLinkPath = resolveDownloadLinkPath(fileOrUrl);
  const sharePassword = typeof options?.sharePassword === "string" ? options.sharePassword : "";

  if (!downloadUrl && !downloadLinkPath) {
    throw new Error("\uB2E4\uC6B4\uB85C\uB4DC\uD560 \uD30C\uC77C \uC8FC\uC18C\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }

  if (!downloadLinkPath) {
    triggerDirectDownload(downloadUrl, fileName);
    return;
  }

  const requestConfig = { timeout: 15000 };
  if (sharePassword) {
    requestConfig.headers = { "X-FileInNOut-Share-Password": sharePassword };
  }

  const response = await api.get(downloadLinkPath, requestConfig);
  const attachmentDownloadUrl = extractDownloadLink(response?.data);
  if (!attachmentDownloadUrl) {
    throw new Error("\uB2E4\uC6B4\uB85C\uB4DC \uB9C1\uD06C\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }

  triggerDirectDownload(attachmentDownloadUrl, fileName);
}
export function initUploadFiles(files, parentId = null, options = {}) {
  const fileRequestList = toUploadRequestList(files, parentId, options);
  return api.post("/file/upload", fileRequestList, {
    timeout: 120000,
  });
}

export function uploadFiles(files, parentId = null, options = {}) {
  return initUploadFiles(files, parentId, options);
}

export function completeUpload(payload) {
  return api.post("/file/upload/complete", payload, {
    timeout: 1800000,
  });
}

export function abortUpload(payload) {
  return api.post("/file/upload/abort", payload, {
    timeout: 600000,
  });
}

export async function fetchFileList() {
  const response = await api.get("/file/list");
  return extractArrayResult(response?.data);
}

export async function fetchVaultFileList() {
  const response = await api.get("/file/list/vault");
  return extractArrayResult(response?.data);
}

export async function fetchFileListPage(params = {}, options = {}) {
  const response = await api.get("/file/list/page", {
    params,
    signal: options?.signal,
  });
  return extractObjectResult(response?.data);
}

export async function fetchSharedFileList() {
  const response = await api.get("/file/share/shared/list");
  return extractArrayResult(response?.data);
}

export async function fetchPendingSharedFileList() {
  const response = await api.get("/file/share/shared/pending");
  return extractArrayResult(response?.data);
}

export async function fetchSentSharedFileList() {
  const response = await api.get("/file/share/sent/list");
  return extractArrayResult(response?.data);
}

export async function fetchFileShareInfo(fileId) {
  const response = await api.get(`/file/share/${fileId}`);
  return extractArrayResult(response?.data);
}

export async function createFolder(folderName, parentId = null, options = {}) {
  const payload = {
    folderName,
    parentId,
  };
  if (options && typeof options === "object") {
    if (options.sharedFile !== undefined) {
      payload.sharedFile = Boolean(options.sharedFile);
    }
    if (options.hidden !== undefined) {
      payload.hidden = Boolean(options.hidden);
    }
    if (options.pinEnabled !== undefined) {
      payload.pinEnabled = Boolean(options.pinEnabled);
    }
    if (typeof options.pin === "string" && options.pin.trim()) {
      payload.pin = options.pin.trim();
    }
    if (typeof options.spaceType === "string" && options.spaceType.trim()) {
      payload.spaceType = options.spaceType.trim();
    }
    if (options.vaultMode !== undefined) {
      payload.vaultMode = Boolean(options.vaultMode);
    }
  }
  const response = await api.post("/file/folder", payload);
  return extractObjectResult(response?.data);
}

export async function moveFileToTrash(fileId) {
  const response = await api.patch(`/file/${fileId}/trash`);
  return extractObjectResult(response?.data);
}

export async function restoreFileFromTrash(fileId) {
  const response = await api.patch(`/file/${fileId}/restore`);
  return extractObjectResult(response?.data);
}

export async function restoreFilesFromTrash(fileIdList) {
  const response = await api.patch("/file/restore", {
    fileIdxList: fileIdList,
  });
  return extractObjectResult(response?.data);
}

export async function deleteFilePermanently(fileId) {
  const response = await api.delete(`/file/${fileId}`);
  return extractObjectResult(response?.data);
}

export async function clearTrash(options = {}) {
  const response = await api.delete("/file/trash", {
    params: options?.vaultMode ? { vaultMode: true } : undefined,
  });
  return extractObjectResult(response?.data);
}

export async function moveFileToFolder(fileId, targetParentId) {
  const response = await api.patch(`/file/${fileId}/move`, {
    targetParentId,
  });
  return extractObjectResult(response?.data);
}

export async function moveFilesToFolder(fileIdList, targetParentId) {
  const response = await api.patch("/file/move", {
    fileIdxList: fileIdList,
    targetParentId,
  });
  return extractObjectResult(response?.data);
}

export async function moveFileToVault(fileId, targetParentId = null) {
  const response = await api.patch(`/file/${fileId}/move-to-vault`, {
    targetParentId,
  });
  return extractObjectResult(response?.data);
}

export async function moveFilesToVault(fileIdList, targetParentId = null) {
  const response = await api.patch("/file/move-to-vault", {
    fileIdxList: fileIdList,
    targetParentId,
  });
  return extractObjectResult(response?.data);
}

export async function renameFolder(fileId, fileName) {
  const response = await api.patch(`/file/${fileId}/rename`, {
    fileName,
  });
  return extractObjectResult(response?.data);
}

export async function setLockedFiles(fileIdList, locked) {
  const response = await api.patch("/file/lock", {
    fileIdxList: fileIdList,
    locked,
  });
  return extractObjectResult(response?.data);
}

export async function shareFilesWithUser(fileIdList, recipientEmail, permission = "READ", options = {}) {
  const downloadLimit = Number(options?.downloadLimit || 0);
  const response = await api.post("/file/share", {
    fileIdxList: fileIdList,
    recipientEmail,
    permission,
    expiresAt: options?.expiresAt || null,
    downloadLimit: Number.isFinite(downloadLimit) && downloadLimit > 0 ? downloadLimit : null,
    sharePassword: typeof options?.sharePassword === "string" && options.sharePassword.trim() ? options.sharePassword.trim() : null,
  });
  return extractObjectResult(response?.data);
}
export async function cancelFileShares(fileIdList, recipientEmail) {
  const response = await api.post("/file/share/cancel", {
    fileIdxList: fileIdList,
    recipientEmail,
  });
  return extractObjectResult(response?.data);
}

export async function cancelAllFileShares(fileIdList) {
  const response = await api.post("/file/share/cancel-all", {
    fileIdxList: fileIdList,
  });
  return extractObjectResult(response?.data);
}

export async function acceptSharedFile(fileId) {
  const response = await api.post(`/file/share/shared/${fileId}/accept`);
  return extractObjectResult(response?.data);
}

export async function rejectSharedFile(fileId) {
  const response = await api.post(`/file/share/shared/${fileId}/reject`);
  return extractObjectResult(response?.data);
}

export async function saveSharedFileToDrive(fileId, parentId = null, options = {}) {
  const response = await api.post(`/file/share/shared/${fileId}/save`, {
    parentId,
    sharePassword: typeof options?.sharePassword === "string" ? options.sharePassword : null,
  });
  return extractObjectResult(response?.data);
}
export async function fetchFolderProperties(fileId) {
  const response = await api.get(`/file/${fileId}/properties`);
  return extractObjectResult(response?.data);
}

export async function fetchStorageSummary() {
  const response = await api.get("/file/storage/summary");
  return extractObjectResult(response?.data);
}

export async function fetchTextPreview(fileId) {
  const response = await api.get(`/file/${fileId}/text-preview`);
  return extractObjectResult(response?.data);
}

export async function fetchSharedTextPreview(fileId, options = {}) {
  const sharePassword = typeof options?.sharePassword === "string" ? options.sharePassword : "";
  const config = sharePassword ? { headers: { "X-FileInNOut-Share-Password": sharePassword } } : undefined;
  const response = await api.get(`/file/share/shared/${fileId}/text-preview`, config);
  return extractObjectResult(response?.data);
}
export async function fetchFileVersions(fileId) {
  const response = await api.get(`/file/${fileId}/versions`);
  return extractArrayResult(response?.data);
}

export async function restoreFileVersion(fileId, versionId) {
  const response = await api.post(`/file/${fileId}/versions/${versionId}/restore`);
  return extractObjectResult(response?.data);
}
export async function fetchFileThumbnailBlob(fileId, version = "", options = {}) {
  const response = await api.get(`/file/${fileId}/thumbnail`, {
    params: version ? { v: version } : undefined,
    responseType: "blob",
    timeout: options?.timeout ?? 8000,
    signal: options?.signal,
  });

  if (response?.status === 204) {
    return null;
  }

  return response?.data instanceof Blob && response.data.size > 0
    ? response.data
    : null;
}

export async function fetchSharedFileThumbnailBlob(fileId, version = "", options = {}) {
  const response = await api.get(`/file/share/shared/${fileId}/thumbnail`, {
    params: version ? { v: version } : undefined,
    responseType: "blob",
    timeout: options?.timeout ?? 8000,
    signal: options?.signal,
  });

  if (response?.status === 204) {
    return null;
  }

  return response?.data instanceof Blob && response.data.size > 0
    ? response.data
    : null;
}

export async function fetchVaultStatus() {
  const response = await api.get("/file/secret/vault/status");
  return extractObjectResult(response?.data);
}

export async function registerVaultPin(pin) {
  const response = await api.post("/file/secret/vault/pin/register", { pin });
  return extractObjectResult(response?.data);
}

export async function unlockVaultWithPin(pin) {
  const response = await api.post("/file/secret/vault/unlock", { pin });
  return extractObjectResult(response?.data);
}

export async function lockVaultSession() {
  const response = await api.post("/file/secret/vault/lock");
  return extractObjectResult(response?.data);
}

export async function changeVaultPin(currentPin, newPin) {
  const response = await api.put("/file/secret/vault/pin", { currentPin, newPin });
  return extractObjectResult(response?.data);
}

export async function fetchHiddenFolderStatus(folderId) {
  const response = await api.get(`/file/secret/folder/${folderId}/status`);
  return extractObjectResult(response?.data);
}

export async function unlockHiddenFolder(folderId, pin) {
  const response = await api.post(`/file/secret/folder/${folderId}/unlock`, { pin });
  return extractObjectResult(response?.data);
}

export async function lockHiddenFolderSession(folderId) {
  const response = await api.post(`/file/secret/folder/${folderId}/lock`);
  return extractObjectResult(response?.data);
}

export async function configureHiddenFolder(folderId, config = {}) {
  const response = await api.patch(`/file/secret/folder/${folderId}/config`, {
    hidden: config.hidden,
    pinEnabled: config.pinEnabled,
    pin: config.pin || null,
    currentPin: config.currentPin || null,
  });
  return extractObjectResult(response?.data);
}

export async function createDownloadShareLink(fileIdx, config = {}) {
  const payload = {};
  if (config.expiresInMinutes != null) {
    payload.expiresInMinutes = Number(config.expiresInMinutes);
  }
  if (config.expiresAt) {
    payload.expiresAt = config.expiresAt;
  }
  if (config.maxDownloads !== undefined) {
    payload.maxDownloads = config.maxDownloads === null ? null : Number(config.maxDownloads);
  }
  if (config.password) {
    payload.password = String(config.password);
  }
  const response = await api.post(`/file/share-links/files/${fileIdx}`, payload);
  return extractObjectResult(response?.data);
}

export async function fetchFileDownloadShareLinks(fileIdx) {
  const response = await api.get(`/file/share-links/files/${fileIdx}`);
  return Array.isArray(response?.data?.result) ? response.data.result : [];
}

export async function fetchMyDownloadShareLinks() {
  const response = await api.get("/file/share-links/mine");
  return Array.isArray(response?.data?.result) ? response.data.result : [];
}

export async function revokeDownloadShareLink(linkIdx) {
  const response = await api.delete(`/file/share-links/${linkIdx}`);
  return extractObjectResult(response?.data);
}
