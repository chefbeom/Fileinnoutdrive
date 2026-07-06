import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceOverviewState } from './useWorkspaceOverviewState.js'

describe('useWorkspaceOverviewState', () => {
  it('builds summary and health items from workspace sources', () => {
    const workspacePropertyStatusOption = ref({ label: '진행 중' })
    const workspacePropertyPriorityOption = ref({ label: '높음' })
    const currentWorkspaceProperties = ref({ ownerName: 'Kim' })
    const documentStats = ref({ blockCount: 3, wordCount: 12, characterCount: 80 })
    const documentTasks = ref([{ id: 1 }, { id: 2 }])
    const documentTaskProgress = ref(50)
    const completedDocumentTasks = ref([{ id: 1 }])
    const unresolvedWorkspaceComments = ref([{ id: 1 }, { id: 2 }])
    const resolvedWorkspaceComments = ref([{ id: 3 }])
    const linkedWorkspaceDocuments = ref([{ id: 'a' }])
    const workspaceAssets = ref([{ id: 1 }, { id: 2 }, { id: 3 }])
    const workspaceImages = ref([{ id: 1 }])
    const workspaceFiles = ref([{ id: 2 }, { id: 3 }])

    const subject = useWorkspaceOverviewState({
      workspacePropertyStatusOption,
      workspacePropertyPriorityOption,
      currentWorkspaceProperties,
      documentStats,
      documentTasks,
      documentTaskProgress,
      completedDocumentTasks,
      unresolvedWorkspaceComments,
      resolvedWorkspaceComments,
      linkedWorkspaceDocuments,
      workspaceAssets,
      workspaceImages,
      workspaceFiles,
      workspaceShareStatusLabel: ref('멤버 공유'),
      workspaceAccessRole: ref('WRITE'),
      roleLabelFor: (role) => `role:${role}`,
      workspaceShareStatus: ref('Shared'),
      isWorkspacePropertyDueOverdue: ref(false),
      workspacePropertyDueDate: ref('2026-07-04'),
      overdueDocumentTasks: ref([]),
      lastSavedAt: ref('2026-07-04T00:00:00Z'),
      saveStatusLabel: ref('저장됨'),
      saveState: ref('idle'),
      hasUnsavedChanges: ref(false),
      formatDateTimeFor: (value) => `formatted:${value}`,
    })

    expect(subject.workspaceSummaryCards.value.map((card) => card.id)).toEqual([
      'properties',
      'content',
      'tasks',
      'review',
      'links',
      'assets',
    ])
    expect(subject.workspaceSummaryCards.value[0].value).toBe('진행 중')
    expect(subject.workspaceSummaryCards.value[0].detail).toBe('높음 우선순위 · Kim')
    expect(subject.workspaceSummaryCards.value[2].value).toBe('50%')
    expect(subject.workspaceSummaryCards.value[5].detail).toBe('이미지 1 · 파일 2')

    expect(subject.workspaceHealthItems.value.map((item) => item.id)).toEqual([
      'collaboration',
      'tasks',
      'review',
      'saving',
    ])
    expect(subject.workspaceHealthItems.value[0].detail).toBe('멤버 공유 · role:WRITE · Kim')
    expect(subject.workspaceHealthItems.value[0].tone).toBe('good')
    expect(subject.workspaceHealthItems.value[3].detail).toBe('최근 저장 formatted:2026-07-04T00:00:00Z')
  })

  it('builds permission items and member summary from access sources', () => {
    const canModifyWorkspacePage = ref(true)
    const isWorkspacePageLocked = ref(false)
    const canCommentOnWorkspace = ref(true)
    const canManageAssets = ref(true)
    const canManageWorkspaceShare = ref(true)
    const workspaceId = ref(10)
    const workspaceMemberLoading = ref(false)
    const workspaceMemberRows = ref([{ userIdx: 1 }, { userIdx: 2 }])

    const subject = useWorkspaceOverviewState({
      canModifyWorkspacePage,
      isWorkspacePageLocked,
      workspaceLockStatusLabel: ref('편집 가능'),
      canCommentOnWorkspace,
      canManageAssets,
      canManageWorkspaceShare,
      workspaceId,
      workspaceMemberLoading,
      workspaceMemberRows,
    })

    expect(subject.workspacePermissionItems.value.map((item) => [item.id, item.enabled])).toEqual([
      ['edit', true],
      ['lock', false],
      ['comment', true],
      ['asset', true],
      ['share', true],
    ])
    expect(subject.workspaceMemberSummaryLabel.value).toBe('2명')

    canModifyWorkspacePage.value = false
    isWorkspacePageLocked.value = true
    canCommentOnWorkspace.value = false
    canManageAssets.value = false
    canManageWorkspaceShare.value = false
    expect(subject.workspacePermissionItems.value.find((item) => item.id === 'edit').detail).toBe('페이지 잠김')
    expect(subject.workspacePermissionItems.value.find((item) => item.id === 'share').detail).toBe('관리자 전용')
    expect(subject.workspaceMemberSummaryLabel.value).toBe('관리자만 멤버 목록을 관리할 수 있습니다')

    workspaceId.value = null
    expect(subject.workspaceMemberSummaryLabel.value).toBe('저장 후 멤버 관리 가능')
  })
})