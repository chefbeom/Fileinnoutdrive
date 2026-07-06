<script setup>
import { formatBytes } from "@/utils/formatBytes.js";

defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  activeUploadCount: {
    type: Number,
    default: 0,
  },
  uploadConcurrency: {
    type: Number,
    required: true,
  },
  uploadConcurrencyOptions: {
    type: Array,
    default: () => [],
  },
  isUploading: {
    type: Boolean,
    default: false,
  },
  maxUploadCount: {
    type: Number,
    required: true,
  },
  maxUploadFileBytes: {
    type: Number,
    required: true,
  },
});

const emit = defineEmits([
  "toggle",
  "create-folder",
  "file-change",
  "folder-change",
  "update-upload-concurrency",
]);

function updateUploadConcurrency(event) {
  emit("update-upload-concurrency", Number(event?.target?.value || 0));
}
</script>

<template>
  <button
    class="w-full flex items-center justify-center gap-3 px-4 py-2.5 text-sm font-bold text-blue-700 bg-sky-200 rounded-xl transition-all duration-150 hover:bg-sky-300 active:bg-sky-400"
    @click="emit('toggle')"
  >
    <i class="fa-solid fa-plus"></i>
    <span>업로드 / 새로 만들기</span>
    <span
      v-if="activeUploadCount > 0"
      class="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold"
    >
      {{ activeUploadCount }}
    </span>
  </button>

  <div
    v-if="open"
    class="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl z-50"
  >
    <div class="relative group/sub">
      <div
        class="flex items-center justify-between px-4 py-3 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors rounded-t-2xl"
      >
        <div class="flex items-center gap-3">
          <i class="fa-solid fa-plus-to-slot w-5 text-center text-gray-600 dark:text-gray-400"></i>
          <span>생성</span>
        </div>
        <i class="fa-solid fa-chevron-right text-[10px] text-gray-400"></i>
      </div>

      <div
        class="absolute left-full top-0 ml-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl hidden group-hover/sub:block"
      >
        <RouterLink :to="{ name: 'workspace' }">
          <div class="px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer rounded-t-xl text-gray-800 dark:text-gray-200">
            문서 작성
          </div>
        </RouterLink>
        <div
          class="px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer rounded-b-xl text-gray-800 dark:text-gray-200"
          @click="emit('create-folder')"
        >
          새 폴더 만들기
        </div>
      </div>
    </div>

    <div class="relative group/sub">
      <div
        class="flex items-center justify-between px-4 py-3 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors border-t border-gray-100 dark:border-gray-700"
      >
        <div class="flex items-center gap-3">
          <i class="fa-solid fa-cloud-arrow-up w-5 text-center text-gray-600 dark:text-gray-400"></i>
          <span>업로드</span>
        </div>
        <i class="fa-solid fa-chevron-right text-[10px] text-gray-400"></i>
      </div>

      <div
        class="absolute left-full top-0 ml-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl hidden group-hover/sub:block"
      >
        <label
          class="block px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer rounded-t-xl text-gray-800 dark:text-gray-200"
        >
          파일 업로드
          <input
            type="file"
            multiple
            hidden
            :disabled="isUploading"
            @change="emit('file-change', $event)"
          />
        </label>
        <label
          class="block px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer rounded-b-xl text-gray-800 dark:text-gray-200"
        >
          폴더 업로드
          <input
            type="file"
            webkitdirectory
            directory
            multiple
            hidden
            :disabled="isUploading"
            @change="emit('folder-change', $event)"
          />
        </label>
      </div>
    </div>

    <div class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 rounded-b-2xl">
      <label class="block text-xs font-semibold text-gray-500 dark:text-gray-300 mb-2">
        동시 업로드 수
      </label>
      <select
        :value="uploadConcurrency"
        :disabled="isUploading"
        class="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        @change="updateUploadConcurrency"
      >
        <option
          v-for="count in uploadConcurrencyOptions"
          :key="count"
          :value="count"
        >
          {{ count }}
        </option>
      </select>
      <p class="mt-2 text-[11px] leading-5 text-gray-500 dark:text-gray-400">
        {{ `현재 멤버십 한도: 한 번에 최대 ${maxUploadCount}개, 파일당 ${formatBytes(maxUploadFileBytes)}` }}
      </p>
    </div>
  </div>
</template>
