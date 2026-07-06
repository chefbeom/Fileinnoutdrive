import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceRuntimeLifecycle: vi.fn(),
}))

vi.mock('./useWorkspaceRuntimeLifecycle.js', () => ({
  useWorkspaceRuntimeLifecycle: mocks.useWorkspaceRuntimeLifecycle,
}))

import {
  createWorkspaceRuntimePropertySources,
  useWorkspaceRuntimeLifecycleSetup,
} from './useWorkspaceRuntimeLifecycleSetup.js'

const makeState = () => ({
  editorHolder: { name: 'holder' },
  workspacePropertyIcon: { name: 'icon' },
  workspacePropertyCoverColor: { name: 'cover' },
  workspacePropertyStatus: { name: 'status' },
  workspacePropertyPriority: { name: 'priority' },
  workspacePropertyOwnerEmail: { name: 'owner' },
  workspacePropertyDueDate: { name: 'due' },
  workspacePropertyTagsInput: { name: 'tags' },
  workspacePageLocked: { name: 'locked' },
})

describe('useWorkspaceRuntimeLifecycleSetup', () => {
  it('builds the runtime property sources from workspace state', () => {
    const state = makeState()

    expect(createWorkspaceRuntimePropertySources(state)).toEqual([
      state.workspacePropertyIcon,
      state.workspacePropertyCoverColor,
      state.workspacePropertyStatus,
      state.workspacePropertyPriority,
      state.workspacePropertyOwnerEmail,
      state.workspacePropertyDueDate,
      state.workspacePropertyTagsInput,
      state.workspacePageLocked,
    ])
  })

  it('maps grouped workspace dependencies into the runtime lifecycle composable', () => {
    const state = makeState()
    const route = { params: { id: '42' } }
    const router = { push: vi.fn() }
    const api = { getPost: vi.fn() }
    const authStore = { user: { email: 'admin@example.test' } }
    const handleRouteLeave = vi.fn()
    const showWorkspaceNotice = vi.fn()
    const refreshWorkspaceDocuments = vi.fn()
    const scheduleAutoSave = vi.fn()
    const loadWorkspacePreferences = vi.fn()
    const clearAutoSaveTimer = vi.fn()

    useWorkspaceRuntimeLifecycleSetup({
      state,
      platform: { route, router, api, authStore },
      guards: { handleRouteLeave },
      ui: { showWorkspaceNotice },
      workspace: { shouldWorkspaceEditorReadOnly: { value: false } },
      refreshers: { refreshWorkspaceDocuments },
      editor: { scheduleAutoSave },
      preferences: { loadWorkspacePreferences },
      lifecycle: { clearAutoSaveTimer },
    })

    expect(mocks.useWorkspaceRuntimeLifecycle).toHaveBeenCalledWith(expect.objectContaining({
      ...state,
      route,
      router,
      api,
      authStore,
      handleRouteLeave,
      showWorkspaceNotice,
      refreshWorkspaceDocuments,
      scheduleAutoSave,
      loadWorkspacePreferences,
      clearAutoSaveTimer,
      workspacePropertySources: createWorkspaceRuntimePropertySources(state),
    }))
  })
})