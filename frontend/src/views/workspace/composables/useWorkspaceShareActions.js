const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readValue = (source, fallback = null) => resolveSource(source) ?? fallback
const readBoolean = (source) => Boolean(resolveSource(source))
const writeRef = (target, value) => {
  if (target && typeof target === 'object' && 'value' in target) {
    target.value = value
  }
}

const messageFor = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback

export const useWorkspaceShareActions = ({
  workspaceId,
  workspaceShareStatus,
  workspaceUuid,
  workspaceAccessRole,
  showWorkspaceShareModal,
  canManageWorkspaceShare,
  isEditorLoading,
  hasUnsavedChanges,
  loadWorkspace = async () => null,
  normalizeWorkspaceShareStatus = () => '',
  persistWorkspace = async () => null,
  refreshWorkspaceDocuments = async () => {},
  refreshWorkspaceMembers = async () => {},
  showWorkspaceNotice = () => {},
  logger = console,
} = {}) => {
  const refreshWorkspaceShareState = async () => {
    const targetWorkspaceId = readValue(workspaceId)
    if (!targetWorkspaceId) return null

    const data = await loadWorkspace(targetWorkspaceId)
    writeRef(workspaceShareStatus, normalizeWorkspaceShareStatus(data?.status, data?.type))
    writeRef(workspaceUuid, data?.uuid || readValue(workspaceUuid, '') || '')
    writeRef(workspaceAccessRole, data?.accessRole || data?.level || readValue(workspaceAccessRole))
    await refreshWorkspaceDocuments()
    await refreshWorkspaceMembers(data?.idx || targetWorkspaceId)
    return data
  }

  const openWorkspaceShare = async () => {
    if (!readBoolean(canManageWorkspaceShare) || readBoolean(isEditorLoading)) return

    try {
      if (!readValue(workspaceId) || readBoolean(hasUnsavedChanges)) {
        await persistWorkspace({ navigateNewDocument: true })
      }
      await refreshWorkspaceShareState()
      writeRef(showWorkspaceShareModal, true)
    } catch (error) {
      showWorkspaceNotice(messageFor(error, '공유 설정을 열기 전에 문서를 저장하지 못했습니다.'), 'error')
    }
  }

  const handleWorkspaceShareRefresh = async () => {
    try {
      await refreshWorkspaceShareState()
    } catch (error) {
      logger.error?.('Workspace share state refresh failed:', error)
    }
  }

  return {
    refreshWorkspaceShareState,
    openWorkspaceShare,
    handleWorkspaceShareRefresh,
  }
}
