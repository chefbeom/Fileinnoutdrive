import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceEditorToolbar from './WorkspaceEditorToolbar.vue'

const users = [
  {
    clientId: 'member-1',
    name: '멤버',
    role: 'WRITE',
    status: 'online',
    color: '#2563eb',
    isMe: false,
  },
]

const mountToolbar = (props = {}) => mount(WorkspaceEditorToolbar, {
  props: {
    presenceOpen: false,
    openRoleDropdownId: null,
    activeUserPreview: users,
    extraActiveUserCount: 0,
    activeUsers: users,
    presenceSummaryLabel: '1명 참여 중',
    canManageShare: true,
    canEditWorkspace: true,
    isValid: true,
    isSaving: false,
    isEditorLoading: false,
    canFavoriteDocument: true,
    isFavorite: false,
    favoriteTitle: '즐겨찾기 추가',
    isPageLocked: false,
    lockButtonTitle: '페이지 잠금',
    canCopyLink: true,
    isLinkCopied: false,
    canExportMarkdown: true,
    markdownExporting: false,
    panelCollapsed: false,
    shareButtonTitle: '공유 설정',
    ...props,
  },
})

describe('WorkspaceEditorToolbar', () => {
  it('renders toolbar buttons and state labels', () => {
    const wrapper = mountToolbar({ isFavorite: true, isPageLocked: true, isLinkCopied: true, markdownExporting: true })

    expect(wrapper.find('.presence-toggle-label').text()).toBe('1명 참여 중')
    expect(wrapper.find('.workspace-favorite-page-btn--active').exists()).toBe(true)
    expect(wrapper.find('.workspace-lock-btn--locked').exists()).toBe(true)
    expect(wrapper.find('.workspace-copy-page-btn--copied').exists()).toBe(true)
    expect(wrapper.text()).toContain('내보내는 중')
  })

  it('emits action events from toolbar buttons', async () => {
    const wrapper = mountToolbar()

    await wrapper.find('.save-btn').trigger('click')
    await wrapper.find('.workspace-favorite-page-btn').trigger('click')
    await wrapper.find('.workspace-lock-btn').trigger('click')
    await wrapper.find('.workspace-copy-page-btn').trigger('click')
    await wrapper.find('.workspace-export-page-btn').trigger('click')
    await wrapper.find('.workspace-share-btn').trigger('click')

    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(wrapper.emitted('toggle-favorite')).toHaveLength(1)
    expect(wrapper.emitted('toggle-lock')).toHaveLength(1)
    expect(wrapper.emitted('copy-link')).toHaveLength(1)
    expect(wrapper.emitted('export-markdown')).toHaveLength(1)
    expect(wrapper.emitted('open-share')).toHaveLength(1)
  })

  it('emits panel and presence model updates', async () => {
    const wrapper = mountToolbar({ panelCollapsed: false })

    await wrapper.find('.workspace-panel-toggle-btn').trigger('click')
    await wrapper.find('.presence-toggle-btn').trigger('click')

    expect(wrapper.emitted('update:panelCollapsed')).toEqual([[true]])
    expect(wrapper.emitted('update:presenceOpen')).toEqual([[true]])
  })

  it('forwards role changes from presence popover', async () => {
    const wrapper = mountToolbar({ presenceOpen: true })

    await wrapper.find('.permission-dropdown-trigger').trigger('click')
    expect(wrapper.emitted('update:openRoleDropdownId')).toEqual([['member-1']])

    await wrapper.setProps({ openRoleDropdownId: 'member-1' })
    await wrapper.find('.permission-dropdown-menu .dropdown-item').trigger('click')

    expect(wrapper.emitted('change-role')).toEqual([[users[0], 'ADMIN']])
  })

  it('disables commands when the document cannot be edited or shared', () => {
    const wrapper = mountToolbar({
      canEditWorkspace: false,
      canFavoriteDocument: false,
      canCopyLink: false,
      canExportMarkdown: false,
      canManageShare: false,
    })

    expect(wrapper.find('.save-btn').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.workspace-favorite-page-btn').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.workspace-lock-btn').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.workspace-copy-page-btn').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.workspace-export-page-btn').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.workspace-share-btn').attributes('disabled')).toBeDefined()
  })
})