<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useMediaPhotoStore, formatDurationClock } from "@/stores/useMediaPhotoStore.js";
import {
  isEncryptedVaultFile,
  refreshEncryptedStreamUrl,
  resolveFilePlaybackUrl,
} from "@/utils/fileMediaUrl.js";

const mediaPhotoStore = useMediaPhotoStore();
const miniVideoRef = ref(null);
const currentTime = ref(0);
const duration = ref(0);
const isPlaying = ref(true);
const refreshedStreamUrl = ref("");
const hasRetriedStreamToken = ref(false);

const activeFile = computed(() => {
  if (!mediaPhotoStore.miniPlayer.active || !mediaPhotoStore.miniPlayer.fileId) {
    return null;
  }
  return mediaPhotoStore.getMediaItemById(mediaPhotoStore.miniPlayer.fileId);
});

const lockedStreamUrl = ref("");
const streamUrl = computed(() => (
  refreshedStreamUrl.value ||
  lockedStreamUrl.value ||
  resolveFilePlaybackUrl(activeFile.value)
));

const onMiniVideoError = async () => {
  if (!isEncryptedVaultFile(activeFile.value) || hasRetriedStreamToken.value) {
    return;
  }
  hasRetriedStreamToken.value = true;
  try {
    const freshUrl = await refreshEncryptedStreamUrl(activeFile.value);
    if (freshUrl) {
      refreshedStreamUrl.value = freshUrl;
    }
  } catch {
    // Ignore mini-player refresh error
  }
};

let progressTimer = null;

const onLoadedMetadata = () => {
  const el = miniVideoRef.value;
  if (!el) return;
  duration.value = Number(el.duration || 0) || 0;
  const startPos = Number(mediaPhotoStore.miniPlayer.positionSeconds || 0);
  if (startPos > 0) {
    try {
      el.currentTime = startPos;
      currentTime.value = startPos;
    } catch {
      // Ignore seek error
    }
  }
  el.playbackRate = Number(mediaPhotoStore.miniPlayer.playbackRate || 1.0);
  el.muted = Boolean(mediaPhotoStore.miniPlayer.muted);
  if (mediaPhotoStore.miniPlayer.isPlaying) {
    el.play().catch(() => {});
  }
};

const onTimeUpdate = () => {
  const el = miniVideoRef.value;
  if (!el || !activeFile.value) return;
  const rawTime = Number(el.currentTime || 0);
  if (Math.floor(rawTime) !== Math.floor(currentTime.value)) {
    currentTime.value = rawTime;
  }
  if (!progressTimer) {
    progressTimer = setTimeout(() => {
      progressTimer = null;
      if (activeFile.value && miniVideoRef.value) {
        mediaPhotoStore.recordWatchProgress(
          activeFile.value.id,
          miniVideoRef.value.currentTime,
          miniVideoRef.value.duration || duration.value,
        );
      }
    }, 4000);
  }
};

const togglePlay = () => {
  const el = miniVideoRef.value;
  if (!el) return;
  if (el.paused) {
    el.play().catch(() => {});
    isPlaying.value = true;
  } else {
    el.pause();
    isPlaying.value = false;
  }
};

const handleExpand = () => {
  const pos = miniVideoRef.value ? miniVideoRef.value.currentTime : currentTime.value;
  mediaPhotoStore.restoreFromMiniPlayer(pos);
};

const handleClose = () => {
  const pos = miniVideoRef.value ? miniVideoRef.value.currentTime : currentTime.value;
  mediaPhotoStore.closeMiniPlayer(pos);
};

watch(
  () => mediaPhotoStore.miniPlayer.fileId,
  () => {
    refreshedStreamUrl.value = "";
    lockedStreamUrl.value = resolveFilePlaybackUrl(activeFile.value);
    hasRetriedStreamToken.value = false;
  },
  { immediate: true },
);

watch(
  () => mediaPhotoStore.miniPlayer.active,
  (active) => {
    if (!active) {
      refreshedStreamUrl.value = "";
      lockedStreamUrl.value = "";
      hasRetriedStreamToken.value = false;
    }
    if (!active && progressTimer) {
      clearTimeout(progressTimer);
      progressTimer = null;
    }
  },
);

onBeforeUnmount(() => {
  if (miniVideoRef.value && typeof miniVideoRef.value.pause === "function") {
    try {
      miniVideoRef.value.pause();
    } catch {
      // ignore
    }
  }
  if (progressTimer) {
    clearTimeout(progressTimer);
  }
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="activeFile && streamUrl"
      class="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] right-3 z-[240] w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 text-white shadow-2xl isolate [transform:translateZ(0)] md:bottom-6 md:right-6 md:w-80"
    >
      <div class="relative aspect-video w-full bg-black">
        <video
          ref="miniVideoRef"
          :key="`${activeFile.id}:${refreshedStreamUrl}`"
          :src="streamUrl"
          playsinline
          webkit-playsinline
          preload="metadata"
          class="h-full w-full object-contain [transform:translateZ(0)]"
          @loadedmetadata="onLoadedMetadata"
          @timeupdate="onTimeUpdate"
          @play="isPlaying = true"
          @pause="isPlaying = false"
          @error="onMiniVideoError"
        ></video>

        <div class="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-2.5 py-1.5">
          <span class="rounded bg-blue-600/90 px-1.5 py-0.5 text-[10px] font-extrabold">미니 플레이어</span>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="flex h-6 w-6 items-center justify-center rounded-lg bg-black/60 text-xs text-white transition hover:bg-blue-600"
              title="전체 플레이어로 확대"
              @click="handleExpand"
            >
              <i class="fa-solid fa-up-right-and-down-left-from-center text-[10px]"></i>
            </button>
            <button
              type="button"
              class="flex h-6 w-6 items-center justify-center rounded-lg bg-black/60 text-xs text-white transition hover:bg-rose-600"
              title="미니 플레이어 닫기"
              @click="handleClose"
            >
              <i class="fa-solid fa-xmark text-xs"></i>
            </button>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between gap-2 px-3 py-2">
        <div class="min-w-0 flex-1 cursor-pointer" @click="handleExpand">
          <p class="truncate text-xs font-bold text-slate-100">{{ activeFile.displayTitle || activeFile.name }}</p>
          <p class="text-[10px] font-mono tabular-nums text-slate-400">
            {{ formatDurationClock(currentTime) }} / {{ formatDurationClock(duration || activeFile.durationSeconds) }}
          </p>
        </div>

        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-xs text-white transition hover:bg-blue-500"
          @click="togglePlay"
        >
          <i :class="isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'"></i>
        </button>
      </div>
    </div>
  </Teleport>
</template>
