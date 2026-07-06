const noop = () => {}

const readValue = (source) => {
  if (typeof source === 'function') return source()
  if (source && typeof source === 'object' && 'value' in source) return source.value
  return source
}

export const useWorkspaceDocumentNavigation = ({
  currentWorkspaceKey,
  route,
  router,
  trackRecentWorkspaceDocument = noop,
  confirmDiscardIfNeeded = () => true,
  setupEditor = noop,
} = {}) => {
  const openWorkspaceDocument = async (document) => {
    const documentId = document?.id
    if (!documentId || String(documentId) === String(readValue(currentWorkspaceKey))) return false

    trackRecentWorkspaceDocument(document)
    await router?.push?.(`/workspace/read/${documentId}`)
    return true
  }

  const createWorkspaceDocument = async () => {
    if (!confirmDiscardIfNeeded()) return false

    if (readValue(route)?.path === '/workspace') {
      await setupEditor()
      return true
    }

    await router?.push?.('/workspace')
    return true
  }

  return {
    openWorkspaceDocument,
    createWorkspaceDocument,
  }
}