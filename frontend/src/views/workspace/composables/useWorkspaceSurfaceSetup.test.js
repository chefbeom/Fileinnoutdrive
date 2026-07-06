import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceFloatingPanelStackSetup: vi.fn(),
  useWorkspaceMainLayoutSetup: vi.fn(),
}))

vi.mock('./useWorkspaceFloatingPanelStackSetup.js', () => ({
  useWorkspaceFloatingPanelStackSetup: mocks.useWorkspaceFloatingPanelStackSetup,
}))

vi.mock('./useWorkspaceMainLayoutSetup.js', () => ({
  useWorkspaceMainLayoutSetup: mocks.useWorkspaceMainLayoutSetup,
}))

import {
  createWorkspaceSurfaceMainLayoutGroups,
  createWorkspaceSurfacePanelGroups,
  useWorkspaceSurfaceSetup,
} from './useWorkspaceSurfaceSetup.js'

describe('useWorkspaceSurfaceSetup', () => {
  it('maps one surface dependency group into floating panel setup groups', () => {
    const state = { workspaceId: { value: 42 } }
    const surface = { workspacePanelTabs: [{ id: 'home' }], canEditWorkspace: { value: true } }
    const actions = { openWorkspaceDocument: vi.fn() }
    const refs = { registerCommentInput: vi.fn() }

    const groups = createWorkspaceSurfacePanelGroups({
      state,
      surface,
      actions,
      refs,
      options: {
        workspacePropertyStatusOptions: [{ id: 'todo' }],
        workspacePropertyPriorityOptions: [{ id: 'high' }],
        workspaceQuickBlockOptions: [{ id: 'paragraph' }],
      },
    })

    expect(groups.state).toBe(state)
    expect(groups.overview).toBe(surface)
    expect(groups.comments).toBe(surface)
    expect(groups.assets).toBe(surface)
    expect(groups.actions).toBe(actions)
    expect(groups.refs).toBe(refs)
    expect(groups.options).toEqual({
      workspacePropertyStatusOptions: [{ id: 'todo' }],
      workspacePropertyPriorityOptions: [{ id: 'high' }],
      workspaceQuickBlockOptions: [{ id: 'paragraph' }],
    })
  })

  it('maps one surface dependency group into main layout setup groups', () => {
    const state = { workspaceId: { value: 7 } }
    const surface = { currentWorkspaceKey: { value: '7' }, workspaceImages: { value: [] } }
    const actions = { handleSave: vi.fn() }
    const workspaceTemplates = [{ id: 'meeting' }]

    const groups = createWorkspaceSurfaceMainLayoutGroups({
      state,
      surface,
      actions,
      options: { workspaceTemplates },
    })

    expect(groups.state).toBe(state)
    expect(groups.documents).toBe(surface)
    expect(groups.properties).toBe(surface)
    expect(groups.assets).toBe(surface)
    expect(groups.actions).toBe(actions)
    expect(groups.templates).toMatchObject({
      currentWorkspaceKey: { value: '7' },
      workspaceTemplates,
    })
  })

  it('combines floating panel and main layout setup results', () => {
    const state = { workspaceId: { value: 1 } }
    const surface = { activeUsers: { value: [] } }
    const actions = { openWorkspaceCommandPalette: vi.fn() }
    mocks.useWorkspaceFloatingPanelStackSetup.mockReturnValue({
      workspaceFloatingPanelStackModel: { id: 'panel-model' },
      workspaceFloatingPanelStackActions: { id: 'panel-actions' },
    })
    mocks.useWorkspaceMainLayoutSetup.mockReturnValue({
      workspaceMainLayoutModel: { id: 'layout-model' },
      workspaceMainLayoutActions: { id: 'layout-actions' },
    })

    const result = useWorkspaceSurfaceSetup({ state, surface, actions })

    expect(result).toMatchObject({
      workspaceFloatingPanelStackModel: { id: 'panel-model' },
      workspaceFloatingPanelStackActions: { id: 'panel-actions' },
      workspaceMainLayoutModel: { id: 'layout-model' },
      workspaceMainLayoutActions: { id: 'layout-actions' },
    })
    expect(mocks.useWorkspaceFloatingPanelStackSetup).toHaveBeenCalledWith(expect.objectContaining({
      state,
      overview: surface,
      actions,
    }))
    expect(mocks.useWorkspaceMainLayoutSetup).toHaveBeenCalledWith(expect.objectContaining({
      state,
      documents: surface,
      actions,
    }))
  })
})