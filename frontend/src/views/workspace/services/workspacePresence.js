export const createWorkspaceActiveUserPreview = (activeUsers = [], limit = 4) =>
  activeUsers.slice(0, Math.max(0, limit))

export const countWorkspaceExtraActiveUsers = (activeUsers = [], limit = 4) =>
  Math.max(activeUsers.length - createWorkspaceActiveUserPreview(activeUsers, limit).length, 0)

export const createActiveWorkspaceUserIdSet = (activeUsers = []) =>
  new Set(
    activeUsers
      .map((user) => user?.userIdx)
      .filter((userIdx) => userIdx != null)
      .map((userIdx) => String(userIdx)),
  )

export const createWorkspacePresenceSummaryLabel = ({ workspaceId = null, activeUsers = [] } = {}) => {
  if (!workspaceId) return '개인 편집'
  const count = activeUsers.length
  if (count <= 0) return '연결 준비 중'

  const awayCount = activeUsers.filter((user) => user?.status === 'away').length
  const activeCount = count - awayCount
  if (count === 1) return awayCount ? '1명 자리비움' : '나만 편집 중'
  if (awayCount > 0) return `${activeCount}명 활동 · ${awayCount}명 자리비움`
  return `${count}명 협업 중`
}
