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
  getStatusChips,
  isImage,
  isVideo,
  hasVideoThumbnail,
  isMovable,
  canDownload,
  canSaveShared,
  canShare,
  canManageSentShare,
  canToggleLock,
  canManageFolder,
  canRestore,
  canDelete,
  isDownloading,
  toggleFileSelection,
  handlePrimaryAction,
  handlePreviewAssetError,
  handleThumbnailAssetError,
  handleDownload,
  onClickSaveShared,
  onClickShare,
  onClickManageSentShare,
  onClickToggleLock,
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
} = context;
</script>
<template>
    <div class="grid gap-4" :class="gridClassName" :style="collectionStyle">
      <article
        v-if="showParentNavigator"
        class="file-entry group rounded-2xl border border-dashed border-gray-300 bg-slate-50 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        :class="[
          viewMode === 'icon' ? 'file-entry--icon' : 'file-entry--card',
          { 'ring-2 ring-blue-300 border-blue-300 bg-blue-50/60': dragTargetId === '__parent__' },
        ]"
        @click="fileStore.goBack()"
        @dragover="onDragOverParentNavigator"
        @dragleave="onDragLeaveParentNavigator"
        @drop="onDropToParentNavigator"
      >
        <div
          class="flex items-center justify-center rounded-2xl bg-slate-100 text-slate-600"
          :class="viewMode === 'icon' ? 'file-entry__preview file-entry__preview--icon mb-3' : 'mb-4 h-14 w-14'"
        >
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </div>
        <p class="truncate text-sm font-semibold text-gray-900">상위 폴더</p>
        <p class="mt-1 text-xs text-gray-400">{{ viewMode === "icon" ? ".." : "../" }}</p>
      </article>

      <article
        v-for="(file, index) in files"
        :key="file.id || file.idx || `${getFileName(file)}-${index}`"
        class="file-entry group rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        :class="[
          viewMode === 'icon' ? 'file-entry--icon' : 'file-entry--card',
          { 'ring-2 ring-blue-300 border-blue-300 bg-blue-50/60': String(dragTargetId) === String(file.id) },
        ]"
        :draggable="isMovable(file)"
        @click="handlePrimaryAction(file)"
        @dragstart="onDragStart($event, file)"
        @dragend="onDragEnd"
        @dragover="onDragOverFolder($event, file)"
        @dragleave="onDragLeaveFolder(file)"
        @drop="onDropToFolder($event, file)"
      >
        <div class="file-entry__header flex items-start justify-between gap-3" :class="viewMode === 'icon' ? 'mb-3' : 'mb-4'">
          <label
            class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow-sm"
            @click.stop
          >
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              :checked="selectedIdSet.has(String(file.id))"
              @change="toggleFileSelection(file.id, $event.target.checked)"
            />
          </label>

          <button
            v-if="viewMode !== 'icon' && canDelete(file)"
            type="button"
            class="action-icon text-rose-500 hover:bg-rose-50"
            @click="onClickDelete(file, $event)"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          v-if="file.type === 'folder'"
          class="preview-box file-entry__preview flex items-center justify-center bg-amber-50 text-amber-600"
          :class="viewMode === 'icon' ? 'file-entry__preview--icon' : 'file-entry__preview--card'"
        >
          <svg class="file-entry__preview-graphic" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
          </svg>
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
        <div v-else-if="isImage(file)" class="preview-box file-entry__preview flex items-center justify-center bg-emerald-50 text-emerald-600" :class="viewMode === 'icon' ? 'file-entry__preview--icon' : 'file-entry__preview--card'">
          <svg :class="viewMode === 'icon' ? 'h-8 w-8' : 'h-10 w-10'" fill="currentColor" viewBox="0 0 20 20">
            <path d="M4 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 2v8l2.5-2.5 2 2L14 9v7H6V6Zm2 1.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
          </svg>
        </div>
        <div v-else-if="hasVideoThumbnail(file)" class="preview-box file-entry__preview overflow-hidden bg-black" :class="viewMode === 'icon' ? 'file-entry__preview--icon' : 'file-entry__preview--card'">
          <img
            :src="getVideoCardUrl(file)"
            :alt="`${getFileName(file)} thumbnail`"
            class="h-full w-full object-cover"
            loading="lazy"
            @error="handleThumbnailAssetError(file)"
          />
        </div>
        <div v-else-if="isVideo(file)" class="preview-box file-entry__preview flex items-center justify-center bg-slate-900 text-white" :class="viewMode === 'icon' ? 'file-entry__preview--icon' : 'file-entry__preview--card'">
          <svg class="file-entry__preview-graphic" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6 4.5v11l9-5.5-9-5.5Z" />
          </svg>
        </div>
        <div v-else class="preview-box file-entry__preview flex items-center justify-center bg-blue-50 text-blue-600" :class="viewMode === 'icon' ? 'file-entry__preview--icon' : 'file-entry__preview--card'">
          <svg :class="viewMode === 'icon' ? 'h-8 w-8' : 'h-10 w-10'" fill="currentColor" viewBox="0 0 20 20">
            <path d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z" />
          </svg>
        </div>

        <div class="mt-4">
          <p class="truncate text-sm font-semibold text-gray-900">{{ getFileName(file) }}</p>
          <p v-if="viewMode !== 'icon'" class="file-entry__meta mt-1 text-xs text-gray-400">
            {{ file.sharedWithMe ? getSharedSourceLabel(file) : (canManageSentShare(file) ? getSentShareLabel(file) : (file.type === 'folder' ? '폴더' : (getFileExtension(file) || '-').toUpperCase())) }}
          </p>
        </div>

        <template v-if="viewMode !== 'icon'">
          <dl class="file-entry__details mt-4 space-y-2 text-xs text-gray-500">
            <div class="flex items-center justify-between gap-3">
              <dt>크기</dt>
              <dd class="font-semibold text-gray-700">{{ formatDisplaySize(file) }}</dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt>수정</dt>
              <dd class="truncate font-semibold text-gray-700">{{ getUpdatedAt(file) }}</dd>
            </div>
          </dl>

          <div class="file-entry__status-row mt-4 flex flex-wrap items-center gap-2">
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

          <div class="file-entry__actions mt-4 flex flex-wrap gap-2">
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
