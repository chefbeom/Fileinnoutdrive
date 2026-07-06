import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import WorkspaceAssetsPanel from './WorkspaceAssetsPanel.vue'

const assets = [
  {
    id: 'asset-1',
    assetType: 'IMAGE',
    originalName: 'photo.png',
    fileSizeLabel: '12 KB',
    createdAtLabel: 'today',
  },
  {
    id: 'asset-2',
    assetType: 'FILE',
    originalName: 'notes.pdf',
    fileSizeLabel: '8 KB',
  },
]

const mountPanel = (props = {}) => mount(WorkspaceAssetsPanel, {
  props: {
    assets,
    loading: false,
    hasAssets: true,
    activeAssetId: 'asset-1',
    canManageAssets: true,
    getAssetBadge: (asset) => asset.assetType === 'IMAGE' ? 'image' : 'file',
    isDeletingAsset: vi.fn((id) => id === 'asset-2'),
    isSavingAsset: vi.fn((id) => id === 'asset-1'),
    ...props,
  },
})

describe('WorkspaceAssetsPanel', () => {
  it('renders asset rows and active action state', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.workspace-floating-panel__count').text()).toBe('2')
    expect(wrapper.findAll('.workspace-floating-item')).toHaveLength(2)
    expect(wrapper.text()).toContain('photo.png')
    expect(wrapper.text()).toContain('image')
    expect(wrapper.find('.workspace-floating-item--active').exists()).toBe(true)
    expect(wrapper.find('.workspace-floating-item__action--drive').attributes('disabled')).toBeDefined()
  })

  it('emits item and action events', async () => {
    const wrapper = mountPanel({
      isSavingAsset: vi.fn(() => false),
    })

    await wrapper.find('.workspace-floating-item__main').trigger('click')
    await wrapper.find('.workspace-floating-item__remove').trigger('click')
    await wrapper.find('.workspace-floating-item__action--drive').trigger('click')
    await wrapper.find('.workspace-floating-item__action--download').trigger('click')

    expect(wrapper.emitted('toggle-asset')).toEqual([['asset-1']])
    expect(wrapper.emitted('delete-asset')).toEqual([[assets[0]]])
    expect(wrapper.emitted('save-asset-to-drive')).toEqual([[assets[0]]])
    expect(wrapper.emitted('download-asset')).toEqual([[assets[0]]])
  })

  it('shows loading and empty states', () => {
    const loading = mountPanel({ loading: true, hasAssets: false, assets: [] })
    const empty = mountPanel({ loading: false, hasAssets: false, assets: [] })

    expect(loading.find('.workspace-floating-panel__empty').exists()).toBe(true)
    expect(loading.findAll('.workspace-floating-item')).toHaveLength(0)
    expect(empty.find('.workspace-floating-panel__empty').exists()).toBe(true)
    expect(empty.findAll('.workspace-floating-item')).toHaveLength(0)
  })

  it('hides remove controls when asset management is unavailable', () => {
    const wrapper = mountPanel({ canManageAssets: false })

    expect(wrapper.find('.workspace-floating-item__remove').exists()).toBe(false)
  })
})