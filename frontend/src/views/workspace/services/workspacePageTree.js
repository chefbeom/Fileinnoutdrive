const normalizeRows = (rows) => (Array.isArray(rows) ? rows.filter((row) => row?.id != null) : [])

export const normalizeWorkspaceLinkText = (value) =>
  String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()

export const compareWorkspacePageTreeRows = (left, right) => {
  const titleCompare = String(left.title || '').localeCompare(String(right.title || ''), 'ko')
  if (titleCompare !== 0) return titleCompare
  return String(left.id || '').localeCompare(String(right.id || ''))
}

export const buildWorkspacePageTreeRoots = (rows = [], currentDocumentId = '') => {
  const sortedRows = normalizeRows(rows).slice().sort(compareWorkspacePageTreeRows)
  const currentId = String(currentDocumentId || '')
  const rowById = new Map(sortedRows.map((row) => [String(row.id), row]))
  const childrenByParent = new Map()

  sortedRows.forEach((row) => {
    const rowId = String(row.id)
    const parentId = String(row.parentWorkspaceId || '').trim()
    if (!parentId || parentId === rowId || !rowById.has(parentId)) return
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, [])
    childrenByParent.get(parentId).push(row)
  })
  childrenByParent.forEach((children) => children.sort(compareWorkspacePageTreeRows))

  const visitedIds = new Set()
  const buildNode = (row, depth = 0, ancestors = new Set()) => {
    const rowId = String(row.id)
    visitedIds.add(rowId)
    if (ancestors.has(rowId)) {
      return {
        ...row,
        treeDepth: depth,
        children: [],
        childCount: 0,
        isCurrentDocument: rowId === currentId,
      }
    }

    const nextAncestors = new Set(ancestors)
    nextAncestors.add(rowId)
    const children = (childrenByParent.get(rowId) || []).map((child) =>
      buildNode(child, depth + 1, nextAncestors),
    )
    return {
      ...row,
      treeDepth: depth,
      children,
      childCount: children.length,
      isCurrentDocument: rowId === currentId,
    }
  }

  const roots = sortedRows
    .filter((row) => {
      const rowId = String(row.id)
      const parentId = String(row.parentWorkspaceId || '').trim()
      return !parentId || parentId === rowId || !rowById.has(parentId)
    })
    .map((row) => buildNode(row))

  const detachedRoots = sortedRows
    .filter((row) => !visitedIds.has(String(row.id)))
    .map((row) => buildNode(row))

  return [...roots, ...detachedRoots]
}

export const flattenWorkspacePageTreeRows = (nodes = [], collapsedIds = null) => {
  const collapsedIdSet = collapsedIds
    ? new Set([...collapsedIds].map((id) => String(id)))
    : null
  const rows = []
  const walk = (currentNodes) => {
    ;(Array.isArray(currentNodes) ? currentNodes : []).forEach((node) => {
      rows.push(node)
      if (!collapsedIdSet?.has(String(node.id))) {
        walk(node.children)
      }
    })
  }
  walk(nodes)
  return rows
}

export const collectWorkspacePageTreeDescendantIds = (node, descendants = new Set()) => {
  ;(node?.children || []).forEach((child) => {
    const childId = String(child.id || '')
    if (!childId || descendants.has(childId)) return
    descendants.add(childId)
    collectWorkspacePageTreeDescendantIds(child, descendants)
  })
  return descendants
}

export const createWorkspaceTreeMoveTargetOptions = (node = {}, rows = []) => {
  const nodeId = String(node?.id || '')
  const blockedIds = collectWorkspacePageTreeDescendantIds(node)
  if (nodeId) blockedIds.add(nodeId)

  return [
    { id: '', title: 'Workspace root', treeDepth: 0 },
    ...normalizeRows(rows)
      .filter((row) => !blockedIds.has(String(row.id || '')))
      .map((row) => ({
        id: String(row.id),
        title: row.title || 'Untitled',
        treeDepth: row.treeDepth || 0,
      })),
  ]
}

export const canApplyWorkspaceTreeMoveTarget = (node = {}, {
  targetId = '',
  movingId = '',
  savingId = '',
} = {}) => {
  const nodeId = String(node?.id || '')
  if (!nodeId || !node.canEditProperties) return false
  if (String(movingId || '') !== nodeId) return false
  if (savingId) return false

  const normalizedTargetId = String(targetId || '')
  const currentParentId = String(node.parentWorkspaceId || '')
  if (normalizedTargetId === currentParentId) return false
  if (normalizedTargetId === nodeId) return false
  return !collectWorkspacePageTreeDescendantIds(node).has(normalizedTargetId)
}

export const workspacePageTreeSearchText = (node = {}) =>
  normalizeWorkspaceLinkText([
    node.title,
    node.scopeLabel,
    node.statusLabel,
    node.priorityLabel,
    node.ownerName,
    node.ownerEmail,
    node.parentWorkspaceTitle,
    ...(Array.isArray(node.tags) ? node.tags : []),
  ].join(' '))

export const filterWorkspacePageTreeNodes = (nodes = [], query = '') => {
  const normalizedQuery = normalizeWorkspaceLinkText(query)
  if (!normalizedQuery) return flattenWorkspacePageTreeRows(nodes)

  return (Array.isArray(nodes) ? nodes : []).flatMap((node) => {
    const childRows = filterWorkspacePageTreeNodes(node.children || [], normalizedQuery)
    const treeMatchesQuery = workspacePageTreeSearchText(node).includes(normalizedQuery)
    if (!treeMatchesQuery && childRows.length === 0) return []
    return [{ ...node, treeMatchesQuery }, ...childRows]
  })
}

export const workspacePageTreeEmptyLabel = ({ rowCount = 0, query = '' } = {}) => {
  if (Number(rowCount) === 0) return '페이지가 없습니다.'
  if (String(query || '').trim()) return '검색 조건에 맞는 페이지가 없습니다.'
  return '표시할 페이지가 없습니다.'
}