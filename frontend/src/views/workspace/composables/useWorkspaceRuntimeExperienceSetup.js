import { useWorkspaceRuntimeLifecycleSetup } from './useWorkspaceRuntimeLifecycleSetup.js'

export const createWorkspaceRuntimeExperienceGroups = ({
  platform = {},
  workspaceState = {},
  runtime = {},
} = {}) => ({
  state: workspaceState,
  platform,
  guards: {
    handleRouteLeave: runtime.handleRouteLeave,
    handleRouteUpdate: runtime.handleRouteUpdate,
    handleBeforeUnload: runtime.handleBeforeUnload,
    allowNextRouteLeave: runtime.allowNextRouteLeave,
    allowNextWindowUnload: runtime.allowNextWindowUnload,
    resetLeaveGuardBypass: runtime.resetLeaveGuardBypass,
  },
  ui: {
    handleWorkspaceGlobalKeydown: runtime.handleWorkspaceGlobalKeydown,
    closeRoleDropdown: runtime.closeRoleDropdown,
    showWorkspaceNotice: runtime.showWorkspaceNotice,
    closeWorkspaceConfirm: runtime.closeWorkspaceConfirm,
    clearWorkspaceNoticeTimer: runtime.clearWorkspaceNoticeTimer,
  },
  workspace: {
    shouldWorkspaceEditorReadOnly: runtime.shouldWorkspaceEditorReadOnly,
    currentWorkspaceProperties: runtime.currentWorkspaceProperties,
    workspaceDocumentById: runtime.workspaceDocumentById,
    normalizeWorkspaceShareStatus: runtime.normalizeWorkspaceShareStatus,
    trackRecentWorkspaceDocument: runtime.trackRecentWorkspaceDocument,
  },
  metadata: {
    applyWorkspaceProperties: runtime.applyWorkspaceProperties,
    applyWorkspaceParentPage: runtime.applyWorkspaceParentPage,
    extractWorkspacePropertiesFromContents: runtime.extractWorkspacePropertiesFromContents,
    extractWorkspaceParentFromContents: runtime.extractWorkspaceParentFromContents,
  },
  refreshers: {
    refreshWorkspaceAssets: runtime.refreshWorkspaceAssets,
    refreshWorkspaceComments: runtime.refreshWorkspaceComments,
    refreshWorkspaceRevisions: runtime.refreshWorkspaceRevisions,
    refreshWorkspaceMembers: runtime.refreshWorkspaceMembers,
    refreshWorkspaceDocuments: runtime.refreshWorkspaceDocuments,
    refreshWorkspaceBacklinks: runtime.refreshWorkspaceBacklinks,
  },
  editor: {
    handleEditorImageUpload: runtime.handleEditorImageUpload,
    scheduleAutoSave: runtime.scheduleAutoSave,
    handleEditorBlockCommentBadgeClick: runtime.handleEditorBlockCommentBadgeClick,
    applyWorkspaceBlockCommentSummaries: runtime.applyWorkspaceBlockCommentSummaries,
    selectedBlockAnchor: runtime.selectedBlockAnchor,
    workspaceBlockCommentSummaries: runtime.workspaceBlockCommentSummaries,
  },
  preferences: {
    workspaceFavoriteStorageKey: runtime.workspaceFavoriteStorageKey,
    workspaceRecentStorageKey: runtime.workspaceRecentStorageKey,
    workspaceSectionsStorageKey: runtime.workspaceSectionsStorageKey,
    workspacePageIndexViewsStorageKey: runtime.workspacePageIndexViewsStorageKey,
    currentUserEmail: runtime.currentUserEmail,
    collapsedWorkspacePageTreeIds: runtime.collapsedWorkspacePageTreeIds,
    suppressWorkspacePropertyWatch: runtime.suppressWorkspacePropertyWatch,
    workspacePreferencesRemoteReady: runtime.workspacePreferencesRemoteReady,
    workspacePreferencesDirtyBeforeRemoteLoad: runtime.workspacePreferencesDirtyBeforeRemoteLoad,
    loadWorkspacePreferencesFromLocal: runtime.loadWorkspacePreferencesFromLocal,
    loadWorkspacePreferences: runtime.loadWorkspacePreferences,
    loadFavoriteWorkspaceDocuments: runtime.loadFavoriteWorkspaceDocuments,
    loadRecentWorkspaceDocuments: runtime.loadRecentWorkspaceDocuments,
    loadWorkspaceDocumentSections: runtime.loadWorkspaceDocumentSections,
    loadWorkspacePageIndexViews: runtime.loadWorkspacePageIndexViews,
    clearWorkspacePreferencesSaveTimer: runtime.clearWorkspacePreferencesSaveTimer,
  },
  lifecycle: {
    clearAutoSaveTimer: runtime.clearAutoSaveTimer,
    pruneWorkspaceTreeEditingState: runtime.pruneWorkspaceTreeEditingState,
    connectWorkspaceAssetRealtime: runtime.connectWorkspaceAssetRealtime,
    disconnectWorkspaceAssetRealtime: runtime.disconnectWorkspaceAssetRealtime,
    clearWorkspaceDocumentLinkCopyTimer: runtime.clearWorkspaceDocumentLinkCopyTimer,
  },
})

export const useWorkspaceRuntimeExperienceSetup = (groups = {}) =>
  useWorkspaceRuntimeLifecycleSetup(createWorkspaceRuntimeExperienceGroups(groups))
