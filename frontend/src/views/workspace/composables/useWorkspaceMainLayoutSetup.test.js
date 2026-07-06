import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceMainLayoutBridge: vi.fn(),
}))

vi.mock('./useWorkspaceMainLayoutBridge.js', () => ({
  useWorkspaceMainLayoutBridge: mocks.useWorkspaceMainLayoutBridge,
}))

import {
  createWorkspaceMainLayoutContext,
  useWorkspaceMainLayoutSetup,
} from './useWorkspaceMainLayoutSetup.js'

describe('useWorkspaceMainLayoutSetup', () => {
  it('merges grouped layout dependencies into the flat bridge context', () => {
    const openWorkspaceCommandPalette = vi.fn()
    const handleSave = vi.fn()

    const context = createWorkspaceMainLayoutContext({
      state: { workspaceId: { value: 42 } },
      documents: {
        currentWorkspaceKey: { value: '42' },
        favoriteWorkspaceDocuments: { value: [{ id: 1 }] },
      },
      properties: {
        workspacePropertyStatusOption: { value: { id: 'todo' } },
      },
      status: {
        saveStatusLabel: { value: 'Saved' },
      },
      access: {
        canEditWorkspace: { value: true },
      },
      presence: {
        activeUsers: { value: [{ email: 'a@example.test' }] },
      },
      assets: {
        workspaceImages: { value: [{ id: 'asset-1' }] },
      },
      templates: {
        workspaceTemplates: { value: [{ id: 'template-1' }] },
      },
      actions: {
        openWorkspaceCommandPalette,
        handleSave,
      },
    })

    expect(context).toMatchObject({
      workspaceId: { value: 42 },
      currentWorkspaceKey: { value: '42' },
      favoriteWorkspaceDocuments: { value: [{ id: 1 }] },
      workspacePropertyStatusOption: { value: { id: 'todo' } },
      saveStatusLabel: { value: 'Saved' },
      canEditWorkspace: { value: true },
      activeUsers: { value: [{ email: 'a@example.test' }] },
      workspaceImages: { value: [{ id: 'asset-1' }] },
      workspaceTemplates: { value: [{ id: 'template-1' }] },
      openWorkspaceCommandPalette,
      handleSave,
    })
  })

  it('delegates setup to the flat main layout bridge', () => {
    const state = { workspaceId: { value: 7 } }
    const result = { workspaceMainLayoutModel: {}, workspaceMainLayoutActions: {} }
    mocks.useWorkspaceMainLayoutBridge.mockReturnValue(result)

    expect(useWorkspaceMainLayoutSetup({ state })).toBe(result)
    expect(mocks.useWorkspaceMainLayoutBridge).toHaveBeenCalledWith(expect.objectContaining(state))
  })
})
