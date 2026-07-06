import { describe, expect, it } from 'vitest'

import {
  clampWorkspaceCommandActiveIndex,
  createWorkspaceCommandBaseItems,
  createWorkspacePanelTabs,
  filterWorkspaceCommandItems,
  moveWorkspaceCommandActiveIndex,
  workspaceCommandActiveItem,
  workspaceCommandEmptyLabel,
} from './workspaceCommands.js'

describe('workspaceCommands', () => {
  it('creates panel tabs with counts in the expected order', () => {
    expect(createWorkspacePanelTabs({
      homeAttentionCount: 1,
      activeUserCount: 2,
      activityCount: 3,
      fullTextResultCount: 4,
      quickBlockCount: 5,
      openTaskCount: 6,
      outlineCount: 7,
      relationCount: 8,
      revisionCount: 9,
      unresolvedCommentCount: 10,
      assetCount: 11,
    }).map((tab) => [tab.id, tab.count])).toEqual([
      ['all', null],
      ['home', 1],
      ['summary', null],
      ['collaboration', 2],
      ['activity', 3],
      ['search', 4],
      ['blocks', 5],
      ['tasks', 6],
      ['outline', 7],
      ['links', 8],
      ['history', 9],
      ['review', 10],
      ['assets', 11],
    ])
  })

  it('creates command items from actions, documents, templates, blocks, and panels', () => {
    const items = createWorkspaceCommandBaseItems({
      canEditWorkspace: true,
      hasUnsavedChanges: true,
      isWorkspacePageLocked: false,
      canFavoriteCurrentWorkspaceDocument: true,
      isCurrentWorkspaceDocumentFavorite: true,
      canManageWorkspaceShare: true,
      isValid: true,
      canExportWorkspaceMarkdown: true,
      canStartWorkspaceSubpage: true,
      currentWorkspaceParentPage: { id: 'parent', title: 'Parent' },
      currentUserEmail: 'me@example.com',
      mentionedWorkspaceCommentCount: 2,
      documents: [
        { id: 'a', title: 'Alpha', scope: 'personal', role: 'ADMIN', status: 'Private', updatedAt: '2026-07-03' },
        { id: 'b', title: 'Beta', scope: 'shared', role: 'READ', status: 'Shared', updatedAt: '2026-07-02' },
      ],
      favoriteDocumentIds: ['b'],
      canShowWorkspaceTemplates: true,
      templates: [{ id: 'meeting', icon: 'icon', title: '회의록', description: '회의 정리' }],
      canInsertWorkspaceQuickBlock: true,
      quickBlocks: [{ id: 'todo', icon: 'todo-icon', label: '할 일', description: '체크리스트' }],
      panelTabs: [{ id: 'all', label: '전체', count: null }, { id: 'tasks', label: '작업', count: 3 }],
      roleLabelFor: (role) => `role:${role}`,
      formatDocumentTimeFor: () => 'time',
    })

    expect(items.map((item) => item.id)).toEqual([
      'action:new',
      'action:save',
      'action:lock',
      'action:favorite-current',
      'action:share',
      'action:export-markdown',
      'action:subpage',
      'action:parent',
      'action:mentions',
      'document:b',
      'document:a',
      'template:meeting',
      'block:todo',
      'panel:tasks',
    ])
    expect(items.find((item) => item.id === 'document:b')).toMatchObject({ kindLabel: '즐겨찾기', favorite: true })
    expect(items.find((item) => item.id === 'panel:tasks')?.detail).toBe('3개 항목을 확인합니다.')
  })

  it('filters command items, selects active item, and returns empty labels', () => {
    const items = [
      { id: 'one', title: 'Alpha', detail: 'First', keywords: 'page' },
      { id: 'two', title: 'Beta', detail: 'Second', keywords: 'share' },
      { id: 'three', title: 'Gamma', detail: 'Third', keywords: 'page' },
    ]

    expect(filterWorkspaceCommandItems(items, '', 2).map((item) => item.id)).toEqual(['one', 'two'])
    expect(filterWorkspaceCommandItems(items, 'share').map((item) => item.id)).toEqual(['two'])
    expect(workspaceCommandActiveItem(items, 1)?.id).toBe('two')
    expect(workspaceCommandActiveItem(items, 9)).toBeNull()
    expect(workspaceCommandEmptyLabel('')).toBe('문서, 템플릿, 패널, 액션을 바로 실행할 수 있습니다.')
    expect(workspaceCommandEmptyLabel('missing')).toBe('검색 결과가 없습니다.')
  })
  it('moves and clamps command active indexes', () => {
    expect(moveWorkspaceCommandActiveIndex(0, 1, 3)).toBe(1)
    expect(moveWorkspaceCommandActiveIndex(2, 1, 3)).toBe(0)
    expect(moveWorkspaceCommandActiveIndex(0, -1, 3)).toBe(2)
    expect(moveWorkspaceCommandActiveIndex(1, 5, 3)).toBe(0)
    expect(moveWorkspaceCommandActiveIndex(1, 1, 0)).toBe(0)

    expect(clampWorkspaceCommandActiveIndex(4, 3)).toBe(2)
    expect(clampWorkspaceCommandActiveIndex(-4, 3)).toBe(0)
    expect(clampWorkspaceCommandActiveIndex(1, 3)).toBe(1)
    expect(clampWorkspaceCommandActiveIndex(1, 0)).toBe(0)
  })
})