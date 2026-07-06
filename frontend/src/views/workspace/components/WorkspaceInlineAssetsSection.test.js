import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import WorkspaceInlineAssetsSection from './WorkspaceInlineAssetsSection.vue'

const images = [
  {
    id: 'image-1',
    previewUrl: '/preview/image.png',
    originalName: 'image.png',
    fileSizeLabel: '12 KB',
    createdAtLabel: '2026-07-05',
  },
]

const files = [
  {
    id: 'file-1',
    originalName: 'report.pdf',
    fileSizeLabel: '30 KB',
    createdAtLabel: '2026-07-05',
  },
]

const mountSection = (props = {}) => mount(WorkspaceInlineAssetsSection, {
  props: {
    assets: [...images, ...files],
    images,
    files,
    loading: false,
    uploading: false,
    error: '',
    workspaceId: 10,
    canManageAssets: true,
    isDeletingAsset: vi.fn((id) => id === 'file-1'),
    ...props,
  },
})

describe('WorkspaceInlineAssetsSection', () => {
  it('renders asset summary, image cards, and file cards', () => {
    const wrapper = mountSection()

    expect(wrapper.text()).toContain('첨부 파일 2개')
    expect(wrapper.text()).toContain('이미지 1개 · 파일 1개')
    expect(wrapper.find('.workspace-image-card__image').attributes('alt')).toBe('image.png')
    expect(wrapper.find('.workspace-file-card__meta strong').text()).toBe('report.pdf')
  })

  it('emits upload trigger events from action buttons', async () => {
    const wrapper = mountSection()
    const buttons = wrapper.findAll('.asset-action-btn')

    await buttons[0].trigger('click')
    await buttons[1].trigger('click')

    expect(wrapper.emitted('trigger-image-select')).toHaveLength(1)
    expect(wrapper.emitted('trigger-file-select')).toHaveLength(1)
  })

  it('emits delete and download events', async () => {
    const wrapper = mountSection()

    await wrapper.find('.workspace-image-card .asset-remove-btn').trigger('click')
    await wrapper.find('.workspace-file-card').trigger('click')

    expect(wrapper.emitted('delete-asset')).toEqual([[images[0]]])
    expect(wrapper.emitted('download-asset')).toEqual([[files[0]]])
  })

  it('shows loading, error, and empty states', () => {
    expect(mountSection({ loading: true }).text()).toContain('첨부 자산을 불러오는 중입니다')
    expect(mountSection({ error: '업로드 실패' }).text()).toContain('업로드 실패')
    expect(mountSection({ assets: [], images: [], files: [] }).text()).toContain('업로드된 이미지나 파일이 없습니다')
  })

  it('hides management actions when the user cannot manage assets', () => {
    const wrapper = mountSection({ canManageAssets: false })

    expect(wrapper.find('.workspace-assets__actions').exists()).toBe(false)
    expect(wrapper.find('.asset-remove-btn').exists()).toBe(false)
  })

  it('disables upload and delete actions while busy', () => {
    const wrapper = mountSection({ uploading: true })

    for (const button of wrapper.findAll('.asset-action-btn')) {
      expect(button.attributes('disabled')).toBeDefined()
    }
    expect(wrapper.find('.asset-remove-btn--file').attributes('disabled')).toBeDefined()
  })
})