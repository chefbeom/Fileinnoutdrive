import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceCollaborationPanel from './WorkspaceCollaborationPanel.vue'

const permissionItems = [
  { id: 'edit', label: 'Edit', detail: 'Allowed', enabled: true },
  { id: 'share', label: 'Share', detail: 'Admin only', enabled: false },
]

const member = {
  userIdx: 9,
  name: 'Writer',
  role: 'READ',
  image: '',
  isMe: false,
  isOnline: true,
}

const mountPanel = (props = {}) => mount(WorkspaceCollaborationPanel, {
  props: {
    activeUsers: [{ clientId: 'u1' }, { clientId: 'u2' }],
    accessRole: 'ADMIN',
    shareStatusLabel: 'Shared',
    permissionItems,
    canManageShare: true,
    canManageAssets: true,
    canComment: true,
    isValid: true,
    isSaving: false,
    isEditorLoading: false,
    shareButtonTitle: 'Share settings',
    assetUploading: false,
    workspaceId: 42,
    memberSummaryLabel: '1 member',
    memberError: '',
    memberLoading: false,
    memberRows: [member],
    roleLabel: (role) => role === 'ADMIN' ? 'Admin' : role === 'READ' ? 'Viewer' : 'Writer',
    userInitial: (name) => name.charAt(0),
    isMemberBusy: () => false,
    ...props,
  },
})

describe('WorkspaceCollaborationPanel', () => {
  it('renders collaboration summary, permissions, and member rows', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.workspace-floating-panel__count').text()).toBe('2')
    expect(wrapper.text()).toContain('Admin')
    expect(wrapper.text()).toContain('Shared')
    expect(wrapper.findAll('.workspace-permission-chip')).toHaveLength(2)
    expect(wrapper.find('.workspace-permission-chip--disabled').exists()).toBe(true)
    expect(wrapper.findAll('.workspace-member-item')).toHaveLength(1)
    expect(wrapper.text()).toContain('Writer')
    expect(wrapper.text()).toContain('Viewer')
  })

  it('emits panel and member action events', async () => {
    const wrapper = mountPanel()
    const actionButtons = wrapper.findAll('.workspace-collaboration-action')

    await actionButtons[0].trigger('click')
    await actionButtons[1].trigger('click')
    await actionButtons[2].trigger('click')
    await wrapper.find('.workspace-member-refresh-btn').trigger('click')
    await wrapper.find('.workspace-member-actions select').setValue('WRITE')
    await wrapper.find('.workspace-member-actions button').trigger('click')

    expect(wrapper.emitted('open-share')).toHaveLength(1)
    expect(wrapper.emitted('trigger-file-select')).toHaveLength(1)
    expect(wrapper.emitted('focus-comment')).toHaveLength(1)
    expect(wrapper.emitted('refresh-members')).toHaveLength(1)
    expect(wrapper.emitted('change-member-role')[0][0]).toMatchObject(member)
    expect(wrapper.emitted('change-member-role')[0][1]).toBeTruthy()
    expect(wrapper.emitted('remove-member')[0][0]).toMatchObject(member)
  })

  it('shows member states and disables unavailable actions', () => {
    const unsaved = mountPanel({ workspaceId: null, memberRows: [] })
    const readonly = mountPanel({ canManageShare: false, memberRows: [] })
    const loading = mountPanel({ memberLoading: true, memberRows: [] })
    const disabled = mountPanel({ isValid: false, canManageAssets: false, canComment: false })

    expect(unsaved.find('.workspace-member-empty').exists()).toBe(true)
    expect(readonly.find('.workspace-member-empty').exists()).toBe(true)
    expect(loading.find('.workspace-member-empty').exists()).toBe(true)
    const actionButtons = disabled.findAll('.workspace-collaboration-action')
    expect(actionButtons[0].attributes('disabled')).toBeDefined()
    expect(actionButtons[1].attributes('disabled')).toBeDefined()
    expect(actionButtons[2].attributes('disabled')).toBeDefined()
  })
})
