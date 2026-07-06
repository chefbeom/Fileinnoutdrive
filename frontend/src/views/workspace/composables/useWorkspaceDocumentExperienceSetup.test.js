import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceDocumentShellSetup: vi.fn(),
}))

vi.mock('./useWorkspaceDocumentShellSetup.js', () => ({
  useWorkspaceDocumentShellSetup: mocks.useWorkspaceDocumentShellSetup,
}))

import {
  createWorkspaceDocumentExperienceGroups,
  useWorkspaceDocumentExperienceSetup,
} from './useWorkspaceDocumentExperienceSetup.js'

describe('useWorkspaceDocumentExperienceSetup', () => {
  it('maps workspace, document, and derived state into document shell setup state', () => {
    const workspaceState = {
      workspaceDocumentQuery: { value: 'spec' },
      workspacePageIndexRows: { value: [{ id: 1 }] },
      workspaceParentPageId: { value: 10 },
      workspaceParentPageTitle: { value: 'Parent' },
      workspacePropertyIcon: { value: 'doc' },
      workspacePropertyCoverColor: { value: 'blue' },
      workspacePropertyStatus: { value: 'todo' },
      workspacePropertyPriority: { value: 'high' },
      workspacePropertyOwnerEmail: { value: 'admin@example.test' },
      workspacePropertyOwnerName: { value: 'Admin' },
      workspacePropertyDueDate: { value: '2026-07-06' },
      workspacePageLocked: { value: false },
      activeWorkspacePanelTab: { value: 'home' },
      workspaceId: { value: 7 },
      title: { value: 'Spec' },
      saveState: { value: 'saved' },
      saveError: { value: '' },
      lastSavedAt: { value: '2026-07-06T00:00:00Z' },
      workspaceAccessRole: { value: 'OWNER' },
      workspaceShareStatus: { value: 'PRIVATE' },
      workspacePageIndexLoading: { value: false },
      workspacePageIndexError: { value: '' },
      workspacePageIndexRefreshedAt: { value: null },
      workspaceDocumentsLoading: { value: false },
      workspaceMemberLoading: { value: false },
      workspaceAssets: { value: [{ id: 2 }] },
    }
    const documentState = {
      workspaceDocumentSections: { value: [] },
      favoriteWorkspaceDocumentIds: { value: [7] },
      recentWorkspaceDocumentIds: { value: [5] },
    }
    const derived = {
      currentWorkspaceKey: { value: '7' },
      hasUnsavedChanges: { value: true },
      isValid: { value: true },
      workspacePanelTabs: { value: [{ id: 'home' }] },
      connectionStatus: { value: 'connected' },
    }

    const groups = createWorkspaceDocumentExperienceGroups({
      workspaceState,
      documentState,
      derived,
      assets: {
        workspaceImages: { value: [] },
        workspaceFiles: { value: [] },
      },
    })

    expect(groups.state).toMatchObject({
      workspaceDocumentQuery: { value: 'spec' },
      workspaceDocumentSections: { value: [] },
      favoriteWorkspaceDocumentIds: { value: [7] },
      currentWorkspaceKey: { value: '7' },
      hasUnsavedChanges: { value: true },
      workspacePanelTabs: { value: [{ id: 'home' }] },
      connectionStatus: { value: 'connected' },
    })
    expect(groups.assets).toMatchObject({
      workspaceAssets: { value: [{ id: 2 }] },
      workspaceImages: { value: [] },
      workspaceFiles: { value: [] },
    })
  })

  it('delegates mapped groups to useWorkspaceDocumentShellSetup', () => {
    const platform = { api: { getPost: vi.fn() } }
    const workspaceState = { workspaceDocumentQuery: { value: '' } }
    const documents = { personalItems: { value: [] }, sharedItems: { value: [] } }
    const result = { workspaceDocuments: { value: [] }, refreshWorkspaceDocuments: vi.fn() }
    mocks.useWorkspaceDocumentShellSetup.mockReturnValue(result)

    expect(useWorkspaceDocumentExperienceSetup({ platform, workspaceState, documents })).toBe(result)
    expect(mocks.useWorkspaceDocumentShellSetup).toHaveBeenCalledWith(expect.objectContaining({
      platform,
      documents,
      state: expect.objectContaining({ workspaceDocumentQuery: { value: '' } }),
    }))
  })
})
