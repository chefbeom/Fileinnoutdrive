import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceCalendarPanel from './WorkspaceCalendarPanel.vue'

const taskItem = {
  id: 'task:1',
  type: 'task',
  title: 'Review upload flow',
  typeLabel: 'Task',
  detail: 'Today',
  statusLabel: 'Open',
  priorityLabel: 'High',
  priorityTone: 'danger',
  isDone: false,
  isOverdue: true,
  task: { id: 1, canToggle: true },
}

const pageItem = {
  id: 'page:2',
  type: 'page',
  title: 'Release note',
  typeLabel: 'Page',
  detail: 'Tomorrow',
  statusLabel: 'Draft',
  priorityLabel: '',
  priorityTone: 'neutral',
  isDone: false,
  isOverdue: false,
  icon: '📄',
}

const mountPanel = (props = {}) => mount(WorkspaceCalendarPanel, {
  props: {
    loading: false,
    filter: 'upcoming',
    filterOptions: [
      { id: 'upcoming', label: 'Upcoming', count: 1 },
      { id: 'overdue', label: 'Overdue', count: 1 },
    ],
    groups: [
      { id: 'overdue', date: '2026-07-03', label: 'Overdue', items: [taskItem] },
      { id: 'later', date: '2026-07-05', label: 'Later', items: [pageItem] },
    ],
    emptyLabel: 'No calendar items',
    todayKey: '2026-07-04',
    isTaskToggling: () => false,
    ...props,
  },
})

describe('WorkspaceCalendarPanel', () => {
  it('renders filters, overdue groups, task items, and page items', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.workspace-calendar-filter--active').text()).toContain('Upcoming')
    expect(wrapper.find('.workspace-calendar-group--overdue').exists()).toBe(true)
    expect(wrapper.findAll('.workspace-calendar-item')).toHaveLength(2)
    expect(wrapper.text()).toContain('Review upload flow')
    expect(wrapper.text()).toContain('Release note')
  })

  it('emits refresh, filter, task toggle, and open events', async () => {
    const wrapper = mountPanel()

    await wrapper.find('.workspace-history-refresh-btn').trigger('click')
    await wrapper.findAll('.workspace-calendar-filters button')[1].trigger('click')
    await wrapper.find('.workspace-calendar-item__toggle').trigger('click')
    await wrapper.find('.workspace-calendar-item__main').trigger('click')

    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(wrapper.emitted('update:filter')).toEqual([['overdue']])
    expect(wrapper.emitted('toggle-task')).toEqual([[taskItem]])
    expect(wrapper.emitted('open-item')).toEqual([[taskItem]])
  })

  it('shows loading and empty states and disables busy task toggles', () => {
    const loading = mountPanel({ loading: true, groups: [] })
    const empty = mountPanel({ groups: [] })
    const busy = mountPanel({ isTaskToggling: () => true })
    const readonly = mountPanel({
      groups: [{ id: 'readonly', date: '2026-07-04', label: 'Readonly', items: [{ ...taskItem, task: { id: 1, canToggle: false } }] }],
    })

    expect(loading.find('.workspace-floating-panel__empty').text()).toContain('모으는 중')
    expect(empty.find('.workspace-floating-panel__empty').text()).toContain('No calendar items')
    expect(busy.find('.workspace-calendar-item__toggle').attributes('disabled')).toBeDefined()
    expect(readonly.find('.workspace-calendar-item__toggle').attributes('title')).toBe('편집 권한 없음')
  })
})
