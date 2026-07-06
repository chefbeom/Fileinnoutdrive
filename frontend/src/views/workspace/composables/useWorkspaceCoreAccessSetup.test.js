import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceAccessState: vi.fn(),
  useWorkspaceDerivedState: vi.fn(),
  useWorkspaceEditorRefs: vi.fn(),
  useWorkspaceLeaveGuard: vi.fn(),
  useWorkspaceNormalization: vi.fn(),
  useWorkspacePageMetadata: vi.fn(),
}))

vi.mock('./useWorkspaceAccessState.js', () => ({ useWorkspaceAccessState: mocks.useWorkspaceAccessState }))
vi.mock('./useWorkspaceDerivedState.js', () => ({ useWorkspaceDerivedState: mocks.useWorkspaceDerivedState }))
vi.mock('./useWorkspaceEditorRefs.js', () => ({ useWorkspaceEditorRefs: mocks.useWorkspaceEditorRefs }))
vi.mock('./useWorkspaceLeaveGuard.js', () => ({ useWorkspaceLeaveGuard: mocks.useWorkspaceLeaveGuard }))
vi.mock('./useWorkspaceNormalization.js', () => ({ useWorkspaceNormalization: mocks.useWorkspaceNormalization }))
vi.mock('./useWorkspacePageMetadata.js', () => ({ useWorkspacePageMetadata: mocks.useWorkspacePageMetadata }))

import { useWorkspaceCoreAccessSetup } from './useWorkspaceCoreAccessSetup.js'

describe('useWorkspaceCoreAccessSetup', () => {
  it('wires normalization, metadata, editor refs, derived state, leave guard, and access state', () => {
    const normalizeWorkspaceProperties = vi.fn()
    const currentWorkspaceParentPage = vi.fn()
    const openWorkspaceDocument = vi.fn()
    const workspacePageBreadcrumbTrail = vi.fn()
    const currentWorkspaceChildPages = vi.fn()
    const linkedWorkspaceDocuments = vi.fn()
    const workspaceBacklinks = vi.fn()
    const isEditorDirty = { value: false }
    const activeUsers = { value: [] }
    const hasUnsavedChanges = { value: false }
    const isValid = { value: true }
    const currentUser = vi.fn()
    const state = {
      workspaceId: { value: 7 },
      editorApi: { value: {} },
      title: { value: 'Spec' },
      titleDirty: { value: false },
      saveState: { value: 'saved' },
      workspaceAccessRole: { value: 'ADMIN' },
      workspacePageLocked: { value: false },
      workspaceTemplateApplied: { value: false },
      workspaceShareStatus: { value: 'PRIVATE' },
    }

    mocks.useWorkspaceNormalization.mockReturnValue({
      normalizeWorkspaceProperties,
      normalizeWorkspaceAsset: vi.fn(),
    })
    mocks.useWorkspacePageMetadata.mockReturnValue({
      applyWorkspaceProperties: vi.fn(),
    })
    mocks.useWorkspaceEditorRefs.mockReturnValue({
      isEditorDirty,
      activeUsers,
    })
    mocks.useWorkspaceDerivedState.mockReturnValue({
      hasUnsavedChanges,
      isValid,
      currentUserEmail: { value: 'admin@example.test' },
    })
    mocks.useWorkspaceLeaveGuard.mockReturnValue({
      confirmDiscardIfNeeded: vi.fn(),
    })
    mocks.useWorkspaceAccessState.mockReturnValue({
      canModifyWorkspacePage: { value: true },
    })

    const result = useWorkspaceCoreAccessSetup({
      platform: { route: { params: { id: '7' } }, currentUser },
      state,
      propertyOptions: { statusOptions: [] },
      documents: {
        currentWorkspaceParentPage,
        openWorkspaceDocument,
        workspacePageBreadcrumbTrail,
        currentWorkspaceChildPages,
        linkedWorkspaceDocuments,
        workspaceBacklinks,
      },
    })

    expect(mocks.useWorkspaceNormalization).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: state.workspaceId,
    }))
    expect(mocks.useWorkspacePageMetadata).toHaveBeenCalledWith(expect.objectContaining({
      normalizeWorkspaceProperties,
      currentWorkspaceParentPage,
      openWorkspaceDocument,
    }))
    expect(mocks.useWorkspaceDerivedState).toHaveBeenCalledWith(expect.objectContaining({
      isEditorDirty,
      activeUsers,
      workspacePageBreadcrumbTrail,
      currentWorkspaceChildPages,
      linkedWorkspaceDocuments,
      workspaceBacklinks,
    }))
    expect(mocks.useWorkspaceLeaveGuard).toHaveBeenCalledWith({ hasUnsavedChanges })
    expect(mocks.useWorkspaceAccessState).toHaveBeenCalledWith(expect.objectContaining({
      currentUser,
      hasUnsavedChanges,
      isValid,
    }))
    expect(result).toEqual(expect.objectContaining({
      normalizeWorkspaceProperties,
      isEditorDirty,
      hasUnsavedChanges,
      canModifyWorkspacePage: { value: true },
    }))
  })
})
