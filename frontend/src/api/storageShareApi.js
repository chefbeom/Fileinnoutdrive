import axios from "axios";
import { api } from "@/plugins/axiosinterceptor.js";

const unwrapResult = (response) =>
  response?.data?.result?.body ?? response?.data?.result ?? response?.data;

export const fetchCapacityShareOverview = async () => {
  const response = await api.get("/storage-share/grants/overview");
  return unwrapResult(response);
};

export const createCapacityGrants = async (payload) => {
  const response = await api.post("/storage-share/grants", payload);
  return unwrapResult(response);
};

export const cancelCapacityGrant = async (grantIdx) => {
  const response = await api.post(`/storage-share/grants/${grantIdx}/cancel`);
  return unwrapResult(response);
};

export const fetchSharedStorages = async () => {
  const response = await api.get("/storage-share/spaces");
  return unwrapResult(response);
};

export const createSharedStorage = async (payload) => {
  const response = await api.post("/storage-share/spaces", payload);
  return unwrapResult(response);
};

export const fetchSharedStorageDetail = async (storageIdx, parentIdx = null) => {
  const params = {};
  if (parentIdx !== null && parentIdx !== undefined && Number(parentIdx) > 0) {
    params.parentIdx = Number(parentIdx);
  }
  const response = await api.get(`/storage-share/spaces/${storageIdx}`, { params });
  return unwrapResult(response);
};

export const inviteSharedStorageMembers = async (storageIdx, payload) => {
  const response = await api.post(`/storage-share/spaces/${storageIdx}/invites`, payload);
  return unwrapResult(response);
};

export const respondSharedStorageInvite = async (storageIdx, payload) => {
  const response = await api.post(`/storage-share/spaces/${storageIdx}/invites/respond`, payload);
  return unwrapResult(response);
};

export const updateSharedStorageContribution = async (storageIdx, contributionBytes) => {
  const response = await api.patch(`/storage-share/spaces/${storageIdx}/contribution`, {
    contributionBytes,
  });
  return unwrapResult(response);
};

export const createSharedStorageFolder = async (storageIdx, { parentIdx = null, folderName }) => {
  const response = await api.post(`/storage-share/spaces/${storageIdx}/folders`, {
    parentIdx,
    folderName,
  });
  return unwrapResult(response);
};

export const initSharedStorageUploads = async (storageIdx, items) => {
  const response = await api.post(`/storage-share/spaces/${storageIdx}/uploads/init`, items);
  return unwrapResult(response);
};

export const completeSharedStorageUpload = async (storageIdx, payload) => {
  const response = await api.post(`/storage-share/spaces/${storageIdx}/uploads/complete`, payload);
  return unwrapResult(response);
};

export const fetchSharedStorageDownloadUrl = async (storageIdx, nodeIdx) => {
  const response = await api.get(
    `/storage-share/spaces/${storageIdx}/nodes/${nodeIdx}/download-url`,
  );
  return unwrapResult(response);
};

export const requestSharedStorageApproval = async (storageIdx, payload) => {
  const response = await api.post(`/storage-share/spaces/${storageIdx}/approvals`, payload);
  return unwrapResult(response);
};

export const voteSharedStorageApproval = async (storageIdx, approvalIdx, approve) => {
  const response = await api.post(
    `/storage-share/spaces/${storageIdx}/approvals/${approvalIdx}/vote`,
    { approve: Boolean(approve) },
  );
  return unwrapResult(response);
};

export const restoreSharedStorage = async (storageIdx) => {
  const response = await api.post(`/storage-share/spaces/${storageIdx}/restore`);
  return unwrapResult(response);
};

const extractFormat = (fileName = "") => {
  const idx = String(fileName).lastIndexOf(".");
  if (idx <= 0 || idx >= fileName.length - 1) {
    return "bin";
  }
  return fileName.slice(idx + 1).toLowerCase();
};

export const uploadFilesToSharedStorage = async (
  storageIdx,
  files,
  parentIdx = null,
  onProgress = null,
) => {
  const fileList = Array.from(files || []).filter((f) => f && f.size > 0);
  if (!fileList.length) {
    return [];
  }

  const initPayload = fileList.map((file) => ({
    parentIdx,
    relativePath: file.webkitRelativePath || file.relativePath || "",
    fileOriginName: file.name,
    fileFormat: extractFormat(file.name),
    fileSize: file.size,
  }));

  const chunkItems = await initSharedStorageUploads(storageIdx, initPayload);
  const groupedByFileIndex = new Map();

  let cursor = 0;
  for (let i = 0; i < fileList.length; i++) {
    const firstChunk = chunkItems[cursor];
    if (!firstChunk) break;
    const totalChunks = Number(firstChunk.totalChunks || 1);
    const fileChunks = chunkItems.slice(cursor, cursor + totalChunks);
    groupedByFileIndex.set(i, fileChunks);
    cursor += totalChunks;
  }

  const totalBytes = fileList.reduce((acc, f) => acc + Number(f.size || 0), 0);
  let uploadedBytes = 0;
  const completedNodes = [];

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const chunks = groupedByFileIndex.get(i) || [];
    if (!chunks.length) continue;

    let offset = 0;
    const chunkObjectKeys = [];
    for (const chunkMeta of chunks) {
      const chunkSize = Number(chunkMeta.chunkSize || file.size);
      const blob = file.slice(offset, offset + chunkSize);
      const baseUploaded = uploadedBytes;

      await axios.put(chunkMeta.uploadUrl, blob, {
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        onUploadProgress: (event) => {
          if (typeof onProgress === "function") {
            const loaded = Math.min(chunkSize, Number(event?.loaded || 0));
            const currentTotal = baseUploaded + loaded;
            const percent =
              totalBytes > 0 ? Math.min(100, Math.round((currentTotal * 100) / totalBytes)) : 100;
            onProgress({
              fileName: file.name,
              loadedBytes: currentTotal,
              totalBytes,
              percent,
            });
          }
        },
      });

      uploadedBytes += chunkSize;
      offset += chunkSize;
      if (chunks.length > 1) {
        chunkObjectKeys.push(chunkMeta.uploadObjectKey);
      }
    }

    const first = chunks[0];
    const completed = await completeSharedStorageUpload(storageIdx, {
      parentIdx,
      relativePath: file.webkitRelativePath || file.relativePath || "",
      fileOriginName: file.name,
      fileFormat: first.fileFormat,
      fileSize: file.size,
      finalObjectKey: first.finalObjectKey,
      chunkObjectKeys,
    });
    completedNodes.push(completed);
  }

  return completedNodes;
};
