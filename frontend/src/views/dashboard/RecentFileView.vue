<script setup>
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import BaseFileView from "@/components/BaseFileView.vue";
import { useFileStore } from "@/stores/useFileStore.js";

const fileStore = useFileStore();
const route = useRoute();
const router = useRouter();

const RECENT_TABS = [
  { value: "all", label: "전체 최근 파일", icon: "fa-solid fa-clock" },
  { value: "uploaded", label: "최근 업로드한 파일", icon: "fa-solid fa-cloud-arrow-up" },
  { value: "accessed", label: "최근 열어본 파일", icon: "fa-solid fa-clock-rotate-left" },
];

const normalizeTab = (rawTab) => {
  const val = String(rawTab || "").trim().toLowerCase();
  if (val === "uploaded" || val === "accessed") return val;
  return "all";
};

const activeTab = ref(normalizeTab(route.query.tab));

watch(
  () => route.query.tab,
  (nextTab) => {
    activeTab.value = normalizeTab(nextTab);
  },
);

const selectTab = (tabValue) => {
  activeTab.value = tabValue;
  const nextQuery = { ...route.query };
  if (tabValue === "all") {
    delete nextQuery.tab;
  } else {
    nextQuery.tab = tabValue;
  }
  router.replace({ name: "recentFile", query: nextQuery });
};

const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const recentFilesAll = computed(() =>
  fileStore.recentFiles.filter((file) => new Date(file.lastModified) >= thirtyDaysAgo),
);

const recentFilesUploaded = computed(() =>
  (fileStore.recentUploadedFiles || []).filter(
    (file) => new Date(file.uploadDate || file.lastModified) >= thirtyDaysAgo,
  ),
);

const recentFilesAccessed = computed(() => fileStore.recentAccessedFiles || []);

const tabCounts = computed(() => ({
  all: recentFilesAll.value.length,
  uploaded: recentFilesUploaded.value.length,
  accessed: recentFilesAccessed.value.length,
}));

const activeFiles = computed(() => {
  if (activeTab.value === "uploaded") {
    return recentFilesUploaded.value;
  }
  if (activeTab.value === "accessed") {
    return recentFilesAccessed.value;
  }
  return recentFilesAll.value;
});

const viewTitle = computed(() => {
  if (activeTab.value === "uploaded") return "최근 업로드한 파일";
  if (activeTab.value === "accessed") return "최근 열어본 파일";
  return "최근 파일";
});
</script>

<template>
  <BaseFileView
    :title="viewTitle"
    :files="activeFiles"
    @delete="fileStore.moveToTrash"
  >
    <template #header-bottom>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="tab in RECENT_TABS"
            :key="tab.value"
            type="button"
            @click="selectTab(tab.value)"
            class="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all"
            :class="
              activeTab === tab.value
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
            "
          >
            <i :class="tab.icon"></i>
            <span>{{ tab.label }}</span>
            <span
              class="rounded-full px-1.5 py-0.5 text-[10px]"
              :class="activeTab === tab.value ? 'bg-white/20 text-white' : 'bg-white text-gray-600'"
            >
              {{ tabCounts[tab.value] }}
            </span>
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            v-if="(activeTab === 'uploaded' || activeTab === 'all') && recentFilesUploaded.length > 0"
            type="button"
            data-testid="clear-recent-uploaded-btn"
            @click="fileStore.clearUploadedFiles()"
            class="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
          >
            <i class="fa-solid fa-trash-can"></i>
            <span>업로드 기록 비우기</span>
          </button>

          <button
            v-if="(activeTab === 'accessed' || activeTab === 'all') && recentFilesAccessed.length > 0"
            type="button"
            data-testid="clear-recent-accessed-btn"
            @click="fileStore.clearAccessedFiles()"
            class="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
          >
            <i class="fa-solid fa-trash-can"></i>
            <span>열람 기록 비우기</span>
          </button>
        </div>
      </div>
    </template>
  </BaseFileView>
</template>
