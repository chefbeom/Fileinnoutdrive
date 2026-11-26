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
  getVideoPreviewStreamUrl = () => "",
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
    <div
      v-if="viewMode === 'table'"
      class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
    >
      <table class="min-w-full table-fixed md:table-auto divide-y divide-gray-200">
        <thead class="bg-slate-50">
          <tr>
            <th class="w-10 px-2.5 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 md:w-14 md:px-4 md:py-3 md:text-left">선택</th>
            <th class="w-14 px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 md:w-24 md:px-4 md:py-3">미리보기</th>
            <th class="px-2.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 md:px-6 md:py-3">이름</th>
            <th class="hidden px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 md:table-cell">종류</th>
            <th class="hidden px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 md:table-cell">크기</th>
            <th class="hidden px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 lg:table-cell">수정일</th>
            <th class="hidden px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 lg:table-cell">상태</th>
            <th class="w-14 px-2.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 md:w-auto md:px-6 md:py-3">작업</th>
          </tr>
        </thead>

        <tbody class="divide-y divide-gray-100 bg-white">
          <tr
            v-if="showParentNavigator"
            class="cursor-pointer transition hover:bg-slate-50"
            :class="{ 'ring-2 ring-blue-500 bg-blue-50/80': dragTargetId === '__parent__' }"
            @click="fileStore.goBack()"
            @dragover="onDragOverParentNavigator"
            @dragleave="onDragLeaveParentNavigator"
            @drop="onDropToParentNavigator"
          >
            <td class="px-2.5 py-3 text-center text-gray-300 md:px-4 md:py-4 md:text-left">-</td>
            <td class="px-2 py-3 md:px-4 md:py-4">
              <div class="thumb-shell flex items-center justify-center bg-slate-100 text-slate-500">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
              </div>
            </td>
            <td class="px-2.5 py-3 text-sm font-semibold text-gray-900 md:px-6 md:py-4">
              <div>../</div>
              <p class="mt-0.5 text-xs font-normal text-gray-400 md:hidden">상위 폴더로 이동</p>
            </td>
            <td class="hidden px-6 py-4 text-sm text-gray-500 md:table-cell">상위 폴더</td>
            <td class="hidden px-6 py-4 text-sm text-gray-500 md:table-cell">-</td>
            <td class="hidden px-6 py-4 text-sm text-gray-500 lg:table-cell">-</td>
            <td class="hidden px-6 py-4 text-sm text-gray-500 lg:table-cell">이동</td>
            <td class="px-2.5 py-3 text-right text-xs font-bold text-blue-600 md:px-6 md:py-4 md:text-sm">열기</td>
          </tr>


          <tr
            v-for="(file, index) in files"
            :key="file.id || file.idx || `${getFileName(file)}-${index}`"
            class="cursor-pointer select-none transition hover:bg-slate-50"
            :class="{
              'file-row--selected': selectedIdSet.has(String(file.id)),
              'bg-amber-50/40 dark:bg-amber-500/5': Boolean(file.favorite || file.isFavorite),
              'ring-2 ring-blue-500 bg-blue-50/80': String(dragTargetId) === String(file.id),
            }"
            :aria-selected="selectedIdSet.has(String(file.id))"
            :draggable="isMovable(file)"
            @click="handleItemClick ? handleItemClick(file, $event) : handlePrimaryAction(file)"
            @dblclick="handlePrimaryAction(file)"
            @contextmenu.prevent.stop="onContextMenuItem($event, file)"
            @dragstart="onDragStart($event, file)"
            @dragover="onDragOverFolder($event, file)"
            @dragleave="onDragLeaveFolder(file)"
            @drop="onDropToFolder($event, file)"
          >
            <td
              class="px-2.5 py-3 text-center md:px-4 md:py-4 md:text-left"
              @click.stop="canSelect && toggleFileSelection(file.id, !selectedIdSet.has(String(file.id)), $event)"
            >
              <input
                v-if="canSelect"
                type="checkbox"
                class="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                :checked="selectedIdSet.has(String(file.id))"
                @click.stop="toggleFileSelection(file.id, $event.target.checked, $event)"
              />
            </td>

            <td class="px-2 py-3 md:px-4 md:py-4">
              <div
                v-if="file.type === 'folder'"
                class="thumb-shell thumb-shell--folder"
                :class="file.hiddenFolder ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300' : 'bg-amber-50 text-amber-600'"
                :title="file.hiddenFolder ? '숨긴 폴더 (더블클릭 또는 클릭하여 열기)' : (isSharedFolder(file) ? '공유 폴더 (더블클릭 또는 클릭하여 열기)' : '폴더')"
              >
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
                </svg>
                <span
                  v-if="isSharedFolder(file)"
                  class="folder-share-badge"
                  title="공유 폴더"
                  aria-label="공유 폴더 아이콘"
                >
                  <svg class="folder-share-badge__icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M15 8a3 3 0 1 0-2.977-2.63l-4.94 2.47a3 3 0 1 0 0 4.319l4.94 2.47a3 3 0 1 0 .895-1.789l-4.94-2.47a3.027 3.027 0 0 0 0-.74l4.94-2.47C13.456 7.68 14.19 8 15 8Z" />
                  </svg>
                </span>
                <span
                  v-else-if="file.hiddenFolder"
                  class="folder-secret-badge"
                  :title="file.pinEnabled ? '숨긴 폴더 · PIN 보호' : '숨긴 폴더'"
                  aria-label="숨긴 폴더 아이콘"
                >
                  <i class="fa-solid" :class="file.pinEnabled ? 'fa-key' : 'fa-eye-slash'"></i>
                </span>
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
              <div v-else-if="hasVideoThumbnail(file)" class="thumb-shell relative overflow-hidden bg-slate-950">
                <img
                  :src="getVideoCardUrl(file)"
                  :alt="`${getFileName(file)} 미리보기`"
                  class="h-full w-full object-cover"
                  loading="lazy"
                  @error="handleThumbnailAssetError(file)"
                />
                <span class="video-play-badge" aria-hidden="true">
                  <svg class="h-3 w-3 translate-x-[0.5px]" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6 4.5v11l9-5.5-9-5.5Z" />
                  </svg>
                </span>
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

            <td class="px-2.5 py-3 md:px-6 md:py-4">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <button
                    v-if="canToggleFavorite(file)"
                    type="button"
                    data-testid="table-favorite-btn"
                    class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors"
                    :class="(file.favorite || file.isFavorite)
                      ? 'bg-amber-100 text-amber-600 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:hover:bg-amber-500/30'
                      : 'text-gray-300 hover:bg-amber-50 hover:text-amber-500 dark:text-slate-500 dark:hover:bg-slate-800'"
                    :title="(file.favorite || file.isFavorite) ? '즐겨찾기 해제' : '즐겨찾기 추가'"
                    :aria-label="(file.favorite || file.isFavorite) ? '즐겨찾기 해제' : '즐겨찾기 추가'"
                    :aria-pressed="Boolean(file.favorite || file.isFavorite)"
                    @click.stop="onClickToggleFavorite(file, $event)"
                  >
                    <i :class="(file.favorite || file.isFavorite) ? 'fa-solid fa-star text-[11px]' : 'fa-regular fa-star text-[11px]'"></i>
                  </button>
                  <p class="file-entry__title truncate text-sm font-semibold text-gray-900">{{ getFileName(file) }}</p>
                  <span
                    v-if="file.favorite || file.isFavorite"
                    data-testid="table-favorite-badge"
                    class="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                    title="즐겨찾기됨"
                  >
                    <i class="fa-solid fa-star text-[9px]"></i>
                    즐겨찾기
                  </span>
                  <span
                    v-if="isSharedFolder(file)"
                    class="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold text-blue-600"
                    title="공유 폴더"
                  >
                    <svg class="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path d="M15 8a3 3 0 1 0-2.977-2.63l-4.94 2.47a3 3 0 1 0 0 4.319l4.94 2.47a3 3 0 1 0 .895-1.789l-4.94-2.47a3.027 3.027 0 0 0 0-.74l4.94-2.47C13.456 7.68 14.19 8 15 8Z" />
                    </svg>
                    공유
                  </span>
                  <span
                    v-if="file.hiddenFolder"
                    class="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-extrabold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200"
                    title="숨긴 폴더"
                  >
                    <i class="fa-solid fa-eye-slash text-[9px]"></i>
                    숨김
                  </span>
                  <span
                    v-if="file.hiddenFolder && file.pinEnabled"
                    class="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-700 dark:bg-amber-500/20 dark:text-amber-200"
                    title="PIN 보호"
                  >
                    <i class="fa-solid fa-key text-[9px]"></i>
                    PIN
                  </span>
                </div>
                <p class="mt-0.5 truncate text-xs text-gray-400">
                  {{ file.sharedWithMe ? getSharedSourceLabel(file) : (canManageSentShare(file) ? getSentShareLabel(file) : (file.location || '홈')) }}
                </p>
                <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-gray-500 md:hidden">
                  <span>{{ file.type === 'folder' ? (file.hiddenFolder ? (file.pinEnabled ? '숨긴 폴더 · PIN' : '숨긴 폴더') : (isSharedFolder(file) ? '공유 폴더' : '폴더')) : (getFileExtension(file) || '-').toUpperCase() }}</span>
                  <span v-if="file.type !== 'folder'">· {{ formatDisplaySize(file) }}</span>
                  <span v-if="getUpdatedAt(file) && getUpdatedAt(file) !== '-'">· {{ getUpdatedAt(file) }}</span>
                </div>
              </div>
            </td>
            <td class="hidden px-6 py-4 text-sm text-gray-600 md:table-cell">
              {{ file.type === 'folder' ? (file.hiddenFolder ? (file.pinEnabled ? '숨긴 폴더 · PIN' : '숨긴 폴더') : (isSharedFolder(file) ? '공유 폴더' : '폴더')) : (getFileExtension(file) || '-').toUpperCase() }}
            </td>
            <td class="hidden px-6 py-4 text-sm text-gray-600 md:table-cell">{{ formatDisplaySize(file) }}</td>
            <td class="hidden px-6 py-4 text-sm text-gray-600 lg:table-cell">{{ getUpdatedAt(file) }}</td>
            <td class="hidden px-6 py-4 lg:table-cell">
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
            <td class="px-2 py-3 text-right md:px-6 md:py-4">
              <div class="flex items-center justify-end gap-1 md:hidden">
                <button
                  type="button"
                  class="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 bg-slate-50 text-gray-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  title="작업 메뉴 열기"
                  aria-label="작업 메뉴 열기"
                  @click.stop="onContextMenuItem($event, file)"
                >
                  <i class="fa-solid fa-ellipsis-vertical text-xs"></i>
                </button>
              </div>
              <div v-if="showActions" class="hidden flex-wrap justify-end gap-2 md:flex">
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
                  v-if="canShareDownloadLink(file)"
                  type="button"
                  class="action-button text-sky-700 hover:bg-sky-50"
                  @click="onClickShareDownloadLink(file, $event)"
                >
                  링크 공유
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
