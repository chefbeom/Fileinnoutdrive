<script setup>
import WorkspaceBoardPanel from './WorkspaceBoardPanel.vue'
import WorkspacePageDatabasePanel from './WorkspacePageDatabasePanel.vue'

defineProps({
  activeTab: { type: String, default: '' },
  isPanelVisible: { type: Function, required: true },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  databaseFilter: { type: String, default: 'all' },
  databaseFilterOptions: { type: Array, default: () => [] },
  databaseQuery: { type: String, default: '' },
  databaseSort: { type: String, default: 'updated-desc' },
  databaseSortOptions: { type: Array, default: () => [] },
  databaseOwnerFilter: { type: String, default: '' },
  databaseOwnerFilterOptions: { type: Array, default: () => [] },
  databaseTagFilter: { type: String, default: '' },
  databaseTagOptions: { type: Array, default: () => [] },
  databaseViews: { type: Array, default: () => [] },
  databaseActiveView: { type: Object, default: null },
  databaseViewName: { type: String, default: '' },
  databaseCanCreateView: { type: Boolean, default: false },
  databaseVisibleEditableRows: { type: Array, default: () => [] },
  databaseSelectedRows: { type: Array, default: () => [] },
  databaseAllVisibleRowsSelected: { type: Boolean, default: false },
  databaseCanApplyBulkUpdate: { type: Boolean, default: false },
  databaseBulkStatus: { type: String, default: '' },
  databaseBulkPriority: { type: String, default: '' },
  databaseBulkOwnerEmail: { type: String, default: '' },
  databaseBulkDueDate: { type: String, default: '' },
  databaseBulkClearDueDate: { type: Boolean, default: false },
  databaseBulkUpdating: { type: Boolean, default: false },
  ownerCandidates: { type: Array, default: () => [] },
  statusOptions: { type: Array, default: () => [] },
  priorityOptions: { type: Array, default: () => [] },
  databaseRows: { type: Array, default: () => [] },
  databaseOwnerOptions: { type: Function, default: () => [] },
  isDatabaseRowSelected: { type: Function, default: () => false },
  isRowUpdating: { type: Function, default: () => false },
  databaseViewSummary: { type: Function, default: () => '' },
  boardRows: { type: Array, default: () => [] },
  boardColumns: { type: Array, default: () => [] },
  boardDraggingId: { type: String, default: '' },
  boardDragOverStatus: { type: String, default: '' },
})

const emit = defineEmits([
  'refresh',
  'update:databaseFilter',
  'update:databaseQuery',
  'update:databaseSort',
  'update:databaseOwnerFilter',
  'update:databaseTagFilter',
  'update:databaseViewName',
  'update:databaseBulkStatus',
  'update:databaseBulkPriority',
  'update:databaseBulkOwnerEmail',
  'update:databaseBulkDueDate',
  'update:databaseBulkClearDueDate',
  'apply-view',
  'remove-view',
  'create-view',
  'toggle-visible-selection',
  'toggle-row-selection',
  'apply-bulk',
  'clear-selection',
  'open-row',
  'update-row-status',
  'update-row-priority',
  'update-row-owner',
  'update-row-due-date',
  'update-row-tags',
  'set-board-drop-target',
  'clear-board-drop-target',
  'drop-board-status',
  'start-board-drag',
  'clear-board-drag',
  'move-board-status',
])
</script>

<template>
  <WorkspacePageDatabasePanel
    v-if="isPanelVisible('database')"
    :filter="databaseFilter"
    :query="databaseQuery"
    :sort="databaseSort"
    :owner-filter="databaseOwnerFilter"
    :tag-filter="databaseTagFilter"
    :view-name="databaseViewName"
    :bulk-status="databaseBulkStatus"
    :bulk-priority="databaseBulkPriority"
    :bulk-owner-email="databaseBulkOwnerEmail"
    :bulk-due-date="databaseBulkDueDate"
    :bulk-clear-due-date="databaseBulkClearDueDate"
    :loading="loading"
    :error="error"
    :filter-options="databaseFilterOptions"
    :sort-options="databaseSortOptions"
    :owner-filter-options="databaseOwnerFilterOptions"
    :tag-options="databaseTagOptions"
    :views="databaseViews"
    :active-view="databaseActiveView"
    :can-create-view="databaseCanCreateView"
    :visible-editable-rows="databaseVisibleEditableRows"
    :selected-rows="databaseSelectedRows"
    :all-visible-rows-selected="databaseAllVisibleRowsSelected"
    :can-apply-bulk-update="databaseCanApplyBulkUpdate"
    :bulk-updating="databaseBulkUpdating"
    :owner-candidates="ownerCandidates"
    :status-options="statusOptions"
    :priority-options="priorityOptions"
    :rows="databaseRows"
    :owner-options="databaseOwnerOptions"
    :is-row-selected="isDatabaseRowSelected"
    :is-row-updating="isRowUpdating"
    :view-summary="databaseViewSummary"
    @refresh="emit('refresh')"
    @update:filter="emit('update:databaseFilter', $event)"
    @update:query="emit('update:databaseQuery', $event)"
    @update:sort="emit('update:databaseSort', $event)"
    @update:owner-filter="emit('update:databaseOwnerFilter', $event)"
    @update:tag-filter="emit('update:databaseTagFilter', $event)"
    @update:view-name="emit('update:databaseViewName', $event)"
    @update:bulk-status="emit('update:databaseBulkStatus', $event)"
    @update:bulk-priority="emit('update:databaseBulkPriority', $event)"
    @update:bulk-owner-email="emit('update:databaseBulkOwnerEmail', $event)"
    @update:bulk-due-date="emit('update:databaseBulkDueDate', $event)"
    @update:bulk-clear-due-date="emit('update:databaseBulkClearDueDate', $event)"
    @apply-view="emit('apply-view', $event)"
    @remove-view="emit('remove-view', $event)"
    @create-view="emit('create-view')"
    @toggle-visible-selection="emit('toggle-visible-selection')"
    @toggle-row-selection="emit('toggle-row-selection', $event)"
    @apply-bulk="emit('apply-bulk')"
    @clear-selection="emit('clear-selection')"
    @open-row="emit('open-row', $event)"
    @update-row-status="(...args) => emit('update-row-status', ...args)"
    @update-row-priority="(...args) => emit('update-row-priority', ...args)"
    @update-row-owner="(...args) => emit('update-row-owner', ...args)"
    @update-row-due-date="(...args) => emit('update-row-due-date', ...args)"
    @update-row-tags="(...args) => emit('update-row-tags', ...args)"
  />

  <div v-if="activeTab === 'all'" class="workspace-floating-divider"></div>

  <WorkspaceBoardPanel
    v-if="isPanelVisible('board')"
    :loading="loading"
    :error="error"
    :rows="boardRows"
    :columns="boardColumns"
    :status-options="statusOptions"
    :dragging-id="boardDraggingId"
    :drag-over-status="boardDragOverStatus"
    :is-row-updating="isRowUpdating"
    @refresh="emit('refresh')"
    @open-row="emit('open-row', $event)"
    @set-drop-target="emit('set-board-drop-target', $event)"
    @clear-drop-target="(...args) => emit('clear-board-drop-target', ...args)"
    @drop-status="(...args) => emit('drop-board-status', ...args)"
    @start-drag="(...args) => emit('start-board-drag', ...args)"
    @clear-drag="emit('clear-board-drag')"
    @move-status="(...args) => emit('move-board-status', ...args)"
    @update-status="(...args) => emit('update-row-status', ...args)"
  />
</template>