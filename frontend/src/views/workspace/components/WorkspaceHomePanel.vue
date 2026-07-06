<script setup>
defineProps({
  loading: {
    type: Boolean,
    default: false,
  },
  metricCards: {
    type: Array,
    default: () => [],
  },
  attentionItems: {
    type: Array,
    default: () => [],
  },
  queueItems: {
    type: Array,
    default: () => [],
  },
  recentPages: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['refresh', 'open-metric', 'open-attention', 'open-queue', 'open-document'])
</script>

<template>
<section class="workspace-home-panel">
  <div class="workspace-floating-panel__header">
    <div>
      <h3>Workspace Home</h3>
      <p>전체 페이지, 작업, 일정, 업무 분배를 빠르게 확인합니다.</p>
    </div>
    <button
      type="button"
      class="workspace-history-refresh-btn"
      :disabled="loading"
      title="홈 새로고침"
      @click="emit('refresh')"
    >
      <i :class="loading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-rotate-right'"></i>
    </button>
  </div>

  <div class="workspace-home-metrics" aria-label="워크스페이스 핵심 지표">
    <button
      v-for="card in metricCards"
      :key="card.id"
      type="button"
      class="workspace-home-metric"
      @click="emit('open-metric', card)"
    >
      <span>
        <i :class="card.icon"></i>
      </span>
      <strong>{{ card.value }}</strong>
      <small>{{ card.label }}</small>
      <em>{{ card.detail }}</em>
    </button>
  </div>

  <section class="workspace-home-section">
    <div class="workspace-home-section__header">
      <span>Attention</span>
      <strong>{{ attentionItems.length }}</strong>
    </div>
    <div v-if="attentionItems.length === 0" class="workspace-floating-panel__empty">
      지금 바로 확인해야 할 항목이 없습니다.
    </div>
    <div v-else class="workspace-home-list">
      <button
        v-for="item in attentionItems"
        :key="item.id"
        type="button"
        class="workspace-home-item"
        :class="`workspace-home-item--${item.tone}`"
        @click="emit('open-attention', item)"
      >
        <span>{{ item.label }}</span>
        <strong>{{ item.title }}</strong>
        <small>{{ item.detail }}</small>
        <i class="fa-solid fa-arrow-right"></i>
      </button>
    </div>
  </section>

  <section class="workspace-home-section">
    <div class="workspace-home-section__header">
      <span>My Queue</span>
      <strong>{{ queueItems.length }}</strong>
    </div>
    <div v-if="queueItems.length === 0" class="workspace-floating-panel__empty">
      내게 배정된 열린 작업이나 페이지가 없습니다.
    </div>
    <div v-else class="workspace-home-list">
      <button
        v-for="item in queueItems"
        :key="item.id"
        type="button"
        class="workspace-home-item"
        :class="{ 'workspace-home-item--danger': item.isOverdue }"
        @click="emit('open-queue', item)"
      >
        <span>{{ item.type === 'task' ? '작업' : '페이지' }}</span>
        <strong>{{ item.title }}</strong>
        <small>{{ item.detail }}</small>
        <i class="fa-solid fa-arrow-right"></i>
      </button>
    </div>
  </section>

  <section class="workspace-home-section">
    <div class="workspace-home-section__header">
      <span>Recent Pages</span>
      <strong>{{ recentPages.length }}</strong>
    </div>
    <div v-if="recentPages.length === 0" class="workspace-floating-panel__empty">
      최근 페이지가 없습니다.
    </div>
    <div v-else class="workspace-home-recent">
      <button
        v-for="page in recentPages"
        :key="`home-recent-${page.id}`"
        type="button"
        @click="emit('open-document', page)"
      >
        <span>{{ page.icon }}</span>
        <strong>{{ page.title }}</strong>
        <small>{{ page.updatedLabel }}</small>
      </button>
    </div>
  </section>
</section>
</template>
