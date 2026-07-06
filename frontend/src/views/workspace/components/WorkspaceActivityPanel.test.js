import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceActivityPanel from './WorkspaceActivityPanel.vue'

const activityItems = [
  {
    id: 'activity-1',
    type: 'save',
    icon: 'fa-solid fa-floppy-disk',
    title: 'Saved',
    detail: 'Document saved',
    timeLabel: 'now',
  },
  {
    id: 'activity-2',
    type: 'comment',
    icon: 'fa-regular fa-comment',
    title: 'Commented',
    detail: 'New comment',
    timeLabel: 'today',
  },
]

const mountPanel = (props = {}) => mount(WorkspaceActivityPanel, {
  props: {
    activityItems,
    ...props,
  },
})

describe('WorkspaceActivityPanel', () => {
  it('renders activity rows and count', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.workspace-floating-panel__count').text()).toBe('2')
    expect(wrapper.findAll('.workspace-activity-item')).toHaveLength(2)
    expect(wrapper.find('.workspace-activity-item--save').exists()).toBe(true)
    expect(wrapper.text()).toContain('Document saved')
  })

  it('shows an empty state when there is no activity', () => {
    const wrapper = mountPanel({ activityItems: [] })

    expect(wrapper.findAll('.workspace-activity-item')).toHaveLength(0)
    expect(wrapper.find('.workspace-floating-panel__empty').exists()).toBe(true)
  })
})