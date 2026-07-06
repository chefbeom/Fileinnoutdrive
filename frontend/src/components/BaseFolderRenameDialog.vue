<script setup>
import { computed } from "vue";

const props = defineProps({
  target: { type: Object, required: true },
  modelValue: { type: String, default: "" },
  error: { type: String, default: "" },
  isRenaming: { type: Boolean, default: false },
});

const emit = defineEmits(["update:modelValue", "close", "submit"]);
const nameModel = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4" @click.self="emit('close')">
    <div class="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">폴더 이름 변경</p>
          <h3 class="mt-1 text-xl font-bold text-gray-900">{{ target.name }}</h3>
        </div>
        <button type="button" class="rounded-full p-2 text-gray-400 transition hover:bg-slate-100 hover:text-gray-600" @click="emit('close')">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <label class="mt-5 block">
        <span class="mb-2 block text-sm font-semibold text-gray-600">새 폴더 이름</span>
        <input v-model="nameModel" type="text" maxlength="100" class="file-filter__input" placeholder="폴더 이름을 입력하세요." @keydown.enter.prevent="emit('submit')" />
      </label>
      <p v-if="error" class="mt-3 text-sm text-rose-500">{{ error }}</p>
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50" @click="emit('close')">취소</button>
        <button type="button" class="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300" :disabled="isRenaming" @click="emit('submit')">{{ isRenaming ? "변경 중..." : "이름 저장" }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./BaseFileDialog.css"></style>