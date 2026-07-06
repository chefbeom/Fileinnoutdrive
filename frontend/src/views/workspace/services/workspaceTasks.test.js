import { describe, expect, it } from 'vitest'

import {
  calculateWorkspaceTaskProgress,
  collectWorkspaceSnapshotTasks,
  createWorkspaceInboxFilterOptions,
  createWorkspaceTaskFilterOptions,
  createWorkspaceTaskSummaryLabel,
  filterCompletedWorkspaceTasks,
  filterWorkspaceTasksByMode,
  filterOpenWorkspaceTasks,
  filterOverdueWorkspaceTasks,
  getWorkspaceInboxEmptyLabel,
  getWorkspaceTaskEmptyLabel,
  isWorkspaceTaskOverdue,
  workspaceTaskTodayKey,
} from './workspaceTasks.js'

const tasks = [
  { id: 'open', text: 'Open task', checked: false, dueDate: '2026-07-03' },
  { id: 'done', text: 'Done task', checked: true, dueDate: '2026-07-01' },
  { id: 'late', text: 'Late task', checked: false, dueDate: '2026-07-01' },
  { id: 'later', text: 'Later task', checked: false, dueDate: '2026-07-09' },
]

describe('workspaceTasks', () => {
  it('creates stable local date keys', () => {
    expect(workspaceTaskTodayKey(new Date(2026, 6, 3))).toBe('2026-07-03')
    expect(workspaceTaskTodayKey('invalid')).toBe('')
  })

  it('splits open, completed, and overdue tasks', () => {
    expect(filterOpenWorkspaceTasks(tasks).map((task) => task.id)).toEqual(['open', 'late', 'later'])
    expect(filterCompletedWorkspaceTasks(tasks).map((task) => task.id)).toEqual(['done'])
    expect(filterOverdueWorkspaceTasks(tasks, '2026-07-03').map((task) => task.id)).toEqual(['late'])
    expect(isWorkspaceTaskOverdue(tasks[1], '2026-07-03')).toBe(false)
  })


  it('creates document task filter options and visible task rows', () => {
    const openTasks = filterOpenWorkspaceTasks(tasks)
    const completedTasks = filterCompletedWorkspaceTasks(tasks)
    const overdueTasks = filterOverdueWorkspaceTasks(tasks, '2026-07-03')
    const assignedTasks = [tasks[0], tasks[2]]

    expect(createWorkspaceTaskFilterOptions({
      allTasks: tasks,
      openTasks,
      assignedTasks,
      completedTasks,
      overdueTasks,
    })).toEqual([
      { id: 'open', label: '열림', count: 3 },
      { id: 'mine', label: '내 작업', count: 2 },
      { id: 'overdue', label: '지남', count: 1 },
      { id: 'done', label: '완료', count: 1 },
      { id: 'all', label: '전체', count: 4 },
    ])

    expect(filterWorkspaceTasksByMode({ filter: 'open', openTasks }).map((task) => task.id)).toEqual(['open', 'late', 'later'])
    expect(filterWorkspaceTasksByMode({ filter: 'mine', assignedTasks }).map((task) => task.id)).toEqual(['open', 'late'])
    expect(filterWorkspaceTasksByMode({ filter: 'done', completedTasks }).map((task) => task.id)).toEqual(['done'])
    expect(filterWorkspaceTasksByMode({ filter: 'overdue', overdueTasks }).map((task) => task.id)).toEqual(['late'])
    expect(filterWorkspaceTasksByMode({ filter: 'all', allTasks: tasks }).map((task) => task.id)).toEqual(['open', 'done', 'late', 'later'])
  })


  it('creates workspace inbox filter options and empty labels', () => {
    const openTasks = filterOpenWorkspaceTasks(tasks)
    const completedTasks = filterCompletedWorkspaceTasks(tasks)
    const overdueTasks = filterOverdueWorkspaceTasks(tasks, '2026-07-03')
    const assignedTasks = [tasks[0], tasks[2]]

    expect(createWorkspaceInboxFilterOptions({
      allTasks: tasks,
      openTasks,
      assignedTasks,
      completedTasks,
      overdueTasks,
    })).toEqual([
      { id: 'mine', label: '내 작업', count: 2 },
      { id: 'open', label: '열림', count: 3 },
      { id: 'overdue', label: '지연', count: 1 },
      { id: 'done', label: '완료', count: 1 },
      { id: 'all', label: '전체', count: 4 },
    ])

    expect(getWorkspaceInboxEmptyLabel({ taskCount: 0, filter: 'mine' })).toBe('워크스페이스 전체 작업이 없습니다.')
    expect(getWorkspaceInboxEmptyLabel({ taskCount: 4, filter: 'mine' })).toBe('내게 배정된 열린 작업이 없습니다.')
    expect(getWorkspaceInboxEmptyLabel({ taskCount: 4, filter: 'overdue' })).toBe('기한이 지난 작업이 없습니다.')
    expect(getWorkspaceInboxEmptyLabel({ taskCount: 4, filter: 'done' })).toBe('완료된 작업이 없습니다.')
    expect(getWorkspaceInboxEmptyLabel({ taskCount: 4, filter: 'open' })).toBe('표시할 작업이 없습니다.')
  })
  it('creates empty labels for document task filters', () => {
    expect(getWorkspaceTaskEmptyLabel({ taskCount: 0, filter: 'open' })).toBe('아직 작업 항목이 없습니다.')
    expect(getWorkspaceTaskEmptyLabel({ taskCount: 4, filter: 'mine' })).toBe('내게 배정된 작업이 없습니다.')
    expect(getWorkspaceTaskEmptyLabel({ taskCount: 4, filter: 'overdue' })).toBe('기한이 지난 작업이 없습니다.')
    expect(getWorkspaceTaskEmptyLabel({ taskCount: 4, filter: 'done' })).toBe('완료된 작업이 없습니다.')
    expect(getWorkspaceTaskEmptyLabel({ taskCount: 4, filter: 'all' })).toBe('표시할 작업이 없습니다.')
    expect(getWorkspaceTaskEmptyLabel({ taskCount: 4, filter: 'open' })).toBe('열린 작업이 없습니다.')
  })
  it('summarizes task progress without dividing by zero', () => {
    expect(calculateWorkspaceTaskProgress(tasks)).toBe(25)
    expect(createWorkspaceTaskSummaryLabel(tasks)).toBe('1/4 완료')
    expect(calculateWorkspaceTaskProgress([])).toBe(0)
    expect(createWorkspaceTaskSummaryLabel([])).toBe('작업 없음')
  })

  it('collects checklist tasks from workspace snapshots', () => {
    const snapshotBlocks = [
      { id: 'paragraph-1', type: 'paragraph', data: { text: 'Not a task' } },
      {
        id: 'checklist-1',
        type: 'list',
        data: {
          style: 'checklist',
          items: [
            {
              content: '<b>Prepare release</b>',
              meta: {
                assigneeEmail: 'dev@example.com',
                assigneeName: 'Dev',
                dueDate: '2026-07-01',
              },
              items: [
                {
                  content: 'Nested done',
                  meta: { checked: true, dueDate: '2026-07-01' },
                },
              ],
            },
            { content: 'No due date', checked: false },
          ],
        },
      },
    ]

    const result = collectWorkspaceSnapshotTasks(
      snapshotBlocks,
      {
        id: 'page-1',
        title: 'Release plan',
        scope: 'owned',
        role: 'ADMIN',
        updatedAt: '2026-07-02T10:00:00Z',
      },
      { todayKey: '2026-07-03' },
    )

    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({
      id: 'page-1:checklist-1:0',
      documentId: 'page-1',
      documentTitle: 'Release plan',
      anchorBlockId: 'checklist-1',
      anchorBlockType: 'list',
      text: 'Prepare release',
      assigneeEmail: 'dev@example.com',
      assigneeName: 'Dev',
      dueDate: '2026-07-01',
      path: [0],
      pathLabel: '1',
      depth: 0,
      blockIndex: 1,
      isOverdue: true,
    })
    expect(result[1]).toMatchObject({
      text: 'Nested done',
      checked: true,
      path: [0, 0],
      pathLabel: '1.1',
      depth: 1,
      isOverdue: false,
    })
    expect(result[2]).toMatchObject({
      text: 'No due date',
      checked: false,
      isOverdue: false,
    })
  })
})