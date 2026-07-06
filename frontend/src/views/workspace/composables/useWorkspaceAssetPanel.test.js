import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceAssetPanel } from './useWorkspaceAssetPanel.js'

describe('useWorkspaceAssetPanel', () => {
  it('splits workspace assets into images and files', () => {
    const workspaceAssets = ref([
      { id: 1, assetType: 'IMAGE', originalName: 'diagram.png' },
      { id: 2, assetType: 'FILE', originalName: 'notes.txt' },
      { id: 3, assetType: 'IMAGE', originalName: 'cover.jpg' },
    ])

    const subject = useWorkspaceAssetPanel({ workspaceAssets, savingWorkspaceAssetIds: ref([]) })

    expect(subject.hasWorkspaceAssets.value).toBe(true)
    expect(subject.workspaceImages.value.map((asset) => asset.id)).toEqual([1, 3])
    expect(subject.workspaceFiles.value.map((asset) => asset.id)).toEqual([2])

    workspaceAssets.value = []
    expect(subject.hasWorkspaceAssets.value).toBe(false)
    expect(subject.workspaceImages.value).toEqual([])
    expect(subject.workspaceFiles.value).toEqual([])
  })

  it('detects saving assets by numeric or string id', () => {
    const savingWorkspaceAssetIds = ref([1, '2'])
    const subject = useWorkspaceAssetPanel({
      workspaceAssets: ref([]),
      savingWorkspaceAssetIds,
    })

    expect(subject.isSavingWorkspaceAsset(1)).toBe(true)
    expect(subject.isSavingWorkspaceAsset('1')).toBe(true)
    expect(subject.isSavingWorkspaceAsset(2)).toBe(true)
    expect(subject.isSavingWorkspaceAsset(3)).toBe(false)

    savingWorkspaceAssetIds.value = []
    expect(subject.isSavingWorkspaceAsset(1)).toBe(false)
  })
})
