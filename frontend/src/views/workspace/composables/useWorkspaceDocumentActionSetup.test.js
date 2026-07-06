import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceCurrentDocumentActions: vi.fn(),
  useWorkspaceDocumentFavorites: vi.fn(),
  useWorkspaceDocumentLinkActions: vi.fn(),
  useWorkspaceDocumentLinkCopy: vi.fn(),
  useWorkspaceDocumentNavigation: vi.fn(),
  useWorkspaceSubpageActions: vi.fn(),
}))

vi.mock('./useWorkspaceCurrentDocumentActions.js', () => ({
  useWorkspaceCurrentDocumentActions: mocks.useWorkspaceCurrentDocumentActions,
}))
vi.mock('./useWorkspaceDocumentFavorites.js', () => ({
  useWorkspaceDocumentFavorites: mocks.useWorkspaceDocumentFavorites,
}))
vi.mock('./useWorkspaceDocumentLinkActions.js', () => ({
  useWorkspaceDocumentLinkActions: mocks.useWorkspaceDocumentLinkActions,
}))
vi.mock('./useWorkspaceDocumentLinkCopy.js', () => ({
  useWorkspaceDocumentLinkCopy: mocks.useWorkspaceDocumentLinkCopy,
}))
vi.mock('./useWorkspaceDocumentNavigation.js', () => ({
  useWorkspaceDocumentNavigation: mocks.useWorkspaceDocumentNavigation,
}))
vi.mock('./useWorkspaceSubpageActions.js', () => ({
  useWorkspaceSubpageActions: mocks.useWorkspaceSubpageActions,
}))

import { useWorkspaceDocumentActionSetup } from './useWorkspaceDocumentActionSetup.js'

describe('useWorkspaceDocumentActionSetup', () => {
  it('wires document links, favorites, current document, navigation, and subpage actions', () => {
    const documentIdFor = vi.fn()
    const markWorkspaceDocumentLinkCopied = vi.fn()
    const workspaceDocumentAbsoluteUrl = vi.fn()
    const workspaceDocumentPath = vi.fn()
    const isWorkspaceDocumentFavorite = vi.fn()
    const setupEditor = vi.fn()
    const refreshWorkspaceDocuments = vi.fn()

    mocks.useWorkspaceDocumentLinkCopy.mockReturnValue({
      workspaceDocumentLinkCopiedId: { value: '' },
      clearWorkspaceDocumentLinkCopyTimer: vi.fn(),
      markWorkspaceDocumentLinkCopied,
      isWorkspaceDocumentLinkCopied: vi.fn(),
    })
    mocks.useWorkspaceDocumentNavigation.mockReturnValue({
      openWorkspaceDocument: vi.fn(),
      createWorkspaceDocument: vi.fn(),
    })
    mocks.useWorkspaceDocumentLinkActions.mockReturnValue({
      canExportWorkspaceMarkdown: { value: true },
      workspaceDocumentPath,
      workspaceDocumentAbsoluteUrl,
      insertWorkspacePageLink: vi.fn(),
      copyWorkspaceDocumentLink: vi.fn(),
      exportWorkspaceMarkdown: vi.fn(),
    })
    mocks.useWorkspaceCurrentDocumentActions.mockReturnValue({
      currentWorkspaceLinkDocument: { value: { id: 7 } },
      canCopyCurrentWorkspaceDocumentLink: { value: true },
      canFavoriteCurrentWorkspaceDocument: { value: true },
      isCurrentWorkspaceDocumentFavorite: { value: false },
      currentWorkspaceFavoriteTitle: { value: 'add' },
    })
    mocks.useWorkspaceDocumentFavorites.mockReturnValue({
      isWorkspaceDocumentFavorite,
      toggleFavoriteWorkspaceDocument: vi.fn(),
      toggleCurrentWorkspaceDocumentFavorite: vi.fn(),
    })
    mocks.useWorkspaceSubpageActions.mockReturnValue({
      focusWorkspaceSubpageComposer: vi.fn(),
      createWorkspaceChildPage: vi.fn(),
      createWorkspaceSubpage: vi.fn(),
    })

    const result = useWorkspaceDocumentActionSetup({
      platform: { route: { path: '/workspace' }, router: {}, api: {} },
      state: {
        currentWorkspaceKey: { value: '7' },
        editorApi: { value: {} },
        workspaceId: { value: 7 },
        title: { value: 'Spec' },
      },
      preferences: {
        favoriteWorkspaceDocumentIds: { value: [] },
        trackRecentWorkspaceDocument: vi.fn(),
        persistFavoriteWorkspaceDocuments: vi.fn(),
      },
      workspace: {
        workspaceDocumentById: { value: new Map() },
        currentWorkspaceProperties: { value: {} },
        ensureWorkspacePersisted: vi.fn(),
        persistWorkspace: vi.fn(),
      },
      editor: { setupEditor },
      refreshers: { refreshWorkspaceDocuments },
      ui: { showWorkspaceNotice: vi.fn() },
      documentIdFor,
    })

    expect(mocks.useWorkspaceDocumentLinkCopy).toHaveBeenCalledWith({ documentIdFor })
    expect(mocks.useWorkspaceDocumentNavigation).toHaveBeenCalledWith(expect.objectContaining({ setupEditor }))
    expect(mocks.useWorkspaceDocumentLinkActions).toHaveBeenCalledWith(expect.objectContaining({
      documentIdFor,
      markWorkspaceDocumentLinkCopied,
    }))
    expect(mocks.useWorkspaceCurrentDocumentActions).toHaveBeenCalledWith(expect.objectContaining({
      documentUrlFor: workspaceDocumentAbsoluteUrl,
    }))
    expect(mocks.useWorkspaceDocumentFavorites).toHaveBeenCalledWith(expect.objectContaining({
      favoriteWorkspaceDocumentIds: { value: [] },
    }))
    expect(mocks.useWorkspaceSubpageActions).toHaveBeenCalledWith(expect.objectContaining({
      workspaceDocumentPath,
      refreshWorkspaceDocuments,
    }))
    expect(result).toMatchObject({
      workspaceDocumentPath,
      workspaceDocumentAbsoluteUrl,
      isWorkspaceDocumentFavorite,
    })
  })
})
