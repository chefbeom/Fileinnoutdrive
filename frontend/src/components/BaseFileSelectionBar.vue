<script setup>
defineProps({
  selectedCount: { type: Number, default: 0 },
  downloadableCount: { type: Number, default: 0 },
  sharedCount: { type: Number, default: 0 },
  cancelableSentSharedCount: { type: Number, default: 0 },
  ownedShareableCount: { type: Number, default: 0 },
  lockCandidateCount: { type: Number, default: 0 },
  lockedCount: { type: Number, default: 0 },
  sharedLibrary: { type: Boolean, default: false },
  deleteMode: { type: String, default: "trash" },
  canCreateLocks: { type: Boolean, default: false },
});

const emit = defineEmits([
  "download",
  "save-shared",
  "cancel-sent-shares",
  "share",
  "lock",
  "restore",
  "delete",
  "clear",
]);
</script>

<template>
  <div v-if="selectedCount > 0" class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
    <div>
      <p class="text-sm font-semibold text-blue-900">{{ selectedCount }}개 선택됨</p>
      <p class="text-xs text-blue-700">선택한 파일과 폴더에 같은 작업을 적용합니다.</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <button v-if="downloadableCount > 0" type="button" class="batch-button bg-white text-blue-700 hover:bg-blue-100" @click="emit('download')">선택 다운로드</button>
      <button v-if="sharedCount > 0" type="button" class="batch-button bg-white text-cyan-700 hover:bg-cyan-100" @click="emit('save-shared')">선택 파일 저장</button>
      <button v-if="sharedLibrary && cancelableSentSharedCount > 0" type="button" class="batch-button bg-white text-violet-700 hover:bg-violet-100" @click="emit('cancel-sent-shares')">선택 공유 취소</button>
      <button v-if="!sharedLibrary && deleteMode !== 'permanent' && ownedShareableCount > 0" type="button" class="batch-button bg-white text-emerald-700 hover:bg-emerald-100" @click="emit('share')">선택 공유</button>
      <button v-if="!sharedLibrary && deleteMode !== 'permanent' && canCreateLocks && lockCandidateCount > 0" type="button" class="batch-button bg-white text-amber-700 hover:bg-amber-100" @click="emit('lock', true)">선택 잠금</button>
      <button v-if="!sharedLibrary && deleteMode !== 'permanent' && lockedCount > 0" type="button" class="batch-button bg-white text-slate-700 hover:bg-slate-200" @click="emit('lock', false)">잠금 해제</button>
      <button v-if="!sharedLibrary && deleteMode === 'permanent'" type="button" class="batch-button bg-white text-emerald-700 hover:bg-emerald-100" @click="emit('restore')">원래 위치로 복구</button>
      <button v-if="!sharedLibrary" type="button" class="batch-button bg-white text-rose-600 hover:bg-rose-100" @click="emit('delete')">{{ deleteMode === 'permanent' ? '선택 영구 삭제' : '선택 삭제' }}</button>
      <button type="button" class="batch-button bg-transparent text-blue-700 hover:bg-blue-100" @click="emit('clear')">선택 해제</button>
    </div>
  </div>
</template>

<style scoped src="./BaseFileSelectionBar.css"></style>