import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import WorkspaceInboxPanel from './WorkspaceInboxPanel.vue'

const filterOptions = [
  { id: 'mine', label: 'Mine', count: 1 },
  { id: 'all', label: 'All', count: 2 },
]

const tasks = [
  {
    id: 'task-1',
    checked: false,
    isOverdue: true,
    isMine: true,
    canToggle: true,
    text: 'Review draft',
    documentTitle: 'Project Plan',
    pathLabel: 'Body',
    assigneeEmail: 'owner@example.test',
    assigneeName: 'Owner',
    dueDate: '2099-01-01',
    scopeLabel: 'Personal',
  },
  {
    id: 'task-2',
    checked: true,
    isOverdue: false,
    isMine: false,
    canToggle: false,
    text: 'Locked task',
    documentTitle: 'Shared Page',
    pathLabel: 'Checklist',
  },
]

const mountPanel = (props = {}) => mount(WorkspaceInboxPanel, {
  props: {
    openTaskCount: 2,
    filterOptions,
    activeFilter: 'mine',
    loading: false,
    tasks,
    emptyLabel: 'No tasks',
    isTaskToggling: vi.fn((task) => task.id === 'task-2'),
    ...props,
  },
})

describe('WorkspaceInboxPanel', () => {
  it('renders filters, count, and visible tasks', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.workspace-floating-panel__count').text()).toBe('2')
    expect(wrapper.findAll('.workspace-inbox-filters button')).toHaveLength(2)
    expect(wrapper.find('.workspace-inbox-filter--active').text()).toContain('Mine')
    expect(wrapper.findAll('.workspace-inbox-item')).toHaveLength(2)
    expect(wrapper.find('.workspace-inbox-item--overdue').exists()).toBe(true)
    expect(wrapper.text()).toContain('Review draft')
  })

  it('emits filter, toggle, and focus events', async () => {
    const wrapper = mountPanel({ isTaskToggling: vi.fn(() => false) })

    await wrapper.findAll('.workspace-inbox-filters button')[1].trigger('click')
    await wrapper.find('.workspace-inbox-item__toggle').trigger('click')
    await wrapper.find('.workspace-inbox-item__main').trigger('click')

    expect(wrapper.emitted('update:filter')).toEqual([['all']])
    expect(wrapper.emitted('toggle-task')).toEqual([[tasks[0]]])
    expect(wrapper.emitted('focus-task')).toEqual([[tasks[0]]])
  })

  it('disables toggle when permission is missing or the task is busy', () => {
    const wrapper = mountPanel()
    const toggles = wrapper.findAll('.workspace-inbox-item__toggle')

    expect(toggles[0].attributes('disabled')).toBeUndefined()
    expect(toggles[1].attributes('disabled')).toBeDefined()
    expect(toggles[1].find('i').classes()).toContain('fa-spinner')
  })

  it('shows loading and empty states', () => {
    const loading = mountPanel({ loading: true, tasks: [] })
    const empty = mountPanel({ loading: false, tasks: [] })

    expect(loading.find('.workspace-floating-panel__empty').exists()).toBe(true)
    expect(loading.findAll('.workspace-inbox-item')).toHaveLength(0)
    expect(empty.text()).toContain('No tasks')
  })
})