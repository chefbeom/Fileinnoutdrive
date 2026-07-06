import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspacePageDatabasePanel from './WorkspacePageDatabasePanel.vue'

const statusOptions = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'Doing' },
  { id: 'done', label: 'Done' },
]

const priorityOptions = [
  { id: 'low', label: 'Low' },
  { id: 'high', label: 'High' },
]

const row = {
  id: 42,
  icon: 'P',
  title: 'Workspace page',
  scopeLabel: 'Shared',
  roleLabel: 'Editor',
  updatedLabel: 'today',
  preview: 'Short preview',
  locked: true,
  canEditProperties: true,
  isOverdue: true,
  status: 'doing',
  priority: 'high',
  ownerEmail: 'admin@example.com',
  dueDate: '2026-07-04',
  tags: ['release', 'docs'],
}

const view = { id: 'view-1', name: 'Release', filter: 'active' }

const mountPanel = (props = {}) => mount(WorkspacePageDatabasePanel, {
  props: {
    loading: false,
    error: '',
    filter: 'all',
    filterOptions: [
      { id: 'all', label: 'All', count: 1 },
      { id: 'active', label: 'Active', count: 1 },
    ],
    query: 'work',
    sort: 'updated-desc',
    sortOptions: [
      { id: 'updated-desc', label: 'Recent' },
      { id: 'title-asc', label: 'Title' },
    ],
    ownerFilter: '',
    ownerFilterOptions: [{ id: 'admin@example.com', label: 'Admin', count: 1 }],
    tagFilter: '',
    tagOptions: [{ id: 'release', label: 'release', count: 1 }],
    views: [view],
    activeView: view,
    viewName: 'Mine',
    canCreateView: true,
    visibleEditableRows: [row],
    selectedRows: [row],
    allVisibleRowsSelected: true,
    canApplyBulkUpdate: true,
    bulkStatus: '',
    bulkPriority: '',
    bulkOwnerEmail: '',
    bulkDueDate: '',
    bulkClearDueDate: false,
    bulkUpdating: false,
    ownerCandidates: [{ email: 'admin@example.com', name: 'Admin' }],
    statusOptions,
    priorityOptions,
    rows: [row],
    ownerOptions: () => [{ email: 'admin@example.com', name: 'Admin' }],
    isRowSelected: () => true,
    isRowUpdating: () => false,
    viewSummary: () => 'All pages',
    ...props,
  },
})

describe('WorkspacePageDatabasePanel', () => {
  it('renders filters, saved views, bulk tools, and rows', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.workspace-page-index-filter--active').text()).toContain('All')
    expect(wrapper.find('.workspace-page-index-view-pill--active').text()).toContain('Release')
    expect(wrapper.find('.workspace-page-index-bulk-actions').exists()).toBe(true)
    expect(wrapper.findAll('.workspace-page-index-row')).toHaveLength(1)
    expect(wrapper.text()).toContain('Workspace page')
    expect(wrapper.text()).toContain('Short preview')
    expect(wrapper.text()).toContain('#release')
  })

  it('emits filter, tool, view, and bulk events', async () => {
    const wrapper = mountPanel()

    await wrapper.find('.workspace-history-refresh-btn').trigger('click')
    await wrapper.findAll('.workspace-page-index-filters button')[1].trigger('click')
    await wrapper.find('.workspace-page-index-search input').setValue('release')
    await wrapper.find('.workspace-page-index-search button').trigger('click')
    await wrapper.find('.workspace-page-index-sort select').setValue('title-asc')
    await wrapper.find('.workspace-page-index-owner-filter select').setValue('admin@example.com')
    await wrapper.findAll('.workspace-page-index-tag-filter button')[1].trigger('click')
    await wrapper.find('.workspace-page-index-view-pill button').trigger('click')
    await wrapper.findAll('.workspace-page-index-view-pill button')[1].trigger('click')
    await wrapper.find('.workspace-page-index-view-form input').setValue('Current view')
    await wrapper.find('.workspace-page-index-view-form').trigger('submit.prevent')
    await wrapper.find('.workspace-page-index-select-visible input').trigger('change')

    const bulkControls = wrapper.findAll('.workspace-page-index-bulk-actions select')
    await bulkControls[0].setValue('done')
    await bulkControls[1].setValue('low')
    await bulkControls[2].setValue('admin@example.com')
    await wrapper.find('.workspace-page-index-bulk-actions input[type="date"]').setValue('2026-07-05')
    await wrapper.find('.workspace-page-index-bulk-check input').setValue(true)
    const bulkButtons = wrapper.findAll('.workspace-page-index-bulk-actions button')
    await bulkButtons[0].trigger('click')
    await bulkButtons[1].trigger('click')

    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(wrapper.emitted('update:filter')).toEqual([['active']])
    expect(wrapper.emitted('update:query')).toEqual([['release'], ['']])
    expect(wrapper.emitted('update:sort')).toEqual([['title-asc']])
    expect(wrapper.emitted('update:ownerFilter')).toEqual([['admin@example.com']])
    expect(wrapper.emitted('update:tagFilter')[0]).toEqual(['release'])
    expect(wrapper.emitted('apply-view')[0][0]).toMatchObject(view)
    expect(wrapper.emitted('remove-view')[0][0]).toMatchObject(view)
    expect(wrapper.emitted('update:viewName')).toEqual([['Current view']])
    expect(wrapper.emitted('create-view')).toHaveLength(1)
    expect(wrapper.emitted('toggle-visible-selection')).toHaveLength(1)
    expect(wrapper.emitted('update:bulkStatus')).toEqual([['done']])
    expect(wrapper.emitted('update:bulkPriority')).toEqual([['low']])
    expect(wrapper.emitted('update:bulkOwnerEmail')).toEqual([['admin@example.com']])
    expect(wrapper.emitted('update:bulkDueDate').flat()).toContain('2026-07-05')
    expect(wrapper.emitted('update:bulkClearDueDate')).toEqual([[true]])
    expect(wrapper.emitted('apply-bulk')).toHaveLength(1)
    expect(wrapper.emitted('clear-selection')).toHaveLength(1)
  })

  it('emits row selection and row edit events', async () => {
    const wrapper = mountPanel()

    await wrapper.find('.workspace-page-index-row__select input').trigger('change')
    await wrapper.find('.workspace-page-index-row__main').trigger('click')

    const rowSelects = wrapper.findAll('.workspace-page-index-row__props select')
    await rowSelects[0].setValue('done')
    await rowSelects[1].setValue('low')
    await rowSelects[2].setValue('admin@example.com')
    await wrapper.find('.workspace-page-index-edit--date input').setValue('2026-07-06')
    await wrapper.find('.workspace-page-index-edit--tags input').setValue('release, qa')
    await wrapper.find('.workspace-page-index-tags button').trigger('click')

    expect(wrapper.emitted('toggle-row-selection')[0][0]).toMatchObject(row)
    expect(wrapper.emitted('open-row')[0][0]).toMatchObject(row)
    expect(wrapper.emitted('update-row-status')).toEqual([[row, 'done']])
    expect(wrapper.emitted('update-row-priority')).toEqual([[row, 'low']])
    expect(wrapper.emitted('update-row-owner')[0][0]).toMatchObject(row)
    expect(wrapper.emitted('update-row-owner')[0][1]).toBeTruthy()
    expect(wrapper.emitted('update-row-due-date')).toEqual([[row, '2026-07-06']])
    expect(wrapper.emitted('update-row-tags')[0][0]).toMatchObject(row)
    expect(wrapper.emitted('update-row-tags')[0][1]).toBeTruthy()
    expect(wrapper.emitted('update:tagFilter').at(-1)).toEqual(['release'])
  })

  it('shows loading, empty, error, and disabled states', () => {
    const loading = mountPanel({ loading: true, rows: [], selectedRows: [] })
    const empty = mountPanel({ rows: [], selectedRows: [] })
    const error = mountPanel({ error: 'failed' })
    const readonly = mountPanel({
      rows: [{ ...row, canEditProperties: false }],
      visibleEditableRows: [],
      selectedRows: [],
    })
    const busy = mountPanel({ isRowUpdating: () => true })

    expect(loading.find('.workspace-floating-panel__empty').text()).toContain('불러오는 중')
    expect(empty.find('.workspace-floating-panel__empty').text()).toContain('조건에 맞는 페이지가 없습니다')
    expect(error.text()).toContain('failed')
    expect(readonly.find('.workspace-page-index-row__select input').attributes('disabled')).toBeDefined()
    expect(busy.find('.workspace-page-index-chip').text()).toContain('저장 중')
  })
})
