import { truncateWorkspaceActivityText } from './workspaceActivity.js'
import { sortWorkspaceScheduleQueueItems, workspaceCalendarDateLabel } from './workspaceSchedule.js'

const normalizeRows = (rows) => (Array.isArray(rows) ? rows : [])

export const createWorkspaceHomeMyQueue = ({
  pageRows = [],
  myTasks = [],
  currentUserEmail = '',
  limit = 6,
} = {}) => {
  const currentEmail = String(currentUserEmail || '').toLowerCase()
  const ownedPages = currentEmail
    ? normalizeRows(pageRows)
        .filter((page) =>
          page.status !== 'done' &&
          String(page.ownerEmail || '').toLowerCase() === currentEmail,
        )
        .map((page) => ({
          id: `my-page-${page.id}`,
          type: 'page',
          title: page.title,
          detail: `${page.statusLabel} · ${page.dueDate || '기한 없음'}`,
          dueDate: page.dueDate || '',
          isOverdue: page.isOverdue,
          icon: page.icon,
          page,
        }))
    : []

  const tasks = normalizeRows(myTasks).map((task) => ({
    id: `my-task-${task.id}`,
    type: 'task',
    title: task.text,
    detail: `${task.documentTitle} · ${task.dueDate || '기한 없음'}`,
    dueDate: task.dueDate || '',
    isOverdue: task.isOverdue,
    icon: '□',
    task,
  }))

  return sortWorkspaceScheduleQueueItems([...ownedPages, ...tasks]).slice(0, limit)
}

export const createWorkspaceHomeAttentionItems = ({
  mentionedComments = [],
  overdueItems = [],
  blockedPages = [],
  unassignedPages = [],
  unassignedTasks = [],
  limit = 8,
} = {}) => {
  const mentionItems = normalizeRows(mentionedComments).slice(0, 3).map((comment) => ({
    id: `mention-${comment.id}`,
    tone: 'info',
    label: '내 멘션',
    title: comment.authorName || '댓글 멘션',
    detail: truncateWorkspaceActivityText(comment.contents, 72),
    comment,
  }))
  const overdueAttentionItems = normalizeRows(overdueItems).slice(0, 4).map((item) => ({
    id: `overdue-${item.id}`,
    tone: 'danger',
    label: '기한 지남',
    title: item.title,
    detail: `${workspaceCalendarDateLabel(item.dueDate)} · ${item.typeLabel}`,
    item,
  }))
  const blockedItems = normalizeRows(blockedPages).slice(0, 3).map((page) => ({
    id: `blocked-${page.id}`,
    tone: 'warn',
    label: '차단',
    title: page.title,
    detail: page.ownerName || page.scopeLabel,
    page,
  }))
  const unassignedItems = [
    ...normalizeRows(unassignedPages).slice(0, 2).map((page) => ({
      id: `unassigned-page-${page.id}`,
      tone: 'muted',
      label: '미배정 페이지',
      title: page.title,
      detail: page.statusLabel,
      page,
    })),
    ...normalizeRows(unassignedTasks).slice(0, 2).map((task) => ({
      id: `unassigned-task-${task.id}`,
      tone: 'muted',
      label: '미배정 작업',
      title: task.text,
      detail: task.documentTitle,
      task,
    })),
  ]

  return [...mentionItems, ...overdueAttentionItems, ...blockedItems, ...unassignedItems].slice(0, limit)
}

export const createWorkspaceHomeRecentPages = (pageRows, limit = 5) =>
  normalizeRows(pageRows)
    .slice()
    .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime())
    .slice(0, limit)