<script setup>
import BaseFileView from "@/components/BaseFileView.vue";
import { useFileStore } from "@/stores/useFileStore.js";
import { useSecretFolderStore } from "@/stores/useSecretFolderStore.js";

const fileStore = useFileStore();
const secretFolderStore = useSecretFolderStore();

const handleDelete = async (fileId) => {
  if (secretFolderStore.vaultMode && secretFolderStore.vaultTrashView) {
    await fileStore.permanentlyDelete(fileId);
    return;
  }
  await fileStore.moveToTrash(fileId);
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
