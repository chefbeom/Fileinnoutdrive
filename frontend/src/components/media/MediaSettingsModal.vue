<script setup>
defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  preferences: {
    type: Object,
    required: true,
  },
  autoClassifyEnabled: {
    type: Boolean,
    default: true,
  },
  viewMode: {
    type: String,
    default: "card",
  },
  gridDensity: {
    type: String,
    default: "normal",
  },
  thumbAspect: {
    type: String,
    default: "video",
  },
  showThumbnails: {
    type: Boolean,
    default: true,
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
  vaultOnly: {
    type: Boolean,
    default: false,
  },
  removedSeriesCount: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits([
  "close",
  "update-preferences",
  "set-auto-classify",
  "set-view-mode",
  "set-grid-density",
  "set-thumb-aspect",
  "toggle-show-thumbnails",
  "open-source-picker",
  "open-merge-series",
  "open-removed-series",
  "reset-preferences",
  "reset-series-overrides",
  "clear-watch-history",
]);

const DENSITY_OPTIONS = [
  { value: "compact", label: "작게 (고밀도)" },
  { value: "normal", label: "보통 (기본)" },
  { value: "large", label: "크게" },
  { value: "xlarge", label: "특대" },
];

const ASPECT_OPTIONS = [
  { value: "video", label: "16:9 와이드 (기본)" },
  { value: "classic", label: "4:3 표준" },
  { value: "square", label: "1:1 정사각형" },
  { value: "poster", label: "3:4 세로 포스터" },
];
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      data-testid="media-settings-modal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <div class="flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] shadow-2xl">
        <div class="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3.5 sm:px-6 sm:py-4">
          <div class="flex items-center gap-2.5">
            <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/15 text-blue-500">
              <i class="fa-solid fa-sliders text-sm"></i>
            </span>
            <div>
              <h3 class="text-base font-black text-[var(--text-main)]">미디어 · 시리즈 설정</h3>
              <p class="text-[11px] text-[var(--text-muted)]">
                표시 기준, 시리즈 분류, 화면 밀도, 재생 옵션을 한곳에서 관리합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
            @click="emit('close')"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6 text-xs">
          <!-- 1. Library Source Settings -->
          <section class="space-y-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)]/60 p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h4 class="font-extrabold text-[var(--text-main)]">라이브러리 표시 기준</h4>
              <span class="text-[11px] font-bold text-[var(--text-muted)]">
                영역 {{ areaCount }} · 폴더 {{ folderCount }} · 개별 {{ fileCount }}
              </span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                class="rounded-xl border px-3 py-2.5 text-left transition"
                :class="preferences.mediaSourceMode === 'manual'
                  ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                  : 'border-[var(--border-color)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
                @click="emit('update-preferences', { mediaSourceMode: 'manual' })"
              >
                <span class="block font-extrabold">지정 항목만 표시</span>
                <span class="mt-0.5 block text-[10px] opacity-85">원하는 폴더·영역·파일만 정리</span>
              </button>
              <button
                type="button"
                class="rounded-xl border px-3 py-2.5 text-left transition"
                :class="preferences.mediaSourceMode === 'all'
                  ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                  : 'border-[var(--border-color)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
                @click="emit('update-preferences', { mediaSourceMode: 'all' })"
              >
                <span class="block font-extrabold">모든 동영상 자동 ({{ candidateVideoCount }})</span>
                <span class="mt-0.5 block text-[10px] opacity-85">
                  {{ vaultOnly ? "비밀 공간 전체 영상을 자동 불러오기" : "저장소 전체 영상을 자동 불러오기" }}
                </span>
              </button>
            </div>

            <div class="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                data-testid="settings-open-areas"
                class="inline-flex items-center gap-1.5 rounded-xl border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 font-extrabold text-teal-600 hover:bg-teal-500/20 dark:text-teal-400"
                @click="emit('close'); emit('open-source-picker', 'areas')"
              >
                <i class="fa-solid fa-folder-tree"></i>
                <span>미디어 영역(디렉터리) 관리</span>
              </button>
              <button
                type="button"
                data-testid="settings-open-folders"
                class="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 font-extrabold text-blue-500 hover:bg-blue-500/20"
                @click="emit('close'); emit('open-source-picker', 'folders')"
              >
                <i class="fa-solid fa-folder-plus"></i>
                <span>개별 폴더 · 파일 지정</span>
              </button>
            </div>
          </section>

          <!-- 2. Series Classification & Management -->
          <section class="space-y-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4">
            <h4 class="font-extrabold text-[var(--text-main)]">시리즈 분류 · 관리</h4>

            <label class="flex cursor-pointer items-center justify-between gap-3">
              <div>
                <span class="block font-bold text-[var(--text-main)]">유사 폴더명 시리즈 자동 묶기</span>
                <span class="text-[11px] text-[var(--text-muted)]">시즌1/-속-/-완-, 부제 변형, OVA/극장판을 한 작품으로 묶습니다</span>
              </div>
              <input
                type="checkbox"
                class="h-4 w-4 shrink-0 rounded text-blue-600"
                :checked="autoClassifyEnabled"
                @change="emit('set-auto-classify', $event.target.checked)"
              />
            </label>

            <div
              v-if="seriesCount >= 2 || removedSeriesCount > 0"
              class="flex flex-wrap gap-2 border-t border-[var(--border-color)] pt-3"
            >
              <button
                v-if="seriesCount >= 2"
                type="button"
                data-testid="settings-open-merge"
                class="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1.5 font-bold text-[var(--text-main)] hover:bg-[var(--bg-main)]"
                @click="emit('close'); emit('open-merge-series')"
              >
                <i class="fa-solid fa-object-group text-indigo-500"></i>
                <span>시리즈 수동 병합</span>
              </button>

              <button
                v-if="removedSeriesCount > 0"
                type="button"
                data-testid="settings-open-removed"
                class="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 font-bold text-amber-500 hover:bg-amber-500/20"
                @click="emit('close'); emit('open-removed-series')"
              >
                <i class="fa-solid fa-arrow-rotate-left"></i>
                <span>내린 시리즈 다시 올리기 ({{ removedSeriesCount }}개)</span>
              </button>
            </div>
          </section>

          <!-- 3. Display Options -->
          <section class="space-y-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4">
            <h4 class="font-extrabold text-[var(--text-main)]">화면 표시 설정</h4>

            <div class="flex items-center justify-between">
              <span class="text-[var(--text-secondary)]">목록 보기 방식</span>
              <div class="inline-flex rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] p-0.5">
                <button
                  type="button"
                  class="rounded-lg px-3 py-1 font-bold transition"
                  :class="viewMode === 'card' ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)]'"
                  @click="emit('set-view-mode', 'card')"
                >
                  카드
                </button>
                <button
                  type="button"
                  class="rounded-lg px-3 py-1 font-bold transition"
                  :class="viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)]'"
                  @click="emit('set-view-mode', 'list')"
                >
                  리스트
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-[var(--text-secondary)]">카드 크기</span>
              <select
                :value="gridDensity"
                class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1.5 text-xs font-bold text-[var(--text-main)]"
                @change="emit('set-grid-density', $event.target.value)"
              >
                <option v-for="opt in DENSITY_OPTIONS" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-[var(--text-secondary)]">썸네일 비율</span>
              <select
                :value="thumbAspect"
                class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1.5 text-xs font-bold text-[var(--text-main)]"
                @change="emit('set-thumb-aspect', $event.target.value)"
              >
                <option v-for="opt in ASPECT_OPTIONS" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <label class="flex cursor-pointer items-center justify-between">
              <span class="text-[var(--text-secondary)]">썸네일 미리보기 표시</span>
              <input
                type="checkbox"
                class="h-4 w-4 rounded text-blue-600"
                :checked="showThumbnails"
                @change="emit('toggle-show-thumbnails')"
              />
            </label>
          </section>

          <!-- 4. Playback Options -->
          <section class="space-y-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4">
            <h4 class="font-extrabold text-[var(--text-main)]">재생 · 자막 설정</h4>

            <label class="flex cursor-pointer items-center justify-between">
              <span class="text-[var(--text-secondary)]">이어보기 기록 자동 저장</span>
              <input
                type="checkbox"
                class="h-4 w-4 rounded text-blue-600"
                :checked="preferences.enableContinueWatching"
                @change="emit('update-preferences', { enableContinueWatching: $event.target.checked })"
              />
            </label>

            <label class="flex cursor-pointer items-center justify-between">
              <span class="text-[var(--text-secondary)]">다음 동영상 자동 연속 재생</span>
              <input
                type="checkbox"
                class="h-4 w-4 rounded text-blue-600"
                :checked="preferences.autoPlayNext"
                @change="emit('update-preferences', { autoPlayNext: $event.target.checked })"
              />
            </label>

            <label class="flex cursor-pointer items-center justify-between">
              <span class="text-[var(--text-secondary)]">같은 폴더 자막 자동 로드</span>
              <input
                type="checkbox"
                class="h-4 w-4 rounded text-blue-600"
                :checked="preferences.autoLoadSubtitles"
                @change="emit('update-preferences', { autoLoadSubtitles: $event.target.checked })"
              />
            </label>

            <div class="flex items-center justify-between">
              <span class="text-[var(--text-secondary)]">기본 재생 속도</span>
              <select
                :value="preferences.defaultPlaybackRate"
                class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1.5 text-xs font-bold text-[var(--text-main)]"
                @change="emit('update-preferences', { defaultPlaybackRate: Number($event.target.value) })"
              >
                <option :value="0.75">0.75x</option>
                <option :value="1.0">1.0x (기본)</option>
                <option :value="1.25">1.25x</option>
                <option :value="1.5">1.5x</option>
                <option :value="2.0">2.0x</option>
              </select>
            </div>
          </section>

          <!-- 5. Maintenance / Resets -->
          <section class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-[var(--border-color)] px-4 py-3">
            <span class="font-bold text-[var(--text-muted)]">데이터 · 설정 초기화</span>
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="rounded-xl border border-[var(--border-color)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-input)]"
                @click="emit('reset-preferences')"
              >
                설정 기본값 복원
              </button>
              <button
                type="button"
                class="rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-500 hover:bg-amber-500/20"
                @click="emit('reset-series-overrides')"
              >
                시리즈 규칙 초기화
              </button>
              <button
                type="button"
                class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-500 hover:bg-rose-500/20"
                @click="emit('clear-watch-history')"
              >
                시청 기록 초기화
              </button>
            </div>
          </section>
        </div>

        <div class="flex justify-end border-t border-[var(--border-color)] px-6 py-3.5">
          <button
            type="button"
            class="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-blue-500"
            @click="emit('close')"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
