import { describe, expect, it } from 'vitest'

import {
  createImageAssetMap,
  listRemovedImageAssetIds,
} from './editorImageAssets.js'

describe('editorImageAssets', () => {
  it('collects EditorJS image asset ids from image blocks only', () => {
    const map = createImageAssetMap([
      { type: 'paragraph', data: { file: { assetIdx: 1 } } },
      { type: 'image', data: { file: { assetIdx: 2 } } },
      { type: 'image', data: { file: { assetIdx: 3 } } },
      { type: 'image', data: { file: {} } },
      null,
    ])

    expect([...map.keys()]).toEqual([2, 3])
  })

  it('lists previously tracked image assets removed from the current snapshot', () => {
    const previous = new Map([[1, true], [2, true], [3, true]])
    const current = new Map([[2, true]])

    expect(listRemovedImageAssetIds(previous, current)).toEqual([1, 3])
    expect(listRemovedImageAssetIds(null, current)).toEqual([])
  })
})