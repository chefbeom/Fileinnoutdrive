import { computed } from 'vue'

import {
  isWorkspacePageIndexRowSelected as isWorkspacePageIndexRowSelectedModel,
  toggleVisibleWorkspacePageIndexSelectedIds,
  toggleWorkspacePageIndexSelectedIds,
} from '../services/workspacePageIndex.js'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const setSourceValue = (source, value) => {
  if (source && typeof source === 'object' && 'value' in source) {
    source.value = value
  }
}
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}
const readBoolean = (source) => Boolean(resolveSource(source))
const readString = (source) => String(resolveSource(source) || '')
const eventChecked = (event) => Boolean(event?.target?.checked)

export const useWorkspacePageIndexSelection = ({
  workspacePageIndexRows,
  visibleWorkspacePageIndexRows,
  workspacePageIndexSelectedIds,
  workspacePageIndexBulkUpdating,
  workspacePageIndexBulkStatus,
  workspacePageIndexBulkPriority,
  workspacePageIndexBulkOwnerEmail,
  workspacePageIndexBulkDueDate,
  workspacePageIndexBulkClearDueDate,
} = {}) => {
  const visibleEditableWorkspacePageIndexRows = computed(() =>
    readRows(visibleWorkspacePageIndexRows).filter((row) => row?.canEditProperties),
  )

  const selectedWorkspacePageIndexRows = computed(() => {
    const selectedIds = new Set(readRows(workspacePageIndexSelectedIds).map((id) => String(id)))
    return readRows(workspacePageIndexRows).filter((row) =>
      selectedIds.has(String(row?.id)) && row?.canEditProperties,
    )
  })

  const areAllVisibleWorkspacePageIndexRowsSelected = computed(() => {
    const visibleIds = visibleEditableWorkspacePageIndexRows.value.map((row) => String(row.id))
    if (visibleIds.length === 0) return false
    const selectedIds = new Set(readRows(workspacePageIndexSelectedIds).map((id) => String(id)))
    return visibleIds.every((id) => selectedIds.has(id))
  })

  const canApplyWorkspacePageIndexBulkUpdate = computed(() =>
    selectedWorkspacePageIndexRows.value.length > 0 &&
    !readBoolean(workspacePageIndexBulkUpdating) &&
    Boolean(
      readString(workspacePageIndexBulkStatus) ||
      readString(workspacePageIndexBulkPriority) ||
      readString(workspacePageIndexBulkOwnerEmail) ||
      readString(workspacePageIndexBulkDueDate) ||
      readBoolean(workspacePageIndexBulkClearDueDate),
    ),
  )

  const isWorkspacePageIndexRowSelected = (row) =>
    isWorkspacePageIndexRowSelectedModel(row, readRows(workspacePageIndexSelectedIds))

  const toggleWorkspacePageIndexRowSelection = (row, event) => {
    setSourceValue(
      workspacePageIndexSelectedIds,
      toggleWorkspacePageIndexSelectedIds(
        readRows(workspacePageIndexSelectedIds),
        row,
        eventChecked(event),
      ),
    )
  }

  const toggleVisibleWorkspacePageIndexSelection = (event) => {
    setSourceValue(
      workspacePageIndexSelectedIds,
      toggleVisibleWorkspacePageIndexSelectedIds(
        readRows(workspacePageIndexSelectedIds),
        visibleEditableWorkspacePageIndexRows.value,
        eventChecked(event),
      ),
    )
  }

  const clearWorkspacePageIndexSelection = () => {
    setSourceValue(workspacePageIndexSelectedIds, [])
    setSourceValue(workspacePageIndexBulkStatus, '')
    setSourceValue(workspacePageIndexBulkPriority, '')
    setSourceValue(workspacePageIndexBulkOwnerEmail, '')
    setSourceValue(workspacePageIndexBulkDueDate, '')
    setSourceValue(workspacePageIndexBulkClearDueDate, false)
  }

  return {
    visibleEditableWorkspacePageIndexRows,
    selectedWorkspacePageIndexRows,
    areAllVisibleWorkspacePageIndexRowsSelected,
    canApplyWorkspacePageIndexBulkUpdate,
    isWorkspacePageIndexRowSelected,
    toggleWorkspacePageIndexRowSelection,
    toggleVisibleWorkspacePageIndexSelection,
    clearWorkspacePageIndexSelection,
  }
}
