import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceConfirmDialog from './WorkspaceConfirmDialog.vue'

const mountDialog = (confirm = {}) => mount(WorkspaceConfirmDialog, {
  props: {
    confirm: {
      title: '문서 삭제',
      message: '문서를 삭제할까요?',
      tone: 'danger',
      loading: false,
      cancelLabel: '취소',
      confirmLabel: '삭제',
      ...confirm,
    },
  },
})

describe('WorkspaceConfirmDialog', () => {
  it('renders confirmation content and emits confirm action', async () => {
    const wrapper = mountDialog()

    expect(wrapper.find('.workspace-confirm-card--danger').exists()).toBe(true)
    expect(wrapper.find('.workspace-confirm-card__icon i').classes()).toEqual([
      'fa-solid',
      'fa-triangle-exclamation',
    ])
    expect(wrapper.text()).toContain('문서 삭제')
    expect(wrapper.text()).toContain('문서를 삭제할까요?')

    await wrapper.find('.workspace-confirm-card__confirm').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('emits close from backdrop and cancel button', async () => {
    const wrapper = mountDialog({ tone: 'default' })

    expect(wrapper.find('.workspace-confirm-card__icon i').classes()).toEqual([
      'fa-regular',
      'fa-circle-question',
    ])

    await wrapper.find('.workspace-confirm-overlay').trigger('mousedown')
    await wrapper.find('.workspace-confirm-card__cancel').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)
  })

  it('shows loading state and disables actions', () => {
    const wrapper = mountDialog({ loading: true })

    expect(wrapper.text()).toContain('처리 중...')
    expect(wrapper.find('.workspace-confirm-card__cancel').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.workspace-confirm-card__confirm').attributes('disabled')).toBeDefined()
  })
})