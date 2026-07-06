export const createEmptyEditorSnapshot = () => ({ blocks: [] })

export const parseEditorSnapshot = (value, { onError } = {}) => {
  if (value == null || value === '') {
    return createEmptyEditorSnapshot()
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || trimmed === '""') {
      return createEmptyEditorSnapshot()
    }

    try {
      const parsed = JSON.parse(trimmed)
      return parsed && typeof parsed === 'object' ? parsed : createEmptyEditorSnapshot()
    } catch (error) {
      if (typeof onError === 'function') {
        onError(error)
      }
      return createEmptyEditorSnapshot()
    }
  }

  if (typeof value === 'object') {
    return value && typeof value === 'object' ? value : createEmptyEditorSnapshot()
  }

  return createEmptyEditorSnapshot()
}

export const parseInitialEditorSnapshot = (value, { onError } = {}) => {
  if (typeof value === 'string') {
    return parseEditorSnapshot(value, { onError })
  }

  if (value && typeof value === 'object' && Array.isArray(value.blocks)) {
    return value
  }

  return createEmptyEditorSnapshot()
}

export const createInitialEditorSnapshotState = (initialData, options = {}) => {
  const snapshot = parseInitialEditorSnapshot(initialData, options)
  const hasInitialBlocks = Array.isArray(snapshot.blocks) && snapshot.blocks.length > 0
  return {
    snapshot,
    hasInitialBlocks,
    contentsString: hasInitialBlocks ? JSON.stringify(snapshot) : '',
  }
}

export const withWorkspaceProperties = (snapshot = {}, {
  workspaceProperties = null,
  workspaceParent = null,
} = {}) => {
  const nextMeta = { ...(snapshot.meta || {}) }

  if (workspaceProperties && typeof workspaceProperties === 'object') {
    nextMeta.workspaceProperties = workspaceProperties
  }

  if (workspaceParent && typeof workspaceParent === 'object') {
    const parentId = String(workspaceParent.id || '').trim()
    nextMeta.parentWorkspaceId = parentId
    nextMeta.parentWorkspaceTitle = parentId ? String(workspaceParent.title || '').trim() : ''
  }

  return {
    ...snapshot,
    meta: nextMeta,
  }
}