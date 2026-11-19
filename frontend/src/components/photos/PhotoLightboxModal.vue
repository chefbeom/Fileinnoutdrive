<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useMediaPhotoStore } from "@/stores/useMediaPhotoStore.js";
import { downloadFileAsset } from "@/api/filesApi.js";
import { ModalBackHistoryManager } from "@/utils/modalBackHistory.js";

const props = defineProps({
  photoId: {
    type: [String, Number],
    default: null,
  },
  poolIds: {
    type: Array,
    default: () => [],
  },
  initialSlideshow: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["close", "open-share"]);

const router = useRouter();
const mediaPhotoStore = useMediaPhotoStore();

const zoomScale = ref(1);
const rotationDeg = ref(0);
const isInfoDrawerOpen = ref(false);
const isAlbumPopoverOpen = ref(false);
const isSlideshowPlaying = ref(false);
const isDownloading = ref(false);
const newAlbumName = ref("");

let slideshowTimer = null;
let touchStartX = 0;
let touchStartY = 0;
let initialPinchDistance = 0;
let initialPinchScale = 1;
let lastTapTime = 0;

const slideshowIntervals = [
  { label: "3초", value: 3 },
  { label: "5초", value: 5 },
  { label: "10초", value: 10 },
];

const currentPhoto = computed(() => {
  if (props.photoId == null) return null;
  return mediaPhotoStore.photoById.get(String(props.photoId)) || null;
});

const photoPool = computed(() => {
  const ids = props.poolIds?.length
    ? props.poolIds
    : mediaPhotoStore.allPhotos.map((p) => String(p.id));
  return ids.map((id) => mediaPhotoStore.photoById.get(String(id))).filter(Boolean);
});

const currentIndex = computed(() => {
  if (!currentPhoto.value) return -1;
  return photoPool.value.findIndex((p) => String(p.id) === String(currentPhoto.value.id));
});

const hasPrev = computed(() => currentIndex.value > 0);
const hasNext = computed(() => currentIndex.value >= 0 && currentIndex.value < photoPool.value.length - 1);

const imageUrl = computed(() => (
  currentPhoto.value?.downloadUrl ||
  currentPhoto.value?.presignedDownloadUrl ||
  currentPhoto.value?.thumbnailPresignedUrl ||
  currentPhoto.value?.thumbnailUrl ||
  ""
));

const albums = computed(() => mediaPhotoStore.resolvedPhotoAlbums);

const isPhotoInAlbum = (album) => {
  if (!currentPhoto.value || !album) return false;
  return (album.photoIds || []).some((id) => String(id) === String(currentPhoto.value.id));
};

const resetTransform = () => {
  zoomScale.value = 1;
  rotationDeg.value = 0;
};

const zoomIn = () => {
  zoomScale.value = Math.min(4, Number((zoomScale.value + 0.25).toFixed(2)));
};

const zoomOut = () => {
  zoomScale.value = Math.max(0.5, Number((zoomScale.value - 0.25).toFixed(2)));
};

const rotateRight = () => {
  rotationDeg.value = (rotationDeg.value + 90) % 360;
};

const onWheelZoom = (event) => {
  event.preventDefault();
  if (event.deltaY < 0) {
    zoomIn();
  } else {
    zoomOut();
  }
};

const goToIndex = (idx) => {
  const target = photoPool.value[idx];
  if (!target) return;
  resetTransform();
  mediaPhotoStore.openPhotoLightbox(target.id, {
    poolIds: props.poolIds,
    slideshow: isSlideshowPlaying.value,
  });
};

const goPrev = () => {
  if (hasPrev.value) {
    goToIndex(currentIndex.value - 1);
  } else if (isSlideshowPlaying.value && photoPool.value.length > 0) {
    goToIndex(photoPool.value.length - 1);
  }
};

const goNext = () => {
  if (hasNext.value) {
    goToIndex(currentIndex.value + 1);
  } else if (isSlideshowPlaying.value && photoPool.value.length > 0) {
    goToIndex(0);
  }
};

const stopSlideshowTimer = () => {
  if (slideshowTimer) {
    clearInterval(slideshowTimer);
    slideshowTimer = null;
  }
};

const startSlideshowTimer = () => {
  stopSlideshowTimer();
  const intervalMs = Math.max(2, Number(mediaPhotoStore.preferences.slideshowIntervalSec || 5)) * 1000;
  slideshowTimer = setInterval(() => {
    goNext();
  }, intervalMs);
};

const toggleSlideshow = () => {
  isSlideshowPlaying.value = !isSlideshowPlaying.value;
  if (isSlideshowPlaying.value) {
    startSlideshowTimer();
  } else {
    stopSlideshowTimer();
  }
};

const handleIntervalChange = (sec) => {
  mediaPhotoStore.updatePreferences({ slideshowIntervalSec: Number(sec) });
  if (isSlideshowPlaying.value) {
    startSlideshowTimer();
  }
};

const onImageLoad = (event) => {
  const img = event?.target;
  if (!img || !currentPhoto.value) return;
  if (img.naturalWidth && img.naturalHeight) {
    mediaPhotoStore.recordPhotoMetadata(currentPhoto.value.id, {
      width: img.naturalWidth,
      height: img.naturalHeight,
    });
  }
};

const handleDownload = async () => {
  if (!currentPhoto.value || isDownloading.value) return;
  try {
    isDownloading.value = true;
    await downloadFileAsset(currentPhoto.value, currentPhoto.value.name || "photo");
  } catch (error) {
    window.alert(error?.message || "사진을 다운로드하지 못했습니다.");
  } finally {
    isDownloading.value = false;
  }
};

const onBeforeCloseTeardown = () => {
  stopSlideshowTimer();
  isSlideshowPlaying.value = false;
};

const historyManager = new ModalBackHistoryManager({
  modalId: "photo-lightbox",
  onBeforeClose: onBeforeCloseTeardown,
  onClose: () => {
    mediaPhotoStore.closePhotoLightbox();
    emit("close");
  },
});

const handleClose = () => {
  historyManager.requestClose();
};

const handleGoToOriginalFolder = async () => {
  if (!currentPhoto.value) return;
  const target = currentPhoto.value;
  historyManager.requestClose();
  await mediaPhotoStore.navigateToOriginalFolder(target, router);
};

const toggleAlbumMembership = (album) => {
  if (!currentPhoto.value || !album) return;
  if (isPhotoInAlbum(album)) {
    mediaPhotoStore.removePhotosFromAlbum(album.id, [currentPhoto.value.id]);
  } else {
    mediaPhotoStore.addPhotosToAlbum(album.id, [currentPhoto.value.id]);
  }
};

const handleCreateAlbumAndAdd = () => {
  const name = newAlbumName.value.trim();
  if (!name || !currentPhoto.value) return;
  mediaPhotoStore.createPhotoAlbum({
    name,
    photoIds: [currentPhoto.value.id],
    coverFileId: currentPhoto.value.id,
  });
  newAlbumName.value = "";
};

const onTouchStart = (event) => {
  if (event.touches.length === 2) {
    const touch1 = event.touches[0];
    const touch2 = event.touches[1];
    initialPinchDistance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
    initialPinchScale = zoomScale.value;
  } else if (event.touches.length === 1) {
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
  }
};

const onTouchMove = (event) => {
  if (event.touches.length === 2 && initialPinchDistance > 0) {
    const touch1 = event.touches[0];
    const touch2 = event.touches[1];
    const currentDist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
    const scaleFactor = currentDist / initialPinchDistance;
    zoomScale.value = Math.max(0.5, Math.min(4, Number((initialPinchScale * scaleFactor).toFixed(2))));
  }
};

const onTouchEnd = (event) => {
  if (event.touches.length < 2) {
    initialPinchDistance = 0;
  }
  // Only trigger swipe navigation when not zoomed in
  if (zoomScale.value <= 1.05 && event.changedTouches?.length === 1) {
    const endX = event.changedTouches[0].clientX;
    const endY = event.changedTouches[0].clientY;
    const deltaX = endX - touchStartX;
    const deltaY = endY - touchStartY;
    if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      if (deltaX > 0) {
        goPrev();
      } else {
        goNext();
      }
    }
  }
};

const handleImageTap = () => {
  const now = Date.now();
  if (now - lastTapTime < 300) {
    if (zoomScale.value > 1.05) {
      resetTransform();
    } else {
      zoomScale.value = 2.2;
    }
    lastTapTime = 0;
  } else {
    lastTapTime = now;
  }
};

const handleKeydown = (event) => {
  if (!currentPhoto.value) return;
  const tag = String(event.target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;

  if (event.key === "Escape") {
    event.preventDefault();
    handleClose();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    goPrev();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    goNext();
  } else if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    zoomIn();
  } else if (event.key === "-") {
    event.preventDefault();
    zoomOut();
  } else if (event.key === "0") {
    event.preventDefault();
    resetTransform();
  } else if (event.key === "r" || event.key === "R") {
    event.preventDefault();
    rotateRight();
  } else if (event.key === "i" || event.key === "I") {
    event.preventDefault();
    isInfoDrawerOpen.value = !isInfoDrawerOpen.value;
  } else if (event.key === " ") {
    event.preventDefault();
    toggleSlideshow();
  }
};

watch(
  () => props.photoId,
  (newId, oldId) => {
    resetTransform();
    if (newId != null) {
      if (oldId != null) {
        historyManager.updateItem(newId);
      } else {
        historyManager.open(newId);
      }
    } else {
      historyManager.destroy();
    }
  },
  { immediate: true },
);

watch(
  () => props.initialSlideshow,
  (initialSlide) => {
    if (initialSlide && !isSlideshowPlaying.value) {
      isSlideshowPlaying.value = true;
      startSlideshowTimer();
    }
  },
  { immediate: true },
);

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  stopSlideshowTimer();
  historyManager.destroy();
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="currentPhoto"
      class="fixed inset-0 z-[295] flex flex-col bg-slate-950/95 text-slate-100 backdrop-blur-md"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend.passive="onTouchEnd"
    >
      <!-- Top Control Bar -->
      <header class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-slate-900/90 px-3 py-2 sm:px-6 sm:py-2.5 shrink-0">
        <div class="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            class="inline-flex h-9 min-w-[36px] sm:h-9 sm:w-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 transition hover:bg-slate-700 active:scale-95 px-2 sm:px-0"
            title="닫기 (Esc)"
            aria-label="뒤로가기"
            @click="handleClose"
          >
            <i class="fa-solid fa-arrow-left text-sm"></i>
            <span class="text-xs font-bold sm:hidden">뒤로</span>
          </button>

          <div class="min-w-0">
            <div class="flex items-center gap-1.5 sm:gap-2">
              <span class="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-slate-300 shrink-0">
                {{ currentIndex + 1 }} / {{ photoPool.length }}
              </span>
              <h2 class="truncate text-xs font-extrabold text-white sm:text-base">
                {{ currentPhoto.name }}
              </h2>
            </div>
            <p class="mt-0.5 truncate text-[11px] sm:text-xs text-slate-400">
              {{ currentPhoto.dayLabel }} · {{ currentPhoto.folderPathLabel }}
            </p>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex flex-wrap items-center gap-1 sm:gap-2">
          <!-- Zoom & Rotate Controls -->
          <div class="flex items-center gap-0.5 sm:gap-1 rounded-xl border border-slate-700 bg-slate-800/90 p-0.5 sm:p-1">
            <button
              type="button"
              class="rounded-lg p-1 sm:px-2 sm:py-1 text-xs text-slate-200 hover:bg-slate-700"
              title="축소 (-)"
              @click="zoomOut"
            >
              <i class="fa-solid fa-magnifying-glass-minus text-[11px] sm:text-xs"></i>
            </button>
            <button
              type="button"
              class="px-1 text-[10px] sm:text-[11px] font-bold text-slate-200 hover:text-blue-300"
              title="원래 크기로 (0)"
              @click="resetTransform"
            >
              {{ Math.round(zoomScale * 100) }}%
            </button>
            <button
              type="button"
              class="rounded-lg p-1 sm:px-2 sm:py-1 text-xs text-slate-200 hover:bg-slate-700"
              title="확대 (+)"
              @click="zoomIn"
            >
              <i class="fa-solid fa-magnifying-glass-plus text-[11px] sm:text-xs"></i>
            </button>
            <button
              type="button"
              class="rounded-lg p-1 sm:px-2 sm:py-1 text-xs text-slate-200 hover:bg-slate-700"
              title="90도 회전 (R)"
              @click="rotateRight"
            >
              <i class="fa-solid fa-rotate-right text-[11px] sm:text-xs"></i>
            </button>
          </div>

          <!-- Slideshow Controls -->
          <div class="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/90 px-2 py-1">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold transition"
              :class="isSlideshowPlaying ? 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-slate-700'"
              @click="toggleSlideshow"
            >
              <i :class="isSlideshowPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'"></i>
              <span>{{ isSlideshowPlaying ? "슬라이드쇼 중" : "슬라이드쇼" }}</span>
            </button>
            <select
              :value="mediaPhotoStore.preferences.slideshowIntervalSec"
              class="bg-transparent text-[11px] font-bold text-slate-300 focus:outline-none"
              @change="handleIntervalChange($event.target.value)"
            >
              <option
                v-for="opt in slideshowIntervals"
                :key="opt.value"
                :value="opt.value"
                class="bg-slate-900 text-white"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>

          <!-- Favorite Toggle -->
          <button
            type="button"
            class="inline-flex h-9 w-9 items-center justify-center rounded-xl border transition"
            :class="currentPhoto.isFavorite
              ? 'border-amber-400/50 bg-amber-500/20 text-amber-300'
              : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'"
            title="즐겨찾기"
            @click="mediaPhotoStore.togglePhotoFavorite(currentPhoto.id)"
          >
            <i :class="currentPhoto.isFavorite ? 'fa-solid fa-star text-amber-400' : 'fa-regular fa-star'"></i>
          </button>

          <!-- Exclude from Photos Library -->
          <button
            type="button"
            data-testid="lightbox-exclude-photo"
            class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-2.5 text-xs font-bold text-slate-300 transition hover:border-amber-500/40 hover:bg-amber-500/15 hover:text-amber-300"
            title="사진첩에서 제외 (원본 파일은 유지)"
            @click="mediaPhotoStore.excludePhotoFiles?.([currentPhoto.id])"
          >
            <i class="fa-solid fa-eye-slash"></i>
            <span class="hidden lg:inline">사진첩 제외</span>
          </button>

          <!-- Add to Album Button -->
          <div class="relative">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700"
              @click="isAlbumPopoverOpen = !isAlbumPopoverOpen"
            >
              <i class="fa-solid fa-images text-emerald-400"></i>
              <span class="hidden md:inline">앨범에 추가</span>
            </button>

            <div
              v-if="isAlbumPopoverOpen"
              class="absolute right-0 top-11 z-40 w-64 rounded-2xl border border-slate-700 bg-slate-900 p-3 shadow-2xl"
              @click.stop
            >
              <div class="flex items-center justify-between pb-2">
                <span class="text-xs font-extrabold text-white">앨범 선택</span>
                <button type="button" class="text-xs text-slate-400 hover:text-white" @click="isAlbumPopoverOpen = false">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div class="mb-2 flex gap-1.5">
                <input
                  v-model="newAlbumName"
                  type="text"
                  placeholder="새 앨범 이름..."
                  class="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                  @keyup.enter="handleCreateAlbumAndAdd"
                />
                <button
                  type="button"
                  class="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
                  @click="handleCreateAlbumAndAdd"
                >
                  생성
                </button>
              </div>
              <div class="max-h-44 space-y-1.5 overflow-y-auto">
                <label
                  v-for="album in albums"
                  :key="album.id"
                  class="flex cursor-pointer items-center justify-between rounded-xl px-2.5 py-1.5 text-xs hover:bg-slate-800"
                >
                  <span class="truncate font-semibold text-slate-200">{{ album.name }}</span>
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-slate-600 text-blue-600"
                    :checked="isPhotoInAlbum(album)"
                    @change="toggleAlbumMembership(album)"
                  />
                </label>
                <p v-if="albums.length === 0" class="py-3 text-center text-[11px] text-slate-400">
                  생성된 앨범이 없습니다.
                </p>
              </div>
            </div>
          </div>

          <!-- Navigate to Original Folder -->
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700"
            title="원본 폴더로 이동"
            @click="handleGoToOriginalFolder"
          >
            <i class="fa-regular fa-folder-open text-amber-400"></i>
            <span class="hidden md:inline">원본 위치</span>
          </button>

          <!-- Download -->
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500 disabled:opacity-50"
            :disabled="isDownloading"
            @click="handleDownload"
          >
            <i class="fa-solid fa-download"></i>
            <span class="hidden sm:inline">다운로드</span>
          </button>

          <!-- Info Drawer Toggle -->
          <button
            type="button"
            class="inline-flex h-9 w-9 items-center justify-center rounded-xl border transition"
            :class="isInfoDrawerOpen
              ? 'border-blue-400/50 bg-blue-500/20 text-blue-300'
              : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'"
            title="상세 정보 보기 (I)"
            @click="isInfoDrawerOpen = !isInfoDrawerOpen"
          >
            <i class="fa-solid fa-circle-info"></i>
          </button>

          <!-- Close -->
          <button
            type="button"
            class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 transition hover:bg-rose-500/20 hover:text-rose-300 active:scale-95"
            title="닫기"
            aria-label="닫기"
            @click="handleClose"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </header>

      <!-- Main Stage + Optional Info Drawer -->
      <div class="relative flex min-h-0 flex-1 overflow-hidden">
        <!-- Photo Canvas -->
        <section
          class="relative flex flex-1 items-center justify-center overflow-hidden bg-black p-4 select-none"
          @wheel="onWheelZoom"
          @click.self="handleClose"
        >
          <!-- Prev Button -->
          <button
            v-if="hasPrev"
            type="button"
            class="absolute left-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-slate-900/75 text-white shadow-xl backdrop-blur transition hover:bg-blue-600 sm:left-6"
            title="이전 사진 (←)"
            @click.stop="goPrev"
          >
            <i class="fa-solid fa-chevron-left"></i>
          </button>

          <img
            v-if="imageUrl"
            :key="currentPhoto.id"
            :src="imageUrl"
            :alt="currentPhoto.name"
            class="max-h-full max-w-full object-contain transition-transform duration-200 cursor-zoom-in"
            :style="{
              transform: `scale(${zoomScale}) rotate(${rotationDeg}deg)`,
            }"
            @click="handleImageTap"
            @load="onImageLoad"
          />

          <!-- Next Button -->
          <button
            v-if="hasNext"
            type="button"
            class="absolute right-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-slate-900/75 text-white shadow-xl backdrop-blur transition hover:bg-blue-600 sm:right-6"
            title="다음 사진 (→)"
            @click.stop="goNext"
          >
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        </section>

        <!-- Right Info Drawer / Mobile Bottom Sheet -->
        <aside
          v-if="isInfoDrawerOpen"
          class="absolute inset-x-0 bottom-0 z-30 max-h-[75vh] w-full overflow-y-auto rounded-t-3xl border-t border-slate-700 bg-slate-900/98 p-5 shadow-2xl backdrop-blur-lg sm:static sm:inset-auto sm:max-h-none sm:w-80 sm:rounded-none sm:border-l sm:border-t-0 sm:bg-slate-900/95"
        >
          <!-- Mobile Drag Handle -->
          <div class="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-700 sm:hidden"></div>

          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 class="text-sm font-extrabold text-white">사진 상세 정보</h3>
            <button
              type="button"
              class="text-slate-400 hover:text-white"
              @click="isInfoDrawerOpen = false"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <dl class="mt-4 space-y-3.5 text-xs">
            <div>
              <dt class="text-slate-400">파일 이름</dt>
              <dd class="mt-1 font-bold text-white break-all">{{ currentPhoto.name }}</dd>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="rounded-xl bg-slate-800/70 p-2.5">
                <dt class="text-[11px] text-slate-400">해상도</dt>
                <dd class="mt-1 font-bold text-white">{{ currentPhoto.dimensionsLabel || "확인 중" }}</dd>
              </div>
              <div class="rounded-xl bg-slate-800/70 p-2.5">
                <dt class="text-[11px] text-slate-400">용량 · 형식</dt>
                <dd class="mt-1 font-bold text-white">{{ currentPhoto.sizeLabel }} · {{ (currentPhoto.extension || "").toUpperCase() }}</dd>
              </div>
            </div>
            <div>
              <dt class="text-slate-400">촬영 / 기준 날짜</dt>
              <dd class="mt-1 font-bold text-white">{{ currentPhoto.dayLabel }}</dd>
            </div>
            <div>
              <dt class="text-slate-400">업로드 일시</dt>
              <dd class="mt-1 font-bold text-white">{{ currentPhoto.uploadDateLabel }}</dd>
            </div>
            <div>
              <dt class="text-slate-400">분류</dt>
              <dd class="mt-1 font-bold text-emerald-300">
                {{ currentPhoto.isScreenshot ? "스크린샷 · 그래픽" : "카메라 · 일반 사진" }}
              </dd>
            </div>
            <div v-if="currentPhoto.cameraModel">
              <dt class="text-slate-400">촬영 기기</dt>
              <dd class="mt-1 font-bold text-white">{{ currentPhoto.cameraModel }}</dd>
            </div>
            <div v-if="currentPhoto.gpsLabel">
              <dt class="text-slate-400">위치 정보 (EXIF)</dt>
              <dd class="mt-1 font-bold text-white">{{ currentPhoto.gpsLabel }}</dd>
            </div>
            <div>
              <dt class="text-slate-400">원본 저장 위치</dt>
              <dd class="mt-1 flex items-center justify-between gap-2 font-bold text-amber-300">
                <span class="truncate">{{ currentPhoto.folderPathLabel }}</span>
                <button
                  type="button"
                  class="shrink-0 rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-blue-300 hover:bg-slate-700"
                  @click="handleGoToOriginalFolder"
                >
                  폴더 열기
                </button>
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  </Teleport>
</template>
