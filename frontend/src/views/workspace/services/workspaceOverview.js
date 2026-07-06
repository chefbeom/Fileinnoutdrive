import { formatDateTime } from './workspacePresentation.js'

export const createWorkspaceSummaryCards = ({
  statusLabel = '',
  priorityLabel = '',
  ownerName = '',
  documentStats = {},
  documentTaskCount = 0,
  documentTaskProgress = 0,
  completedDocumentTaskCount = 0,
  unresolvedCommentCount = 0,
  resolvedCommentCount = 0,
  linkedDocumentCount = 0,
  assetCount = 0,
  imageCount = 0,
  fileCount = 0,
} = {}) => [
  {
    id: 'properties',
    icon: 'fa-solid fa-sliders',
    label: '페이지 상태',
    value: statusLabel,
    detail: `${priorityLabel} 우선순위${ownerName ? ` · ${ownerName}` : ''}`,
  },
  {
    id: 'content',
    icon: 'fa-regular fa-file-lines',
    label: '문서 규모',
    value: `${documentStats.blockCount || 0}블록`,
    detail: `${documentStats.wordCount || 0}단어 · ${documentStats.characterCount || 0}자`,
  },
  {
    id: 'tasks',
    icon: 'fa-regular fa-square-check',
    label: '작업 진행',
    value: documentTaskCount ? `${documentTaskProgress}%` : '작업 없음',
    detail: documentTaskCount
      ? `${completedDocumentTaskCount}/${documentTaskCount} 완료`
      : '체크리스트를 추가하면 진행률을 추적합니다.',
  },
  {
    id: 'review',
    icon: 'fa-regular fa-comments',
    label: '리뷰',
    value: `${unresolvedCommentCount}개 열림`,
    detail: `${resolvedCommentCount}개 해결됨`,
  },
  {
    id: 'links',
    icon: 'fa-solid fa-link',
    label: '관련 페이지',
    value: `${linkedDocumentCount}개`,
    detail: linkedDocumentCount
      ? '본문에서 연결된 페이지를 추적합니다.'
      : '다른 페이지 제목을 언급하면 연결됩니다.',
  },
  {
    id: 'assets',
    icon: 'fa-regular fa-folder-open',
    label: '자료',
    value: `${assetCount}개`,
    detail: `이미지 ${imageCount} · 파일 ${fileCount}`,
  },
]

export const createWorkspaceHealthItems = ({
  shareStatusLabel = '',
  accessRoleLabel = '',
  ownerName = '',
  shareStatus = 'Private',
  isPropertyDueOverdue = false,
  propertyDueDate = '',
  overdueTaskCount = 0,
  unresolvedCommentCount = 0,
  lastSavedAt = null,
  saveStatusLabel = '',
  saveState = 'idle',
  hasUnsavedChanges = false,
  formatDateTimeFor = formatDateTime,
} = {}) => [
  {
    id: 'collaboration',
    label: '공유/권한',
    detail: `${shareStatusLabel} · ${accessRoleLabel}${ownerName ? ` · ${ownerName}` : ''}`,
    tone: shareStatus === 'Private' ? 'muted' : 'good',
    icon: shareStatus === 'Private' ? 'fa-solid fa-lock' : 'fa-solid fa-user-group',
  },
  {
    id: 'tasks',
    label: '기한 관리',
    detail: isPropertyDueOverdue
      ? `페이지 기한 ${propertyDueDate}이 지났습니다.`
      : overdueTaskCount
      ? `${overdueTaskCount}개 작업의 기한이 지났습니다.`
      : '기한 지난 작업이 없습니다.',
    tone: isPropertyDueOverdue || overdueTaskCount ? 'danger' : 'good',
    icon: isPropertyDueOverdue || overdueTaskCount
      ? 'fa-regular fa-clock'
      : 'fa-regular fa-circle-check',
  },
  {
    id: 'review',
    label: '리뷰 처리',
    detail: unresolvedCommentCount
      ? `${unresolvedCommentCount}개 댓글이 열려 있습니다.`
      : '열린 리뷰 댓글이 없습니다.',
    tone: unresolvedCommentCount ? 'warn' : 'good',
    icon: unresolvedCommentCount ? 'fa-regular fa-comment-dots' : 'fa-regular fa-circle-check',
  },
  {
    id: 'saving',
    label: '저장 상태',
    detail: lastSavedAt ? `최근 저장 ${formatDateTimeFor(lastSavedAt)}` : saveStatusLabel,
    tone: saveState === 'error' ? 'danger' : hasUnsavedChanges ? 'warn' : 'good',
    icon: saveState === 'error' ? 'fa-solid fa-triangle-exclamation' : 'fa-regular fa-floppy-disk',
  },
]

export const createWorkspacePermissionItems = ({
  canModifyWorkspacePage = false,
  isWorkspacePageLocked = false,
  workspaceLockStatusLabel = '',
  canCommentOnWorkspace = false,
  canManageAssets = false,
  canManageWorkspaceShare = false,
} = {}) => [
  {
    id: 'edit',
    label: '문서 편집',
    detail: canModifyWorkspacePage ? '가능' : isWorkspacePageLocked ? '페이지 잠김' : '읽기 전용',
    enabled: canModifyWorkspacePage,
  },
  {
    id: 'lock',
    label: '페이지 잠금',
    detail: workspaceLockStatusLabel,
    enabled: isWorkspacePageLocked,
  },
  {
    id: 'comment',
    label: '댓글 작성',
    detail: canCommentOnWorkspace ? '가능' : '읽기 전용',
    enabled: canCommentOnWorkspace,
  },
  {
    id: 'asset',
    label: '첨부 관리',
    detail: canManageAssets ? '가능' : '다운로드만',
    enabled: canManageAssets,
  },
  {
    id: 'share',
    label: '공유 관리',
    detail: canManageWorkspaceShare ? '관리 가능' : '관리자 전용',
    enabled: canManageWorkspaceShare,
  },
]

export const workspaceMemberSummaryLabel = ({
  workspaceId = null,
  canManageWorkspaceShare = false,
  memberLoading = false,
  memberCount = 0,
} = {}) => {
  if (!workspaceId) return '저장 후 멤버 관리 가능'
  if (!canManageWorkspaceShare) return '관리자만 멤버 목록을 관리할 수 있습니다'
  if (memberLoading) return '멤버 목록을 불러오는 중'
  return `${memberCount}명`
}

export const createWorkspaceHomeMetricCards = ({
  documentStats = {},
  outlineCount = 0,
  documentTaskSummaryLabel = '',
  openTaskCount = 0,
  documentTaskProgress = 0,
  unresolvedCommentCount = 0,
  resolvedCommentCount = 0,
  mentionedCommentCount = 0,
  assetCount = 0,
  imageCount = 0,
  fileCount = 0,
} = {}) => [
  {
    id: 'outline',
    icon: 'fa-solid fa-list-ul',
    label: '문서 구조',
    value: `${documentStats.blockCount || 0}블록`,
    detail: outlineCount
      ? `목차 ${outlineCount}개 · 글자 ${documentStats.characterCount || 0}`
      : `글자 ${documentStats.characterCount || 0} · 이미지 ${documentStats.imageCount || 0}`,
    panel: 'outline',
  },
  {
    id: 'tasks',
    icon: 'fa-regular fa-square-check',
    label: '페이지 작업',
    value: documentTaskSummaryLabel,
    detail: openTaskCount
      ? `열린 작업 ${openTaskCount}개 · 진행률 ${documentTaskProgress}%`
      : '체크리스트를 추가하면 진행률을 추적합니다.',
    panel: 'tasks',
  },
  {
    id: 'review',
    icon: 'fa-regular fa-comments',
    label: '댓글',
    value: `${unresolvedCommentCount}개 열림`,
    detail: `${resolvedCommentCount}개 해결됨 · 멘션 ${mentionedCommentCount}`,
    panel: 'review',
  },
  {
    id: 'assets',
    icon: 'fa-regular fa-folder-open',
    label: '첨부',
    value: `${assetCount}개`,
    detail: `이미지 ${imageCount} · 파일 ${fileCount}`,
    panel: 'assets',
  },
]
