import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceDocumentLoader: vi.fn(),
  useWorkspaceEditorSetup: vi.fn(),
  useWorkspaceLifecycleBindings: vi.fn(),
  useWorkspaceLifecycleWatchers: vi.fn(),
  useWorkspaceSseRoleChange: vi.fn(),
  useWorkspaceThemeSync: vi.fn(),
}))

vi.mock('./useWorkspaceDocumentLoader.js', () => ({
  useWorkspaceDocumentLoader: mocks.useWorkspaceDocumentLoader,
}))

vi.mock('./useWorkspaceEditorSetup.js', () => ({
  useWorkspaceEditorSetup: mocks.useWorkspaceEditorSetup,
}))

vi.mock('./useWorkspaceLifecycleBindings.js', () => ({
  useWorkspaceLifecycleBindings: mocks.useWorkspaceLifecycleBindings,
}))

vi.mock('./useWorkspaceLifecycleWatchers.js', () => ({
  useWorkspaceLifecycleWatchers: mocks.useWorkspaceLifecycleWatchers,
}))

vi.mock('./useWorkspaceSseRoleChange.js', () => ({
  useWorkspaceSseRoleChange: mocks.useWorkspaceSseRoleChange,
}))

vi.mock('./useWorkspaceThemeSync.js', () => ({
  useWorkspaceThemeSync: mocks.useWorkspaceThemeSync,
}))

import { useWorkspaceRuntimeLifecycle } from './useWorkspaceRuntimeLifecycle.js'

const buildContext = () => ({
  route: { params: { id: 'workspace-1' } },
  router: { push: vi.fn() },
  api: { getPost: vi.fn() },
  authStore: { token: 'token' },
  handleRouteLeave: vi.fn(),
  handleRouteUpdate: vi.fn(),
  handleBeforeUnload: vi.fn(),
  handleWorkspaceGlobalKeydown: vi.fn(),
  closeRoleDropdown: vi.fn(),
  showWorkspaceNotice: vi.fn(),
  allowNextRouteLeave: vi.fn(),
  allowNextWindowUnload: vi.fn(),
  editorHolder: {},
  editorApi: {},
  isEditorLoading: {},
  saveState: {},
  saveError: {},
  lastSavedAt: {},
  title: {},
  titleDirty: {},
  workspaceTemplateApplied: {},
  workspaceTemplateApplying: {},
  workspaceId: {},
  workspaceAccessRole: {},
  workspaceShareStatus: {},
  workspaceUuid: {},
  showWorkspaceShareModal: {},
  shouldWorkspaceEditorReadOnly: {},
  currentWorkspaceProperties: {},
  workspaceParentPageId: {},
  workspaceParentPageTitle: {},
  workspaceDocumentById: {},
  clearAutoSaveTimer: vi.fn(),
  resetLeaveGuardBypass: vi.fn(),
  normalizeWorkspaceShareStatus: vi.fn(),
  trackRecentWorkspaceDocument: vi.fn(),
  applyWorkspaceProperties: vi.fn(),
  applyWorkspaceParentPage: vi.fn(),
  extractWorkspacePropertiesFromContents: vi.fn(),
  extractWorkspaceParentFromContents: vi.fn(),
  refreshWorkspaceAssets: vi.fn(),
  refreshWorkspaceComments: vi.fn(),
  refreshWorkspaceRevisions: vi.fn(),
  refreshWorkspaceMembers: vi.fn(),
  handleEditorImageUpload: vi.fn(),
  scheduleAutoSave: vi.fn(),
  handleEditorBlockCommentBadgeClick: vi.fn(),
  applyWorkspaceBlockCommentSummaries: vi.fn(),
  workspaceFavoriteStorageKey: {},
  workspaceRecentStorageKey: {},
  workspaceSectionsStorageKey: {},
  workspacePageIndexViewsStorageKey: {},
  workspaceAssets: {},
  activeWorkspaceAssetId: {},
  currentUserEmail: {},
  workspacePageIndexRows: {},
  workspacePageIndexSelectedIds: {},
  collapsedWorkspacePageTreeIds: {},
  selectedBlockAnchor: {},
  workspaceCommentFilter: {},
  workspaceBlockCommentSummaries: {},
  workspacePropertySources: [{ property: 'icon' }],
  suppressWorkspacePropertyWatch: {},
  workspacePreferencesRemoteReady: {},
  workspacePreferencesDirtyBeforeRemoteLoad: {},
  loadWorkspacePreferencesFromLocal: vi.fn(),
  loadWorkspacePreferences: vi.fn(),
  refreshWorkspaceDocuments: vi.fn(),
  loadFavoriteWorkspaceDocuments: vi.fn(),
  loadRecentWorkspaceDocuments: vi.fn(),
  loadWorkspaceDocumentSections: vi.fn(),
  loadWorkspacePageIndexViews: vi.fn(),
  pruneWorkspaceTreeEditingState: vi.fn(),
  connectWorkspaceAssetRealtime: vi.fn(),
  refreshWorkspaceBacklinks: vi.fn(),
  disconnectWorkspaceAssetRealtime: vi.fn(),
  clearWorkspaceDocumentLinkCopyTimer: vi.fn(),
  clearWorkspaceNoticeTimer: vi.fn(),
  closeWorkspaceConfirm: vi.fn(),
  clearWorkspacePreferencesSaveTimer: vi.fn(),
})

describe('useWorkspaceRuntimeLifecycle', () => {
  it('wires workspace lifecycle, editor setup, and watchers through focused composables', () => {
    const syncTheme = vi.fn()
    const handleSseRoleChanged = vi.fn()
    const prepareWorkspaceData = vi.fn()
    const checkAndRedirectUuid = vi.fn()
    const setupEditor = vi.fn()
    const destroyEditor = vi.fn()
    const context = buildContext()

    mocks.useWorkspaceThemeSync.mockReturnValue({ syncTheme })
    mocks.useWorkspaceSseRoleChange.mockReturnValue({ handleSseRoleChanged })
    mocks.useWorkspaceDocumentLoader.mockReturnValue({ prepareWorkspaceData, checkAndRedirectUuid })
    mocks.useWorkspaceEditorSetup.mockReturnValue({ setupEditor, destroyEditor })

    useWorkspaceRuntimeLifecycle(context)

    expect(mocks.useWorkspaceSseRoleChange).toHaveBeenCalledWith({
      workspaceId: context.workspaceId,
      router: context.router,
      showWorkspaceNotice: context.showWorkspaceNotice,
      allowNextRouteLeave: context.allowNextRouteLeave,
      allowNextWindowUnload: context.allowNextWindowUnload,
    })
    expect(mocks.useWorkspaceLifecycleBindings).toHaveBeenCalledWith({
      routeLeaveHandler: context.handleRouteLeave,
      routeUpdateHandler: context.handleRouteUpdate,
      windowEvents: [
        { type: 'sse-role-changed', handler: handleSseRoleChanged },
        { type: 'beforeunload', handler: context.handleBeforeUnload },
        { type: 'keydown', handler: context.handleWorkspaceGlobalKeydown },
        { type: 'click', handler: context.closeRoleDropdown },
      ],
    })
    expect(mocks.useWorkspaceDocumentLoader).toHaveBeenCalledWith({
      route: context.route,
      router: context.router,
      api: context.api,
    })
    expect(mocks.useWorkspaceEditorSetup.mock.calls[0][0]).toMatchObject({
      prepareWorkspaceData,
      handleEditorImageUpload: context.handleEditorImageUpload,
      scheduleAutoSave: context.scheduleAutoSave,
    })
    expect(mocks.useWorkspaceLifecycleWatchers.mock.calls[0][0]).toMatchObject({
      syncTheme,
      checkAndRedirectUuid,
      setupEditor,
      destroyEditor,
      workspacePropertySources: context.workspacePropertySources,
    })
  })
})
