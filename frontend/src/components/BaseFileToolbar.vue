<script setup>
import { computed } from "vue";

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
]);

const sortOptionModel = computed({
  get: () => props.sortOption,
  set: (value) => emit("update:sortOption", value),
});
const lastFolderSegmentId = computed(() => props.folderPathSegments[props.folderPathSegments.length - 1]?.id);
</script>

<template>
  <div class="mb-5 overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-sm">
    <div class="toolbar-shell">
      <div class="toolbar-copy">
        <div class="toolbar-overview">
          <div class="toolbar-overview__main">
            <div class="toolbar-overview__title-wrap">
              <h2 class="toolbar-overview__title">{{ title }}</h2>
              <p class="toolbar-overview__meta">{{ toolbarMetaLabel }}</p>
            </div>
            <div class="toolbar-overview__slots">
              <slot name="header-left"></slot>
              <slot name="header-right"></slot>
            </div>
          </div>
        </div>
        <div v-if="hasVisibleToolbarChips || hasActiveFilters" class="toolbar-copy__actions">
          <div v-if="hasVisibleToolbarChips" class="toolbar-chip-row">
            <span v-for="chip in activeFilterChips" :key="chip" class="toolbar-chip">{{ chip }}</span>
            <span v-if="searchState.sizeFilter === 'custom'" class="toolbar-chip toolbar-chip--accent">{{ customSizeChipPrefix }}: {{ customSizeRangeLabel }}</span>
          </div>
          <button v-if="hasActiveFilters" type="button" class="toolbar-reset" @click="emit('reset-filters')">{{ resetFiltersLabel }}</button>
        </div>
        <div v-if="showFolderNavigation" class="toolbar-folder-panel">
          <div class="toolbar-folder-panel__header">
            <div class="min-w-0">
              <p class="toolbar-folder-panel__label">현재 위치</p>
              <div class="toolbar-folder-panel__path">
                <template v-for="segment in folderPathSegments" :key="segment.id ?? 'root'">
                  <button type="button" class="breadcrumb-button" @click="emit('navigate-folder', segment.id)">{{ segment.name }}</button>
                  <span v-if="segment.id !== lastFolderSegmentId" class="text-gray-300">/</span>
                </template>
              </div>
            </div>
            <div v-if="currentFolder" class="toolbar-folder-panel__actions">
              <button type="button" class="toolbar-inline-button toolbar-inline-button--accent" @click="emit('show-folder-properties', currentFolder)">속성 보기</button>
              <button type="button" class="toolbar-inline-button" @click="emit('go-back')">상위 폴더로</button>
            </div>
          </div>
          <div v-if="folderSummaryCards.length > 0" class="toolbar-folder-stats">
            <article v-for="card in folderSummaryCards" :key="card.key" class="toolbar-folder-stat">
              <p class="toolbar-folder-stat__label">{{ card.label }}</p>
              <p class="toolbar-folder-stat__value">{{ card.value }}</p>
            </article>
          </div>
        </div>
      </div>

      <div class="toolbar-controls">
        <label class="file-filter">
          <span class="file-filter__label">정렬</span>
          <select v-model="sortOptionModel" class="file-filter__input"><option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select>
        </label>
        <label class="file-filter">
          <span class="file-filter__label">{{ layoutGuideLabel }}</span>
          <div class="file-filter__inline-grid file-filter__inline-grid--layout">
            <select :value="layoutPreset" class="file-filter__input" @change="emit('set-layout-preset', $event.target.value)">
              <option v-for="option in visibleLayoutPresetOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <input v-if="layoutPreset === 'custom'" :value="customLayoutColumns" type="number" min="5" max="20" class="file-filter__input" placeholder="가로 5~20" @input="emit('set-custom-layout-columns', $event.target.value)" />
            <input v-if="layoutPreset === 'custom'" :value="customLayoutRows" type="number" min="5" max="20" class="file-filter__input" placeholder="세로 5~20" @input="emit('set-custom-layout-rows', $event.target.value)" />
          </div>
          <p class="file-filter__hint">{{ layoutGuideHint }}</p>
        </label>
        <div class="file-filter">
          <span class="file-filter__label">보기 모드</span>
          <div class="toolbar-toggle-group">
            <button type="button" class="view-toggle" :class="{ 'is-active': viewMode === 'table' }" @click="emit('set-view-mode', 'table')">리스트</button>
            <button type="button" class="view-toggle" :class="{ 'is-active': viewMode === 'grid' }" @click="emit('set-view-mode', 'grid')">카드</button>
            <button type="button" class="view-toggle" :class="{ 'is-active': viewMode === 'icon' }" @click="emit('set-view-mode', 'icon')">아이콘</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./BaseFileToolbar.css"></style>