import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceEditorMutations } from './useWorkspaceEditorMutations.js'

const createSubject = (overrides = {}) => {
  const appendWorkspaceBlock = vi.fn(async () => true)
  const applyDocumentTemplate = vi.fn(async () => true)
  const updateTitleFromLocal = vi.fn()
  const clearSelectedBlockAnchor = vi.fn()
  const showWorkspaceNotice = vi.fn()
  const scheduleAutoSave = vi.fn()
  const persistWorkspace = vi.fn(async () => 'saved')
  const blurActiveElement = vi.fn()

  const state = {
    editorApi: ref({
      appendWorkspaceBlock,
      applyDocumentTemplate,
      updateTitleFromLocal,
      clearSelectedBlockAnchor,
    }),
    canInsertWorkspaceQuickBlock: ref(true),
    workspaceQuickBlockAdding: ref(''),
    workspaceQuickBlockText: ref('Quick note'),
    workspaceInlineQuickBlockText: ref('Inline note'),
    activeWorkspacePanelTab: ref('all'),
    showWorkspaceNotice,
    canEditWorkspace: ref(true),
    workspacePageLocked: ref(false),
    canModifyWorkspacePage: ref(true),
    title: ref('Old title'),
    titleDirty: ref(false),
    scheduleAutoSave,
    persistWorkspace,
    workspaceTemplateApplying: ref(''),
    workspaceTemplateApplied: ref(false),
    blurActiveElement,
    ...overrides,
  }

  return {
    state,
    subject: useWorkspaceEditorMutations(state),
  }
}

describe('useWorkspaceEditorMutations', () => {
  it('inserts quick and inline blocks while clearing drafts', async () => {
    const { state, subject } = createSubject()

    await expect(subject.insertWorkspaceQuickBlock({ id: 'paragraph' })).resolves.toBe(true)

    expect(state.editorApi.value.appendWorkspaceBlock).toHaveBeenCalledWith({
      type: 'paragraph',
      text: 'Quick note',
      level: undefined,
    })
    expect(state.workspaceQuickBlockText.value).toBe('')
    expect(state.activeWorkspacePanelTab.value).toBe('outline')
    expect(state.workspaceQuickBlockAdding.value).toBe('')

    await expect(subject.insertWorkspaceInlineQuickBlock({ id: 'header' })).resolves.toBe(true)

    expect(state.editorApi.value.appendWorkspaceBlock).toHaveBeenLastCalledWith({
      type: 'header',
      text: 'Inline note',
      level: 2,
    })
    expect(state.workspaceInlineQuickBlockText.value).toBe('')
  })

  it('toggles page lock and clears selected anchors when locking', () => {
    const { state, subject } = createSubject()

    expect(subject.toggleWorkspacePageLock()).toBe(true)

    expect(state.workspacePageLocked.value).toBe(true)
    expect(state.editorApi.value.clearSelectedBlockAnchor).toHaveBeenCalledTimes(1)
    expect(state.blurActiveElement).toHaveBeenCalledTimes(1)
  })

  it('saves and handles title input through editor APIs', async () => {
    const { state, subject } = createSubject()

    await expect(subject.handleSave()).resolves.toBe(true)
    expect(state.persistWorkspace).toHaveBeenCalledWith({ navigateNewDocument: true })

    expect(subject.handleTitleInput({ target: { value: 'Next title' } })).toBe(true)
    expect(state.title.value).toBe('Next title')
    expect(state.titleDirty.value).toBe(true)
    expect(state.scheduleAutoSave).toHaveBeenCalledTimes(1)
    expect(state.editorApi.value.updateTitleFromLocal).toHaveBeenCalledWith('Next title')
  })

  it('applies templates and moves the panel to outline', async () => {
    const { state, subject } = createSubject()

    await expect(subject.applyWorkspaceTemplate({
      id: 'meeting',
      title: 'Meeting notes',
      blocks: [{ type: 'paragraph', data: { text: 'Agenda' } }],
    })).resolves.toBe(true)

    expect(state.title.value).toBe('Meeting notes')
    expect(state.titleDirty.value).toBe(true)
    expect(state.editorApi.value.updateTitleFromLocal).toHaveBeenCalledWith('Meeting notes')
    const templatePayload = state.editorApi.value.applyDocumentTemplate.mock.calls[0][0]
    expect(templatePayload.blocks).toHaveLength(1)
    expect(templatePayload.blocks[0].id).toContain('template-meeting-')
    expect(state.workspaceTemplateApplied.value).toBe(true)
    expect(state.activeWorkspacePanelTab.value).toBe('outline')
    expect(state.workspaceTemplateApplying.value).toBe('')
  })
})
