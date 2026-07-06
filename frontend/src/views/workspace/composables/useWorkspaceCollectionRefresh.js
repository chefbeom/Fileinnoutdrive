const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const writeRef = (target, value) => {
  if (target && typeof target === 'object' && 'value' in target) {
    target.value = value
  }
}

export const useWorkspaceCollectionRefresh = ({
  workspaceId,
  items,
  loading,
  error,
  loadItems = async () => [],
  normalizeItem = (item) => item,
  errorMessage = '목록을 불러오지 못했습니다.',
} = {}) => {
  const refreshWorkspaceCollection = async (targetWorkspaceId = resolveSource(workspaceId)) => {
    if (!targetWorkspaceId) {
      writeRef(items, [])
      writeRef(error, '')
      return []
    }

    writeRef(loading, true)
    writeRef(error, '')
    try {
      const result = await loadItems(targetWorkspaceId)
      const normalizedItems = (Array.isArray(result) ? result : []).map(normalizeItem)
      writeRef(items, normalizedItems)
      return normalizedItems
    } catch (caughtError) {
      writeRef(
        error,
        caughtError?.response?.data?.message || caughtError?.message || errorMessage,
      )
      writeRef(items, [])
      return []
    } finally {
      writeRef(loading, false)
    }
  }

  return {
    refreshWorkspaceCollection,
  }
}
