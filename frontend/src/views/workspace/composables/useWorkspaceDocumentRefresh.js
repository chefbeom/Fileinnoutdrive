const noop = () => {}

const setSourceValue = (source, value) => {
  if (source && typeof source === 'object' && 'value' in source) source.value = value
}

const run = (callback) => (typeof callback === 'function' ? callback() : undefined)

export const useWorkspaceDocumentRefresh = ({
  loading,
  loadDocuments = noop,
  loadDocumentSections = noop,
  pruneRecentDocuments = noop,
  persistRecentDocuments = noop,
  refreshBacklinks = noop,
  refreshPageIndex = noop,
} = {}) => {
  const refreshWorkspaceDocuments = async () => {
    setSourceValue(loading, true)
    try {
      const result = await loadDocuments()
      await run(loadDocumentSections)
      run(pruneRecentDocuments)
      run(persistRecentDocuments)
      void run(refreshBacklinks)
      void run(refreshPageIndex)
      return result
    } finally {
      setSourceValue(loading, false)
    }
  }

  return {
    refreshWorkspaceDocuments,
  }
}
