<script setup>
import WorkspaceActivityPanel from './WorkspaceActivityPanel.vue'
import WorkspaceBlockInsertPanel from './WorkspaceBlockInsertPanel.vue'
import WorkspaceOutlinePanel from './WorkspaceOutlinePanel.vue'
import WorkspaceTaskPanel from './WorkspaceTaskPanel.vue'

defineProps({
  activeTab: { type: String, default: '' },
  isPanelVisible: { type: Function, required: true },
  activityItems: { type: Array, default: () => [] },
  quickBlockOptions: { type: Array, default: () => [] },
  quickBlockText: { type: String, default: '' },
  quickBlockAdding: { type: Boolean, default: false },
  canInsertQuickBlock: { type: Boolean, default: false },
  canModifyPage: { type: Boolean, default: false },
  isPageLocked: { type: Boolean, default: false },
  openDocumentTasks: { type: Array, default: () => [] },
  documentTasks: { type: Array, default: () => [] },
  visibleDocumentTasks: { type: Array, default: () => [] },
  taskFilterOptions: { type: Array, default: () => [] },
  taskAssigneeCandidates: { type: Array, default: () => [] },
  newTask: { type: String, default: '' },
  newTaskAssignee: { type: String, default: '' },
  newTaskDueDate: { type: String, default: '' },
  taskFilter: { type: String, default: '' },
  taskEmptyLabel: { type: String, default: '' },
  taskProgress: { type: Number, default: 0 },
  taskSummaryLabel: { type: String, default: '' },
  canAddTask: { type: Boolean, default: false },
  taskAdding: { type: Boolean, default: false },
  isTaskToggling: { type: Function, default: () => false },
  outline: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'insert-block',
  'update:quickBlockText',
  'add-task',
  'focus-task',
  'toggle-task',
  'update:newTask',
  'update:newTaskAssignee',
  'update:newTaskDueDate',
  'update:taskFilter',
  'focus-outline-item',
])
</script>

<template>
  <WorkspaceActivityPanel
    v-if="isPanelVisible('activity')"
    :activity-items="activityItems"
  />

  <div v-if="activeTab === 'all'" class="workspace-floating-divider"></div>

  <WorkspaceBlockInsertPanel
    v-if="isPanelVisible('blocks')"
    :quick-block-options="quickBlockOptions"
    :quick-block-text="quickBlockText"
    :quick-block-adding="quickBlockAdding"
    :can-insert-quick-block="canInsertQuickBlock"
    :can-modify-page="canModifyPage"
    :is-page-locked="isPageLocked"
    @insert-block="emit('insert-block')"
    @update:quick-block-text="emit('update:quickBlockText', $event)"
  />

  <div v-if="activeTab === 'all'" class="workspace-floating-divider"></div>

  <WorkspaceTaskPanel
    v-if="isPanelVisible('tasks')"
    :open-document-tasks="openDocumentTasks"
    :document-tasks="documentTasks"
    :visible-document-tasks="visibleDocumentTasks"
    :task-filter-options="taskFilterOptions"
    :task-assignee-candidates="taskAssigneeCandidates"
    :new-task="newTask"
    :new-task-assignee="newTaskAssignee"
    :new-task-due-date="newTaskDueDate"
    :task-filter="taskFilter"
    :task-empty-label="taskEmptyLabel"
    :task-progress="taskProgress"
    :task-summary-label="taskSummaryLabel"
    :can-modify-workspace-page="canModifyPage"
    :can-add-task="canAddTask"
    :task-adding="taskAdding"
    :is-task-toggling="isTaskToggling"
    @add-task="emit('add-task')"
    @focus-task="emit('focus-task', $event)"
    @toggle-task="emit('toggle-task', $event)"
    @update:new-task="emit('update:newTask', $event)"
    @update:new-task-assignee="emit('update:newTaskAssignee', $event)"
    @update:new-task-due-date="emit('update:newTaskDueDate', $event)"
    @update:task-filter="emit('update:taskFilter', $event)"
  />

  <div v-if="activeTab === 'all'" class="workspace-floating-divider"></div>

  <WorkspaceOutlinePanel
    v-if="isPanelVisible('outline')"
    :outline="outline"
    @focus-outline-item="emit('focus-outline-item', $event)"
  />
</template>