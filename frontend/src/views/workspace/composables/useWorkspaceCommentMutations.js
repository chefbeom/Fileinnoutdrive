const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const setSourceValue = (source, value) => {
  if (source && typeof source === 'object' && 'value' in source) source.value = value
}
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}
const readString = (source) => String(resolveSource(source) || '')
const readBoolean = (source) => Boolean(resolveSource(source))
const errorMessage = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback
const commentId = (comment) => {
  const id = comment?.id
  return id == null || id === '' ? '' : String(id)
}

const setBusyId = (source, id, busy) => {
  const key = String(id || '')
  if (!key) return
  const currentIds = readRows(source).map((item) => String(item || '')).filter(Boolean)
  setSourceValue(source, busy
    ? [...new Set([...currentIds, key])]
    : currentIds.filter((item) => item !== key))
}

const sortComments = (comments = []) =>
  [...comments].sort((left, right) => {
    if (left.resolved !== right.resolved) return left.resolved ? 1 : -1
    return new Date(right.createdAt || right.updatedAt || 0).getTime() -
      new Date(left.createdAt || left.updatedAt || 0).getTime()
  })

export const useWorkspaceCommentMutations = ({
  workspaceId,
  workspaceComments,
  workspaceCommentFilter,
  workspaceCommentSaving,
  workspaceCommentError,
  workspaceCommentEditingId,
  workspaceCommentEditDraft,
  newWorkspaceComment,
  resolvingCommentIds,
  deletingCommentIds,
  updatingCommentIds,
  currentUserEmail,
  currentUserIdx,
  canManageWorkspaceShare,
  canCommentOnWorkspace,
  editorApi,
  normalizeWorkspaceComment,
  ensureWorkspacePersisted,
  createWorkspaceCommentApi,
  updateWorkspaceCommentApi,
  resolveWorkspaceCommentApi,
  deleteWorkspaceCommentApi,
} = {}) => {
  const upsertWorkspaceComment = (comment) => {
    const normalized = normalizeWorkspaceComment?.(comment) || comment
    if (normalized?.id == null) return false
    const id = commentId(normalized)
    const next = readRows(workspaceComments).filter((item) => commentId(item) !== id)
    setSourceValue(workspaceComments, sortComments([normalized, ...next]))
    return true
  }

  const createWorkspaceComment = async () => {
    const contents = readString(newWorkspaceComment).trim()
    if (!contents || readBoolean(workspaceCommentSaving) || !readBoolean(canCommentOnWorkspace)) return false
    setSourceValue(workspaceCommentSaving, true)
    setSourceValue(workspaceCommentError, '')
    try {
      const targetWorkspaceId = await ensureWorkspacePersisted?.({ navigate: true })
      const anchor = await resolveSource(editorApi)?.captureCurrentBlockAnchor?.()
      const created = await createWorkspaceCommentApi?.(targetWorkspaceId, {
        contents,
        anchorBlockId: anchor?.anchorBlockId || null,
        anchorBlockType: anchor?.anchorBlockType || null,
        anchorText: anchor?.anchorText || null,
      })
      upsertWorkspaceComment(created)
      if (anchor?.anchorBlockId) {
        setSourceValue(workspaceCommentFilter, 'block')
      }
      setSourceValue(newWorkspaceComment, '')
      return true
    } catch (error) {
      setSourceValue(workspaceCommentError, errorMessage(error, '댓글을 저장하지 못했습니다.'))
      return false
    } finally {
      setSourceValue(workspaceCommentSaving, false)
    }
  }

  const isWorkspaceCommentAuthor = (comment = {}) => {
    const authorEmail = String(comment.authorEmail || '').toLowerCase()
    const authorIdx = comment.authorIdx == null ? '' : String(comment.authorIdx)
    const viewerIdx = resolveSource(currentUserIdx) == null ? '' : String(resolveSource(currentUserIdx))
    return Boolean(
      (authorEmail && authorEmail === readString(currentUserEmail).toLowerCase()) ||
      (authorIdx && viewerIdx && authorIdx === viewerIdx),
    )
  }

  const canEditWorkspaceComment = (comment = {}) =>
    Boolean(
      comment?.id &&
      readString(workspaceId) &&
      readBoolean(canCommentOnWorkspace) &&
      (readBoolean(canManageWorkspaceShare) || isWorkspaceCommentAuthor(comment)),
    )

  const isWorkspaceCommentEditing = (comment) =>
    Boolean(comment?.id && readString(workspaceCommentEditingId) === commentId(comment))

  const startWorkspaceCommentEdit = (comment) => {
    if (!canEditWorkspaceComment(comment)) return false
    setSourceValue(workspaceCommentEditingId, commentId(comment))
    setSourceValue(workspaceCommentEditDraft, comment.contents || '')
    setSourceValue(workspaceCommentError, '')
    return true
  }

  const cancelWorkspaceCommentEdit = () => {
    setSourceValue(workspaceCommentEditingId, '')
    setSourceValue(workspaceCommentEditDraft, '')
  }

  const updateWorkspaceComment = async (comment) => {
    if (!canEditWorkspaceComment(comment) || !isWorkspaceCommentEditing(comment)) return false
    const contents = readString(workspaceCommentEditDraft).trim()
    if (!contents) {
      setSourceValue(workspaceCommentError, '댓글 내용을 입력해주세요.')
      return false
    }
    if (contents === String(comment.contents || '').trim()) {
      cancelWorkspaceCommentEdit()
      return false
    }

    setBusyId(updatingCommentIds, comment.id, true)
    setSourceValue(workspaceCommentError, '')
    try {
      const updated = await updateWorkspaceCommentApi?.(readString(workspaceId), comment.id, contents)
      upsertWorkspaceComment(updated)
      cancelWorkspaceCommentEdit()
      return true
    } catch (error) {
      setSourceValue(workspaceCommentError, errorMessage(error, '댓글을 수정하지 못했습니다.'))
      return false
    } finally {
      setBusyId(updatingCommentIds, comment.id, false)
    }
  }

  const toggleWorkspaceCommentResolved = async (comment) => {
    if (!comment?.id || !readString(workspaceId)) return false
    setBusyId(resolvingCommentIds, comment.id, true)
    setSourceValue(workspaceCommentError, '')
    try {
      const updated = await resolveWorkspaceCommentApi?.(readString(workspaceId), comment.id, !comment.resolved)
      upsertWorkspaceComment(updated)
      return true
    } catch (error) {
      setSourceValue(workspaceCommentError, errorMessage(error, '댓글 상태를 변경하지 못했습니다.'))
      return false
    } finally {
      setBusyId(resolvingCommentIds, comment.id, false)
    }
  }

  const deleteWorkspaceComment = async (comment) => {
    if (!comment?.id || !readString(workspaceId)) return false
    const id = commentId(comment)
    setBusyId(deletingCommentIds, comment.id, true)
    setSourceValue(workspaceCommentError, '')
    try {
      await deleteWorkspaceCommentApi?.(readString(workspaceId), comment.id)
      setSourceValue(workspaceComments, readRows(workspaceComments).filter((item) => commentId(item) !== id))
      if (readString(workspaceCommentEditingId) === id) cancelWorkspaceCommentEdit()
      return true
    } catch (error) {
      setSourceValue(workspaceCommentError, errorMessage(error, '댓글을 삭제하지 못했습니다.'))
      return false
    } finally {
      setBusyId(deletingCommentIds, comment.id, false)
    }
  }

  const isCommentResolving = (id) => readRows(resolvingCommentIds).map(String).includes(String(id))
  const isCommentDeleting = (id) => readRows(deletingCommentIds).map(String).includes(String(id))
  const isCommentUpdating = (id) => readRows(updatingCommentIds).map(String).includes(String(id))

  const clearWorkspaceCommentAnchor = () => {
    resolveSource(editorApi)?.clearSelectedBlockAnchor?.()
    if (readString(workspaceCommentFilter) === 'block') {
      setSourceValue(workspaceCommentFilter, 'open')
    }
  }

  const focusWorkspaceCommentAnchor = async (comment) => {
    if (!comment?.anchorBlockId) return false
    await resolveSource(editorApi)?.focusBlockAnchor?.(comment.anchorBlockId)
    return true
  }

  return {
    upsertWorkspaceComment,
    createWorkspaceComment,
    isWorkspaceCommentAuthor,
    canEditWorkspaceComment,
    isWorkspaceCommentEditing,
    startWorkspaceCommentEdit,
    cancelWorkspaceCommentEdit,
    updateWorkspaceComment,
    toggleWorkspaceCommentResolved,
    deleteWorkspaceComment,
    isCommentResolving,
    isCommentDeleting,
    isCommentUpdating,
    clearWorkspaceCommentAnchor,
    focusWorkspaceCommentAnchor,
  }
}
