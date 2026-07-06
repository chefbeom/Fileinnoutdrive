import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceSurfaceSetup: vi.fn((groups) => ({
    receivedGroups: groups,
  })),
}))

vi.mock('./useWorkspaceSurfaceSetup.js', () => ({
  useWorkspaceSurfaceSetup: mocks.useWorkspaceSurfaceSetup,
}))

import {
  createWorkspaceSurfaceExperienceEntries,
  createWorkspaceSurfaceExperienceGroups,
  useWorkspaceSurfaceExperienceSetup,
} from './useWorkspaceSurfaceExperienceSetup.js'

describe('useWorkspaceSurfaceExperienceSetup', () => {
  it('combines setup result objects and service helpers into one surface entry set', () => {
    const openWorkspaceDocument = vi.fn()
    const focusWorkspaceTaskItem = vi.fn()
    const roleLabel = vi.fn()

    const entries = createWorkspaceSurfaceExperienceEntries({
      coreAccess: { canEditWorkspace: { value: true } },
      indexPlanning: { workspaceBoardRows: { value: [] } },
      editorExperience: { handleSave: vi.fn() },
      peopleExperience: { workspaceMemberRows: { value: [] } },
      documentExperience: { refreshWorkspacePageIndex: vi.fn() },
      members: { handleRoleAction: vi.fn() },
      documentOperations: { openWorkspaceDocument },
      collaboration: { focusWorkspaceTaskItem },
      services: { roleLabel },
    })

    expect(entries).toMatchObject({
      canEditWorkspace: { value: true },
      workspaceBoardRows: { value: [] },
      workspaceMemberRows: { value: [] },
      openWorkspaceDocument,
      focusWorkspaceTaskItem,
      roleLabel,
    })
  })

  it('creates the surface setup input while preserving state, options, and refs', () => {
    const state = { workspaceId: { value: 10 } }
    const options = { workspaceQuickBlockOptions: [{ id: 'todo' }] }
    const refs = { registerCommentInput: vi.fn() }
    const groups = {
      coreAccess: { isValid: { value: true } },
      editorExperience: { handleSave: vi.fn() },
    }

    const result = createWorkspaceSurfaceExperienceGroups({
      state,
      options,
      groups,
      services: { userInitial: vi.fn() },
      refs,
    })

    expect(result.state).toBe(state)
    expect(result.options).toBe(options)
    expect(result.refs).toBe(refs)
    expect(result.surface).toBe(result.actions)
    expect(result.surface).toMatchObject({
      isValid: { value: true },
      handleSave: groups.editorExperience.handleSave,
      userInitial: expect.any(Function),
    })
  })

  it('delegates the composed surface groups to useWorkspaceSurfaceSetup', () => {
    const state = { workspaceId: { value: 3 } }
    const refs = { registerSubpageInput: vi.fn() }

    const result = useWorkspaceSurfaceExperienceSetup({
      state,
      groups: {
        documentOperations: { createWorkspaceDocument: vi.fn() },
      },
      refs,
    })

    expect(result.receivedGroups).toMatchObject({
      state,
      refs,
      surface: {
        createWorkspaceDocument: expect.any(Function),
      },
      actions: {
        createWorkspaceDocument: expect.any(Function),
      },
    })
    expect(mocks.useWorkspaceSurfaceSetup).toHaveBeenCalledTimes(1)
  })
})