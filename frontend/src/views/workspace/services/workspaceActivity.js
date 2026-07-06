const WORKSPACE_TEXT_ELLIPSIS = '\u2026'

export const workspaceActivityTimestamp = (value) => {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

export const truncateWorkspaceActivityText = (value, maxLength = 84) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - WORKSPACE_TEXT_ELLIPSIS.length))}${WORKSPACE_TEXT_ELLIPSIS}`
}

export const createWorkspaceActivityItems = ({
  lastSavedAt = null,
  comments = [],
  assets = [],
  memberRefreshedAt = null,
  memberCount = 0,
  formatDateTimeFor = (value) => String(value || ''),
  limit = 8,
} = {}) => {
  const items = []

  if (lastSavedAt) {
    items.push({
      id: `save-${lastSavedAt}`,
      type: 'save',
      icon: 'fa-regular fa-floppy-disk',
      title: '문서 저장됨',
      detail: '최근 변경사항이 저장되었습니다.',
      time: workspaceActivityTimestamp(lastSavedAt),
      timeLabel: formatDateTimeFor(lastSavedAt),
    })
  }

  ;(Array.isArray(comments) ? comments : []).forEach((comment) => {
    const timeSource = comment.updatedAt || comment.createdAt
    const time = workspaceActivityTimestamp(timeSource)
    if (!time) return
    items.push({
      id: `comment-${comment.id || time}`,
      type: comment.resolved ? 'resolved' : 'comment',
      icon: comment.resolved ? 'fa-regular fa-circle-check' : 'fa-regular fa-comment-dots',
      title: comment.resolved ? '댓글 해결됨' : '댓글 추가됨',
      detail: truncateWorkspaceActivityText(`${comment.authorName || '멤버'}: ${comment.contents}`),
      time,
      timeLabel: formatDateTimeFor(timeSource),
    })
  })

  ;(Array.isArray(assets) ? assets : []).forEach((asset) => {
    const time = workspaceActivityTimestamp(asset.createdAt)
    if (!time) return
    items.push({
      id: `asset-${asset.id || time}`,
      type: asset.assetType === 'IMAGE' ? 'image' : 'file',
      icon: asset.assetType === 'IMAGE' ? 'fa-regular fa-image' : 'fa-regular fa-file-lines',
      title: asset.assetType === 'IMAGE' ? '이미지 첨부됨' : '파일 첨부됨',
      detail: truncateWorkspaceActivityText(`${asset.originalName}${asset.fileSizeLabel ? ` · ${asset.fileSizeLabel}` : ''}`),
      time,
      timeLabel: asset.createdAtLabel || formatDateTimeFor(asset.createdAt),
    })
  })

  if (memberRefreshedAt && memberCount > 0) {
    items.push({
      id: `members-${memberRefreshedAt}`,
      type: 'member',
      icon: 'fa-solid fa-user-group',
      title: '멤버 목록 동기화됨',
      detail: `문서 멤버 ${memberCount}명을 확인했습니다.`,
      time: workspaceActivityTimestamp(memberRefreshedAt),
      timeLabel: formatDateTimeFor(memberRefreshedAt),
    })
  }

  return items
    .filter((item) => item.time > 0)
    .sort((left, right) => right.time - left.time)
    .slice(0, limit)
}
