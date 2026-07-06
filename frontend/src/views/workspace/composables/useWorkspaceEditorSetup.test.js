import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useWorkspaceEditorSetup } from './useWorkspaceEditorSetup.js'

const createEditorApi = () => ({
  editor: { isReady: Promise.resolve() },
  destroy: vi.fn(async () => {}),
  bindTitleRef: vi.fn(),
  markSaved: vi.fn(),
})

const createHarness = ({ data = {}, editor = createEditorApi() } = {}) => {
  const holder = { innerHTML: '<p>old</p>' }
  const initEditor = vi.fn(async () => editor)
  const refreshWorkspaceAssets = vi.fn(async () => {})
  const refreshWorkspaceComments = vi.fn(async () => {})
  const refreshWorkspaceRevisions = vi.fn(async () => {})
  const refreshWorkspaceMembers = vi.fn(async () => {})
  const applyWorkspaceProperties = vi.fn()
  const applyWorkspaceParentPage = vi.fn()
  const trackRecentWorkspaceDocument = vi.fn()
  const applyWorkspaceBlockCommentSummaries = vi.fn()
  const clearAutoSaveTimer = vi.fn()
  const resetLeaveGuardBypass = vi.fn()
  const router = { replace: vi.fn(async () => {}) }
  const logError = vi.fn()
  const state = {
    editorHolder: ref(holder),
    editorApi: ref(null),
    isEditorLoading: ref(false),
    saveState: ref('saved'),
    saveError: ref('previous'),
    lastSavedAt: ref('yesterday'),
    title: ref('Old title'),
    titleDirty: ref(true),
    workspaceTemplateApplied: ref(true),
    workspaceTemplateApplying: ref('template-a'),
    workspaceId: ref(null),
    workspaceAccessRole: ref('ADMIN'),
    workspaceShareStatus: ref('Private'),
    workspaceUuid: ref(''),
    showWorkspaceShareModal: ref(true),
    shouldWorkspaceEditorReadOnly: computed(() => false),
    currentWorkspaceProperties: computed(() => ({ status: 'todo' })),
    workspaceParentPageId: ref(12),
    workspaceParentPageTitle: ref('Parent'),
    workspaceDocumentById: ref(new Map([['42', { scope: 'team' }]])),
  }
  const subject = useWorkspaceEditorSetup({
    ...state,
    router,
    authStore: { user: { email: 'user@example.test' }, token: 'token-1' },
    clearAutoSaveTimer,
    resetLeaveGuardBypass,
    prepareWorkspaceData: vi.fn(async () => ({
      idx: 42,
      title: 'Loaded title',
      contents: { blocks: [] },
      accessRole: 'WRITE',
      status: 'Private',
      type: false,
      uuid: 'uuid-42',
      updatedAt: '2026-07-04T00:00:00Z',
      ...data,
    })),
    normalizeWorkspaceShareStatus: (status, type) => `${status}:${type}`,
    trackRecentWorkspaceDocument,
    applyWorkspaceProperties,
    applyWorkspaceParentPage,
    extractWorkspacePropertiesFromContents: (contents) => ({ from: contents }),
    extractWorkspaceParentFromContents: (contents) => ({ parentFrom: contents }),
    refreshWorkspaceAssets,
    refreshWorkspaceComments,
    refreshWorkspaceRevisions,
    refreshWorkspaceMembers,
    handleEditorImageUpload: vi.fn(),
    scheduleAutoSave: vi.fn(),
    handleEditorBlockCommentBadgeClick: vi.fn(),
    applyWorkspaceBlockCommentSummaries,
    waitForDomUpdate: vi.fn(async () => {}),
    initEditorLoader: vi.fn(async () => ({ initEditor })),
    now: () => 1234,
    logError,
  })

  return {
    ...state,
    subject,
    holder,
    editor,
    initEditor,
    router,
    logError,
    refreshWorkspaceAssets,
    refreshWorkspaceComments,
    refreshWorkspaceRevisions,
    refreshWorkspaceMembers,
    applyWorkspaceProperties,
    applyWorkspaceParentPage,
    trackRecentWorkspaceDocument,
    applyWorkspaceBlockCommentSummaries,
    clearAutoSaveTimer,
    resetLeaveGuardBypass,
  }
}

describe('useWorkspaceEditorSetup', () => {
  it('loads workspace data, refreshes related panels, and initializes the editor', async () => {
    const harness = createHarness()

    await harness.subject.setupEditor()

    expect(harness.clearAutoSaveTimer).toHaveBeenCalled()
    expect(harness.resetLeaveGuardBypass).toHaveBeenCalled()
    expect(harness.saveState.value).toBe('idle')
    expect(harness.saveError.value).toBe('')
    expect(harness.lastSavedAt.value).toBeNull()
    expect(harness.title.value).toBe('Loaded title')
    expect(harness.titleDirty.value).toBe(false)
    expect(harness.workspaceTemplateApplied.value).toBe(false)
    expect(harness.workspaceTemplateApplying.value).toBe('')
    expect(harness.workspaceId.value).toBe(42)
    expect(harness.workspaceAccessRole.value).toBe('WRITE')
    expect(harness.workspaceShareStatus.value).toBe('Private:false')
    expect(harness.workspaceUuid.value).toBe('uuid-42')
    expect(harness.showWorkspaceShareModal.value).toBe(false)
    expect(harness.trackRecentWorkspaceDocument).toHaveBeenCalledWith({
      id: 42,
      title: 'Loaded title',
      updatedAt: '2026-07-04T00:00:00Z',
      role: 'WRITE',
      scope: 'team',
    })
    expect(harness.applyWorkspaceProperties).toHaveBeenCalledWith({ from: { blocks: [] } })
    expect(harness.applyWorkspaceParentPage).toHaveBeenCalledWith({ parentFrom: { blocks: [] } })
    expect(harness.refreshWorkspaceAssets).toHaveBeenCalledWith(42)
    expect(harness.refreshWorkspaceComments).toHaveBeenCalledWith(42)
    expect(harness.refreshWorkspaceRevisions).toHaveBeenCalledWith(42)
    expect(harness.refreshWorkspaceMembers).toHaveBeenCalledWith(42)

    expect(harness.holder.innerHTML).toBe('')
    expect(harness.initEditor).toHaveBeenCalledWith(
      harness.holder,
      'notion-room-42',
      { blocks: [] },
      42,
      'Loaded title',
      true,
      expect.objectContaining({
        userRole: 'WRITE',
        readOnly: false,
        accessToken: 'token-1',
      }),
    )
    const options = harness.initEditor.mock.calls[0][6]
    expect(options.getWorkspaceProperties()).toEqual({ status: 'todo' })
    expect(options.getWorkspaceParent()).toEqual({ id: 12, title: 'Parent' })
    expect(harness.editorApi.value).toBe(harness.editor)
    expect(harness.editor.bindTitleRef).toHaveBeenCalledWith(harness.title)
    expect(harness.editor.markSaved).toHaveBeenCalled()
    expect(harness.applyWorkspaceBlockCommentSummaries).toHaveBeenCalled()
    expect(harness.isEditorLoading.value).toBe(false)
    expect(harness.logError).not.toHaveBeenCalled()
  })

  it('redirects read-only workspaces without leaving the loading flag enabled', async () => {
    const harness = createHarness({ data: { idx: 7, accessRole: 'READ', status: 'Public' } })

    await harness.subject.setupEditor()

    expect(harness.router.replace).toHaveBeenCalledWith('/workspace/readonly/7')
    expect(harness.initEditor).not.toHaveBeenCalled()
    expect(harness.isEditorLoading.value).toBe(false)
  })

  it('destroys the current editor instance', async () => {
    const harness = createHarness()
    const editor = createEditorApi()
    harness.editorApi.value = editor

    await harness.subject.destroyEditor()

    expect(editor.destroy).toHaveBeenCalled()
    expect(harness.editorApi.value).toBeNull()
  })
})