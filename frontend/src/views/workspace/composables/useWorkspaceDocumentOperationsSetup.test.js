import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceDocumentActionSetup: vi.fn(),
  useWorkspaceDocumentActions: vi.fn(),
  useWorkspaceDocumentSections: vi.fn(),
  useWorkspaceRevisionActions: vi.fn(),
}))

vi.mock('./useWorkspaceDocumentActionSetup.js', () => ({
  useWorkspaceDocumentActionSetup: mocks.useWorkspaceDocumentActionSetup,
}))
vi.mock('./useWorkspaceDocumentActions.js', () => ({
  useWorkspaceDocumentActions: mocks.useWorkspaceDocumentActions,
}))
vi.mock('./useWorkspaceDocumentSections.js', () => ({
  useWorkspaceDocumentSections: mocks.useWorkspaceDocumentSections,
}))
vi.mock('./useWorkspaceRevisionActions.js', () => ({
  useWorkspaceRevisionActions: mocks.useWorkspaceRevisionActions,
}))

import { useWorkspaceDocumentOperationsSetup } from './useWorkspaceDocumentOperationsSetup.js'

describe('useWorkspaceDocumentOperationsSetup', () => {
  it('wires document actions, sections, collection actions, and revision actions', () => {
    const api = {
      getWorkspaceRevisions: vi.fn(),
      getWorkspaceRevision: vi.fn(),
      restoreWorkspaceRevision: vi.fn(),
    }
    const router = { push: vi.fn() }
    const documentIdFor = vi.fn()
    const confirmDiscardIfNeeded = vi.fn()
    const allowNextRouteLeave = vi.fn()
    const refreshWorkspaceDocuments = vi.fn()
    const refreshWorkspacePageIndex = vi.fn()
    const requestWorkspaceConfirm = vi.fn()
    const showWorkspaceNotice = vi.fn()
    const setupEditor = vi.fn()
    const persistWorkspaceDocumentSections = vi.fn()
    const normalizeWorkspaceRevision = vi.fn()
    const buildWorkspaceRevisionDiff = vi.fn()
    const state = {
      currentWorkspaceKey: { value: '7' },
      editorApi: { value: {} },
      title: { value: 'Spec' },
      workspaceId: { value: '7' },
      workspaceDocumentSections: { value: [] },
      workspaceSectionNameDraft: { value: '' },
      workspaceRevisions: { value: [] },
      workspaceRevisionLoading: { value: false },
      workspaceRevisionError: { value: '' },
    }
    const access = {
      canModifyWorkspacePage: { value: true },
      canStartWorkspaceSubpage: { value: true },
      canCreateWorkspaceSubpage: { value: true },
    }

    mocks.useWorkspaceDocumentActionSetup.mockReturnValue({
      openWorkspaceDocument: vi.fn(),
      createWorkspaceSubpage: vi.fn(),
    })
    mocks.useWorkspaceDocumentSections.mockReturnValue({
      createWorkspaceDocumentSection: vi.fn(),
    })
    mocks.useWorkspaceDocumentActions.mockReturnValue({
      duplicateWorkspaceDocument: vi.fn(),
    })
    mocks.useWorkspaceRevisionActions.mockReturnValue({
      refreshWorkspaceRevisions: vi.fn(),
    })

    const result = useWorkspaceDocumentOperationsSetup({
      platform: { route: { path: '/workspace' }, router, api },
      state,
      access,
      propertyOptions: { statusOptions: [] },
      preferences: {
        favoriteWorkspaceDocumentIds: { value: [] },
        trackRecentWorkspaceDocument: vi.fn(),
        persistFavoriteWorkspaceDocuments: vi.fn(),
        persistWorkspaceDocumentSections,
      },
      workspace: {
        workspaceDocumentById: { value: new Map() },
        currentWorkspaceProperties: { value: {} },
        ensureWorkspacePersisted: vi.fn(),
        persistWorkspace: vi.fn(),
      },
      guards: { confirmDiscardIfNeeded, allowNextRouteLeave },
      editor: { setupEditor },
      refreshers: { refreshWorkspaceDocuments, refreshWorkspacePageIndex },
      metadata: {
        applyWorkspaceProperties: vi.fn(),
        applyWorkspaceParentPage: vi.fn(),
        extractWorkspacePropertiesFromContents: vi.fn(),
        extractWorkspaceParentFromContents: vi.fn(),
      },
      normalizers: {
        normalizeWorkspaceRevision,
        buildWorkspaceRevisionDiff,
        normalizeWorkspaceShareStatus: vi.fn(),
      },
      ui: { requestWorkspaceConfirm, showWorkspaceNotice },
      messages: {
        sectionMessages: { renamed: 'renamed' },
        actionMessages: { removed: 'removed' },
      },
      documentIdFor,
    })

    expect(mocks.useWorkspaceDocumentActionSetup).toHaveBeenCalledWith(expect.objectContaining({
      platform: expect.objectContaining({ api, router }),
      documentIdFor,
    }))
    expect(mocks.useWorkspaceDocumentActionSetup.mock.calls[0][0].state).toMatchObject({
      currentWorkspaceKey: state.currentWorkspaceKey,
      canModifyWorkspacePage: access.canModifyWorkspacePage,
    })
    expect(mocks.useWorkspaceDocumentSections).toHaveBeenCalledWith(expect.objectContaining({
      workspaceDocumentSections: state.workspaceDocumentSections,
      persistWorkspaceDocumentSections,
      requestWorkspaceConfirm,
      showWorkspaceNotice,
    }))
    expect(mocks.useWorkspaceDocumentActions).toHaveBeenCalledWith(expect.objectContaining({
      api,
      router,
      currentWorkspaceKey: state.currentWorkspaceKey,
      documentIdFor,
      allowNextRouteLeave,
    }))
    expect(mocks.useWorkspaceRevisionActions).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: state.workspaceId,
      canModifyWorkspacePage: access.canModifyWorkspacePage,
      normalizeWorkspaceRevision,
      buildWorkspaceRevisionDiff,
      refreshWorkspaceDocuments,
    }))
    expect(result).toEqual(expect.objectContaining({
      openWorkspaceDocument: expect.any(Function),
      createWorkspaceDocumentSection: expect.any(Function),
      duplicateWorkspaceDocument: expect.any(Function),
      refreshWorkspaceRevisions: expect.any(Function),
    }))
  })
})
