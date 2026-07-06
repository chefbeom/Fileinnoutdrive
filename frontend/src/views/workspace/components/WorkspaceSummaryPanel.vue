<script setup>
defineProps({
  blockCount: {
    type: Number,
    default: 0,
  },
  summaryCards: {
    type: Array,
    default: () => [],
  },
  healthItems: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['open-panel'])
</script>

<template>
<section class="workspace-summary-panel">
  <div class="workspace-floating-panel__header">
    <div>
      <h3>페이지 요약</h3>
      <p>문서 상태와 협업 체크포인트를 한눈에 확인합니다.</p>
    </div>
    <span class="workspace-floating-panel__count">{{ blockCount }}</span>
  </div>

  <div class="workspace-summary-grid" aria-label="페이지 요약 지표">
    <article
      v-for="card in summaryCards"
      :key="card.id"
      class="workspace-summary-card"
    >
      <span class="workspace-summary-card__icon">
        <i :class="card.icon"></i>
      </span>
      <div>
        <small>{{ card.label }}</small>
        <strong>{{ card.value }}</strong>
        <p>{{ card.detail }}</p>
      </div>
    </article>
  </div>

  <div class="workspace-health-list" aria-label="페이지 상태 점검">
    <article
      v-for="item in healthItems"
      :key="item.id"
      class="workspace-health-item"
      :class="`workspace-health-item--${item.tone}`"
    >
      <span>
        <i :class="item.icon"></i>
      </span>
      <div>
        <strong>{{ item.label }}</strong>
        <p>{{ item.detail }}</p>
      </div>
    </article>
  </div>

  <div class="workspace-summary-actions">
    <button type="button" @click="emit('open-panel', 'blocks')">
      <i class="fa-solid fa-plus"></i>
      <span>블록 추가</span>
    </button>
    <button type="button" @click="emit('open-panel', 'tasks')">
      <i class="fa-regular fa-square-check"></i>
      <span>작업 보기</span>
    </button>
    <button type="button" @click="emit('open-panel', 'review')">
      <i class="fa-regular fa-comments"></i>
      <span>댓글 보기</span>
    </button>
    <button type="button" @click="emit('open-panel', 'assets')">
      <i class="fa-regular fa-folder-open"></i>
      <span>첨부 보기</span>
    </button>
  </div>
</section>
</template>
