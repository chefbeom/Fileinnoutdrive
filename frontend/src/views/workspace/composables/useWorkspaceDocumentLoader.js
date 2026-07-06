const defaultWorkspaceData = ({
  idx = null,
  title = '',
  contents = '',
  type = false,
  status = 'Private',
  uuid = '',
  accessRole = 'ADMIN',
} = {}) => ({
  idx,
  title,
  contents,
  type,
  status,
  uuid,
  accessRole,
})

const isReadonlyWorkspaceRoute = (route = {}) =>
  route.name === 'workspace_readonly' ||
  String(route.path || '').startsWith('/workspace/readonly/')

const isCollaborativeWorkspaceRoute = (route = {}) =>
  isReadonlyWorkspaceRoute(route) ||
  route.name === 'workspace_read' ||
  String(route.path || '').startsWith('/workspace/read/')

const workspaceDataFallbackFor = (route = {}) => {
  const id = route.params?.id
  const normalizedId = Number(id)
  const readonlyRoute = isReadonlyWorkspaceRoute(route)
  const collaborativeRoute = isCollaborativeWorkspaceRoute(route)

  return defaultWorkspaceData({
    idx: Number.isFinite(normalizedId) ? normalizedId : null,
    type: collaborativeRoute,
    status: collaborativeRoute ? 'Public' : 'Private',
    accessRole: readonlyRoute ? 'READ' : collaborativeRoute ? 'WRITE' : 'ADMIN',
  })
}

const extractWorkspaceData = (response = {}) =>
  response?.result?.body || response?.data || response

export const useWorkspaceDocumentLoader = ({
  route,
  router,
  api,
  logError = (...args) => console.error(...args),
} = {}) => {
  const prepareWorkspaceData = async () => {
    const id = route?.params?.id
    if (!id || route?.path === '/workspace') {
      return defaultWorkspaceData()
    }

    if (route?.meta?.initialData && String(route.meta.initialData.idx) === String(id)) {
      return route.meta.initialData
    }

    try {
      return await api.getPost(id)
    } catch {
      return workspaceDataFallbackFor(route)
    }
  }

  const checkAndRedirectUuid = async () => {
    const uuid = route?.query?.uuid
    if (!String(route?.path || '').includes('/invite') || !uuid) return false

    try {
      const response = await api.getPostByUuid(uuid)
      const data = extractWorkspaceData(response)
      if (data?.idx) {
        await router.replace({ name: 'workspace_read', params: { id: data.idx } })
        return true
      }
    } catch (error) {
      logError('UUID redirect failed:', error)
    }

    await router.replace('/workspace')
    return true
  }

  return {
    prepareWorkspaceData,
    checkAndRedirectUuid,
  }
}

export const __workspaceDocumentLoaderTestables = {
  defaultWorkspaceData,
  workspaceDataFallbackFor,
  isReadonlyWorkspaceRoute,
  isCollaborativeWorkspaceRoute,
}
