import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceHomePanel from './WorkspaceHomePanel.vue'

const metricCards = [
  { id: 'pages', icon: 'fa-regular fa-file-lines', value: '8', label: 'Pages', detail: 'Total pages' },
  { id: 'tasks', icon: 'fa-regular fa-square-check', value: '3', label: 'Tasks', detail: 'Open tasks' },
]

const attentionItems = [
  { id: 'attention-1', tone: 'danger', label: 'Overdue', title: 'Late task', detail: 'Due yesterday' },
]

const queueItems = [
  { id: 'queue-1', type: 'task', title: 'My task', detail: 'Assigned to me', isOverdue: true },
]

const recentPages = [
  { id: 11, icon: 'P', title: 'Project page', updatedLabel: 'today' },
]

const mountPanel = (props = {}) => mount(WorkspaceHomePanel, {
  props: {
    loading: false,
    metricCards,
    attentionItems,
    queueItems,
    recentPages,
    ...props,
  },
})

describe('WorkspaceHomePanel', () => {
  it('renders metrics, attention items, queue items, and recent pages', () => {
    const wrapper = mountPanel()

    expect(wrapper.findAll('.workspace-home-metric')).toHaveLength(2)
    expect(wrapper.findAll('.workspace-home-section')).toHaveLength(3)
    expect(wrapper.findAll('.workspace-home-item')).toHaveLength(2)
    expect(wrapper.find('.workspace-home-item--danger').exists()).toBe(true)
    expect(wrapper.text()).toContain('Project page')
  })

  it('emits user action events with selected payloads', async () => {
    const wrapper = mountPanel()

    await wrapper.find('.workspace-history-refresh-btn').trigger('click')
    await wrapper.findAll('.workspace-home-metric')[0].trigger('click')
    await wrapper.findAll('.workspace-home-item')[0].trigger('click')
    await wrapper.findAll('.workspace-home-item')[1].trigger('click')
    await wrapper.find('.workspace-home-recent button').trigger('click')

    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(wrapper.emitted('open-metric')).toEqual([[metricCards[0]]])
    expect(wrapper.emitted('open-attention')).toEqual([[attentionItems[0]]])
    expect(wrapper.emitted('open-queue')).toEqual([[queueItems[0]]])
    expect(wrapper.emitted('open-document')).toEqual([[recentPages[0]]])
  })

  it('shows empty states when home lists are empty', () => {
    const wrapper = mountPanel({
      attentionItems: [],
      queueItems: [],
      recentPages: [],
    })

    expect(wrapper.findAll('.workspace-home-item')).toHaveLength(0)
    expect(wrapper.findAll('.workspace-floating-panel__empty')).toHaveLength(3)
  })
})
