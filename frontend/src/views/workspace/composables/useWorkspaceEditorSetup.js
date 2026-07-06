import { markRaw, nextTick } from 'vue'

const defaultInitEditorLoader = () => import('@/components/workspace/editor.js')

const destroyEditorApi = async (api, logError = (...args) => console.error(...args)) => {
  if (!api?.destroy) return
  try {
    if (api.editor?.isReady) await api.editor.isReady
    await api.destroy()
  } catch (error) {
    logError('Editor destroy failed:', error)
  }
}

export const useWorkspaceEditorSetup = ({
  editorHolder,
  editorApi,
  isEditorLoading,
  saveState,
  saveError,
  lastSavedAt,
  title,
  titleDirty,
  workspaceTemplateApplied,
  workspaceTemplateApplying,
  workspaceId,
  workspaceAccessRole,
  workspaceShareStatus,
  workspaceUuid,
  showWorkspaceShareModal,
  router,
  authStore = {},
  shouldWorkspaceEditorReadOnly,
  currentWorkspaceProperties,
  workspaceParentPageId,
  workspaceParentPageTitle,
  workspaceDocumentById,
  clearAutoSaveTimer = () => {},
  resetLeaveGuardBypass = () => {},
  prepareWorkspaceData = async () => ({}),
  normalizeWorkspaceShareStatus = (status) => status,
  trackRecentWorkspaceDocument = () => {},
  applyWorkspaceProperties = () => {},
  applyWorkspaceParentPage = () => {},
  extractWorkspacePropertiesFromContents = () => ({}),
  extractWorkspaceParentFromContents = () => ({}),
  refreshWorkspaceAssets = async () => {},
  refreshWorkspaceComments = async () => {},
  refreshWorkspaceRevisions = async () => {},
  refreshWorkspaceMembers = async () => {},
  handleEditorImageUpload,
  scheduleAutoSave = () => {},
  handleEditorBlockCommentBadgeClick = () => {},
  applyWorkspaceBlockCommentSummaries = () => {},
  waitForDomUpdate = () => nextTick(),
  initEditorLoader = defaultInitEditorLoader,
  now = () => Date.now(),
  logError = (...args) => console.error(...args),
} = {}) => {
  let currentSetupId = 0

  const destroyEditor = async () => {
    await destroyEditorApi(editorApi?.value, logError)
    if (editorApi) editorApi.value = null
  }

  const setupEditor = async () => {
    const setupId = ++currentSetupId
    if (!editorHolder?.value) return

    clearAutoSaveTimer()
    isEditorLoading.value = true
    saveState.value = 'idle'
    saveError.value = ''
    lastSavedAt.value = null
    resetLeaveGuardBypass()

    try {
      const data = await prepareWorkspaceData()
      if (setupId !== currentSetupId) return

      await destroyEditor()

      title.value = data.title || ''
      titleDirty.value = false
      workspaceTemplateApplied.value = false
      workspaceTemplateApplying.value = ''
      workspaceId.value = data.idx ? Number(data.idx) : null
      workspaceAccessRole.value = data.accessRole || data.level || 'ADMIN'
      workspaceShareStatus.value = normalizeWorkspaceShareStatus(data.status, data.type)
      workspaceUuid.value = data.uuid || ''

      if (workspaceId.value) {
        trackRecentWorkspaceDocument({
          id: workspaceId.value,
          title: title.value || data.title || '\uC81C\uBAA9 \uC5C6\uC74C',
          updatedAt: data.updatedAt || null,
          role: workspaceAccessRole.value,
          scope: workspaceDocumentById?.value?.get(String(workspaceId.value))?.scope || 'personal',
        })
      }

      applyWorkspaceProperties(extractWorkspacePropertiesFromContents(data.contents))
      applyWorkspaceParentPage(extractWorkspaceParentFromContents(data.contents))
      if (showWorkspaceShareModal) showWorkspaceShareModal.value = false

      if (String(workspaceAccessRole.value).toUpperCase() === 'READ' && data.idx) {
        await router.replace(`/workspace/readonly/${data.idx}`)
        return
      }

      await refreshWorkspaceAssets(workspaceId.value)
      await refreshWorkspaceComments(workspaceId.value)
      await refreshWorkspaceRevisions(workspaceId.value)
      await refreshWorkspaceMembers(workspaceId.value)

      await waitForDomUpdate()
      if (editorHolder.value) editorHolder.value.innerHTML = ''

      const isPrivate = data.status === 'Private'
      const { initEditor } = await initEditorLoader()
      const newEditorApi = await initEditor(
        editorHolder.value,
        `notion-room-${data.idx ? data.idx : `new-${now()}`}`,
        data.contents,
        data.idx ?? null,
        data.title,
        isPrivate,
        {
          uploadImage: handleEditorImageUpload,
          userRole: workspaceAccessRole.value,
          readOnly: shouldWorkspaceEditorReadOnly.value,
          currentUser: authStore.user,
          accessToken: authStore.token,
          getWorkspaceProperties: () => currentWorkspaceProperties.value,
          getWorkspaceParent: () => ({
            id: workspaceParentPageId.value,
            title: workspaceParentPageTitle.value,
          }),
          onLocalChange: scheduleAutoSave,
          onBlockCommentBadgeClick: handleEditorBlockCommentBadgeClick,
        },
      )

      if (setupId !== currentSetupId) {
        await destroyEditorApi(newEditorApi, logError)
        return
      }

      editorApi.value = markRaw(newEditorApi)
      editorApi.value?.bindTitleRef?.(title)
      editorApi.value?.markSaved?.()
      applyWorkspaceBlockCommentSummaries()
    } catch (error) {
      logError('Editor setup failed:', error)
    } finally {
      if (setupId === currentSetupId) isEditorLoading.value = false
    }
  }

  return {
    setupEditor,
    destroyEditor,
  }
}

export const __workspaceEditorSetupTestables = {
  destroyEditorApi,
}
