<script setup>
defineProps({
  loading: {
    type: Boolean,
    default: false,
  },
  workloadRows: {
    type: Array,
    default: () => [],
  },
  roleLabel: {
    type: Function,
    default: () => '??',
  },
})

const emit = defineEmits(['open-document', 'focus-task'])
</script>

<template>
<section class="workspace-workload-panel">
  <div class="workspace-floating-panel__header">
    <div>
      <h3>Workload</h3>
      <p>페이지 소유자와 작업 담당자를 사람별로 모아봅니다.</p>
    </div>
    <span class="workspace-floating-panel__count">{{ workloadRows.length }}</span>
  </div>

  <div v-if="loading" class="workspace-floating-panel__empty">
    업무 분배를 계산하는 중입니다.
  </div>
  <div v-else-if="workloadRows.length === 0" class="workspace-floating-panel__empty">
    담당자나 소유자가 지정된 페이지/작업이 없습니다.
  </div>
  <div v-else class="workspace-workload-list">
    <article
      v-for="person in workloadRows"
      :key="`workload-${person.key}`"
      class="workspace-workload-person"
      :class="[
        { 'workspace-workload-person--me': person.isMe },
        { 'workspace-workload-person--overdue': person.overdueTasks.length + person.overduePages.length > 0 },
      ]"
    >
      <div class="workspace-workload-person__header">
        <span class="workspace-workload-avatar">
          <img v-if="person.image" :src="person.image" :alt="person.name" />
          <span v-else>{{ person.initial }}</span>
        </span>
        <span class="workspace-workload-person__identity">
          <strong>{{ person.name }}</strong>
          <small>
            <template v-if="person.isMe">나 · </template>
            <template v-if="person.isOnline">접속 중</template>
            <template v-else>오프라인</template>
            <template v-if="person.role"> · {{ roleLabel(person.role) }}</template>
          </small>
        </span>
      </div>

      <div class="workspace-workload-stats" aria-label="업무 분배 요약">
        <span>
          <strong>{{ person.activePages.length }}</strong>
          <small>진행 페이지</small>
        </span>
        <span>
          <strong>{{ person.openTasks.length }}</strong>
          <small>열린 작업</small>
        </span>
        <span :class="{ 'workspace-workload-stat--danger': person.overdueTasks.length + person.overduePages.length > 0 }">
          <strong>{{ person.overdueTasks.length + person.overduePages.length }}</strong>
          <small>지연</small>
        </span>
      </div>

      <div v-if="person.activePages.length > 0" class="workspace-workload-section">
        <div class="workspace-workload-section__title">
          <span>Pages</span>
          <strong>{{ person.activePages.length }}</strong>
        </div>
        <button
          v-for="page in person.activePages.slice(0, 3)"
          :key="`workload-page-${person.key}-${page.id}`"
          type="button"
          class="workspace-workload-link"
          :class="{ 'workspace-workload-link--danger': page.isOverdue }"
          @click="emit('open-document', page)"
        >
          <span>{{ page.icon }}</span>
          <strong>{{ page.title }}</strong>
          <small>{{ page.statusLabel }} · {{ page.dueDate || '기한 없음' }}</small>
        </button>
      </div>

      <div v-if="person.openTasks.length > 0" class="workspace-workload-section">
        <div class="workspace-workload-section__title">
          <span>Tasks</span>
          <strong>{{ person.openTasks.length }}</strong>
        </div>
        <button
          v-for="task in person.openTasks.slice(0, 4)"
          :key="`workload-task-${person.key}-${task.id}`"
          type="button"
          class="workspace-workload-link"
          :class="{ 'workspace-workload-link--danger': task.isOverdue }"
          @click="emit('focus-task', task)"
        >
          <span>
            <i class="fa-regular fa-square-check"></i>
          </span>
          <strong>{{ task.text }}</strong>
          <small>{{ task.documentTitle }} · {{ task.dueDate || '기한 없음' }}</small>
        </button>
      </div>
    </article>
  </div>
</section>
</template>
