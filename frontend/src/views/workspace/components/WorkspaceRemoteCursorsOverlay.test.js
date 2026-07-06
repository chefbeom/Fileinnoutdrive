import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceRemoteCursorsOverlay from './WorkspaceRemoteCursorsOverlay.vue'

const cursors = {
  userA: {
    name: '사용자 A',
    color: '#2563eb',
    style: { transform: 'translate(12px, 34px)' },
  },
  userB: {
    name: '사용자 B',
    color: '#16a34a',
    style: { transform: 'translate(44px, 58px)' },
  },
}

describe('WorkspaceRemoteCursorsOverlay', () => {
  it('renders remote cursor labels and colors', () => {
    const wrapper = mount(WorkspaceRemoteCursorsOverlay, {
      props: { cursors },
    })

    expect(wrapper.findAll('.remote-cursor')).toHaveLength(2)
    expect(wrapper.text()).toContain('사용자 A')
    expect(wrapper.text()).toContain('사용자 B')
    expect(wrapper.find('path').attributes('fill')).toBe('#2563eb')
    expect(wrapper.find('.cursor-label').attributes('style')).toContain('background: #2563eb')
  })

  it('renders an empty overlay without cursors', () => {
    const wrapper = mount(WorkspaceRemoteCursorsOverlay)

    expect(wrapper.find('.cursors-overlay').exists()).toBe(true)
    expect(wrapper.findAll('.remote-cursor')).toHaveLength(0)
  })
})