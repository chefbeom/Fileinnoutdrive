import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceDatabaseBoardPanels from './WorkspaceDatabaseBoardPanels.vue'

const row = { id: 42, title: 'Workspace page' }
const view = { id: 'view-1', name: 'Release' }

const stubs = {
  WorkspacePageDatabasePanel: defineComponent({
    props: ['filter', 'query', 'rows'],
    emits: [
      'refresh',
      'update:filter',
      'update:query',
      'update:sort',
      'update:owner-filter',
      'update:tag-filter',
      'update:view-name',
      'update:bulk-status',
      'update:bulk-priority',
      'update:bulk-owner-email',
      'update:bulk-due-date',
      'update:bulk-clear-due-date',
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
    ],
    setup(_, { emit }) {
      return { emit, row, view }
    },
    template: `
      <section class="database-panel">
        <button class="db-refresh" @click="emit('refresh')">refresh</button>
        <button class="db-filter" @click="emit('update:filter', 'active')">filter</button>
        <button class="db-query" @click="emit('update:query', 'release')">query</button>
        <button class="db-sort" @click="emit('update:sort', 'title-asc')">sort</button>
        <button class="db-owner-filter" @click="emit('update:owner-filter', 'admin@example.test')">owner filter</button>
        <button class="db-tag-filter" @click="emit('update:tag-filter', 'release')">tag filter</button>
        <button class="db-view-name" @click="emit('update:view-name', 'Current')">view name</button>
        <button class="db-bulk-status" @click="emit('update:bulk-status', 'done')">bulk status</button>
        <button class="db-bulk-priority" @click="emit('update:bulk-priority', 'high')">bulk priority</button>
        <button class="db-bulk-owner" @click="emit('update:bulk-owner-email', 'owner@example.test')">bulk owner</button>
        <button class="db-bulk-due" @click="emit('update:bulk-due-date', '2026-07-06')">bulk due</button>
        <button class="db-bulk-clear" @click="emit('update:bulk-clear-due-date', true)">bulk clear</button>
        <button class="db-apply-view" @click="emit('apply-view', view)">apply view</button>
        <button class="db-remove-view" @click="emit('remove-view', view)">remove view</button>
        <button class="db-create-view" @click="emit('create-view')">create view</button>
        <button class="db-toggle-visible" @click="emit('toggle-visible-selection')">toggle visible</button>
        <button class="db-toggle-row" @click="emit('toggle-row-selection', row)">toggle row</button>
        <button class="db-apply-bulk" @click="emit('apply-bulk')">apply bulk</button>
        <button class="db-clear-selection" @click="emit('clear-selection')">clear</button>
        <button class="db-open-row" @click="emit('open-row', row)">open</button>
        <button class="db-row-status" @click="emit('update-row-status', row, 'done')">status</button>
        <button class="db-row-priority" @click="emit('update-row-priority', row, 'high')">priority</button>
        <button class="db-row-owner" @click="emit('update-row-owner', row, { email: 'owner@example.test' })">owner</button>
        <button class="db-row-due" @click="emit('update-row-due-date', row, '2026-07-06')">due</button>
        <button class="db-row-tags" @click="emit('update-row-tags', row, ['release'])">tags</button>
      </section>
    `,
  }),
  WorkspaceBoardPanel: defineComponent({
    props: ['rows', 'columns'],
    emits: [
      'refresh',
      'open-row',
      'set-drop-target',
      'clear-drop-target',
      'drop-status',
      'start-drag',
      'clear-drag',
      'move-status',
      'update-status',
    ],
    setup(_, { emit }) {
      return { emit, row }
    },
    template: `
      <section class="board-panel">
        <button class="board-refresh" @click="emit('refresh')">refresh</button>
        <button class="board-open" @click="emit('open-row', row)">open</button>
        <button class="board-set-drop" @click="emit('set-drop-target', 'done')">set drop</button>
        <button class="board-clear-drop" @click="emit('clear-drop-target', { type: 'dragleave' }, 'done')">clear drop</button>
        <button class="board-drop" @click="emit('drop-status', { type: 'drop' }, 'done')">drop</button>
        <button class="board-start" @click="emit('start-drag', { type: 'dragstart' }, row)">start</button>
        <button class="board-clear" @click="emit('clear-drag')">clear</button>
        <button class="board-move" @click="emit('move-status', row, 1)">move</button>
        <button class="board-status" @click="emit('update-status', row, 'done')">status</button>
      </section>
    `,
  }),
}

const mountPanels = (overrides = {}) => mount(WorkspaceDatabaseBoardPanels, {
  props: {
    activeTab: 'all',
    isPanelVisible: (id) => ['database', 'board'].includes(id),
    loading: false,
    error: '',
    databaseFilter: 'all',
    databaseFilterOptions: [{ id: 'all', label: '전체' }],
    databaseQuery: '',
    databaseSort: 'updated-desc',
    databaseSortOptions: [],
    databaseOwnerFilter: '',
    databaseOwnerFilterOptions: [],
    databaseTagFilter: '',
    databaseTagOptions: [],
    databaseViews: [view],
    databaseActiveView: view,
    databaseViewName: '',
    databaseCanCreateView: true,
    databaseVisibleEditableRows: [row],
    databaseSelectedRows: [row],
    databaseAllVisibleRowsSelected: true,
    databaseCanApplyBulkUpdate: true,
    databaseBulkStatus: '',
    databaseBulkPriority: '',
    databaseBulkOwnerEmail: '',
    databaseBulkDueDate: '',
    databaseBulkClearDueDate: false,
    databaseBulkUpdating: false,
    ownerCandidates: [],
    statusOptions: [{ id: 'todo', label: 'To do' }],
    priorityOptions: [{ id: 'high', label: 'High' }],
    databaseRows: [row],
    databaseOwnerOptions: () => [],
    isDatabaseRowSelected: () => false,
    isRowUpdating: () => false,
    databaseViewSummary: () => '',
    boardRows: [row],
    boardColumns: [{ id: 'todo', rows: [row] }],
    boardDraggingId: '',
    boardDragOverStatus: '',
    ...overrides,
  },
  global: { stubs },
})

describe('WorkspaceDatabaseBoardPanels', () => {
  it('renders database and board panels with the all-tab divider', () => {
    const wrapper = mountPanels()

    expect(wrapper.find('.database-panel').exists()).toBe(true)
    expect(wrapper.find('.board-panel').exists()).toBe(true)
    expect(wrapper.find('.workspace-floating-divider').exists()).toBe(true)
  })

  it('uses the visibility callback for both panels', () => {
    const wrapper = mountPanels({ isPanelVisible: (id) => id === 'board' })

    expect(wrapper.find('.database-panel').exists()).toBe(false)
    expect(wrapper.find('.board-panel').exists()).toBe(true)
  })

  it('forwards database model, view, bulk, and row events', async () => {
    const wrapper = mountPanels()

    for (const selector of [
      '.db-refresh',
      '.db-filter',
      '.db-query',
      '.db-sort',
      '.db-owner-filter',
      '.db-tag-filter',
      '.db-view-name',
      '.db-bulk-status',
      '.db-bulk-priority',
      '.db-bulk-owner',
      '.db-bulk-due',
      '.db-bulk-clear',
      '.db-apply-view',
      '.db-remove-view',
      '.db-create-view',
      '.db-toggle-visible',
      '.db-toggle-row',
      '.db-apply-bulk',
      '.db-clear-selection',
      '.db-open-row',
      '.db-row-status',
      '.db-row-priority',
      '.db-row-owner',
      '.db-row-due',
      '.db-row-tags',
    ]) {
      await wrapper.find(selector).trigger('click')
    }

    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(wrapper.emitted('update:databaseFilter')).toEqual([['active']])
    expect(wrapper.emitted('update:databaseQuery')).toEqual([['release']])
    expect(wrapper.emitted('update:databaseSort')).toEqual([['title-asc']])
    expect(wrapper.emitted('update:databaseOwnerFilter')).toEqual([['admin@example.test']])
    expect(wrapper.emitted('update:databaseTagFilter')).toEqual([['release']])
    expect(wrapper.emitted('update:databaseViewName')).toEqual([['Current']])
    expect(wrapper.emitted('update:databaseBulkStatus')).toEqual([['done']])
    expect(wrapper.emitted('update:databaseBulkPriority')).toEqual([['high']])
    expect(wrapper.emitted('update:databaseBulkOwnerEmail')).toEqual([['owner@example.test']])
    expect(wrapper.emitted('update:databaseBulkDueDate')).toEqual([['2026-07-06']])
    expect(wrapper.emitted('update:databaseBulkClearDueDate')).toEqual([[true]])
    expect(wrapper.emitted('apply-view')).toEqual([[view]])
    expect(wrapper.emitted('remove-view')).toEqual([[view]])
    expect(wrapper.emitted('create-view')).toHaveLength(1)
    expect(wrapper.emitted('toggle-visible-selection')).toHaveLength(1)
    expect(wrapper.emitted('toggle-row-selection')).toEqual([[row]])
    expect(wrapper.emitted('apply-bulk')).toHaveLength(1)
    expect(wrapper.emitted('clear-selection')).toHaveLength(1)
    expect(wrapper.emitted('open-row')).toEqual([[row]])
    expect(wrapper.emitted('update-row-status')).toEqual([[row, 'done']])
    expect(wrapper.emitted('update-row-priority')).toEqual([[row, 'high']])
    expect(wrapper.emitted('update-row-owner')).toEqual([[row, { email: 'owner@example.test' }]])
    expect(wrapper.emitted('update-row-due-date')).toEqual([[row, '2026-07-06']])
    expect(wrapper.emitted('update-row-tags')).toEqual([[row, ['release']]])
  })

  it('forwards board events and status changes', async () => {
    const wrapper = mountPanels()

    for (const selector of [
      '.board-refresh',
      '.board-open',
      '.board-set-drop',
      '.board-clear-drop',
      '.board-drop',
      '.board-start',
      '.board-clear',
      '.board-move',
      '.board-status',
    ]) {
      await wrapper.find(selector).trigger('click')
    }

    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(wrapper.emitted('open-row')).toEqual([[row]])
    expect(wrapper.emitted('set-board-drop-target')).toEqual([['done']])
    expect(wrapper.emitted('clear-board-drop-target')[0][1]).toBe('done')
    expect(wrapper.emitted('drop-board-status')[0][1]).toBe('done')
    expect(wrapper.emitted('start-board-drag')[0][1]).toEqual(row)
    expect(wrapper.emitted('clear-board-drag')).toHaveLength(1)
    expect(wrapper.emitted('move-board-status')).toEqual([[row, 1]])
    expect(wrapper.emitted('update-row-status')).toEqual([[row, 'done']])
  })
})