<script setup>
import { computed } from "vue";

const props = defineProps({
  currentPage: { type: Number, default: 1 },
  pageCount: { type: Number, default: 1 },
  pageNumbers: { type: Array, default: () => [] },
});

const emit = defineEmits(["update:currentPage"]);
const currentPageModel = computed({
  get: () => props.currentPage,
  set: (value) => emit("update:currentPage", value),
});
</script>

<template>
  <div class="file-pagination-bar mt-4 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
    <p class="text-sm text-gray-500">{{ currentPage }} / {{ pageCount }} 페이지</p>
    <div class="file-pagination-bar__pages">
      <button type="button" class="page-button" :disabled="currentPage === 1" @click="currentPageModel -= 1">이전</button>
      <button v-for="page in pageNumbers" :key="page" type="button" class="page-button" :class="{ 'is-active': currentPage === page }" @click="currentPageModel = page">{{ page }}</button>
      <button type="button" class="page-button" :disabled="currentPage === pageCount" @click="currentPageModel += 1">다음</button>
    </div>
    <div class="file-pagination-bar__spacer" aria-hidden="true"></div>
  </div>
</template>

<style scoped src="./BaseFilePaginationBar.css"></style>