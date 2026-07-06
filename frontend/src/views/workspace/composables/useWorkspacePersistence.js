import { unref } from 'vue'

const DEFAULT_MESSAGES = Object.freeze({
  missingSavedId: '\uC6CC\uD06C\uC2A4\uD398\uC774\uC2A4 \uC800\uC7A5 \uACB0\uACFC\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
  saveFailed: '\uC6CC\uD06C\uC2A4\uD398\uC774\uC2A4 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
  persistBeforeActionFailed: '\uC6CC\uD06C\uC2A4\uD398\uC774\uC2A4\uB97C \uBA3C\uC800 \uC800\uC7A5\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
})

const readValue = (source) => {
  if (typeof source === 'function') return source()
  return unref(source)
}

const writeRef = (target, value) => {
  if (target && typeof target === 'object' && 'value' in target) {
    target.value = value
  }
}

const savedWorkspaceIdFrom = (response = {}) =>
  response?.result?.body?.idx ?? response?.data?.idx ?? response?.idx ?? null

export const useWorkspacePersistence = ({
  editorApi,
  workspaceId,
  workspaceAccessRole,
  workspaceShareStatus,
  workspaceUuid,
  titleDirty,
  saveState,
  saveError,
  lastSavedAt,
  route,
  router,
  normalizeWorkspaceShareStatus = (status) => status,
  refreshWorkspaceDocuments = async () => {},
  refreshWorkspaceRevisions = async () => {},
  allowNextRouteLeave = () => {},
  now = () => new Date().toISOString(),
  labels = {},
} = {}) => {
  const messages = { ...DEFAULT_MESSAGES, ...labels }

  const persistWorkspace = async ({ navigateNewDocument = false } = {}) => {
    const api = readValue(editorApi)
    if (!api?.savePost || readValue(saveState) === 'saving') return null

    writeRef(saveState, 'saving')
    writeRef(saveError, '')

    try {
      const response = await api.savePost()
      const savedWorkspaceId = savedWorkspaceIdFrom(response)
      if (!savedWorkspaceId) {
        throw new Error(messages.missingSavedId)
      }

      writeRef(titleDirty, false)
      api.markSaved?.()
      writeRef(workspaceId, Number(savedWorkspaceId))
      if (!readValue(workspaceAccessRole)) {
        writeRef(workspaceAccessRole, 'ADMIN')
      }
      if (response?.status !== undefined || response?.type !== undefined) {
        writeRef(workspaceShareStatus, normalizeWorkspaceShareStatus(response?.status, response?.type))
      }
      writeRef(workspaceUuid, response?.uuid || readValue(workspaceUuid))
      writeRef(lastSavedAt, now())
      writeRef(saveState, 'saved')

      await refreshWorkspaceDocuments()
      void refreshWorkspaceRevisions(savedWorkspaceId)

      if (
        navigateNewDocument &&
        String(route?.params?.id || '') !== String(savedWorkspaceId)
      ) {
        allowNextRouteLeave()
        await router.replace(`/workspace/read/${savedWorkspaceId}`)
      }

      return savedWorkspaceId
    } catch (error) {
      writeRef(saveError, error?.message || messages.saveFailed)
      writeRef(saveState, 'error')
      throw error
    }
  }

  const ensureWorkspacePersisted = async ({ navigate = false } = {}) => {
    if (readValue(workspaceId)) return readValue(workspaceId)
    if (!readValue(editorApi)?.savePost) {
      throw new Error(messages.persistBeforeActionFailed)
    }

    const savedWorkspaceId = await persistWorkspace({ navigateNewDocument: navigate })
    if (!savedWorkspaceId) {
      throw new Error(messages.saveFailed)
    }
    return readValue(workspaceId)
  }

  return {
    persistWorkspace,
    ensureWorkspacePersisted,
  }
}

export const __workspacePersistenceTestables = {
  savedWorkspaceIdFrom,
}
