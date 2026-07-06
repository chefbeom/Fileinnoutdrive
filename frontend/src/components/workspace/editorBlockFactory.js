import { safeString, clampNumber } from './editorIdentity.js'
import { escapeHtml, stripBlockText } from './editorDocumentAnalysis.js'

export const normalizeChecklistTaskInput = (input) => {
  if (input && typeof input === 'object') {
    return {
      text: input.text,
      assigneeEmail: safeString(input.assigneeEmail),
      assigneeName: safeString(input.assigneeName),
      dueDate: safeString(input.dueDate),
    }
  }
  return { text: input, assigneeEmail: '', assigneeName: '', dueDate: '' }
}

export const createChecklistTaskItem = (input) => {
  const normalizedInput = normalizeChecklistTaskInput(input)
  const content = stripBlockText(normalizedInput.text).slice(0, 255)
  if (!content) return null

  return {
    content,
    meta: {
      checked: false,
      ...(normalizedInput.assigneeEmail ? { assigneeEmail: normalizedInput.assigneeEmail } : {}),
      ...(normalizedInput.assigneeName ? { assigneeName: normalizedInput.assigneeName } : {}),
      ...(normalizedInput.dueDate ? { dueDate: normalizedInput.dueDate } : {}),
    },
    items: [],
  }
}

export const normalizeWorkspacePageLinkInput = (input = {}) => {
  const rawId = input.id ?? input.idx ?? input.post_idx
  const id = rawId == null ? '' : safeString(String(rawId))
  const title = stripBlockText(input.title || '제목 없음').slice(0, 160) || '제목 없음'
  const path = safeString(input.path || (id ? `/workspace/read/${encodeURIComponent(id)}` : ''))
  return { id, title, path }
}

export const createWorkspaceBlockId = (prefix = 'block') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const normalizeWorkspaceBlockInput = (input = {}) => {
  const type = safeString(input.type || 'paragraph').toLowerCase()
  const text = stripBlockText(input.text || input.title || '').slice(0, 500)
  const level = clampNumber(input.level || 2, 1, 4)
  return { type, text, level }
}

export const buildWorkspaceQuickBlock = (input = {}) => {
  const normalized = normalizeWorkspaceBlockInput(input)
  const text = escapeHtml(normalized.text)
  const id = createWorkspaceBlockId(`quick-${normalized.type}`)

  if (normalized.type === 'header') {
    return {
      id,
      type: 'header',
      data: { text: text || '새 제목', level: normalized.level },
    }
  }

  if (normalized.type === 'checklist') {
    return {
      id,
      type: 'list',
      data: {
        style: 'checklist',
        items: [{
          content: text || '새 작업',
          meta: { checked: false },
          items: [],
        }],
      },
    }
  }

  if (normalized.type === 'quote') {
    return {
      id,
      type: 'quote',
      data: { text: text || '인용문', caption: '' },
    }
  }

  if (normalized.type === 'warning') {
    return {
      id,
      type: 'warning',
      data: { title: text || '주의', message: '내용을 입력하세요.' },
    }
  }

  if (normalized.type === 'delimiter') {
    return { id, type: 'delimiter', data: {} }
  }

  if (normalized.type === 'table') {
    return {
      id,
      type: 'table',
      data: {
        withHeadings: true,
        content: [
          ['항목', '내용'],
          ['', ''],
        ],
      },
    }
  }

  return {
    id,
    type: 'paragraph',
    data: { text: text || '새 문단' },
  }
}

export const buildWorkspacePageLinkBlock = (input = {}) => {
  const link = normalizeWorkspacePageLinkInput(input)
  if (!link.id || !link.path) return null

  return {
    id: createWorkspaceBlockId('workspace-link'),
    type: 'paragraph',
    data: {
      text: `<a href="${escapeHtml(link.path)}" data-workspace-page-id="${escapeHtml(link.id)}">↗ ${escapeHtml(link.title)}</a>`,
    },
  }
}