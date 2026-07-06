import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceAssetActions: vi.fn(),
  useWorkspaceAssetPanel: vi.fn(),
  useWorkspaceAutoSave: vi.fn(),
  useWorkspaceCommentMutations: vi.fn(),
  useWorkspaceCommentPanel: vi.fn(),
  useWorkspaceEditorMutations: vi.fn(),
  useWorkspaceQuickActions: vi.fn(),
  useWorkspaceRevisionPanel: vi.fn(),
  useWorkspaceTaskPanel: vi.fn(),
}))

vi.mock('./useWorkspaceAssetActions.js', () => ({ useWorkspaceAssetActions: mocks.useWorkspaceAssetActions }))
vi.mock('./useWorkspaceAssetPanel.js', () => ({ useWorkspaceAssetPanel: mocks.useWorkspaceAssetPanel }))
vi.mock('./useWorkspaceAutoSave.js', () => ({ useWorkspaceAutoSave: mocks.useWorkspaceAutoSave }))
vi.mock('./useWorkspaceCommentMutations.js', () => ({ useWorkspaceCommentMutations: mocks.useWorkspaceCommentMutations }))
vi.mock('./useWorkspaceCommentPanel.js', () => ({ useWorkspaceCommentPanel: mocks.useWorkspaceCommentPanel }))
vi.mock('./useWorkspaceEditorMutations.js', () => ({ useWorkspaceEditorMutations: mocks.useWorkspaceEditorMutations }))
vi.mock('./useWorkspaceQuickActions.js', () => ({ useWorkspaceQuickActions: mocks.useWorkspaceQuickActions }))
vi.mock('./useWorkspaceRevisionPanel.js', () => ({ useWorkspaceRevisionPanel: mocks.useWorkspaceRevisionPanel }))
vi.mock('./useWorkspaceTaskPanel.js', () => ({ useWorkspaceTaskPanel: mocks.useWorkspaceTaskPanel }))

import { useWorkspaceEditorInteractionSetup } from './useWorkspaceEditorInteractionSetup.js'

describe('useWorkspaceEditorInteractionSetup', () => {
  it('wires editor, task, asset, comment, and revision interactions', () => {
    const scheduleAutoSave = vi.fn()
    const persistWorkspace = vi.fn()
    const ensureWorkspacePersisted = vi.fn()
    const showWorkspaceNotice = vi.fn()
    const normalizeWorkspaceAsset = vi.fn()
    const normalizeWorkspaceComment = vi.fn()
    const mergeWorkspaceAssets = vi.fn()
    const removeWorkspaceAssets = vi.fn()
    const canInsertWorkspaceQuickBlock = { value: true }
    const state = {
      editorApi: { value: {} },
      workspaceId: { value: 7 },
      title: { value: 'Spec' },
      workspaceAssets: { value: [] },
      workspaceComments: { value: [] },
      workspaceRevisions: { value: [] },
    }

    mocks.useWorkspaceAutoSave.mockReturnValue({ scheduleAutoSave, clearAutoSaveTimer: vi.fn() })
    mocks.useWorkspaceQuickActions.mockReturnValue({
      canInsertWorkspaceQuickBlock,
      workspaceInlineQuickBlockOptions: { value: [] },
      canStartWorkspaceSubpage: { value: true },
      canCreateWorkspaceSubpage: { value: false },
    })
    mocks.useWorkspaceEditorMutations.mockReturnValue({ handleSave: vi.fn(), applyWorkspaceTemplate: vi.fn() })
    mocks.useWorkspaceTaskPanel.mockReturnValue({ openDocumentTasks: { value: [] } })
    mocks.useWorkspaceAssetPanel.mockReturnValue({ workspaceImages: { value: [] } })
    mocks.useWorkspaceAssetActions.mockReturnValue({ handleEditorImageUpload: vi.fn() })
    mocks.useWorkspaceCommentPanel.mockReturnValue({ visibleWorkspaceComments: { value: [] } })
    mocks.useWorkspaceRevisionPanel.mockReturnValue({ buildWorkspaceRevisionDiff: vi.fn() })
    mocks.useWorkspaceCommentMutations.mockReturnValue({ upsertWorkspaceComment: vi.fn() })

    const result = useWorkspaceEditorInteractionSetup({
      platform: {
        api: {
          uploadWorkspaceAssets: vi.fn(),
          deleteWorkspaceAsset: vi.fn(),
          saveWorkspaceAssetToDrive: vi.fn(),
          createWorkspaceComment: vi.fn(),
          updateWorkspaceComment: vi.fn(),
          resolveWorkspaceComment: vi.fn(),
          deleteWorkspaceComment: vi.fn(),
        },
      },
      state,
      options: { quickBlockOptions: [{ id: 'paragraph' }] },
      access: {
        canEditWorkspace: { value: true },
        canModifyWorkspacePage: { value: true },
        canManageAssets: { value: true },
        canManageWorkspaceShare: { value: true },
        canCommentOnWorkspace: { value: true },
      },
      user: {
        currentUserEmail: { value: 'admin@example.test' },
        currentUserIdx: { value: 1 },
      },
      persistence: { persistWorkspace, ensureWorkspacePersisted },
      assets: {
        downloadWorkspaceAssetFile: vi.fn(),
        normalizeWorkspaceAsset,
        mergeWorkspaceAssets,
        removeWorkspaceAssets,
      },
      comments: { normalizeWorkspaceComment },
      revisions: { blockTypeLabel: vi.fn() },
      ui: { showWorkspaceNotice },
    })

    expect(mocks.useWorkspaceAutoSave).toHaveBeenCalledWith(expect.objectContaining({ persistWorkspace }))
    expect(mocks.useWorkspaceEditorMutations).toHaveBeenCalledWith(expect.objectContaining({
      canInsertWorkspaceQuickBlock,
      scheduleAutoSave,
      persistWorkspace,
    }))
    expect(mocks.useWorkspaceAssetActions).toHaveBeenCalledWith(expect.objectContaining({
      ensureWorkspacePersisted,
      normalizeWorkspaceAsset,
      mergeWorkspaceAssets,
      removeWorkspaceAssets,
      showWorkspaceNotice,
    }))
    expect(mocks.useWorkspaceCommentMutations).toHaveBeenCalledWith(expect.objectContaining({
      normalizeWorkspaceComment,
      ensureWorkspacePersisted,
    }))
    expect(mocks.useWorkspaceRevisionPanel).toHaveBeenCalledWith(expect.objectContaining({
      blockTypeLabel: expect.any(Function),
    }))
    expect(result).toMatchObject({
      scheduleAutoSave,
      canInsertWorkspaceQuickBlock,
    })
    expect(result.handleEditorImageUpload).toEqual(expect.any(Function))
  })
})
