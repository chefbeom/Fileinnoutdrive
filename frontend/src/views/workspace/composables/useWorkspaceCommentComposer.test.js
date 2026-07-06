import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useWorkspaceCommentComposer } from './useWorkspaceCommentComposer.js'

const createSubject = (overrides = {}) => {
  const state = {
    canCommentOnWorkspace: ref(true),
    activeWorkspacePanelTab: ref('home'),
    workspaceCommentFilter: ref('open'),
    workspaceCommentInput: ref({
      focus: vi.fn(),
      scrollIntoView: vi.fn(),
      selectionStart: 0,
      selectionEnd: 0,
      setSelectionRange: vi.fn(),
    }),
    newWorkspaceComment: ref(''),
    showWorkspaceMentionMenu: ref(true),
    isWorkspacePanelCollapsed: ref(true),
    editorApi: ref({
      focusBlockAnchor: vi.fn(async () => {}),
      applyBlockCommentSummaries: vi.fn(),
    }),
    workspaceBlockCommentSummaries: ref([{ id: 'block-1', count: 2 }]),
  }
  const api = {
    waitForDomUpdate: vi.fn(async () => {}),
  }
  const subject = useWorkspaceCommentComposer({ ...state, ...api, ...overrides })
  return { subject, state, api }
}

describe('useWorkspaceCommentComposer', () => {
  it('opens the review panel and focuses the comment composer', async () => {
    const { subject, state, api } = createSubject()

    await subject.focusWorkspaceCommentComposer()

    expect(state.activeWorkspacePanelTab.value).toBe('review')
    expect(state.workspaceCommentFilter.value).toBe('open')
    expect(api.waitForDomUpdate).toHaveBeenCalled()
    expect(state.workspaceCommentInput.value.focus).toHaveBeenCalled()
    expect(state.workspaceCommentInput.value.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    })
  })

  it('opens mention comments and focuses the anchor block when present', async () => {
    const { subject, state } = createSubject()

    await subject.focusWorkspaceMentionComments({ anchorBlockId: 'block-1' })

    expect(state.isWorkspacePanelCollapsed.value).toBe(false)
    expect(state.activeWorkspacePanelTab.value).toBe('review')
    expect(state.workspaceCommentFilter.value).toBe('mentions')
    expect(state.editorApi.value.focusBlockAnchor).toHaveBeenCalledWith('block-1')
  })

  it('inserts mentions at the current textarea selection', async () => {
    const { subject, state } = createSubject()
    state.newWorkspaceComment.value = 'hello world'
    state.workspaceCommentInput.value.selectionStart = 5
    state.workspaceCommentInput.value.selectionEnd = 5

    await subject.insertWorkspaceMention({ email: 'user@example.com' })

    expect(state.newWorkspaceComment.value).toBe('hello @user@example.com  world')
    expect(state.showWorkspaceMentionMenu.value).toBe(false)
    expect(state.workspaceCommentInput.value.focus).toHaveBeenCalled()
    expect(state.workspaceCommentInput.value.setSelectionRange).toHaveBeenCalledWith(24, 24)
  })

  it('appends mentions when the textarea is not mounted', async () => {
    const { subject, state } = createSubject({
      workspaceCommentInput: ref(null),
    })
    state.newWorkspaceComment.value = 'hello'

    await subject.insertWorkspaceMention({ email: 'user@example.com' })

    expect(state.newWorkspaceComment.value).toBe('hello @user@example.com ')
    expect(state.showWorkspaceMentionMenu.value).toBe(false)
  })

  it('applies block comment summaries and focuses clicked badges', async () => {
    const { subject, state } = createSubject()

    subject.applyWorkspaceBlockCommentSummaries()
    await subject.handleEditorBlockCommentBadgeClick({ anchorBlockId: 'block-2' })

    expect(state.editorApi.value.applyBlockCommentSummaries).toHaveBeenCalledWith([{ id: 'block-1', count: 2 }])
    expect(state.isWorkspacePanelCollapsed.value).toBe(false)
    expect(state.activeWorkspacePanelTab.value).toBe('review')
    expect(state.workspaceCommentFilter.value).toBe('block')
    expect(state.editorApi.value.focusBlockAnchor).toHaveBeenCalledWith('block-2')
  })
})
