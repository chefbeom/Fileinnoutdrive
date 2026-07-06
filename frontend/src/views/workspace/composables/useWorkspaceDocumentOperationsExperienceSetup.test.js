import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceDocumentOperationsSetup: vi.fn(),
}))

vi.mock('./useWorkspaceDocumentOperationsSetup.js', () => ({
  useWorkspaceDocumentOperationsSetup: mocks.useWorkspaceDocumentOperationsSetup,
}))

import {
  createWorkspaceDocumentOperationsExperienceGroups,
  useWorkspaceDocumentOperationsExperienceSetup,
} from './useWorkspaceDocumentOperationsExperienceSetup.js'

describe('useWorkspaceDocumentOperationsExperienceSetup', () => {
  it('maps workspace, document, derived, and people state into document operations state', () => {
    const workspaceState = {
      editorApi: { value: {} },
      isEditorLoading: { value: false },
      workspaceMarkdownExporting: { value: false },
      title: { value: 'Spec' },
      workspacePropertyOwnerEmail: { value: 'admin@example.test' },
      workspacePropertyOwnerName: { value: 'Admin' },
      workspacePropertyDueDate: { value: '2026-07-06' },
      workspaceId: { value: 7 },
      workspaceAccessRole: { value: 'OWNER' },
      workspaceSubpageInput: { value: '' },
      workspaceSubpageTitle: { value: '' },
      workspaceSubpageCreating: { value: false },
      workspaceSubpageError: { value: '' },
      isWorkspacePanelCollapsed: { value: false },
      activeWorkspacePanelTab: { value: 'home' },
      workspaceSectionNameDraft: { value: '' },
      workspaceSectionEditingId: { value: null },
      workspaceSectionEditDraft: { value: '' },
      workspaceSectionEditInput: { value: null },
      workspaceRevisions: { value: [] },
      workspaceRevisionLoading: { value: false },
      workspaceRevisionError: { value: '' },
      activeWorkspaceRevision: { value: null },
      workspaceRevisionDiff: { value: null },
      workspaceRevisionPreviewLoading: { value: false },
      workspaceRevisionRestoring: { value: false },
      titleDirty: { value: false },
      workspaceShareStatus: { value: 'PRIVATE' },
      workspaceUuid: { value: 'uuid' },
      saveState: { value: 'saved' },
      lastSavedAt: { value: null },
    }
    const documentState = {
      workspaceDocumentSections: { value: [] },
      favoriteWorkspaceDocumentIds: { value: [7] },
    }
    const derived = {
      currentWorkspaceKey: { value: '7' },
      hasUnsavedChanges: { value: true },
    }
    const people = {
      workspacePropertyStatusOption: { value: { id: 'todo' } },
      workspacePropertyPriorityOption: { value: { id: 'high' } },
      workspacePropertyTags: { value: ['release'] },
    }

    const groups = createWorkspaceDocumentOperationsExperienceGroups({
      workspaceState,
      documentState,
      derived,
      people,
      preferences: {
        trackRecentWorkspaceDocument: vi.fn(),
        persistFavoriteWorkspaceDocuments: vi.fn(),
        persistWorkspaceDocumentSections: vi.fn(),
      },
    })

    expect(groups.state).toMatchObject({
      currentWorkspaceKey: { value: '7' },
      title: { value: 'Spec' },
      workspacePropertyStatusOption: { value: { id: 'todo' } },
      workspacePropertyPriorityOption: { value: { id: 'high' } },
      workspacePropertyTags: { value: ['release'] },
      workspaceDocumentSections: { value: [] },
      hasUnsavedChanges: { value: true },
    })
    expect(groups.preferences).toMatchObject({
      favoriteWorkspaceDocumentIds: { value: [7] },
      trackRecentWorkspaceDocument: expect.any(Function),
      persistFavoriteWorkspaceDocuments: expect.any(Function),
      persistWorkspaceDocumentSections: expect.any(Function),
    })
  })

  it('delegates mapped groups to useWorkspaceDocumentOperationsSetup', () => {
    const platform = { api: { savePost: vi.fn() }, router: { push: vi.fn() } }
    const workspaceState = { title: { value: 'Spec' } }
    const access = { canModifyWorkspacePage: { value: true } }
    const result = { openWorkspaceDocument: vi.fn(), refreshWorkspaceRevisions: vi.fn() }
    mocks.useWorkspaceDocumentOperationsSetup.mockReturnValue(result)

    expect(useWorkspaceDocumentOperationsExperienceSetup({ platform, workspaceState, access })).toBe(result)
    expect(mocks.useWorkspaceDocumentOperationsSetup).toHaveBeenCalledWith(expect.objectContaining({
      platform,
      access,
      state: expect.objectContaining({ title: { value: 'Spec' } }),
    }))
  })
})
