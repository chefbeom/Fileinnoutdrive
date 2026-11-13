<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const isViewMenuOpen = ref(false);
const viewMenuRef = ref(null);

const props = defineProps({
  title: { type: String, default: "" },
  toolbarMetaLabel: { type: String, default: "" },
  hasVisibleToolbarChips: { type: Boolean, default: false },
  hasActiveFilters: { type: Boolean, default: false },
  activeFilterChips: { type: Array, default: () => [] },
  searchState: { type: Object, default: () => ({}) },
  customSizeChipPrefix: { type: String, default: "사용자 크기" },
  customSizeRangeLabel: { type: String, default: "" },
  resetFiltersLabel: { type: String, default: "조건 초기화" },
  showFolderNavigation: { type: Boolean, default: false },
  folderPathSegments: { type: Array, default: () => [] },
  currentFolder: { type: Object, default: null },
  folderSummaryCards: { type: Array, default: () => [] },
  sortOption: { type: String, default: "updatedAt-desc" },
  sortOptions: { type: Array, default: () => [] },
  layoutGuideLabel: { type: String, default: "배치" },
  layoutPreset: { type: String, default: "20" },
  visibleLayoutPresetOptions: { type: Array, default: () => [] },
  customLayoutColumns: { type: [String, Number], default: "" },
  customLayoutRows: { type: [String, Number], default: "" },
  layoutGuideHint: { type: String, default: "" },
  viewMode: { type: String, default: "table" },
  itemSize: { type: String, default: "medium" },
});

const emit = defineEmits([
  "update:sortOption",
  "reset-filters",
  "navigate-folder",
  "show-folder-properties",
  "go-back",
  "set-layout-preset",
  "set-custom-layout-columns",
  "set-custom-layout-rows",
  "set-view-mode",
  "set-item-size",
]);

const VIEW_MODE_OPTIONS = [
  { value: "table", label: "리스트", icon: "fa-solid fa-list" },
  { value: "grid", label: "카드", icon: "fa-solid fa-table-cells-large" },
  { value: "icon", label: "아이콘", icon: "fa-solid fa-border-all" },
];

const ITEM_SIZE_OPTIONS = [
  { value: "small", label: "작게" },
  { value: "medium", label: "보통" },
  { value: "large", label: "크게" },
];

const sortOptionModel = computed({
  get: () => props.sortOption,
  set: (value) => emit("update:sortOption", value),
});

const lastFolderSegmentId = computed(() => props.folderPathSegments[props.folderPathSegments.length - 1]?.id);

const activeViewOption = computed(
  () => VIEW_MODE_OPTIONS.find((opt) => opt.value === props.viewMode) || VIEW_MODE_OPTIONS[0],
);

const activeItemSizeLabel = computed(
  () => ITEM_SIZE_OPTIONS.find((opt) => opt.value === props.itemSize)?.label || "보통",
);

const activeLayoutLabel = computed(() => {
  const found = props.visibleLayoutPresetOptions?.find((opt) => String(opt.value) === String(props.layoutPreset));
  return found?.label || (props.layoutPreset === "custom" ? "직접" : `${props.layoutPreset}개`);
});

const compactFolderSummaryText = computed(() => {
  if (!Array.isArray(props.folderSummaryCards) || props.folderSummaryCards.length === 0) {
    return "";
  }
  const byKey = new Map(props.folderSummaryCards.map((card) => [card.key, card.value]));
  const filesCount = byKey.get("files");
  const foldersCount = byKey.get("folders");
  const parts = [];
  if (filesCount !== undefined) parts.push(`파일 ${filesCount}`);
  if (foldersCount !== undefined) parts.push(`폴더 ${foldersCount}`);
  return parts.join(" · ");
});

const hasSubRow = computed(
  () => props.showFolderNavigation || props.hasVisibleToolbarChips || props.hasActiveFilters,
);

const handleDocumentPointerDown = (event) => {
  if (!isViewMenuOpen.value || !viewMenuRef.value) return;
  if (!viewMenuRef.value.contains(event.target)) {
    isViewMenuOpen.value = false;
  }
};

const handleDocumentKeyDown = (event) => {
  if (event.key === "Escape" && isViewMenuOpen.value) {
    isViewMenuOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("keydown", handleDocumentKeyDown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  document.removeEventListener("keydown", handleDocumentKeyDown);
});
</script>

<template>
  <section class="toolbar-shell mb-3.5">
    <!-- Top row: title + compact inline summary | slots + sort + collapsed view popover -->
    <div class="toolbar-main">
      <div class="toolbar-title-area">
        <div class="toolbar-title-line">
          <h2 class="toolbar-title">{{ title }}</h2>
          <span v-if="toolbarMetaLabel" class="toolbar-meta">{{ toolbarMetaLabel }}</span>
          <span v-if="compactFolderSummaryText" class="toolbar-inline-stat">
            {{ compactFolderSummaryText }}
          </span>
        </div>
      </div>

      <div class="toolbar-controls-strip">
        <div v-if="$slots['header-left'] || $slots['header-right']" class="toolbar-slots">
          <slot name="header-left"></slot>
          <slot name="header-right"></slot>
        </div>

        <label class="toolbar-sort-pill" aria-label="정렬">
          <i class="fa-solid fa-arrow-up-wide-short toolbar-sort-pill__icon" aria-hidden="true"></i>
          <select v-model="sortOptionModel" class="toolbar-sort-pill__select">
            <option v-for="option in sortOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <div ref="viewMenuRef" class="toolbar-view-dropdown">
          <button
            type="button"
            class="toolbar-view-trigger"
            :class="{ 'is-open': isViewMenuOpen }"
            :aria-expanded="isViewMenuOpen"
            aria-haspopup="true"
            @click="isViewMenuOpen = !isViewMenuOpen"
          >
            <i :class="activeViewOption.icon" class="text-[11px]" aria-hidden="true"></i>
            <span>{{ activeViewOption.label }}</span>
            <span class="toolbar-view-trigger__meta">{{ activeItemSizeLabel }} · {{ activeLayoutLabel }}</span>
            <i
              class="fa-solid fa-chevron-down text-[10px] transition-transform"
              :class="{ 'rotate-180': isViewMenuOpen }"
              aria-hidden="true"
            ></i>
          </button>

          <div
            v-if="isViewMenuOpen"
            class="toolbar-view-popover"
            role="dialog"
            aria-label="보기 모드 및 표시 설정"
          >
            <div class="toolbar-popover-group">
              <span class="toolbar-popover-label">보기 모드</span>
              <div class="toolbar-segmented">
                <button
                  v-for="opt in VIEW_MODE_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="toolbar-segmented__btn"
                  :class="{ 'is-active': viewMode === opt.value }"
                  @click="emit('set-view-mode', opt.value)"
                >
                  <i :class="opt.icon" class="text-[11px]" aria-hidden="true"></i>
                  <span>{{ opt.label }}</span>
                </button>
              </div>
            </div>

            <div class="toolbar-popover-group">
              <span class="toolbar-popover-label">항목 크기</span>
              <div class="toolbar-segmented">
                <button
                  v-for="opt in ITEM_SIZE_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="toolbar-segmented__btn"
                  :class="{ 'is-active': itemSize === opt.value }"
                  @click="emit('set-item-size', opt.value)"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <div class="toolbar-popover-group">
              <div class="flex items-center justify-between gap-2">
                <span class="toolbar-popover-label">{{ layoutGuideLabel }}</span>
                <span v-if="layoutGuideHint" class="text-[10px] text-[var(--text-muted)]">
                  {{ layoutGuideHint }}
                </span>
              </div>
              <select
                :value="layoutPreset"
                class="toolbar-popover-select"
                @change="emit('set-layout-preset', $event.target.value)"
              >
                <option
                  v-for="option in visibleLayoutPresetOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
              <div v-if="layoutPreset === 'custom'" class="mt-1.5 grid grid-cols-2 gap-1.5">
                <input
                  :value="customLayoutColumns"
                  type="number"
                  min="5"
                  max="20"
                  class="toolbar-popover-select"
                  placeholder="가로 5~20"
                  @input="emit('set-custom-layout-columns', $event.target.value)"
                />
                <input
                  :value="customLayoutRows"
                  type="number"
                  min="5"
                  max="20"
                  class="toolbar-popover-select"
                  placeholder="세로 5~20"
                  @input="emit('set-custom-layout-rows', $event.target.value)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom utility strip: compact directory breadcrumbs + filter chips -->
    <div v-if="hasSubRow" class="toolbar-subrow">
      <div v-if="showFolderNavigation" class="toolbar-path-row">
        <div class="toolbar-path-crumbs">
          <i class="fa-regular fa-folder-open toolbar-path-icon" aria-hidden="true"></i>
          <template v-for="segment in folderPathSegments" :key="segment.id ?? 'root'">
            <button
              type="button"
              class="breadcrumb-button"
              :class="{ 'is-current': segment.id === lastFolderSegmentId }"
              @click="emit('navigate-folder', segment.id)"
            >
              {{ segment.name }}
            </button>
            <span v-if="segment.id !== lastFolderSegmentId" class="toolbar-path-sep">/</span>
          </template>
        </div>

        <div v-if="currentFolder" class="toolbar-path-actions">
          <button
            type="button"
            class="toolbar-mini-btn toolbar-mini-btn--accent"
            title="폴더 속성 보기"
            @click="emit('show-folder-properties', currentFolder)"
          >
            <i class="fa-solid fa-circle-info text-[11px]" aria-hidden="true"></i>
            <span>속성</span>
          </button>
          <button
            type="button"
            class="toolbar-mini-btn"
            title="상위 폴더로 이동"
            @click="emit('go-back')"
          >
            <i class="fa-solid fa-arrow-up text-[11px]" aria-hidden="true"></i>
            <span>상위</span>
          </button>
        </div>
      </div>

      <div v-if="hasVisibleToolbarChips || hasActiveFilters" class="toolbar-chips-row">
        <div v-if="hasVisibleToolbarChips" class="toolbar-chip-row">
          <span v-for="chip in activeFilterChips" :key="chip" class="toolbar-chip">{{ chip }}</span>
          <span v-if="searchState.sizeFilter === 'custom'" class="toolbar-chip toolbar-chip--accent">
            {{ customSizeChipPrefix }}: {{ customSizeRangeLabel }}
          </span>
        </div>
        <button v-if="hasActiveFilters" type="button" class="toolbar-reset" @click="emit('reset-filters')">
          {{ resetFiltersLabel }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped src="./BaseFileToolbar.css"></style>
