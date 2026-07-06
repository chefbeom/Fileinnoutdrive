export const roleLabel = (role) => {
  const map = { ADMIN: '관리자', WRITE: '편집자', READ: '뷰어' }
  return map[role] || '뷰어'
}

export const workspacePresenceStatusLabel = (user = {}) => {
  if (user.status === 'away') return '자리비움'
  if (user.status === 'offline') return '오프라인'
  return '접속 중'
}

export const userInitial = (name) => String(name || '?').trim().slice(0, 1).toUpperCase() || '?'

export const blockTypeLabel = (type) => {
  const map = {
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
  }
  return map[type] || '블록'
}

export const commentAnchorLabel = (anchor) => {
  if (!anchor?.anchorBlockId) return '문서 전체'
  return anchor.anchorText || `${blockTypeLabel(anchor.anchorBlockType)} 블록`
}

export const formatDateTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(date)
}

export const formatDocumentTime = (value, now = Date.now()) => {
  if (!value) return '최근 편집 정보 없음'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '최근 편집 정보 없음'
  const diffMs = Number(now) - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  if (diffMinutes < 1) return '방금 편집'
  if (diffMinutes < 60) return `${diffMinutes}분 전`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}시간 전`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}일 전`
  return formatDateTime(value)
}

export const workspaceRevisionReasonLabel = (reason) => {
  const normalized = String(reason || '').toUpperCase()
  if (normalized === 'RESTORE') return '복구'
  return '저장'
}
