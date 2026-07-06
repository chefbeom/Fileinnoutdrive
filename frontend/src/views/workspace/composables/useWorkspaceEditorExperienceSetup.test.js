import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceEditorInteractionSetup: vi.fn(),
}))

vi.mock('./useWorkspaceEditorInteractionSetup.js', () => ({
  useWorkspaceEditorInteractionSetup: mocks.useWorkspaceEditorInteractionSetup,
}))

import {
  createWorkspaceEditorExperienceGroups,
  useWorkspaceEditorExperienceSetup,
} from './useWorkspaceEditorExperienceSetup.js'

describe('useWorkspaceEditorExperienceSetup', () => {
  it('maps workspace state and derived editor dependencies into interaction setup state', () => {
    const workspaceState = {
      editorApi: { value: 'editor' },
      isEditorLoading: { value: false },
      saveState: { value: 'idle' },
      workspaceSubpageCreating: { value: false },
      workspaceSubpageTitle: { value: '' },
      workspaceQuickBlockAdding: { value: false },
      workspaceQuickBlockText: { value: '' },
      workspaceInlineQuickBlockText: { value: '' },
      activeWorkspacePanelTab: { value: 'home' },
      workspacePageLocked: { value: false },
      title: { value: 'Spec' },
      titleDirty: { value: false },
      workspaceTemplateApplying: { value: false },
      workspaceTemplateApplied: { value: false },
      workspaceTaskFilter: { value: 'open' },
      workspaceTaskAdding: { value: false },
      newWorkspaceTask: { value: '' },
      workspaceAssets: { value: [] },
      savingWorkspaceAssetIds: { value: new Set() },
      workspaceId: { value: 7 },
      workspaceAssetUploading: { value: false },
      workspaceAssetError: { value: '' },
      activeWorkspaceAssetId: { value: null },
      deletingAssetIds: { value: new Set() },
      imageInput: { value: null },
      fileInput: { value: null },
      workspaceComments: { value: [] },
      workspaceCommentFilter: { value: 'all' },
      workspaceRevisions: { value: [] },
      activeWorkspaceRevision: { value: null },
      workspaceRevisionDiff: { value: null },
      workspaceCommentSaving: { value: false },
      workspaceCommentError: { value: '' },
      workspaceCommentEditingId: { value: null },
      workspaceCommentEditDraft: { value: '' },
      newWorkspaceComment: { value: '' },
      resolvingCommentIds: { value: new Set() },
      deletingCommentIds: { value: new Set() },
      updatingCommentIds: { value: new Set() },
    }
    const derived = {
      hasUnsavedChanges: { value: true },
      documentTasks: { value: [{ id: 'task-1' }] },
      selectedBlockAnchor: { value: { blockId: 'b1' } },
      isValid: { value: true },
    }

    const groups = createWorkspaceEditorExperienceGroups({
      workspaceState,
      derived,
      options: { quickBlockOptions: [{ id: 'paragraph' }] },
    })

    expect(groups.state).toMatchObject({
      editorApi: { value: 'editor' },
      hasUnsavedChanges: { value: true },
      documentTasks: { value: [{ id: 'task-1' }] },
      selectedBlockAnchor: { value: { blockId: 'b1' } },
      isValid: { value: true },
    })
    expect(groups.options).toEqual({ quickBlockOptions: [{ id: 'paragraph' }] })
  })

  it('delegates the mapped groups to useWorkspaceEditorInteractionSetup', () => {
    const platform = { api: { savePost: vi.fn() } }
    const workspaceState = { editorApi: { value: 'editor' } }
    const access = { canEditWorkspace: { value: true } }
    const result = { handleSave: vi.fn(), visibleWorkspaceComments: { value: [] } }
    mocks.useWorkspaceEditorInteractionSetup.mockReturnValue(result)

    expect(useWorkspaceEditorExperienceSetup({ platform, workspaceState, access })).toBe(result)
    expect(mocks.useWorkspaceEditorInteractionSetup).toHaveBeenCalledWith(expect.objectContaining({
      platform,
      access,
      state: expect.objectContaining({ editorApi: { value: 'editor' } }),
    }))
  })
})
