<script setup>
import SecretSpaceViewShell from "@/components/secret/SecretSpaceViewShell.vue";
import MediaView from "@/views/dashboard/MediaView.vue";
</script>

<template>
  <SecretSpaceViewShell mode="media">
    <MediaView :vault-only="true" />
  </SecretSpaceViewShell>
</template>
