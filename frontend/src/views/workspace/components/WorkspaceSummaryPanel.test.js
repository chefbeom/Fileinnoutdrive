import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceSummaryPanel from './WorkspaceSummaryPanel.vue'

const summaryCards = [
  {
    id: 'blocks',
    icon: 'fa-solid fa-layer-group',
    label: 'Blocks',
    value: '12',
    detail: '12 blocks',
  },
  {
    id: 'tasks',
    icon: 'fa-regular fa-square-check',
    label: 'Tasks',
    value: '3',
    detail: '3 open tasks',
  },
]

const healthItems = [
  {
    id: 'fresh',
    icon: 'fa-solid fa-circle-check',
    tone: 'good',
    label: 'Fresh',
    detail: 'Recently saved',
  },
  {
    id: 'review',
    icon: 'fa-regular fa-comments',
    tone: 'warn',
    label: 'Review',
    detail: 'One comment needs review',
  },
]

const mountPanel = (props = {}) => mount(WorkspaceSummaryPanel, {
  props: {
    blockCount: 12,
    summaryCards,
    healthItems,
    ...props,
  },
})

describe('WorkspaceSummaryPanel', () => {
  it('renders summary cards, health items, and block count', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.workspace-floating-panel__count').text()).toBe('12')
    expect(wrapper.findAll('.workspace-summary-card')).toHaveLength(2)
    expect(wrapper.findAll('.workspace-health-item')).toHaveLength(2)
    expect(wrapper.find('.workspace-health-item--good').exists()).toBe(true)
    expect(wrapper.text()).toContain('Recently saved')
  })

  it('emits target panel ids from summary actions', async () => {
    const wrapper = mountPanel()
    const buttons = wrapper.findAll('.workspace-summary-actions button')

    for (const button of buttons) {
      await button.trigger('click')
    }

    expect(wrapper.emitted('open-panel')).toEqual([
      ['blocks'],
      ['tasks'],
      ['review'],
      ['assets'],
    ])
  })
})
