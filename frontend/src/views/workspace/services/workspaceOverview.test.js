import { describe, expect, it } from 'vitest'

import {
  createWorkspaceHealthItems,
  createWorkspaceHomeMetricCards,
  createWorkspacePermissionItems,
  createWorkspaceSummaryCards,
  workspaceMemberSummaryLabel,
} from './workspaceOverview.js'

describe('workspaceOverview', () => {
  it('creates summary cards from document, task, review, link, and asset metrics', () => {
    const cards = createWorkspaceSummaryCards({
      statusLabel: '진행 중',
      priorityLabel: '높음',
      ownerName: 'Owner',
      documentStats: { blockCount: 4, wordCount: 20, characterCount: 120 },
      documentTaskCount: 5,
      documentTaskProgress: 60,
      completedDocumentTaskCount: 3,
      unresolvedCommentCount: 2,
      resolvedCommentCount: 7,
      linkedDocumentCount: 1,
      assetCount: 6,
      imageCount: 2,
      fileCount: 4,
    })

    expect(cards.map((card) => card.id)).toEqual(['properties', 'content', 'tasks', 'review', 'links', 'assets'])
    expect(cards[0]).toMatchObject({ value: '진행 중', detail: '높음 우선순위 · Owner' })
    expect(cards[2]).toMatchObject({ value: '60%', detail: '3/5 완료' })
    expect(cards[5]).toMatchObject({ value: '6개', detail: '이미지 2 · 파일 4' })
  })

  it('creates health and permission items with expected tones and labels', () => {
    const health = createWorkspaceHealthItems({
      shareStatusLabel: '공유됨',
      accessRoleLabel: '편집자',
      ownerName: 'Owner',
      shareStatus: 'Shared',
      isPropertyDueOverdue: false,
      overdueTaskCount: 2,
      unresolvedCommentCount: 0,
      lastSavedAt: '2026-07-03T00:00:00.000Z',
      saveState: 'idle',
      hasUnsavedChanges: false,
      formatDateTimeFor: () => 'formatted-date',
    })
    const permissions = createWorkspacePermissionItems({
      canModifyWorkspacePage: false,
      isWorkspacePageLocked: true,
      workspaceLockStatusLabel: '잠김',
      canCommentOnWorkspace: true,
      canManageAssets: false,
      canManageWorkspaceShare: true,
    })

    expect(health.map((item) => [item.id, item.tone])).toEqual([
      ['collaboration', 'good'],
      ['tasks', 'danger'],
      ['review', 'good'],
      ['saving', 'good'],
    ])
    expect(health[3].detail).toBe('최근 저장 formatted-date')
    expect(permissions.map((item) => [item.id, item.detail, item.enabled])).toEqual([
      ['edit', '페이지 잠김', false],
      ['lock', '잠김', true],
      ['comment', '가능', true],
      ['asset', '다운로드만', false],
      ['share', '관리 가능', true],
    ])
  })

  it('creates member summary labels and home metric cards', () => {
    expect(workspaceMemberSummaryLabel({ workspaceId: null })).toBe('저장 후 멤버 관리 가능')
    expect(workspaceMemberSummaryLabel({ workspaceId: 1, canManageWorkspaceShare: false })).toBe('관리자만 멤버 목록을 관리할 수 있습니다')
    expect(workspaceMemberSummaryLabel({ workspaceId: 1, canManageWorkspaceShare: true, memberLoading: true })).toBe('멤버 목록을 불러오는 중')
    expect(workspaceMemberSummaryLabel({ workspaceId: 1, canManageWorkspaceShare: true, memberCount: 4 })).toBe('4명')

    const cards = createWorkspaceHomeMetricCards({
      documentStats: { blockCount: 3, characterCount: 100, imageCount: 2 },
      outlineCount: 1,
      documentTaskSummaryLabel: '2/3 완료',
      openTaskCount: 1,
      documentTaskProgress: 67,
      unresolvedCommentCount: 5,
      resolvedCommentCount: 8,
      mentionedCommentCount: 1,
      assetCount: 6,
      imageCount: 2,
      fileCount: 4,
    })

    expect(cards.map((card) => card.id)).toEqual(['outline', 'tasks', 'review', 'assets'])
    expect(cards[1]).toMatchObject({ value: '2/3 완료', detail: '열린 작업 1개 · 진행률 67%' })
    expect(cards[2]).toMatchObject({ value: '5개 열림', detail: '8개 해결됨 · 멘션 1' })
  })
})
