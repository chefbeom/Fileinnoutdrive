import { computed } from 'vue'

import {
  createWorkspaceHealthItems,
  createWorkspacePermissionItems,
  createWorkspaceSummaryCards,
  workspaceMemberSummaryLabel as createWorkspaceMemberSummaryLabel,
} from '../services/workspaceOverview.js'

const resolveSource = (source) => {
  if (typeof source === 'function') return source()
  if (source && typeof source === 'object' && 'value' in source) return source.value
  return source
}
const readArray = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}
const readObject = (source) => {
  const value = resolveSource(source)
  return value && typeof value === 'object' ? value : {}
}
const readValue = (source, fallback = null) => resolveSource(source) ?? fallback
const readString = (source) => String(resolveSource(source) || '')
const readBoolean = (source) => Boolean(resolveSource(source))
const readLabel = (source) => readString(readObject(source).label)
const readLength = (source) => readArray(source).length

export const useWorkspaceOverviewState = ({
  workspacePropertyStatusOption,
  workspacePropertyPriorityOption,
  currentWorkspaceProperties,
  documentStats,
  documentTasks,
  documentTaskProgress,
  completedDocumentTasks,
  unresolvedWorkspaceComments,
  resolvedWorkspaceComments,
  linkedWorkspaceDocuments,
  workspaceAssets,
  workspaceImages,
  workspaceFiles,
  workspaceShareStatusLabel,
  workspaceAccessRole,
  roleLabelFor,
  workspaceShareStatus,
  isWorkspacePropertyDueOverdue,
  workspacePropertyDueDate,
  overdueDocumentTasks,
  lastSavedAt,
  saveStatusLabel,
  saveState,
  hasUnsavedChanges,
  formatDateTimeFor,
  canModifyWorkspacePage,
  isWorkspacePageLocked,
  workspaceLockStatusLabel,
  canCommentOnWorkspace,
  canManageAssets,
  canManageWorkspaceShare,
  workspaceId,
  workspaceMemberLoading,
  workspaceMemberRows,
} = {}) => {
  const workspaceSummaryCards = computed(() => createWorkspaceSummaryCards({
    statusLabel: readLabel(workspacePropertyStatusOption),
    priorityLabel: readLabel(workspacePropertyPriorityOption),
    ownerName: readString(readObject(currentWorkspaceProperties).ownerName),
    documentStats: readObject(documentStats),
    documentTaskCount: readLength(documentTasks),
    documentTaskProgress: readValue(documentTaskProgress, 0),
    completedDocumentTaskCount: readLength(completedDocumentTasks),
    unresolvedCommentCount: readLength(unresolvedWorkspaceComments),
    resolvedCommentCount: readLength(resolvedWorkspaceComments),
    linkedDocumentCount: readLength(linkedWorkspaceDocuments),
    assetCount: readLength(workspaceAssets),
    imageCount: readLength(workspaceImages),
    fileCount: readLength(workspaceFiles),
  }))

  const workspaceHealthItems = computed(() => createWorkspaceHealthItems({
    shareStatusLabel: readString(workspaceShareStatusLabel),
    accessRoleLabel: typeof roleLabelFor === 'function'
      ? roleLabelFor(readString(workspaceAccessRole))
      : readString(workspaceAccessRole),
    ownerName: readString(readObject(currentWorkspaceProperties).ownerName),
    shareStatus: readString(workspaceShareStatus) || 'Private',
    isPropertyDueOverdue: readBoolean(isWorkspacePropertyDueOverdue),
    propertyDueDate: readString(workspacePropertyDueDate),
    overdueTaskCount: readLength(overdueDocumentTasks),
    unresolvedCommentCount: readLength(unresolvedWorkspaceComments),
    lastSavedAt: readValue(lastSavedAt),
    saveStatusLabel: readString(saveStatusLabel),
    saveState: readString(saveState) || 'idle',
    hasUnsavedChanges: readBoolean(hasUnsavedChanges),
    formatDateTimeFor,
  }))

  const workspacePermissionItems = computed(() => createWorkspacePermissionItems({
    canModifyWorkspacePage: readBoolean(canModifyWorkspacePage),
    isWorkspacePageLocked: readBoolean(isWorkspacePageLocked),
    workspaceLockStatusLabel: readString(workspaceLockStatusLabel),
    canCommentOnWorkspace: readBoolean(canCommentOnWorkspace),
    canManageAssets: readBoolean(canManageAssets),
    canManageWorkspaceShare: readBoolean(canManageWorkspaceShare),
  }))

  const workspaceMemberSummaryLabel = computed(() => createWorkspaceMemberSummaryLabel({
    workspaceId: readValue(workspaceId),
    canManageWorkspaceShare: readBoolean(canManageWorkspaceShare),
    memberLoading: readBoolean(workspaceMemberLoading),
    memberCount: readLength(workspaceMemberRows),
  }))

  return {
    workspaceSummaryCards,
    workspaceHealthItems,
    workspacePermissionItems,
    workspaceMemberSummaryLabel,
  }
}