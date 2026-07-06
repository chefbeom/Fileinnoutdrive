import { computed } from 'vue'

import { createWorkspaceCommandBaseItems } from '../services/workspaceCommands.js'
import { normalizeWorkspaceProperties } from '../services/workspaceProperties.js'

const resolveSource = (source) => {
  if (typeof source === 'function') return source()
  if (source && typeof source === 'object' && 'value' in source) return source.value
  return source
}

const readArray = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}
const readBoolean = (source) => Boolean(resolveSource(source))
const readObject = (source) => {
  const value = resolveSource(source)
  return value && typeof value === 'object' ? value : {}
}
const readString = (source) => String(resolveSource(source) || '')
const readValue = (source, fallback = null) => resolveSource(source) ?? fallback

export const useWorkspaceShellState = ({
  workspacePropertyIcon,
  workspacePropertyCoverColor,
  workspacePropertyStatus,
  workspacePropertyPriority,
  workspacePropertyOwnerEmail,
  selectedWorkspacePropertyOwner,
  workspacePropertyOwnerName,
  workspacePropertyDueDate,
  workspacePropertyTags,
  workspacePageLocked,
  workspaceTaskTodayKeyFor,
  canEditWorkspace,
  hasUnsavedChanges,
  isWorkspacePageLocked,
  canFavoriteCurrentWorkspaceDocument,
  isCurrentWorkspaceDocumentFavorite,
  canManageWorkspaceShare,
  isValid,
  canExportWorkspaceMarkdown,
  canStartWorkspaceSubpage,
  currentWorkspaceParentPage,
  currentUserEmail,
  mentionedWorkspaceComments,
  workspaceDocuments,
  favoriteWorkspaceDocumentIds,
  canShowWorkspaceTemplates,
  workspaceTemplates,
  canInsertWorkspaceQuickBlock,
  quickBlocks,
  workspacePanelTabs,
  activeWorkspacePanelTab,
  pageFocusedPanelIds = [],
} = {}) => {
  const currentWorkspaceProperties = computed(() => {
    const ownerEmail = readString(workspacePropertyOwnerEmail)
    return normalizeWorkspaceProperties({
      icon: readString(workspacePropertyIcon),
      coverColor: readString(workspacePropertyCoverColor),
      status: readString(workspacePropertyStatus),
      priority: readString(workspacePropertyPriority),
      ownerEmail,
      ownerName: ownerEmail
        ? readString(readObject(selectedWorkspacePropertyOwner).name || workspacePropertyOwnerName)
        : '',
      dueDate: readString(workspacePropertyDueDate),
      tags: readArray(workspacePropertyTags),
      locked: readBoolean(workspacePageLocked),
    })
  })

  const isWorkspacePropertyDueOverdue = computed(() => {
    const dueDate = readString(workspacePropertyDueDate)
    const status = readString(workspacePropertyStatus)
    const todayKey = typeof workspaceTaskTodayKeyFor === 'function'
      ? workspaceTaskTodayKeyFor()
      : readString(workspaceTaskTodayKeyFor)
    return Boolean(dueDate && status !== 'done' && dueDate < todayKey)
  })

  const workspaceCommandBaseItems = computed(() => createWorkspaceCommandBaseItems({
    canEditWorkspace: readBoolean(canEditWorkspace),
    hasUnsavedChanges: readBoolean(hasUnsavedChanges),
    isWorkspacePageLocked: readBoolean(isWorkspacePageLocked),
    canFavoriteCurrentWorkspaceDocument: readBoolean(canFavoriteCurrentWorkspaceDocument),
    isCurrentWorkspaceDocumentFavorite: readBoolean(isCurrentWorkspaceDocumentFavorite),
    canManageWorkspaceShare: readBoolean(canManageWorkspaceShare),
    isValid: readBoolean(isValid),
    canExportWorkspaceMarkdown: readBoolean(canExportWorkspaceMarkdown),
    canStartWorkspaceSubpage: readBoolean(canStartWorkspaceSubpage),
    currentWorkspaceParentPage: readValue(currentWorkspaceParentPage),
    currentUserEmail: readString(currentUserEmail),
    mentionedWorkspaceCommentCount: readArray(mentionedWorkspaceComments).length,
    documents: readArray(workspaceDocuments),
    favoriteDocumentIds: readArray(favoriteWorkspaceDocumentIds),
    canShowWorkspaceTemplates: readBoolean(canShowWorkspaceTemplates),
    templates: readArray(workspaceTemplates),
    canInsertWorkspaceQuickBlock: readBoolean(canInsertWorkspaceQuickBlock),
    quickBlocks: readArray(quickBlocks),
    panelTabs: readArray(workspacePanelTabs),
  }))

  const isWorkspacePanelVisible = (panelId) => {
    const activePanelId = readString(activeWorkspacePanelTab)
    return activePanelId === 'all'
      ? readArray(pageFocusedPanelIds).includes(panelId)
      : activePanelId === panelId
  }

  return {
    currentWorkspaceProperties,
    isWorkspacePropertyDueOverdue,
    workspaceCommandBaseItems,
    isWorkspacePanelVisible,
  }
}