import { formatDateTime } from './workspacePresentation.js'

const DEFAULT_WORKSPACE_REVISION_DIFF_LABELS = Object.freeze({
  emptyTitle: 'Untitled',
  blockSuffix: 'block',
  truncationSuffix: '...',
})

const defaultBlockTypeLabel = (type) => type || 'block'

const resolveLabels = (labels = {}) => ({
  ...DEFAULT_WORKSPACE_REVISION_DIFF_LABELS,
  ...labels,
})

export const stableWorkspaceStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(stableWorkspaceStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableWorkspaceStringify(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

export const stripWorkspaceText = (value) =>
  String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const flattenWorkspaceListItems = (items = []) =>
  (Array.isArray(items) ? items : [])
    .flatMap((item) => {
      if (typeof item === 'string') return [item]
      const children = item?.items || item?.children || []
      return [item?.content || item?.text || '', ...flattenWorkspaceListItems(children)]
    })
    .filter(Boolean)

export const workspaceBlockPreviewText = (
  block = {},
  { blockTypeLabel = defaultBlockTypeLabel, labels = {}, maxLength = 96 } = {},
) => {
  const resolvedLabels = resolveLabels(labels)
  const data = block.data || {}
  const candidates = [
    data.text,
    data.caption,
    data.title,
    data.message,
    data.code,
    data.url,
    data.file?.name,
    data.file?.originalName,
    ...flattenWorkspaceListItems(data.items),
  ]
  const text = stripWorkspaceText(candidates.find((candidate) => stripWorkspaceText(candidate)) || '')
  if (text) {
    if (text.length <= maxLength) return text
    const suffix = resolvedLabels.truncationSuffix
    return `${text.slice(0, Math.max(0, maxLength - suffix.length))}${suffix}`
  }
  return `${blockTypeLabel(block.type)} ${resolvedLabels.blockSuffix}`.trim()
}

export const workspaceBlockDiffKey = (block, index) =>
  block?.id ? `id:${block.id}` : `index:${index}`

export const workspaceBlockSignature = (block = {}) =>
  stableWorkspaceStringify({
    type: block.type || '',
    data: block.data || {},
  })

export const normalizeWorkspaceRevision = (revision = {}, { workspaceId = null } = {}) => ({
  id: revision.idx ?? revision.id ?? null,
  workspaceId: revision.workspaceIdx ?? revision.workspaceId ?? workspaceId,
  actorIdx: revision.actorIdx ?? null,
  actorName: revision.actorName || revision.actorEmail || '알 수 없는 사용자',
  actorEmail: revision.actorEmail || '',
  title: revision.title || '제목 없음',
  contents: revision.contents ?? null,
  reason: String(revision.reason || 'SAVE').toUpperCase(),
  contentLength: Number(revision.contentLength || revision.contents?.length || 0),
  createdAt: revision.createdAt || null,
  createdAtLabel: formatDateTime(revision.createdAt),
})

export const normalizeWorkspaceDiffBlock = (
  entry,
  counterpart = null,
  { blockTypeLabel = defaultBlockTypeLabel, labels = {} } = {},
) => ({
  key: entry.key,
  type: entry.block?.type || counterpart?.block?.type || '',
  typeLabel: blockTypeLabel(entry.block?.type || counterpart?.block?.type),
  preview: workspaceBlockPreviewText(entry.block || counterpart?.block, { blockTypeLabel, labels }),
  previousPreview: counterpart
    ? workspaceBlockPreviewText(counterpart.block, { blockTypeLabel, labels })
    : '',
})

export const buildWorkspaceRevisionDiffSnapshot = ({
  revision = {},
  targetSnapshot = {},
  currentSnapshot = {},
  currentTitle = '',
  blockTypeLabel = defaultBlockTypeLabel,
  labels = {},
} = {}) => {
  const resolvedLabels = resolveLabels(labels)
  const targetBlocks = Array.isArray(targetSnapshot.blocks) ? targetSnapshot.blocks : []
  const currentBlocks = Array.isArray(currentSnapshot.blocks) ? currentSnapshot.blocks : []
  const currentEntries = currentBlocks.map((block, index) => ({
    key: workspaceBlockDiffKey(block, index),
    block,
    signature: workspaceBlockSignature(block),
  }))
  const targetEntries = targetBlocks.map((block, index) => ({
    key: workspaceBlockDiffKey(block, index),
    block,
    signature: workspaceBlockSignature(block),
  }))
  const currentByKey = new Map(currentEntries.map((entry) => [entry.key, entry]))
  const targetByKey = new Map(targetEntries.map((entry) => [entry.key, entry]))

  const options = { blockTypeLabel, labels: resolvedLabels }
  const added = targetEntries
    .filter((entry) => !currentByKey.has(entry.key))
    .map((entry) => normalizeWorkspaceDiffBlock(entry, null, options))
  const removed = currentEntries
    .filter((entry) => !targetByKey.has(entry.key))
    .map((entry) => normalizeWorkspaceDiffBlock(entry, null, options))
  const changed = targetEntries
    .filter((entry) => {
      const current = currentByKey.get(entry.key)
      return current && current.signature !== entry.signature
    })
    .map((entry) => normalizeWorkspaceDiffBlock(entry, currentByKey.get(entry.key), options))

  return {
    titleChanged: String(revision?.title || '') !== String(currentTitle || ''),
    currentTitle: currentTitle || resolvedLabels.emptyTitle,
    targetTitle: revision?.title || resolvedLabels.emptyTitle,
    added,
    removed,
    changed,
    unchangedCount: targetEntries.length - added.length - changed.length,
  }
}
export const createWorkspaceRevisionDiffSummary = (diff = null) => {
  if (!diff) return []
  return [
    { id: 'added', label: '복구될 블록', count: Array.isArray(diff.added) ? diff.added.length : 0 },
    { id: 'changed', label: '변경될 블록', count: Array.isArray(diff.changed) ? diff.changed.length : 0 },
    { id: 'removed', label: '사라질 블록', count: Array.isArray(diff.removed) ? diff.removed.length : 0 },
  ]
}

export const createWorkspaceRevisionDiffItems = (diff = null, limit = 8) => {
  if (!diff) return []
  return [
    ...(Array.isArray(diff.changed) ? diff.changed.map((item) => ({ ...item, kind: 'changed', label: '변경' })) : []),
    ...(Array.isArray(diff.added) ? diff.added.map((item) => ({ ...item, kind: 'added', label: '복구' })) : []),
    ...(Array.isArray(diff.removed) ? diff.removed.map((item) => ({ ...item, kind: 'removed', label: '삭제' })) : []),
  ].slice(0, limit)
}
