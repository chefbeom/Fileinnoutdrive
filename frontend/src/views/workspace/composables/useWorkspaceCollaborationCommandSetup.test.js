import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceCollaborationPersistenceSetup: vi.fn(),
  useWorkspaceCommandCenter: vi.fn(),
  useWorkspaceFocusNavigation: vi.fn(),
  useWorkspaceOverlaysBridge: vi.fn(),
}))

vi.mock('./useWorkspaceCollaborationPersistenceSetup.js', () => ({
  useWorkspaceCollaborationPersistenceSetup: mocks.useWorkspaceCollaborationPersistenceSetup,
}))
vi.mock('./useWorkspaceCommandCenter.js', () => ({
  useWorkspaceCommandCenter: mocks.useWorkspaceCommandCenter,
}))
vi.mock('./useWorkspaceFocusNavigation.js', () => ({
  useWorkspaceFocusNavigation: mocks.useWorkspaceFocusNavigation,
}))
vi.mock('./useWorkspaceOverlaysBridge.js', () => ({
  useWorkspaceOverlaysBridge: mocks.useWorkspaceOverlaysBridge,
}))

import { useWorkspaceCollaborationCommandSetup } from './useWorkspaceCollaborationCommandSetup.js'

describe('useWorkspaceCollaborationCommandSetup', () => {
  it('wires collaboration persistence into focus navigation, command center, and overlays', () => {
    const openWorkspaceShare = vi.fn()
    const focusWorkspaceMentionComments = vi.fn()
    const handleWorkspaceShareRefresh = vi.fn()
    const moveWorkspaceCommandSelection = vi.fn()
    const executeWorkspaceCommand = vi.fn()
    const closeWorkspaceCommandPalette = vi.fn()
    const openWorkspaceDocument = vi.fn()
    const createWorkspaceDocument = vi.fn()
    const state = {
      workspaceId: { value: 7 },
      workspaceUuid: { value: 'uuid' },
      workspaceShareStatus: { value: 'PRIVATE' },
      editorApi: { value: {} },
      currentWorkspaceKey: { value: '7' },
      isWorkspacePanelCollapsed: { value: false },
      activeWorkspacePanelTab: { value: 'home' },
      workspaceCommandBaseItems: { value: [] },
      workspaceNotice: { value: null },
      workspaceConfirm: { value: null },
    }

    mocks.useWorkspaceCollaborationPersistenceSetup.mockReturnValue({
      persistWorkspace: vi.fn(),
      openWorkspaceShare,
      focusWorkspaceMentionComments,
      handleWorkspaceShareRefresh,
    })
    mocks.useWorkspaceFocusNavigation.mockReturnValue({
      focusWorkspaceOutlineItem: vi.fn(),
    })
    mocks.useWorkspaceCommandCenter.mockReturnValue({
      workspaceCommandInput: { value: null },
      isWorkspaceCommandPaletteOpen: { value: false },
      workspaceCommandQuery: { value: '' },
      workspaceCommandActiveIndex: { value: 0 },
      workspaceCommandItems: { value: [] },
      workspaceCommandEmptyLabel: { value: '' },
      moveWorkspaceCommandSelection,
      executeWorkspaceCommand,
      closeWorkspaceCommandPalette,
    })
    mocks.useWorkspaceOverlaysBridge.mockReturnValue({
      workspaceOverlaysModel: { value: {} },
      workspaceOverlaysActions: {},
    })

    const result = useWorkspaceCollaborationCommandSetup({
      platform: { api: {}, route: {}, router: {}, authStore: {}, waitForDomUpdate: vi.fn() },
      state,
      access: {
        currentUserIdx: { value: 1 },
        canManageWorkspaceShare: { value: true },
        canCommentOnWorkspace: { value: true },
      },
      normalizers: { normalizeWorkspaceShareStatus: vi.fn() },
      refreshers: {
        refreshWorkspaceDocuments: vi.fn(),
        refreshWorkspaceRevisions: vi.fn(),
        refreshWorkspaceMembers: vi.fn(),
      },
      persistence: { allowNextRouteLeave: vi.fn() },
      documents: {
        openWorkspaceDocument,
        createWorkspaceDocument,
        openWorkspaceParentPage: vi.fn(),
      },
      commands: {
        applyWorkspaceTemplate: vi.fn(),
        insertWorkspaceQuickBlock: vi.fn(),
        handleSave: vi.fn(),
        toggleWorkspacePageLock: vi.fn(),
        toggleCurrentWorkspaceDocumentFavorite: vi.fn(),
        exportWorkspaceMarkdown: vi.fn(),
        focusWorkspaceSubpageComposer: vi.fn(),
      },
      ui: {
        showWorkspaceNotice: vi.fn(),
        runWorkspaceNoticeAction: vi.fn(),
        closeWorkspaceNotice: vi.fn(),
        closeWorkspaceConfirm: vi.fn(),
        confirmWorkspaceAction: vi.fn(),
      },
    })

    expect(mocks.useWorkspaceCollaborationPersistenceSetup).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({ workspaceId: state.workspaceId }),
    }))
    expect(mocks.useWorkspaceFocusNavigation).toHaveBeenCalledWith(expect.objectContaining({
      openWorkspaceDocument,
      focusWorkspaceMentionComments,
    }))
    expect(mocks.useWorkspaceCommandCenter).toHaveBeenCalledWith(expect.objectContaining({
      openWorkspaceDocument,
      createWorkspaceDocument,
      openWorkspaceShare,
      focusWorkspaceMentionComments,
    }))
    expect(mocks.useWorkspaceOverlaysBridge).toHaveBeenCalledWith(expect.objectContaining({
      moveWorkspaceCommandSelection,
      executeWorkspaceCommand,
      closeWorkspaceCommandPalette,
      handleWorkspaceShareRefresh,
    }))
    expect(result).toEqual(expect.objectContaining({
      openWorkspaceShare,
      focusWorkspaceMentionComments,
      workspaceOverlaysModel: expect.any(Object),
    }))
  })
})
