import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import WorkspaceCommandPalette from './WorkspaceCommandPalette.vue'

const commandItems = [
  {
    id: 'document-1',
    icon: 'fa-regular fa-file-lines',
    title: '문서 열기',
    detail: '최근 문서',
    kindLabel: '문서',
  },
  {
    id: 'panel-tasks',
    icon: 'fa-regular fa-square-check',
    title: '작업 패널',
    detail: '작업 보기',
    kindLabel: '패널',
  },
]

const mountPalette = (props = {}) => mount(WorkspaceCommandPalette, {
  props: {
    query: '',
    activeIndex: 0,
    items: commandItems,
    emptyLabel: '검색 결과가 없습니다.',
    ...props,
  },
})

describe('WorkspaceCommandPalette', () => {
  it('renders command rows and active state', () => {
    const wrapper = mountPalette({ activeIndex: 1 })

    expect(wrapper.findAll('.workspace-command-item')).toHaveLength(2)
    expect(wrapper.findAll('.workspace-command-item')[1].classes()).toContain('workspace-command-item--active')
    expect(wrapper.text()).toContain('문서 열기')
    expect(wrapper.text()).toContain('작업 패널')
  })

  it('emits query, keyboard, and close events', async () => {
    const wrapper = mountPalette()
    const input = wrapper.find('input')

    await input.setValue('문서')
    await input.trigger('keydown.down')
    await input.trigger('keydown.up')
    await input.trigger('keydown.enter')
    await input.trigger('keydown.esc')
    await wrapper.find('.workspace-command-overlay').trigger('mousedown')

    expect(wrapper.emitted('update:query')?.at(-1)).toEqual(['문서'])
    expect(wrapper.emitted('move-selection')).toEqual([[1], [-1]])
    expect(wrapper.emitted('execute')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(2)
  })

  it('emits active index and selected command item', async () => {
    const wrapper = mountPalette()
    const secondItem = wrapper.findAll('.workspace-command-item')[1]

    await secondItem.trigger('mouseenter')
    await secondItem.trigger('click')

    expect(wrapper.emitted('update:activeIndex')).toEqual([[1]])
    expect(wrapper.emitted('execute')?.[0]).toEqual([commandItems[1]])
  })

  it('emits the input element for parent focus management', () => {
    const wrapper = mountPalette()

    expect(wrapper.emitted('register-input')?.[0]).toEqual([wrapper.find('input').element])
  })

  it('renders empty state when there are no commands', () => {
    const wrapper = mountPalette({ items: [], emptyLabel: '없음' })

    expect(wrapper.findAll('.workspace-command-item')).toHaveLength(0)
    expect(wrapper.find('.workspace-command-empty').text()).toBe('없음')
  })
})