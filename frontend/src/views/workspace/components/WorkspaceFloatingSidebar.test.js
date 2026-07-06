import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceFloatingSidebar from './WorkspaceFloatingSidebar.vue'

const tabs = [
  { id: 'home', label: '홈', count: null },
  { id: 'summary', label: '요약', count: 3 },
  { id: 'assets', label: '자료', count: 2 },
]

describe('WorkspaceFloatingSidebar', () => {
  it('does not render when collapsed', () => {
    const wrapper = mount(WorkspaceFloatingSidebar, {
      props: { collapsed: true, tabs, activeTab: 'home' },
    })

    expect(wrapper.find('.workspace-floating-sidebar').exists()).toBe(false)
  })

  it('renders tabs, counts, and slot content', () => {
    const wrapper = mount(WorkspaceFloatingSidebar, {
      props: { tabs, activeTab: 'summary' },
      slots: { default: '<section class="panel-content">패널</section>' },
    })

    expect(wrapper.findAll('.workspace-panel-tab')).toHaveLength(3)
    expect(wrapper.text()).toContain('요약')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.find('.panel-content').exists()).toBe(true)
  })

  it('marks the active tab', () => {
    const wrapper = mount(WorkspaceFloatingSidebar, {
      props: { tabs, activeTab: 'assets' },
    })

    expect(wrapper.findAll('.workspace-panel-tab')[2].classes()).toContain('workspace-panel-tab--active')
  })

  it('emits active tab updates', async () => {
    const wrapper = mount(WorkspaceFloatingSidebar, {
      props: { tabs, activeTab: 'home' },
    })

    await wrapper.findAll('.workspace-panel-tab')[1].trigger('click')

    expect(wrapper.emitted('update:activeTab')).toEqual([['summary']])
  })
})