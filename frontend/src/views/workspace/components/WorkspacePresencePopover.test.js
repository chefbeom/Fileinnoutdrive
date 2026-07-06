import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspacePresencePopover from './WorkspacePresencePopover.vue'

const users = [
  {
    clientId: 'me',
    name: '관리자',
    email: 'admin@example.com',
    role: 'ADMIN',
    status: 'online',
    color: '#2563eb',
    isMe: true,
  },
  {
    clientId: 'member-1',
    name: '멤버',
    email: 'member@example.com',
    role: 'WRITE',
    status: 'away',
    color: '#16a34a',
    isMe: false,
  },
]

const mountPopover = (props = {}) => mount(WorkspacePresencePopover, {
  props: {
    open: true,
    activeUserPreview: users.slice(0, 1),
    extraActiveUserCount: 1,
    activeUsers: users,
    presenceSummaryLabel: '2명 참여 중',
    canManageShare: true,
    openRoleDropdownId: null,
    ...props,
  },
})

describe('WorkspacePresencePopover', () => {
  it('renders active user preview and toggles popover', async () => {
    const wrapper = mountPopover({ open: false })

    expect(wrapper.find('.presence-toggle-label').text()).toBe('2명 참여 중')
    expect(wrapper.find('.presence-avatar--overflow').text()).toBe('+1')

    await wrapper.find('.presence-toggle-btn').trigger('click')
    expect(wrapper.emitted('update:open')).toEqual([[true]])
  })

  it('renders users with role and current-user labels', () => {
    const wrapper = mountPopover()

    expect(wrapper.text()).toContain('현재 참여 중인 사용자')
    expect(wrapper.text()).toContain('관리자')
    expect(wrapper.text()).toContain('(나)')
    expect(wrapper.find('.role-badge--admin').exists()).toBe(true)
    expect(wrapper.find('.presence-status-dot--away').exists()).toBe(true)
  })

  it('opens role dropdown and emits selected role changes', async () => {
    const wrapper = mountPopover()

    await wrapper.find('.permission-dropdown-trigger').trigger('click')
    expect(wrapper.emitted('update:openRoleDropdownId')).toEqual([['member-1']])

    await wrapper.setProps({ openRoleDropdownId: 'member-1' })
    const roleButtons = wrapper.findAll('.permission-dropdown-menu .dropdown-item')
    await roleButtons[0].trigger('click')
    await roleButtons[3].trigger('click')

    expect(wrapper.emitted('change-role')).toEqual([
      [users[1], 'ADMIN'],
      [users[1], 'KICKED'],
    ])
  })

  it('shows an empty state when there are no active users', () => {
    const wrapper = mountPopover({
      activeUserPreview: [],
      activeUsers: [],
      extraActiveUserCount: 0,
      presenceSummaryLabel: '참여자 없음',
    })

    expect(wrapper.find('.presence-avatar--empty').text()).toBe('0')
    expect(wrapper.text()).toContain('아직 참여자가 표시되지 않았습니다.')
  })
})