<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useMediaPhotoStore, convertSrtToVtt, formatDurationClock } from "@/stores/useMediaPhotoStore.js";
import { downloadFileAsset } from "@/api/filesApi.js";
import { getCachedFileThumbnailUrl, loadFileThumbnailUrl } from "@/utils/fileThumbnailCache.js";
import {
  isEncryptedVaultFile,
  refreshEncryptedStreamUrl,
  resolveFilePlaybackUrl,
  resolveFileThumbnailFallbackUrl,
} from "@/utils/fileMediaUrl.js";
import {
  ModalBackHistoryManager,
  safeExitFullscreen,
  safePauseMedia,
} from "@/utils/modalBackHistory.js";

const props = defineProps({
  videoId: {
    type: [String, Number],
    default: null,
  },
  playlistIds: {
    type: Array,
    default: () => [],
  },
  collectionId: {
    type: String,
    default: null,
  },
});

const emit = defineEmits(["close", "open-share"]);

const router = useRouter();
const mediaPhotoStore = useMediaPhotoStore();

const videoRef = ref(null);
const subtitleInputRef = ref(null);
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const playbackRate = ref(1.0);
const isRepeat = ref(false);
const isMuted = ref(false);
const volume = ref(1.0);
const playbackError = ref("");
const isDownloading = ref(false);
const showResumeToast = ref(false);
const resumedFromSeconds = ref(0);
const activePanelTab = ref("queue"); // 'queue' | 'info' | 'collections'
const newCollectionName = ref("");
const customSubtitleTrackUrl = ref("");
const customSubtitleLabel = ref("");
const activeSubtitleId = ref("none");
const autoLoadedSubtitleTracks = ref([]);
const thumbnailMap = ref({});
const refreshedStreamUrl = ref("");
const hasRetriedStreamToken = ref(false);

let progressThrottleTimer = null;
let resumeToastTimer = null;

const playbackRateOptions = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

const currentItem = computed(() => {
  if (props.videoId == null) return null;
  return mediaPhotoStore.getMediaItemById(props.videoId);
});

const isImageItem = computed(() => currentItem.value?.mediaKind === "image");

const streamUrl = computed(() => (
  refreshedStreamUrl.value ||
  resolveFilePlaybackUrl(currentItem.value)
));

const playlistItems = computed(() => {
  const ids = props.playlistIds?.length
    ? props.playlistIds
    : (currentItem.value ? [String(currentItem.value.id)] : []);
  return ids.map((id) => mediaPhotoStore.getMediaItemById(id)).filter(Boolean);
});

const currentIndex = computed(() => {
  if (!currentItem.value) return -1;
  return playlistItems.value.findIndex((item) => String(item.id) === String(currentItem.value.id));
});

const hasPrevItem = computed(() => currentIndex.value > 0);
const hasNextItem = computed(() => currentIndex.value >= 0 && currentIndex.value < playlistItems.value.length - 1);
const nextItem = computed(() => (hasNextItem.value ? playlistItems.value[currentIndex.value + 1] : null));

const collections = computed(() => mediaPhotoStore.resolvedMediaCollections);

const isItemInCollection = (collection) => {
  if (!currentItem.value || !collection) return false;
  return (collection.itemIds || []).some((id) => String(id) === String(currentItem.value.id));
};

const loadQueueThumbnails = async () => {
  for (const item of playlistItems.value.slice(0, 30)) {
    const key = String(item.id);
    if (thumbnailMap.value[key]) continue;
    const cached = getCachedFileThumbnailUrl(item) || resolveFileThumbnailFallbackUrl(item);
    if (cached) {
      thumbnailMap.value = { ...thumbnailMap.value, [key]: cached };
      continue;
    }
    loadFileThumbnailUrl(item).then((url) => {
      if (url) {
        thumbnailMap.value = { ...thumbnailMap.value, [key]: url };
      }
    }).catch(() => {});
  }
};

const clearSubtitleBlobs = () => {
  if (customSubtitleTrackUrl.value) {
    URL.revokeObjectURL(customSubtitleTrackUrl.value);
    customSubtitleTrackUrl.value = "";
  }
  for (const track of autoLoadedSubtitleTracks.value) {
    if (track.blobUrl) {
      URL.revokeObjectURL(track.blobUrl);
    }
  }
  autoLoadedSubtitleTracks.value = [];
};

const loadMatchingSubtitles = async (video) => {
  clearSubtitleBlobs();
  activeSubtitleId.value = "none";

  if (!video || !Array.isArray(video.matchingSubtitles) || !video.matchingSubtitles.length) {
    return;
  }

  const loaded = [];
  for (const subFile of video.matchingSubtitles) {
    try {
      const preview = await mediaPhotoStore.ensureCatalogLoaded().then(() => null);
      void preview;
      const subUrl = resolveFilePlaybackUrl(subFile);
      if (!subUrl) continue;
      const resp = await fetch(subUrl);
      if (!resp.ok) continue;
      const rawText = await resp.text();
      const ext = String(subFile.extension || "").toLowerCase();
      const vttContent = ext === "srt" ? convertSrtToVtt(rawText) : rawText;
      const blob = new Blob([vttContent], { type: "text/vtt;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      loaded.push({
        id: String(subFile.id),
        label: subFile.name || "자막",
        blobUrl,
      });
    } catch {
      // Ignore subtitle fetch error
    }
  }

  autoLoadedSubtitleTracks.value = loaded;
  if (loaded.length > 0 && mediaPhotoStore.preferences.autoLoadSubtitles) {
    activeSubtitleId.value = loaded[0].id;
  }
};

const handleLocalSubtitleSelect = async (event) => {
  const file = event?.target?.files?.[0];
  if (!file) return;
  try {
    const rawText = await file.text();
    const isSrt = file.name.toLowerCase().endsWith(".srt");
    const vttText = isSrt ? convertSrtToVtt(rawText) : rawText;
    if (customSubtitleTrackUrl.value) {
      URL.revokeObjectURL(customSubtitleTrackUrl.value);
    }
    const blob = new Blob([vttText], { type: "text/vtt;charset=utf-8" });
    customSubtitleTrackUrl.value = URL.createObjectURL(blob);
    customSubtitleLabel.value = file.name;
    activeSubtitleId.value = "custom";
  } catch {
    window.alert("자막 파일을 불러오지 못했습니다.");
  } finally {
    if (event?.target) {
      event.target.value = "";
    }
  }
};

const availableSubtitleTracks = computed(() => {
  const tracks = [...autoLoadedSubtitleTracks.value];
  if (customSubtitleTrackUrl.value) {
    tracks.push({
      id: "custom",
      label: `${customSubtitleLabel.value} (직접 선택)`,
      blobUrl: customSubtitleTrackUrl.value,
    });
  }
  return tracks;
});

const onLoadedMetadata = () => {
  const el = videoRef.value;
  if (!el || !currentItem.value) return;

  const vidDuration = Number(el.duration || 0) || 0;
  const vidWidth = Number(el.videoWidth || 0) || 0;
  const vidHeight = Number(el.videoHeight || 0) || 0;

  duration.value = vidDuration;
  mediaPhotoStore.recordVideoMetadata(currentItem.value.id, {
    durationSeconds: vidDuration,
    width: vidWidth,
    height: vidHeight,
  });

  // Apply default playback rate
  const desiredRate = Number(mediaPhotoStore.preferences.defaultPlaybackRate || 1.0);
  el.playbackRate = desiredRate;
  playbackRate.value = desiredRate;

  // Check if we should resume from saved watch history
  const savedPos = Number(currentItem.value.positionSeconds || 0);
  if (
    mediaPhotoStore.preferences.enableContinueWatching &&
    savedPos >= 5 &&
    (!vidDuration || savedPos < vidDuration * 0.92)
  ) {
    try {
      el.currentTime = savedPos;
      currentTime.value = savedPos;
      resumedFromSeconds.value = savedPos;
      showResumeToast.value = true;
      if (resumeToastTimer) clearTimeout(resumeToastTimer);
      resumeToastTimer = setTimeout(() => {
        showResumeToast.value = false;
      }, 6500);
    } catch {
      // Ignore seek error
    }
  }

  el.play().catch(() => {});
};

const restartFromBeginning = () => {
  const el = videoRef.value;
  showResumeToast.value = false;
  if (!el) return;
  el.currentTime = 0;
  currentTime.value = 0;
  if (currentItem.value) {
    mediaPhotoStore.recordWatchProgress(currentItem.value.id, 0, duration.value);
  }
  el.play().catch(() => {});
};

const onTimeUpdate = () => {
  const el = videoRef.value;
  if (!el || !currentItem.value) return;
  currentTime.value = Number(el.currentTime || 0);
  if (el.duration && Number.isFinite(el.duration)) {
    duration.value = el.duration;
  }

  if (!progressThrottleTimer) {
    progressThrottleTimer = setTimeout(() => {
      progressThrottleTimer = null;
      if (currentItem.value && videoRef.value) {
        mediaPhotoStore.recordWatchProgress(
          currentItem.value.id,
          videoRef.value.currentTime,
          videoRef.value.duration || duration.value,
        );
      }
    }, 3500);
  }
};

const onPlay = () => {
  isPlaying.value = true;
};

const onPause = () => {
  isPlaying.value = false;
  if (currentItem.value && videoRef.value) {
    mediaPhotoStore.recordWatchProgress(
      currentItem.value.id,
      videoRef.value.currentTime,
      videoRef.value.duration || duration.value,
    );
  }
};

const onEnded = () => {
  isPlaying.value = false;
  if (currentItem.value) {
    mediaPhotoStore.markVideoCompleted(currentItem.value.id);
  }

  if (isRepeat.value && videoRef.value) {
    videoRef.value.currentTime = 0;
    videoRef.value.play().catch(() => {});
    return;
  }

  if (mediaPhotoStore.preferences.autoPlayNext && hasNextItem.value) {
    playPlaylistIndex(currentIndex.value + 1);
  }
};

const onVideoError = async () => {
  if (isEncryptedVaultFile(currentItem.value) && !hasRetriedStreamToken.value) {
    hasRetriedStreamToken.value = true;
    try {
      const freshUrl = await refreshEncryptedStreamUrl(currentItem.value);
      if (freshUrl) {
        refreshedStreamUrl.value = freshUrl;
        playbackError.value = "";
        return;
      }
    } catch {
      // Fall through to generic playback error banner
    }
  }
  playbackError.value = "이 영상 코덱 또는 컨테이너 형식은 현재 브라우저에서 직접 스트리밍을 지원하지 않습니다. 원본 파일을 다운로드하여 로컬 미디어 플레이어에서 재생해 주세요.";
};

const togglePlayPause = () => {
  const el = videoRef.value;
  if (!el) return;
  if (el.paused) {
    el.play().catch(() => {});
  } else {
    el.pause();
  }
};

const seekBy = (deltaSeconds) => {
  const el = videoRef.value;
  if (!el) return;
  const maxTime = Number(el.duration || duration.value || 0);
  const nextTime = Math.max(0, Math.min(maxTime || Infinity, (el.currentTime || 0) + deltaSeconds));
  el.currentTime = nextTime;
  currentTime.value = nextTime;
};

const setPlaybackSpeed = (rate) => {
  playbackRate.value = rate;
  if (videoRef.value) {
    videoRef.value.playbackRate = rate;
  }
};

const toggleMute = () => {
  const el = videoRef.value;
  if (!el) return;
  el.muted = !el.muted;
  isMuted.value = el.muted;
};

const toggleFullscreen = () => {
  const el = videoRef.value;
  if (!el) return;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  } else {
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (el.webkitEnterFullscreen) {
      // iOS Safari video fullscreen support
      el.webkitEnterFullscreen();
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
  }
};

const playPlaylistIndex = (index) => {
  const target = playlistItems.value[index];
  if (!target) return;
  mediaPhotoStore.openTheater(target.id, {
    playlistIds: props.playlistIds,
    collectionId: props.collectionId,
  });
};

const onBeforeCloseTeardown = () => {
  safeExitFullscreen();
  if (videoRef.value) {
    safePauseMedia(videoRef.value);
  }
  if (currentItem.value && videoRef.value && !isImageItem.value) {
    mediaPhotoStore.recordWatchProgress(
      currentItem.value.id,
      videoRef.value.currentTime,
      videoRef.value.duration || duration.value,
    );
  }
};

const historyManager = new ModalBackHistoryManager({
  modalId: "media-theater",
  onBeforeClose: onBeforeCloseTeardown,
  onClose: () => {
    mediaPhotoStore.closeTheater();
    emit("close");
  },
});

const handleMinimizeToMiniPlayer = () => {
  if (!currentItem.value || isImageItem.value) return;
  const pos = videoRef.value ? videoRef.value.currentTime : currentTime.value;
  mediaPhotoStore.recordWatchProgress(currentItem.value.id, pos, duration.value);
  mediaPhotoStore.minimizeToMiniPlayer({
    positionSeconds: pos,
    isPlaying: isPlaying.value,
    playbackRate: playbackRate.value,
    muted: isMuted.value,
  });
  historyManager.requestClose();
};

const handleClose = () => {
  historyManager.requestClose();
};

const handleDownload = async () => {
  if (!currentItem.value || isDownloading.value) return;
  try {
    isDownloading.value = true;
    await downloadFileAsset(currentItem.value, currentItem.value.name || "video");
  } catch (error) {
    window.alert(error?.message || "파일을 다운로드하지 못했습니다.");
  } finally {
    isDownloading.value = false;
  }
};

const handleGoToOriginalFolder = async () => {
  if (!currentItem.value) return;
  const target = currentItem.value;
  historyManager.requestClose();
  await mediaPhotoStore.navigateToOriginalFolder(target, router);
};

const toggleCollectionMembership = (collection) => {
  if (!currentItem.value || !collection) return;
  if (isItemInCollection(collection)) {
    mediaPhotoStore.removeItemsFromMediaCollection(collection.id, [currentItem.value.id]);
  } else {
    mediaPhotoStore.addItemsToMediaCollection(collection.id, [currentItem.value.id]);
  }
};

const handleQuickCreateCollection = () => {
  const name = newCollectionName.value.trim();
  if (!name || !currentItem.value) return;
  mediaPhotoStore.createMediaCollection({
    name,
    itemIds: [currentItem.value.id],
    coverFileId: currentItem.value.id,
  });
  newCollectionName.value = "";
};

const handleKeydown = (event) => {
  if (!currentItem.value) return;
  const tag = String(event.target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    handleClose();
  } else if (event.key === " " || event.key === "k" || event.key === "K") {
    if (!isImageItem.value) {
      event.preventDefault();
      togglePlayPause();
    }
  } else if (event.key === "ArrowLeft" || event.key === "j" || event.key === "J") {
    if (!isImageItem.value) {
      event.preventDefault();
      seekBy(-10);
    } else if (hasPrevItem.value) {
      event.preventDefault();
      playPlaylistIndex(currentIndex.value - 1);
    }
  } else if (event.key === "ArrowRight" || event.key === "l" || event.key === "L") {
    if (!isImageItem.value) {
      event.preventDefault();
      seekBy(10);
    } else if (hasNextItem.value) {
      event.preventDefault();
      playPlaylistIndex(currentIndex.value + 1);
    }
  } else if (event.key === "m" || event.key === "M") {
    if (!isImageItem.value) {
      event.preventDefault();
      toggleMute();
    }
  } else if (event.key === "f" || event.key === "F") {
    if (!isImageItem.value) {
      event.preventDefault();
      toggleFullscreen();
    }
  }
};

watch(
  () => props.videoId,
  async (newId, oldId) => {
    refreshedStreamUrl.value = "";
    hasRetriedStreamToken.value = false;
    playbackError.value = "";
    showResumeToast.value = false;
    currentTime.value = 0;
    duration.value = Number(currentItem.value?.durationSeconds || 0);

    if (newId != null) {
      if (oldId != null) {
        historyManager.updateItem(newId);
      } else {
        historyManager.open(newId);
      }
    } else {
      historyManager.destroy();
    }

    await nextTick();
    if (currentItem.value && !isImageItem.value) {
      void loadMatchingSubtitles(currentItem.value);
    }
    void loadQueueThumbnails();
  },
  { immediate: true },
);

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  if (progressThrottleTimer) clearTimeout(progressThrottleTimer);
  if (resumeToastTimer) clearTimeout(resumeToastTimer);
  clearSubtitleBlobs();
  historyManager.destroy();
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="currentItem"
      class="fixed inset-0 z-[290] flex flex-col bg-slate-950/95 text-slate-100 backdrop-blur-md"
      @click.self="handleClose"
    >
      <!-- Top Bar -->
      <header class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-slate-900/90 px-3 py-2 sm:px-6 sm:py-3 shrink-0">
        <div class="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            class="inline-flex h-9 min-w-[36px] sm:h-9 sm:w-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-2 sm:px-0 text-slate-200 transition hover:bg-slate-700 active:scale-95"
            title="시어터 닫기 (Esc)"
            aria-label="뒤로가기"
            @click="handleClose"
          >
            <i class="fa-solid fa-arrow-left text-sm"></i>
            <span class="text-xs font-bold sm:hidden">뒤로</span>
          </button>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 sm:gap-2">
              <span
                v-if="currentItem.resolutionLabel"
                class="rounded-md bg-blue-500/20 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-extrabold text-blue-300 ring-1 ring-blue-400/30 shrink-0"
              >
                {{ currentItem.resolutionLabel }}
              </span>
              <span
                v-if="currentItem.completed"
                class="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-emerald-300 shrink-0"
              >
                시청 완료
              </span>
              <h2 class="truncate text-xs font-extrabold text-white sm:text-base">
                {{ currentItem.name }}
              </h2>
            </div>
            <p class="mt-0.5 truncate text-[11px] sm:text-xs text-slate-400">
              {{ currentItem.folderPathLabel }} · {{ currentItem.sizeLabel }}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-1 sm:gap-2 shrink-0">
          <!-- Favorite toggle -->
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 sm:px-3 text-xs font-bold transition"
            :class="currentItem.isFavorite
              ? 'border-amber-400/50 bg-amber-500/20 text-amber-300'
              : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'"
            title="즐겨찾기"
            @click="mediaPhotoStore.toggleMediaFavorite(currentItem.id)"
          >
            <i :class="currentItem.isFavorite ? 'fa-solid fa-star text-amber-400' : 'fa-regular fa-star'"></i>
            <span class="hidden md:inline">{{ currentItem.isFavorite ? "즐겨찾기됨" : "즐겨찾기" }}</span>
          </button>

          <!-- Minimize to Mini Player -->
          <button
            v-if="!isImageItem && !playbackError"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-1.5 sm:px-3 text-xs font-bold text-indigo-300 transition hover:bg-indigo-500/25"
            title="미니 플레이어로 축소"
            @click="handleMinimizeToMiniPlayer"
          >
            <i class="fa-solid fa-clone text-xs"></i>
            <span class="hidden sm:inline">미니 플레이어</span>
          </button>

          <!-- Go to Original Folder -->
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-1.5 sm:px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-700"
            title="원본 폴더로 이동"
            @click="handleGoToOriginalFolder"
          >
            <i class="fa-regular fa-folder-open text-amber-400"></i>
            <span class="hidden md:inline">원본 폴더</span>
          </button>

          <!-- Download -->
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-2.5 py-1.5 sm:px-3.5 text-xs font-bold text-white transition hover:bg-blue-500 disabled:opacity-50"
            :disabled="isDownloading"
            title="다운로드"
            @click="handleDownload"
          >
            <i class="fa-solid fa-download"></i>
            <span class="hidden sm:inline">{{ isDownloading ? "다운로드 중..." : "다운로드" }}</span>
          </button>

          <!-- Close button -->
          <button
            type="button"
            class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 transition hover:bg-rose-500/20 hover:text-rose-300 active:scale-95"
            title="닫기"
            aria-label="닫기"
            @click="handleClose"
          >
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>
      </header>

      <!-- Main Body -->
      <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
        <!-- Left/Center: Video / Image Stage -->
        <section class="relative flex w-full shrink-0 flex-col items-center justify-center bg-black p-2 sm:p-4 lg:min-h-0 lg:flex-1">
          <!-- Resume Toast Banner -->
          <div
            v-if="showResumeToast"
            class="absolute left-4 top-4 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-blue-400/40 bg-slate-900/90 px-4 py-2.5 text-xs font-semibold text-blue-100 shadow-2xl backdrop-blur-md"
          >
            <i class="fa-solid fa-rotate-right text-blue-400"></i>
            <span>이전에 시청하던 <strong>{{ formatDurationClock(resumedFromSeconds) }}</strong> 위치부터 이어서 재생합니다.</span>
            <button
              type="button"
              class="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-blue-500"
              @click="restartFromBeginning"
            >
              처음부터 보기
            </button>
            <button
              type="button"
              class="text-slate-400 hover:text-white"
              @click="showResumeToast = false"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Codec / Playback Error Fallback -->
          <div
            v-if="playbackError"
            class="flex max-w-lg flex-col items-center justify-center rounded-3xl border border-amber-400/30 bg-slate-900/90 p-8 text-center shadow-2xl"
          >
            <div class="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">
              <i class="fa-solid fa-triangle-exclamation text-2xl"></i>
            </div>
            <h3 class="mt-4 text-base font-extrabold text-white">브라우저 직접 재생 안내</h3>
            <p class="mt-2 text-xs leading-5 text-slate-300">
              {{ playbackError }}
            </p>
            <div class="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-blue-500"
                @click="handleDownload"
              >
                <i class="fa-solid fa-download"></i>
                <span>원본 파일 다운로드 ({{ currentItem.sizeLabel }})</span>
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700"
                @click="handleGoToOriginalFolder"
              >
                <i class="fa-regular fa-folder-open"></i>
                <span>원본 폴더로 이동</span>
              </button>
            </div>
          </div>

          <!-- Image Item in Collection -->
          <div
            v-else-if="isImageItem"
            class="flex h-full w-full flex-col items-center justify-center"
          >
            <img
              :src="streamUrl"
              :alt="currentItem.name"
              class="max-h-[70vh] max-w-full rounded-2xl object-contain shadow-2xl"
              @error="onVideoError"
            />
          </div>

          <!-- Video Streaming Element -->
          <video
            v-else-if="streamUrl"
            ref="videoRef"
            :key="`${currentItem.id}:${streamUrl}`"
            :src="streamUrl"
            controls
            playsinline
            preload="metadata"
            crossorigin="anonymous"
            class="max-h-[36vh] sm:max-h-[48vh] w-full max-w-6xl rounded-2xl bg-black object-contain shadow-2xl lg:max-h-[74vh]"
            @loadedmetadata="onLoadedMetadata"
            @timeupdate="onTimeUpdate"
            @play="onPlay"
            @pause="onPause"
            @ended="onEnded"
            @error="onVideoError"
          >
            <track
              v-for="track in availableSubtitleTracks"
              :key="track.id"
              kind="subtitles"
              :label="track.label"
              :src="track.blobUrl"
              :default="activeSubtitleId === track.id"
            />
          </video>

          <!-- Custom Quick Controls Bar Under Player -->
          <div
            v-if="!playbackError && !isImageItem"
            class="mt-2 sm:mt-3 flex w-full max-w-6xl flex-wrap items-center justify-between gap-1.5 sm:gap-2 rounded-2xl border border-slate-800 bg-slate-900/90 px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-xs"
          >
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-xl bg-slate-800 px-2.5 py-1.5 font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-40"
                :disabled="!hasPrevItem"
                title="이전 콘텐츠"
                @click="playPlaylistIndex(currentIndex - 1)"
              >
                <i class="fa-solid fa-backward-step"></i>
                <span class="hidden sm:inline">이전</span>
              </button>

              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-xl bg-slate-800 px-2.5 py-1.5 font-bold text-slate-200 transition hover:bg-slate-700"
                title="10초 뒤로 (← / J)"
                @click="seekBy(-10)"
              >
                <i class="fa-solid fa-rotate-left"></i>
                <span>-10초</span>
              </button>

              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 font-extrabold text-white transition hover:bg-blue-500"
                title="재생/일시정지 (Space / K)"
                @click="togglePlayPause"
              >
                <i :class="isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'"></i>
                <span>{{ isPlaying ? "일시정지" : "재생" }}</span>
              </button>

              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-xl bg-slate-800 px-2.5 py-1.5 font-bold text-slate-200 transition hover:bg-slate-700"
                title="10초 앞으로 (→ / L)"
                @click="seekBy(10)"
              >
                <span>+10초</span>
                <i class="fa-solid fa-rotate-right"></i>
              </button>

              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-xl bg-slate-800 px-2.5 py-1.5 font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-40"
                :disabled="!hasNextItem"
                title="다음 콘텐츠"
                @click="playPlaylistIndex(currentIndex + 1)"
              >
                <span class="hidden sm:inline">다음</span>
                <i class="fa-solid fa-forward-step"></i>
              </button>

              <span class="ml-2 font-mono text-[11px] font-bold text-slate-300">
                {{ formatDurationClock(currentTime) }} / {{ formatDurationClock(duration || currentItem.durationSeconds) }}
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <!-- Playback Speed -->
              <div class="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-2 py-1">
                <span class="text-[11px] text-slate-400">배속</span>
                <select
                  :value="playbackRate"
                  class="bg-transparent text-xs font-extrabold text-white focus:outline-none"
                  @change="setPlaybackSpeed(Number($event.target.value))"
                >
                  <option
                    v-for="rate in playbackRateOptions"
                    :key="rate"
                    :value="rate"
                    class="bg-slate-900 text-white"
                  >
                    {{ rate }}x
                  </option>
                </select>
              </div>

              <!-- Repeat Toggle -->
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 font-bold transition"
                :class="isRepeat
                  ? 'border-blue-500/50 bg-blue-500/20 text-blue-300'
                  : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'"
                title="현재 동영상 반복 재생"
                @click="isRepeat = !isRepeat"
              >
                <i class="fa-solid fa-repeat"></i>
                <span class="hidden md:inline">반복</span>
              </button>

              <!-- Auto-Next Toggle -->
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 font-bold transition"
                :class="mediaPhotoStore.preferences.autoPlayNext
                  ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                  : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'"
                title="다음 동영상 자동 연속 재생"
                @click="mediaPhotoStore.updatePreferences({ autoPlayNext: !mediaPhotoStore.preferences.autoPlayNext })"
              >
                <i class="fa-solid fa-forward"></i>
                <span class="hidden md:inline">연속 재생</span>
              </button>

              <!-- Subtitle Loader -->
              <input
                ref="subtitleInputRef"
                type="file"
                accept=".srt,.vtt"
                class="hidden"
                @change="handleLocalSubtitleSelect"
              />
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-1.5 font-bold text-slate-200 transition hover:bg-slate-700"
                title="자막 파일(.srt, .vtt) 불러오기"
                @click="subtitleInputRef?.click()"
              >
                <i class="fa-regular fa-closed-captioning"></i>
                <span class="hidden md:inline">
                  {{ availableSubtitleTracks.length > 0 ? `자막 (${availableSubtitleTracks.length})` : "자막 추가" }}
                </span>
              </button>
            </div>
          </div>
        </section>

        <!-- Right Sidebar: Playlist Queue / File Info / Collections -->
        <aside class="flex w-full min-h-0 flex-1 flex-col border-t border-slate-800 bg-slate-900/95 lg:w-[360px] lg:flex-none lg:border-l lg:border-t-0">
          <!-- Sidebar Tabs -->
          <div class="grid grid-cols-3 border-b border-slate-800 p-1.5 text-xs font-bold shrink-0">
            <button
              type="button"
              class="rounded-xl py-2 transition"
              :class="activePanelTab === 'queue' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'"
              @click="activePanelTab = 'queue'"
            >
              재생목록 ({{ playlistItems.length }})
            </button>
            <button
              type="button"
              class="rounded-xl py-2 transition"
              :class="activePanelTab === 'collections' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'"
              @click="activePanelTab = 'collections'"
            >
              컬렉션 담기
            </button>
            <button
              type="button"
              class="rounded-xl py-2 transition"
              :class="activePanelTab === 'info' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'"
              @click="activePanelTab = 'info'"
            >
              상세 정보
            </button>
          </div>

          <!-- Tab 1: Up Next / Playlist Queue -->
          <div v-if="activePanelTab === 'queue'" class="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            <div v-if="nextItem" class="mb-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-3">
              <div class="flex items-center justify-between text-[11px] font-bold text-blue-300">
                <span>다음 재생 예정</span>
                <button
                  type="button"
                  class="underline hover:text-white"
                  @click="playPlaylistIndex(currentIndex + 1)"
                >
                  지금 재생 →
                </button>
              </div>
              <p class="mt-1 truncate text-xs font-extrabold text-white">{{ nextItem.name }}</p>
            </div>

            <div
              v-for="(item, idx) in playlistItems"
              :key="item.id"
              class="group flex cursor-pointer items-center gap-3 rounded-2xl border p-2 transition"
              :class="String(item.id) === String(currentItem.id)
                ? 'border-blue-500/60 bg-blue-500/15'
                : 'border-slate-800/80 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-800/70'"
              @click="playPlaylistIndex(idx)"
            >
              <div class="relative h-14 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-800">
                <img
                  v-if="thumbnailMap[String(item.id)]"
                  :src="thumbnailMap[String(item.id)]"
                  :alt="item.name"
                  class="h-full w-full object-cover"
                />
                <div v-else class="flex h-full w-full items-center justify-center text-slate-500">
                  <i :class="item.mediaKind === 'image' ? 'fa-regular fa-image' : 'fa-solid fa-film'"></i>
                </div>
                <span
                  v-if="item.durationLabel"
                  class="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white"
                >
                  {{ item.durationLabel }}
                </span>
                <div
                  v-if="item.progressPercent > 0"
                  class="absolute inset-x-0 bottom-0 h-1 bg-slate-700"
                >
                  <div
                    class="h-full bg-blue-500"
                    :style="{ width: `${item.progressPercent}%` }"
                  ></div>
                </div>
              </div>

              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-bold" :class="String(item.id) === String(currentItem.id) ? 'text-blue-300' : 'text-slate-100'">
                  {{ idx + 1 }}. {{ item.displayTitle || item.name }}
                </p>
                <div class="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                  <span>{{ item.sizeLabel }}</span>
                  <span v-if="item.completed" class="text-emerald-400">· 시청 완료</span>
                  <span v-else-if="item.progressPercent > 0" class="text-blue-400">· {{ item.progressPercent }}%</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Tab 2: Collections Assignment -->
          <div v-else-if="activePanelTab === 'collections'" class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <p class="text-xs text-slate-400">
              원본 파일을 복제하지 않고 원하는 미디어 컬렉션에 담아 연속 재생할 수 있습니다.
            </p>

            <div class="flex gap-2">
              <input
                v-model="newCollectionName"
                type="text"
                placeholder="새 컬렉션 이름 입력..."
                class="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                @keyup.enter="handleQuickCreateCollection"
              />
              <button
                type="button"
                class="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-500"
                @click="handleQuickCreateCollection"
              >
                + 생성 후 추가
              </button>
            </div>

            <div v-if="collections.length === 0" class="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-400">
              아직 생성된 미디어 컬렉션이 없습니다.
            </div>

            <div v-else class="space-y-2">
              <label
                v-for="col in collections"
                :key="col.id"
                class="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-800 bg-slate-800/50 px-3.5 py-2.5 transition hover:border-slate-700"
              >
                <div class="min-w-0">
                  <p class="truncate text-xs font-bold text-white">{{ col.name }}</p>
                  <p class="text-[11px] text-slate-400">항목 {{ col.itemCount }}개</p>
                </div>
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500"
                  :checked="isItemInCollection(col)"
                  @change="toggleCollectionMembership(col)"
                />
              </label>
            </div>
          </div>

          <!-- Tab 3: Detailed File Metadata -->
          <div v-else class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-xs">
            <div class="rounded-2xl border border-slate-800 bg-slate-800/40 p-3.5 space-y-2.5">
              <div class="flex justify-between gap-2">
                <span class="text-slate-400">파일명</span>
                <span class="font-bold text-white text-right break-all">{{ currentItem.name }}</span>
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-slate-400">형식</span>
                <span class="font-bold text-white">{{ (currentItem.extension || "-").toUpperCase() }}</span>
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-slate-400">용량</span>
                <span class="font-bold text-white">{{ currentItem.sizeLabel }}</span>
              </div>
              <div v-if="currentItem.width && currentItem.height" class="flex justify-between gap-2">
                <span class="text-slate-400">해상도</span>
                <span class="font-bold text-white">{{ currentItem.width }} × {{ currentItem.height }} ({{ currentItem.resolutionLabel }})</span>
              </div>
              <div v-if="duration || currentItem.durationSeconds" class="flex justify-between gap-2">
                <span class="text-slate-400">재생시간</span>
                <span class="font-bold text-white">{{ formatDurationClock(duration || currentItem.durationSeconds) }}</span>
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-slate-400">시청 진행률</span>
                <span class="font-bold text-blue-400">{{ currentItem.progressPercent || 0 }}%</span>
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-slate-400">원본 위치</span>
                <span class="font-bold text-amber-300 text-right">{{ currentItem.folderPathLabel }}</span>
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-slate-400">추가일</span>
                <span class="font-bold text-white">{{ currentItem.uploadDateLabel }}</span>
              </div>
            </div>

            <div class="flex flex-col gap-2 pt-1">
              <button
                v-if="!currentItem.completed"
                type="button"
                class="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/15 py-2 font-bold text-emerald-300 transition hover:bg-emerald-500/25"
                @click="mediaPhotoStore.markVideoCompleted(currentItem.id)"
              >
                <i class="fa-solid fa-check mr-1.5"></i>시청 완료로 표시
              </button>
              <button
                v-if="currentItem.progressPercent > 0 || currentItem.completed"
                type="button"
                class="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 font-bold text-slate-300 transition hover:bg-slate-700"
                @click="mediaPhotoStore.markVideoUnwatched(currentItem.id)"
              >
                <i class="fa-solid fa-rotate-left mr-1.5"></i>시청 기록 초기화 (미시청 상태로)
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </Teleport>
</template>
