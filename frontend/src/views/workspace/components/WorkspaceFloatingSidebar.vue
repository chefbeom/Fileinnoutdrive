<script setup>
defineProps({
  collapsed: { type: Boolean, default: false },
  tabs: { type: Array, default: () => [] },
  activeTab: { type: String, default: '' },
})

const emit = defineEmits(['update:activeTab'])
</script>

<template>
  <aside v-if="!collapsed" class="workspace-floating-sidebar">
    <div class="workspace-floating-panel">
      <nav class="workspace-panel-tabs" aria-label="워크스페이스 패널">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="workspace-panel-tab"
          :class="{ 'workspace-panel-tab--active': activeTab === tab.id }"
          @click="emit('update:activeTab', tab.id)"
        >
          <span>{{ tab.label }}</span>
          <strong v-if="tab.count !== null">{{ tab.count }}</strong>
        </button>
      </nav>

      <slot />
    </div>
  </aside>
</template>

<style scoped src="../styles/04-floating-sidebar.css"></style>