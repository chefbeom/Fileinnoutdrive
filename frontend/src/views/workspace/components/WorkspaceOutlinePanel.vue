<script setup>
defineProps({
  outline: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['focus-outline-item'])
</script>

<template>
  <section class="workspace-outline-panel">
    <div class="workspace-floating-panel__header">
      <div>
        <h3>문서 개요</h3>
        <p>제목 블록을 기준으로 페이지 안을 빠르게 이동합니다.</p>
      </div>
      <span class="workspace-floating-panel__count">{{ outline.length }}</span>
    </div>

    <div v-if="outline.length === 0" class="workspace-floating-panel__empty">
      제목 블록을 추가하면 개요가 표시됩니다.
    </div>
    <div v-else class="workspace-outline-list">
      <button
        v-for="item in outline"
        :key="item.id"
        type="button"
        class="workspace-outline-item"
        :class="`workspace-outline-item--level-${item.level}`"
        @click="emit('focus-outline-item', item)"
      >
        <span>{{ item.anchorText }}</span>
      </button>
    </div>
  </section>
</template>