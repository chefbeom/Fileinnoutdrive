const DEFAULT_MARKDOWN_LABELS = Object.freeze({
  emptyTitle: '\uC81C\uBAA9 \uC5C6\uC74C',
  status: '\uC0C1\uD0DC',
  priority: '\uC6B0\uC120\uC21C\uC704',
  owner: '\uB2F4\uB2F9\uC790',
  dueDate: '\uAE30\uD55C',
  tags: '\uD0DC\uADF8',
})

const resolveMarkdownLabels = (labels = {}) => ({
  ...DEFAULT_MARKDOWN_LABELS,
  ...labels,
})

export const stripWorkspaceSnapshotText = (value) =>
  String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const collectWorkspaceSnapshotText = (value) => {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return stripWorkspaceSnapshotText(value)
  if (Array.isArray(value)) return value.map(collectWorkspaceSnapshotText).filter(Boolean).join(' ')
  if (typeof value === 'object') {
    return Object.values(value).map(collectWorkspaceSnapshotText).filter(Boolean).join(' ')
  }
  return ''
}

export const workspaceMarkdownEscape = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/([*_`#\[\]])/g, '\\$1')

const decodeWorkspaceMarkdownInlineHtml = (value) =>
  String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

export const workspaceMarkdownInline = (value) => {
  const source = decodeWorkspaceMarkdownInlineHtml(value)
  return source
    .replace(/<a\b[^>]*href=(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>(.*?)<\/a>/gi, (_match, hrefA, hrefB, hrefC, label) => {
      const href = hrefA || hrefB || hrefC || ''
      return `[${workspaceMarkdownEscape(stripWorkspaceSnapshotText(label))}](${href})`
    })
    .replace(/<[^>]*>/g, '')
    .replace(/\s+\n/g, '\n')
    .trim()
}

const hasChecklistState = (item = {}) =>
  Object.prototype.hasOwnProperty.call(item?.meta || {}, 'checked') ||
  Object.prototype.hasOwnProperty.call(item || {}, 'checked') ||
  Object.prototype.hasOwnProperty.call(item?.data || {}, 'checked')

export const workspaceMarkdownListItems = (items = [], depth = 0) =>
  (Array.isArray(items) ? items : [])
    .flatMap((item) => {
      const text = workspaceMarkdownInline(item?.content ?? item?.text ?? item?.label ?? item?.data?.text)
      const checked = Boolean(item?.meta?.checked ?? item?.checked ?? item?.data?.checked)
      const prefix = `${'  '.repeat(depth)}- ${hasChecklistState(item) ? `[${checked ? 'x' : ' '}] ` : ''}`
      const childText = workspaceMarkdownListItems(item?.items || [], depth + 1)
      return [
        text ? `${prefix}${text}` : '',
        childText,
      ].filter(Boolean)
    })
    .join('\n')

const escapeWorkspaceMarkdownTableCell = (value) =>
  workspaceMarkdownInline(value).replace(/\|/g, '\\|').replace(/\n+/g, '<br>')

export const workspaceSnapshotBlockToMarkdown = (block = {}) => {
  const data = block.data || {}
  if (block.type === 'header') {
    const level = Math.min(6, Math.max(1, Number(data.level || 2)))
    return `${'#'.repeat(level)} ${workspaceMarkdownInline(data.text)}`
  }
  if (block.type === 'paragraph') return workspaceMarkdownInline(data.text)
  if (block.type === 'quote') return `> ${workspaceMarkdownInline(data.text || data.caption)}`
  if (block.type === 'warning') {
    const titleText = workspaceMarkdownInline(data.title)
    const messageText = workspaceMarkdownInline(data.message)
    return [`> [!NOTE]${titleText ? ` ${titleText}` : ''}`, messageText ? `> ${messageText}` : ''].filter(Boolean).join('\n')
  }
  if (block.type === 'code') return `\`\`\`\n${String(data.code || '')}\n\`\`\``
  if (block.type === 'delimiter') return '---'
  if (block.type === 'list') return workspaceMarkdownListItems(data.items || [])
  if (block.type === 'table') {
    const rows = Array.isArray(data.content) ? data.content : []
    if (rows.length === 0) return ''
    const normalizedRows = rows.map((row) => (Array.isArray(row) ? row : []).map(escapeWorkspaceMarkdownTableCell))
    const header = normalizedRows[0]
    const divider = header.map(() => '---')
    return [header, divider, ...normalizedRows.slice(1)]
      .map((row) => `| ${row.join(' | ')} |`)
      .join('\n')
  }
  if (block.type === 'image') {
    const caption = workspaceMarkdownInline(data.caption || data.file?.originalName || 'image')
    const url = data.file?.url || data.file?.previewUrl || data.file?.downloadUrl || ''
    return url ? `![${caption}](${url})` : caption
  }
  if (block.type === 'embed') return data.source || data.embed || ''
  return collectWorkspaceSnapshotText(data)
}

export const buildWorkspaceMarkdownExport = (snapshot = {}, options = {}) => {
  const {
    pageTitle = '',
    statusLabel = '',
    priorityLabel = '',
    ownerLabel = '',
    dueDate = '',
    tags = [],
    labels = {},
  } = typeof options === 'string' ? { pageTitle: options } : options
  const resolvedLabels = resolveMarkdownLabels(labels)
  const blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : []
  const body = blocks
    .map(workspaceSnapshotBlockToMarkdown)
    .map((blockText) => String(blockText || '').trim())
    .filter(Boolean)
    .join('\n\n')
  const titleText = workspaceMarkdownInline(pageTitle || resolvedLabels.emptyTitle) || resolvedLabels.emptyTitle
  const normalizedTags = Array.isArray(tags) ? tags.filter(Boolean) : []
  const properties = [
    statusLabel ? `- ${resolvedLabels.status}: ${statusLabel}` : '',
    priorityLabel ? `- ${resolvedLabels.priority}: ${priorityLabel}` : '',
    ownerLabel ? `- ${resolvedLabels.owner}: ${ownerLabel}` : '',
    dueDate ? `- ${resolvedLabels.dueDate}: ${dueDate}` : '',
    normalizedTags.length ? `- ${resolvedLabels.tags}: ${normalizedTags.map((tag) => `#${tag}`).join(' ')}` : '',
  ].filter(Boolean)
  return [
    `# ${titleText}`,
    properties.length ? properties.join('\n') : '',
    body,
  ].filter(Boolean).join('\n\n')
}

export const workspaceExportFileName = (pageTitle = 'workspace-page') => {
  const safeTitle = String(pageTitle || 'workspace-page')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'workspace-page'
  return `${safeTitle}.md`
}

export const downloadWorkspaceMarkdown = (markdown, fileName) => {
  if (typeof window === 'undefined' || typeof Blob === 'undefined') return
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
