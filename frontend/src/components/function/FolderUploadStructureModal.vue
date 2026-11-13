<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import FolderUploadTreeNode from "./FolderUploadTreeNode.vue";

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  treeData: {
    type: Object,
    default: () => ({
      roots: [],
      rootNodes: [],
      totalFolders: 0,
      totalFiles: 0,
      totalBytes: 0,
      totalBytesFormatted: "0 B",
    }),
  },
  targetLocationName: {
    type: String,
    default: "현재 위치",
  },
});

const emit = defineEmits(["confirm", "cancel"]);

const searchQuery = ref("");
const expandAllSignal = ref(0);
const collapseAllSignal = ref(0);

function expandAll() {
  expandAllSignal.value += 1;
}

function collapseAll() {
  collapseAllSignal.value += 1;
}

function handleConfirm() {
  emit("confirm");
}

function handleCancel() {
  emit("cancel");
}

function handleKeydown(e) {
  if (e.key === "Escape" && props.isOpen) {
    handleCancel();
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});

const rootNodes = computed(() => {
  if (Array.isArray(props.treeData?.rootNodes) && props.treeData.rootNodes.length > 0) {
    return props.treeData.rootNodes;
  }
  if (Array.isArray(props.treeData?.roots) && props.treeData.roots.length > 0) {
    return props.treeData.roots;
  }
  return [];
});

const hasRoots = computed(() => rootNodes.value.length > 0);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="folder-upload-structure-title"
      @click.self="handleCancel"
    >
      <div
        class="relative flex flex-col w-full max-w-3xl max-h-[90vh] rounded-2xl border border-slate-700/80 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden"
      >
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b border-slate-800/90 px-6 py-4 bg-slate-900/95">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <i class="fa-solid fa-folder-tree text-lg"></i>
            </div>
            <div>
              <h2 id="folder-upload-structure-title" class="text-base sm:text-lg font-bold text-white tracking-tight">
                업로드 폴더 구조 확인
              </h2>
              <p class="text-xs text-slate-400">
                선택한 폴더의 계층 구조와 포함된 파일 목록입니다. 확인 후 업로드를 시작하세요.
              </p>
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            aria-label="닫기"
            @click="handleCancel"
          >
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        <!-- Summary Stat Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 px-6 py-3.5 bg-slate-950/40 border-b border-slate-800/80">
          <div class="flex flex-col gap-0.5 rounded-lg bg-slate-800/50 p-2.5 border border-slate-700/50">
            <span class="text-[11px] font-medium text-slate-400">업로드 대상 위치</span>
            <span class="text-xs font-semibold text-blue-300 truncate" :title="targetLocationName">
              {{ targetLocationName }}
            </span>
          </div>

          <div class="flex flex-col gap-0.5 rounded-lg bg-slate-800/50 p-2.5 border border-slate-700/50">
            <span class="text-[11px] font-medium text-slate-400">총 폴더 수</span>
            <span class="text-sm font-bold text-amber-400">
              {{ (treeData.totalFolders || 0).toLocaleString() }}개
            </span>
          </div>

          <div class="flex flex-col gap-0.5 rounded-lg bg-slate-800/50 p-2.5 border border-slate-700/50">
            <span class="text-[11px] font-medium text-slate-400">총 파일 수</span>
            <span class="text-sm font-bold text-emerald-400">
              {{ (treeData.totalFiles || 0).toLocaleString() }}개
            </span>
          </div>

          <div class="flex flex-col gap-0.5 rounded-lg bg-slate-800/50 p-2.5 border border-slate-700/50">
            <span class="text-[11px] font-medium text-slate-400">총 전송 용량</span>
            <span class="text-sm font-bold font-mono text-cyan-300">
              {{ treeData.totalBytesFormatted || "0 B" }}
            </span>
          </div>
        </div>

        <!-- Toolbar (Search & Expand/Collapse) -->
        <div class="flex flex-wrap items-center justify-between gap-2.5 px-6 py-2.5 border-b border-slate-800 bg-slate-900/60">
          <div class="relative flex-1 min-w-[200px]">
            <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500"></i>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="폴더 또는 파일명 검색..."
              class="w-full rounded-lg bg-slate-950/70 border border-slate-700/80 pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              @click="searchQuery = ''"
            >
              <i class="fa-solid fa-xmark text-xs"></i>
            </button>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition"
              @click="expandAll"
            >
              <i class="fa-solid fa-angles-down text-[11px] text-blue-400"></i>
              <span>모두 펼치기</span>
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition"
              @click="collapseAll"
            >
              <i class="fa-solid fa-angles-up text-[11px] text-slate-400"></i>
              <span>모두 접기</span>
            </button>
          </div>
        </div>

        <!-- Tree View Container -->
        <div class="flex-1 overflow-y-auto px-6 py-4 space-y-1.5 max-h-[460px] min-h-[200px] bg-slate-950/40">
          <template v-if="hasRoots">
            <FolderUploadTreeNode
              v-for="(rootNode, index) in rootNodes"
              :key="rootNode.id"
              :node="rootNode"
              :depth="0"
              :is-last="index === rootNodes.length - 1"
              :search-query="searchQuery"
              :expand-all-signal="expandAllSignal"
              :collapse-all-signal="collapseAllSignal"
            />
          </template>
          <div
            v-else
            class="flex flex-col items-center justify-center py-12 text-center text-slate-500"
          >
            <i class="fa-regular fa-folder-open text-3xl mb-2 text-slate-600"></i>
            <p class="text-xs">업로드할 폴더 또는 파일 정보가 없습니다.</p>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800 px-6 py-3.5 bg-slate-900/90">
          <div class="flex items-center gap-2 text-xs text-slate-400">
            <i class="fa-solid fa-circle-info text-blue-400"></i>
            <span>동일한 폴더 계층 구조가 대상 위치에 자동으로 생성되며 업로드됩니다.</span>
          </div>

          <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              class="flex-1 sm:flex-initial rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
              @click="handleCancel"
            >
              취소
            </button>
            <button
              type="button"
              class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 hover:bg-blue-500 transition"
              @click="handleConfirm"
            >
              <i class="fa-solid fa-cloud-arrow-up"></i>
              <span>업로드 시작</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-fade-in {
  animation: fadeIn 0.15s ease-out forwards;
}
</style>
