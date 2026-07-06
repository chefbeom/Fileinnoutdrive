import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceCollaborationCommandSetup: vi.fn(),
}))

vi.mock('./useWorkspaceCollaborationCommandSetup.js', () => ({
  useWorkspaceCollaborationCommandSetup: mocks.useWorkspaceCollaborationCommandSetup,
}))

import {
  createWorkspaceCollaborationExperienceGroups,
  useWorkspaceCollaborationExperienceSetup,
} from './useWorkspaceCollaborationExperienceSetup.js'

describe('useWorkspaceCollaborationExperienceSetup', () => {
  it('maps workspace and derived state into collaboration command state', () => {
    const workspaceState = {
      workspaceId: { value: 7 },
      workspaceAssets: { value: [] },
      workspaceAssetLoading: { value: false },
      workspaceAssetError: { value: '' },
      workspaceComments: { value: [] },
      workspaceCommentLoading: { value: false },
      workspaceCommentError: { value: '' },
      isWorkspacePanelCollapsed: { value: false },
      activeWorkspacePanelTab: { value: 'home' },
      workspaceCommentFilter: { value: 'all' },
      activeWorkspaceAssetId: { value: null },
      editorApi: { value: {} },
      workspaceAccessRole: { value: 'OWNER' },
      workspaceShareStatus: { value: 'PRIVATE' },
      workspaceUuid: { value: 'uuid' },
      titleDirty: { value: false },
      saveState: { value: 'saved' },
      saveError: { value: '' },
      lastSavedAt: { value: null },
      showWorkspaceShareModal: { value: false },
      isEditorLoading: { value: false },
      workspaceCommentInput: { value: null },
      newWorkspaceComment: { value: '' },
      showWorkspaceMentionMenu: { value: false },
    }
    const derived = {
      hasUnsavedChanges: { value: true },
      workspaceBlockCommentSummaries: { value: [] },
      currentWorkspaceKey: { value: '7' },
      workspaceCommandBaseItems: { value: [{ id: 'save' }] },
      workspaceNotice: { value: null },
      workspaceConfirm: { value: null },
    }

    const groups = createWorkspaceCollaborationExperienceGroups({ workspaceState, derived })

    expect(groups.state).toMatchObject({
      workspaceId: { value: 7 },
      hasUnsavedChanges: { value: true },
      workspaceBlockCommentSummaries: { value: [] },
      currentWorkspaceKey: { value: '7' },
      workspaceCommandBaseItems: { value: [{ id: 'save' }] },
      workspaceNotice: { value: null },
      workspaceConfirm: { value: null },
    })
  })

  it('delegates mapped groups to useWorkspaceCollaborationCommandSetup', () => {
    const platform = { api: {}, route: {}, router: {}, authStore: {}, waitForDomUpdate: vi.fn() }
    const access = { canCommentOnWorkspace: { value: true } }
    const commands = { handleSave: vi.fn() }
    const result = { openWorkspaceShare: vi.fn(), workspaceOverlaysModel: { value: {} } }
    mocks.useWorkspaceCollaborationCommandSetup.mockReturnValue(result)

    expect(useWorkspaceCollaborationExperienceSetup({ platform, access, commands })).toBe(result)
    expect(mocks.useWorkspaceCollaborationCommandSetup).toHaveBeenCalledWith(expect.objectContaining({
      platform,
      access,
      commands,
      state: expect.any(Object),
    }))
  })
})
