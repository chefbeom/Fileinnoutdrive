import { nextTick } from 'vue'

import {
  createWorkspacePageIndexBulkPatch,
  findWorkspacePageIndexRowById,
  isWorkspacePageIndexRowBusy,
  setWorkspacePageIndexRowBusyIds,
  workspacePageIndexNextStatusId,
} from '../services/workspacePageIndex.js'
import { normalizeWorkspacePropertyTags } from '../services/workspaceProperties.js'

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
const eventValue = (event) => String(event?.target?.value || '')

export const useWorkspacePageIndexMutations = ({
  workspacePageIndexRows,
  workspacePageIndexUpdatingIds,
  workspacePageIndexError,
  workspaceBoardDraggingId,
  workspaceBoardDragOverStatus,
  currentWorkspaceKey,
  editorApi,
  fetchWorkspaceDocument,
  saveWorkspaceDocument,
  extractWorkspacePropertiesFromContents,
  normalizeWorkspaceProperties,
  applyWorkspaceProperties,
  serializeWorkspaceSnapshotWithProperties,
  persistWorkspace,
  refreshWorkspaceDocuments,
  refreshWorkspacePageIndex,
  workspacePageIndexOwnerOptions,
  selectedWorkspacePageIndexRows,
  canApplyWorkspacePageIndexBulkUpdate,
  clearWorkspacePageIndexSelection,
  workspacePageIndexBulkStatus,
  workspacePageIndexBulkPriority,
  workspacePageIndexBulkOwnerEmail,
  workspacePageIndexBulkDueDate,
  workspacePageIndexBulkClearDueDate,
  workspacePageIndexBulkUpdating,
  workspacePropertyOwnerCandidates,
  statusOptions,
} = {}) => {
  const isWorkspacePageIndexRowUpdating = (row) =>
    isWorkspacePageIndexRowBusy(row, readRows(workspacePageIndexUpdatingIds))

  const setWorkspacePageIndexRowUpdating = (row, busy) => {
    setSourceValue(
      workspacePageIndexUpdatingIds,
      setWorkspacePageIndexRowBusyIds(readRows(workspacePageIndexUpdatingIds), row, busy),
    )
  }

  const updateWorkspacePageIndexRowProperties = async (row, patch = {}) => {
    const id = String(row?.id || '')
    if (!id || !row?.canEditProperties || isWorkspacePageIndexRowUpdating(row)) return false

    setWorkspacePageIndexRowUpdating(row, true)
    setSourceValue(workspacePageIndexError, '')

    try {
      const data = await fetchWorkspaceDocument?.(id)
      const currentProperties = extractWorkspacePropertiesFromContents?.(data?.contents) || {}
      const nextProperties = normalizeWorkspaceProperties?.({
        ...currentProperties,
        ...patch,
      }) || {
        ...currentProperties,
        ...patch,
      }

      const currentEditorApi = resolveSource(editorApi)
      if (id === readString(currentWorkspaceKey) && currentEditorApi?.savePost) {
        applyWorkspaceProperties?.(nextProperties)
        await nextTick()
        await persistWorkspace?.({ navigateNewDocument: false })
      } else {
        await saveWorkspaceDocument?.({
          idx: id,
          title: data?.title || row.title || '제목 없음',
          contents: serializeWorkspaceSnapshotWithProperties?.(data?.contents, nextProperties),
        })
        await refreshWorkspaceDocuments?.()
      }

      await refreshWorkspacePageIndex?.()
      return true
    } catch (error) {
      setSourceValue(workspacePageIndexError, errorMessage(error, '페이지 속성을 저장하지 못했습니다.'))
      return false
    } finally {
      setWorkspacePageIndexRowUpdating(row, false)
    }
  }

  const updateWorkspacePageIndexRowOwner = async (row, event) => {
    const ownerEmail = eventValue(event).trim()
    if (!ownerEmail) {
      return updateWorkspacePageIndexRowProperties(row, { ownerEmail: '', ownerName: '' })
    }

    const owner = (workspacePageIndexOwnerOptions?.(row) || []).find(
      (candidate) => String(candidate.email || '').toLowerCase() === ownerEmail.toLowerCase(),
    )
    return updateWorkspacePageIndexRowProperties(row, {
      ownerEmail,
      ownerName: owner?.name || ownerEmail,
    })
  }

  const updateWorkspacePageIndexRowTags = async (row, event) =>
    updateWorkspacePageIndexRowProperties(row, {
      tags: normalizeWorkspacePropertyTags(eventValue(event)),
    })

  const updateWorkspacePageIndexBulkProperties = async () => {
    if (!readBoolean(canApplyWorkspacePageIndexBulkUpdate)) return false
    const patch = createWorkspacePageIndexBulkPatch({
      status: readString(workspacePageIndexBulkStatus),
      priority: readString(workspacePageIndexBulkPriority),
      ownerEmail: readString(workspacePageIndexBulkOwnerEmail),
      dueDate: readString(workspacePageIndexBulkDueDate),
      clearDueDate: readBoolean(workspacePageIndexBulkClearDueDate),
      ownerCandidates: readRows(workspacePropertyOwnerCandidates),
    })
    const rows = [...readRows(selectedWorkspacePageIndexRows)]
    if (rows.length === 0 || Object.keys(patch).length === 0) return false

    setSourceValue(workspacePageIndexBulkUpdating, true)
    try {
      for (const row of rows) {
        await updateWorkspacePageIndexRowProperties(row, patch)
      }
      clearWorkspacePageIndexSelection?.()
      return true
    } finally {
      setSourceValue(workspacePageIndexBulkUpdating, false)
    }
  }

  const moveWorkspaceBoardCardStatus = async (row, direction) => {
    const nextStatus = workspacePageIndexNextStatusId(row, direction, readRows(statusOptions))
    if (!nextStatus) return false
    return updateWorkspacePageIndexRowProperties(row, { status: nextStatus })
  }

  const clearWorkspaceBoardDrag = () => {
    setSourceValue(workspaceBoardDraggingId, '')
    setSourceValue(workspaceBoardDragOverStatus, '')
  }

  const findWorkspaceBoardRowById = (rowId) =>
    findWorkspacePageIndexRowById(readRows(workspacePageIndexRows), rowId)

  const startWorkspaceBoardCardDrag = (event, row) => {
    if (!row?.canEditProperties || isWorkspacePageIndexRowUpdating(row)) {
      event?.preventDefault?.()
      return false
    }
    const rowId = String(row.id)
    setSourceValue(workspaceBoardDraggingId, rowId)
    setSourceValue(workspaceBoardDragOverStatus, row.status || '')
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', rowId)
    }
    return true
  }

  const setWorkspaceBoardDropTarget = (status) => {
    if (!readString(workspaceBoardDraggingId)) return
    setSourceValue(workspaceBoardDragOverStatus, status)
  }

  const clearWorkspaceBoardDropTarget = (event, status) => {
    if (readString(workspaceBoardDragOverStatus) !== status) return
    if (event?.currentTarget?.contains?.(event.relatedTarget)) return
    setSourceValue(workspaceBoardDragOverStatus, '')
  }

  const dropWorkspaceBoardCardStatus = async (event, status) => {
    const rowId = event?.dataTransfer?.getData('text/plain') || readString(workspaceBoardDraggingId)
    const row = findWorkspaceBoardRowById(rowId)
    if (!row || !row.canEditProperties || isWorkspacePageIndexRowUpdating(row)) {
      clearWorkspaceBoardDrag()
      return false
    }
    if (row.status === status) {
      clearWorkspaceBoardDrag()
      return false
    }
    try {
      return await updateWorkspacePageIndexRowProperties(row, { status })
    } finally {
      clearWorkspaceBoardDrag()
    }
  }

  return {
    isWorkspacePageIndexRowUpdating,
    setWorkspacePageIndexRowUpdating,
    updateWorkspacePageIndexRowProperties,
    updateWorkspacePageIndexRowOwner,
    updateWorkspacePageIndexRowTags,
    updateWorkspacePageIndexBulkProperties,
    moveWorkspaceBoardCardStatus,
    clearWorkspaceBoardDrag,
    startWorkspaceBoardCardDrag,
    setWorkspaceBoardDropTarget,
    clearWorkspaceBoardDropTarget,
    dropWorkspaceBoardCardStatus,
  }
}
