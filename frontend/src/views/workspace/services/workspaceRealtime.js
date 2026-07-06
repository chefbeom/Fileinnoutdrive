export const isWorkspaceRealtimeEventFromCurrentUser = (payload = {}, currentUserIdx = null) => {
  const actorIdx = payload.actorUserIdx
  return actorIdx != null && currentUserIdx != null && String(actorIdx) === String(currentUserIdx)
}

export const createWorkspaceCommentRealtimeNotice = ({
  payload = {},
  comment = null,
  previousComment = null,
  mentionedMe = false,
  anchorLabel = '',
} = {}) => {
  if (payload.action === 'DELETE') {
    return {
      message: '다른 사용자가 댓글을 삭제했습니다.',
      tone: 'info',
      actionLabel: '댓글 보기',
      timeout: undefined,
      mention: false,
      comment: null,
    }
  }

  if (payload.action !== 'UPSERT' || !comment) return null

  const author = comment.authorName || comment.authorEmail || '다른 사용자'
  const anchorSuffix = anchorLabel && anchorLabel !== '문서 전체' ? ` · ${anchorLabel}` : ''
  let message = `${author}님이 댓글을 수정했습니다.`

  if (mentionedMe) {
    message = `${author}님이 나를 언급했습니다.`
  } else if (!previousComment) {
    message = `${author}님이 댓글을 남겼습니다.`
  } else if (comment.resolved && !previousComment.resolved) {
    message = `${author}님이 댓글을 해결했습니다.`
  } else if (!comment.resolved && previousComment.resolved) {
    message = `${author}님이 댓글을 다시 열었습니다.`
  }

  return {
    message: `${message}${anchorSuffix}`,
    tone: mentionedMe ? 'warn' : 'info',
    actionLabel: '댓글 보기',
    timeout: mentionedMe ? 7200 : 4600,
    mention: mentionedMe,
    comment,
  }
}

export const createWorkspaceAssetRealtimeNotice = ({
  payload = {},
  assets = [],
  deletedIds = [],
  assetLabel = '',
} = {}) => {
  if (payload.action === 'UPLOAD' || payload.action === 'UPSERT') {
    return {
      message: `다른 사용자가 ${assetLabel}을 업로드했습니다.`,
      tone: 'info',
      actionLabel: '첨부 보기',
      asset: assets[0] || null,
    }
  }

  if (payload.action === 'DELETE') {
    return {
      message: `다른 사용자가 ${assetLabel || `${deletedIds.length || 1}개 파일`}을 삭제했습니다.`,
      tone: 'info',
      actionLabel: '첨부 보기',
      asset: null,
    }
  }

  return null
}