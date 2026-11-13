<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps({
  mediaSourceMode: {
    type: String,
    default: "manual",
  },
  areaCount: {
    type: Number,
    default: 0,
  },
  folderCount: {
    type: Number,
    default: 0,
  },
  fileCount: {
    type: Number,
    default: 0,
  },
  candidateVideoCount: {
    type: Number,
    default: 0,
  },
  seriesCount: {
    type: Number,
    default: 0,
  },
  displayedVideoCount: {
    type: Number,
    default: 0,
  },
  continueCount: {
    type: Number,
    default: 0,
  },
  collectionCount: {
    type: Number,
    default: 0,
  },
  favoriteCount: {
    type: Number,
    default: 0,
  },
  activeSection: {
    type: String,
    default: "series",
  },
  selectedCollectionId: {
    type: [String, Number, null],
    default: null,
  },
  inSeriesDetail: {
    type: Boolean,
    default: false,
  },
  searchQuery: {
    type: String,
    default: "",
  },
  scopeFilter: {
    type: String,
    default: "all",
  },
  statusFilter: {
    type: String,
    default: "all",
  },
  sortOption: {
    type: String,
    default: "added-desc",
  },
  seriesEpisodeSortOption: {
    type: String,
    default: "episode-asc",
  },
  viewMode: {
    type: String,
    default: "card",
  },
  gridDensity: {
    type: String,
    default: "normal",
  },
  showThumbnails: {
    type: Boolean,
    default: true,
  },
  thumbAspect: {
    type: String,
    default: "video",
  },
  activeAreaLabel: {
    type: String,
    default: "",
  },
  vaultOnly: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "set-section",
  "update:searchQuery",
  "update:scopeFilter",
  "update:statusFilter",
  "update:sortOption",
  "update:seriesEpisodeSortOption",
  "set-view-mode",
  "set-grid-density",
  "toggle-show-thumbnails",
  "set-thumb-aspect",
  "clear-area-filter",
  "reset-filters",
  "open-source-picker",
  "trigger-upload",
  "create-collection",
  "open-settings",
]);

const isAddMenuOpen = ref(false);
const isFilterPopoverOpen = ref(false);

const sectionTabs = computed(() => [
  { key: "series", label: "시리즈 · 작품", count: props.seriesCount, icon: "fa-solid fa-tv" },
  { key: "continue", label: "이어보기", count: props.continueCount, icon: "fa-solid fa-play-circle" },
  { key: "recent", label: "최근 시청", count: null, icon: "fa-solid fa-clock-rotate-left" },
  { key: "collections", label: "내 컬렉션", count: props.collectionCount, icon: "fa-solid fa-layer-group" },
  { key: "favorites", label: "즐겨찾기", count: props.favoriteCount, icon: "fa-solid fa-star" },
]);

const DENSITY_OPTIONS = [
  { value: "compact", label: "작게" },
  { value: "normal", label: "보통" },
  { value: "large", label: "크게" },
  { value: "xlarge", label: "특대" },
];

const ASPECT_OPTIONS = [
  { value: "video", label: "16:9" },
  { value: "classic", label: "4:3" },
  { value: "square", label: "1:1" },
  { value: "poster", label: "3:4" },
];

const SCOPE_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "owned", label: "내 저장소" },
  { value: "shared", label: "공유됨" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "unwatched", label: "미시청" },
  { value: "watching", label: "시청 중" },
  { value: "completed", label: "완료" },
];

const totalManualSources = computed(
  () => props.areaCount + props.folderCount + props.fileCount,
);

const sourceStatusText = computed(() => {
  if (props.mediaSourceMode === "all") {
    return `전체 자동 (${props.candidateVideoCount})`;
  }
  return totalManualSources.value > 0
    ? `지정 항목 (${totalManualSources.value})`
    : "지정 항목 미설정";
});

const activeFilterCount = computed(() => {
  let count = 0;
  if (!props.vaultOnly && props.scopeFilter !== "all") count += 1;
  if (props.statusFilter !== "all") count += 1;
  return count;
});

const scopeChipLabel = computed(() => {
  if (props.vaultOnly) return "";
  if (props.scopeFilter === "owned") return "내 저장소만";
  if (props.scopeFilter === "shared") return "공유받은 미디어만";
  return "";
});

const statusChipLabel = computed(() => {
  switch (props.statusFilter) {
    case "unwatched":
      return "미시청";
    case "watching":
      return "시청 중";
    case "completed":
      return "시청 완료";
    default:
      return "";
  }
});

const hasActiveFilterChips = computed(() =>
  Boolean(
    props.searchQuery.trim() ||
      (!props.vaultOnly && props.scopeFilter !== "all") ||
      props.statusFilter !== "all" ||
      props.activeAreaLabel,
  ),
);

const toggleAddMenu = () => {
  isFilterPopoverOpen.value = false;
  isAddMenuOpen.value = !isAddMenuOpen.value;
};

const toggleFilterPopover = () => {
  isAddMenuOpen.value = false;
  isFilterPopoverOpen.value = !isFilterPopoverOpen.value;
};

const closePopovers = () => {
  isAddMenuOpen.value = false;
  isFilterPopoverOpen.value = false;
};

const handleAction = (fn) => {
  closePopovers();
  fn();
};

onMounted(() => {
  window.addEventListener("click", closePopovers);
});

onBeforeUnmount(() => {
  window.removeEventListener("click", closePopovers);
});
</script>

<template>
  <section class="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4 shadow-sm sm:p-6">
    <!-- Top Row: Brand Identity + Focused Action Buttons -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-md"
          :class="vaultOnly ? 'bg-gradient-to-br from-amber-500 to-rose-600' : 'bg-gradient-to-br from-purple-600 to-blue-600'"
        >
          <i :class="vaultOnly ? 'fa-solid fa-user-shield text-lg' : 'fa-solid fa-clapperboard text-lg'"></i>
        </div>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-xl font-black tracking-tight text-[var(--text-main)] sm:text-2xl">
              {{ vaultOnly ? "비밀 미디어" : "미디어 스트리밍" }}
            </h1>
            <button
              type="button"
              data-testid="media-source-status-chip"
              class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold transition"
              :class="mediaSourceMode === 'all'
                ? 'bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25'
                : 'bg-blue-500/15 text-blue-500 hover:bg-blue-500/25'"
              title="클릭해 미디어 표시 기준 및 영역·폴더를 관리합니다"
              @click="handleAction(() => emit('open-source-picker', 'areas'))"
            >
              <i :class="mediaSourceMode === 'all' ? 'fa-solid fa-wand-magic-sparkles text-[10px]' : 'fa-solid fa-folder-tree text-[10px]'"></i>
              <span>{{ sourceStatusText }}</span>
            </button>
          </div>
          <p class="mt-0.5 text-xs font-medium text-[var(--text-muted)]">
            시리즈 {{ seriesCount }}개 · 동영상 {{ displayedVideoCount }}개 · 이어보기 {{ continueCount }}개
          </p>
        </div>
      </div>

      <!-- Focused Header Actions (2 controls instead of 6) -->
      <div class="flex flex-wrap items-center gap-2">
        <!-- Guided Add / Upload / Source Menu -->
        <div class="relative" @click.stop>
          <button
            type="button"
            data-testid="media-add-menu-trigger"
            class="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-500"
            :aria-expanded="isAddMenuOpen"
            @click="toggleAddMenu"
          >
            <i class="fa-solid fa-plus"></i>
            <span>미디어 추가</span>
            <i class="fa-solid fa-chevron-down text-[10px] opacity-80"></i>
          </button>

          <div
            v-if="isAddMenuOpen"
            data-testid="media-add-menu"
            class="absolute right-0 top-12 z-40 w-72 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-2 shadow-2xl max-sm:fixed max-sm:left-3 max-sm:right-3 max-sm:top-auto max-sm:bottom-[calc(4.65rem+env(safe-area-inset-bottom,0px))] max-sm:z-[130] max-sm:w-auto max-sm:max-h-[62dvh] max-sm:overflow-y-auto"
          >
            <p class="px-3 py-1.5 text-[11px] font-extrabold text-[var(--text-muted)]">
              미디어 등록 · 업로드
            </p>

            <button
              type="button"
              data-testid="add-menu-upload"
              class="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--bg-input)]"
              @click="handleAction(() => emit('trigger-upload'))"
            >
              <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-500">
                <i class="fa-solid fa-cloud-arrow-up text-xs"></i>
              </span>
              <span class="min-w-0">
                <span class="block text-xs font-extrabold text-[var(--text-main)]">새 동영상 업로드</span>
                <span class="block text-[11px] text-[var(--text-muted)]">기기에서 동영상·자막 파일을 바로 업로드</span>
              </span>
            </button>

            <button
              type="button"
              data-testid="add-menu-areas"
              class="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--bg-input)]"
              @click="handleAction(() => emit('open-source-picker', 'areas'))"
            >
              <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-teal-500">
                <i class="fa-solid fa-folder-tree text-xs"></i>
              </span>
              <span class="min-w-0">
                <span class="block text-xs font-extrabold text-[var(--text-main)]">미디어 영역(디렉터리) 지정</span>
                <span class="block text-[11px] text-[var(--text-muted)]">상위 폴더 아래 작품을 시리즈로 자동 구성</span>
              </span>
            </button>

            <button
              type="button"
              data-testid="add-menu-folders"
              class="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--bg-input)]"
              @click="handleAction(() => emit('open-source-picker', 'folders'))"
            >
              <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-500">
                <i class="fa-solid fa-folder-plus text-xs"></i>
              </span>
              <span class="min-w-0">
                <span class="block text-xs font-extrabold text-[var(--text-main)]">{{ vaultOnly ? "비밀 폴더·파일 지정" : "저장소 폴더·파일 지정" }}</span>
                <span class="block text-[11px] text-[var(--text-muted)]">{{ vaultOnly ? "비밀 공간의 특정 폴더나 영상만 골라 표시" : "드라이브의 특정 폴더나 영상만 골라 표시" }}</span>
              </span>
            </button>

            <div class="my-1.5 border-t border-[var(--border-color)]"></div>

            <button
              type="button"
              data-testid="add-menu-collection"
              class="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--bg-input)]"
              @click="handleAction(() => emit('create-collection'))"
            >
              <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-500">
                <i class="fa-solid fa-layer-group text-xs"></i>
              </span>
              <span class="min-w-0">
                <span class="block text-xs font-extrabold text-[var(--text-main)]">새 컬렉션 만들기</span>
                <span class="block text-[11px] text-[var(--text-muted)]">원하는 영상을 모아 재생 목록 구성</span>
              </span>
            </button>
          </div>
        </div>

        <!-- Dedicated Media Settings Modal Trigger -->
        <button
          type="button"
          data-testid="media-settings-trigger"
          class="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] px-3.5 py-2.5 text-xs font-extrabold text-[var(--text-secondary)] transition hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
          title="미디어 · 시리즈 · 재생 상세 설정"
          @click="handleAction(() => emit('open-settings'))"
        >
          <i class="fa-solid fa-sliders"></i>
          <span>설정</span>
        </button>
      </div>
    </div>

    <!-- Second Row: Section Navigation Tabs + Minimal Browsing Controls -->
    <div class="mt-4 flex flex-col gap-3 border-t border-[var(--border-color)] pt-3.5 xl:flex-row xl:items-center xl:justify-between">
      <!-- Navigation Tabs -->
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="tab in sectionTabs"
          :key="tab.key"
          type="button"
          class="inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-extrabold transition"
          :class="activeSection === tab.key && !selectedCollectionId
            ? 'bg-blue-600 text-white shadow-sm'
            : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
          @click="emit('set-section', tab.key)"
        >
          <i :class="tab.icon"></i>
          <span>{{ tab.count === null ? tab.label : `${tab.label} (${tab.count})` }}</span>
        </button>
      </div>

      <!-- Browsing Essentials: Search + Filter/Display Popover + View Toggle -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-0 w-full flex-1 sm:w-60 sm:flex-none">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]"></i>
          <input
            :value="searchQuery"
            type="text"
            placeholder="시리즈 · 작품 · 에피소드 검색..."
            class="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] py-1.5 pl-8 pr-7 text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] focus:border-blue-500 focus:outline-none"
            @input="emit('update:searchQuery', $event.target.value)"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)]"
            title="검색어 지우기"
            @click="emit('update:searchQuery', '')"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Compact Filter & Display Popover -->
        <div class="relative" @click.stop>
          <button
            type="button"
            data-testid="media-filter-trigger"
            class="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-extrabold transition"
            :class="activeFilterCount > 0 || isFilterPopoverOpen
              ? 'border-blue-500/40 bg-blue-500/15 text-blue-500'
              : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
            :aria-expanded="isFilterPopoverOpen"
            @click="toggleFilterPopover"
          >
            <i class="fa-solid fa-filter text-[11px]"></i>
            <span>필터 · 정렬</span>
            <span
              v-if="activeFilterCount > 0"
              class="rounded-full bg-blue-600 px-1.5 py-0.2 text-[10px] font-black text-white"
            >
              {{ activeFilterCount }}
            </span>
          </button>

          <div
            v-if="isFilterPopoverOpen"
            data-testid="media-filter-popover"
            class="absolute right-0 top-10 z-40 w-80 space-y-3.5 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4 text-xs shadow-2xl max-sm:fixed max-sm:left-3 max-sm:right-3 max-sm:top-auto max-sm:bottom-[calc(4.65rem+env(safe-area-inset-bottom,0px))] max-sm:z-[130] max-sm:w-auto max-sm:max-h-[62dvh] max-sm:overflow-y-auto"
          >
            <div v-if="!vaultOnly" class="space-y-1.5">
              <span class="block text-[11px] font-extrabold text-[var(--text-muted)]">저장소 범위</span>
              <div class="grid grid-cols-3 gap-1 rounded-xl bg-[var(--bg-input)] p-1">
                <button
                  v-for="opt in SCOPE_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="rounded-lg py-1.5 text-[11px] font-bold transition"
                  :class="scopeFilter === opt.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
                  @click="emit('update:scopeFilter', opt.value)"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <div class="space-y-1.5">
              <span class="block text-[11px] font-extrabold text-[var(--text-muted)]">시청 상태</span>
              <div class="grid grid-cols-4 gap-1 rounded-xl bg-[var(--bg-input)] p-1">
                <button
                  v-for="opt in STATUS_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="rounded-lg py-1.5 text-[11px] font-bold transition"
                  :class="statusFilter === opt.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
                  @click="emit('update:statusFilter', opt.value)"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <div v-if="inSeriesDetail" class="space-y-1.5">
              <span class="block text-[11px] font-extrabold text-[var(--text-muted)]">에피소드 정렬</span>
              <select
                :value="seriesEpisodeSortOption"
                class="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1.5 text-xs font-bold text-[var(--text-main)] focus:outline-none"
                @change="emit('update:seriesEpisodeSortOption', $event.target.value)"
              >
                <option value="episode-asc">회차 순서 (기본)</option>
                <option value="added-desc">최근 추가순</option>
                <option value="watched-desc">최근 시청순</option>
                <option value="duration-desc">재생시간 긴 순</option>
                <option value="name-asc">이름 오름차순</option>
                <option value="size-desc">파일 크기순</option>
              </select>
            </div>

            <div v-else-if="activeSection !== 'series'" class="space-y-1.5">
              <span class="block text-[11px] font-extrabold text-[var(--text-muted)]">정렬 기준</span>
              <select
                :value="sortOption"
                class="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1.5 text-xs font-bold text-[var(--text-main)] focus:outline-none"
                @change="emit('update:sortOption', $event.target.value)"
              >
                <option value="added-desc">최근 추가순</option>
                <option value="watched-desc">최근 시청순</option>
                <option value="duration-desc">재생시간 긴 순</option>
                <option value="name-asc">이름 오름차순</option>
                <option value="size-desc">파일 크기순</option>
              </select>
            </div>

            <div class="space-y-2 border-t border-[var(--border-color)] pt-3">
              <span class="block text-[11px] font-extrabold text-[var(--text-muted)]">카드 크기 및 화면 표시</span>
              <div class="grid grid-cols-4 gap-1 rounded-xl bg-[var(--bg-input)] p-1">
                <button
                  v-for="opt in DENSITY_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="rounded-lg py-1 text-[11px] font-bold transition"
                  :class="gridDensity === opt.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
                  @click="emit('set-grid-density', opt.value)"
                >
                  {{ opt.label }}
                </button>
              </div>

              <div v-if="showThumbnails && viewMode === 'card'" class="grid grid-cols-4 gap-1 rounded-xl bg-[var(--bg-input)] p-1">
                <button
                  v-for="opt in ASPECT_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="rounded-lg py-1 text-[11px] font-bold transition"
                  :class="thumbAspect === opt.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
                  @click="emit('set-thumb-aspect', opt.value)"
                >
                  {{ opt.label }}
                </button>
              </div>

              <label class="flex cursor-pointer items-center justify-between pt-1">
                <span class="font-bold text-[var(--text-secondary)]">썸네일 미리보기 표시</span>
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded text-blue-600"
                  :checked="showThumbnails"
                  @change="emit('toggle-show-thumbnails')"
                />
              </label>
            </div>

            <div class="flex items-center justify-between border-t border-[var(--border-color)] pt-2.5 text-[11px]">
              <button
                type="button"
                class="font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-40"
                :disabled="activeFilterCount === 0"
                @click="emit('reset-filters')"
              >
                필터 초기화
              </button>
              <button
                type="button"
                class="font-extrabold text-blue-500 hover:underline"
                @click="handleAction(() => emit('open-settings'))"
              >
                상세 설정 열기 →
              </button>
            </div>
          </div>
        </div>

        <!-- Card / List View Mode Toggle -->
        <div class="inline-flex rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] p-0.5">
          <button
            type="button"
            class="rounded-lg px-2.5 py-1.5 text-xs font-bold transition"
            :class="viewMode === 'card' ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'"
            title="카드 보기"
            @click="emit('set-view-mode', 'card')"
          >
            <i class="fa-solid fa-grip"></i>
          </button>
          <button
            type="button"
            class="rounded-lg px-2.5 py-1.5 text-xs font-bold transition"
            :class="viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'"
            title="리스트 보기"
            @click="emit('set-view-mode', 'list')"
          >
            <i class="fa-solid fa-list"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Active Filter Chips (Only visible when filtering is active) -->
    <div
      v-if="hasActiveFilterChips"
      data-testid="active-filter-chips"
      class="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border-color)] pt-3 text-[11px]"
    >
      <span class="font-bold text-[var(--text-muted)]">적용된 필터</span>

      <button
        v-if="activeAreaLabel"
        type="button"
        class="inline-flex items-center gap-1 rounded-full bg-teal-500/15 px-2.5 py-0.5 font-extrabold text-teal-500 hover:bg-teal-500/25"
        @click="emit('clear-area-filter')"
      >
        <span>영역: {{ activeAreaLabel }}</span>
        <i class="fa-solid fa-xmark text-[10px]"></i>
      </button>

      <button
        v-if="scopeChipLabel"
        type="button"
        class="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2.5 py-0.5 font-extrabold text-blue-500 hover:bg-blue-500/25"
        @click="emit('update:scopeFilter', 'all')"
      >
        <span>범위: {{ scopeChipLabel }}</span>
        <i class="fa-solid fa-xmark text-[10px]"></i>
      </button>

      <button
        v-if="statusChipLabel"
        type="button"
        class="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2.5 py-0.5 font-extrabold text-indigo-500 hover:bg-indigo-500/25"
        @click="emit('update:statusFilter', 'all')"
      >
        <span>상태: {{ statusChipLabel }}</span>
        <i class="fa-solid fa-xmark text-[10px]"></i>
      </button>

      <button
        v-if="searchQuery.trim()"
        type="button"
        class="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2.5 py-0.5 font-extrabold text-purple-500 hover:bg-purple-500/25"
        @click="emit('update:searchQuery', '')"
      >
        <span>검색: "{{ searchQuery.trim() }}"</span>
        <i class="fa-solid fa-xmark text-[10px]"></i>
      </button>

      <button
        type="button"
        class="ml-auto font-bold text-[var(--text-muted)] hover:text-[var(--text-main)]"
        @click="emit('reset-filters')"
      >
        모두 초기화
      </button>
    </div>
  </section>
</template>
