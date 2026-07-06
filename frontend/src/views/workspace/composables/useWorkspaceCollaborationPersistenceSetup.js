import { useWorkspaceAssetsCommentsRealtime } from './useWorkspaceAssetsCommentsRealtime.js'
import { useWorkspaceCommentComposer } from './useWorkspaceCommentComposer.js'
import { useWorkspacePersistence } from './useWorkspacePersistence.js'
import { useWorkspaceShareActions } from './useWorkspaceShareActions.js'

export const useWorkspaceCollaborationPersistenceSetup = ({
  platform = {},
  state = {},
  access = {},
  normalizers = {},
  refreshers = {},
  persistence = {},
  ui = {},
} = {}) => {
  const realtime = useWorkspaceAssetsCommentsRealtime({
    workspaceId: state.workspaceId,
    workspaceAssets: state.workspaceAssets,
    workspaceAssetLoading: state.workspaceAssetLoading,
    workspaceAssetError: state.workspaceAssetError,
    workspaceComments: state.workspaceComments,
    workspaceCommentLoading: state.workspaceCommentLoading,
    workspaceCommentError: state.workspaceCommentError,
    currentUserIdx: access.currentUserIdx,
    isWorkspacePanelCollapsed: state.isWorkspacePanelCollapsed,
    activeWorkspacePanelTab: state.activeWorkspacePanelTab,
    workspaceCommentFilter: state.workspaceCommentFilter,
    activeWorkspaceAssetId: state.activeWorkspaceAssetId,
    editorApi: state.editorApi,
    getAccessToken: () => platform.authStore?.token,
    loadWorkspaceAssets: (targetWorkspaceId) => platform.api.getWorkspaceAssets(targetWorkspaceId),
    loadWorkspaceComments: (targetWorkspaceId) => platform.api.getWorkspaceComments(targetWorkspaceId),
    normalizeWorkspaceAsset: normalizers.normalizeWorkspaceAsset,
    normalizeWorkspaceComment: normalizers.normalizeWorkspaceComment,
    isWorkspaceCommentMentioningCurrentUser: normalizers.isWorkspaceCommentMentioningCurrentUser,
    commentAnchorLabel: normalizers.commentAnchorLabel,
    upsertWorkspaceComment: normalizers.upsertWorkspaceComment,
    showWorkspaceNotice: ui.showWorkspaceNotice,
    assetErrorMessage: 'Workspace assets could not be loaded.',
    commentErrorMessage: 'Workspace comments could not be loaded.',
  })

  const workspacePersistence = useWorkspacePersistence({
    editorApi: state.editorApi,
    workspaceId: state.workspaceId,
    workspaceAccessRole: state.workspaceAccessRole,
    workspaceShareStatus: state.workspaceShareStatus,
    workspaceUuid: state.workspaceUuid,
    titleDirty: state.titleDirty,
    saveState: state.saveState,
    saveError: state.saveError,
    lastSavedAt: state.lastSavedAt,
    route: platform.route,
    router: platform.router,
    normalizeWorkspaceShareStatus: normalizers.normalizeWorkspaceShareStatus,
    refreshWorkspaceDocuments: refreshers.refreshWorkspaceDocuments,
    refreshWorkspaceRevisions: refreshers.refreshWorkspaceRevisions,
    allowNextRouteLeave: persistence.allowNextRouteLeave,
  })

  const shareActions = useWorkspaceShareActions({
    workspaceId: state.workspaceId,
    workspaceShareStatus: state.workspaceShareStatus,
    workspaceUuid: state.workspaceUuid,
    workspaceAccessRole: state.workspaceAccessRole,
    showWorkspaceShareModal: state.showWorkspaceShareModal,
    canManageWorkspaceShare: access.canManageWorkspaceShare,
    isEditorLoading: state.isEditorLoading,
    hasUnsavedChanges: state.hasUnsavedChanges,
    loadWorkspace: (targetWorkspaceId) => platform.api.getPost(targetWorkspaceId),
    normalizeWorkspaceShareStatus: normalizers.normalizeWorkspaceShareStatus,
    persistWorkspace: workspacePersistence.persistWorkspace,
    refreshWorkspaceDocuments: refreshers.refreshWorkspaceDocuments,
    refreshWorkspaceMembers: refreshers.refreshWorkspaceMembers,
    showWorkspaceNotice: ui.showWorkspaceNotice,
  })

  const commentComposer = useWorkspaceCommentComposer({
    canCommentOnWorkspace: access.canCommentOnWorkspace,
    activeWorkspacePanelTab: state.activeWorkspacePanelTab,
    workspaceCommentFilter: state.workspaceCommentFilter,
    workspaceCommentInput: state.workspaceCommentInput,
    newWorkspaceComment: state.newWorkspaceComment,
    showWorkspaceMentionMenu: state.showWorkspaceMentionMenu,
    isWorkspacePanelCollapsed: state.isWorkspacePanelCollapsed,
    editorApi: state.editorApi,
    workspaceBlockCommentSummaries: state.workspaceBlockCommentSummaries,
    waitForDomUpdate: platform.waitForDomUpdate,
  })

  return {
    ...realtime,
    ...workspacePersistence,
    ...shareActions,
    ...commentComposer,
  }
}
