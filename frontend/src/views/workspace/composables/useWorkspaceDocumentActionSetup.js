import { useWorkspaceCurrentDocumentActions } from './useWorkspaceCurrentDocumentActions.js'
import { useWorkspaceDocumentFavorites } from './useWorkspaceDocumentFavorites.js'
import { useWorkspaceDocumentLinkActions } from './useWorkspaceDocumentLinkActions.js'
import { useWorkspaceDocumentLinkCopy } from './useWorkspaceDocumentLinkCopy.js'
import { useWorkspaceDocumentNavigation } from './useWorkspaceDocumentNavigation.js'
import { useWorkspaceSubpageActions } from './useWorkspaceSubpageActions.js'

export const useWorkspaceDocumentActionSetup = ({
  platform = {},
  state = {},
  propertyOptions = {},
  preferences = {},
  workspace = {},
  guards = {},
  editor = {},
  refreshers = {},
  ui = {},
  documentIdFor,
} = {}) => {
  const linkCopy = useWorkspaceDocumentLinkCopy({ documentIdFor })

  const navigation = useWorkspaceDocumentNavigation({
    currentWorkspaceKey: state.currentWorkspaceKey,
    route: platform.route,
    router: platform.router,
    trackRecentWorkspaceDocument: preferences.trackRecentWorkspaceDocument,
    confirmDiscardIfNeeded: guards.confirmDiscardIfNeeded,
    setupEditor: editor.setupEditor,
  })

  const linkActions = useWorkspaceDocumentLinkActions({
    editorApi: state.editorApi,
    isEditorLoading: state.isEditorLoading,
    workspaceMarkdownExporting: state.workspaceMarkdownExporting,
    canModifyWorkspacePage: state.canModifyWorkspacePage,
    title: state.title,
    workspacePropertyStatusOption: state.workspacePropertyStatusOption,
    workspacePropertyPriorityOption: state.workspacePropertyPriorityOption,
    workspacePropertyOwnerEmail: state.workspacePropertyOwnerEmail,
    workspacePropertyOwnerName: state.workspacePropertyOwnerName,
    workspacePropertyDueDate: state.workspacePropertyDueDate,
    workspacePropertyTags: state.workspacePropertyTags,
    documentIdFor,
    markWorkspaceDocumentLinkCopied: linkCopy.markWorkspaceDocumentLinkCopied,
    showWorkspaceNotice: ui.showWorkspaceNotice,
  })

  let isWorkspaceDocumentFavorite = () => false
  const currentDocument = useWorkspaceCurrentDocumentActions({
    workspaceId: state.workspaceId,
    route: platform.route,
    title: state.title,
    workspaceDocumentById: workspace.workspaceDocumentById,
    workspaceAccessRole: state.workspaceAccessRole,
    documentUrlFor: linkActions.workspaceDocumentAbsoluteUrl,
    isFavoriteDocument: (...args) => isWorkspaceDocumentFavorite(...args),
  })

  const favorites = useWorkspaceDocumentFavorites({
    favoriteWorkspaceDocumentIds: preferences.favoriteWorkspaceDocumentIds,
    currentWorkspaceLinkDocument: () => currentDocument.currentWorkspaceLinkDocument.value,
    canFavoriteCurrentWorkspaceDocument: () => currentDocument.canFavoriteCurrentWorkspaceDocument.value,
    persistFavoriteWorkspaceDocuments: preferences.persistFavoriteWorkspaceDocuments,
  })
  isWorkspaceDocumentFavorite = favorites.isWorkspaceDocumentFavorite

  const subpages = useWorkspaceSubpageActions({
    api: platform.api,
    editorApi: state.editorApi,
    title: state.title,
    currentWorkspaceProperties: workspace.currentWorkspaceProperties,
    workspacePropertyOptions: propertyOptions,
    workspaceSubpageInput: state.workspaceSubpageInput,
    workspaceSubpageTitle: state.workspaceSubpageTitle,
    workspaceSubpageCreating: state.workspaceSubpageCreating,
    workspaceSubpageError: state.workspaceSubpageError,
    canStartWorkspaceSubpage: state.canStartWorkspaceSubpage,
    canCreateWorkspaceSubpage: state.canCreateWorkspaceSubpage,
    isWorkspacePanelCollapsed: state.isWorkspacePanelCollapsed,
    activeWorkspacePanelTab: state.activeWorkspacePanelTab,
    workspaceDocumentPath: linkActions.workspaceDocumentPath,
    ensureWorkspacePersisted: workspace.ensureWorkspacePersisted,
    persistWorkspace: workspace.persistWorkspace,
    refreshWorkspaceDocuments: refreshers.refreshWorkspaceDocuments,
    refreshWorkspacePageIndex: refreshers.refreshWorkspacePageIndex,
  })

  return {
    ...linkCopy,
    ...navigation,
    ...linkActions,
    ...favorites,
    ...currentDocument,
    ...subpages,
  }
}
