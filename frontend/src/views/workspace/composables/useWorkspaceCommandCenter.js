import { useWorkspaceCommandPalette } from './useWorkspaceCommandPalette.js'

const noop = () => {}

export const openWorkspaceCommandPanel = ({
  isWorkspacePanelCollapsed,
  activeWorkspacePanelTab,
} = {}, panelId) => {
  if (isWorkspacePanelCollapsed) {
    isWorkspacePanelCollapsed.value = false
  }
  if (activeWorkspacePanelTab) {
    activeWorkspacePanelTab.value = panelId
  }
}

export const createWorkspaceCommandActionHandlers = ({
  createWorkspaceDocument = noop,
  handleSave = noop,
  toggleWorkspacePageLock = noop,
  toggleCurrentWorkspaceDocumentFavorite = noop,
  openWorkspaceShare = noop,
  exportWorkspaceMarkdown = noop,
  focusWorkspaceSubpageComposer = noop,
  openWorkspaceParentPage = noop,
  focusWorkspaceMentionComments = noop,
} = {}) => ({
  new: createWorkspaceDocument,
  save: handleSave,
  lock: toggleWorkspacePageLock,
  'favorite-current': toggleCurrentWorkspaceDocumentFavorite,
  share: openWorkspaceShare,
  'export-markdown': exportWorkspaceMarkdown,
  subpage: focusWorkspaceSubpageComposer,
  parent: openWorkspaceParentPage,
  mentions: focusWorkspaceMentionComments,
})

export const useWorkspaceCommandCenter = ({
  workspaceCommandBaseItems,
  openWorkspaceDocument = noop,
  applyWorkspaceTemplate = noop,
  insertWorkspaceQuickBlock = noop,
  isWorkspacePanelCollapsed,
  activeWorkspacePanelTab,
  createWorkspaceDocument = noop,
  handleSave = noop,
  toggleWorkspacePageLock = noop,
  toggleCurrentWorkspaceDocumentFavorite = noop,
  openWorkspaceShare = noop,
  exportWorkspaceMarkdown = noop,
  focusWorkspaceSubpageComposer = noop,
  openWorkspaceParentPage = noop,
  focusWorkspaceMentionComments = noop,
  commandPaletteFactory = useWorkspaceCommandPalette,
} = {}) =>
  commandPaletteFactory({
    workspaceCommandBaseItems,
    onDocument: openWorkspaceDocument,
    onTemplate: applyWorkspaceTemplate,
    onBlock: insertWorkspaceQuickBlock,
    onPanel: (panelId) => openWorkspaceCommandPanel({
      isWorkspacePanelCollapsed,
      activeWorkspacePanelTab,
    }, panelId),
    actionHandlers: createWorkspaceCommandActionHandlers({
      createWorkspaceDocument,
      handleSave,
      toggleWorkspacePageLock,
      toggleCurrentWorkspaceDocumentFavorite,
      openWorkspaceShare,
      exportWorkspaceMarkdown,
      focusWorkspaceSubpageComposer,
      openWorkspaceParentPage,
      focusWorkspaceMentionComments,
    }),
  })
