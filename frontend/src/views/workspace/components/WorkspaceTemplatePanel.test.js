import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceTemplatePanel from './WorkspaceTemplatePanel.vue'

const templates = [
  {
    id: 'meeting',
    icon: 'fa-solid fa-users',
    title: '회의록',
    description: '회의 내용을 정리합니다.',
  },
  {
    id: 'plan',
    icon: 'fa-solid fa-list-check',
    title: '실행 계획',
    description: '작업 단계를 정리합니다.',
  },
]

describe('WorkspaceTemplatePanel', () => {
  it('renders template cards', () => {
    const wrapper = mount(WorkspaceTemplatePanel, {
      props: { templates },
    })

    expect(wrapper.text()).toContain('템플릿으로 시작')
    expect(wrapper.findAll('.workspace-template-card')).toHaveLength(2)
    expect(wrapper.text()).toContain('회의록')
    expect(wrapper.text()).toContain('실행 계획')
  })

  it('emits apply with the selected template', async () => {
    const wrapper = mount(WorkspaceTemplatePanel, {
      props: { templates },
    })

    await wrapper.findAll('.workspace-template-card')[1].trigger('click')

    expect(wrapper.emitted('apply')).toEqual([[templates[1]]])
  })

  it('disables the template currently being applied', () => {
    const wrapper = mount(WorkspaceTemplatePanel, {
      props: {
        templates,
        applyingId: 'meeting',
      },
    })

    const cards = wrapper.findAll('.workspace-template-card')
    expect(cards[0].attributes('disabled')).toBeDefined()
    expect(cards[1].attributes('disabled')).toBeUndefined()
  })
})
