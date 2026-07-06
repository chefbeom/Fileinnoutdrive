<script setup>
import { formatBytes } from "@/utils/formatBytes.js";
import { formatBaseDisplayDate } from "./baseFileViewModel.js";

defineProps({
  target: { type: Object, required: true },
  summary: { type: Object, default: null },
  pathLabel: { type: String, default: "" },
  error: { type: String, default: "" },
  isLoading: { type: Boolean, default: false },
});

const emit = defineEmits(["close"]);
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4" @click.self="emit('close')">
    <div class="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">폴더 속성</p>
          <h3 class="mt-1 text-xl font-bold text-gray-900">{{ summary?.folderName || target.name }}</h3>
          <p class="mt-2 text-sm text-gray-500">{{ pathLabel }}</p>
        </div>
        <button type="button" class="rounded-full p-2 text-gray-400 transition hover:bg-slate-100 hover:text-gray-600" @click="emit('close')">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div v-if="isLoading" class="mt-6 rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-4 py-10 text-center text-sm text-gray-500">폴더 속성을 불러오는 중입니다.</div>
      <div v-else-if="error" class="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-600">{{ error }}</div>
      <div v-else-if="summary" class="mt-6 space-y-6">
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-2xl bg-slate-50 px-4 py-4"><p class="text-xs font-semibold uppercase tracking-wide text-gray-400">직접 포함 항목</p><p class="mt-2 text-2xl font-bold text-gray-900">{{ summary.directChildCount }}</p></div>
          <div class="rounded-2xl bg-slate-50 px-4 py-4"><p class="text-xs font-semibold uppercase tracking-wide text-gray-400">전체 하위 항목</p><p class="mt-2 text-2xl font-bold text-gray-900">{{ summary.totalChildCount }}</p></div>
          <div class="rounded-2xl bg-slate-50 px-4 py-4"><p class="text-xs font-semibold uppercase tracking-wide text-gray-400">직접 포함 파일 크기</p><p class="mt-2 text-2xl font-bold text-gray-900">{{ formatBytes(summary.directSize) }}</p></div>
          <div class="rounded-2xl bg-slate-50 px-4 py-4"><p class="text-xs font-semibold uppercase tracking-wide text-gray-400">전체 파일 크기</p><p class="mt-2 text-2xl font-bold text-gray-900">{{ formatBytes(summary.totalSize) }}</p></div>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="rounded-2xl border border-gray-200 px-4 py-4">
            <p class="text-sm font-semibold text-gray-900">직접 포함 정보</p>
            <dl class="mt-4 space-y-3 text-sm text-gray-600">
              <div class="flex items-center justify-between gap-4"><dt>파일 수</dt><dd class="font-semibold text-gray-900">{{ summary.directFileCount }}</dd></div>
              <div class="flex items-center justify-between gap-4"><dt>폴더 수</dt><dd class="font-semibold text-gray-900">{{ summary.directFolderCount }}</dd></div>
              <div class="flex items-center justify-between gap-4"><dt>마지막 수정</dt><dd class="font-semibold text-gray-900">{{ formatBaseDisplayDate(summary.lastModifyDate) }}</dd></div>
            </dl>
          </div>
          <div class="rounded-2xl border border-gray-200 px-4 py-4">
            <p class="text-sm font-semibold text-gray-900">전체 하위 정보</p>
            <dl class="mt-4 space-y-3 text-sm text-gray-600">
              <div class="flex items-center justify-between gap-4"><dt>전체 파일 수</dt><dd class="font-semibold text-gray-900">{{ summary.totalFileCount }}</dd></div>
              <div class="flex items-center justify-between gap-4"><dt>전체 폴더 수</dt><dd class="font-semibold text-gray-900">{{ summary.totalFolderCount }}</dd></div>
              <div class="flex items-center justify-between gap-4"><dt>생성 시간</dt><dd class="font-semibold text-gray-900">{{ formatBaseDisplayDate(summary.uploadDate) }}</dd></div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>