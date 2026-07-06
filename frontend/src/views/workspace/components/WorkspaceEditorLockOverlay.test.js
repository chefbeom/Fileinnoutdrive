import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceEditorLockOverlay from './WorkspaceEditorLockOverlay.vue'

describe('WorkspaceEditorLockOverlay', () => {
  it('renders lock state copy', () => {
    const wrapper = mount(WorkspaceEditorLockOverlay, {
      props: { canEditWorkspace: true },
    })

    expect(wrapper.text()).toContain('페이지가 잠겨 있습니다.')
    expect(wrapper.text()).toContain('잠금 해제')
  })

  it('emits unlock when the user can edit', async () => {
    const wrapper = mount(WorkspaceEditorLockOverlay, {
      props: { canEditWorkspace: true, isSaving: false, isEditorLoading: false },
    })

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('unlock')).toHaveLength(1)
  })

  it('disables unlock while saving, loading, or readonly', () => {
    expect(mount(WorkspaceEditorLockOverlay, { props: { canEditWorkspace: false } }).find('button').attributes('disabled')).toBeDefined()
    expect(mount(WorkspaceEditorLockOverlay, { props: { canEditWorkspace: true, isSaving: true } }).find('button').attributes('disabled')).toBeDefined()
    expect(mount(WorkspaceEditorLockOverlay, { props: { canEditWorkspace: true, isEditorLoading: true } }).find('button').attributes('disabled')).toBeDefined()
  })
})