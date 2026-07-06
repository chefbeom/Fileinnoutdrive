import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceBoardPanel from './WorkspaceBoardPanel.vue'

const statusOptions = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'Doing' },
  { id: 'done', label: 'Done' },
]

const row = {
  id: 42,
  icon: 'P',
  title: 'Workspace page',
  scopeLabel: 'Shared',
  roleLabel: 'Editor',
  priorityTone: 'danger',
  priorityLabel: 'High',
  dueDate: '2026-07-04',
  locked: true,
  ownerName: 'Admin',
  tags: ['release', 'docs'],
  workspaceTasks: [{ checked: false }, { checked: true }],
  canEditProperties: true,
  isOverdue: true,
  status: 'doing',
}

const columns = [
  { id: 'todo', tone: 'muted', label: 'To do', openTaskCount: 0, rows: [] },
  { id: 'doing', tone: 'primary', label: 'Doing', openTaskCount: 1, rows: [row] },
  { id: 'done', tone: 'success', label: 'Done', openTaskCount: 0, rows: [] },
]

const mountPanel = (props = {}) => mount(WorkspaceBoardPanel, {
  props: {
    loading: false,
    error: '',
    rows: [row],
    columns,
    statusOptions,
    draggingId: '42',
    dragOverStatus: 'doing',
    isRowUpdating: () => false,
    ...props,
  },
})

describe('WorkspaceBoardPanel', () => {
  it('renders board columns, row metadata, and drag state', () => {
    const wrapper = mountPanel()

    expect(wrapper.findAll('.workspace-board-column')).toHaveLength(3)
    expect(wrapper.find('.workspace-board-column--drop-target').text()).toContain('Doing')
    expect(wrapper.find('.workspace-board-card--dragging').exists()).toBe(true)
    expect(wrapper.text()).toContain('Workspace page')
    expect(wrapper.text()).toContain('release, docs')
    expect(wrapper.text()).toContain('열린 작업 1')
  })

  it('emits refresh, drag, open, and status action events', async () => {
    const wrapper = mountPanel()
    const dataTransfer = {
      effectAllowed: '',
      setData: () => {},
      getData: () => '42',
    }

    await wrapper.find('.workspace-history-refresh-btn').trigger('click')
    await wrapper.findAll('.workspace-board-column')[1].trigger('dragenter')
    await wrapper.findAll('.workspace-board-column')[1].trigger('dragleave')
    await wrapper.findAll('.workspace-board-column')[1].trigger('drop', { dataTransfer })
    await wrapper.find('.workspace-board-card').trigger('dragstart', { dataTransfer })
    await wrapper.find('.workspace-board-card').trigger('dragend')
    await wrapper.find('.workspace-board-card__main').trigger('click')

    const actionButtons = wrapper.findAll('.workspace-board-card__actions button')
    await actionButtons[0].trigger('click')
    await wrapper.find('.workspace-board-card__actions select').setValue('done')
    await actionButtons[1].trigger('click')

    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(wrapper.emitted('set-drop-target')[0]).toEqual(['doing'])
    expect(wrapper.emitted('clear-drop-target')[0][1]).toBe('doing')
    expect(wrapper.emitted('drop-status')[0][1]).toBe('doing')
    expect(wrapper.emitted('start-drag')[0][1]).toMatchObject(row)
    expect(wrapper.emitted('clear-drag')).toHaveLength(1)
    expect(wrapper.emitted('open-row')[0][0]).toMatchObject(row)
    expect(wrapper.emitted('move-status')[0]).toEqual([row, -1])
    expect(wrapper.emitted('update-status')[0]).toEqual([row, 'done'])
    expect(wrapper.emitted('move-status')[1]).toEqual([row, 1])
  })

  it('shows loading, error, empty, and disabled states', () => {
    const loading = mountPanel({ loading: true, rows: [], columns: [] })
    const empty = mountPanel({ rows: [], columns: [] })
    const error = mountPanel({ error: 'failed' })
    const busy = mountPanel({ isRowUpdating: () => true })
    const readonly = mountPanel({
      rows: [{ ...row, canEditProperties: false }],
      columns: [{ ...columns[1], rows: [{ ...row, canEditProperties: false }] }],
    })

    expect(loading.find('.workspace-floating-panel__empty').text()).toContain('불러오는 중')
    expect(empty.find('.workspace-floating-panel__empty').text()).toContain('표시할 페이지가 없습니다')
    expect(error.text()).toContain('failed')
    expect(busy.find('.workspace-board-card').attributes('draggable')).toBe('false')
    expect(readonly.find('.workspace-board-card__actions select').attributes('disabled')).toBeDefined()
  })
})
