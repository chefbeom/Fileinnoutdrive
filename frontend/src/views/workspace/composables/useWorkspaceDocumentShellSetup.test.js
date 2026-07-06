import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceBacklinks: vi.fn(),
  useWorkspaceDocumentCollections: vi.fn(),
  useWorkspaceDocumentRefresh: vi.fn(),
  useWorkspaceOverviewState: vi.fn(),
  useWorkspacePageIndexRefresh: vi.fn(),
  useWorkspaceShellState: vi.fn(),
  useWorkspaceStatusIndicators: vi.fn(),
}))

vi.mock('./useWorkspaceBacklinks.js', () => ({ useWorkspaceBacklinks: mocks.useWorkspaceBacklinks }))
vi.mock('./useWorkspaceDocumentCollections.js', () => ({ useWorkspaceDocumentCollections: mocks.useWorkspaceDocumentCollections }))
vi.mock('./useWorkspaceDocumentRefresh.js', () => ({ useWorkspaceDocumentRefresh: mocks.useWorkspaceDocumentRefresh }))
vi.mock('./useWorkspaceOverviewState.js', () => ({ useWorkspaceOverviewState: mocks.useWorkspaceOverviewState }))
vi.mock('./useWorkspacePageIndexRefresh.js', () => ({ useWorkspacePageIndexRefresh: mocks.useWorkspacePageIndexRefresh }))
vi.mock('./useWorkspaceShellState.js', () => ({ useWorkspaceShellState: mocks.useWorkspaceShellState }))
vi.mock('./useWorkspaceStatusIndicators.js', () => ({ useWorkspaceStatusIndicators: mocks.useWorkspaceStatusIndicators }))

import { useWorkspaceDocumentShellSetup } from './useWorkspaceDocumentShellSetup.js'

describe('useWorkspaceDocumentShellSetup', () => {
  it('wires document collections, shell state, overview, and refresh flows', () => {
    const workspaceDocuments = { value: [{ id: 1 }] }
    const currentWorkspaceParentPage = { value: null }
    const linkedWorkspaceDocuments = { value: [] }
    const currentWorkspaceProperties = { value: { ownerName: 'Admin' } }
    const isWorkspacePropertyDueOverdue = { value: false }
    const refreshWorkspaceBacklinks = vi.fn()
    const refreshWorkspacePageIndex = vi.fn()
    const refreshWorkspaceDocuments = vi.fn()
    const saveStatusLabel = { value: 'saved' }
    const api = { getPost: vi.fn() }
    const state = {
      workspaceDocumentQuery: { value: '' },
      workspaceDocumentSections: { value: [] },
      workspacePageIndexRows: { value: [] },
      currentWorkspaceKey: { value: '1' },
      workspaceId: { value: '1' },
      title: { value: 'Home' },
      favoriteWorkspaceDocumentIds: { value: [] },
      recentWorkspaceDocumentIds: { value: [] },
      workspacePanelTabs: { value: [] },
      activeWorkspacePanelTab: { value: 'home' },
    }

    mocks.useWorkspaceDocumentCollections.mockReturnValue({
      workspaceDocuments,
      currentWorkspaceParentPage,
      linkedWorkspaceDocuments,
      workspaceDocumentById: { value: new Map() },
    })
    mocks.useWorkspaceShellState.mockReturnValue({
      currentWorkspaceProperties,
      isWorkspacePropertyDueOverdue,
      workspaceCommandBaseItems: { value: [] },
      isWorkspacePanelVisible: vi.fn(),
    })
    mocks.useWorkspaceBacklinks.mockReturnValue({
      workspaceBacklinks: { value: [] },
      refreshWorkspaceBacklinks,
    })
    mocks.useWorkspaceStatusIndicators.mockReturnValue({
      saveStatusLabel,
      saveStatusClass: { value: {} },
    })
    mocks.useWorkspaceOverviewState.mockReturnValue({
      workspaceSummaryCards: { value: [] },
    })
    mocks.useWorkspacePageIndexRefresh.mockReturnValue({
      refreshWorkspacePageIndex,
    })
    mocks.useWorkspaceDocumentRefresh.mockReturnValue({
      refreshWorkspaceDocuments,
    })

    const result = useWorkspaceDocumentShellSetup({
      platform: { api },
      state,
      documents: {
        personalItems: { value: [] },
        sharedItems: { value: [] },
        loadDocuments: vi.fn(),
      },
      options: {
        propertyOptions: { statusOptions: [] },
        statusOptions: vi.fn(),
        priorityOptions: vi.fn(),
        quickBlockOptions: [],
        workspaceTemplates: [],
        pageFocusedPanelIds: [],
      },
      access: {
        canFavoriteCurrentWorkspaceDocument: vi.fn(),
        isCurrentWorkspaceDocumentFavorite: vi.fn(),
        canExportWorkspaceMarkdown: vi.fn(),
      },
      people: {
        currentUserEmail: { value: 'admin@example.test' },
        workspaceMemberRows: { value: [] },
      },
      editor: {
        documentSearchText: { value: '' },
        documentWorkspaceLinks: { value: [] },
      },
      comments: {
        mentionedWorkspaceComments: { value: [] },
        unresolvedWorkspaceComments: { value: [] },
        resolvedWorkspaceComments: { value: [] },
      },
      assets: {
        workspaceAssets: { value: [] },
        workspaceImages: { value: [] },
        workspaceFiles: { value: [] },
      },
      preferences: {
        loadWorkspaceDocumentSections: vi.fn(),
        pruneRecentWorkspaceDocuments: vi.fn(),
        persistRecentWorkspaceDocuments: vi.fn(),
      },
      formatters: {
        formatDateTimeFor: vi.fn(),
        workspaceTaskTodayKeyFor: vi.fn(),
        roleLabelFor: vi.fn(),
      },
    })

    expect(mocks.useWorkspaceDocumentCollections).toHaveBeenCalledWith(expect.objectContaining({
      personalItems: expect.any(Object),
      currentWorkspaceKey: state.currentWorkspaceKey,
    }))
    expect(mocks.useWorkspaceShellState).toHaveBeenCalledWith(expect.objectContaining({
      currentWorkspaceParentPage,
      workspaceDocuments,
    }))
    expect(mocks.useWorkspaceOverviewState).toHaveBeenCalledWith(expect.objectContaining({
      currentWorkspaceProperties,
      linkedWorkspaceDocuments,
      saveStatusLabel,
    }))
    expect(mocks.useWorkspaceDocumentRefresh).toHaveBeenCalledWith(expect.objectContaining({
      refreshBacklinks: refreshWorkspaceBacklinks,
      refreshPageIndex: refreshWorkspacePageIndex,
    }))
    expect(result).toMatchObject({
      workspaceDocuments,
      currentWorkspaceProperties,
      saveStatusLabel,
      refreshWorkspaceDocuments,
    })
  })
})
