import { describe, expect, it } from 'vitest'

import {
  mergeWorkspaceAssetList,
  normalizeWorkspaceAsset,
  removeWorkspaceAssetIds,
  workspaceAssetBadge,
  workspaceAssetRealtimeLabel,
} from './workspaceAssets.js'

describe('workspaceAssets', () => {
  it('normalizes backend asset aliases into the workspace asset model', () => {
    const asset = normalizeWorkspaceAsset({
      idx: 7,
      workspaceIdx: 42,
      assetType: 'image',
      fileOriginName: 'diagram.png',
      fileSaveName: 'stored-diagram.png',
      fileSavePath: 'workspace/42/diagram.png',
      fileSize: 1536,
      presignedDownloadUrl: 'https://download.example/diagram.png',
      createdAt: '2026-07-03T01:02:03.000Z',
    })

    expect(asset).toMatchObject({
      id: 7,
      workspaceId: 42,
      assetType: 'IMAGE',
      originalName: 'diagram.png',
      storedFileName: 'stored-diagram.png',
      objectKey: 'workspace/42/diagram.png',
      fileSize: 1536,
      fileSizeLabel: '1.50 KB',
      downloadUrl: 'https://download.example/diagram.png',
    })
    expect(asset.createdAtLabel).toContain('2026')
  })

  it('merges assets by id, lets newer assets override old values, and sorts newest first', () => {
    const merged = mergeWorkspaceAssetList(
      [
        { id: 1, originalName: 'old.txt', createdAt: '2026-07-01T00:00:00.000Z' },
        { id: 2, originalName: 'middle.txt', createdAt: '2026-07-02T00:00:00.000Z' },
      ],
      [
        { id: 1, originalName: 'updated.txt', createdAt: '2026-07-03T00:00:00.000Z' },
      ],
    )

    expect(merged.map((asset) => asset.id)).toEqual([1, 2])
    expect(merged[0].originalName).toBe('updated.txt')
  })

  it('removes selected asset ids without mutating unmatched assets', () => {
    const assets = [{ id: 1 }, { id: 2 }, { id: 3 }]

    expect(removeWorkspaceAssetIds(assets, [2, '3'])).toEqual([{ id: 1 }])
    expect(removeWorkspaceAssetIds(assets, [])).toBe(assets)
  })

  it('creates realtime labels and badges for asset notifications', () => {
    expect(workspaceAssetRealtimeLabel([{ originalName: 'a.pdf' }])).toBe('a.pdf')
    expect(workspaceAssetRealtimeLabel([{ originalName: 'a.pdf' }, { originalName: 'b.pdf' }])).toBe('a.pdf 외 1개')
    expect(workspaceAssetRealtimeLabel([], [1, 2])).toBe('2개 파일')
    expect(workspaceAssetBadge({ assetType: 'IMAGE' })).toBe('이미지')
    expect(workspaceAssetBadge({ assetType: 'FILE' })).toBe('파일')
  })
})
