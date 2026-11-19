<script setup>
defineProps({
  selectedCount: { type: Number, default: 0 },
  downloadableCount: { type: Number, default: 0 },
  sharedCount: { type: Number, default: 0 },
  cancelableSentSharedCount: { type: Number, default: 0 },
  ownedShareableCount: { type: Number, default: 0 },
  lockCandidateCount: { type: Number, default: 0 },
  lockedCount: { type: Number, default: 0 },
  vaultMovableCount: { type: Number, default: 0 },
  sharedLibrary: { type: Boolean, default: false },
  vaultMode: { type: Boolean, default: false },
  deleteMode: { type: String, default: "trash" },
  canCreateLocks: { type: Boolean, default: false },
});

const emit = defineEmits([
  "download",
  "save-shared",
  "cancel-sent-shares",
  "share",
  "lock",
  "move-to-vault",
  "restore",
  "delete",
  "clear",
]);
</script>

<template>
  <div
    class="selection-bar-slot mb-4 flex min-h-[64px] flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors duration-150"
    :class="[
      selectedCount > 0
        ? 'selection-bar--active border-blue-200 bg-blue-50'
        : 'selection-bar--idle border-gray-200 bg-white/40'
    ]"
  >
    <!-- 선택된 항목이 있을 때 (활성화 상태) -->
    <template v-if="selectedCount > 0">
      <div>
        <p class="text-sm font-semibold text-blue-900">{{ selectedCount }}개 선택됨</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button v-if="downloadableCount > 0" type="button" class="batch-button bg-white text-blue-700 hover:bg-blue-100" @click="emit('download')">선택 다운로드</button>
        <button v-if="sharedCount > 0" type="button" class="batch-button bg-white text-cyan-700 hover:bg-cyan-100" @click="emit('save-shared')">선택 파일 저장</button>
        <button v-if="sharedLibrary && cancelableSentSharedCount > 0" type="button" class="batch-button bg-white text-violet-700 hover:bg-violet-100" @click="emit('cancel-sent-shares')">선택 공유 취소</button>
        <button v-if="!sharedLibrary && deleteMode !== 'permanent' && ownedShareableCount > 0" type="button" class="batch-button bg-white text-emerald-700 hover:bg-emerald-100" @click="emit('share')">선택 공유</button>
        <button v-if="!sharedLibrary && deleteMode !== 'permanent' && canCreateLocks && lockCandidateCount > 0" type="button" class="batch-button bg-white text-amber-700 hover:bg-amber-100" @click="emit('lock', true)">선택 잠금</button>
        <button v-if="!sharedLibrary && deleteMode !== 'permanent' && lockedCount > 0" type="button" class="batch-button bg-white text-slate-700 hover:bg-slate-200" @click="emit('lock', false)">잠금 해제</button>
        <button v-if="!sharedLibrary && !vaultMode && deleteMode !== 'permanent' && vaultMovableCount > 0" type="button" class="batch-button bg-white text-indigo-700 hover:bg-indigo-100" @click="emit('move-to-vault')">자체 비밀구역으로 옮기기</button>
        <button v-if="!sharedLibrary && deleteMode === 'permanent'" type="button" class="batch-button bg-white text-emerald-700 hover:bg-emerald-100" @click="emit('restore')">원래 위치로 복구</button>
        <button v-if="!sharedLibrary" type="button" class="batch-button bg-white text-rose-600 hover:bg-rose-100" @click="emit('delete')">{{ deleteMode === 'permanent' ? '선택 영구 삭제' : '선택 삭제' }}</button>
        <button type="button" class="batch-button bg-transparent text-blue-700 hover:bg-blue-100" @click="emit('clear')">선택 해제</button>
      </div>
    </template>

    <!-- 선택된 항목이 없을 때 (미리 칸을 잡아두어 레이아웃 움직임 방지) -->
    <template v-else>
      <div class="flex items-center gap-2.5">
        <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100/80 text-slate-400">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold text-slate-500">선택된 항목 없음</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="rounded-lg bg-slate-100/60 px-2.5 py-1 text-[11px] font-medium text-slate-400">
          일괄 작업 대기 중
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped src="./BaseFileSelectionBar.css"></style>
