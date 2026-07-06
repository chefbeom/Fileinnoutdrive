const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readValue = (source, fallback = null) => resolveSource(source) ?? fallback
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}
const readBoolean = (source) => Boolean(resolveSource(source))
const writeRef = (target, value) => {
  if (target && typeof target === 'object' && 'value' in target) {
    target.value = value
  }
}

const errorMessage = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback

export const useWorkspaceRevisionActions = ({
  workspaceId,
  workspaceRevisions,
  workspaceRevisionLoading,
  workspaceRevisionError,
  activeWorkspaceRevision,
  workspaceRevisionDiff,
  workspaceRevisionPreviewLoading,
  workspaceRevisionRestoring,
  canModifyWorkspacePage,
  hasUnsavedChanges,
  title,
  titleDirty,
  editorApi,
  workspaceAccessRole,
  workspaceShareStatus,
  workspaceUuid,
  saveState,
  lastSavedAt,
  loadWorkspaceRevisions = async () => [],
  loadWorkspaceRevision = async () => null,
  restoreWorkspaceRevisionApi = async () => null,
  normalizeWorkspaceRevision = (revision) => revision,
  buildWorkspaceRevisionDiff = async () => null,
  applyWorkspaceProperties = () => {},
  applyWorkspaceParentPage = () => {},
  extractWorkspacePropertiesFromContents = () => ({}),
  extractWorkspaceParentFromContents = () => ({}),
  normalizeWorkspaceShareStatus = () => '',
  refreshWorkspaceDocuments = async () => {},
  requestWorkspaceConfirm = () => {},
  showWorkspaceNotice = () => {},
  now = () => new Date().toISOString(),
} = {}) => {
  const clearActiveRevision = () => {
    writeRef(activeWorkspaceRevision, null)
    writeRef(workspaceRevisionDiff, null)
  }

  const refreshWorkspaceRevisions = async (targetWorkspaceId = readValue(workspaceId)) => {
    if (!targetWorkspaceId) {
      writeRef(workspaceRevisions, [])
      clearActiveRevision()
      writeRef(workspaceRevisionError, '')
      return []
    }

    writeRef(workspaceRevisionLoading, true)
    writeRef(workspaceRevisionError, '')
    try {
      const result = await loadWorkspaceRevisions(targetWorkspaceId)
      const normalizedRevisions = (Array.isArray(result) ? result : []).map(normalizeWorkspaceRevision)
      writeRef(workspaceRevisions, normalizedRevisions)
      if (
        readValue(activeWorkspaceRevision)?.id &&
        !normalizedRevisions.some((revision) => String(revision.id) === String(readValue(activeWorkspaceRevision).id))
      ) {
        clearActiveRevision()
      }
      return normalizedRevisions
    } catch (error) {
      writeRef(workspaceRevisionError, errorMessage(error, '문서 기록을 불러오지 못했습니다.'))
      writeRef(workspaceRevisions, [])
      clearActiveRevision()
      return []
    } finally {
      writeRef(workspaceRevisionLoading, false)
    }
  }

  const previewWorkspaceRevision = async (revision) => {
    const revisionId = revision?.id
    const targetWorkspaceId = readValue(workspaceId)
    if (!targetWorkspaceId || !revisionId || readValue(workspaceRevisionPreviewLoading)) return

    writeRef(workspaceRevisionPreviewLoading, String(revisionId))
    writeRef(workspaceRevisionError, '')
    try {
      const result = await loadWorkspaceRevision(targetWorkspaceId, revisionId)
      const normalizedRevision = normalizeWorkspaceRevision({
        ...revision,
        ...result,
      })
      writeRef(activeWorkspaceRevision, normalizedRevision)
      writeRef(workspaceRevisionDiff, await buildWorkspaceRevisionDiff(normalizedRevision))
    } catch (error) {
      writeRef(workspaceRevisionError, errorMessage(error, '선택한 기록을 불러오지 못했습니다.'))
    } finally {
      writeRef(workspaceRevisionPreviewLoading, '')
    }
  }

  const restoreWorkspaceRevision = async (revision = readValue(activeWorkspaceRevision)) => {
    const revisionId = revision?.id
    const targetWorkspaceId = readValue(workspaceId)
    if (!revisionId || !targetWorkspaceId || !readBoolean(canModifyWorkspacePage) || readValue(workspaceRevisionRestoring)) {
      return
    }

    const warning = readBoolean(hasUnsavedChanges)
      ? '저장되지 않은 편집 내용이 있습니다. 선택한 기록으로 복구하면 현재 편집 내용이 바뀝니다. 계속할까요?'
      : '선택한 기록으로 현재 문서를 복구할까요? 복구 작업도 새 기록으로 남습니다.'

    requestWorkspaceConfirm({
      title: '기록 복구',
      message: warning,
      confirmLabel: '복구',
      tone: readBoolean(hasUnsavedChanges) ? 'danger' : 'warn',
      onConfirm: async () => {
        writeRef(workspaceRevisionRestoring, String(revisionId))
        writeRef(workspaceRevisionError, '')
        try {
          const restored = await restoreWorkspaceRevisionApi(targetWorkspaceId, revisionId)
          writeRef(title, restored?.title || readValue(title, ''))
          writeRef(titleDirty, false)
          readValue(editorApi)?.updateTitleFromLocal?.(readValue(title, ''))
          if (readValue(editorApi)?.applyDocumentTemplate) {
            await readValue(editorApi).applyDocumentTemplate(restored?.contents || '', { markSaved: true })
          }
          applyWorkspaceProperties(extractWorkspacePropertiesFromContents(restored?.contents))
          applyWorkspaceParentPage(extractWorkspaceParentFromContents(restored?.contents))
          readValue(editorApi)?.markSaved?.()
          writeRef(workspaceAccessRole, restored?.accessRole || restored?.level || readValue(workspaceAccessRole))
          writeRef(workspaceShareStatus, normalizeWorkspaceShareStatus(restored?.status, restored?.type))
          writeRef(workspaceUuid, restored?.uuid || readValue(workspaceUuid, ''))
          writeRef(saveState, 'saved')
          writeRef(lastSavedAt, now())
          clearActiveRevision()
          await refreshWorkspaceRevisions(targetWorkspaceId)
          await refreshWorkspaceDocuments()
          showWorkspaceNotice('선택한 기록으로 복구했습니다.', 'success')
        } catch (error) {
          writeRef(workspaceRevisionError, errorMessage(error, '문서를 복구하지 못했습니다.'))
          showWorkspaceNotice(readValue(workspaceRevisionError), 'error')
        } finally {
          writeRef(workspaceRevisionRestoring, '')
        }
      },
    })
  }

  return {
    refreshWorkspaceRevisions,
    previewWorkspaceRevision,
    restoreWorkspaceRevision,
  }
}
