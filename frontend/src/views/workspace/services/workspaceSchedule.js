const DAY_MS = 86400000
const NO_DUE_DATE_SORT_VALUE = '9999-12-31'

const toDateKey = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-')

const normalizeRows = (rows) => (Array.isArray(rows) ? rows : [])

export const workspaceScheduleTodayKey = (date = new Date()) => toDateKey(date)

export const workspaceScheduleDateTime = (value) => {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : date.getTime()
}

export const workspaceCalendarDateLabel = (value, options = {}) => {
  if (!value) return '기한 없음'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value

  const todayKey = options.todayKey || workspaceScheduleTodayKey()
  const todayDate = new Date(`${todayKey}T00:00:00`)
  const tomorrowDate = Number.isNaN(todayDate.getTime()) ? new Date() : todayDate
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  const tomorrowKey = toDateKey(tomorrowDate)

  if (value === todayKey) return '오늘'
  if (value === tomorrowKey) return '내일'
  return new Intl.DateTimeFormat(options.locale || 'ko-KR', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).format(date)
}

export const workspaceTimelineDateLabel = (value, locale = 'ko-KR') => {
  if (!value) return '기한 없음'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export const workspaceTimelineMonthLabel = (value, locale = 'ko-KR') => {
  if (!value) return '기한 없음'
  const date = new Date(`${value}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
  }).format(date)
}

export const workspaceTimelineDaySpan = (startTime, endTime) =>
  Math.max(0, Math.round((endTime - startTime) / DAY_MS))

export const createWorkspaceCalendarItems = (pageRows, indexedTasks, currentUserEmail = '') => {
  const currentEmail = String(currentUserEmail || '').toLowerCase()
  const pageItems = normalizeRows(pageRows)
    .filter((row) => row.dueDate)
    .map((row) => ({
      id: `page:${row.id}`,
      type: 'page',
      typeLabel: '페이지',
      title: row.title,
      dueDate: row.dueDate,
      isOverdue: row.isOverdue,
      isDone: row.status === 'done',
      isMine: currentEmail ? String(row.ownerEmail || '').toLowerCase() === currentEmail : false,
      document: row,
      icon: row.icon,
      statusLabel: row.statusLabel,
      priorityLabel: row.priorityLabel,
      priorityTone: row.priorityTone,
      detail: `${row.scopeLabel} · ${row.roleLabel}`,
    }))

  const taskItems = normalizeRows(indexedTasks)
    .filter((task) => task.dueDate)
    .map((task) => ({
      id: `task:${task.id}`,
      type: 'task',
      typeLabel: '작업',
      title: task.text,
      dueDate: task.dueDate,
      isOverdue: task.isOverdue,
      isDone: task.checked,
      isMine: task.isMine,
      task,
      document: task.document,
      icon: '□',
      statusLabel: task.checked ? '완료' : '열림',
      priorityLabel: task.assigneeName || task.assigneeEmail || '',
      priorityTone: task.isOverdue ? 'danger' : 'muted',
      detail: `${task.documentTitle} · ${task.pathLabel}`,
    }))

  return [...pageItems, ...taskItems].sort((left, right) => {
    const dateSort = workspaceScheduleDateTime(left.dueDate) - workspaceScheduleDateTime(right.dueDate)
    if (dateSort !== 0) return dateSort
    if (left.isDone !== right.isDone) return left.isDone ? 1 : -1
    return left.type.localeCompare(right.type)
  })
}

export const filterWorkspaceCalendarItems = (items, filter = 'upcoming', todayKey = workspaceScheduleTodayKey()) => {
  const rows = normalizeRows(items)
  if (filter === 'all') return rows
  if (filter === 'overdue') return rows.filter((item) => item.isOverdue)
  if (filter === 'mine') return rows.filter((item) => item.isMine && !item.isDone)
  if (filter === 'pages') return rows.filter((item) => item.type === 'page')
  if (filter === 'tasks') return rows.filter((item) => item.type === 'task')
  if (filter === 'open') return rows.filter((item) => !item.isDone)
  return rows.filter((item) => !item.isDone && !item.isOverdue && item.dueDate >= todayKey)
}


const countWorkspaceScheduleItemsByType = (items = [], type = '') =>
  normalizeRows(items).filter((item) => item?.type === type).length

export const createWorkspaceCalendarFilterOptions = ({
  allItems = [],
  upcomingItems = [],
  overdueItems = [],
  myItems = [],
} = {}) => [
  { id: 'upcoming', label: '예정', count: normalizeRows(upcomingItems).length },
  { id: 'overdue', label: '지연', count: normalizeRows(overdueItems).length },
  { id: 'mine', label: '내 일정', count: normalizeRows(myItems).length },
  { id: 'pages', label: '페이지', count: countWorkspaceScheduleItemsByType(allItems, 'page') },
  { id: 'tasks', label: '작업', count: countWorkspaceScheduleItemsByType(allItems, 'task') },
  { id: 'all', label: '전체', count: normalizeRows(allItems).length },
]

export const getWorkspaceCalendarEmptyLabel = ({ itemCount = 0, filter = 'upcoming' } = {}) => {
  if (itemCount === 0) return '기한이 지정된 페이지나 작업이 없습니다.'
  if (filter === 'overdue') return '기한이 지난 일정이 없습니다.'
  if (filter === 'mine') return '내게 배정된 일정이 없습니다.'
  if (filter === 'pages') return '기한이 지정된 페이지가 없습니다.'
  if (filter === 'tasks') return '기한이 지정된 작업이 없습니다.'
  return '예정된 일정이 없습니다.'
}

export const createWorkspaceTimelineFilterOptions = ({
  allItems = [],
  openItems = [],
  overdueItems = [],
  myItems = [],
} = {}) => [
  { id: 'open', label: '열림', count: normalizeRows(openItems).length },
  { id: 'overdue', label: '지연', count: normalizeRows(overdueItems).length },
  { id: 'mine', label: '내 일정', count: normalizeRows(myItems).length },
  { id: 'pages', label: '페이지', count: countWorkspaceScheduleItemsByType(allItems, 'page') },
  { id: 'tasks', label: '작업', count: countWorkspaceScheduleItemsByType(allItems, 'task') },
  { id: 'all', label: '전체', count: normalizeRows(allItems).length },
]

export const getWorkspaceTimelineEmptyLabel = ({ itemCount = 0, filter = 'open' } = {}) => {
  if (itemCount === 0) return '타임라인에 표시할 기한이 없습니다.'
  if (filter === 'overdue') return '지연된 타임라인 항목이 없습니다.'
  if (filter === 'mine') return '내게 배정된 타임라인 항목이 없습니다.'
  if (filter === 'pages') return '기한이 지정된 페이지가 없습니다.'
  if (filter === 'tasks') return '기한이 지정된 작업이 없습니다.'
  return '표시할 타임라인 항목이 없습니다.'
}
export const groupWorkspaceCalendarItems = (items, options = {}) => {
  const groups = new Map()
  normalizeRows(items).forEach((item) => {
    const key = item.dueDate || 'none'
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        label: workspaceCalendarDateLabel(item.dueDate, options),
        date: item.dueDate,
        items: [],
      })
    }
    groups.get(key).items.push(item)
  })
  return [...groups.values()]
}

export const createWorkspaceTimelineItems = (calendarItems) =>
  normalizeRows(calendarItems)
    .map((item) => ({
      ...item,
      time: workspaceScheduleDateTime(item.dueDate),
      dateLabel: workspaceTimelineDateLabel(item.dueDate),
      monthKey: item.dueDate ? item.dueDate.slice(0, 7) : 'none',
    }))
    .filter((item) => Number.isFinite(item.time))

export const filterWorkspaceTimelineItems = (items, filter = 'open') => {
  const rows = normalizeRows(items)
  if (filter === 'all') return rows
  if (filter === 'overdue') return rows.filter((item) => item.isOverdue && !item.isDone)
  if (filter === 'mine') return rows.filter((item) => item.isMine && !item.isDone)
  if (filter === 'pages') return rows.filter((item) => item.type === 'page')
  if (filter === 'tasks') return rows.filter((item) => item.type === 'task')
  return rows.filter((item) => !item.isDone)
}

export const createWorkspaceTimelineRange = (items) => {
  const rows = normalizeRows(items)
  if (rows.length === 0) {
    return {
      startTime: 0,
      endTime: 0,
      daySpan: 0,
      startLabel: '',
      endLabel: '',
      summaryLabel: '일정 없음',
    }
  }

  const times = rows.map((item) => item.time)
  const startTime = Math.min(...times)
  const endTime = Math.max(...times)
  const startItem = rows.find((item) => item.time === startTime)
  const endItem = rows.find((item) => item.time === endTime)
  const daySpan = Math.max(1, workspaceTimelineDaySpan(startTime, endTime))

  return {
    startTime,
    endTime,
    daySpan,
    startLabel: workspaceTimelineDateLabel(startItem?.dueDate),
    endLabel: workspaceTimelineDateLabel(endItem?.dueDate),
    summaryLabel: daySpan === 1 ? '하루 범위' : `${daySpan + 1}일 범위`,
  }
}

export const groupWorkspaceTimelineItems = (items) => {
  const groups = new Map()
  normalizeRows(items).forEach((item) => {
    const groupKey = item.monthKey || 'none'
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        id: groupKey,
        label: workspaceTimelineMonthLabel(groupKey),
        items: [],
      })
    }
    groups.get(groupKey).items.push(item)
  })

  return [...groups.values()].map((group) => ({
    ...group,
    items: group.items.sort((left, right) => {
      if (left.time !== right.time) return left.time - right.time
      if (left.isDone !== right.isDone) return left.isDone ? 1 : -1
      return String(left.title || '').localeCompare(String(right.title || ''), 'ko')
    }),
  }))
}

export const workspaceTimelineItemOffsetStyle = (item, range) => {
  const offset = range?.daySpan > 0
    ? (workspaceTimelineDaySpan(range.startTime, item.time) / range.daySpan) * 100
    : 0
  const clampedOffset = Math.min(100, Math.max(0, offset))
  return { '--workspace-timeline-offset': `${clampedOffset.toFixed(2)}%` }
}

export const sortWorkspaceScheduleQueueItems = (items) =>
  normalizeRows(items)
    .sort((left, right) => {
      const leftDue = left.dueDate || NO_DUE_DATE_SORT_VALUE
      const rightDue = right.dueDate || NO_DUE_DATE_SORT_VALUE
      if (leftDue !== rightDue) return leftDue.localeCompare(rightDue)
      return String(left.title || '').localeCompare(String(right.title || ''), 'ko')
    })