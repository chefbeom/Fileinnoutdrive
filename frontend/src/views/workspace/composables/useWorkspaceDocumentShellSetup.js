import { useWorkspaceBacklinks } from './useWorkspaceBacklinks.js'
import { useWorkspaceDocumentCollections } from './useWorkspaceDocumentCollections.js'
import { useWorkspaceDocumentRefresh } from './useWorkspaceDocumentRefresh.js'
import { useWorkspaceOverviewState } from './useWorkspaceOverviewState.js'
import { useWorkspacePageIndexRefresh } from './useWorkspacePageIndexRefresh.js'
import { useWorkspaceShellState } from './useWorkspaceShellState.js'
import { useWorkspaceStatusIndicators } from './useWorkspaceStatusIndicators.js'

export const useWorkspaceDocumentShellSetup = ({
  platform = {},
  state = {},
  documents = {},
  options = {},
  access = {},
  people = {},
  editor = {},
  comments = {},
  assets = {},
  sharing = {},
  preferences = {},
  formatters = {},
} = {}) => {
  const collections = useWorkspaceDocumentCollections({
    personalItems: documents.personalItems,
    sharedItems: documents.sharedItems,
    workspaceDocumentQuery: state.workspaceDocumentQuery,
    workspaceDocumentSections: state.workspaceDocumentSections,
    workspacePageIndexRows: state.workspacePageIndexRows,
    currentWorkspaceKey: state.currentWorkspaceKey,
    workspaceParentPageId: state.workspaceParentPageId,
    workspaceParentPageTitle: state.workspaceParentPageTitle,
    favoriteWorkspaceDocumentIds: state.favoriteWorkspaceDocumentIds,
    recentWorkspaceDocumentIds: state.recentWorkspaceDocumentIds,
    documentSearchText: editor.documentSearchText,
    documentWorkspaceLinks: editor.documentWorkspaceLinks,
  })

  const shell = useWorkspaceShellState({
    workspacePropertyIcon: state.workspacePropertyIcon,
    workspacePropertyCoverColor: state.workspacePropertyCoverColor,
    workspacePropertyStatus: state.workspacePropertyStatus,
    workspacePropertyPriority: state.workspacePropertyPriority,
    workspacePropertyOwnerEmail: state.workspacePropertyOwnerEmail,
    selectedWorkspacePropertyOwner: people.selectedWorkspacePropertyOwner,
    workspacePropertyOwnerName: state.workspacePropertyOwnerName,
    workspacePropertyDueDate: state.workspacePropertyDueDate,
    workspacePropertyTags: people.workspacePropertyTags,
    workspacePageLocked: state.workspacePageLocked,
    workspaceTaskTodayKeyFor: formatters.workspaceTaskTodayKeyFor,
    canEditWorkspace: access.canEditWorkspace,
    hasUnsavedChanges: state.hasUnsavedChanges,
    isWorkspacePageLocked: access.isWorkspacePageLocked,
    canFavoriteCurrentWorkspaceDocument: access.canFavoriteCurrentWorkspaceDocument,
    isCurrentWorkspaceDocumentFavorite: access.isCurrentWorkspaceDocumentFavorite,
    canManageWorkspaceShare: access.canManageWorkspaceShare,
    isValid: state.isValid,
    canExportWorkspaceMarkdown: access.canExportWorkspaceMarkdown,
    canStartWorkspaceSubpage: access.canStartWorkspaceSubpage,
    currentWorkspaceParentPage: collections.currentWorkspaceParentPage,
    currentUserEmail: people.currentUserEmail,
    mentionedWorkspaceComments: comments.mentionedWorkspaceComments,
    workspaceDocuments: collections.workspaceDocuments,
    favoriteWorkspaceDocumentIds: state.favoriteWorkspaceDocumentIds,
    canShowWorkspaceTemplates: access.canShowWorkspaceTemplates,
    workspaceTemplates: options.workspaceTemplates,
    canInsertWorkspaceQuickBlock: access.canInsertWorkspaceQuickBlock,
    quickBlocks: options.quickBlockOptions,
    workspacePanelTabs: state.workspacePanelTabs,
    activeWorkspacePanelTab: state.activeWorkspacePanelTab,
    pageFocusedPanelIds: options.pageFocusedPanelIds,
  })

  const backlinks = useWorkspaceBacklinks({
    workspaceId: state.workspaceId,
    workspaceDocuments: collections.workspaceDocuments,
    title: state.title,
    fetchWorkspaceDocument: (documentId) => platform.api?.getPost?.(documentId),
  })

  const statusIndicators = useWorkspaceStatusIndicators({
    saveState: state.saveState,
    saveError: state.saveError,
    hasUnsavedChanges: state.hasUnsavedChanges,
    lastSavedAt: state.lastSavedAt,
    workspaceId: state.workspaceId,
    connectionStatus: state.connectionStatus,
    formatDateTimeFor: formatters.formatDateTimeFor,
  })

  const overview = useWorkspaceOverviewState({
    workspacePropertyStatusOption: people.workspacePropertyStatusOption,
    workspacePropertyPriorityOption: people.workspacePropertyPriorityOption,
    currentWorkspaceProperties: shell.currentWorkspaceProperties,
    documentStats: editor.documentStats,
    documentTasks: editor.documentTasks,
    documentTaskProgress: editor.documentTaskProgress,
    completedDocumentTasks: editor.completedDocumentTasks,
    unresolvedWorkspaceComments: comments.unresolvedWorkspaceComments,
    resolvedWorkspaceComments: comments.resolvedWorkspaceComments,
    linkedWorkspaceDocuments: collections.linkedWorkspaceDocuments,
    workspaceAssets: assets.workspaceAssets,
    workspaceImages: assets.workspaceImages,
    workspaceFiles: assets.workspaceFiles,
    workspaceShareStatusLabel: sharing.workspaceShareStatusLabel,
    workspaceAccessRole: state.workspaceAccessRole,
    roleLabelFor: formatters.roleLabelFor,
    workspaceShareStatus: state.workspaceShareStatus,
    isWorkspacePropertyDueOverdue: shell.isWorkspacePropertyDueOverdue,
    workspacePropertyDueDate: state.workspacePropertyDueDate,
    overdueDocumentTasks: editor.overdueDocumentTasks,
    lastSavedAt: state.lastSavedAt,
    saveStatusLabel: statusIndicators.saveStatusLabel,
    saveState: state.saveState,
    hasUnsavedChanges: state.hasUnsavedChanges,
    formatDateTimeFor: formatters.formatDateTimeFor,
    canModifyWorkspacePage: access.canModifyWorkspacePage,
    isWorkspacePageLocked: access.isWorkspacePageLocked,
    workspaceLockStatusLabel: access.workspaceLockStatusLabel,
    canCommentOnWorkspace: access.canCommentOnWorkspace,
    canManageAssets: access.canManageAssets,
    canManageWorkspaceShare: access.canManageWorkspaceShare,
    workspaceId: state.workspaceId,
    workspaceMemberLoading: state.workspaceMemberLoading,
    workspaceMemberRows: people.workspaceMemberRows,
  })

  const pageIndexRefresh = useWorkspacePageIndexRefresh({
    workspaceDocuments: () => collections.workspaceDocuments.value,
    workspacePageIndexRows: state.workspacePageIndexRows,
    workspacePageIndexLoading: state.workspacePageIndexLoading,
    workspacePageIndexError: state.workspacePageIndexError,
    workspacePageIndexRefreshedAt: state.workspacePageIndexRefreshedAt,
    fetchWorkspaceDocument: (documentId) => platform.api?.getPost?.(documentId),
    propertyOptions: () => options.propertyOptions,
    statusOptions: options.statusOptions,
    priorityOptions: options.priorityOptions,
  })

  const documentRefresh = useWorkspaceDocumentRefresh({
    loading: state.workspaceDocumentsLoading,
    loadDocuments: documents.loadDocuments,
    loadDocumentSections: preferences.loadWorkspaceDocumentSections,
    pruneRecentDocuments: preferences.pruneRecentWorkspaceDocuments,
    persistRecentDocuments: preferences.persistRecentWorkspaceDocuments,
    refreshBacklinks: backlinks.refreshWorkspaceBacklinks,
    refreshPageIndex: pageIndexRefresh.refreshWorkspacePageIndex,
  })

  return {
    ...collections,
    ...shell,
    ...backlinks,
    ...statusIndicators,
    ...overview,
    ...pageIndexRefresh,
    ...documentRefresh,
  }
}
