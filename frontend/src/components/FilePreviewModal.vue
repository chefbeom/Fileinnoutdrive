<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useFileStore } from "@/stores/useFileStore.js";
import { useMediaPhotoStore } from "@/stores/useMediaPhotoStore.js";
import { downloadFileAsset, fetchFileVersions, restoreFileVersion } from "@/api/filesApi.js";
import {
  isEncryptedVaultFile,
  refreshEncryptedStreamUrl,
  resolveFilePlaybackUrl,
} from "@/utils/fileMediaUrl.js";
import {
  ModalBackHistoryManager,
  safeExitFullscreen,
  safePauseMedia,
} from "@/utils/modalBackHistory.js";
import { resumeThumbnailQueue, suspendThumbnailQueue } from "@/utils/fileThumbnailCache.js";

const props = defineProps({
  file: {
    type: Object,
    default: null,
  },
  files: {
    type: Array,
    default: () => [],
  },
  allowDownloadLinkShare: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["close", "share-download-link", "select-file"]);

const canShareDownloadLink = computed(() => {
  const f = props.file;
  if (!props.allowDownloadLinkShare || !f || Boolean(f.lockedFile) || isEncryptedVaultFile(f)) {
    return false;
  }
  const isFolder = f.nodeType === "FOLDER" || f.type === "folder";
  const isVault = Boolean(f.isVaultSpace || String(f.spaceType || "").toUpperCase() === "VAULT");
  const isTrash = Boolean(f.isTrash || f.trashed);
  return !isFolder && !f.sharedWithMe && !isTrash && !f.hiddenFolder && !isVault;
});
const fileStore = useFileStore();
const mediaPhotoStore = useMediaPhotoStore();

const videoPreviewRef = ref(null);
const audioPreviewRef = ref(null);
let isVideoPrioritySuspended = false;
let videoPriorityReleaseTimer = null;

const releaseVideoThumbnailPriority = () => {
  if (videoPriorityReleaseTimer) {
    clearTimeout(videoPriorityReleaseTimer);
    videoPriorityReleaseTimer = null;
  }
  if (isVideoPrioritySuspended) {
    isVideoPrioritySuspended = false;
    resumeThumbnailQueue();
  }
};

const holdVideoThumbnailPriority = () => {
  releaseVideoThumbnailPriority();
  isVideoPrioritySuspended = true;
  suspendThumbnailQueue();
  videoPriorityReleaseTimer = setTimeout(() => {
    releaseVideoThumbnailPriority();
  }, 1500);
};

const onBeforeCloseTeardown = () => {
  releaseVideoThumbnailPriority();
  safeExitFullscreen();
  if (videoPreviewRef.value) {
    safePauseMedia(videoPreviewRef.value);
  }
  if (audioPreviewRef.value) {
    safePauseMedia(audioPreviewRef.value);
  }
};

const historyManager = new ModalBackHistoryManager({
  modalId: "file-preview",
  onBeforeClose: onBeforeCloseTeardown,
  onClose: () => {
    emit("close");
  },
});

const handleClose = () => {
  historyManager.requestClose();
};

const navigableFiles = computed(() => {
  const list = (props.files || []).filter(
    (item) => item && item.id != null && item.type !== "folder" && item.nodeType !== "FOLDER" && !item.lockedFile,
  );
  if (!props.file || props.file.id == null) {
    return list;
  }
  const hasCurrent = list.some((item) => String(item.id) === String(props.file.id));
  return hasCurrent ? list : [props.file, ...list];
});

const currentIndex = computed(() => {
  if (!props.file || props.file.id == null) return -1;
  return navigableFiles.value.findIndex((item) => String(item.id) === String(props.file.id));
});

const hasPrevFile = computed(() => currentIndex.value > 0);
const hasNextFile = computed(() => currentIndex.value >= 0 && currentIndex.value < navigableFiles.value.length - 1);

const selectFileAtIndex = (index) => {
  const target = navigableFiles.value[index];
  if (!target) return;
  if (videoPreviewRef.value) safePauseMedia(videoPreviewRef.value);
  if (audioPreviewRef.value) safePauseMedia(audioPreviewRef.value);
  emit("select-file", target);
};

const goPrevFile = () => {
  if (hasPrevFile.value) {
    selectFileAtIndex(currentIndex.value - 1);
  }
};

const goNextFile = () => {
  if (hasNextFile.value) {
    selectFileAtIndex(currentIndex.value + 1);
  }
};

const handleOpenInMediaTheater = () => {
  if (!props.file || isLockedFile.value) return;
  const target = props.file;
  const isVault = Boolean(target.isVaultSpace || String(target.spaceType || "").toUpperCase() === "VAULT");
  const videoItems = navigableFiles.value.filter((item) => {
    const ext = String(item?.extension || item?.fileFormat || "").toLowerCase();
    const ct = String(item?.contentType || item?.raw?.contentType || "").toLowerCase();
    return String(item.id) === String(target.id) || ct.startsWith("video/") || VIDEO_EXTENSIONS.has(ext);
  });
  onBeforeCloseTeardown();
  historyManager.handoffTo("media-theater", target.id);
  emit("close");
  mediaPhotoStore.openTheater(target, {
    playlistIds: videoItems.map((item) => String(item.id)),
    vaultScope: isVault,
    file: target,
    files: videoItems,
  });
};

const handleOpenInPhotoLightbox = () => {
  if (!props.file || isLockedFile.value) return;
  const target = props.file;
  const isVault = Boolean(target.isVaultSpace || String(target.spaceType || "").toUpperCase() === "VAULT");
  const imageItems = navigableFiles.value.filter((item) => {
    const ext = String(item?.extension || item?.fileFormat || "").toLowerCase();
    const ct = String(item?.contentType || item?.raw?.contentType || "").toLowerCase();
    return String(item.id) === String(target.id) || ct.startsWith("image/") || IMAGE_EXTENSIONS.has(ext);
  });
  onBeforeCloseTeardown();
  historyManager.handoffTo("photo-lightbox", target.id);
  emit("close");
  mediaPhotoStore.openPhotoLightbox(target, {
    poolIds: imageItems.map((item) => String(item.id)),
    vaultScope: isVault,
    file: target,
    files: imageItems,
  });
};
const textPreview = ref(null);
const textPreviewError = ref("");
const isTextPreviewLoading = ref(false);
const isDownloading = ref(false);
const fileVersions = ref([]);
const fileVersionsError = ref("");
const isFileVersionsLoading = ref(false);
const restoringVersionId = ref(null);

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", "heic", "avif", "apng", "jfif", "tif", "tiff"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "mkv", "avi", "wmv", "m4v", "mpeg", "mpg", "ogv", "3gp"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "aac", "flac", "ogg", "m4a"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "log", "json", "xml", "html", "htm", "css", "js", "ts", "java", "py", "sql", "yml", "yaml", "properties", "sh", "bat"]);

const extension = computed(() => String(props.file?.extension || props.file?.fileFormat || "").toLowerCase());
const contentType = computed(() => String(props.file?.contentType || props.file?.raw?.contentType || "").toLowerCase());

const previewKind = computed(() => {
  if (contentType.value.startsWith("image/") || IMAGE_EXTENSIONS.has(extension.value)) return "image";
  if (contentType.value.startsWith("video/") || VIDEO_EXTENSIONS.has(extension.value)) return "video";
  if (AUDIO_EXTENSIONS.has(extension.value)) return "audio";
  if (PDF_EXTENSIONS.has(extension.value)) return "pdf";
  if (TEXT_EXTENSIONS.has(extension.value)) return "text";
  return "none";
});

const refreshedPreviewUrl = ref("");
const hasRetriedStreamToken = ref(false);
const isMediaLoading = ref(false);
const mediaLoadError = ref("");
const mediaRetryCount = ref(0);
const isEncryptedFile = computed(() => isEncryptedVaultFile(props.file));
const previewUrl = computed(() => refreshedPreviewUrl.value || resolveFilePlaybackUrl(props.file));
const previewMediaKey = computed(() => `${props.file?.id ?? ""}:${previewUrl.value}:${mediaRetryCount.value}`);
const isLockedFile = computed(() => Boolean(props.file?.lockedFile));
const canDownload = computed(() => Boolean(!isLockedFile.value && (previewUrl.value || (props.file?.sharedWithMe && props.file?.downloadable))));
const canManageVersions = computed(() => Boolean(
  props.file?.id &&
  props.file?.type !== "folder" &&
  !props.file?.sharedWithMe &&
  !isLockedFile.value &&
  !isEncryptedFile.value,
));

const onMediaReady = () => {
  isMediaLoading.value = false;
  mediaLoadError.value = "";
  releaseVideoThumbnailPriority();
};

const handlePreviewAssetError = async (event) => {
  const mediaErrCode = Number(event?.target?.error?.code || 0);
  if (mediaErrCode === 1) {
    return;
  }
  releaseVideoThumbnailPriority();
  if (isEncryptedFile.value && !hasRetriedStreamToken.value && props.file) {
    hasRetriedStreamToken.value = true;
    try {
      const freshUrl = await refreshEncryptedStreamUrl(props.file);
      if (freshUrl) {
        refreshedPreviewUrl.value = freshUrl;
        mediaLoadError.value = "";
        isMediaLoading.value = true;
        return;
      }
    } catch {
      // Keep existing error state when token refresh fails
    }
  }
  isMediaLoading.value = false;
  mediaLoadError.value =
    previewKind.value === "video"
      ? "영상을 불러오지 못했습니다. 코덱 지원 또는 네트워크 연결을 확인해 주세요."
      : previewKind.value === "image"
        ? "이미지를 불러오지 못했습니다."
        : "미디어를 재생하지 못했습니다.";
};

const retryMediaLoad = async () => {
  if (!props.file) return;
  mediaLoadError.value = "";
  isMediaLoading.value = true;
  if (isEncryptedFile.value) {
    hasRetriedStreamToken.value = true;
    try {
      const freshUrl = await refreshEncryptedStreamUrl(props.file);
      if (freshUrl) {
        refreshedPreviewUrl.value = freshUrl;
      }
    } catch {
      // Fall through to key bump retry
    }
  }
  mediaRetryCount.value += 1;
};

const resolveProtectedShareOptions = () => {
  if (!props.file?.sharedWithMe || !props.file?.passwordProtected) {
    return {};
  }
  const sharePassword = window.prompt("\uACF5\uC720 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
  if (sharePassword === null) {
    throw new Error("\uACF5\uC720 \uBE44\uBC00\uBC88\uD638\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.");
  }
  return { sharePassword };
};
const handleDownload = async () => {
  if (!canDownload.value || isDownloading.value) return;

  try {
    isDownloading.value = true;
    await downloadFileAsset(props.file, "file", resolveProtectedShareOptions());
  } catch (error) {
    window.alert(error?.message || "\uD30C\uC77C\uC744 \uB2E4\uC6B4\uB85C\uB4DC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  } finally {
    isDownloading.value = false;
  }
};
const statusChips = computed(() => {
  const chips = [];

  if (props.file?.sharedWithMe) {
    chips.push({ key: "shared-with-me", label: "공유받음", icon: "in", tone: "shared-in" });
  }

  if (props.file?.sharedFile && !props.file?.sharedWithMe) {
    chips.push({ key: "shared-file", label: "공유 중", icon: "out", tone: "shared-out" });
  }

  if (isLockedFile.value) {
    chips.push({ key: "locked", label: "잠금", icon: "lock", tone: "locked" });
  }

  if (isEncryptedFile.value) {
    chips.push({ key: "encrypted", label: "암호화됨", icon: "lock", tone: "encrypted" });
  }

  if (!chips.length) {
    chips.push({ key: "normal", label: "일반", icon: "dot", tone: "normal" });
  }

  return chips;
});

const formatBytes = (bytes) => {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** unitIndex;
  const fractionDigits = unitIndex === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;

  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
};

const formatDate = (value) => {
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
};

const locationLabel = computed(() => {
  if (!props.file) {
    return "홈";
  }

  if (props.file.sharedWithMe) {
    return "공유 문서함";
  }

  const parentPath = props.file.parentId != null
    ? fileStore.getFolderPath(props.file.parentId).map((folder) => folder.name)
    : [];

  return ["홈", ...parentPath].join(" / ");
});

let previousBodyOverflow = null;
const lockBodyScroll = () => {
  if (typeof document === "undefined" || previousBodyOverflow !== null) return;
  previousBodyOverflow = document.body.style.overflow || "";
  document.body.style.overflow = "hidden";
};
const unlockBodyScroll = () => {
  if (typeof document === "undefined" || previousBodyOverflow === null) return;
  document.body.style.overflow = previousBodyOverflow;
  previousBodyOverflow = null;
};

let stageTouchStartX = 0;
let stageTouchStartY = 0;
let stageTouchMulti = false;

const onStageTouchStart = (event) => {
  if ((event?.touches?.length || 0) > 1) {
    stageTouchMulti = true;
    return;
  }
  stageTouchMulti = false;
  if (event?.touches?.length === 1) {
    stageTouchStartX = event.touches[0].clientX;
    stageTouchStartY = event.touches[0].clientY;
  }
};

const onStageTouchEnd = (event) => {
  if (stageTouchMulti || navigableFiles.value.length <= 1) {
    if ((event?.touches?.length || 0) === 0) stageTouchMulti = false;
    return;
  }
  if (event?.changedTouches?.length === 1 && previewKind.value !== "pdf") {
    const deltaX = event.changedTouches[0].clientX - stageTouchStartX;
    const deltaY = event.changedTouches[0].clientY - stageTouchStartY;
    if (Math.abs(deltaX) > 52 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      if (deltaX > 0) {
        goPrevFile();
      } else {
        goNextFile();
      }
    }
  }
};

const handlePreviewKeydown = (event) => {
  if (!props.file) return;
  const tag = String(event.target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    handleClose();
  } else if (event.key === "ArrowLeft" && hasPrevFile.value) {
    event.preventDefault();
    goPrevFile();
  } else if (event.key === "ArrowRight" && hasNextFile.value) {
    event.preventDefault();
    goNextFile();
  }
};

const loadFileVersions = async () => {
  if (!canManageVersions.value) {
    fileVersions.value = [];
    fileVersionsError.value = "";
    isFileVersionsLoading.value = false;
    return;
  }

  isFileVersionsLoading.value = true;
  fileVersionsError.value = "";
  try {
    fileVersions.value = await fetchFileVersions(props.file.id);
  } catch (error) {
    fileVersionsError.value = error?.response?.data?.message || error?.message || "\uD30C\uC77C \uBC84\uC804\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
  } finally {
    isFileVersionsLoading.value = false;
  }
};

const handleRestoreVersion = async (version) => {
  if (!canManageVersions.value || !version?.idx || restoringVersionId.value) {
    return;
  }
  if (!window.confirm("\uC774 \uBC84\uC804\uC73C\uB85C \uD30C\uC77C\uC744 \uBCF5\uC6D0\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?")) {
    return;
  }

  restoringVersionId.value = version.idx;
  try {
    await restoreFileVersion(props.file.id, version.idx);
    await fileStore.refreshAll();
    await loadFileVersions();
  } catch (error) {
    window.alert(error?.response?.data?.message || error?.message || "\uD30C\uC77C \uBC84\uC804\uC744 \uBCF5\uC6D0\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  } finally {
    restoringVersionId.value = null;
  }
};
const loadTextPreview = async () => {
  if (!props.file?.id || previewKind.value !== "text") {
    textPreview.value = null;
    textPreviewError.value = "";
    isTextPreviewLoading.value = false;
    return;
  }

  if (isLockedFile.value) {
    textPreview.value = null;
    textPreviewError.value = "이 파일은 잠겨있습니다.";
    isTextPreviewLoading.value = false;
    return;
  }

  isTextPreviewLoading.value = true;
  textPreviewError.value = "";

  try {
    textPreview.value = await fileStore.fetchTextPreviewFor(props.file, resolveProtectedShareOptions());
  } catch (error) {
    textPreviewError.value = error?.response?.data?.message || error?.message || "텍스트 미리보기를 불러오지 못했습니다.";
  } finally {
    isTextPreviewLoading.value = false;
  }
};

watch(
  () => props.file,
  (file, prevFile) => {
    if ((file?.id ?? null) !== (prevFile?.id ?? null)) {
      if (videoPreviewRef.value) safePauseMedia(videoPreviewRef.value);
      if (audioPreviewRef.value) safePauseMedia(audioPreviewRef.value);
      refreshedPreviewUrl.value = "";
      hasRetriedStreamToken.value = false;
      mediaLoadError.value = "";
      mediaRetryCount.value = 0;
    }
    window.removeEventListener("keydown", handlePreviewKeydown);
    if (file) {
      lockBodyScroll();
      isMediaLoading.value = (previewKind.value === "video" || previewKind.value === "image") && !isLockedFile.value && Boolean(previewUrl.value);
      if (previewKind.value === "video" && !isLockedFile.value) {
        holdVideoThumbnailPriority();
      } else {
        releaseVideoThumbnailPriority();
      }
      fileStore.recordFileAccess?.(file);
      window.addEventListener("keydown", handlePreviewKeydown);
      if (prevFile?.id && file.id) {
        historyManager.updateItem(file.id);
      } else {
        historyManager.open(file.id);
      }
    } else {
      isMediaLoading.value = false;
      mediaLoadError.value = "";
      releaseVideoThumbnailPriority();
      unlockBodyScroll();
      historyManager.destroy();
    }
    loadTextPreview();
    loadFileVersions();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handlePreviewKeydown);
  onBeforeCloseTeardown();
  unlockBodyScroll();
  historyManager.destroy();
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="file"
      class="fixed inset-0 z-[270] flex items-center justify-center bg-slate-900/70 p-0 sm:px-4 sm:py-3"
      @click.self="handleClose"
    >
      <div class="flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900 sm:h-[min(92dvh,780px)] sm:rounded-3xl lg:flex-row">
        <!-- Mobile Top Bar (non-overlapping with media stage) -->
        <header class="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-slate-950 px-3 py-2 text-white lg:hidden">
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              class="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 text-xs font-bold text-white transition active:scale-95"
              title="뒤로가기"
              aria-label="뒤로가기"
              @click="handleClose"
            >
              <i class="fa-solid fa-arrow-left text-xs"></i>
              <span>뒤로</span>
            </button>
            <span
              v-if="navigableFiles.length > 1 && currentIndex >= 0"
              class="shrink-0 rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-300"
            >
              {{ currentIndex + 1 }} / {{ navigableFiles.length }}
            </span>
            <p class="truncate text-xs font-extrabold text-white">{{ file.name }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <button
              v-if="navigableFiles.length > 1"
              type="button"
              data-testid="preview-prev-mobile"
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-xs text-white transition disabled:opacity-35"
              :disabled="!hasPrevFile"
              aria-label="이전 파일"
              @click="goPrevFile"
            >
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button
              v-if="navigableFiles.length > 1"
              type="button"
              data-testid="preview-next-mobile"
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-xs text-white transition disabled:opacity-35"
              :disabled="!hasNextFile"
              aria-label="다음 파일"
              @click="goNextFile"
            >
              <i class="fa-solid fa-chevron-right"></i>
            </button>
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-white transition active:scale-95"
              title="닫기"
              aria-label="닫기"
              @click="handleClose"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        <div class="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <section
            class="relative flex min-h-[240px] shrink-0 flex-col items-center justify-center bg-slate-950 p-3 sm:min-h-[340px] sm:p-4 lg:h-full lg:min-h-0 lg:flex-1"
            @touchstart.passive="onStageTouchStart"
            @touchend.passive="onStageTouchEnd"
          >
            <!-- Desktop Index Counter Badge -->
            <div
              v-if="navigableFiles.length > 1 && currentIndex >= 0"
              class="absolute left-4 top-4 z-20 hidden rounded-full border border-white/15 bg-slate-900/80 px-2.5 py-1 text-[11px] font-bold text-slate-200 backdrop-blur lg:inline-flex"
            >
              {{ currentIndex + 1 }} / {{ navigableFiles.length }}
            </div>

            <!-- Desktop Prev/Next Stage Buttons -->
            <button
              v-if="hasPrevFile"
              type="button"
              data-testid="preview-prev-desktop"
              class="absolute left-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-900/75 text-white shadow-lg backdrop-blur transition hover:bg-blue-600 lg:inline-flex"
              title="이전 파일 (←)"
              aria-label="이전 파일"
              @click.stop="goPrevFile"
            >
              <i class="fa-solid fa-chevron-left text-sm"></i>
            </button>
            <button
              v-if="hasNextFile"
              type="button"
              data-testid="preview-next-desktop"
              class="absolute right-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-900/75 text-white shadow-lg backdrop-blur transition hover:bg-blue-600 lg:inline-flex"
              title="다음 파일 (→)"
              aria-label="다음 파일"
              @click.stop="goNextFile"
            >
              <i class="fa-solid fa-chevron-right text-sm"></i>
            </button>

            <div v-if="isLockedFile" class="flex h-full w-full flex-col items-center justify-center gap-3 rounded-3xl border border-amber-400/30 bg-amber-100/5 px-6 text-center text-amber-100">
              <div class="flex h-16 w-16 items-center justify-center rounded-full bg-amber-400/20">
                <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11c1.657 0 3-1.343 3-3S13.657 5 12 5s-3 1.343-3 3 1.343 3 3 3Zm-6 9v-3a6 6 0 0 1 12 0v3" />
                </svg>
              </div>
              <p class="text-lg font-semibold">이 파일은 잠겨있습니다.</p>
              <p class="text-sm text-amber-200/80">조회, 다운로드, 공유 등 관련 기능이 제한됩니다.</p>
            </div>

            <div
              v-else-if="mediaLoadError"
              data-testid="preview-media-error"
              class="flex max-w-md flex-col items-center justify-center rounded-3xl border border-amber-400/30 bg-slate-900/90 px-6 py-8 text-center text-slate-100 shadow-2xl"
            >
              <i class="fa-solid fa-triangle-exclamation text-2xl text-amber-300"></i>
              <p class="mt-3 text-xs leading-5 text-slate-300">{{ mediaLoadError }}</p>
              <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  data-testid="preview-retry-btn"
                  class="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-blue-500"
                  @click="retryMediaLoad"
                >
                  <i class="fa-solid fa-rotate-right"></i>
                  <span>다시 시도</span>
                </button>
                <button
                  v-if="canDownload"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700"
                  @click="handleDownload"
                >
                  <i class="fa-solid fa-download"></i>
                  <span>다운로드</span>
                </button>
              </div>
            </div>

            <template v-else-if="previewKind === 'image' && previewUrl">
              <img
                :key="previewMediaKey"
                :src="previewUrl"
                :alt="file.name"
                class="max-h-[44dvh] sm:max-h-[50dvh] max-w-full rounded-2xl object-contain lg:max-h-full"
                @load="onMediaReady"
                @error="handlePreviewAssetError"
              />
            </template>

            <template v-else-if="previewKind === 'video' && previewUrl">
              <video
                ref="videoPreviewRef"
                :key="previewMediaKey"
                :src="previewUrl"
                controls
                playsinline
                webkit-playsinline
                preload="metadata"
                class="max-h-[44dvh] sm:max-h-[50dvh] max-w-full rounded-2xl bg-black lg:max-h-full"
                @loadeddata="onMediaReady"
                @canplay="onMediaReady"
                @error="handlePreviewAssetError"
              ></video>
            </template>

            <audio
              v-else-if="previewKind === 'audio' && previewUrl"
              ref="audioPreviewRef"
              :key="previewMediaKey"
              :src="previewUrl"
              controls
              class="w-full max-w-xl px-2"
              @error="handlePreviewAssetError"
            ></audio>
            <iframe v-else-if="previewKind === 'pdf' && previewUrl" :src="previewUrl" class="h-[46dvh] sm:h-[55dvh] w-full rounded-2xl bg-white lg:h-full" title="PDF 미리보기"></iframe>

            <div v-else-if="previewKind === 'text'" class="flex h-[44dvh] sm:h-[52dvh] w-full flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 lg:h-full">
              <div v-if="isTextPreviewLoading" class="flex h-full items-center justify-center text-sm text-slate-300">텍스트 미리보기를 불러오는 중입니다.</div>
              <div v-else-if="textPreviewError" class="flex h-full items-center justify-center px-6 text-center text-sm text-rose-300">{{ textPreviewError }}</div>
              <div v-else class="flex h-full min-h-0 flex-col">
                <div class="border-b border-slate-800 px-4 py-2.5 text-xs text-slate-400">{{ textPreview?.truncated ? '미리보기용으로 일부만 표시합니다.' : '전체 텍스트를 표시합니다.' }}</div>
                <pre class="min-h-0 flex-1 overflow-auto px-4 py-3.5 text-xs sm:text-sm font-mono leading-5 sm:leading-6 text-slate-100 overscroll-contain">{{ textPreview?.content || '' }}</pre>
              </div>
            </div>

            <div v-else class="rounded-3xl border border-dashed border-slate-700 px-8 py-14 text-center text-sm text-slate-300">현재 형식은 바로 미리보기를 지원하지 않습니다.</div>

            <!-- Subtle Loading Indicator -->
            <div
              v-if="isMediaLoading && !mediaLoadError && (previewKind === 'video' || previewKind === 'image')"
              class="pointer-events-none absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-semibold text-slate-200 backdrop-blur"
            >
              <i class="fa-solid fa-spinner fa-spin text-blue-400"></i>
              <span>불러오는 중</span>
            </div>

            <!-- Mobile Quick Bridge Bar -->
            <div v-if="!isLockedFile && (previewKind === 'video' || previewKind === 'image')" class="mt-2.5 flex w-full justify-center lg:hidden">
              <button
                v-if="previewKind === 'video'"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border border-purple-400/40 bg-purple-500/20 px-4 py-1.5 text-xs font-extrabold text-purple-200 shadow-lg backdrop-blur transition hover:bg-purple-500/30"
                @click="handleOpenInMediaTheater"
              >
                <i class="fa-solid fa-clapperboard"></i>
                <span>미디어 플레이어로 전체화면 감상</span>
              </button>
              <button
                v-else-if="previewKind === 'image'"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-4 py-1.5 text-xs font-extrabold text-emerald-200 shadow-lg backdrop-blur transition hover:bg-emerald-500/30"
                @click="handleOpenInPhotoLightbox"
              >
                <i class="fa-solid fa-images"></i>
                <span>사진첩 라이트박스로 보기</span>
              </button>
            </div>
          </section>

          <aside class="flex w-full flex-col border-t border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:w-[360px] lg:border-l lg:border-t-0">
            <div class="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-slate-800 sm:px-6 sm:py-5">
              <div class="min-w-0">
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-slate-400">파일 정보</p>
                <h3 class="mt-2 truncate text-lg font-bold text-gray-900 dark:text-white sm:text-xl">{{ file.name }}</h3>
                <p class="mt-2 text-sm text-gray-500 dark:text-slate-400">{{ locationLabel }}</p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <span
                    v-for="chip in statusChips"
                    :key="chip.key"
                    class="status-pill"
                    :class="`status-pill--${chip.tone}`"
                  >
                    <span class="status-pill__icon" :class="`status-pill__icon--${chip.icon}`"></span>
                    {{ chip.label }}
                  </span>
                </div>
              </div>

              <button type="button" class="hidden rounded-full p-2 text-gray-400 transition hover:bg-slate-100 hover:text-gray-600 active:scale-95 lg:inline-flex" title="닫기" aria-label="닫기" @click="handleClose">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

        <div class="flex-1 space-y-5 px-5 py-4 sm:px-6 sm:py-5 lg:overflow-y-auto">
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div class="rounded-2xl bg-slate-50 px-4 py-3.5"><p class="text-xs font-semibold uppercase tracking-wide text-gray-400">형식</p><p class="mt-1.5 text-sm font-bold text-gray-900">{{ (extension || '-').toUpperCase() }}</p></div>
            <div class="rounded-2xl bg-slate-50 px-4 py-3.5"><p class="text-xs font-semibold uppercase tracking-wide text-gray-400">크기</p><p class="mt-1.5 text-sm font-bold text-gray-900">{{ formatBytes(file.sizeBytes) }}</p></div>
          </div>

          <div class="rounded-2xl border border-gray-200 px-4 py-4">
            <dl class="space-y-3 text-sm text-gray-600">
              <div class="flex items-center justify-between gap-4"><dt>업로드 시각</dt><dd class="text-right font-semibold text-gray-900">{{ formatDate(file.uploadDate) }}</dd></div>
              <div class="flex items-center justify-between gap-4"><dt>수정 시각</dt><dd class="text-right font-semibold text-gray-900">{{ formatDate(file.updatedAt) }}</dd></div>
              <div class="flex items-center justify-between gap-4"><dt>위치</dt><dd class="text-right font-semibold text-gray-900">{{ locationLabel }}</dd></div>
              <div v-if="file.sharedWithMe" class="flex items-center justify-between gap-4"><dt>공유한 사람</dt><dd class="text-right font-semibold text-gray-900">{{ file.ownerName || file.ownerEmail || '-' }}</dd></div>
              <div v-if="file.sharedWithMe" class="flex items-center justify-between gap-4"><dt>공유 시각</dt><dd class="text-right font-semibold text-gray-900">{{ formatDate(file.sharedAt) }}</dd></div>
              <div class="flex items-start justify-between gap-4">
                <dt>상태</dt>
                <dd>
                  <div class="flex flex-wrap justify-end gap-2">
                    <span
                      v-for="chip in statusChips"
                      :key="`panel-${chip.key}`"
                      class="status-pill"
                      :class="`status-pill--${chip.tone}`"
                    >
                      <span class="status-pill__icon" :class="`status-pill__icon--${chip.icon}`"></span>
                      {{ chip.label }}
                    </span>
                  </div>
                </dd>
              </div>
            </dl>
          </div>
          <div v-if="canManageVersions" class="file-version-panel rounded-2xl border border-gray-200 px-4 py-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-gray-900">{{ "\uD30C\uC77C \uBC84\uC804" }}</p>
                <p class="mt-1 text-xs text-gray-500">{{ "\uAD50\uCCB4 \uC804 \uD30C\uC77C\uC744 \uBCF5\uC6D0\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." }}</p>
              </div>
              <button type="button" class="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50" :disabled="isFileVersionsLoading" @click="loadFileVersions">{{ "\uC0C8\uB85C\uACE0\uCE68" }}</button>
            </div>
            <div v-if="isFileVersionsLoading" class="mt-3 rounded-2xl bg-slate-50 px-4 py-5 text-center text-sm text-gray-500">{{ "\uBC84\uC804\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4." }}</div>
            <div v-else-if="fileVersionsError" class="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{{ fileVersionsError }}</div>
            <div v-else-if="fileVersions.length === 0" class="mt-3 rounded-2xl bg-slate-50 px-4 py-5 text-center text-sm text-gray-500">{{ "\uC800\uC7A5\uB41C \uC774\uC804 \uBC84\uC804\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }}</div>
            <div v-else class="mt-3 space-y-2">
              <div v-for="version in fileVersions" :key="version.idx" class="rounded-2xl bg-slate-50 px-3 py-3">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-gray-900">v{{ version.versionNumber }} · {{ version.fileOriginName }}</p>
                    <p class="mt-1 text-xs text-gray-500">{{ formatDate(version.createdAt) }} · {{ formatBytes(version.fileSize) }}</p>
                  </div>
                  <button type="button" class="shrink-0 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300" :disabled="restoringVersionId === version.idx" @click="handleRestoreVersion(version)">{{ restoringVersionId === version.idx ? "\uBCF5\uC6D0 \uC911" : "\uBCF5\uC6D0" }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="sticky bottom-0 space-y-2 border-t border-gray-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6 sm:py-5">
          <button
            v-if="previewKind === 'video' && !isLockedFile"
            type="button"
            class="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-purple-500/30 bg-purple-500/10 px-4 py-2.5 text-xs font-extrabold text-purple-600 transition hover:bg-purple-500/20 dark:text-purple-300"
            @click="handleOpenInMediaTheater"
          >
            <i class="fa-solid fa-clapperboard"></i>
            <span>미디어 시어터 플레이어로 열기 (이어보기·배속·자막)</span>
          </button>

          <button
            v-else-if="previewKind === 'image' && !isLockedFile"
            type="button"
            class="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-extrabold text-emerald-600 transition hover:bg-emerald-500/20 dark:text-emerald-300"
            @click="handleOpenInPhotoLightbox"
          >
            <i class="fa-solid fa-images"></i>
            <span>사진첩 라이트박스로 열기 (확대·회전·슬라이드쇼)</span>
          </button>

          <button
            v-if="canShareDownloadLink"
            type="button"
            class="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-sky-500/35 bg-sky-500/10 px-4 py-2.5 text-xs font-extrabold text-sky-600 transition hover:bg-sky-500/20 dark:text-sky-300"
            @click="emit('share-download-link', file)"
          >
            <i class="fa-solid fa-link"></i>
            <span>다운로드 링크 공유</span>
          </button>

          <button v-if="!canDownload" type="button" class="inline-flex w-full items-center justify-center rounded-2xl bg-slate-200 px-4 py-3 text-sm font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400" disabled>
            {{ isLockedFile ? '잠긴 파일은 다운로드할 수 없습니다.' : '다운로드 불가' }}
          </button>
          <button v-else type="button" class="inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300" :disabled="isDownloading" @click="handleDownload">{{ isDownloading ? "다운로드 중..." : "다운로드" }}</button>
        </div>
      </aside>
        </div>
      </div>
    </div>
  </Teleport>
</template>
<style scoped>
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.38rem;
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 0.38rem 0.72rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.status-pill__icon {
  position: relative;
  display: inline-flex;
  height: 0.95rem;
  width: 0.95rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
}

.status-pill__icon--dot::before {
  content: "";
  height: 0.32rem;
  width: 0.32rem;
  border-radius: 999px;
  background: currentColor;
}

.status-pill__icon--lock::before {
  content: "";
  width: 0.36rem;
  height: 0.26rem;
  border: 1.6px solid currentColor;
  border-radius: 0.08rem;
  transform: translateY(0.09rem);
}

.status-pill__icon--lock::after {
  content: "";
  position: absolute;
  top: 0.11rem;
  width: 0.38rem;
  height: 0.34rem;
  border: 1.6px solid currentColor;
  border-bottom: 0;
  border-radius: 999px 999px 0 0;
}

.status-pill__icon--in::before,
.status-pill__icon--out::before {
  content: "";
  position: absolute;
  width: 0.42rem;
  height: 0.42rem;
  border-top: 1.8px solid currentColor;
  border-right: 1.8px solid currentColor;
}

.status-pill__icon--in::before {
  transform: rotate(135deg) translate(-0.02rem, -0.02rem);
}

.status-pill__icon--out::before {
  transform: rotate(-45deg) translate(-0.02rem, -0.02rem);
}

.status-pill--shared-in {
  border-color: #bae6fd;
  background: linear-gradient(135deg, #ecfeff 0%, #eff6ff 100%);
  color: #0f766e;
}

.status-pill--shared-in .status-pill__icon {
  background: rgba(6, 182, 212, 0.14);
}

.status-pill--shared-out {
  border-color: #bbf7d0;
  background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
  color: #166534;
}

.status-pill--shared-out .status-pill__icon {
  background: rgba(34, 197, 94, 0.14);
}

.status-pill--locked {
  border-color: #fde68a;
  background: linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%);
  color: #b45309;
}

.status-pill--locked .status-pill__icon {
  background: rgba(245, 158, 11, 0.16);
}

.status-pill--normal {
  border-color: #e2e8f0;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  color: #475569;
}

.status-pill--normal .status-pill__icon {
  background: rgba(100, 116, 139, 0.12);
}

.status-pill--encrypted {
  border-color: #c7d2fe;
  background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
  color: #3730a3;
}

.status-pill--encrypted .status-pill__icon {
  background: rgba(79, 70, 229, 0.14);
}
</style>
