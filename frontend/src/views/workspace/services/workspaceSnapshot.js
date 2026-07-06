export const parseWorkspaceSnapshot = (contents) => {
  if (!contents) return { blocks: [] }
  if (typeof contents === 'object') {
    return Array.isArray(contents.blocks) ? contents : { blocks: [] }
  }

  try {
    let parsed = JSON.parse(String(contents))
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed)
    }
    return Array.isArray(parsed?.blocks) ? parsed : { blocks: [] }
  } catch {
    return { blocks: [] }
  }
}

export const parseWorkspaceSnapshotWithMeta = (contents) => {
  if (!contents) return { blocks: [], meta: {} }
  if (typeof contents === 'object') {
    return {
      ...(Array.isArray(contents.blocks) ? contents : { blocks: [] }),
      meta: contents.meta || {},
    }
  }

  try {
    let parsed = JSON.parse(String(contents))
    if (typeof parsed === 'string') parsed = JSON.parse(parsed)
    if (!parsed || typeof parsed !== 'object') return { blocks: [], meta: {} }
    return {
      ...(Array.isArray(parsed.blocks) ? parsed : { blocks: [] }),
      meta: parsed.meta || {},
    }
  } catch {
    return { blocks: [], meta: {} }
  }
}

export const normalizeWorkspaceTaskPath = (task = {}) => {
  if (Array.isArray(task.path)) {
    return task.path.map((index) => Number(index)).filter((index) => Number.isInteger(index) && index >= 0)
  }
  return String(task.pathLabel || '')
    .split('.')
    .map((index) => Number(index) - 1)
    .filter((index) => Number.isInteger(index) && index >= 0)
}

export const resolveWorkspaceSnapshotTaskItem = (blocks = [], task = {}) => {
  const path = normalizeWorkspaceTaskPath(task)
  if (!path.length) return null

  const anchorId = String(task.anchorBlockId || '').trim()
  const hintedBlockIndex = Number(task.blockIndex)
  const blockIndex = Number.isInteger(hintedBlockIndex)
    && hintedBlockIndex >= 0
    && String(blocks[hintedBlockIndex]?.id || `index-${hintedBlockIndex}`) === anchorId
    ? hintedBlockIndex
    : blocks.findIndex((block, index) => String(block?.id || `index-${index}`) === anchorId)

  if (blockIndex < 0) return null

  const block = blocks[blockIndex]
  const style = String(block?.data?.style || '').toLowerCase()
  if (block?.type !== 'list' || style !== 'checklist' || !Array.isArray(block.data?.items)) return null

  let currentItems = block.data.items
  let item = null
  for (const index of path) {
    item = currentItems?.[index]
    if (!item) return null
    currentItems = Array.isArray(item.items) ? item.items : []
  }

  return item
}

export const decodeWorkspacePathSegment = (value) => {
  try {
    return decodeURIComponent(String(value || ''))
  } catch {
    return String(value || '')
  }
}

export const collectWorkspaceSnapshotLinkIds = (value) => {
  const ids = new Set()
  const visit = (source) => {
    if (source == null) return
    if (Array.isArray(source)) {
      source.forEach(visit)
      return
    }
    if (typeof source === 'object') {
      Object.values(source).forEach(visit)
      return
    }
    if (typeof source !== 'string') return

    const dataIdRegex = /\bdata-workspace-page-id=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi
    let dataIdMatch = dataIdRegex.exec(source)
    while (dataIdMatch) {
      const id = dataIdMatch[1] || dataIdMatch[2] || dataIdMatch[3]
      if (id) ids.add(String(id))
      dataIdMatch = dataIdRegex.exec(source)
    }

    const readPathRegex = /\/workspace\/read\/([^"'<>\s?#/]+)/gi
    let pathMatch = readPathRegex.exec(source)
    while (pathMatch) {
      if (pathMatch[1]) ids.add(decodeWorkspacePathSegment(pathMatch[1]))
      pathMatch = readPathRegex.exec(source)
    }
  }

  visit(value)
  return ids
}

export const buildWorkspaceSearchSnippet = (text, query) => {
  const normalizedText = String(text || '').replace(/\s+/g, ' ').trim()
  if (!normalizedText) return ''
  const normalizedQuery = String(query || '').trim().toLowerCase()
  const index = normalizedText.toLowerCase().indexOf(normalizedQuery)
  if (index < 0) return normalizedText.slice(0, 160)
  const start = Math.max(0, index - 54)
  const end = Math.min(normalizedText.length, index + normalizedQuery.length + 90)
  return `${start > 0 ? '...' : ''}${normalizedText.slice(start, end)}${end < normalizedText.length ? '...' : ''}`
}
