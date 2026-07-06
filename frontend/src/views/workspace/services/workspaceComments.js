import { workspaceActivityTimestamp } from './workspaceActivity.js'
import { extractWorkspaceMentionEmails } from './workspaceMentions.js'
import { formatDateTime } from './workspacePresentation.js'

const anchorIdOf = (anchor) => String(anchor?.anchorBlockId || '').trim()

export const normalizeWorkspaceComment = (comment = {}, { workspaceId = null } = {}) => {
  const createdAt = comment.createdAt || null
  const updatedAt = comment.updatedAt || null
  const createdTime = workspaceActivityTimestamp(createdAt)
  const updatedTime = workspaceActivityTimestamp(updatedAt)
  const isEdited = Boolean(createdTime && updatedTime && updatedTime > createdTime + 1000)

  return {
    id: comment.idx ?? comment.id ?? null,
    workspaceId: comment.workspaceIdx ?? comment.workspaceId ?? workspaceId,
    authorIdx: comment.authorIdx ?? null,
    authorName: comment.authorName || comment.authorEmail || '알 수 없는 사용자',
    authorEmail: comment.authorEmail || '',
    contents: comment.contents || '',
    anchorBlockId: comment.anchorBlockId || '',
    anchorBlockType: comment.anchorBlockType || '',
    anchorText: comment.anchorText || '',
    resolved: Boolean(comment.resolved),
    createdAt,
    updatedAt,
    createdAtLabel: formatDateTime(createdAt),
    updatedAtLabel: formatDateTime(updatedAt || createdAt),
    isEdited,
    editedLabel: isEdited ? `수정됨 ${formatDateTime(updatedAt)}` : '',
  }
}

export const splitWorkspaceComments = (comments = []) => {
  const source = Array.isArray(comments) ? comments : []
  return {
    unresolved: source.filter((comment) => !comment?.resolved),
    resolved: source.filter((comment) => comment?.resolved),
  }
}

export const isWorkspaceCommentMentioningEmail = (comment = {}, email = '') => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return false
  return extractWorkspaceMentionEmails(comment.contents).includes(normalizedEmail)
}

export const filterWorkspaceMentionedComments = (comments = [], email = '') =>
  (Array.isArray(comments) ? comments : []).filter((comment) => isWorkspaceCommentMentioningEmail(comment, email))

export const countWorkspaceBlockComments = (comments = [], selectedBlockAnchor = null) => {
  const anchorId = anchorIdOf(selectedBlockAnchor)
  if (!anchorId) return 0
  return (Array.isArray(comments) ? comments : []).filter((comment) =>
    String(comment?.anchorBlockId || '') === anchorId,
  ).length
}

export const createWorkspaceBlockCommentSummaries = (comments = []) => {
  const summaryMap = new Map()
  ;(Array.isArray(comments) ? comments : [])
    .filter((comment) => comment?.anchorBlockId)
    .forEach((comment) => {
      const key = String(comment.anchorBlockId)
      const previous = summaryMap.get(key) || {
        anchorBlockId: comment.anchorBlockId,
        anchorBlockType: comment.anchorBlockType,
        anchorText: comment.anchorText,
        count: 0,
      }
      previous.count += 1
      previous.anchorText = previous.anchorText || comment.anchorText
      previous.anchorBlockType = previous.anchorBlockType || comment.anchorBlockType
      summaryMap.set(key, previous)
    })
  return [...summaryMap.values()]
}

export const filterWorkspaceComments = ({
  filter = 'open',
  unresolvedComments = [],
  resolvedComments = [],
  mentionedComments = [],
  selectedBlockAnchor = null,
} = {}) => {
  if (filter === 'resolved') return Array.isArray(resolvedComments) ? resolvedComments : []
  if (filter === 'block') {
    const anchorId = anchorIdOf(selectedBlockAnchor)
    if (!anchorId) return []
    return (Array.isArray(unresolvedComments) ? unresolvedComments : []).filter((comment) =>
      String(comment?.anchorBlockId || '') === anchorId,
    )
  }
  if (filter === 'mentions') return Array.isArray(mentionedComments) ? mentionedComments : []
  return Array.isArray(unresolvedComments) ? unresolvedComments : []
}

export const createWorkspaceCommentFilters = ({
  mentionedCount = 0,
  unresolvedCount = 0,
  blockCount = 0,
  resolvedCount = 0,
  currentUserEmail = '',
  selectedBlockAnchor = null,
} = {}) => [
  { id: 'mentions', label: '내 멘션', count: mentionedCount, disabled: !String(currentUserEmail || '').trim() },
  { id: 'open', label: '열림', count: unresolvedCount, disabled: false },
  { id: 'block', label: '현재 블록', count: blockCount, disabled: !anchorIdOf(selectedBlockAnchor) },
  { id: 'resolved', label: '해결됨', count: resolvedCount, disabled: false },
]

export const getWorkspaceCommentEmptyLabel = ({
  filter = 'open',
  currentUserEmail = '',
  selectedBlockAnchor = null,
} = {}) => {
  if (filter === 'mentions') {
    return String(currentUserEmail || '').trim()
      ? '나를 멘션한 열린 댓글이 없습니다.'
      : '내 멘션을 보려면 로그인 이메일이 필요합니다.'
  }
  if (filter === 'block') {
    return selectedBlockAnchor
      ? '현재 블록에 열린 댓글이 없습니다.'
      : '댓글을 보려면 에디터에서 블록을 선택해 주세요.'
  }
  if (filter === 'resolved') return '해결된 댓글이 없습니다.'
  return '열린 댓글이 없습니다.'
}