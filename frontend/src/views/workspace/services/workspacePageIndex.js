import { formatDocumentTime, roleLabel } from './workspacePresentation.js'
import { normalizeWorkspaceProperties } from './workspaceProperties.js'
import { collectWorkspaceSnapshotText } from './workspaceMarkdown.js'
import { parseWorkspaceSnapshotWithMeta } from './workspaceSnapshot.js'
import { collectWorkspaceSnapshotTasks, workspaceTaskTodayKey } from './workspaceTasks.js'

const LOCKED_SEARCH_TEXT = 'locked \uC7A0\uAE08 \uBCF4\uD638'
const EDITABLE_SEARCH_TEXT = 'editable \uD3B8\uC9D1 \uAC00\uB2A5'
const EMPTY_DUE_DATE_SORT_VALUE = '9999-12-31'

const updatedTime = (row = {}) => {
  const time = new Date(row.updatedAt || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

export const workspacePageIndexPriorityRank = (priority, priorityOptions = []) =>
  (Array.isArray(priorityOptions) ? priorityOptions : []).findIndex((option) => option?.id === priority)

export const workspacePageIndexRowSearchText = (row = {}) =>
  [
    row.title,
    row.preview,
    row.scopeLabel,
    row.roleLabel,
    row.statusLabel,
    row.priorityLabel,
    row.ownerName,
    row.ownerEmail,
    row.dueDate,
    row.locked ? LOCKED_SEARCH_TEXT : EDITABLE_SEARCH_TEXT,
    ...(Array.isArray(row.tags) ? row.tags : []),
  ].join(' ').toLowerCase()

const workspacePropertyOptionLabel = (value, options = []) =>
  (Array.isArray(options) ? options : []).find((option) => option?.id === value)?.label || value || ''

export const createWorkspacePageIndexRow = (document = {}, data = {}, options = {}) => {
  const statusOptions = Array.isArray(options.statusOptions) ? options.statusOptions : []
  const priorityOptions = Array.isArray(options.priorityOptions) ? options.priorityOptions : []
  const propertyOptions = options.propertyOptions || {}
  const todayKey = options.todayKey ?? workspaceTaskTodayKey()
  const snapshot = parseWorkspaceSnapshotWithMeta(data?.contents)
  const properties = normalizeWorkspaceProperties(snapshot.meta?.workspaceProperties, propertyOptions)
  const meta = snapshot.meta || {}
  const bodyText = collectWorkspaceSnapshotText(snapshot.blocks)
  const updatedAt = data?.updatedAt || document.updatedAt
  const status = properties.status
  const priority = properties.priority
  const accessRole = String(data?.accessRole || data?.level || document.role || 'READ').toUpperCase()
  const rowTitle = data?.title || document.title
  const scopeLabel = document.scope === 'shared' ? '공유 페이지' : '내 페이지'
  const updatedLabel = formatDocumentTime(updatedAt)
  const role = roleLabel(accessRole)
  const workspaceTasks = collectWorkspaceSnapshotTasks(snapshot.blocks, {
    ...document,
    title: rowTitle,
    updatedAt,
    accessRole,
    role: accessRole,
    scopeLabel,
    roleLabel: role,
    updatedLabel,
  }, { todayKey })

  return {
    ...document,
    title: rowTitle,
    updatedAt,
    accessRole,
    icon: properties.icon,
    coverColor: properties.coverColor,
    status,
    priority,
    statusLabel: workspacePropertyOptionLabel(status, statusOptions),
    priorityLabel: workspacePropertyOptionLabel(priority, priorityOptions),
    statusTone: statusOptions.find((option) => option.id === status)?.tone || 'muted',
    priorityTone: priorityOptions.find((option) => option.id === priority)?.tone || 'muted',
    ownerName: properties.ownerName || properties.ownerEmail || '',
    ownerEmail: properties.ownerEmail,
    dueDate: properties.dueDate,
    tags: properties.tags,
    locked: properties.locked,
    isOverdue: Boolean(properties.dueDate && status !== 'done' && todayKey && properties.dueDate < todayKey),
    scopeLabel,
    roleLabel: role,
    canEditProperties: !properties.locked && ['ADMIN', 'WRITE'].includes(accessRole),
    parentWorkspaceId: String(meta.parentWorkspaceId || ''),
    parentWorkspaceTitle: String(meta.parentWorkspaceTitle || ''),
    updatedLabel,
    workspaceTasks,
    preview: bodyText.slice(0, 120),
  }
}
export const matchesWorkspacePageIndexQuery = (row, query) => {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  return !normalizedQuery || workspacePageIndexRowSearchText(row).includes(normalizedQuery)
}

export const sortWorkspacePageIndexRows = (rows, sort = 'updated-desc', priorityOptions = []) => {
  const nextRows = [...(Array.isArray(rows) ? rows : [])]
  if (sort === 'due-asc') {
    return nextRows.sort((left, right) => {
      const leftDue = left.dueDate || EMPTY_DUE_DATE_SORT_VALUE
      const rightDue = right.dueDate || EMPTY_DUE_DATE_SORT_VALUE
      if (leftDue !== rightDue) return leftDue.localeCompare(rightDue)
      return updatedTime(right) - updatedTime(left)
    })
  }
  if (sort === 'priority-desc') {
    return nextRows.sort((left, right) => {
      const priorityDiff =
        workspacePageIndexPriorityRank(right.priority, priorityOptions) -
        workspacePageIndexPriorityRank(left.priority, priorityOptions)
      if (priorityDiff !== 0) return priorityDiff
      return updatedTime(right) - updatedTime(left)
    })
  }
  if (sort === 'title-asc') {
    return nextRows.sort((left, right) => String(left.title || '').localeCompare(String(right.title || ''), 'ko'))
  }
  return nextRows.sort((left, right) => updatedTime(right) - updatedTime(left))
}


export const createWorkspacePageIndexTagOptions = (rows, limit = 20) => {
  const tagCounts = new Map()
  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    ;(Array.isArray(row.tags) ? row.tags : []).forEach((tag) => {
      const normalizedTag = String(tag || '').trim()
      if (!normalizedTag) return
      const tagKey = normalizedTag.toLowerCase()
      const previous = tagCounts.get(tagKey) || { id: tagKey, label: normalizedTag, count: 0 }
      previous.count += 1
      tagCounts.set(tagKey, previous)
    })
  })

  return [...tagCounts.values()]
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count
      return left.label.localeCompare(right.label, 'ko')
    })
    .slice(0, limit)
}

export const createWorkspacePageIndexOwnerFilterOptions = (rows, options = {}) => {
  const ownerCounts = new Map()
  const unassignedLabel = options.unassignedLabel || '\uBBF8\uBC30\uC815'
  let unassignedCount = 0

  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    const ownerEmail = String(row.ownerEmail || '').trim()
    if (!ownerEmail) {
      unassignedCount += 1
      return
    }
    const ownerKey = ownerEmail.toLowerCase()
    const previous = ownerCounts.get(ownerKey) || {
      id: ownerKey,
      email: ownerEmail,
      label: row.ownerName || ownerEmail,
      count: 0,
    }
    previous.count += 1
    previous.label = previous.label || row.ownerName || ownerEmail
    ownerCounts.set(ownerKey, previous)
  })

  return [
    ...(unassignedCount > 0
      ? [{ id: '__unassigned__', email: '', label: unassignedLabel, count: unassignedCount }]
      : []),
    ...[...ownerCounts.values()].sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count
      return left.label.localeCompare(right.label, 'ko')
    }),
  ]
}
export const createWorkspacePageIndexOwnerOptions = (ownerCandidates = [], row = {}) => {
  const options = new Map()
  ;(Array.isArray(ownerCandidates) ? ownerCandidates : []).forEach((candidate) => {
    const email = String(candidate?.email || '').trim()
    if (!email) return
    options.set(email.toLowerCase(), {
      email,
      name: candidate.name || email,
    })
  })

  const rowEmail = String(row?.ownerEmail || '').trim()
  if (rowEmail && !options.has(rowEmail.toLowerCase())) {
    options.set(rowEmail.toLowerCase(), {
      email: rowEmail,
      name: row.ownerName || rowEmail,
    })
  }

  return [...options.values()]
}
export const filterWorkspacePageIndexRows = (rows, options = {}) => {
  const filter = String(options.filter || 'all')
  const query = String(options.query || '').trim().toLowerCase()
  const tagFilter = String(options.tagFilter || '').trim().toLowerCase()
  const ownerFilter = String(options.ownerFilter || '').trim().toLowerCase()
  let filteredRows = Array.isArray(rows) ? rows : []

  if (filter === 'active') {
    filteredRows = filteredRows.filter((row) => row.status === 'active')
  }
  if (filter === 'blocked') {
    filteredRows = filteredRows.filter((row) => row.status === 'blocked')
  }
  if (filter === 'overdue') {
    filteredRows = filteredRows.filter((row) => row.isOverdue)
  }
  if (filter === 'shared') {
    filteredRows = filteredRows.filter((row) => row.scope === 'shared')
  }
  if (tagFilter) {
    filteredRows = filteredRows.filter((row) =>
      (Array.isArray(row.tags) ? row.tags : []).some((tag) => String(tag).toLowerCase() === tagFilter),
    )
  }
  if (ownerFilter === '__unassigned__') {
    filteredRows = filteredRows.filter((row) => !row.ownerEmail)
  } else if (ownerFilter) {
    filteredRows = filteredRows.filter((row) => String(row.ownerEmail || '').toLowerCase() === ownerFilter)
  }

  return sortWorkspacePageIndexRows(
    filteredRows.filter((row) => matchesWorkspacePageIndexQuery(row, query)),
    options.sort,
    options.priorityOptions,
  )
}
export const workspacePageIndexRowId = (row = {}) => {
  const id = row?.id
  return id == null || id === '' ? '' : String(id)
}

const normalizeWorkspacePageIndexIdList = (ids = []) =>
  (Array.isArray(ids) ? ids : [])
    .map((id) => String(id || ''))
    .filter(Boolean)

export const isWorkspacePageIndexRowBusy = (row = {}, busyIds = []) => {
  const id = workspacePageIndexRowId(row)
  return Boolean(id && normalizeWorkspacePageIndexIdList(busyIds).includes(id))
}

export const setWorkspacePageIndexRowBusyIds = (busyIds = [], row = {}, busy = false) => {
  const id = workspacePageIndexRowId(row)
  const currentIds = normalizeWorkspacePageIndexIdList(busyIds)
  if (!id) return currentIds
  return busy
    ? [...new Set([...currentIds, id])]
    : currentIds.filter((item) => item !== id)
}

export const isWorkspacePageIndexRowSelected = (row = {}, selectedIds = []) => {
  const id = workspacePageIndexRowId(row)
  return Boolean(id && normalizeWorkspacePageIndexIdList(selectedIds).includes(id))
}

export const toggleWorkspacePageIndexSelectedIds = (selectedIds = [], row = {}, checked = false) => {
  const id = workspacePageIndexRowId(row)
  const currentIds = normalizeWorkspacePageIndexIdList(selectedIds)
  if (!id || !row?.canEditProperties) return currentIds
  return checked
    ? [...new Set([...currentIds, id])]
    : currentIds.filter((item) => item !== id)
}

export const toggleVisibleWorkspacePageIndexSelectedIds = (selectedIds = [], rows = [], checked = false) => {
  const currentIds = normalizeWorkspacePageIndexIdList(selectedIds)
  const visibleIds = (Array.isArray(rows) ? rows : [])
    .map(workspacePageIndexRowId)
    .filter(Boolean)
  if (checked) return [...new Set([...currentIds, ...visibleIds])]
  const visibleIdSet = new Set(visibleIds)
  return currentIds.filter((id) => !visibleIdSet.has(id))
}

export const createWorkspacePageIndexBulkPatch = ({
  status = '',
  priority = '',
  ownerEmail = '',
  dueDate = '',
  clearDueDate = false,
  ownerCandidates = [],
} = {}) => {
  const patch = {}
  if (status) patch.status = status
  if (priority) patch.priority = priority
  if (ownerEmail === '__none__') {
    patch.ownerEmail = ''
    patch.ownerName = ''
  } else if (ownerEmail) {
    const owner = (Array.isArray(ownerCandidates) ? ownerCandidates : []).find(
      (candidate) => String(candidate.email || '').toLowerCase() === String(ownerEmail).toLowerCase(),
    )
    patch.ownerEmail = ownerEmail
    patch.ownerName = owner?.name || ownerEmail
  }
  if (clearDueDate) {
    patch.dueDate = ''
  } else if (dueDate) {
    patch.dueDate = dueDate
  }
  return patch
}

export const findWorkspacePageIndexRowById = (rows = [], rowId = '') => {
  const id = String(rowId || '')
  if (!id) return null
  return (Array.isArray(rows) ? rows : []).find((row) => workspacePageIndexRowId(row) === id) || null
}

export const workspacePageIndexNextStatusId = (row = {}, direction = 0, statusOptions = []) => {
  const options = Array.isArray(statusOptions) ? statusOptions : []
  const currentIndex = options.findIndex((option) => option?.id === row?.status)
  if (currentIndex < 0) return ''
  return options[currentIndex + direction]?.id || ''
}