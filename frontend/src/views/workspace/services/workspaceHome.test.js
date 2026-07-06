import { describe, expect, it } from 'vitest'

import {
  createWorkspaceHomeAttentionItems,
  createWorkspaceHomeMyQueue,
  createWorkspaceHomeRecentPages,
} from './workspaceHome.js'

const pageRows = [
  {
    id: 1,
    title: 'Owned later',
    status: 'active',
    statusLabel: '진행 중',
    dueDate: '2026-07-04',
    ownerEmail: 'me@example.com',
    icon: 'A',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 2,
    title: 'Done page',
    status: 'done',
    statusLabel: '완료',
    dueDate: '2026-07-01',
    ownerEmail: 'me@example.com',
    updatedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    id: 3,
    title: 'Other page',
    status: 'active',
    statusLabel: '진행 중',
    dueDate: '2026-07-02',
    ownerEmail: 'other@example.com',
    updatedAt: '2026-07-03T00:00:00.000Z',
  },
]

const myTasks = [
  {
    id: 'task-a',
    text: 'Earlier task',
    documentTitle: 'Owned later',
    dueDate: '2026-07-02',
    isOverdue: true,
  },
  {
    id: 'task-b',
    text: 'No due task',
    documentTitle: 'Owned later',
    dueDate: '',
  },
]

describe('workspaceHome', () => {
  it('builds my queue from owned active pages and assigned tasks sorted by due date', () => {
    const queue = createWorkspaceHomeMyQueue({ pageRows, myTasks, currentUserEmail: 'me@example.com' })

    expect(queue.map((item) => item.id)).toEqual(['my-task-task-a', 'my-page-1', 'my-task-task-b'])
    expect(queue[0]).toMatchObject({ type: 'task', title: 'Earlier task', isOverdue: true })
    expect(queue[1]).toMatchObject({ type: 'page', title: 'Owned later', detail: '진행 중 · 2026-07-04' })
  })

  it('builds attention items in deterministic priority order and truncates long comments', () => {
    const attention = createWorkspaceHomeAttentionItems({
      mentionedComments: [{ id: 1, authorName: 'Reviewer', contents: 'x'.repeat(90) }],
      overdueItems: [{ id: 'page:1', title: 'Late page', dueDate: '2026-07-01', typeLabel: '페이지' }],
      blockedPages: [{ id: 2, title: 'Blocked', ownerName: 'Owner', scopeLabel: '공유' }],
      unassignedPages: [{ id: 3, title: 'No owner', statusLabel: '진행 중' }],
      unassignedTasks: [{ id: 't1', text: 'No assignee', documentTitle: 'Doc' }],
    })

    expect(attention.map((item) => item.id)).toEqual([
      'mention-1',
      'overdue-page:1',
      'blocked-2',
      'unassigned-page-3',
      'unassigned-task-t1',
    ])
    expect(attention[0].detail).toHaveLength(72)
    expect(attention[1]).toMatchObject({ tone: 'danger', label: '기한 지남', title: 'Late page' })
  })

  it('sorts recent pages by updated time without mutating input', () => {
    const source = [...pageRows]
    const recent = createWorkspaceHomeRecentPages(source, 2)

    expect(recent.map((page) => page.id)).toEqual([2, 3])
    expect(source.map((page) => page.id)).toEqual([1, 2, 3])
  })
})