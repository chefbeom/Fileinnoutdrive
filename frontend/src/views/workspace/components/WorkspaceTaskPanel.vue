<script setup>
import { isWorkspaceTaskOverdue } from '../services/workspaceTasks.js'

defineProps({
  openDocumentTasks: {
    type: Array,
    default: () => [],
  },
  documentTasks: {
    type: Array,
    default: () => [],
  },
  visibleDocumentTasks: {
    type: Array,
    default: () => [],
  },
  taskFilterOptions: {
    type: Array,
    default: () => [],
  },
  taskAssigneeCandidates: {
    type: Array,
    default: () => [],
  },
  newTask: {
    type: String,
    default: '',
  },
  newTaskAssignee: {
    type: String,
    default: '',
  },
  newTaskDueDate: {
    type: String,
    default: '',
  },
  taskFilter: {
    type: String,
    default: 'open',
  },
  taskEmptyLabel: {
    type: String,
    default: '',
  },
  taskProgress: {
    type: Number,
    default: 0,
  },
  taskSummaryLabel: {
    type: String,
    default: '',
  },
  canModifyWorkspacePage: {
    type: Boolean,
    default: false,
  },
  canAddTask: {
    type: Boolean,
    default: false,
  },
  taskAdding: {
    type: Boolean,
    default: false,
  },
  isTaskToggling: {
    type: Function,
    default: () => false,
  },
})

const emit = defineEmits([
  'add-task',
  'focus-task',
  'toggle-task',
  'update:new-task',
  'update:new-task-assignee',
  'update:new-task-due-date',
  'update:task-filter',
])

const updateTextInput = (event, eventName) => {
  emit(eventName, event.target.value)
}
</script>

<template>
  <section class="workspace-task-panel">
    <div class="workspace-floating-panel__header">
      <div>
        <h3>작업 목록</h3>
        <p>문서 체크리스트의 진행 상태입니다.</p>
      </div>
      <span class="workspace-floating-panel__count">{{ openDocumentTasks.length }}</span>
    </div>

    <form class="workspace-task-composer" @submit.prevent="emit('add-task')">
      <div class="workspace-task-composer__row">
        <input
          :value="newTask"
          type="text"
          maxlength="255"
          placeholder="새 작업"
          :disabled="!canModifyWorkspacePage || taskAdding"
          @input="updateTextInput($event, 'update:new-task')"
        />
        <button
          type="submit"
          :disabled="!canAddTask"
          title="작업 추가"
        >
          <i :class="taskAdding ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-plus'"></i>
          <span>추가</span>
        </button>
      </div>
      <div class="workspace-task-composer__meta">
        <select
          :value="newTaskAssignee"
          :disabled="!canModifyWorkspacePage || taskAdding"
          title="담당자"
          @change="updateTextInput($event, 'update:new-task-assignee')"
        >
          <option value="">담당자 없음</option>
          <option
            v-for="candidate in taskAssigneeCandidates"
            :key="candidate.email"
            :value="candidate.email"
          >
            {{ candidate.name }}
          </option>
        </select>
        <input
          :value="newTaskDueDate"
          type="date"
          :disabled="!canModifyWorkspacePage || taskAdding"
          title="기한"
          @input="updateTextInput($event, 'update:new-task-due-date')"
        />
      </div>
    </form>

    <div v-if="documentTasks.length > 0" class="workspace-task-progress">
      <div>
        <strong>{{ taskProgress }}%</strong>
        <span>{{ taskSummaryLabel }}</span>
      </div>
      <div class="workspace-task-progress__bar" aria-hidden="true">
        <span :style="{ width: `${taskProgress}%` }"></span>
      </div>
    </div>

    <div
      v-if="documentTasks.length > 0"
      class="workspace-task-filters"
      role="tablist"
      aria-label="작업 필터"
    >
      <button
        v-for="filter in taskFilterOptions"
        :key="filter.id"
        type="button"
        :class="{ 'workspace-task-filter--active': taskFilter === filter.id }"
        role="tab"
        :aria-selected="taskFilter === filter.id"
        @click="emit('update:task-filter', filter.id)"
      >
        <span>{{ filter.label }}</span>
        <strong>{{ filter.count }}</strong>
      </button>
    </div>

    <div
      v-if="documentTasks.length === 0 || visibleDocumentTasks.length === 0"
      class="workspace-floating-panel__empty"
    >
      {{ taskEmptyLabel }}
    </div>
    <div v-else class="workspace-task-list">
      <article
        v-for="task in visibleDocumentTasks"
        :key="task.id"
        class="workspace-task-item"
        :class="[
          { 'workspace-task-item--done': task.checked },
          { 'workspace-task-item--overdue': isWorkspaceTaskOverdue(task) },
          `workspace-task-item--depth-${Math.min(task.depth || 0, 3)}`,
        ]"
      >
        <button
          type="button"
          class="workspace-task-check"
          :disabled="!canModifyWorkspacePage || isTaskToggling(task)"
          :title="task.checked ? '작업 다시 열기' : '작업 완료'"
          @click="emit('toggle-task', task)"
        >
          <i :class="isTaskToggling(task) ? 'fa-solid fa-spinner fa-spin' : task.checked ? 'fa-solid fa-check' : 'fa-solid fa-minus'"></i>
        </button>
        <button
          type="button"
          class="workspace-task-body"
          title="원본 체크리스트 블록으로 이동"
          @click="emit('focus-task', task)"
        >
          <strong>{{ task.text }}</strong>
          <small>{{ task.pathLabel }} · {{ task.checked ? '완료' : '진행 중' }}</small>
          <span v-if="task.assigneeEmail || task.dueDate" class="workspace-task-meta">
            <span v-if="task.assigneeEmail">
              <i class="fa-regular fa-user"></i>
              {{ task.assigneeName || task.assigneeEmail }}
            </span>
            <span
              v-if="task.dueDate"
              :class="{ 'workspace-task-meta--overdue': isWorkspaceTaskOverdue(task) }"
            >
              <i class="fa-regular fa-calendar"></i>
              {{ task.dueDate }}
            </span>
          </span>
        </button>
      </article>
    </div>
  </section>
</template>