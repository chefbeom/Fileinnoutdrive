<script setup>
import { inject } from "vue";
import { FILE_COLLECTION_CONTEXT_KEY } from "./FileCollectionContext.js";

const context = inject(FILE_COLLECTION_CONTEXT_KEY);
if (!context) {
  throw new Error("FileCollection context is not provided.");
}

const {
  files,
  selectedIdSet,
  showParentNavigator,
  fileStore,
  canSelect,
  showActions,
  deleteMode,
  viewMode,
  itemSize,
  gridClassName,
  collectionStyle,
  dragTargetId,
  formatDisplaySize,
  getFileName,
  getFileExtension,
  getUpdatedAt,
  getSharedSourceLabel,
  getSentShareLabel,
  getImageCardUrl,
  getVideoCardUrl,
  getVideoPreviewStreamUrl = () => "",
  getManagedThumbnailState = () => "idle",
  getStatusChips,
  isImage,
  isVideo,
  hasVideoThumbnail,
  isMovable,
  canDownload,
  canSaveShared,
  canShare,
  canShareDownloadLink = () => false,
  canManageSentShare,
  canToggleLock,
  canToggleFavorite = () => false,
  canManageFolder,
  canRestore,
  canDelete,
  isDownloading,
  toggleFileSelection,
  handlePrimaryAction,
  handleItemClick = null,
  handlePreviewAssetError,
  handleThumbnailAssetError,
  handleDownload,
  onClickSaveShared,
  onClickShare,
  onClickShareDownloadLink = () => {},
  onClickManageSentShare,
  onClickToggleLock,
  onClickToggleFavorite = () => {},
  onClickRenameFolder,
  onClickShowFolderProperties,
  onClickRestore,
  onClickDelete,
  onDragStart,
  onDragEnd,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropToFolder,
  onDragOverParentNavigator,
  onDragLeaveParentNavigator,
  onDropToParentNavigator,
  isSharedFolder = (file) => Boolean(
    file?.type === "folder" && (
      file?.isSharedFolder ||
      file?.sharedFile ||
      file?.isShared ||
      file?.sharedWithMe ||
      String(file?.fileSaveName || "").startsWith("shared-storage-")
    )
  ),
  onContextMenuItem = () => {},
} = context;
</script>
<template>
    <div class="grid gap-4" :class="[gridClassName, `size--${itemSize}`]" :style="collectionStyle">
      <article
        v-if="showParentNavigator"
        class="file-entry group rounded-2xl border border-dashed border-gray-300 bg-slate-50 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        :class="[
          viewMode === 'icon' ? 'file-entry--icon' : 'file-entry--card',
          { 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/80 shadow-md': dragTargetId === '__parent__' },
        ]"
        @click="fileStore.goBack()"
        @dragover="onDragOverParentNavigator"
        @dragleave="onDragLeaveParentNavigator"
        @drop="onDropToParentNavigator"
      >
        <div
          class="flex items-center justify-center rounded-2xl bg-slate-100 text-slate-600"
          :class="viewMode === 'icon' ? 'preview-box file-entry__preview file-entry__preview--icon' : 'mb-4 h-14 w-14'"
        >
          <svg
            :class="viewMode === 'icon' ? 'file-entry__preview-graphic' : 'h-6 w-6'"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </div>
        <div :class="viewMode === 'icon' ? 'mt-2 flex shrink-0 items-center justify-between gap-1.5' : ''">
          <p class="file-entry__title truncate font-semibold text-gray-900">상위 폴더</p>
          <p class="text-xs text-gray-400" :class="viewMode === 'icon' ? 'shrink-0' : 'mt-1'">{{ viewMode === "icon" ? ".." : "../" }}</p>
        </div>
      </article>

      <article
        v-for="(file, index) in files"
        :key="file.id || file.idx || `${getFileName(file)}-${index}`"
        class="file-entry group relative cursor-pointer select-none rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        :class="[
          viewMode === 'icon' ? 'file-entry--icon' : 'file-entry--card',
          {
            'file-entry--selected': selectedIdSet.has(String(file.id)),
            'file-entry--favorite border-amber-300/90 ring-1 ring-amber-400/50 dark:border-amber-500/45 dark:ring-amber-400/35': Boolean(file.favorite || file.isFavorite),
            'ring-2 ring-blue-500 border-blue-500 bg-blue-50/80 shadow-md': String(dragTargetId) === String(file.id),
          },
        ]"
        :aria-selected="selectedIdSet.has(String(file.id))"
        :draggable="isMovable(file)"
        @click="handleItemClick ? handleItemClick(file, $event) : (viewMode === 'icon' ? toggleFileSelection(file.id, !selectedIdSet.has(String(file.id))) : handlePrimaryAction(file))"
        @dblclick="handlePrimaryAction(file)"
        @contextmenu.prevent.stop="onContextMenuItem($event, file)"
        @dragstart="onDragStart($event, file)"
        @dragend="onDragEnd"
        @dragover="onDragOverFolder($event, file)"
        @dragleave="onDragLeaveFolder(file)"
        @drop="onDropToFolder($event, file)"
      >
        <div
          v-if="viewMode !== 'icon'"
          class="file-entry__header mb-3 flex items-start justify-between gap-2 sm:mb-4 sm:gap-3"
        >
          <div class="flex items-center gap-1.5">
            <label
              class="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white/90 shadow-sm"
              @click.stop
            >
              <input
                type="checkbox"
                class="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                :checked="selectedIdSet.has(String(file.id))"
                @click.stop="toggleFileSelection(file.id, $event.target.checked, $event)"
              />
            </label>
            <span
              v-if="file.favorite || file.isFavorite"
              data-testid="card-favorite-badge"
              class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
              title="즐겨찾기됨"
            >
              <i class="fa-solid fa-star text-[9px]"></i>
              <span>즐겨찾기</span>
            </span>
          </div>

          <div class="flex items-center gap-1">
            <button
              v-if="canToggleFavorite(file)"
              type="button"
              data-testid="grid-favorite-btn"
              class="action-icon transition-colors"
              :class="(file.favorite || file.isFavorite)
                ? 'bg-amber-100 text-amber-600 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:hover:bg-amber-500/30'
                : 'text-gray-400 hover:bg-amber-50 hover:text-amber-500 dark:text-slate-400 dark:hover:bg-slate-800'"
              :title="(file.favorite || file.isFavorite) ? '즐겨찾기 해제' : '즐겨찾기 추가'"
              :aria-label="(file.favorite || file.isFavorite) ? '즐겨찾기 해제' : '즐겨찾기 추가'"
              :aria-pressed="Boolean(file.favorite || file.isFavorite)"
              @click.stop="onClickToggleFavorite(file, $event)"
            >
              <i :class="(file.favorite || file.isFavorite) ? 'fa-solid fa-star text-xs' : 'fa-regular fa-star text-xs'"></i>
            </button>
            <button
              type="button"
              class="action-icon text-gray-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              title="작업 메뉴"
              aria-label="작업 메뉴"
              @click.stop="onContextMenuItem($event, file)"
            >
              <i class="fa-solid fa-ellipsis-vertical text-xs"></i>
            </button>
            <button
              v-if="canDelete(file)"
              type="button"
              class="action-icon hidden text-rose-500 hover:bg-rose-50 sm:inline-flex"
              @click="onClickDelete(file, $event)"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <button
          v-if="viewMode === 'icon' && (file.favorite || file.isFavorite)"
          type="button"
          data-testid="card-favorite-badge"
          class="absolute right-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow-sm ring-1 ring-amber-300/80 transition hover:bg-amber-600"
          title="즐겨찾기됨 (클릭하여 해제)"
          aria-label="즐겨찾기됨"
          @click.stop="canToggleFavorite(file) && onClickToggleFavorite(file, $event)"
        >
          <i class="fa-solid fa-star text-[9px]"></i>
          <span v-if="itemSize === 'large'">즐겨찾기</span>
        </button>
        <button
          v-else-if="viewMode === 'icon' && canToggleFavorite(file)"
          type="button"
          class="absolute right-1.5 top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/85 text-gray-400 opacity-0 shadow-xs transition group-hover:opacity-100 hover:text-amber-500 dark:bg-slate-900/80 dark:text-slate-400"
          title="즐겨찾기 추가"
          aria-label="즐겨찾기 추가"
          @click.stop="onClickToggleFavorite(file, $event)"
        >
          <i class="fa-regular fa-star text-[10px]"></i>
        </button>

        <div
          v-if="file.type === 'folder'"
          class="preview-box preview-box--folder file-entry__preview flex items-center justify-center"
          :class="[
            viewMode === 'icon' ? 'file-entry__preview--icon' : 'file-entry__preview--card',
            file.hiddenFolder ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300' : 'bg-amber-50 text-amber-600',
          ]"
          :title="file.hiddenFolder ? '숨긴 폴더 (더블클릭하여 열기)' : (isSharedFolder(file) ? '공유 폴더 (더블클릭하여 열기)' : '폴더')"
        >
          <svg class="file-entry__preview-graphic" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
          </svg>
          <span
            v-if="isSharedFolder(file)"
            class="folder-share-badge--grid"
            title="공유 폴더"
            aria-label="공유 폴더 아이콘"
          >
            <svg class="folder-share-badge__icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M15 8a3 3 0 1 0-2.977-2.63l-4.94 2.47a3 3 0 1 0 0 4.319l4.94 2.47a3 3 0 1 0 .895-1.789l-4.94-2.47a3.027 3.027 0 0 0 0-.74l4.94-2.47C13.456 7.68 14.19 8 15 8Z" />
            </svg>
          </span>
          <span
            v-else-if="file.hiddenFolder"
            class="folder-secret-badge--grid"
            :title="file.pinEnabled ? '숨긴 폴더 · PIN 보호' : '숨긴 폴더'"
            aria-label="숨긴 폴더 아이콘"
          >
            <i class="fa-solid" :class="file.pinEnabled ? 'fa-key' : 'fa-eye-slash'"></i>
          </span>
        </div>
        <div v-else-if="isImage(file) && Boolean(getImageCardUrl(file))" class="preview-box file-entry__preview overflow-hidden bg-slate-100" :class="viewMode === 'icon' ? 'file-entry__preview--icon' : 'file-entry__preview--card'">
          <img
            :src="getImageCardUrl(file)"
            :alt="getFileName(file)"
            class="h-full w-full object-cover"
            loading="lazy"
            @error="handlePreviewAssetError(file)"
          />
        </div>
        <div v-else-if="isImage(file)" class="preview-box file-entry__preview flex items-center justify-center bg-emerald-50 text-emerald-600" :class="[viewMode === 'icon' ? 'file-entry__preview--icon' : 'file-entry__preview--card', { 'animate-pulse': getManagedThumbnailState(file) === 'loading' }]">
          <svg class="file-entry__preview-graphic" fill="currentColor" viewBox="0 0 20 20">
            <path d="M4 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 2v8l2.5-2.5 2 2L14 9v7H6V6Zm2 1.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
          </svg>
        </div>
        <div v-else-if="hasVideoThumbnail(file)" class="preview-box file-entry__preview relative overflow-hidden bg-slate-950" :class="viewMode === 'icon' ? 'file-entry__preview--icon' : 'file-entry__preview--card'">
          <img
            :src="getVideoCardUrl(file)"
            :alt="`${getFileName(file)} 미리보기`"
            class="h-full w-full object-cover"
            loading="lazy"
            @error="handleThumbnailAssetError(file)"
          />
          <span class="video-play-badge video-play-badge--grid" aria-hidden="true">
            <svg class="h-3.5 w-3.5 translate-x-[0.5px]" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6 4.5v11l9-5.5-9-5.5Z" />
            </svg>
          </span>
        </div>
        <div v-else-if="isVideo(file)" class="preview-box file-entry__preview flex items-center justify-center bg-slate-900 text-white" :class="[viewMode === 'icon' ? 'file-entry__preview--icon' : 'file-entry__preview--card', { 'animate-pulse': getManagedThumbnailState(file) === 'loading' }]">
          <svg class="file-entry__preview-graphic" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6 4.5v11l9-5.5-9-5.5Z" />
          </svg>
        </div>
        <div v-else class="preview-box file-entry__preview flex items-center justify-center bg-blue-50 text-blue-600" :class="viewMode === 'icon' ? 'file-entry__preview--icon' : 'file-entry__preview--card'">
          <svg class="file-entry__preview-graphic" fill="currentColor" viewBox="0 0 20 20">
            <path d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z" />
          </svg>
        </div>

        <div :class="viewMode === 'icon' ? 'mt-2 flex shrink-0 items-center justify-between gap-1' : 'mt-3 sm:mt-4'">
          <div class="min-w-0 flex-1">
            <p class="file-entry__title truncate font-semibold text-gray-900">{{ getFileName(file) }}</p>
            <p v-if="viewMode !== 'icon'" class="file-entry__meta mt-1 text-xs text-gray-400">
              {{ file.sharedWithMe ? getSharedSourceLabel(file) : (canManageSentShare(file) ? getSentShareLabel(file) : (file.type === 'folder' ? (file.hiddenFolder ? (file.pinEnabled ? '숨긴 폴더 · PIN' : '숨긴 폴더') : (isSharedFolder(file) ? '공유 폴더' : '폴더')) : `${(getFileExtension(file) || '-').toUpperCase()} · ${formatDisplaySize(file)}`)) }}
            </p>
            <p
              v-if="viewMode !== 'icon' && file.locationPath"
              class="mt-0.5 truncate text-[11px] font-medium text-indigo-500 dark:text-indigo-300 sm:hidden"
              :title="file.locationPath"
            >
              {{ file.locationPath }}
            </p>
          </div>
          <button
            v-if="viewMode === 'icon'"
            type="button"
            class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-slate-100 hover:text-gray-700 sm:hidden dark:hover:bg-slate-800"
            title="작업 메뉴"
            aria-label="작업 메뉴"
            @click.stop="onContextMenuItem($event, file)"
          >
            <i class="fa-solid fa-ellipsis-vertical text-[11px]"></i>
          </button>
        </div>

        <template v-if="viewMode !== 'icon'">
          <dl class="file-entry__details mt-4 hidden space-y-2 text-xs text-gray-500 sm:block">
            <div v-if="file.locationPath" class="flex items-center justify-between gap-3">
              <dt>위치</dt>
              <dd class="truncate font-semibold text-gray-700" :title="file.locationPath">{{ file.locationPath }}</dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt>크기</dt>
              <dd class="font-semibold text-gray-700">{{ formatDisplaySize(file) }}</dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt>수정</dt>
              <dd class="truncate font-semibold text-gray-700">{{ getUpdatedAt(file) }}</dd>
            </div>
          </dl>

          <div class="file-entry__status-row mt-2.5 flex flex-wrap items-center gap-1.5 sm:mt-4 sm:gap-2">
            <span
              v-for="chip in getStatusChips(file)"
              :key="`${file.id}-${chip.key}`"
              class="status-pill"
              :class="`status-pill--${chip.tone}`"
            >
              <span class="status-pill__icon" :class="`status-pill__icon--${chip.icon}`"></span>
              {{ chip.label }}
            </span>
          </div>

          <div class="file-entry__actions mt-4 hidden flex-wrap gap-2 sm:grid">
            <button
              v-if="canDownload(file)"
              type="button"
              class="chip-button bg-blue-50 text-blue-600 hover:bg-blue-100"
              :class="{ 'cursor-wait opacity-70': isDownloading(file) }"
              :disabled="isDownloading(file)"
              @click="handleDownload(file, $event)"
            >
              {{ isDownloading(file) ? "\uC900\uBE44 \uC911..." : "\uB2E4\uC6B4\uB85C\uB4DC" }}
            </button>
            <button
              v-if="canSaveShared(file)"
              type="button"
              class="chip-button bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
              @click="onClickSaveShared(file, $event)"
            >
              홈에 저장
            </button>
            <button
              v-if="canShare(file)"
              type="button"
              class="chip-button bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              @click="onClickShare(file, $event)"
            >
              공유
            </button>
            <button
              v-if="canShareDownloadLink(file)"
              type="button"
              class="chip-button bg-sky-50 text-sky-700 hover:bg-sky-100"
              title="다운로드 링크 공유"
              @click="onClickShareDownloadLink(file, $event)"
            >
              링크 공유
            </button>
            <button
              v-if="canManageSentShare(file)"
              type="button"
              class="chip-button bg-violet-50 text-violet-700 hover:bg-violet-100"
              @click="onClickManageSentShare(file, $event)"
            >
              공유 관리
            </button>
            <button
              v-if="canToggleLock(file)"
              type="button"
              class="chip-button bg-amber-50 text-amber-700 hover:bg-amber-100"
              @click="onClickToggleLock(file, $event)"
            >
              {{ file.lockedFile ? '잠금 해제' : '잠금' }}
            </button>
            <button
              v-if="canManageFolder(file)"
              type="button"
              class="chip-button bg-slate-100 text-slate-700 hover:bg-slate-200"
              @click="onClickRenameFolder(file, $event)"
            >
              이름 변경
            </button>
            <button
              v-if="canManageFolder(file)"
              type="button"
              class="chip-button bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              @click="onClickShowFolderProperties(file, $event)"
            >
              속성
            </button>
            <button
              v-if="canRestore(file)"
              type="button"
              class="chip-button bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              @click="onClickRestore(file, $event)"
            >
              원래 위치로 복구
            </button>
          </div>
        </template>
      </article>
    </div>
</template>

<style scoped src="./FileCollectionView.css"></style>
