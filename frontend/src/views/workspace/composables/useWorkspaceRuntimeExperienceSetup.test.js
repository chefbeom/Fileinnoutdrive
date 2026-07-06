import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceRuntimeLifecycleSetup: vi.fn(),
}))

vi.mock('./useWorkspaceRuntimeLifecycleSetup.js', () => ({
  useWorkspaceRuntimeLifecycleSetup: mocks.useWorkspaceRuntimeLifecycleSetup,
}))

import {
  createWorkspaceRuntimeExperienceGroups,
  useWorkspaceRuntimeExperienceSetup,
} from './useWorkspaceRuntimeExperienceSetup.js'

describe('useWorkspaceRuntimeExperienceSetup', () => {
  it('splits flat runtime dependencies into lifecycle setup groups', () => {
    const workspaceState = { workspaceId: { value: 7 } }
    const platform = { route: { path: '/workspace/7' }, router: { push: vi.fn() } }
    const runtime = {
      handleRouteLeave: vi.fn(),
      handleWorkspaceGlobalKeydown: vi.fn(),
      shouldWorkspaceEditorReadOnly: { value: false },
      applyWorkspaceProperties: vi.fn(),
      refreshWorkspaceAssets: vi.fn(),
      handleEditorImageUpload: vi.fn(),
      workspaceFavoriteStorageKey: { value: 'favorites' },
      clearAutoSaveTimer: vi.fn(),
    }

    const groups = createWorkspaceRuntimeExperienceGroups({ platform, workspaceState, runtime })

    expect(groups.state).toBe(workspaceState)
    expect(groups.platform).toBe(platform)
    expect(groups.guards).toMatchObject({ handleRouteLeave: runtime.handleRouteLeave })
    expect(groups.ui).toMatchObject({ handleWorkspaceGlobalKeydown: runtime.handleWorkspaceGlobalKeydown })
    expect(groups.workspace).toMatchObject({ shouldWorkspaceEditorReadOnly: runtime.shouldWorkspaceEditorReadOnly })
    expect(groups.metadata).toMatchObject({ applyWorkspaceProperties: runtime.applyWorkspaceProperties })
    expect(groups.refreshers).toMatchObject({ refreshWorkspaceAssets: runtime.refreshWorkspaceAssets })
    expect(groups.editor).toMatchObject({ handleEditorImageUpload: runtime.handleEditorImageUpload })
    expect(groups.preferences).toMatchObject({ workspaceFavoriteStorageKey: runtime.workspaceFavoriteStorageKey })
    expect(groups.lifecycle).toMatchObject({ clearAutoSaveTimer: runtime.clearAutoSaveTimer })
  })

  it('delegates grouped dependencies to useWorkspaceRuntimeLifecycleSetup', () => {
    const platform = { api: { getPost: vi.fn() } }
    const workspaceState = { workspaceId: { value: 7 } }
    const runtime = { loadWorkspacePreferences: vi.fn() }
    mocks.useWorkspaceRuntimeLifecycleSetup.mockReturnValue(undefined)

    useWorkspaceRuntimeExperienceSetup({ platform, workspaceState, runtime })

    expect(mocks.useWorkspaceRuntimeLifecycleSetup).toHaveBeenCalledWith(expect.objectContaining({
      state: workspaceState,
      platform,
      preferences: expect.objectContaining({
        loadWorkspacePreferences: runtime.loadWorkspacePreferences,
      }),
    }))
  })
})
