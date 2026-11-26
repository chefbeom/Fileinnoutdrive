<script setup>
import SecretSpaceViewShell from "@/components/secret/SecretSpaceViewShell.vue";
import FavoriteFileView from "@/views/dashboard/FavoriteFileView.vue";
</script>

<template>
  <SecretSpaceViewShell mode="favorites">
    <FavoriteFileView :vault-only="true" />
  </SecretSpaceViewShell>
</template>
