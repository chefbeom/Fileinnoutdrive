import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceBlockInsertPanel from './WorkspaceBlockInsertPanel.vue'

const quickBlockOptions = [
  {
    id: 'heading',
    icon: 'fa-solid fa-heading',
    label: 'Heading',
    description: 'Add heading',
  },
  {
    id: 'checklist',
    icon: 'fa-solid fa-list-check',
    label: 'Checklist',
    description: 'Add checklist',
  },
]

const mountPanel = (props = {}) => mount(WorkspaceBlockInsertPanel, {
  props: {
    quickBlockOptions,
    quickBlockText: 'Draft text',
    quickBlockAdding: '',
    canInsertQuickBlock: true,
    canModifyPage: true,
    isPageLocked: false,
    ...props,
  },
})

describe('WorkspaceBlockInsertPanel', () => {
  it('renders quick block options and count', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.workspace-floating-panel__count').text()).toBe('2')
    expect(wrapper.findAll('.workspace-block-insert-card')).toHaveLength(2)
    expect(wrapper.text()).toContain('Heading')
    expect(wrapper.text()).toContain('Checklist')
  })

  it('emits input and block insert events', async () => {
    const wrapper = mountPanel()

    await wrapper.find('input').setValue('Updated text')
    await wrapper.find('.workspace-block-insert-card').trigger('click')

    expect(wrapper.emitted('update:quick-block-text')).toEqual([['Updated text']])
    expect(wrapper.emitted('insert-block')).toEqual([[quickBlockOptions[0]]])
  })

  it('disables controls while adding or when insertion is unavailable', () => {
    const adding = mountPanel({ quickBlockAdding: 'heading' })
    const unavailable = mountPanel({ canInsertQuickBlock: false })

    expect(adding.find('input').attributes('disabled')).toBeDefined()
    expect(adding.find('.workspace-block-insert-card').attributes('disabled')).toBeDefined()
    expect(adding.find('.workspace-block-insert-card i').classes()).toContain('fa-spinner')
    expect(unavailable.find('input').attributes('disabled')).toBeDefined()
    expect(unavailable.find('.workspace-block-insert-card').attributes('disabled')).toBeDefined()
  })

  it('shows the correct permission message', () => {
    const locked = mountPanel({ canModifyPage: false, isPageLocked: true })
    const readOnly = mountPanel({ canModifyPage: false, isPageLocked: false })

    expect(locked.text()).toContain('페이지 잠금')
    expect(readOnly.text()).toContain('보기 권한')
  })
})