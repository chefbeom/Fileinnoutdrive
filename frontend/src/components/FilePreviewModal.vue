<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useFileStore } from "@/stores/useFileStore.js";
import { useMediaPhotoStore } from "@/stores/useMediaPhotoStore.js";
import { downloadFileAsset, fetchFileVersions, restoreFileVersion } from "@/api/filesApi.js";
import {
  ModalBackHistoryManager,
  safeExitFullscreen,
  safePauseMedia,
} from "@/utils/modalBackHistory.js";

const props = defineProps({
  file: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["close"]);
const fileStore = useFileStore();
const mediaPhotoStore = useMediaPhotoStore();

const videoPreviewRef = ref(null);
const audioPreviewRef = ref(null);

const onBeforeCloseTeardown = () => {
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

const handleOpenInMediaTheater = () => {
  if (!props.file || isLockedFile.value) return;
  const target = props.file;
  onBeforeCloseTeardown();
  historyManager.handoffTo("media-theater", target.id);
  emit("close");
  mediaPhotoStore.openTheater(target);
};

const handleOpenInPhotoLightbox = () => {
  if (!props.file || isLockedFile.value) return;
  const target = props.file;
  onBeforeCloseTeardown();
  historyManager.handoffTo("photo-lightbox", target.id);
  emit("close");
  mediaPhotoStore.openPhotoLightbox(target);
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

const previewUrl = computed(() => props.file?.downloadUrl || props.file?.presignedDownloadUrl || "");
const isLockedFile = computed(() => Boolean(props.file?.lockedFile));
const canDownload = computed(() => Boolean(!isLockedFile.value && (previewUrl.value || (props.file?.sharedWithMe && props.file?.downloadable))));
const canManageVersions = computed(() => Boolean(props.file?.id && props.file?.type !== "folder" && !props.file?.sharedWithMe && !isLockedFile.value));

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

const closeOnEscape = (event) => {
  if (event.key === "Escape") {
    handleClose();
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
    window.removeEventListener("keydown", closeOnEscape);
    if (file) {
      fileStore.recordFileAccess?.(file);
      window.addEventListener("keydown", closeOnEscape);
      if (prevFile?.id && file.id) {
        historyManager.updateItem(file.id);
      } else {
        historyManager.open(file.id);
      }
    } else {
      historyManager.destroy();
    }
    loadTextPreview();
    loadFileVersions();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", closeOnEscape);
  onBeforeCloseTeardown();
  historyManager.destroy();
});
</script>

<template>
  <div v-if="file" class="fixed inset-0 z-[270] flex items-center justify-center bg-slate-900/60 px-2.5 py-3 sm:px-4" @click.self="handleClose">
    <div class="flex h-[min(92dvh,780px)] w-full max-w-6xl flex-col overflow-y-auto rounded-3xl bg-white shadow-2xl dark:bg-slate-900 lg:flex-row lg:overflow-hidden">
      <section class="relative flex min-h-[260px] shrink-0 flex-col items-center justify-center bg-slate-950 p-3 sm:min-h-[340px] sm:p-4 lg:h-full lg:min-h-0 lg:flex-1">
        <!-- Mobile Top Left Back Button -->
        <button
          type="button"
          class="absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-slate-900/85 px-3 py-1.5 text-xs font-bold text-white shadow-lg ring-1 ring-white/20 backdrop-blur transition hover:bg-slate-800 active:scale-95 lg:hidden"
          title="뒤로가기"
          aria-label="뒤로가기"
          @click="handleClose"
        >
          <i class="fa-solid fa-arrow-left text-xs"></i>
          <span>뒤로</span>
        </button>

        <!-- Mobile Top Right Close Button -->
        <button
          type="button"
          class="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/80 text-white shadow-lg ring-1 ring-white/20 backdrop-blur transition hover:bg-slate-800 active:scale-95 lg:hidden"
          title="닫기"
          aria-label="닫기"
          @click="handleClose"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" />
          </svg>
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

        <img v-else-if="previewKind === 'image' && previewUrl" :src="previewUrl" :alt="file.name" class="max-h-[44vh] sm:max-h-[50vh] max-w-full rounded-2xl object-contain lg:max-h-full" />
        <video v-else-if="previewKind === 'video' && previewUrl" ref="videoPreviewRef" :src="previewUrl" controls playsinline preload="metadata" class="max-h-[44vh] sm:max-h-[50vh] max-w-full rounded-2xl bg-black lg:max-h-full"></video>
        <audio v-else-if="previewKind === 'audio' && previewUrl" ref="audioPreviewRef" :src="previewUrl" controls class="w-full max-w-xl px-2"></audio>
        <iframe v-else-if="previewKind === 'pdf' && previewUrl" :src="previewUrl" class="h-[46vh] sm:h-[55vh] w-full rounded-2xl bg-white lg:h-full" title="PDF 미리보기"></iframe>

        <div v-else-if="previewKind === 'text'" class="flex h-[44vh] sm:h-[52vh] w-full flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 lg:h-full">
          <div v-if="isTextPreviewLoading" class="flex h-full items-center justify-center text-sm text-slate-300">텍스트 미리보기를 불러오는 중입니다.</div>
          <div v-else-if="textPreviewError" class="flex h-full items-center justify-center px-6 text-center text-sm text-rose-300">{{ textPreviewError }}</div>
          <div v-else class="flex h-full min-h-0 flex-col">
            <div class="border-b border-slate-800 px-4 py-2.5 text-xs text-slate-400">{{ textPreview?.truncated ? '미리보기용으로 일부만 표시합니다.' : '전체 텍스트를 표시합니다.' }}</div>
            <pre class="min-h-0 flex-1 overflow-auto px-4 py-3.5 text-xs sm:text-sm font-mono leading-5 sm:leading-6 text-slate-100 overscroll-contain">{{ textPreview?.content || '' }}</pre>
          </div>
        </div>

        <div v-else class="rounded-3xl border border-dashed border-slate-700 px-8 py-14 text-center text-sm text-slate-300">현재 형식은 바로 미리보기를 지원하지 않습니다.</div>

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

          <button type="button" class="rounded-full p-2 text-gray-400 transition hover:bg-slate-100 hover:text-gray-600 active:scale-95" title="닫기" aria-label="닫기" @click="handleClose">
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

          <button v-if="!canDownload" type="button" class="inline-flex w-full items-center justify-center rounded-2xl bg-slate-200 px-4 py-3 text-sm font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400" disabled>
            {{ isLockedFile ? '잠긴 파일은 다운로드할 수 없습니다.' : '다운로드 불가' }}
          </button>
          <button v-else type="button" class="inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300" :disabled="isDownloading" @click="handleDownload">{{ isDownloading ? "다운로드 중..." : "다운로드" }}</button>
        </div>
      </aside>
    </div>
  </div>
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
</style>
