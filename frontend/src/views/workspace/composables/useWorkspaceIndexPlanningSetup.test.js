import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceIndexTreeFlow: vi.fn(),
  useWorkspacePageIndexViews: vi.fn(),
  useWorkspacePlanningPanels: vi.fn(),
  useWorkspacePreferenceStores: vi.fn(),
}))

vi.mock('./useWorkspaceIndexTreeFlow.js', () => ({ useWorkspaceIndexTreeFlow: mocks.useWorkspaceIndexTreeFlow }))
vi.mock('./useWorkspacePageIndexViews.js', () => ({ useWorkspacePageIndexViews: mocks.useWorkspacePageIndexViews }))
vi.mock('./useWorkspacePlanningPanels.js', () => ({ useWorkspacePlanningPanels: mocks.useWorkspacePlanningPanels }))
vi.mock('./useWorkspacePreferenceStores.js', () => ({ useWorkspacePreferenceStores: mocks.useWorkspacePreferenceStores }))

import { useWorkspaceIndexPlanningSetup } from './useWorkspaceIndexPlanningSetup.js'

describe('useWorkspaceIndexPlanningSetup', () => {
  it('wires index tree, planning, preferences, and saved page index views', () => {
    const visibleWorkspacePageIndexRows = { value: [{ id: 1 }] }
    const workspacePageIndexFilterOptions = { value: [{ id: 'all' }] }
    const workspacePageIndexOwnerFilterOptions = { value: [] }
    const workspacePageIndexViews = { value: [] }
    const persistWorkspacePageIndexViews = vi.fn()
    const workspaceDocuments = vi.fn(() => [])
    const currentUserEmail = { value: 'admin@example.test' }
    const api = { getPost: vi.fn(), savePost: vi.fn() }
    const state = {
      workspacePageIndexRows: { value: [] },
      workspacePageIndexFilter: { value: 'all' },
      workspacePageIndexQuery: { value: '' },
      workspacePageIndexTagFilter: { value: '' },
      workspacePageIndexOwnerFilter: { value: '' },
      workspacePageIndexSort: { value: 'updated-desc' },
      workspacePageIndexViewName: { value: '' },
      currentWorkspaceKey: { value: '7' },
    }

    mocks.useWorkspaceIndexTreeFlow.mockReturnValue({
      visibleWorkspacePageIndexRows,
      workspacePageIndexFilterOptions,
      workspacePageIndexSortOptions: [{ id: 'updated-desc' }],
      workspacePageIndexOwnerFilterOptions,
      searchWorkspaceContents: vi.fn(),
    })
    mocks.useWorkspacePlanningPanels.mockReturnValue({
      workspaceBoardRows: { value: [] },
    })
    mocks.useWorkspacePreferenceStores.mockReturnValue({
      workspacePageIndexViews,
      persistWorkspacePageIndexViews,
      loadWorkspacePreferences: vi.fn(),
    })
    mocks.useWorkspacePageIndexViews.mockReturnValue({
      activeWorkspacePageIndexView: { value: null },
      createWorkspacePageIndexView: vi.fn(),
    })

    const result = useWorkspaceIndexPlanningSetup({
      platform: { api },
      state,
      options: {
        priorityOptions: [{ id: 'high' }],
        statusOptions: [{ id: 'todo' }],
      },
      documents: {
        workspaceDocuments,
        workspacePropertyOwnerCandidates: vi.fn(() => []),
        documentId: vi.fn((document) => document.id),
        workspacePageIndexRowById: vi.fn(() => new Map()),
        workspaceDocumentById: vi.fn(() => new Map()),
      },
      metadata: {
        applyWorkspaceParentPage: vi.fn(),
        serializeWorkspaceSnapshotWithParent: vi.fn(),
        extractWorkspacePropertiesFromContents: vi.fn(),
        normalizeWorkspaceProperties: vi.fn(),
        applyWorkspaceProperties: vi.fn(),
        serializeWorkspaceSnapshotWithProperties: vi.fn(),
      },
      persistence: { persistWorkspace: vi.fn() },
      refreshers: {
        refreshWorkspaceDocuments: vi.fn(),
        refreshWorkspacePageIndex: vi.fn(),
      },
      user: { currentUserEmail },
    })

    expect(mocks.useWorkspaceIndexTreeFlow).toHaveBeenCalledWith(expect.objectContaining({
      workspaceDocuments,
      currentWorkspaceKey: state.currentWorkspaceKey,
    }))
    expect(mocks.useWorkspacePlanningPanels).toHaveBeenCalledWith(expect.objectContaining({
      visibleWorkspacePageIndexRows,
      currentUserEmail,
    }))
    expect(mocks.useWorkspacePreferenceStores).toHaveBeenCalledWith(expect.objectContaining({
      api,
      currentUserEmail,
      workspaceDocuments,
    }))
    expect(mocks.useWorkspacePageIndexViews).toHaveBeenCalledWith(expect.objectContaining({
      workspacePageIndexViews,
      workspacePageIndexFilterOptions,
      workspacePageIndexOwnerFilterOptions,
      persistWorkspacePageIndexViews,
    }))
    expect(result).toMatchObject({
      visibleWorkspacePageIndexRows,
      workspacePageIndexViews,
    })
  })
})
