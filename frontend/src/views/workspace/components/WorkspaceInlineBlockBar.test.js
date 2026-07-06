import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceInlineBlockBar from './WorkspaceInlineBlockBar.vue'

const options = [
  { id: 'paragraph', label: '문단', icon: 'fa-solid fa-align-left' },
  { id: 'header', label: '제목', icon: 'fa-solid fa-heading' },
]

const mountBar = (props = {}) => mount(WorkspaceInlineBlockBar, {
  props: {
    text: '메모',
    options,
    canInsert: true,
    addingId: '',
    ...props,
  },
})

describe('WorkspaceInlineBlockBar', () => {
  it('renders input text and block action buttons', () => {
    const wrapper = mountBar()

    expect(wrapper.find('input').element.value).toBe('메모')
    expect(wrapper.findAll('.workspace-inline-block-actions button')).toHaveLength(2)
    expect(wrapper.text()).toContain('문단')
    expect(wrapper.text()).toContain('제목')
  })

  it('emits text updates and primary block insertion on enter', async () => {
    const wrapper = mountBar()

    await wrapper.find('input').setValue('새 블록')
    await wrapper.find('input').trigger('keydown.enter')

    expect(wrapper.emitted('update:text')).toEqual([['새 블록']])
    expect(wrapper.emitted('insert-block')).toEqual([[options[0]]])
  })

  it('emits selected block insertion from an action button', async () => {
    const wrapper = mountBar()

    await wrapper.findAll('.workspace-inline-block-actions button')[1].trigger('click')

    expect(wrapper.emitted('insert-block')).toEqual([[options[1]]])
  })

  it('disables input and buttons when insertion is not available', () => {
    const wrapper = mountBar({ canInsert: false })

    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
    for (const button of wrapper.findAll('.workspace-inline-block-actions button')) {
      expect(button.attributes('disabled')).toBeDefined()
    }
  })

  it('shows spinner state and disables commands while a block is being added', () => {
    const wrapper = mountBar({ addingId: 'header' })

    expect(wrapper.find('.fa-spinner').exists()).toBe(true)
    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
  })
})