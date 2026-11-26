<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import BaseFileView from "@/components/BaseFileView.vue";
import { useFileStore } from "@/stores/useFileStore.js";

const props = defineProps({
  vaultOnly: {
    type: Boolean,
    default: false,
  },
});

const fileStore = useFileStore();
const route = useRoute();
const router = useRouter();

const FAVORITE_TABS = computed(() => [
  { value: "all", label: props.vaultOnly ? "전체 비밀 즐겨찾기" : "전체 즐겨찾기", icon: "fa-solid fa-star" },
  { value: "folders", label: props.vaultOnly ? "비밀 폴더 바로가기" : "폴더 바로가기", icon: "fa-solid fa-folder-open" },
  { value: "files", label: props.vaultOnly ? "비밀 파일" : "파일", icon: "fa-solid fa-file" },
]);

const normalizeTab = (rawTab) => {
  const val = String(rawTab || "").trim().toLowerCase();
  if (val === "folders" || val === "files") return val;
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
  router.replace({ name: props.vaultOnly ? "secretFavorites" : "favoriteFile", query: nextQuery });
};

const favoriteAll = computed(() => (
  props.vaultOnly ? (fileStore.vaultFavoriteItems || []) : (fileStore.favoriteItems || [])
));
const favoriteFolders = computed(() => (
  props.vaultOnly ? (fileStore.vaultFavoriteFolders || []) : (fileStore.favoriteFolders || [])
));
const favoriteFilesOnly = computed(() => (
  props.vaultOnly
    ? (fileStore.vaultFavoriteFilesOnly || favoriteAll.value.filter((file) => file?.type !== "folder"))
    : (fileStore.favoriteFilesOnly || [])
));

const tabCounts = computed(() => ({
  all: favoriteAll.value.length,
  folders: favoriteFolders.value.length,
  files: favoriteFilesOnly.value.length,
}));

const activeItems = computed(() => {
  if (activeTab.value === "folders") {
    return favoriteFolders.value;
  }
  if (activeTab.value === "files") {
    return favoriteFilesOnly.value;
  }
  return favoriteAll.value;
});

const viewTitle = computed(() => {
  if (props.vaultOnly) {
    if (activeTab.value === "folders") return "비밀 즐겨찾기 · 폴더 바로가기";
    if (activeTab.value === "files") return "비밀 즐겨찾기 파일";
    return "비밀 즐겨찾기";
  }
  if (activeTab.value === "folders") return "즐겨찾기 폴더 바로가기";
  if (activeTab.value === "files") return "즐겨찾기 파일";
  return "즐겨찾기";
});

const handleJumpToFolder = async (folder) => {
  if (!folder?.id) return;
  fileStore.navigateToFolder?.(folder.id);
  await router.push({ name: "home" });
};

onMounted(() => {
  if (props.vaultOnly) {
    if (!fileStore.vaultHasLoaded) {
      void fileStore.fetchVaultFiles?.({ background: true }).catch(() => {});
    }
    return;
  }
  if (!fileStore.hasLoaded) {
    void fileStore.fetchFiles?.({ background: true }).catch(() => {});
  }
});
</script>

<template>
  <BaseFileView
    :title="viewTitle"
    :files="activeItems"
    :empty-message="props.vaultOnly ? '즐겨찾기한 비밀 폴더나 파일이 없습니다. 별(★) 아이콘을 눌러 등록해 보세요.' : undefined"
    @delete="fileStore.moveToTrash"
  >
    <template #header-bottom>
      <div class="mb-4 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div class="flex flex-wrap items-center gap-2">
            <button
              v-for="tab in FAVORITE_TABS"
              :key="tab.value"
              type="button"
              :data-testid="`favorite-tab-${tab.value}`"
              @click="selectTab(tab.value)"
              class="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all"
              :class="
                activeTab === tab.value
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-slate-100 text-gray-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              "
            >
              <i :class="tab.icon"></i>
              <span>{{ tab.label }}</span>
              <span
                class="rounded-full px-1.5 py-0.5 text-[10px]"
                :class="activeTab === tab.value ? 'bg-white/25 text-white' : 'bg-white text-gray-600 dark:bg-slate-700 dark:text-slate-200'"
              >
                {{ tabCounts[tab.value] }}
              </span>
            </button>
          </div>
          <span class="text-xs text-slate-400 dark:text-slate-400">
            {{ props.vaultOnly ? "비밀 폴더를 클릭하면 비밀 공간의 해당 폴더로 바로 이동합니다." : "폴더를 클릭하면 홈 드라이브의 해당 위치로 바로 이동합니다." }}
          </span>
        </div>

        <!-- Quick Folder Shortcut Chips -->
        <div
          v-if="favoriteFolders.length > 0 && activeTab !== 'files'"
          data-testid="favorite-folder-shortcuts"
          class="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/20"
        >
          <span class="mr-1 inline-flex items-center gap-1.5 text-xs font-extrabold text-amber-700 dark:text-amber-300">
            <i class="fa-solid fa-bolt"></i>
            <span>{{ props.vaultOnly ? "비밀 폴더 바로가기" : "빠른 폴더 바로가기" }}</span>
          </span>
          <button
            v-for="folder in favoriteFolders"
            :key="'fav-shortcut-' + folder.id"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:border-amber-400 hover:bg-amber-50 dark:border-amber-800/60 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            :title="folder.locationPath || folder.name"
            @click="handleJumpToFolder(folder)"
          >
            <i class="fa-solid fa-folder text-amber-500"></i>
            <span class="max-w-[180px] truncate">{{ folder.name }}</span>
          </button>
        </div>
      </div>
    </template>
  </BaseFileView>
</template>
