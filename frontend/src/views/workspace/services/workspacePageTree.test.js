import { describe, expect, it } from 'vitest'

import {
  buildWorkspacePageTreeRoots,
  canApplyWorkspaceTreeMoveTarget,
  collectWorkspacePageTreeDescendantIds,
  createWorkspaceTreeMoveTargetOptions,
  filterWorkspacePageTreeNodes,
  flattenWorkspacePageTreeRows,
  normalizeWorkspaceLinkText,
  workspacePageTreeEmptyLabel,
} from './workspacePageTree.js'

describe('workspacePageTree', () => {
  it('builds sorted roots, children, depths, and current flags', () => {
    const roots = buildWorkspacePageTreeRoots([
      { id: 'b', title: 'Beta' },
      { id: 'a-2', parentWorkspaceId: 'a', title: '두 번째' },
      { id: 'a', title: 'Alpha' },
      { id: 'a-1', parentWorkspaceId: 'a', title: '첫 번째' },
    ], 'a-2')

    expect(roots.map((row) => row.id)).toEqual(['a', 'b'])
    expect(roots[0].children.map((row) => row.id)).toEqual(['a-2', 'a-1'])
    expect(roots[0].treeDepth).toBe(0)
    expect(roots[0].children[0].treeDepth).toBe(1)
    expect(roots[0].children[0].isCurrentDocument).toBe(true)
  })

  it('keeps orphan, self-parent, and cyclic rows visible as roots', () => {
    const roots = buildWorkspacePageTreeRoots([
      { id: 'self', parentWorkspaceId: 'self', title: 'Self' },
      { id: 'orphan', parentWorkspaceId: 'missing', title: 'Orphan' },
      { id: 'cycle-a', parentWorkspaceId: 'cycle-b', title: 'Cycle A' },
      { id: 'cycle-b', parentWorkspaceId: 'cycle-a', title: 'Cycle B' },
    ])

    const flat = flattenWorkspacePageTreeRows(roots)
    expect(flat.map((row) => row.id)).toContain('self')
    expect(flat.map((row) => row.id)).toContain('orphan')
    expect(flat.map((row) => row.id)).toContain('cycle-a')
    expect(flat.map((row) => row.id)).toContain('cycle-b')
  })

  it('flattens with collapsed ids and filters by tree search text', () => {
    const roots = buildWorkspacePageTreeRoots([
      { id: 'root', title: 'Root', tags: ['plan'] },
      { id: 'child', parentWorkspaceId: 'root', title: 'Child', ownerEmail: 'owner@example.com' },
      { id: 'other', title: 'Other' },
    ])

    expect(flattenWorkspacePageTreeRows(roots).map((row) => row.id)).toEqual(['other', 'root', 'child'])
    expect(flattenWorkspacePageTreeRows(roots, new Set(['root'])).map((row) => row.id)).toEqual(['other', 'root'])
    expect(filterWorkspacePageTreeNodes(roots, 'owner@example.com').map((row) => row.id)).toEqual(['root', 'child'])
    expect(filterWorkspacePageTreeNodes(roots, 'plan').map((row) => row.id)).toEqual(['root'])
  })

  it('creates move target options without the moving node or descendants', () => {
    const roots = buildWorkspacePageTreeRoots([
      { id: 'root', title: 'Root' },
      { id: 'child', parentWorkspaceId: 'root', title: 'Child' },
      { id: 'grandchild', parentWorkspaceId: 'child', title: 'Grandchild' },
      { id: 'other', title: 'Other', treeDepth: 0 },
    ])
    const rows = flattenWorkspacePageTreeRows(roots)
    const root = rows.find((row) => row.id === 'root')

    expect([...collectWorkspacePageTreeDescendantIds(root)]).toEqual(['child', 'grandchild'])
    expect(createWorkspaceTreeMoveTargetOptions(root, rows)).toEqual([
      { id: '', title: 'Workspace root', treeDepth: 0 },
      { id: 'other', title: 'Other', treeDepth: 0 },
    ])
  })

  it('validates whether a page tree move can be applied', () => {
    const node = {
      id: 'child',
      parentWorkspaceId: 'root',
      canEditProperties: true,
      children: [{ id: 'grandchild', children: [] }],
    }

    expect(canApplyWorkspaceTreeMoveTarget(node, { movingId: 'child', targetId: 'other' })).toBe(true)
    expect(canApplyWorkspaceTreeMoveTarget(node, { movingId: 'other', targetId: 'root' })).toBe(false)
    expect(canApplyWorkspaceTreeMoveTarget(node, { movingId: 'child', targetId: 'root' })).toBe(false)
    expect(canApplyWorkspaceTreeMoveTarget(node, { movingId: 'child', targetId: 'child' })).toBe(false)
    expect(canApplyWorkspaceTreeMoveTarget(node, { movingId: 'child', targetId: 'grandchild' })).toBe(false)
    expect(canApplyWorkspaceTreeMoveTarget(node, { movingId: 'child', targetId: 'other', savingId: 'child' })).toBe(false)
    expect(canApplyWorkspaceTreeMoveTarget({ ...node, canEditProperties: false }, { movingId: 'child', targetId: 'other' })).toBe(false)
  })

  it('normalizes search text and empty labels', () => {
    expect(normalizeWorkspaceLinkText('  Alpha\n Beta  ')).toBe('alpha beta')
    expect(workspacePageTreeEmptyLabel({ rowCount: 0 })).toBe('페이지가 없습니다.')
    expect(workspacePageTreeEmptyLabel({ rowCount: 3, query: 'abc' })).toBe('검색 조건에 맞는 페이지가 없습니다.')
    expect(workspacePageTreeEmptyLabel({ rowCount: 3 })).toBe('표시할 페이지가 없습니다.')
  })
})