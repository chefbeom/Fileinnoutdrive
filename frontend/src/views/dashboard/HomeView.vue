<script setup>
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import BaseFileView from "@/components/BaseFileView.vue";
import FilePreviewModal from "@/components/FilePreviewModal.vue";
import { useFileStore } from "@/stores/useFileStore.js";
import { useSecretFolderStore } from "@/stores/useSecretFolderStore.js";

const fileStore = useFileStore();
const secretFolderStore = useSecretFolderStore();
const previewFile = ref(null);

const isVaultUnlockedView = computed(() =>
  Boolean(secretFolderStore.vaultMode && secretFolderStore.vaultUnlocked && !secretFolderStore.vaultTrashView),
);

const homeShortcutItems = computed(() => {
  if (secretFolderStore.vaultMode && secretFolderStore.vaultTrashView) {
    return [];
  }
  const source = isVaultUnlockedView.value ? fileStore.vaultFavoriteItems : fileStore.favoriteItems;
  const folders = [];
  const files = [];
  for (const item of source || []) {
    if (item?.type === "folder") {
      folders.push(item);
    } else {
      files.push(item);
    }
  }
  return [...folders, ...files].slice(0, 10);
});

const totalShortcutCount = computed(() =>
  isVaultUnlockedView.value
    ? (fileStore.vaultFavoriteItems || []).length
    : (fileStore.favoriteItems || []).length,
);

const handleClickShortcut = (item) => {
  if (!item) return;
  if (item.type === "folder") {
    fileStore.navigateToFolder(item.id);
    return;
  }
  if (item.lockedFile) {
    window.alert("이 파일은 잠겨있습니다.");
    return;
  }
  fileStore.recordFileAccess?.(item);
  previewFile.value = item;
};

const handleDelete = async (fileId) => {
  try {
    if (secretFolderStore.vaultMode && secretFolderStore.vaultTrashView) {
      await fileStore.permanentlyDelete(fileId);
    } else {
      await fileStore.moveToTrash(fileId);
    }
  } catch (error) {
    window.alert(
      error?.response?.data?.message ||
      error?.message ||
      "항목을 삭제하지 못했습니다.",
    );
  }
};
</script>

<template>
  <BaseFileView
    title="홈"
    :files="fileStore.driveFiles"
    :show-folder-navigation="true"
    @delete="handleDelete"
  >
    <template #header-bottom>
      <section
        v-if="homeShortcutItems.length > 0"
        data-testid="home-favorites-strip"
        class="mb-4 rounded-2xl border px-3.5 py-2.5"
        :class="isVaultUnlockedView
          ? 'border-amber-400/35 bg-amber-500/5'
          : 'border-amber-300/50 bg-amber-50/70 dark:border-amber-500/25 dark:bg-amber-500/10'"
      >
        <div class="mb-2 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-xs font-extrabold text-amber-700 dark:text-amber-300">
            <i class="fa-solid fa-star text-amber-500"></i>
            <span>{{ isVaultUnlockedView ? "비밀 즐겨찾기 · 바로가기" : "즐겨찾기 · 폴더 바로가기" }}</span>
            <span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold">
              {{ totalShortcutCount }}
            </span>
          </div>
          <RouterLink
            :to="{ name: isVaultUnlockedView ? 'secretFavorites' : 'favoriteFile' }"
            class="text-xs font-bold hover:underline no-underline"
            :class="isVaultUnlockedView ? 'text-amber-600 dark:text-amber-300' : 'text-blue-600 dark:text-blue-400'"
          >
            전체 보기 →
          </RouterLink>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="item in homeShortcutItems"
            :key="'home-fav-' + item.id"
            type="button"
            class="inline-flex max-w-[220px] items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-main)] shadow-sm transition hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-300"
            :class="String(fileStore.currentFolderId ?? '') === String(item.id) ? 'ring-2 ring-amber-400/60' : ''"
            :title="item.type === 'folder' ? `${item.name} 폴더로 바로 이동` : `${item.name} 미리보기`"
            @click="handleClickShortcut(item)"
          >
            <i
              :class="item.type === 'folder' ? 'fa-solid fa-folder text-amber-500' : 'fa-solid fa-file text-blue-500'"
              class="shrink-0 text-xs"
            ></i>
            <span class="truncate">{{ item.name }}</span>
          </button>
        </div>
      </section>
    </template>
  </BaseFileView>

  <FilePreviewModal
    :file="previewFile"
    @close="previewFile = null"
  />
</template>
