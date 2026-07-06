import { parseWorkspaceSnapshotWithMeta } from './workspaceSnapshot.js'

const DEFAULT_PAGE_ICON = '\uD83D\uDCC4'

export const normalizeWorkspaceDocument = (item = {}, scope = 'personal') => ({
  id: item.post_idx ?? item.idx ?? item.id ?? null,
  title: item.title || '\uC81C\uBAA9 \uC5C6\uC74C',
  updatedAt: item.updatedAt || null,
  status: item.status || 'Private',
  role: item.level || item.accessRole || 'ADMIN',
  scope,
})

export const normalizeWorkspaceShareStatus = (status, type = false) => {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'public') return 'Public'
  if (normalized === 'shared') return 'Shared'
  if (normalized === 'private') return 'Private'
  return type ? 'Shared' : 'Private'
}

export const normalizeWorkspacePropertyOption = (value, options = [], fallback = '') => {
  const normalized = String(value || '').trim().toLowerCase()
  return (Array.isArray(options) ? options : []).some((option) => option?.id === normalized) ? normalized : fallback
}

export const normalizeWorkspacePropertyTags = (value) => {
  const source = Array.isArray(value)
    ? value
    : String(value || '')
      .split(',')
      .map((tag) => tag.trim())

  return [...new Set(source.filter(Boolean).map((tag) => String(tag).slice(0, 28)))].slice(0, 8)
}

export const normalizeWorkspacePageIcon = (value) => {
  const normalized = String(value || '').trim()
  return normalized ? [...normalized].slice(0, 2).join('') : DEFAULT_PAGE_ICON
}

export const normalizeWorkspaceCoverColor = (value, coverColorOptions = []) => {
  const options = Array.isArray(coverColorOptions) ? coverColorOptions : []
  const normalized = String(value || '').trim().toLowerCase()
  return options.some((option) => option?.id === normalized) ? normalized : options[0]?.id || ''
}

export const normalizeWorkspaceProperties = (properties = {}, options = {}) => ({
  icon: normalizeWorkspacePageIcon(properties.icon),
  coverColor: normalizeWorkspaceCoverColor(properties.coverColor, options.coverColorOptions),
  status: normalizeWorkspacePropertyOption(
    properties.status,
    options.statusOptions,
    options.statusFallback || 'planning',
  ),
  priority: normalizeWorkspacePropertyOption(
    properties.priority,
    options.priorityOptions,
    options.priorityFallback || 'normal',
  ),
  ownerEmail: String(properties.ownerEmail || '').trim(),
  ownerName: String(properties.ownerName || properties.ownerEmail || '').trim(),
  dueDate: String(properties.dueDate || '').trim(),
  tags: normalizeWorkspacePropertyTags(properties.tags),
  locked: Boolean(properties.locked || properties.pageLocked || properties.isLocked),
})

export const extractWorkspacePropertiesFromContents = (contents, options = {}) =>
  normalizeWorkspaceProperties(parseWorkspaceSnapshotWithMeta(contents).meta?.workspaceProperties, options)

export const extractWorkspaceParentFromContents = (contents) => {
  const meta = parseWorkspaceSnapshotWithMeta(contents).meta || {}
  const parentId = String(meta.parentWorkspaceId || '').trim()
  return {
    id: parentId,
    title: parentId ? String(meta.parentWorkspaceTitle || '').trim() : '',
  }
}

export const serializeWorkspaceSnapshotWithProperties = (contents, properties = {}, options = {}) => {
  const snapshot = parseWorkspaceSnapshotWithMeta(contents)
  return JSON.stringify({
    ...snapshot,
    meta: {
      ...(snapshot.meta || {}),
      workspaceProperties: normalizeWorkspaceProperties(properties, options),
    },
  })
}

export const serializeWorkspaceSnapshotWithParent = (contents, parent = {}) => {
  const snapshot = parseWorkspaceSnapshotWithMeta(contents)
  const parentId = String(parent.id || '').trim()
  return JSON.stringify({
    ...snapshot,
    meta: {
      ...(snapshot.meta || {}),
      parentWorkspaceId: parentId,
      parentWorkspaceTitle: parentId ? String(parent.title || '').trim() : '',
    },
  })
}