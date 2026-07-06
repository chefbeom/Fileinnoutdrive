<script setup>
defineProps({
  activityItems: {
    type: Array,
    default: () => [],
  },
})
</script>

<template>
  <section class="workspace-activity-panel">
    <div class="workspace-floating-panel__header">
      <div>
        <h3>최근 활동</h3>
        <p>저장, 댓글, 첨부, 멤버 동기화 이력을 한곳에서 봅니다.</p>
      </div>
      <span class="workspace-floating-panel__count">{{ activityItems.length }}</span>
    </div>

    <div v-if="activityItems.length === 0" class="workspace-floating-panel__empty">
      아직 표시할 활동이 없습니다.
    </div>
    <div v-else class="workspace-activity-list">
      <article
        v-for="activity in activityItems"
        :key="activity.id"
        class="workspace-activity-item"
        :class="`workspace-activity-item--${activity.type}`"
      >
        <div class="workspace-activity-item__icon">
          <i :class="activity.icon"></i>
        </div>
        <div class="workspace-activity-item__body">
          <strong>{{ activity.title }}</strong>
          <p>{{ activity.detail }}</p>
          <span>{{ activity.timeLabel }}</span>
        </div>
      </article>
    </div>
  </section>
</template>