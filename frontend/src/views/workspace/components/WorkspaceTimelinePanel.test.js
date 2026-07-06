import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceTimelinePanel from './WorkspaceTimelinePanel.vue'

const taskItem = {
  id: 'task:1',
  type: 'task',
  title: 'Review release checklist',
  dateLabel: 'Jul 4',
  typeLabel: 'Task',
  detail: 'Backend',
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
  title: 'Deployment note',
  dateLabel: 'Jul 5',
  typeLabel: 'Page',
  detail: 'Operations',
  statusLabel: 'Draft',
  priorityLabel: '',
  priorityTone: 'neutral',
  isDone: false,
  isOverdue: false,
  icon: 'P',
}

const mountPanel = (props = {}) => mount(WorkspaceTimelinePanel, {
  props: {
    loading: false,
    filter: 'open',
    filterOptions: [
      { id: 'open', label: 'Open', count: 1 },
      { id: 'mine', label: 'Mine', count: 1 },
    ],
    range: { startLabel: 'Jul 1', summaryLabel: '5 days', endLabel: 'Jul 5' },
    groups: [
      { id: 'tasks', label: 'Tasks', items: [taskItem] },
      { id: 'pages', label: 'Pages', items: [pageItem] },
    ],
    emptyLabel: 'No timeline items',
    itemStyle: () => ({ '--workspace-timeline-left': '20%' }),
    isTaskToggling: () => false,
    ...props,
  },
})

describe('WorkspaceTimelinePanel', () => {
  it('renders filters, range labels, task items, and page items', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.workspace-timeline-filter--active').text()).toContain('Open')
    expect(wrapper.find('.workspace-timeline-scale').text()).toContain('5 days')
    expect(wrapper.findAll('.workspace-timeline-item')).toHaveLength(2)
    expect(wrapper.text()).toContain('Review release checklist')
    expect(wrapper.text()).toContain('Deployment note')
  })

  it('emits refresh, filter, task toggle, and open events', async () => {
    const wrapper = mountPanel()

    await wrapper.find('.workspace-history-refresh-btn').trigger('click')
    await wrapper.findAll('.workspace-timeline-filters button')[1].trigger('click')
    await wrapper.find('.workspace-timeline-item__toggle').trigger('click')
    await wrapper.find('.workspace-timeline-item__main').trigger('click')

    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(wrapper.emitted('update:filter')).toEqual([['mine']])
    expect(wrapper.emitted('toggle-task')[0][0]).toMatchObject(taskItem)
    expect(wrapper.emitted('open-item')[0][0]).toMatchObject(taskItem)
  })

  it('shows loading and empty states and disables busy task toggles', () => {
    const loading = mountPanel({ loading: true, groups: [] })
    const empty = mountPanel({ groups: [] })
    const busy = mountPanel({ isTaskToggling: () => true })
    const readonly = mountPanel({
      groups: [{ id: 'readonly', label: 'Readonly', items: [{ ...taskItem, task: { id: 1, canToggle: false } }] }],
    })

    expect(loading.find('.workspace-floating-panel__empty').text()).toContain('모으는 중')
    expect(empty.find('.workspace-floating-panel__empty').text()).toContain('No timeline items')
    expect(busy.find('.workspace-timeline-item__toggle').attributes('disabled')).toBeDefined()
    expect(readonly.find('.workspace-timeline-item__toggle').attributes('title')).toBe('편집 권한 없음')
  })
})
