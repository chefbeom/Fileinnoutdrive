const noop = () => {}

const readValue = (source) => {
  if (typeof source === 'function') return source()
  if (source && typeof source === 'object' && 'value' in source) return source.value
  return source
}

const sameWorkspace = (left, right) => {
  if (left == null || right == null || left === '' || right === '') return false
  return Number(left) === Number(right)
}

export const useWorkspaceSseRoleChange = ({
  workspaceId,
  router,
  windowTarget = () => globalThis.window,
  showWorkspaceNotice = noop,
  allowNextRouteLeave = noop,
  allowNextWindowUnload = noop,
  redirectDelayMs = 1200,
  kickedMessage = '해당 워크스페이스에서 추방되었습니다.',
} = {}) => {
  const handleSseRoleChanged = (event) => {
    const { postIdx, newRole } = event?.detail || {}
    if (!sameWorkspace(postIdx, readValue(workspaceId))) return

    const target = readValue(windowTarget)
    if (newRole === 'KICKED') {
      showWorkspaceNotice(kickedMessage, 'error', { timeout: redirectDelayMs })
      allowNextRouteLeave()
      target?.setTimeout?.(() => {
        router?.push?.('/workspace')
      }, redirectDelayMs)
      return
    }

    allowNextWindowUnload()
    target?.location?.reload?.()
  }

  return { handleSseRoleChanged }
}