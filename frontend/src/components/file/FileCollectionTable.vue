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
    <div
      v-if="viewMode === 'table'"
      class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
    >
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-slate-50">
          <tr>
            <th class="w-14 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">선택</th>
            <th class="w-24 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">미리보기</th>
            <th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">이름</th>
            <th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">종류</th>
            <th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">크기</th>
            <th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">수정일</th>
            <th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">상태</th>
            <th class="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">작업</th>
          </tr>
        </thead>

        <tbody class="divide-y divide-gray-100 bg-white">
          <tr
            v-if="showParentNavigator"
            class="cursor-pointer transition hover:bg-slate-50"
            @click="fileStore.goBack()"
            @dragover="onDragOverParentNavigator"
            @drop="onDropToParentNavigator"
          >
            <td class="px-4 py-4 text-gray-300">-</td>
            <td class="px-4 py-4">
              <div class="thumb-shell flex items-center justify-center bg-slate-100 text-slate-500">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
              </div>
            </td>
            <td class="px-6 py-4 text-sm font-semibold text-gray-900">../</td>
            <td class="px-6 py-4 text-sm text-gray-500">상위 폴더</td>
            <td class="px-6 py-4 text-sm text-gray-500">-</td>
            <td class="px-6 py-4 text-sm text-gray-500">-</td>
            <td class="px-6 py-4 text-sm text-gray-500">이동</td>
            <td class="px-6 py-4 text-right text-sm text-blue-600">열기</td>
          </tr>


          <tr
            v-for="(file, index) in files"
            :key="file.id || file.idx || `${getFileName(file)}-${index}`"
            class="cursor-pointer transition hover:bg-slate-50"
            :draggable="isMovable(file)"
            @click="handlePrimaryAction(file)"
            @dragstart="onDragStart($event, file)"
            @dragover="onDragOverFolder($event, file)"
            @drop="onDropToFolder($event, file)"
          >
            <td class="px-4 py-4" @click.stop>
              <input
                v-if="canSelect"
                type="checkbox"
                class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                :checked="selectedIdSet.has(String(file.id))"
                @change="toggleFileSelection(file.id, $event.target.checked)"
              />
            </td>

            <td class="px-4 py-4">
              <div v-if="file.type === 'folder'" class="thumb-shell bg-amber-50 text-amber-600">
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
                </svg>
              </div>
              <img
                v-else-if="isImage(file) && Boolean(getImageCardUrl(file))"
                :src="getImageCardUrl(file)"
                :alt="getFileName(file)"
                class="thumb-shell object-cover"
                loading="lazy"
                @error="handlePreviewAssetError(file)"
              />
              <div v-else-if="isImage(file)" class="thumb-shell bg-emerald-50 text-emerald-600">
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M4 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 2v8l2.5-2.5 2 2L14 9v7H6V6Zm2 1.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
                </svg>
              </div>
              <div v-else-if="hasVideoThumbnail(file)" class="thumb-shell overflow-hidden bg-black">
                <img
                  :src="getVideoCardUrl(file)"
                  :alt="`${getFileName(file)} thumbnail`"
                  class="h-full w-full object-cover"
                  loading="lazy"
                  @error="handleThumbnailAssetError(file)"
                />
              </div>
              <div v-else-if="isVideo(file)" class="thumb-shell bg-slate-900 text-white">
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6 4.5v11l9-5.5-9-5.5Z" />
                </svg>
              </div>
              <div v-else class="thumb-shell bg-blue-50 text-blue-600">
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z" />
                </svg>
              </div>
            </td>

            <td class="px-6 py-4">
              <div class="min-w-0">
                <p class="file-entry__title truncate text-sm font-semibold text-gray-900">{{ getFileName(file) }}</p>
                <p class="mt-1 truncate text-xs text-gray-400">
                  {{ file.sharedWithMe ? getSharedSourceLabel(file) : (canManageSentShare(file) ? getSentShareLabel(file) : (file.location || '홈')) }}
                </p>
              </div>
            </td>
            <td class="px-6 py-4 text-sm text-gray-600">
              {{ file.type === 'folder' ? '폴더' : (getFileExtension(file) || '-').toUpperCase() }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-600">{{ formatDisplaySize(file) }}</td>
            <td class="px-6 py-4 text-sm text-gray-600">{{ getUpdatedAt(file) }}</td>
            <td class="px-6 py-4">
              <div class="flex flex-wrap items-center gap-2">
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
            </td>
            <td class="px-6 py-4">
              <div v-if="showActions" class="flex flex-wrap justify-end gap-2">
                <button
                  v-if="canDownload(file)"
                  type="button"
                  class="action-button text-blue-600 hover:bg-blue-50"
                  :class="{ 'cursor-wait opacity-70': isDownloading(file) }"
                  :disabled="isDownloading(file)"
                  @click="handleDownload(file, $event)"
                >
                  {{ isDownloading(file) ? "\uC900\uBE44 \uC911..." : "\uB2E4\uC6B4\uB85C\uB4DC" }}
                </button>
                <button
                  v-if="canSaveShared(file)"
                  type="button"
                  class="action-button text-cyan-700 hover:bg-cyan-50"
                  @click="onClickSaveShared(file, $event)"
                >
                  홈에 저장
                </button>
                <button
                  v-if="canShare(file)"
                  type="button"
                  class="action-button text-emerald-700 hover:bg-emerald-50"
                  @click="onClickShare(file, $event)"
                >
                  공유
                </button>
                <button
                  v-if="canManageSentShare(file)"
                  type="button"
                  class="action-button text-violet-700 hover:bg-violet-50"
                  @click="onClickManageSentShare(file, $event)"
                >
                  공유 관리
                </button>
                <button
                  v-if="canToggleLock(file)"
                  type="button"
                  class="action-button hover:bg-amber-50"
                  :class="file.lockedFile ? 'text-amber-700' : 'text-slate-700'"
                  @click="onClickToggleLock(file, $event)"
                >
                  {{ file.lockedFile ? '잠금 해제' : '잠금' }}
                </button>
                <button
                  v-if="canManageFolder(file)"
                  type="button"
                  class="action-button text-slate-700 hover:bg-slate-100"
                  @click="onClickRenameFolder(file, $event)"
                >
                  이름 변경
                </button>
                <button
                  v-if="canManageFolder(file)"
                  type="button"
                  class="action-button text-indigo-700 hover:bg-indigo-50"
                  @click="onClickShowFolderProperties(file, $event)"
                >
                  속성
                </button>
                <button
                  v-if="canRestore(file)"
                  type="button"
                  class="action-button text-emerald-700 hover:bg-emerald-50"
                  @click="onClickRestore(file, $event)"
                >
                  원래 위치로 복구
                </button>
                <button
                  v-if="canDelete(file)"
                  type="button"
                  class="action-button text-rose-600 hover:bg-rose-50"
                  @click="onClickDelete(file, $event)"
                >
                  {{ deleteMode === 'permanent' ? '영구 삭제' : '삭제' }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
</template>

<style scoped src="./FileCollectionView.css"></style>
