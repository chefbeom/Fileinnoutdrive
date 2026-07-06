import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspacePageHeader from './WorkspacePageHeader.vue'

const baseProps = {
  coverColorId: 'green',
  icon: '📌',
  title: '프로젝트 문서',
  breadcrumbs: [{ id: 1, title: '상위 문서' }],
  canModifyPage: true,
  saveStatusClass: 'status-pill--saved',
  saveStatusLabel: '저장됨',
  realtimeStatusClass: 'status-pill--live',
  realtimeStatusLabel: '실시간',
  shareStatusClass: 'status-pill--shared',
  shareStatusLabel: '공유됨',
  accessRoleLabel: '관리자',
  isPageLocked: false,
  lockStatusLabel: '편집 가능',
  workspaceId: 42,
  linkCopied: true,
}

const mountHeader = (props = {}, slots = {}) => mount(WorkspacePageHeader, {
  props: { ...baseProps, ...props },
  slots,
})

describe('WorkspacePageHeader', () => {
  it('renders cover, title metadata, breadcrumbs, and toolbar slot', () => {
    const wrapper = mountHeader({}, { default: '<button class="toolbar-slot">저장</button>' })

    expect(wrapper.find('.workspace-page-cover--green').exists()).toBe(true)
    expect(wrapper.text()).toContain('상위 문서')
    expect(wrapper.find('.title-input').element.value).toBe('프로젝트 문서')
    expect(wrapper.text()).toContain('저장됨')
    expect(wrapper.text()).toContain('실시간')
    expect(wrapper.text()).toContain('공유됨')
    expect(wrapper.text()).toContain('관리자')
    expect(wrapper.text()).toContain('#42')
    expect(wrapper.text()).toContain('링크 복사됨')
    expect(wrapper.find('.toolbar-slot').exists()).toBe(true)
  })

  it('emits input and breadcrumb events', async () => {
    const wrapper = mountHeader()

    await wrapper.find('.workspace-page-icon-input').setValue('📝')
    await wrapper.find('.workspace-page-icon-input').trigger('blur')
    await wrapper.find('.title-input').setValue('새 제목')
    await wrapper.find('.workspace-page-breadcrumb button').trigger('click')

    expect(wrapper.emitted('update:icon')).toEqual([['📝']])
    expect(wrapper.emitted('normalize-icon')).toHaveLength(1)
    expect(wrapper.emitted('title-input')).toHaveLength(1)
    expect(wrapper.emitted('open-breadcrumb')).toEqual([[baseProps.breadcrumbs[0]]])
  })

  it('locks inputs and shows locked status', () => {
    const wrapper = mountHeader({ canModifyPage: false, isPageLocked: true, lockStatusLabel: '잠김', linkCopied: false })

    expect(wrapper.find('.workspace-page-icon-input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.title-input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.status-pill--locked').text()).toBe('잠김')
    expect(wrapper.text()).not.toContain('링크 복사됨')
  })
})