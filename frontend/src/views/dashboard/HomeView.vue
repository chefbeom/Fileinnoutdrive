<script setup>
import BaseFileView from "@/components/BaseFileView.vue";
import { useFileStore } from "@/stores/useFileStore.js";
import { useSecretFolderStore } from "@/stores/useSecretFolderStore.js";

const fileStore = useFileStore();
const secretFolderStore = useSecretFolderStore();

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
  />
</template>
