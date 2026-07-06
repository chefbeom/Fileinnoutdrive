import { describe, expect, it } from 'vitest'

import {
  buildWorkspaceSearchSnippet,
  collectWorkspaceSnapshotLinkIds,
  normalizeWorkspaceTaskPath,
  parseWorkspaceSnapshot,
  parseWorkspaceSnapshotWithMeta,
  resolveWorkspaceSnapshotTaskItem,
} from './workspaceSnapshot.js'

describe('workspaceSnapshot', () => {
  it('parses snapshots from object, JSON, double-encoded JSON, and invalid content', () => {
    const snapshot = { blocks: [{ id: 'a' }], meta: { pageLocked: true } }

    expect(parseWorkspaceSnapshot(snapshot)).toBe(snapshot)
    expect(parseWorkspaceSnapshot(JSON.stringify(snapshot))).toEqual(snapshot)
    expect(parseWorkspaceSnapshot(JSON.stringify(JSON.stringify(snapshot)))).toEqual(snapshot)
    expect(parseWorkspaceSnapshot('not-json')).toEqual({ blocks: [] })

    expect(parseWorkspaceSnapshotWithMeta(JSON.stringify(snapshot))).toEqual(snapshot)
    expect(parseWorkspaceSnapshotWithMeta({ blocks: [{ id: 'a' }] })).toEqual({
      blocks: [{ id: 'a' }],
      meta: {},
    })
    expect(parseWorkspaceSnapshotWithMeta('not-json')).toEqual({ blocks: [], meta: {} })
  })

  it('resolves checklist items by task path and anchor block', () => {
    const blocks = [{
      id: 'checklist-1',
      type: 'list',
      data: {
        style: 'checklist',
        items: [
          { content: '첫 번째' },
          {
            content: '두 번째',
            items: [{ content: '하위 작업', checked: true }],
          },
        ],
      },
    }]

    expect(normalizeWorkspaceTaskPath({ path: ['1', 0] })).toEqual([1, 0])
    expect(normalizeWorkspaceTaskPath({ pathLabel: '2.1' })).toEqual([1, 0])
    expect(resolveWorkspaceSnapshotTaskItem(blocks, {
      anchorBlockId: 'checklist-1',
      blockIndex: 0,
      pathLabel: '2.1',
    })).toEqual({ content: '하위 작업', checked: true })
    expect(resolveWorkspaceSnapshotTaskItem(blocks, {
      anchorBlockId: 'missing',
      pathLabel: '1',
    })).toBeNull()
  })

  it('collects workspace link ids and builds search snippets', () => {
    const ids = collectWorkspaceSnapshotLinkIds({
      html: '<a data-workspace-page-id="page-a" href="/workspace/read/page-b">B</a>',
      nested: ['go /workspace/read/%ED%95%9C%EA%B8%80?x=1'],
    })

    expect([...ids]).toEqual(['page-a', 'page-b', '한글'])
    expect(buildWorkspaceSearchSnippet('alpha beta gamma', 'beta')).toBe('alpha beta gamma')
    expect(buildWorkspaceSearchSnippet('alpha beta gamma', 'delta')).toBe('alpha beta gamma')
    expect(buildWorkspaceSearchSnippet('', 'delta')).toBe('')
  })
})
