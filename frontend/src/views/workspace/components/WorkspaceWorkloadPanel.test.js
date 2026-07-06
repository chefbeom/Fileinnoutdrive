import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceWorkloadPanel from './WorkspaceWorkloadPanel.vue'

const page = {
  id: 7,
  icon: 'P',
  title: 'Project page',
  statusLabel: '??',
  dueDate: '2026-07-10',
  isOverdue: false,
}

const task = {
  id: 'task-1',
  text: 'Review draft',
  documentTitle: 'Project page',
  dueDate: '2026-07-04',
  isOverdue: true,
}

const workloadRows = [
  {
    key: 'owner@example.com',
    name: 'Owner',
    initial: 'O',
    image: '',
    isMe: true,
    isOnline: true,
    role: 'ADMIN',
    activePages: [page],
    openTasks: [task],
    overdueTasks: [task],
    overduePages: [],
  },
]

const mountPanel = (props = {}) => mount(WorkspaceWorkloadPanel, {
  props: {
    loading: false,
    workloadRows,
    roleLabel: (role) => role === 'ADMIN' ? '???' : '??',
    ...props,
  },
})

describe('WorkspaceWorkloadPanel', () => {
  it('renders workload rows, stats, pages, and tasks', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.workspace-floating-panel__count').text()).toBe('1')
    expect(wrapper.find('.workspace-workload-person--me').exists()).toBe(true)
    expect(wrapper.find('.workspace-workload-person--overdue').exists()).toBe(true)
    expect(wrapper.text()).toContain('Owner')
    expect(wrapper.text()).toContain('???')
    expect(wrapper.text()).toContain('Project page')
    expect(wrapper.text()).toContain('Review draft')
  })

  it('emits page and task actions', async () => {
    const wrapper = mountPanel()
    const links = wrapper.findAll('.workspace-workload-link')

    await links[0].trigger('click')
    await links[1].trigger('click')

    expect(wrapper.emitted('open-document')).toEqual([[page]])
    expect(wrapper.emitted('focus-task')).toEqual([[task]])
  })

  it('shows loading and empty states', () => {
    const loading = mountPanel({ loading: true, workloadRows: [] })
    const empty = mountPanel({ workloadRows: [] })

    expect(loading.find('.workspace-floating-panel__empty').exists()).toBe(true)
    expect(empty.find('.workspace-floating-panel__empty').exists()).toBe(true)
    expect(empty.findAll('.workspace-workload-person')).toHaveLength(0)
  })
})
