import { normalizeWorkspaceMember } from '../services/workspacePeople.js'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readValue = (source, fallback = null) => resolveSource(source) ?? fallback
const readBoolean = (source) => Boolean(resolveSource(source))
const writeRef = (target, value) => {
  if (target && typeof target === 'object' && 'value' in target) {
    target.value = value
  }
}

export const workspaceMemberUserId = (member = {}) =>
  member?.userIdx ?? member?.idx ?? member?.id ?? null

export const workspaceMemberActionKey = (member, action) =>
  `${action}:${workspaceMemberUserId(member) ?? 'unknown'}`

export const useWorkspaceMembers = ({
  workspaceId,
  workspaceMembers,
  workspaceMemberLoading,
  workspaceMemberError,
  workspaceMemberActionLoading,
  workspaceMemberRefreshedAt,
  openRoleDropdownId,
  currentUserIdx,
  canManageWorkspaceShare,
  fetchWorkspaceMembers = async () => [],
  changeWorkspaceUserRole = async () => {},
  kickWorkspaceUser = async () => {},
  showWorkspaceNotice = () => {},
  requestWorkspaceConfirm = ({ onConfirm } = {}) => onConfirm?.(),
} = {}) => {
  const refreshWorkspaceMembers = async (targetWorkspaceId = readValue(workspaceId)) => {
    if (!targetWorkspaceId) {
      writeRef(workspaceMembers, [])
      writeRef(workspaceMemberError, '')
      writeRef(workspaceMemberRefreshedAt, null)
      return []
    }

    writeRef(workspaceMemberLoading, true)
    writeRef(workspaceMemberError, '')
    try {
      const result = await fetchWorkspaceMembers(targetWorkspaceId)
      const members = (Array.isArray(result) ? result : []).map(normalizeWorkspaceMember)
      writeRef(workspaceMembers, members)
      writeRef(workspaceMemberRefreshedAt, new Date().toISOString())
      return members
    } catch (error) {
      writeRef(workspaceMembers, [])
      writeRef(workspaceMemberRefreshedAt, null)
      writeRef(
        workspaceMemberError,
        error?.response?.data?.message || error?.message || '멤버 목록을 불러오지 못했습니다.',
      )
      return []
    } finally {
      writeRef(workspaceMemberLoading, false)
    }
  }

  const closeRoleDropdown = () => {
    writeRef(openRoleDropdownId, null)
  }

  const isWorkspaceMemberBusy = (member) => {
    const userIdx = workspaceMemberUserId(member)
    return Boolean(userIdx) && String(readValue(workspaceMemberActionLoading, '')).endsWith(`:${userIdx}`)
  }

  const handleRoleAction = async (user, action) => {
    closeRoleDropdown()
    const targetUserIdx = workspaceMemberUserId(user)
    const targetWorkspaceId = readValue(workspaceId)
    if (!readBoolean(canManageWorkspaceShare) || !targetWorkspaceId || !targetUserIdx) return

    const currentIdx = readValue(currentUserIdx)
    if (user?.isMe || (currentIdx != null && String(targetUserIdx) === String(currentIdx))) {
      showWorkspaceNotice('자신의 권한은 이 화면에서 변경할 수 없습니다.', 'warn')
      return
    }

    const runRoleAction = async () => {
      writeRef(workspaceMemberActionLoading, workspaceMemberActionKey({ userIdx: targetUserIdx }, action))
      try {
        if (action === 'KICKED') {
          await kickWorkspaceUser(targetWorkspaceId, targetUserIdx)
        } else {
          await changeWorkspaceUserRole(targetWorkspaceId, targetUserIdx, action)
        }
        await refreshWorkspaceMembers(targetWorkspaceId)
        showWorkspaceNotice(
          action === 'KICKED' ? '멤버를 추방했습니다.' : '멤버 권한을 변경했습니다.',
          'success',
        )
      } catch (error) {
        showWorkspaceNotice(
          error?.response?.data?.message || error?.message || '권한 변경에 실패했습니다.',
          'error',
        )
      } finally {
        writeRef(workspaceMemberActionLoading, '')
      }
    }

    if (action === 'KICKED') {
      requestWorkspaceConfirm({
        title: '멤버 추방',
        message: `${user?.name || '이 멤버'} 님을 추방하시겠습니까?`,
        confirmLabel: '추방',
        tone: 'danger',
        onConfirm: runRoleAction,
      })
      return
    }

    await runRoleAction()
  }

  const handleWorkspaceMemberRoleSelect = async (member, event) => {
    const nextRole = event?.target?.value
    if (!nextRole || nextRole === member?.role) return
    await handleRoleAction(member, nextRole)
  }

  return {
    refreshWorkspaceMembers,
    closeRoleDropdown,
    isWorkspaceMemberBusy,
    handleRoleAction,
    handleWorkspaceMemberRoleSelect,
  }
}