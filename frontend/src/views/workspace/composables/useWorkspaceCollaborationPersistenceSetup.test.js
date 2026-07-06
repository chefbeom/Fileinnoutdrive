import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceAssetsCommentsRealtime: vi.fn(),
  useWorkspaceCommentComposer: vi.fn(),
  useWorkspacePersistence: vi.fn(),
  useWorkspaceShareActions: vi.fn(),
}))

vi.mock('./useWorkspaceAssetsCommentsRealtime.js', () => ({
  useWorkspaceAssetsCommentsRealtime: mocks.useWorkspaceAssetsCommentsRealtime,
}))
vi.mock('./useWorkspaceCommentComposer.js', () => ({
  useWorkspaceCommentComposer: mocks.useWorkspaceCommentComposer,
}))
vi.mock('./useWorkspacePersistence.js', () => ({
  useWorkspacePersistence: mocks.useWorkspacePersistence,
}))
vi.mock('./useWorkspaceShareActions.js', () => ({
  useWorkspaceShareActions: mocks.useWorkspaceShareActions,
}))

import { useWorkspaceCollaborationPersistenceSetup } from './useWorkspaceCollaborationPersistenceSetup.js'

describe('useWorkspaceCollaborationPersistenceSetup', () => {
  it('wires realtime, persistence, sharing, and comment composer flows', () => {
    const persistWorkspace = vi.fn()
    const refreshWorkspaceDocuments = vi.fn()
    const showWorkspaceNotice = vi.fn()
    const normalizeWorkspaceShareStatus = vi.fn()
    const waitForDomUpdate = vi.fn()
    const state = {
      workspaceId: { value: 7 },
      editorApi: { value: {} },
      workspaceShareStatus: { value: 'PRIVATE' },
      workspaceUuid: { value: 'uuid' },
      activeWorkspacePanelTab: { value: 'home' },
      workspaceCommentFilter: { value: 'open' },
    }

    mocks.useWorkspaceAssetsCommentsRealtime.mockReturnValue({
      refreshWorkspaceAssets: vi.fn(),
      connectWorkspaceAssetRealtime: vi.fn(),
    })
    mocks.useWorkspacePersistence.mockReturnValue({
      persistWorkspace,
      ensureWorkspacePersisted: vi.fn(),
    })
    mocks.useWorkspaceShareActions.mockReturnValue({
      openWorkspaceShare: vi.fn(),
      refreshWorkspaceShareState: vi.fn(),
    })
    mocks.useWorkspaceCommentComposer.mockReturnValue({
      focusWorkspaceCommentComposer: vi.fn(),
      insertWorkspaceMention: vi.fn(),
    })

    const result = useWorkspaceCollaborationPersistenceSetup({
      platform: {
        api: {
          getWorkspaceAssets: vi.fn(),
          getWorkspaceComments: vi.fn(),
          getPost: vi.fn(),
        },
        authStore: { token: 'token' },
        route: {},
        router: {},
        waitForDomUpdate,
      },
      state,
      access: {
        currentUserIdx: { value: 1 },
        canManageWorkspaceShare: { value: true },
        canCommentOnWorkspace: { value: true },
      },
      normalizers: {
        normalizeWorkspaceShareStatus,
        normalizeWorkspaceAsset: vi.fn(),
        normalizeWorkspaceComment: vi.fn(),
      },
      refreshers: {
        refreshWorkspaceDocuments,
        refreshWorkspaceRevisions: vi.fn(),
        refreshWorkspaceMembers: vi.fn(),
      },
      persistence: {
        allowNextRouteLeave: vi.fn(),
      },
      ui: { showWorkspaceNotice },
    })

    expect(mocks.useWorkspaceAssetsCommentsRealtime).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: state.workspaceId,
      showWorkspaceNotice,
    }))
    expect(mocks.useWorkspacePersistence).toHaveBeenCalledWith(expect.objectContaining({
      editorApi: state.editorApi,
      normalizeWorkspaceShareStatus,
      refreshWorkspaceDocuments,
    }))
    expect(mocks.useWorkspaceShareActions).toHaveBeenCalledWith(expect.objectContaining({
      persistWorkspace,
      refreshWorkspaceDocuments,
      showWorkspaceNotice,
    }))
    expect(mocks.useWorkspaceCommentComposer).toHaveBeenCalledWith(expect.objectContaining({
      waitForDomUpdate,
      activeWorkspacePanelTab: state.activeWorkspacePanelTab,
    }))
    expect(result).toMatchObject({
      persistWorkspace,
    })
    expect(result.openWorkspaceShare).toEqual(expect.any(Function))
    expect(result.focusWorkspaceCommentComposer).toEqual(expect.any(Function))
  })
})
