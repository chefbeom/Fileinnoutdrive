<script setup>
defineProps({
  cursors: { type: Object, default: () => ({}) },
})
</script>

<template>
  <div class="cursors-overlay" aria-hidden="true">
    <div v-for="(cursor, id) in cursors" :key="id" class="remote-cursor" :style="cursor.style">
      <svg class="cursor-pointer" width="18" height="24" viewBox="0 0 18 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 2L16 11L9 13L13 20L10 22L6 15L2 19V2Z" :fill="cursor.color" stroke="white" stroke-width="2" stroke-linejoin="round" />
      </svg>
      <div class="cursor-label" :style="{ background: cursor.color }">{{ cursor.name }}</div>
    </div>
  </div>
</template>

<style scoped src="../styles/11-remote-cursors.css"></style>