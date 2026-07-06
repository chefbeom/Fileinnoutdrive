import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useWorkspacePlanningPanels } from './useWorkspacePlanningPanels.js'

const statusOptions = [
  { id: 'planning', label: 'Planning' },
  { id: 'active', label: 'Active' },
  { id: 'done', label: 'Done' },
]

const createSubject = () => {
  const workspacePageIndexRows = ref([
    {
      id: 1,
      title: 'Launch plan',
      scope: 'personal',
      scopeLabel: 'Personal',
      accessRole: 'WRITE',
      roleLabel: 'Write',
      updatedLabel: 'Today',
      updatedAt: '2026-07-02T09:00:00Z',
      status: 'active',
      dueDate: '2026-07-05',
      workspaceTasks: [
        {
          id: 'task-1',
          text: 'Review checklist',
          checked: false,
          assigneeEmail: 'me@example.com',
          dueDate: '2026-07-04',
          isOverdue: true,
        },
        {
          id: 'task-2',
          text: 'Publish notes',
          checked: true,
          assigneeEmail: 'other@example.com',
          dueDate: '2026-07-06',
          isOverdue: false,
        },
      ],
    },
    {
      id: 2,
      title: 'Archive',
      scope: 'shared',
      scopeLabel: 'Shared',
      accessRole: 'READ',
      roleLabel: 'Read',
      updatedLabel: 'Yesterday',
      updatedAt: '2026-07-01T09:00:00Z',
      status: 'active',
      dueDate: '2026-07-03',
      locked: true,
      workspaceTasks: [
        {
          id: 'task-3',
          text: 'Read only task',
          checked: false,
          assigneeEmail: 'me@example.com',
          dueDate: '2026-07-07',
          isOverdue: false,
        },
      ],
    },
  ])

  const subject = useWorkspacePlanningPanels({
    workspacePageIndexRows,
    visibleWorkspacePageIndexRows: workspacePageIndexRows,
    workspaceInboxFilter: ref('mine'),
    workspaceCalendarFilter: ref('upcoming'),
    workspaceTimelineFilter: ref('open'),
    currentWorkspaceKey: ref('1'),
    currentUserEmail: ref('me@example.com'),
    statusOptions,
    todayKey: () => '2026-07-05',
  })

  return { subject, workspacePageIndexRows }
}

describe('useWorkspacePlanningPanels', () => {
  it('builds board columns sorted by due date and counts open tasks', () => {
    const { subject } = createSubject()

    const activeColumn = subject.workspaceBoardColumns.value.find((column) => column.id === 'active')

    expect(activeColumn.rows.map((row) => row.id)).toEqual([2, 1])
    expect(activeColumn.openTaskCount).toBe(2)
  })

  it('indexes page tasks with document metadata and permissions', () => {
    const { subject } = createSubject()

    expect(subject.workspaceIndexedTasks.value).toHaveLength(3)
    expect(subject.workspaceIndexedTasks.value[0]).toMatchObject({
      id: 'task-1',
      documentId: 1,
      documentTitle: 'Launch plan',
      isCurrentDocument: true,
      canToggle: true,
      isMine: true,
    })
    expect(subject.workspaceIndexedTasks.value[2]).toMatchObject({
      id: 'task-3',
      documentId: 2,
      canToggle: false,
      isMine: true,
    })
  })

  it('creates inbox, calendar, and timeline views from indexed tasks', () => {
    const { subject } = createSubject()

    expect(subject.visibleWorkspaceInboxTasks.value.map((task) => task.id)).toEqual(['task-1', 'task-3'])
    expect(subject.workspaceInboxFilterOptions.value.find((option) => option.id === 'mine')?.count).toBe(2)
    expect(subject.workspaceCalendarItems.value.some((item) => item.id === 'task:task-1')).toBe(true)
    expect(subject.workspaceCalendarGroups.value.length).toBeGreaterThan(0)
    expect(subject.workspaceTimelineGroups.value.length).toBeGreaterThan(0)
    expect(subject.workspaceTimelineItemStyle(subject.visibleWorkspaceTimelineItems.value[0]))
      .toHaveProperty('--workspace-timeline-offset')
  })

  it('reacts when page index rows change', () => {
    const { subject, workspacePageIndexRows } = createSubject()
    workspacePageIndexRows.value = []

    expect(subject.workspaceIndexedTasks.value).toEqual([])
    expect(subject.workspaceBoardColumns.value.every((column) => column.rows.length === 0)).toBe(true)
  })
})
