import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspacePropertyPanel from './WorkspacePropertyPanel.vue'

const coverColorOptions = [
  { id: 'blue', label: '파란색' },
  { id: 'green', label: '초록색' },
]

const statusOptions = [
  { id: 'draft', label: '초안' },
  { id: 'done', label: '완료' },
]

const priorityOptions = [
  { id: 'low', label: '낮음' },
  { id: 'high', label: '높음' },
]

const ownerCandidates = [
  { email: 'user@example.com', name: '사용자' },
]

const mountPanel = (props = {}) => mount(WorkspacePropertyPanel, {
  props: {
    icon: '📄',
    coverColor: 'blue',
    status: 'draft',
    priority: 'low',
    ownerEmail: '',
    dueDate: '2026-07-10',
    tagsInput: '기획, 릴리즈',
    statusOption: { label: '초안', tone: 'warn' },
    priorityOption: { label: '낮음', tone: 'good' },
    coverColorOption: { id: 'blue' },
    coverColorOptions,
    statusOptions,
    priorityOptions,
    ownerCandidates,
    tags: ['기획', '릴리즈'],
    canModifyPage: true,
    ...props,
  },
})

describe('WorkspacePropertyPanel', () => {
  it('renders property badges, fields, cover swatches, and tags', () => {
    const wrapper = mountPanel()

    expect(wrapper.text()).toContain('페이지 속성')
    expect(wrapper.text()).toContain('초안')
    expect(wrapper.text()).toContain('낮음')
    expect(wrapper.find('.workspace-cover-swatch--active').attributes('aria-label')).toBe('파란색')
    expect(wrapper.text()).toContain('#기획')
    expect(wrapper.text()).toContain('#릴리즈')
  })

  it('emits model updates from editable controls', async () => {
    const wrapper = mountPanel()
    const fields = wrapper.findAll('.workspace-property-field')

    const selects = wrapper.findAll('select')

    await fields[0].find('input').setValue('F')
    await fields[0].find('input').trigger('blur')
    await wrapper.find('.workspace-cover-swatch--green').trigger('click')
    await selects[1].setValue('high')
    await selects[2].setValue('user@example.com')
    await wrapper.find('input[type="date"]').setValue('2026-07-11')
    await fields[6].find('input').setValue('검증')

    expect(wrapper.emitted('update:icon')).toEqual([['F']])
    expect(wrapper.emitted('normalize-icon')).toHaveLength(1)
    expect(wrapper.emitted('update:coverColor')).toEqual([['green']])
    expect(wrapper.emitted('update:priority')).toEqual([['high']])
    expect(wrapper.emitted('update:ownerEmail')).toEqual([['user@example.com']])
    expect(wrapper.emitted('update:dueDate')).toEqual([['2026-07-11']])
    expect(wrapper.emitted('update:tagsInput')).toEqual([['검증']])
  })

  it('emits status updates separately', async () => {
    const wrapper = mountPanel()

    await wrapper.findAll('select')[0].setValue('done')

    expect(wrapper.emitted('update:status')).toEqual([['done']])
  })

  it('disables controls when the page cannot be modified', () => {
    const wrapper = mountPanel({ canModifyPage: false })

    for (const input of wrapper.findAll('input')) {
      expect(input.attributes('disabled')).toBeDefined()
    }
    for (const select of wrapper.findAll('select')) {
      expect(select.attributes('disabled')).toBeDefined()
    }
    for (const button of wrapper.findAll('.workspace-cover-swatch')) {
      expect(button.attributes('disabled')).toBeDefined()
    }
  })
})