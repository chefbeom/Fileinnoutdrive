import { useWorkspaceCollaborationPersistenceSetup } from './useWorkspaceCollaborationPersistenceSetup.js'
import { useWorkspaceCommandCenter } from './useWorkspaceCommandCenter.js'
import { useWorkspaceFocusNavigation } from './useWorkspaceFocusNavigation.js'
import { useWorkspaceOverlaysBridge } from './useWorkspaceOverlaysBridge.js'

export const useWorkspaceCollaborationCommandSetup = ({
  platform = {},
  state = {},
  access = {},
  normalizers = {},
  refreshers = {},
  persistence = {},
  documents = {},
  commands = {},
  ui = {},
} = {}) => {
  const collaboration = useWorkspaceCollaborationPersistenceSetup({
    platform,
    state: {
      workspaceId: state.workspaceId,
      workspaceAssets: state.workspaceAssets,
      workspaceAssetLoading: state.workspaceAssetLoading,
      workspaceAssetError: state.workspaceAssetError,
      workspaceComments: state.workspaceComments,
      workspaceCommentLoading: state.workspaceCommentLoading,
      workspaceCommentError: state.workspaceCommentError,
      isWorkspacePanelCollapsed: state.isWorkspacePanelCollapsed,
      activeWorkspacePanelTab: state.activeWorkspacePanelTab,
      workspaceCommentFilter: state.workspaceCommentFilter,
      activeWorkspaceAssetId: state.activeWorkspaceAssetId,
      editorApi: state.editorApi,
      workspaceAccessRole: state.workspaceAccessRole,
      workspaceShareStatus: state.workspaceShareStatus,
      workspaceUuid: state.workspaceUuid,
      titleDirty: state.titleDirty,
      saveState: state.saveState,
      saveError: state.saveError,
      lastSavedAt: state.lastSavedAt,
      showWorkspaceShareModal: state.showWorkspaceShareModal,
      isEditorLoading: state.isEditorLoading,
      hasUnsavedChanges: state.hasUnsavedChanges,
      workspaceCommentInput: state.workspaceCommentInput,
      newWorkspaceComment: state.newWorkspaceComment,
      showWorkspaceMentionMenu: state.showWorkspaceMentionMenu,
      workspaceBlockCommentSummaries: state.workspaceBlockCommentSummaries,
    },
    access: {
      currentUserIdx: access.currentUserIdx,
      canManageWorkspaceShare: access.canManageWorkspaceShare,
      canCommentOnWorkspace: access.canCommentOnWorkspace,
    },
    normalizers,
    refreshers,
    persistence,
    ui: { showWorkspaceNotice: ui.showWorkspaceNotice },
  })

  const focus = useWorkspaceFocusNavigation({
    editorApi: state.editorApi,
    currentWorkspaceKey: state.currentWorkspaceKey,
    isWorkspacePanelCollapsed: state.isWorkspacePanelCollapsed,
    activeWorkspacePanelTab: state.activeWorkspacePanelTab,
    openWorkspaceDocument: documents.openWorkspaceDocument,
    focusWorkspaceMentionComments: collaboration.focusWorkspaceMentionComments,
  })

  const command = useWorkspaceCommandCenter({
    workspaceCommandBaseItems: state.workspaceCommandBaseItems,
    openWorkspaceDocument: documents.openWorkspaceDocument,
    applyWorkspaceTemplate: commands.applyWorkspaceTemplate,
    insertWorkspaceQuickBlock: commands.insertWorkspaceQuickBlock,
    isWorkspacePanelCollapsed: state.isWorkspacePanelCollapsed,
    activeWorkspacePanelTab: state.activeWorkspacePanelTab,
    createWorkspaceDocument: documents.createWorkspaceDocument,
    handleSave: commands.handleSave,
    toggleWorkspacePageLock: commands.toggleWorkspacePageLock,
    toggleCurrentWorkspaceDocumentFavorite: commands.toggleCurrentWorkspaceDocumentFavorite,
    openWorkspaceShare: collaboration.openWorkspaceShare,
    exportWorkspaceMarkdown: commands.exportWorkspaceMarkdown,
    focusWorkspaceSubpageComposer: commands.focusWorkspaceSubpageComposer,
    openWorkspaceParentPage: documents.openWorkspaceParentPage,
    focusWorkspaceMentionComments: collaboration.focusWorkspaceMentionComments,
  })

  const overlays = useWorkspaceOverlaysBridge({
    workspaceNotice: state.workspaceNotice,
    workspaceConfirm: state.workspaceConfirm,
    isWorkspaceCommandPaletteOpen: command.isWorkspaceCommandPaletteOpen,
    workspaceCommandQuery: command.workspaceCommandQuery,
    workspaceCommandActiveIndex: command.workspaceCommandActiveIndex,
    workspaceCommandItems: command.workspaceCommandItems,
    workspaceCommandEmptyLabel: command.workspaceCommandEmptyLabel,
    showWorkspaceShareModal: state.showWorkspaceShareModal,
    workspaceId: state.workspaceId,
    workspaceUuid: state.workspaceUuid,
    workspaceShareStatus: state.workspaceShareStatus,
    workspaceCommandInput: command.workspaceCommandInput,
    runWorkspaceNoticeAction: ui.runWorkspaceNoticeAction,
    closeWorkspaceNotice: ui.closeWorkspaceNotice,
    closeWorkspaceConfirm: ui.closeWorkspaceConfirm,
    confirmWorkspaceAction: ui.confirmWorkspaceAction,
    moveWorkspaceCommandSelection: command.moveWorkspaceCommandSelection,
    executeWorkspaceCommand: command.executeWorkspaceCommand,
    closeWorkspaceCommandPalette: command.closeWorkspaceCommandPalette,
    handleWorkspaceShareRefresh: collaboration.handleWorkspaceShareRefresh,
  })

  return {
    ...collaboration,
    ...focus,
    ...command,
    ...overlays,
  }
}
