export const blockTypeLabels = Object.freeze({
  header: '제목',
  paragraph: '문단',
  list: '목록',
  quote: '인용',
  table: '표',
  code: '코드',
  image: '이미지',
  embed: '임베드',
  delimiter: '구분선',
  warning: '경고',
  youtube: 'YouTube',
})

export const stripBlockText = (value) =>
  String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const collectBlockText = (value) => {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') {
    return stripBlockText(value)
  }
  if (Array.isArray(value)) {
    return value.map(collectBlockText).filter(Boolean).join(' ')
  }
  if (typeof value === 'object') {
    return ['text', 'caption', 'title', 'message', 'code', 'items', 'content']
      .map((key) => collectBlockText(value[key]))
      .filter(Boolean)
      .join(' ')
  }
  return ''
}

export const extractWorkspaceReadPathId = (value) => {
  const match = String(value || '').match(/\/workspace\/read\/([^"'<>\s?#/]+)/i)
  if (!match) return ''
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

export const blockAnchorFromSnapshot = (block, index) => {
  if (!block) return null
  const type = block.type || 'block'
  const rawText = collectBlockText(block.data)
  return {
    anchorBlockId: block.id || `index-${index}`,
    anchorBlockType: type,
    anchorText: (rawText || `${blockTypeLabels[type] || '블록'} 블록`).slice(0, 255),
  }
}

export const collectWorkspacePageLinks = (value, block, blockIndex) => {
  if (value == null) return []
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectWorkspacePageLinks(item, block, blockIndex))
  }
  if (typeof value === 'object') {
    return Object.values(value).flatMap((item) => collectWorkspacePageLinks(item, block, blockIndex))
  }
  if (typeof value !== 'string') return []

  const links = []
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let anchorMatch = anchorRegex.exec(value)
  while (anchorMatch) {
    const attrs = anchorMatch[1] || ''
    const body = anchorMatch[2] || ''
    const idMatch = attrs.match(/\bdata-workspace-page-id=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i)
    const hrefMatch = attrs.match(/\bhref=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i)
    const href = hrefMatch?.[1] || hrefMatch?.[2] || hrefMatch?.[3] || ''
    const documentId = idMatch?.[1] || idMatch?.[2] || idMatch?.[3] || extractWorkspaceReadPathId(href)
    if (documentId) {
      const anchor = blockAnchorFromSnapshot(block, blockIndex)
      links.push({
        documentId: String(documentId),
        title: stripBlockText(body).replace(/^↗\s*/, '').slice(0, 160),
        path: href || `/workspace/read/${encodeURIComponent(String(documentId))}`,
        anchorBlockId: anchor?.anchorBlockId || '',
        anchorText: anchor?.anchorText || '',
        blockIndex,
        source: idMatch ? 'explicit' : 'path',
      })
    }
    anchorMatch = anchorRegex.exec(value)
  }

  const pathRegex = /\/workspace\/read\/([^"'<>\s?#/]+)/gi
  let pathMatch = pathRegex.exec(value)
  while (pathMatch) {
    let documentId = pathMatch[1]
    try {
      documentId = decodeURIComponent(documentId)
    } catch {
      // Keep the raw id when a pasted URL contains malformed escaping.
    }
    if (documentId && !links.some((link) => String(link.documentId) === String(documentId))) {
      const anchor = blockAnchorFromSnapshot(block, blockIndex)
      links.push({
        documentId: String(documentId),
        title: '',
        path: `/workspace/read/${encodeURIComponent(String(documentId))}`,
        anchorBlockId: anchor?.anchorBlockId || '',
        anchorText: anchor?.anchorText || '',
        blockIndex,
        source: 'path',
      })
    }
    pathMatch = pathRegex.exec(value)
  }

  return links
}

export const createDocumentOutline = (blocks = []) =>
  (blocks || [])
    .map((block, index) => {
      if (block?.type !== 'header') return null
      const text = collectBlockText(block.data?.text || block.data)
      if (!text) return null
      const level = Math.min(4, Math.max(1, Number(block.data?.level || 1)))
      return {
        id: block.id || `index-${index}`,
        anchorBlockId: block.id || `index-${index}`,
        anchorBlockType: 'header',
        anchorText: text.slice(0, 255),
        level,
        index,
      }
    })
    .filter(Boolean)

export const collectChecklistTasks = (items = [], block, blockIndex, path = []) => {
  if (!Array.isArray(items)) return []
  const anchorBlockId = block?.id || `index-${blockIndex}`
  return items.flatMap((item, itemIndex) => {
    const currentPath = [...path, itemIndex]
    const nestedItems = Array.isArray(item?.items) ? item.items : []
    const text = collectBlockText(item?.content ?? item?.text ?? item?.label ?? item?.data?.text)
    const meta = item?.meta || {}
    const task = text
      ? [{
          id: `${anchorBlockId}:${currentPath.join('.')}`,
          anchorBlockId,
          anchorBlockType: 'list',
          anchorText: text.slice(0, 255),
          text,
          checked: Boolean(meta.checked ?? item?.checked ?? item?.data?.checked),
          assigneeEmail: String(meta.assigneeEmail || '').trim(),
          assigneeName: String(meta.assigneeName || meta.assigneeEmail || '').trim(),
          dueDate: String(meta.dueDate || '').trim(),
          depth: Math.max(0, currentPath.length - 1),
          blockIndex,
          path: currentPath,
          pathLabel: currentPath.map((index) => index + 1).join('.'),
        }]
      : []

    return [
      ...task,
      ...collectChecklistTasks(nestedItems, block, blockIndex, currentPath),
    ]
  })
}

export const createDocumentTasks = (blocks = []) =>
  (blocks || []).flatMap((block, index) => {
    const style = String(block?.data?.style || '').toLowerCase()
    if (block?.type !== 'list' || style !== 'checklist') return []
    return collectChecklistTasks(block.data?.items || [], block, index)
  })

export const countWorkspaceWords = (text) => {
  const normalized = stripBlockText(text)
  if (!normalized) return 0
  return normalized.split(/\s+/).filter(Boolean).length
}

export const createDocumentStats = (blocks = []) => {
  const stats = {
    blockCount: 0,
    textBlockCount: 0,
    characterCount: 0,
    wordCount: 0,
    imageCount: 0,
    checklistBlockCount: 0,
  }
  const searchParts = []
  const workspaceLinkMap = new Map()

  ;(Array.isArray(blocks) ? blocks : []).forEach((block, blockIndex) => {
    const type = String(block?.type || 'paragraph').toLowerCase()
    const style = String(block?.data?.style || '').toLowerCase()
    const text = collectBlockText(block?.data)

    stats.blockCount += 1
    if (text) {
      stats.textBlockCount += 1
      stats.characterCount += text.length
      stats.wordCount += countWorkspaceWords(text)
      searchParts.push(text)
    }
    if (type === 'image') stats.imageCount += 1
    if (type === 'list' && style === 'checklist') stats.checklistBlockCount += 1

    collectWorkspacePageLinks(block?.data, block, blockIndex).forEach((link) => {
      const key = `${link.documentId}:${link.anchorBlockId || blockIndex}`
      if (!workspaceLinkMap.has(key)) {
        workspaceLinkMap.set(key, link)
      }
    })
  })

  return {
    stats,
    searchText: searchParts.join(' ').replace(/\s+/g, ' ').trim(),
    workspaceLinks: [...workspaceLinkMap.values()].slice(0, 48),
  }
}