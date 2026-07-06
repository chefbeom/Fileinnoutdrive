import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useWorkspacePageTreeState } from './useWorkspacePageTreeState.js'

const rows = [
  { id: 'root', title: 'Root page', parentWorkspaceId: '', statusLabel: '진행', childCount: 0 },
  { id: 'child-a', title: 'Alpha child', parentWorkspaceId: 'root', ownerName: '민수' },
  { id: 'child-b', title: 'Beta child', parentWorkspaceId: 'root', tags: ['검색태그'] },
  { id: 'orphan', title: 'Orphan page', parentWorkspaceId: 'missing' },
]

describe('useWorkspacePageTreeState', () => {
  it('builds visible tree rows and toggles collapsed nodes', () => {
    const subject = useWorkspacePageTreeState({
      workspacePageIndexRows: ref(rows),
      currentWorkspaceKey: ref('child-a'),
    })

    expect(subject.workspacePageTreeRoots.value.map((node) => node.id)).toEqual(['orphan', 'root'])
    const root = subject.workspacePageTreeRoots.value.find((node) => node.id === 'root')
    expect(root.childCount).toBe(2)
    expect(subject.workspacePageTreeVisibleRows.value.map((node) => node.id)).toEqual([
      'orphan',
      'root',
      'child-a',
      'child-b',
    ])

    subject.toggleWorkspacePageTreeNode(root)
    expect([...subject.workspacePageTreeCollapsedIdSet.value]).toEqual(['root'])
    expect(subject.workspacePageTreeVisibleRows.value.map((node) => node.id)).toEqual(['orphan', 'root'])

    subject.toggleWorkspacePageTreeNode(root)
    expect([...subject.workspacePageTreeCollapsedIdSet.value]).toEqual([])
  })

  it('filters rows by page tree query and creates empty labels', () => {
    const subject = useWorkspacePageTreeState({
      workspacePageIndexRows: ref(rows),
      currentWorkspaceKey: ref('root'),
    })

    subject.workspacePageTreeQuery.value = '검색태그'
    expect(subject.workspacePageTreeVisibleRows.value.map((node) => node.id)).toEqual(['root', 'child-b'])
    expect(subject.workspacePageTreeEmptyLabel.value).toBe('검색 조건에 맞는 페이지가 없습니다.')

    const empty = useWorkspacePageTreeState({
      workspacePageIndexRows: ref([]),
      currentWorkspaceKey: ref('new'),
    })
    expect(empty.workspacePageTreeEmptyLabel.value).toBe('페이지가 없습니다.')
  })
})
