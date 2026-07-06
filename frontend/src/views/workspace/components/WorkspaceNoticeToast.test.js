import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceNoticeToast from './WorkspaceNoticeToast.vue'

const mountToast = (notice = {}) => mount(WorkspaceNoticeToast, {
  props: {
    notice: {
      type: 'success',
      message: '저장했습니다.',
      actionLabel: '열기',
      ...notice,
    },
  },
})

describe('WorkspaceNoticeToast', () => {
  it('renders notice message, tone icon, and action', async () => {
    const wrapper = mountToast()

    expect(wrapper.classes()).toContain('workspace-notice--success')
    expect(wrapper.find('.workspace-notice__icon i').classes()).toEqual([
      'fa-regular',
      'fa-circle-check',
    ])
    expect(wrapper.text()).toContain('저장했습니다.')

    await wrapper.find('.workspace-notice__action').trigger('click')
    expect(wrapper.emitted('run-action')).toHaveLength(1)
  })

  it('omits action button when notice has no action label and emits close', async () => {
    const wrapper = mountToast({ type: 'error', actionLabel: '' })

    expect(wrapper.find('.workspace-notice__action').exists()).toBe(false)
    expect(wrapper.find('.workspace-notice__icon i').classes()).toEqual([
      'fa-solid',
      'fa-triangle-exclamation',
    ])

    await wrapper.find('.workspace-notice__close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})