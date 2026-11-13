<script setup>
import SecretSpaceViewShell from "@/components/secret/SecretSpaceViewShell.vue";
import PhotosView from "@/views/dashboard/PhotosView.vue";
</script>

<template>
  <SecretSpaceViewShell mode="photos">
    <PhotosView :vault-only="true" />
  </SecretSpaceViewShell>
</template>
