const normalizeTasks = (tasks) => (Array.isArray(tasks) ? tasks.filter(Boolean) : [])

const stripWorkspaceSnapshotText = (value) =>
  String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const collectWorkspaceSnapshotText = (value) => {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return stripWorkspaceSnapshotText(value)
  if (Array.isArray(value)) return value.map(collectWorkspaceSnapshotText).filter(Boolean).join(' ')
  if (typeof value === 'object') {
    return Object.values(value).map(collectWorkspaceSnapshotText).filter(Boolean).join(' ')
  }
  return ''
}

export const workspaceTaskTodayKey = (date = new Date()) => {
  const currentDate = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(currentDate.getTime())) return ''

  const year = currentDate.getFullYear()
  const month = String(currentDate.getMonth() + 1).padStart(2, '0')
  const day = String(currentDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const isWorkspaceTaskOverdue = (task, todayKey = workspaceTaskTodayKey()) =>
  Boolean(task?.dueDate && todayKey && !task.checked && String(task.dueDate) < todayKey)

export const filterOpenWorkspaceTasks = (tasks) =>
  normalizeTasks(tasks).filter((task) => !task.checked)

export const filterCompletedWorkspaceTasks = (tasks) =>
  normalizeTasks(tasks).filter((task) => task.checked)

export const filterOverdueWorkspaceTasks = (tasks, todayKey = workspaceTaskTodayKey()) =>
  normalizeTasks(tasks).filter((task) => isWorkspaceTaskOverdue(task, todayKey))


export const filterWorkspaceTasksByMode = ({
  filter = 'open',
  allTasks = [],
  openTasks = [],
  assignedTasks = [],
  completedTasks = [],
  overdueTasks = [],
} = {}) => {
  if (filter === 'all') return normalizeTasks(allTasks)
  if (filter === 'mine') return normalizeTasks(assignedTasks)
  if (filter === 'done') return normalizeTasks(completedTasks)
  if (filter === 'overdue') return normalizeTasks(overdueTasks)
  return normalizeTasks(openTasks)
}

export const createWorkspaceTaskFilterOptions = ({
  allTasks = [],
  openTasks = [],
  assignedTasks = [],
  completedTasks = [],
  overdueTasks = [],
} = {}) => [
  { id: 'open', label: '열림', count: normalizeTasks(openTasks).length },
  { id: 'mine', label: '내 작업', count: normalizeTasks(assignedTasks).length },
  { id: 'overdue', label: '지남', count: normalizeTasks(overdueTasks).length },
  { id: 'done', label: '완료', count: normalizeTasks(completedTasks).length },
  { id: 'all', label: '전체', count: normalizeTasks(allTasks).length },
]

export const getWorkspaceTaskEmptyLabel = ({ taskCount = 0, filter = 'open' } = {}) => {
  if (taskCount === 0) return '아직 작업 항목이 없습니다.'
  if (filter === 'mine') return '내게 배정된 작업이 없습니다.'
  if (filter === 'overdue') return '기한이 지난 작업이 없습니다.'
  if (filter === 'done') return '완료된 작업이 없습니다.'
  if (filter === 'all') return '표시할 작업이 없습니다.'
  return '열린 작업이 없습니다.'
}

export const createWorkspaceInboxFilterOptions = ({
  allTasks = [],
  openTasks = [],
  assignedTasks = [],
  completedTasks = [],
  overdueTasks = [],
} = {}) => [
  { id: 'mine', label: '내 작업', count: normalizeTasks(assignedTasks).length },
  { id: 'open', label: '열림', count: normalizeTasks(openTasks).length },
  { id: 'overdue', label: '지연', count: normalizeTasks(overdueTasks).length },
  { id: 'done', label: '완료', count: normalizeTasks(completedTasks).length },
  { id: 'all', label: '전체', count: normalizeTasks(allTasks).length },
]

export const getWorkspaceInboxEmptyLabel = ({ taskCount = 0, filter = 'mine' } = {}) => {
  if (taskCount === 0) return '워크스페이스 전체 작업이 없습니다.'
  if (filter === 'mine') return '내게 배정된 열린 작업이 없습니다.'
  if (filter === 'overdue') return '기한이 지난 작업이 없습니다.'
  if (filter === 'done') return '완료된 작업이 없습니다.'
  return '표시할 작업이 없습니다.'
}
export const calculateWorkspaceTaskProgress = (tasks) => {
  const rows = normalizeTasks(tasks)
  if (rows.length === 0) return 0
  return Math.round((filterCompletedWorkspaceTasks(rows).length / rows.length) * 100)
}

export const createWorkspaceTaskSummaryLabel = (tasks) => {
  const rows = normalizeTasks(tasks)
  if (rows.length === 0) return '작업 없음'
  return `${filterCompletedWorkspaceTasks(rows).length}/${rows.length} 완료`
}

const collectWorkspaceChecklistItems = (items = [], block, blockIndex, source, path = [], options = {}) => {
  if (!Array.isArray(items)) return []

  const collectText = options.collectText || collectWorkspaceSnapshotText
  const todayKey = options.todayKey ?? workspaceTaskTodayKey()
  const anchorBlockId = String(block?.id || `index-${blockIndex}`)

  return items.flatMap((item, itemIndex) => {
    const currentPath = [...path, itemIndex]
    const nestedItems = Array.isArray(item?.items) ? item.items : []
    const text = collectText(item?.content ?? item?.text ?? item?.label ?? item?.data?.text)
    const meta = item?.meta || {}
    const checked = Boolean(meta.checked ?? item?.checked ?? item?.data?.checked)
    const dueDate = String(meta.dueDate || '').trim()
    const task = text
      ? [{
          id: `${source.id || 'page'}:${anchorBlockId}:${currentPath.join('.')}`,
          documentId: source.id,
          documentTitle: source.title,
          documentScope: source.scope,
          documentRole: source.role,
          documentUpdatedAt: source.updatedAt,
          document: source,
          anchorBlockId,
          anchorBlockType: 'list',
          anchorText: text.slice(0, 255),
          text,
          checked,
          assigneeEmail: String(meta.assigneeEmail || '').trim(),
          assigneeName: String(meta.assigneeName || meta.assigneeEmail || '').trim(),
          dueDate,
          depth: Math.max(0, currentPath.length - 1),
          blockIndex,
          path: currentPath,
          pathLabel: currentPath.map((index) => index + 1).join('.'),
          isOverdue: Boolean(dueDate && todayKey && !checked && dueDate < todayKey),
        }]
      : []

    return [
      ...task,
      ...collectWorkspaceChecklistItems(nestedItems, block, blockIndex, source, currentPath, options),
    ]
  })
}

export const collectWorkspaceSnapshotTasks = (blocks = [], source = {}, options = {}) =>
  (Array.isArray(blocks) ? blocks : [])
    .flatMap((block, blockIndex) => {
      const style = String(block?.data?.style || '').toLowerCase()
      if (block?.type !== 'list' || style !== 'checklist') return []
      return collectWorkspaceChecklistItems(block.data?.items || [], block, blockIndex, source, [], options)
    })