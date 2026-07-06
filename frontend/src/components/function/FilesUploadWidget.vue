<template>
  <div class="upload-widget">
    <button type="button" class="upload-trigger" @click="toggleDropdown">
      <i class="fa-solid fa-plus"></i>
      <span>업로드 / 폴더 만들기</span>
      <span v-if="activeCount > 0" class="upload-trigger__count">{{ activeCount }}</span>
    </button>

    <div v-if="isDropdownOpen" class="upload-dropdown">
      <button type="button" class="upload-dropdown__item" @click="createNewFolder">
        <i class="fa-regular fa-folder-open"></i>
        <span>새 폴더 만들기</span>
      </button>

      <label class="upload-dropdown__item">
        <i class="fa-solid fa-file-arrow-up"></i>
        <span>파일 업로드</span>
        <input type="file" hidden multiple :disabled="isUploading" @change="handleFileChange" />
      </label>

      <label class="upload-dropdown__item">
        <i class="fa-solid fa-folder-plus"></i>
        <span>폴더 업로드</span>
        <input
          type="file"
          hidden
          webkitdirectory
          directory
          multiple
          :disabled="isUploading"
          @change="handleFolderChange"
        />
      </label>

      <div class="upload-dropdown__footer">
        <label class="upload-dropdown__label" for="upload-concurrency">동시 업로드 수</label>
        <select
          id="upload-concurrency"
          v-model.number="uploadConcurrency"
          class="upload-dropdown__select"
          :disabled="isUploading"
        >
          <option v-for="count in uploadConcurrencyOptions" :key="count" :value="count">
            {{ count }}
          </option>
        </select>
        <p class="upload-dropdown__hint">
          현재 플랜 기준 한 번에 최대 {{ maxUploadCount }}개 파일과
          {{ formatBytes(maxUploadFileBytes) }}까지 업로드할 수 있습니다.
        </p>
      </div>
    </div>

    <p v-if="uploadError" class="upload-error">{{ uploadError }}</p>

    <div v-if="isDropdownOpen" class="upload-backdrop" @click="closeDropdown"></div>
  </div>

  <FilesUploadStatusPanel
    :show="showFloatingPanel"
    :collapsed="isPanelCollapsed"
    :can-cancel="canCancel"
    :can-clear-dismissed="canClearDismissed"
    :panel-title="panelTitle"
    :panel-subtitle="panelSubtitleDisplay"
    :items="panelItems"
    @cancel="cancelUploads"
    @clear-dismissed="clearDismissedItems"
    @toggle-collapsed="togglePanelCollapsed"
    @dismiss="dismissPanel"
  />

  <FilesUploadExitDialog
    :open="isExitDialogOpen"
    :busy="isExitDialogBusy"
    :title-id="exitDialogTitleId"
    :title="exitDialogTitle"
    :description="exitDialogDescription"
    :action-label="exitDialogActionLabel"
    @cancel="closeExitDialog(false)"
    @confirm="confirmExitDialog"
  />
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import axios from "axios";
import { onBeforeRouteLeave } from "vue-router";
import { abortUpload, completeUpload, initUploadFiles, parseUploadResponse } from "@/api/filesApi.js";
import {
  ACTIVE_UPLOAD_STATUSES,
  CHUNK_SIZE_BYTES,
  DEFAULT_UPLOAD_CONCURRENCY,
  UPLOAD_CONCURRENCY_STORAGE_KEY,
  normalizeUploadConcurrency,
  uploadConcurrencyOptions,
} from "@/constants/uploadOptions.js";
import { api } from "@/plugins/axiosinterceptor.js";
import { useFileStore } from "@/stores/useFileStore.js";
import { useAuthStore } from "@/stores/useAuthStore.js";
import { formatBytes } from "@/utils/formatBytes.js";
import FilesUploadExitDialog from "./FilesUploadExitDialog.vue";
import FilesUploadStatusPanel from "./FilesUploadStatusPanel.vue";
import {
  applyUploadItemState,
  buildAbortPayload,
  buildUploadJobs,
  createUploadItem,
  defaultStatusText,
  extractErrorMessage,
  formatBytesPerSecond,
  getFileFormat,
  updateUploadItemProgress,
} from "./uploadState.js";

const emit = defineEmits(["upload-complete", "upload-fail"]);
const fileStore = useFileStore();
const authStore = useAuthStore();

const transientStatuses = ACTIVE_UPLOAD_STATUSES;
const activeUploadControllers = new Map();

const isDropdownOpen = ref(false);
const isUploading = ref(false);
const isCancelRequested = ref(false);
const isPanelCollapsed = ref(false);
const isPanelHidden = ref(false);
const uploadError = ref("");
const uploadItems = ref([]);
const uploadConcurrency = ref(readSavedConcurrency());
const isExitDialogOpen = ref(false);
const isExitDialogBusy = ref(false);
const exitDialogMode = ref("leave");
const allowWindowUnload = ref(false);

let exitDialogResolver = null;

const exitDialogTitleId = `upload-exit-title-${Math.random().toString(36).slice(2, 8)}`;

const maxUploadCount = computed(() => Number(fileStore.planCapabilities?.maxUploadCount || 30));
const maxUploadFileBytes = computed(() =>
  Number(fileStore.planCapabilities?.maxUploadFileBytes || 5 * 1024 * 1024 * 1024),
);
const activeCount = computed(() =>
  uploadItems.value.filter((item) => transientStatuses.has(item.status)).length,
);
const completedCount = computed(() =>
  uploadItems.value.filter((item) => item.status === "completed").length,
);
const failedCount = computed(() =>
  uploadItems.value.filter((item) => item.status === "failed").length,
);
const canceledCount = computed(() =>
  uploadItems.value.filter((item) => item.status === "canceled").length,
);
const canCancel = computed(() =>
  uploadItems.value.some((item) => transientStatuses.has(item.status)),
);
const canClearDismissed = computed(() =>
  uploadItems.value.some((item) => ["completed", "failed", "canceled"].includes(item.status)),
);
const totalUploadSpeedBytesPerSecond = computed(() =>
  uploadItems.value
    .filter((item) => item.status === "uploading")
    .reduce((total, item) => total + Math.max(0, Number(item.speedBytesPerSecond || 0)), 0),
);
const showFloatingPanel = computed(() => uploadItems.value.length > 0 && !isPanelHidden.value);
const panelItems = computed(() => [...uploadItems.value].reverse());
const hasBlockingUploads = computed(() =>
  uploadItems.value.some((item) => transientStatuses.has(item.status)),
);
const exitDialogTitle = computed(() =>
  exitDialogMode.value === "refresh"
    ? "페이지를 새로고침 하시겠습니까?"
    : "페이지에서 나가시겠습니까?",
);
const exitDialogDescription = computed(() => "작업중인 내역이 종료됩니다.");
const exitDialogActionLabel = computed(() =>
  exitDialogMode.value === "refresh" ? "새로고침" : "나가기",
);

const panelTitle = computed(() => {
  if (activeCount.value > 0) {
    return `항목 ${activeCount.value}개 업로드 진행 중`;
  }
  if (failedCount.value > 0) {
    return `항목 ${failedCount.value}개 업로드 확인 필요`;
  }
  if (canceledCount.value > 0) {
    return `항목 ${canceledCount.value}개 업로드 취소`;
  }
  if (completedCount.value > 0) {
    return `항목 ${completedCount.value}개 업로드 완료`;
  }
  return "업로드 상태";
});

const panelSubtitle = computed(() => {
  if (activeCount.value > 0) {
    return "파일 업로드를 처리하고 있습니다.";
  }
  if (failedCount.value > 0) {
    return "실패한 항목은 다시 업로드해 주세요.";
  }
  if (canceledCount.value > 0) {
    return "업로드가 취소되었습니다.";
  }
  if (completedCount.value > 0) {
    return "모든 업로드가 완료되었습니다.";
  }
return "";
});
const panelSubtitleDisplay = computed(() =>
  activeCount.value > 0
    ? `현재 총 전송 속도 ${formatBytesPerSecond(totalUploadSpeedBytesPerSecond.value)}`
    : panelSubtitle.value,
);

watch(uploadConcurrency, (value) => {
  const normalized = normalizeUploadConcurrency(value);
  if (normalized !== value) {
    uploadConcurrency.value = normalized;
    return;
  }

  window.localStorage.setItem(UPLOAD_CONCURRENCY_STORAGE_KEY, String(normalized));
});

watch(
  uploadItems,
  (items) => {
    if (items.length === 0) {
      isPanelCollapsed.value = false;
      isPanelHidden.value = false;
    }
  },
  { deep: true },
);

function readSavedConcurrency() {
  const savedValue = Number(window.localStorage.getItem(UPLOAD_CONCURRENCY_STORAGE_KEY) || DEFAULT_UPLOAD_CONCURRENCY);
  return normalizeUploadConcurrency(savedValue);
}

function openPanel() {
  isPanelHidden.value = false;
}

function toggleDropdown() {
  isDropdownOpen.value = !isDropdownOpen.value;
  if (uploadItems.value.length > 0) {
    openPanel();
  }
}

function closeDropdown() {
  isDropdownOpen.value = false;
}

function togglePanelCollapsed() {
  isPanelCollapsed.value = !isPanelCollapsed.value;
}

function dismissPanel() {
  isPanelHidden.value = true;
}

function getAbortableItems() {
  return uploadItems.value.filter((item) => transientStatuses.has(item.status));
}

function openExitDialog(mode = "leave") {
  if (!hasBlockingUploads.value) {
    return Promise.resolve(true);
  }

  if (exitDialogResolver) {
    return Promise.resolve(false);
  }

  exitDialogMode.value = mode;
  isExitDialogBusy.value = false;
  isExitDialogOpen.value = true;

  return new Promise((resolve) => {
    exitDialogResolver = resolve;
  });
}

function closeExitDialog(confirmed) {
  isExitDialogOpen.value = false;
  isExitDialogBusy.value = false;

  if (!exitDialogResolver) {
    return;
  }

  const resolve = exitDialogResolver;
  exitDialogResolver = null;
  resolve(Boolean(confirmed));
}

function confirmExitDialog() {
  if (isExitDialogBusy.value) {
    return;
  }

  isExitDialogBusy.value = true;
  closeExitDialog(true);
}

function clearDismissedItems() {
  uploadItems.value = uploadItems.value.filter((item) => !["completed", "failed", "canceled"].includes(item.status));
}

function clearCompletedHistoryIfIdle() {
  if (uploadItems.value.length === 0) {
    return;
  }

  const allCompleted = uploadItems.value.every((item) => item.status === "completed");
  if (!allCompleted) {
    return;
  }

  uploadItems.value = [];
  isPanelCollapsed.value = false;
  isPanelHidden.value = false;
}


function setItemState(itemId, patch) {
  const item = uploadItems.value.find((candidate) => candidate.id === itemId);
  if (!item) {
    return;
  }

  applyUploadItemState(item, patch);
}

function updateItemProgress(itemId, uploadedBytes, statusText) {
  const item = uploadItems.value.find((candidate) => candidate.id === itemId);
  if (!item) {
    return;
  }

  updateUploadItemProgress(item, uploadedBytes, statusText);
}

async function uploadChunkToUrl(blob, uploadMeta, contentType, options = {}) {
  if (!uploadMeta?.presignedUploadUrl) {
    throw new Error("업로드 URL을 찾을 수 없습니다.");
  }

  await axios.put(uploadMeta.presignedUploadUrl, blob, {
    signal: options.signal,
    headers: {
      "Content-Type": contentType || "application/octet-stream",
    },
    onUploadProgress: (event) => {
      options.onProgress?.(event?.loaded ?? 0);
    },
  });
}

async function abortUploadedFile(uploadMetas) {
  const payload = buildAbortPayload(uploadMetas);
  if (!payload.finalObjectKey) {
    return;
  }

  try {
    await abortUpload(payload);
  } catch {
  }
}

async function uploadFileByChunks(file, uploadMetas, itemId) {
  const chunkCount = Array.isArray(uploadMetas) ? uploadMetas.length : 0;
  if (chunkCount === 0) {
    throw new Error(`"${file?.name || "파일"}" 업로드 정보를 찾을 수 없습니다.`);
  }

  setItemState(itemId, {
    status: "uploading",
    statusText: defaultStatusText("uploading"),
  });

  let completedBytes = 0;
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    if (isCancelRequested.value) {
      throw new DOMException("Upload canceled", "AbortError");
    }

    const start = chunkIndex * CHUNK_SIZE_BYTES;
    const end =
      chunkIndex === chunkCount - 1
        ? Number(file.size || 0)
        : Math.min(start + CHUNK_SIZE_BYTES, Number(file.size || 0));
    const chunkBlob = file.slice(start, end, file.type || "application/octet-stream");
    const chunkSize = Number(chunkBlob.size || 0);
    const controller = new AbortController();

    activeUploadControllers.set(itemId, controller);

    try {
      await uploadChunkToUrl(chunkBlob, uploadMetas[chunkIndex], file.type, {
        signal: controller.signal,
        onProgress: (loadedBytes) => {
          const nextBytes = completedBytes + Math.min(chunkSize, Number(loadedBytes || 0));
          const progress = Number(file.size || 0) > 0
            ? Math.min(100, Math.round((nextBytes / Number(file.size || 0)) * 100))
            : 0;
          updateItemProgress(itemId, nextBytes, `업로드 중 (${progress}%)`);
        },
      });
    } finally {
      activeUploadControllers.delete(itemId);
    }

    completedBytes += chunkSize;
    updateItemProgress(itemId, completedBytes, "업로드를 마무리하고 있습니다.");
  }
}

async function completeUploadedFile(file, uploadMetas, partitioned, itemId, parentId) {
  const firstMeta = uploadMetas?.[0];
  const finalObjectKey = firstMeta?.finalObjectKey || firstMeta?.objectKey;
  const chunkObjectKeys = partitioned ? uploadMetas.map((meta) => meta?.objectKey).filter(Boolean) : [];

  if (!finalObjectKey) {
    throw new Error(`"${file?.name || "파일"}" 완료 정보를 찾을 수 없습니다.`);
  }

  setItemState(itemId, {
    status: partitioned ? "merging" : "uploading",
    statusText: partitioned ? "서버에서 파일을 병합하고 있습니다." : "업로드 완료를 확인하고 있습니다.",
    progress: 100,
    uploadedBytes: Number(file?.size || 0),
  });

  await completeUpload({
    fileOriginName: file?.name || "unnamed-file",
    fileFormat: getFileFormat(file),
    fileSize: Number(file?.size || 0),
    finalObjectKey,
    chunkObjectKeys,
    parentId,
    relativePath: file?.webkitRelativePath || file?.name || "unnamed-file",
    lastModified: Number(file?.lastModified || 0) || 0,
  });

  setItemState(itemId, {
    status: "completed",
    statusText: defaultStatusText("completed"),
    progress: 100,
    uploadedBytes: Number(file?.size || 0),
  });
}

function isAbortError(error) {
  return error?.name === "AbortError" || error?.code === "ERR_CANCELED";
}

async function runJobs(jobs, parentId) {
  const successList = [];
  const failureList = [];
  let nextJobIndex = 0;
  const workerCount = Math.min(normalizeUploadConcurrency(uploadConcurrency.value), jobs.length);

  const worker = async () => {
    while (!isCancelRequested.value) {
      const currentIndex = nextJobIndex;
      nextJobIndex += 1;

      if (currentIndex >= jobs.length) {
        return;
      }

      const job = jobs[currentIndex];

      try {
        await uploadFileByChunks(job.file, job.metas, job.itemId);
        await completeUploadedFile(job.file, job.metas, job.partitioned, job.itemId, parentId);
        successList.push(job.file.name);
      } catch (error) {
        await abortUploadedFile(job.metas);

        if (isAbortError(error)) {
          setItemState(job.itemId, {
            status: "canceled",
            statusText: defaultStatusText("canceled"),
            progress: 0,
          });
          continue;
        }

        setItemState(job.itemId, {
          status: "failed",
          statusText: extractErrorMessage(error, defaultStatusText("failed")),
        });
        failureList.push(job.file?.name || "파일");
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, worker));
  return { successList, failureList };
}

async function terminateUploadsForExit() {
  if (!hasBlockingUploads.value) {
    return;
  }

  isCancelRequested.value = true;
  const abortableItems = getAbortableItems();

  abortableItems.forEach((item) => {
    item.status = "canceling";
    item.statusText = defaultStatusText("canceling");
  });

  activeUploadControllers.forEach((controller) => controller.abort());
  activeUploadControllers.clear();

  try {
    await Promise.all(abortableItems.map((item) => abortUploadedFile(item.uploadMetas)));
  } finally {
    abortableItems.forEach((item) => {
      item.status = "canceled";
      item.statusText = defaultStatusText("canceled");
      item.progress = 0;
    });
    isUploading.value = false;
  }
}

function abortUploadsKeepalive() {
  const token = authStore.token;
  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const baseUrl = String(api?.defaults?.baseURL || "").replace(/\/$/, "");
  const abortUrl = `${baseUrl}/file/upload/abort`;

  getAbortableItems().forEach((item) => {
    const payload = buildAbortPayload(item.uploadMetas);
    if (!payload.finalObjectKey) {
      return;
    }

    try {
      fetch(abortUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: "include",
      }).catch(() => {});
    } catch {
    }
  });
}

async function handleUpload(event, uploadTypeLabel) {
  const selectedFiles = Array.from(event?.target?.files || []);
  if (selectedFiles.length === 0) {
    return;
  }

  try {
    if (!fileStore.storageSummary && !fileStore.storageLoading) {
      await fileStore.fetchStorageSummary().catch(() => {});
    }

    if (selectedFiles.length > maxUploadCount.value) {
      throw new Error(`한 번에 최대 ${maxUploadCount.value}개까지 업로드할 수 있습니다.`);
    }

    const oversizedFile = selectedFiles.find((file) => Number(file?.size || 0) > maxUploadFileBytes.value);
    if (oversizedFile) {
      throw new Error(
        `"${oversizedFile.name}" 파일은 최대 제한 크기(${formatBytes(maxUploadFileBytes.value)})를 초과합니다.`,
      );
    }

    const invalidFile = selectedFiles.find((file) => !getFileFormat(file));
    if (invalidFile) {
      throw new Error(`"${invalidFile.name}" 파일은 확장자를 확인할 수 없습니다.`);
    }

    uploadError.value = "";
    isUploading.value = true;
    isCancelRequested.value = false;
    clearCompletedHistoryIfIdle();
    isPanelCollapsed.value = false;
    openPanel();
    uploadItems.value = selectedFiles.map((file) => createUploadItem(file));

    const response = await initUploadFiles(selectedFiles, fileStore.currentFolderId);
    const uploadMetas = parseUploadResponse(response?.data);
    if (!Array.isArray(uploadMetas) || uploadMetas.length === 0) {
      throw new Error("업로드 준비 응답이 비어 있습니다.");
    }

    const jobs = buildUploadJobs(selectedFiles, uploadMetas, uploadItems.value);
    const { successList, failureList } = await runJobs(jobs, fileStore.currentFolderId);

    if (isCancelRequested.value) {
      return;
    }

    if (successList.length > 0) {
      if (fileStore.driveHasLoaded && !fileStore.hasLoaded) {
        await fileStore.refreshDrivePage().catch(() => {});
      } else {
        await fileStore.fetchFiles().catch(() => {});
      }
      emit("upload-complete", successList);
    }

    if (failureList.length > 0) {
      const failureMessage = "일부 업로드에 실패했습니다.";
      uploadError.value = failureMessage;
      emit("upload-fail", failureMessage);
    }
  } catch (error) {
    const message = extractErrorMessage(error, `${uploadTypeLabel} 업로드에 실패했습니다.`);
    uploadError.value = message;
    emit("upload-fail", message);
  } finally {
    isUploading.value = false;
    closeDropdown();
    if (event?.target) {
      event.target.value = "";
    }
  }
}

async function cancelUploads() {
  if (!canCancel.value) {
    return;
  }

  await terminateUploadsForExit();
}

async function handleRefreshRequest() {
  const confirmed = await openExitDialog("refresh");
  if (!confirmed) {
    return;
  }

  await terminateUploadsForExit();
  allowWindowUnload.value = true;
  window.location.reload();
}

function createNewFolder() {
  const folderName = prompt("폴더 이름을 입력해 주세요.");
  if (!folderName?.trim()) {
    closeDropdown();
    return;
  }

  fileStore.createFolder(folderName.trim()).catch((error) => {
    uploadError.value = extractErrorMessage(error, "폴더를 생성하지 못했습니다.");
  });
  closeDropdown();
}

async function handleFileChange(event) {
  await handleUpload(event, "파일");
}

async function handleFolderChange(event) {
  await handleUpload(event, "폴더");
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    closeDropdown();
    return;
  }

  const normalizedKey = String(event.key || "").toLowerCase();
  const isRefreshShortcut =
    event.key === "F5" || ((event.ctrlKey || event.metaKey) && !event.altKey && normalizedKey === "r");

  if (isRefreshShortcut && hasBlockingUploads.value) {
    event.preventDefault();
    void handleRefreshRequest();
  }
}

function handleBeforeUnload(event) {
  if (!hasBlockingUploads.value || allowWindowUnload.value) {
    return;
  }

  event.preventDefault();
  event.returnValue = "";
}

function handlePageHide() {
  if (!hasBlockingUploads.value || allowWindowUnload.value) {
    return;
  }

  abortUploadsKeepalive();
}

onBeforeRouteLeave(async () => {
  if (!hasBlockingUploads.value) {
    return true;
  }

  const confirmed = await openExitDialog("leave");
  if (!confirmed) {
    return false;
  }

  await terminateUploadsForExit();
  return true;
});

onMounted(() => {
  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("beforeunload", handleBeforeUnload);
  window.addEventListener("pagehide", handlePageHide);
  fileStore.fetchStorageSummary().catch(() => {});
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("beforeunload", handleBeforeUnload);
  window.removeEventListener("pagehide", handlePageHide);
  activeUploadControllers.forEach((controller) => controller.abort());
  activeUploadControllers.clear();
  if (exitDialogResolver) {
    closeExitDialog(false);
  }
});
</script>

<style src="./FilesUploadWidget.css"></style>
