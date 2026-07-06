<script setup>
defineProps({
  openTaskCount: {
    type: Number,
    default: 0,
  },
  filterOptions: {
    type: Array,
    default: () => [],
  },
  activeFilter: {
    type: String,
    default: 'mine',
  },
  loading: {
    type: Boolean,
    default: false,
  },
  tasks: {
    type: Array,
    default: () => [],
  },
  emptyLabel: {
    type: String,
    default: '',
  },
  isTaskToggling: {
    type: Function,
    default: () => false,
  },
})

const emit = defineEmits([
  'update:filter',
  'toggle-task',
  'focus-task',
])
</script>

<template>
  <section class="workspace-inbox-panel">
    <div class="workspace-floating-panel__header">
      <div>
        <h3>Workspace Inbox</h3>
        <p>전체 페이지의 체크리스트 작업을 한곳에서 확인합니다.</p>
      </div>
      <span class="workspace-floating-panel__count">{{ openTaskCount }}</span>
    </div>

    <div class="workspace-inbox-filters" role="tablist" aria-label="워크스페이스 작업 필터">
      <button
        v-for="filter in filterOptions"
        :key="filter.id"
        type="button"
        :class="{ 'workspace-inbox-filter--active': activeFilter === filter.id }"
        role="tab"
        :aria-selected="activeFilter === filter.id"
        @click="emit('update:filter', filter.id)"
      >
        <span>{{ filter.label }}</span>
        <strong>{{ filter.count }}</strong>
      </button>
    </div>

    <div v-if="loading" class="workspace-floating-panel__empty">
      워크스페이스 작업을 모으는 중입니다.
    </div>
    <div v-else-if="tasks.length === 0" class="workspace-floating-panel__empty">
      {{ emptyLabel }}
    </div>
    <div v-else class="workspace-inbox-list">
      <article
        v-for="task in tasks"
        :key="`workspace-inbox-${task.id}`"
        class="workspace-inbox-item"
        :class="[
          { 'workspace-inbox-item--done': task.checked },
          { 'workspace-inbox-item--overdue': task.isOverdue },
          { 'workspace-inbox-item--mine': task.isMine },
        ]"
      >
        <button
          type="button"
          class="workspace-inbox-item__toggle"
          :disabled="!task.canToggle || isTaskToggling(task)"
          :title="!task.canToggle ? '편집 권한 없음' : task.checked ? '작업 다시 열기' : '작업 완료'"
          @click="emit('toggle-task', task)"
        >
          <i :class="isTaskToggling(task) ? 'fa-solid fa-spinner fa-spin' : task.checked ? 'fa-solid fa-check' : 'fa-solid fa-minus'"></i>
        </button>
        <button type="button" class="workspace-inbox-item__main" @click="emit('focus-task', task)">
          <span class="workspace-inbox-item__body">
            <strong>{{ task.text }}</strong>
            <small>{{ task.documentTitle }} · {{ task.pathLabel }}</small>
            <span class="workspace-inbox-item__meta">
              <span v-if="task.assigneeEmail">
                <i class="fa-regular fa-user"></i>
                {{ task.assigneeName || task.assigneeEmail }}
              </span>
              <span v-if="task.dueDate" :class="{ 'workspace-inbox-item__meta--danger': task.isOverdue }">
                <i class="fa-regular fa-calendar"></i>
                {{ task.dueDate }}
              </span>
              <span>
                <i class="fa-regular fa-file-lines"></i>
                {{ task.scopeLabel || '페이지' }}
              </span>
            </span>
          </span>
          <i class="fa-solid fa-arrow-right"></i>
        </button>
      </article>
    </div>
  </section>
</template>