import { onBeforeUnmount, onMounted, watch } from 'vue'

const noop = () => {}
const noopAsync = async () => {}
const readRows = (rows) => (Array.isArray(rows) ? rows : [])
const setRef = (target, value) => {
  if (target && typeof target === 'object' && 'value' in target) target.value = value
}

export const pruneWorkspacePageIndexLifecycleState = ({
  rows = [],
  workspacePageIndexSelectedIds,
  collapsedWorkspacePageTreeIds,
  pruneWorkspaceTreeEditingState = noop,
} = {}) => {
  const normalizedRows = readRows(rows)
  const editableIds = new Set(
    normalizedRows
      .filter((row) => row?.canEditProperties)
      .map((row) => String(row.id)),
  )
  const pageIds = new Set(normalizedRows.map((row) => String(row.id)))

  if (workspacePageIndexSelectedIds) {
    workspacePageIndexSelectedIds.value = readRows(workspacePageIndexSelectedIds.value)
      .filter((id) => editableIds.has(String(id)))
  }
  if (collapsedWorkspacePageTreeIds) {
    collapsedWorkspacePageTreeIds.value = readRows(collapsedWorkspacePageTreeIds.value)
      .filter((id) => pageIds.has(String(id)))
  }
  pruneWorkspaceTreeEditingState(pageIds)

  return { editableIds, pageIds }
}

export const clearMissingActiveWorkspaceAsset = ({ assets = [], activeWorkspaceAssetId } = {}) => {
  if (!activeWorkspaceAssetId) return false
  const activeId = activeWorkspaceAssetId.value
  if (!activeId) return false
  const exists = readRows(assets).some((asset) => asset?.id === activeId)
  if (!exists) {
    activeWorkspaceAssetId.value = null
    return true
  }
  return false
}

export const useWorkspaceLifecycleWatchers = ({
  route,
  workspaceFavoriteStorageKey,
  workspaceRecentStorageKey,
  workspaceSectionsStorageKey,
  workspacePageIndexViewsStorageKey,
  workspaceAssets,
  activeWorkspaceAssetId,
  currentUserEmail,
  workspacePageIndexRows,
  workspacePageIndexSelectedIds,
  collapsedWorkspacePageTreeIds,
  workspaceId,
  selectedBlockAnchor,
  workspaceCommentFilter,
  workspaceBlockCommentSummaries,
  workspacePropertySources = [],
  suppressWorkspacePropertyWatch,
  isEditorLoading,
  editorApi,
  shouldWorkspaceEditorReadOnly,
  workspacePreferencesRemoteReady,
  workspacePreferencesDirtyBeforeRemoteLoad,
  syncTheme = noop,
  loadWorkspacePreferencesFromLocal = noop,
  loadWorkspacePreferences = noopAsync,
  refreshWorkspaceDocuments = noopAsync,
  checkAndRedirectUuid = async () => false,
  setupEditor = noopAsync,
  loadFavoriteWorkspaceDocuments = noop,
  loadRecentWorkspaceDocuments = noop,
  loadWorkspaceDocumentSections = noop,
  loadWorkspacePageIndexViews = noop,
  pruneWorkspaceTreeEditingState = noop,
  connectWorkspaceAssetRealtime = noop,
  refreshWorkspaceBacklinks = noopAsync,
  applyWorkspaceBlockCommentSummaries = noop,
  scheduleAutoSave = noop,
  disconnectWorkspaceAssetRealtime = noop,
  clearAutoSaveTimer = noop,
  clearWorkspaceDocumentLinkCopyTimer = noop,
  clearWorkspaceNoticeTimer = noop,
  closeWorkspaceConfirm = noop,
  clearWorkspacePreferencesSaveTimer = noop,
  destroyEditor = noopAsync,
  watchHook = watch,
  onMountedHook = onMounted,
  onBeforeUnmountHook = onBeforeUnmount,
} = {}) => {
  onMountedHook(async () => {
    syncTheme()
    loadWorkspacePreferencesFromLocal()
    void loadWorkspacePreferences()
    void refreshWorkspaceDocuments()
    const redirected = await checkAndRedirectUuid()
    if (!redirected) await setupEditor()
  })

  watchHook(() => route?.params?.id, async () => { await setupEditor() })

  watchHook(() => route?.path, async (newPath) => {
    if (newPath === '/workspace') await setupEditor()
  })

  watchHook(workspaceFavoriteStorageKey, () => { loadFavoriteWorkspaceDocuments() })
  watchHook(workspaceRecentStorageKey, () => { loadRecentWorkspaceDocuments() })
  watchHook(workspaceSectionsStorageKey, () => { loadWorkspaceDocumentSections() })
  watchHook(workspacePageIndexViewsStorageKey, () => { loadWorkspacePageIndexViews() })

  watchHook(workspaceAssets, (assets) => {
    clearMissingActiveWorkspaceAsset({ assets, activeWorkspaceAssetId })
  })

  watchHook(currentUserEmail, () => {
    setRef(workspacePreferencesRemoteReady, false)
    setRef(workspacePreferencesDirtyBeforeRemoteLoad, false)
    loadWorkspacePreferencesFromLocal()
    void loadWorkspacePreferences()
  })

  watchHook(workspacePageIndexRows, (rows) => {
    pruneWorkspacePageIndexLifecycleState({
      rows,
      workspacePageIndexSelectedIds,
      collapsedWorkspacePageTreeIds,
      pruneWorkspaceTreeEditingState,
    })
  })

  watchHook(
    () => workspaceId?.value,
    (nextWorkspaceId) => {
      connectWorkspaceAssetRealtime(nextWorkspaceId)
      void refreshWorkspaceBacklinks()
    },
    { immediate: true },
  )

  watchHook(selectedBlockAnchor, (anchor) => {
    if (!anchor?.anchorBlockId && workspaceCommentFilter?.value === 'block') {
      workspaceCommentFilter.value = 'open'
    }
  })

  watchHook(
    workspaceBlockCommentSummaries,
    () => { applyWorkspaceBlockCommentSummaries() },
    { deep: true },
  )

  watchHook(workspacePropertySources, () => {
    if (suppressWorkspacePropertyWatch?.value || isEditorLoading?.value || !editorApi?.value) return
    editorApi.value?.markDirty?.()
    scheduleAutoSave()
  })

  watchHook(shouldWorkspaceEditorReadOnly, (readOnly) => {
    void editorApi?.value?.setReadOnly?.(readOnly)
  })

  onBeforeUnmountHook(async () => {
    disconnectWorkspaceAssetRealtime()
    clearAutoSaveTimer()
    clearWorkspaceDocumentLinkCopyTimer()
    clearWorkspaceNoticeTimer()
    closeWorkspaceConfirm()
    clearWorkspacePreferencesSaveTimer()
    await destroyEditor()
  })
}