import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceOutlinePanel from './WorkspaceOutlinePanel.vue'

const outline = [
  { id: 'heading-1', level: 1, anchorText: 'Intro' },
  { id: 'heading-2', level: 2, anchorText: 'Details' },
]

const mountPanel = (props = {}) => mount(WorkspaceOutlinePanel, {
  props: {
    outline,
    ...props,
  },
})

describe('WorkspaceOutlinePanel', () => {
  it('renders outline rows and count', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.workspace-floating-panel__count').text()).toBe('2')
    expect(wrapper.findAll('.workspace-outline-item')).toHaveLength(2)
    expect(wrapper.findAll('.workspace-outline-item')[1].classes()).toContain('workspace-outline-item--level-2')
    expect(wrapper.text()).toContain('Intro')
  })

  it('emits focus for an outline item', async () => {
    const wrapper = mountPanel()

    await wrapper.find('.workspace-outline-item').trigger('click')

    expect(wrapper.emitted('focus-outline-item')).toEqual([[outline[0]]])
  })

  it('shows an empty state when no headings are available', () => {
    const wrapper = mountPanel({ outline: [] })

    expect(wrapper.findAll('.workspace-outline-item')).toHaveLength(0)
    expect(wrapper.find('.workspace-floating-panel__empty').exists()).toBe(true)
  })
})