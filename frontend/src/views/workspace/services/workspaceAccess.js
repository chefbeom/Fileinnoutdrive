export const normalizeWorkspaceRoleKey = (role = 'ADMIN') => String(role || 'ADMIN').toUpperCase()

export const canWorkspaceRoleEdit = (roleKey = 'ADMIN') => ['ADMIN', 'WRITE'].includes(normalizeWorkspaceRoleKey(roleKey))

export const canWorkspaceRoleManageShare = (roleKey = 'ADMIN') => normalizeWorkspaceRoleKey(roleKey) === 'ADMIN'

export const canManageWorkspaceAssets = ({ workspaceId = null, roleKey = 'ADMIN', isLocked = false } = {}) => {
  if (isLocked) return false
  if (!workspaceId) return true
  return canWorkspaceRoleEdit(roleKey)
}

export const canEditWorkspacePage = ({ workspaceId = null, roleKey = 'ADMIN' } = {}) =>
  !workspaceId || canWorkspaceRoleEdit(roleKey)

export const canModifyWorkspacePageContent = ({ canEditWorkspace = false, isLocked = false } = {}) =>
  Boolean(canEditWorkspace) && !isLocked

export const shouldUseReadonlyWorkspaceEditor = ({ canEditWorkspace = false, isLocked = false } = {}) =>
  !canEditWorkspace || isLocked

export const createWorkspaceLockStatusLabel = (isLocked = false) =>
  isLocked ? '페이지 잠김' : '편집 가능'

export const createWorkspaceLockButtonTitle = ({ canEditWorkspace = false, isLocked = false } = {}) => {
  if (!canEditWorkspace) return '편집 권한 없음'
  return isLocked ? '페이지 잠금 해제' : '페이지 잠금'
}

export const canShowWorkspaceTemplatePicker = ({
  workspaceId = null,
  canModifyWorkspacePage = false,
  templateApplied = false,
  hasUnsavedChanges = false,
  title = '',
} = {}) =>
  !workspaceId &&
  canModifyWorkspacePage &&
  !templateApplied &&
  !hasUnsavedChanges &&
  !String(title || '').trim()

export const createWorkspaceShareStatusLabel = (status = 'Private') => {
  if (status === 'Public') return '공개 링크'
  if (status === 'Shared') return '멤버 공유'
  return '개인 문서'
}

export const createWorkspaceShareStatusClass = (status = 'Private') => ({
  'status-pill--public': status === 'Public',
  'status-pill--shared': status === 'Shared',
  'status-pill--muted': status === 'Private',
})

export const createWorkspaceShareButtonTitle = ({ isValid = false, canManageWorkspaceShare = false } = {}) => {
  if (!isValid) return '제목을 입력한 뒤 공유 설정을 열 수 있습니다'
  if (!canManageWorkspaceShare) return '관리자만 공유 설정을 변경할 수 있습니다'
  return '공유 및 초대 설정'
}
