import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'

import { useWorkspaceHomePanels } from './useWorkspaceHomePanels.js'

const initialFor = (value) => String(value || '?').slice(0, 1).toUpperCase()

const createSubject = () => {
  const workspaceMembers = ref([
    { userIdx: 2, email: 'owner@example.com', name: 'Owner', role: 'ADMIN' },
    { userIdx: 3, email: 'writer@example.com', name: 'Writer', role: 'WRITE' },
  ])
  const workspacePageIndexRows = ref([
    {
      id: 10,
      title: 'Active page',
      status: 'active',
      statusLabel: 'Active',
      ownerEmail: 'owner@example.com',
      ownerName: 'Owner',
      dueDate: '2026-07-05',
      updatedAt: '2026-07-03T09:00:00Z',
      isOverdue: false,
      workspaceTasks: [],
    },
    {
      id: 11,
      title: 'Blocked page',
      status: 'blocked',
      statusLabel: 'Blocked',
      ownerEmail: '',
      updatedAt: '2026-07-02T09:00:00Z',
      isOverdue: true,
      workspaceTasks: [],
    },
  ])
  const openWorkspaceIndexedTasks = ref([
    {
      id: 'task-1',
      text: 'Assigned task',
      documentTitle: 'Active page',
      assigneeEmail: 'owner@example.com',
      dueDate: '2026-07-04',
      isOverdue: true,
    },
    {
      id: 'task-2',
      text: 'Unassigned task',
      documentTitle: 'Blocked page',
      assigneeEmail: '',
      dueDate: '',
      isOverdue: false,
    },
  ])

  const subject = useWorkspaceHomePanels({
    workspaceMembers,
    currentUserIdx: ref(2),
    activeWorkspaceUserIds: ref(new Set([2])),
    currentUser: computed(() => ({ email: 'owner@example.com', name: 'Owner' })),
    activeUsers: ref([{ email: 'owner@example.com', name: 'Owner' }]),
    workspacePageIndexRows,
    workspaceIndexedTasks: openWorkspaceIndexedTasks,
    openWorkspaceIndexedTasks,
    myWorkspaceIndexedTasks: ref([openWorkspaceIndexedTasks.value[0]]),
    currentUserEmail: ref('owner@example.com'),
    initialFor,
    documentStats: ref({ blockCount: 3, characterCount: 120, imageCount: 1 }),
    documentOutline: ref([{ id: 'h1' }]),
    documentTaskSummaryLabel: ref('1 open'),
    openDocumentTasks: ref([{ id: 'doc-task' }]),
    documentTaskProgress: ref(50),
    unresolvedWorkspaceComments: ref([{ id: 'comment-1', contents: 'Please review' }]),
    resolvedWorkspaceComments: ref([]),
    mentionedWorkspaceComments: ref([{ id: 'mention-1', authorName: 'Writer', contents: '@Owner check this' }]),
    workspaceAssets: ref([{ id: 'asset-1', assetType: 'FILE', originalName: 'notes.txt', createdAt: '2026-07-03T10:00:00Z' }]),
    workspaceImages: ref([]),
    workspaceFiles: ref([{ id: 'asset-1' }]),
    overdueWorkspaceCalendarItems: ref([{ id: 'overdue-1', title: 'Late task', dueDate: '2026-07-01', typeLabel: 'Task' }]),
    lastSavedAt: ref('2026-07-03T11:00:00Z'),
    workspaceComments: ref([{ id: 'comment-1', authorName: 'Writer', contents: 'Please review', createdAt: '2026-07-03T09:30:00Z' }]),
    workspaceMemberRefreshedAt: ref('2026-07-03T11:30:00Z'),
    formatDateTimeFor: () => 'formatted',
    workspaceFullTextResults: ref([{ id: 'search-1' }]),
    quickBlockOptions: [{ id: 'todo' }, { id: 'callout' }],
    workspaceRelationCount: ref(2),
    workspaceRevisionCount: ref(1),
  })

  return { subject, workspacePageIndexRows }
}

describe('useWorkspaceHomePanels', () => {
  it('creates member and workload rows from members, pages, and indexed tasks', () => {
    const { subject } = createSubject()

    expect(subject.workspaceMemberRows.value.map((member) => member.email)).toEqual([
      'owner@example.com',
      'writer@example.com',
    ])
    expect(subject.workspaceWorkloadRows.value[0]).toMatchObject({
      email: 'owner@example.com',
      isMe: true,
    })
    expect(subject.workspaceUnassignedPages.value.map((page) => page.id)).toEqual([11])
    expect(subject.workspaceUnassignedTasks.value.map((task) => task.id)).toEqual(['task-2'])
    expect(subject.workspaceBlockedPages.value.map((page) => page.id)).toEqual([11])
  })

  it('creates home metrics, queue, attention, recent pages, activity, and tabs', () => {
    const { subject } = createSubject()

    expect(subject.workspaceHomeMetricCards.value.map((card) => card.id)).toEqual([
      'outline',
      'tasks',
      'review',
      'assets',
    ])
    expect(subject.workspaceHomeMyQueue.value.map((item) => item.type)).toContain('page')
    expect(subject.workspaceHomeAttentionItems.value.map((item) => item.tone)).toContain('danger')
    expect(subject.workspaceHomeRecentPages.value.map((page) => page.id)).toEqual([10, 11])
    expect(subject.workspaceActivityItems.value.length).toBeGreaterThan(0)
    expect(subject.workspacePanelTabs.value.find((tab) => tab.id === 'home')?.count).toBeGreaterThan(0)
  })

  it('reacts when page rows change', () => {
    const { subject, workspacePageIndexRows } = createSubject()
    workspacePageIndexRows.value = []

    expect(subject.workspaceUnassignedPages.value).toEqual([])
    expect(subject.workspaceHomeRecentPages.value).toEqual([])
  })
})
