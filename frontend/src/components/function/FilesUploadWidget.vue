<template>
  <div class="upload-widget">
    <button v-if="!hideTrigger" type="button" class="upload-trigger" @click="toggleDropdown">
      <i class="fa-solid fa-plus"></i>
      <span>업로드 / 폴더 만들기</span>
      <span v-if="activeCount > 0" class="upload-trigger__count">{{ activeCount }}</span>
    </button>

    <div v-if="isDropdownOpen" class="upload-dropdown">
      <button type="button" class="upload-dropdown__item" @click="createNewFolder">
        <i class="fa-regular fa-folder-open"></i>
        <span>새 폴더 만들기</span>
      </button>

      <button
        v-if="!secretFolderStore.vaultMode"
        type="button"
        class="upload-dropdown__item"
        @click="openCreateSharedFolderModal"
      >
        <i class="fa-solid fa-folder-tree"></i>
        <span>공유 폴더 만들기</span>
      </button>

      <label class="upload-dropdown__item">
        <i class="fa-solid fa-file-arrow-up"></i>
        <span>파일 업로드</span>
        <input ref="quickFileInputRef" type="file" hidden multiple :disabled="isUploading" @change="handleFileChange" />
      </label>

      <label class="upload-dropdown__item">
        <i class="fa-solid fa-folder-plus"></i>
        <span>폴더 업로드</span>
        <input
          ref="quickFolderInputRef"
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
    :overall-progress="totalProgressPercent"
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

  <FolderUploadStructureModal
    :is-open="isFolderUploadModalOpen"
    :tree-data="folderUploadTreeData"
    :target-location-name="folderUploadTargetLocation"
    @confirm="handleFolderUploadConfirm"
    @cancel="handleFolderUploadCancel"
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
import { useSecretFolderStore } from "@/stores/useSecretFolderStore.js";
import { useAuthStore } from "@/stores/useAuthStore.js";
import { formatBytes } from "@/utils/formatBytes.js";
import { buildFolderUploadTree, hasFolderHierarchy } from "@/utils/folderTreeBuilder.js";
import FilesUploadExitDialog from "./FilesUploadExitDialog.vue";
import FilesUploadStatusPanel from "./FilesUploadStatusPanel.vue";
import FolderUploadStructureModal from "./FolderUploadStructureModal.vue";
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

const props = defineProps({
  hideTrigger: { type: Boolean, default: false },
});
const emit = defineEmits(["upload-complete", "upload-fail"]);
const fileStore = useFileStore();
const secretFolderStore = useSecretFolderStore();
const authStore = useAuthStore();
const quickFileInputRef = ref(null);
const quickFolderInputRef = ref(null);

const isFolderUploadModalOpen = ref(false);
const folderUploadTreeData = ref({
  roots: [],
  totalFolders: 0,
  totalFiles: 0,
  totalBytes: 0,
  totalBytesFormatted: "0 B",
});
const folderUploadTargetLocation = ref("홈 (최상위)");
const pendingFolderUpload = ref(null);

const transientStatuses = ACTIVE_UPLOAD_STATUSES;
const activeUploadControllers = new Map();

function registerController(itemId, controller) {
  let set = activeUploadControllers.get(itemId);
  if (!set) {
    set = new Set();
    activeUploadControllers.set(itemId, set);
  }
  set.add(controller);
}

function unregisterController(itemId, controller) {
  const set = activeUploadControllers.get(itemId);
  if (set) {
    set.delete(controller);
    if (set.size === 0) {
      activeUploadControllers.delete(itemId);
    }
  }
}

function abortAllActiveControllers() {
  activeUploadControllers.forEach((item) => {
    if (item instanceof Set) {
      item.forEach((controller) => controller.abort());
    } else if (item?.abort) {
      item.abort();
    }
  });
  activeUploadControllers.clear();
}

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
const totalUploadBytes = computed(() =>
  uploadItems.value.reduce((total, item) => total + Math.max(0, Number(item.fileSize || 0)), 0),
);

const totalUploadedBytes = computed(() =>
  uploadItems.value.reduce((total, item) => total + Math.max(0, Number(item.uploadedBytes || 0)), 0),
);

const totalUploadCount = computed(() => uploadItems.value.length);

const totalProgressPercent = computed(() => {
  if (totalUploadCount.value === 0) {
    return 0;
  }
  if (completedCount.value === totalUploadCount.value) {
    return 100;
  }
  if (totalUploadBytes.value > 0) {
    const bytePercent = Math.round((totalUploadedBytes.value / totalUploadBytes.value) * 100);
    return activeCount.value > 0 ? Math.min(99, Math.max(0, bytePercent)) : Math.min(100, Math.max(0, bytePercent));
  }
  const countPercent = Math.round((completedCount.value / totalUploadCount.value) * 100);
  return activeCount.value > 0 ? Math.min(99, countPercent) : Math.min(100, countPercent);
});

const totalUploadSpeedBytesPerSecond = computed(() =>
  uploadItems.value
    .filter((item) => item.status === "uploading")
    .reduce((total, item) => total + Math.max(0, Number(item.speedBytesPerSecond || 0)), 0),
);

const sessionSpeedBytesPerSecond = ref(0);
let sessionSpeedSamples = [];
let speedIntervalId = null;

function recordSessionThroughputSample() {
  if (activeCount.value === 0) {
    sessionSpeedBytesPerSecond.value = 0;
    sessionSpeedSamples = [];
    return;
  }

  const now = Date.now();
  const currentTotalBytes = totalUploadedBytes.value;

  sessionSpeedSamples.push({ time: now, bytes: currentTotalBytes });

  const cutoff = now - 1500;
  while (sessionSpeedSamples.length > 2 && sessionSpeedSamples[0].time < cutoff) {
    sessionSpeedSamples.shift();
  }

  if (sessionSpeedSamples.length >= 2) {
    const oldest = sessionSpeedSamples[0];
    const latest = sessionSpeedSamples[sessionSpeedSamples.length - 1];
    const deltaMs = latest.time - oldest.time;
    const deltaBytes = latest.bytes - oldest.bytes;

    if (deltaMs >= 200 && deltaBytes > 0) {
      const calculatedSpeed = (deltaBytes / deltaMs) * 1000;
      sessionSpeedBytesPerSecond.value = sessionSpeedBytesPerSecond.value > 0
        ? (sessionSpeedBytesPerSecond.value * 0.35) + (calculatedSpeed * 0.65)
        : calculatedSpeed;
    } else if (deltaMs >= 1200 && deltaBytes === 0) {
      sessionSpeedBytesPerSecond.value = Math.max(0, sessionSpeedBytesPerSecond.value * 0.5);
    }
  }
}

watch(
  () => activeCount.value > 0,
  (isActive) => {
    if (isActive) {
      if (!speedIntervalId) {
        sessionSpeedSamples = [
          { time: Date.now(), bytes: totalUploadedBytes.value },
        ];
        speedIntervalId = setInterval(recordSessionThroughputSample, 250);
      }
    } else {
      if (speedIntervalId) {
        clearInterval(speedIntervalId);
        speedIntervalId = null;
      }
      sessionSpeedBytesPerSecond.value = 0;
      sessionSpeedSamples = [];
    }
  },
  { immediate: true },
);

const displayUploadSpeedBytesPerSecond = computed(() => {
  if (activeCount.value === 0) {
    return 0;
  }
  return Math.max(sessionSpeedBytesPerSecond.value, totalUploadSpeedBytesPerSecond.value);
});
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
    return `항목 ${totalUploadCount.value}개 업로드 진행 중 (${totalProgressPercent.value}%)`;
  }
  if (failedCount.value > 0 && completedCount.value > 0) {
    return `항목 ${completedCount.value}개 완료, ${failedCount.value}개 확인 필요 (${totalProgressPercent.value}%)`;
  }
  if (failedCount.value > 0) {
    return `항목 ${failedCount.value}개 업로드 확인 필요`;
  }
  if (canceledCount.value > 0) {
    return `항목 ${canceledCount.value}개 업로드 취소`;
  }
  if (completedCount.value > 0) {
    return `항목 ${completedCount.value}개 업로드 완료 (100%)`;
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

const isAllActiveMerging = computed(() =>
  activeCount.value > 0 &&
  uploadItems.value
    .filter((item) => transientStatuses.has(item.status))
    .every((item) => item.status === "merging"),
);

const panelSubtitleDisplay = computed(() => {
  if (activeCount.value > 0) {
    const formattedSpeed = formatBytesPerSecond(displayUploadSpeedBytesPerSecond.value);
    if (isAllActiveMerging.value) {
      return `총 진행률 ${totalProgressPercent.value}% (${completedCount.value}/${totalUploadCount.value}) · ${defaultStatusText("merging")}`;
    }
    return `총 진행률 ${totalProgressPercent.value}% (${completedCount.value}/${totalUploadCount.value}) · 현재 총 전송 속도 ${formattedSpeed}`;
  }
  if (completedCount.value > 0 && failedCount.value === 0 && canceledCount.value === 0) {
    return "모든 업로드가 완료되었습니다. (100%)";
  }
  return panelSubtitle.value;
});

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
  if (item.status !== "completed" && item.progress >= 100) {
    item.progress = 99;
  }
  recordSessionThroughputSample();
}

async function uploadChunkToUrl(blob, uploadMeta, contentType, options = {}) {
  if (!uploadMeta?.presignedUploadUrl) {
    throw new Error("업로드 URL을 찾을 수 없습니다.");
  }

  const maxRetries = options.maxRetries ?? 3;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (options.signal?.aborted || isCancelRequested.value) {
      throw new DOMException("Upload canceled", "AbortError");
    }

    try {
      await axios.put(uploadMeta.presignedUploadUrl, blob, {
        signal: options.signal,
        headers: {
          "Content-Type": contentType || "application/octet-stream",
        },
        onUploadProgress: (event) => {
          options.onProgress?.(event?.loaded ?? 0);
        },
      });
      return;
    } catch (error) {
      lastError = error;
      if (isAbortError(error) || options.signal?.aborted || isCancelRequested.value) {
        throw error;
      }

      if (attempt < maxRetries) {
        const delayMs = Math.min(3000, 1000 * Math.pow(2, attempt));
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
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

async function uploadFileByChunks(file, uploadMetas, itemId, chunkConcurrency = 1) {
  const chunkCount = Array.isArray(uploadMetas) ? uploadMetas.length : 0;
  if (chunkCount === 0) {
    throw new Error(`"${file?.name || "파일"}" 업로드 정보를 찾을 수 없습니다.`);
  }

  setItemState(itemId, {
    status: "uploading",
    statusText: defaultStatusText("uploading"),
  });

  const totalFileSize = Number(file.size || 0);
  const chunkLoadedBytes = new Array(chunkCount).fill(0);

  const notifyProgress = (isMerging = false) => {
    const currentLoaded = chunkLoadedBytes.reduce((sum, b) => sum + b, 0);
    const progress = totalFileSize > 0
      ? Math.min(99, Math.round((currentLoaded / totalFileSize) * 100))
      : 0;
    updateItemProgress(
      itemId,
      currentLoaded,
      isMerging ? defaultStatusText("merging") : `업로드 중 (${progress}%)`,
    );
  };

  const parallelWorkers = Math.max(1, Math.min(Number(chunkConcurrency) || 1, chunkCount));
  let nextChunkIndex = 0;
  let firstError = null;

  const chunkWorker = async () => {
    while (nextChunkIndex < chunkCount) {
      if (firstError || isCancelRequested.value) {
        return;
      }

      const chunkIndex = nextChunkIndex;
      nextChunkIndex += 1;

      const start = chunkIndex * CHUNK_SIZE_BYTES;
      const end =
        chunkIndex === chunkCount - 1
          ? totalFileSize
          : Math.min(start + CHUNK_SIZE_BYTES, totalFileSize);
      const chunkBlob = file.slice(start, end, file.type || "application/octet-stream");
      const chunkSize = Number(chunkBlob.size || 0);
      const controller = new AbortController();

      registerController(itemId, controller);

      try {
        await uploadChunkToUrl(chunkBlob, uploadMetas[chunkIndex], file.type, {
          signal: controller.signal,
          onProgress: (loadedBytes) => {
            chunkLoadedBytes[chunkIndex] = Math.min(chunkSize, Number(loadedBytes || 0));
            notifyProgress(false);
          },
        });
        chunkLoadedBytes[chunkIndex] = chunkSize;
        notifyProgress(false);
      } catch (error) {
        if (!firstError) {
          firstError = error;
        }
        return;
      } finally {
        unregisterController(itemId, controller);
      }
    }
  };

  await Promise.all(Array.from({ length: parallelWorkers }, chunkWorker));

  if (firstError) {
    throw firstError;
  }

  notifyProgress(true);
}

async function completeUploadedFile(file, uploadMetas, partitioned, itemId, parentId, vaultMode = false) {
  const firstMeta = uploadMetas?.[0];
  const finalObjectKey = firstMeta?.finalObjectKey || firstMeta?.objectKey;
  const chunkObjectKeys = partitioned ? uploadMetas.map((meta) => meta?.objectKey).filter(Boolean) : [];

  if (!finalObjectKey) {
    throw new Error(`"${file?.name || "파일"}" 완료 정보를 찾을 수 없습니다.`);
  }

  setItemState(itemId, {
    status: "merging",
    statusText: defaultStatusText("merging"),
    progress: 99,
    uploadedBytes: Number(file?.size || 0),
  });

  const completedFile = await completeUpload({
    fileOriginName: file?.name || "unnamed-file",
    fileFormat: getFileFormat(file),
    fileSize: Number(file?.size || 0),
    finalObjectKey,
    chunkObjectKeys,
    parentId,
    relativePath: file?.webkitRelativePath || file?.name || "unnamed-file",
    lastModified: Number(file?.lastModified || 0) || 0,
    ...(vaultMode ? { vaultMode: true, spaceType: "VAULT" } : {}),
  });
  const completedId = completedFile?.idx ?? completedFile?.id;
  if (completedId != null && !vaultMode) {
    fileStore.markFilesRecentlyUploaded?.([completedId]);
  }

  setItemState(itemId, {
    status: "completed",
    statusText: defaultStatusText("completed"),
    progress: 100,
    uploadedBytes: Number(file?.size || 0),
  });
  recordSessionThroughputSample();
}

function isAbortError(error) {
  return error?.name === "AbortError" || error?.code === "ERR_CANCELED";
}

async function runJobs(jobs, parentId, vaultMode = false) {
  const successList = [];
  const failureList = [];
  let nextJobIndex = 0;
  const configuredConcurrency = normalizeUploadConcurrency(uploadConcurrency.value);
  const workerCount = Math.min(configuredConcurrency, jobs.length);
  const chunkConcurrency = jobs.length === 1
    ? configuredConcurrency
    : Math.max(1, Math.floor(configuredConcurrency / workerCount));

  const worker = async () => {
    while (!isCancelRequested.value) {
      const currentIndex = nextJobIndex;
      nextJobIndex += 1;

      if (currentIndex >= jobs.length) {
        return;
      }

      const job = jobs[currentIndex];

      try {
        await uploadFileByChunks(job.file, job.metas, job.itemId, chunkConcurrency);
        await completeUploadedFile(job.file, job.metas, job.partitioned, job.itemId, parentId, vaultMode);
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

  abortAllActiveControllers();

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

async function startUploadFiles(files, targetFolderId = fileStore.currentFolderId, uploadTypeLabel = "파일") {
  const selectedFiles = Array.from(files || []);
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

    const uploadVaultMode = Boolean(secretFolderStore.vaultMode);
    const response = await initUploadFiles(selectedFiles, targetFolderId, {
      vaultMode: uploadVaultMode,
    });
    const uploadMetas = parseUploadResponse(response?.data);
    if (!Array.isArray(uploadMetas) || uploadMetas.length === 0) {
      throw new Error("업로드 준비 응답이 비어 있습니다.");
    }

    const jobs = buildUploadJobs(selectedFiles, uploadMetas, uploadItems.value);
    const { successList, failureList } = await runJobs(jobs, targetFolderId, uploadVaultMode);

    if (isCancelRequested.value) {
      return;
    }

    if (successList.length > 0) {
      if (fileStore.driveHasLoaded) {
        await fileStore.refreshDrivePage().catch(() => {});
      }
      if (uploadVaultMode && secretFolderStore.vaultUnlocked) {
        await fileStore.fetchVaultFiles({ background: true }).catch(() => {});
      }
      await fileStore.fetchFiles({ background: fileStore.driveHasLoaded }).catch(() => {});
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
  }
}

function resolveTargetLocationName(targetParentId) {
  if (!targetParentId) {
    return "홈 (최상위)";
  }
  const pathList = typeof fileStore.getFolderPath === "function" ? fileStore.getFolderPath(targetParentId) : [];
  if (Array.isArray(pathList) && pathList.length > 0) {
    return "홈 / " + pathList.map((item) => item.name).join(" / ");
  }
  const folder = fileStore.fileById?.get?.(String(targetParentId));
  if (folder?.name) {
    return folder.name;
  }
  return `폴더 #${targetParentId}`;
}

function showFolderUploadStructureModal(files, parentId, emptyDirectories = [], uploadTypeLabel = "폴더") {
  const tree = buildFolderUploadTree(files, emptyDirectories);
  folderUploadTreeData.value = tree;
  folderUploadTargetLocation.value = resolveTargetLocationName(parentId);
  pendingFolderUpload.value = {
    files,
    parentId,
    emptyDirectories,
    uploadTypeLabel,
  };
  isFolderUploadModalOpen.value = true;
  closeDropdown();
}

async function handleFolderUploadConfirm() {
  if (!pendingFolderUpload.value) {
    isFolderUploadModalOpen.value = false;
    return;
  }

  const { files, parentId, emptyDirectories, uploadTypeLabel } = pendingFolderUpload.value;
  pendingFolderUpload.value = null;
  isFolderUploadModalOpen.value = false;

  if (Array.isArray(files) && files.length > 0) {
    await startUploadFiles(files, parentId, uploadTypeLabel);
  }

  if (Array.isArray(emptyDirectories) && emptyDirectories.length > 0) {
    for (const emptyDir of emptyDirectories) {
      const topSegment = emptyDir.split("/")[0]?.trim();
      if (topSegment) {
        await fileStore.createFolder(topSegment, parentId).catch(() => {});
      }
    }
  }
}

function handleFolderUploadCancel() {
  pendingFolderUpload.value = null;
  isFolderUploadModalOpen.value = false;
}

async function handleDesktopUploadEvent(event) {
  const { files, parentId, emptyDirectories } = event?.detail || {};
  const targetParentId = parentId !== undefined ? parentId : fileStore.currentFolderId;
  const fileList = Array.isArray(files) ? files : [];
  const emptyDirs = Array.isArray(emptyDirectories) ? emptyDirectories : [];

  if (fileList.length === 0 && emptyDirs.length === 0) {
    return;
  }

  if (hasFolderHierarchy(fileList, emptyDirs)) {
    showFolderUploadStructureModal(fileList, targetParentId, emptyDirs, "드롭 폴더");
    return;
  }

  if (fileList.length > 0) {
    await startUploadFiles(fileList, targetParentId, "드롭 파일");
  }
}

async function handleUpload(event, uploadTypeLabel) {
  const selectedFiles = Array.from(event?.target?.files || []);
  try {
    await startUploadFiles(selectedFiles, fileStore.currentFolderId, uploadTypeLabel);
  } finally {
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

function openCreateSharedFolderModal() {
  closeDropdown();
  window.dispatchEvent(
    new CustomEvent("open-storage-share-modal", {
      detail: {
        page: "create-space",
        targetParentId: fileStore.currentFolderId ?? null,
      },
    }),
  );
}

async function handleFileChange(event) {
  const selectedFiles = Array.from(event?.target?.files || []);
  const inputEl = event?.target;
  try {
    if (selectedFiles.length === 0) {
      return;
    }
    if (hasFolderHierarchy(selectedFiles, [])) {
      showFolderUploadStructureModal(selectedFiles, fileStore.currentFolderId, [], "파일");
      return;
    }
    await startUploadFiles(selectedFiles, fileStore.currentFolderId, "파일");
  } finally {
    if (inputEl) {
      inputEl.value = "";
    }
  }
}

async function handleFolderChange(event) {
  const selectedFiles = Array.from(event?.target?.files || []);
  const inputEl = event?.target;
  try {
    if (selectedFiles.length === 0) {
      return;
    }
    if (hasFolderHierarchy(selectedFiles, [])) {
      showFolderUploadStructureModal(selectedFiles, fileStore.currentFolderId, [], "폴더");
      return;
    }
    await startUploadFiles(selectedFiles, fileStore.currentFolderId, "폴더");
  } finally {
    if (inputEl) {
      inputEl.value = "";
    }
  }
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

function handleQuickUploadEvent(event) {
  const mode = event?.detail?.mode || "file";
  if (mode === "new-folder") {
    createNewFolder();
    return;
  }
  if (mode === "folder") {
    quickFolderInputRef.value?.click();
    return;
  }
  quickFileInputRef.value?.click();
}

onMounted(() => {
  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("beforeunload", handleBeforeUnload);
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("start-desktop-upload", handleDesktopUploadEvent);
  window.addEventListener("trigger-quick-upload", handleQuickUploadEvent);
  fileStore.fetchStorageSummary().catch(() => {});
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("beforeunload", handleBeforeUnload);
  window.removeEventListener("pagehide", handlePageHide);
  window.removeEventListener("start-desktop-upload", handleDesktopUploadEvent);
  window.removeEventListener("trigger-quick-upload", handleQuickUploadEvent);
  if (speedIntervalId) {
    clearInterval(speedIntervalId);
    speedIntervalId = null;
  }
  activeUploadControllers.forEach((controller) => controller.abort());
  activeUploadControllers.clear();
  if (exitDialogResolver) {
    closeExitDialog(false);
  }
});
</script>

<style src="./FilesUploadWidget.css"></style>
