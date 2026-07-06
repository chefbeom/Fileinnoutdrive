import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceFloatingPanelStackBridge: vi.fn(),
}))

vi.mock('./useWorkspaceFloatingPanelStackBridge.js', () => ({
  useWorkspaceFloatingPanelStackBridge: mocks.useWorkspaceFloatingPanelStackBridge,
}))

import {
  createWorkspaceFloatingPanelStackContext,
  useWorkspaceFloatingPanelStackSetup,
} from './useWorkspaceFloatingPanelStackSetup.js'

describe('useWorkspaceFloatingPanelStackSetup', () => {
  it('merges grouped panel dependencies into the flat bridge context', () => {
    const handleRoleAction = vi.fn()
    const refreshWorkspacePageIndex = vi.fn()
    const registerSubpageInput = vi.fn()

    const context = createWorkspaceFloatingPanelStackContext({
      state: { workspaceId: { value: 42 } },
      options: {
        workspacePropertyStatusOptions: [{ id: 'todo' }],
        workspacePropertyPriorityOptions: [{ id: 'high' }],
        workspaceQuickBlockOptions: [{ id: 'paragraph' }],
      },
      overview: { workspacePanelTabs: [{ id: 'home' }] },
      database: { visibleWorkspacePageIndexRows: [{ id: 1 }] },
      actions: { handleRoleAction, refreshWorkspacePageIndex },
      refs: { registerSubpageInput },
    })

    expect(context).toMatchObject({
      workspaceId: { value: 42 },
      workspacePanelTabs: [{ id: 'home' }],
      visibleWorkspacePageIndexRows: [{ id: 1 }],
      workspacePropertyStatusOptions: [{ id: 'todo' }],
      workspacePropertyPriorityOptions: [{ id: 'high' }],
      workspaceQuickBlockOptions: [{ id: 'paragraph' }],
      refreshWorkspacePageIndex,
      registerSubpageInput,
    })

    context.removeWorkspaceMember({ email: 'member@example.test' })
    expect(handleRoleAction).toHaveBeenCalledWith({ email: 'member@example.test' }, 'KICKED')
  })

  it('delegates setup to the flat floating panel stack bridge', () => {
    const state = { workspaceId: { value: 7 } }
    const result = { workspaceFloatingPanelStackModel: {}, workspaceFloatingPanelStackActions: {} }
    mocks.useWorkspaceFloatingPanelStackBridge.mockReturnValue(result)

    expect(useWorkspaceFloatingPanelStackSetup({ state })).toBe(result)
    expect(mocks.useWorkspaceFloatingPanelStackBridge).toHaveBeenCalledWith(expect.objectContaining(state))
  })
})