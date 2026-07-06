import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceCommentMutations } from './useWorkspaceCommentMutations.js'

const createSubject = (overrides = {}) => {
  const captureCurrentBlockAnchor = vi.fn(async () => ({
    anchorBlockId: 'block-1',
    anchorBlockType: 'paragraph',
    anchorText: 'Selected block',
  }))
  const clearSelectedBlockAnchor = vi.fn()
  const focusBlockAnchor = vi.fn(async () => {})
  const createWorkspaceCommentApi = vi.fn(async (workspaceId, payload) => ({
    id: 2,
    workspaceId,
    ...payload,
    authorEmail: 'me@example.com',
    contents: payload.contents,
    resolved: false,
    createdAt: '2026-07-04T00:00:00Z',
  }))
  const updateWorkspaceCommentApi = vi.fn(async (workspaceId, id, contents) => ({
    id,
    workspaceId,
    contents,
    authorEmail: 'me@example.com',
    resolved: false,
    updatedAt: '2026-07-04T01:00:00Z',
  }))
  const resolveWorkspaceCommentApi = vi.fn(async (workspaceId, id, resolved) => ({
    id,
    workspaceId,
    contents: 'Resolved comment',
    authorEmail: 'me@example.com',
    resolved,
    updatedAt: '2026-07-04T02:00:00Z',
  }))
  const deleteWorkspaceCommentApi = vi.fn(async () => {})

  const state = {
    workspaceId: ref('workspace-1'),
    workspaceComments: ref([
      {
        id: 1,
        contents: 'Old comment',
        authorEmail: 'me@example.com',
        resolved: false,
        createdAt: '2026-07-03T00:00:00Z',
      },
    ]),
    workspaceCommentFilter: ref('open'),
    workspaceCommentSaving: ref(false),
    workspaceCommentError: ref(''),
    workspaceCommentEditingId: ref(''),
    workspaceCommentEditDraft: ref(''),
    newWorkspaceComment: ref('New comment'),
    resolvingCommentIds: ref([]),
    deletingCommentIds: ref([]),
    updatingCommentIds: ref([]),
    currentUserEmail: ref('me@example.com'),
    currentUserIdx: ref(10),
    canManageWorkspaceShare: ref(false),
    canCommentOnWorkspace: ref(true),
    editorApi: ref({ captureCurrentBlockAnchor, clearSelectedBlockAnchor, focusBlockAnchor }),
    normalizeWorkspaceComment: (comment) => comment,
    ensureWorkspacePersisted: vi.fn(async () => 'workspace-1'),
    createWorkspaceCommentApi,
    updateWorkspaceCommentApi,
    resolveWorkspaceCommentApi,
    deleteWorkspaceCommentApi,
    ...overrides,
  }

  return {
    state,
    subject: useWorkspaceCommentMutations(state),
  }
}

describe('useWorkspaceCommentMutations', () => {
  it('creates an anchored comment and switches to block filter', async () => {
    const { state, subject } = createSubject()

    await expect(subject.createWorkspaceComment()).resolves.toBe(true)

    expect(state.ensureWorkspacePersisted).toHaveBeenCalledWith({ navigate: true })
    expect(state.createWorkspaceCommentApi).toHaveBeenCalledWith('workspace-1', {
      contents: 'New comment',
      anchorBlockId: 'block-1',
      anchorBlockType: 'paragraph',
      anchorText: 'Selected block',
    })
    expect(state.workspaceComments.value[0]).toMatchObject({ id: 2, contents: 'New comment' })
    expect(state.workspaceCommentFilter.value).toBe('block')
    expect(state.newWorkspaceComment.value).toBe('')
    expect(state.workspaceCommentSaving.value).toBe(false)
  })

  it('edits a comment when the viewer is the author', async () => {
    const { state, subject } = createSubject()
    const comment = state.workspaceComments.value[0]

    expect(subject.canEditWorkspaceComment(comment)).toBe(true)
    expect(subject.startWorkspaceCommentEdit(comment)).toBe(true)
    state.workspaceCommentEditDraft.value = 'Updated comment'

    await expect(subject.updateWorkspaceComment(comment)).resolves.toBe(true)

    expect(state.updateWorkspaceCommentApi).toHaveBeenCalledWith('workspace-1', 1, 'Updated comment')
    expect(state.workspaceComments.value[0]).toMatchObject({ id: 1, contents: 'Updated comment' })
    expect(state.workspaceCommentEditingId.value).toBe('')
    expect(state.updatingCommentIds.value).toEqual([])
  })

  it('resolves and deletes comments while clearing edit state', async () => {
    const { state, subject } = createSubject()
    const comment = state.workspaceComments.value[0]

    await expect(subject.toggleWorkspaceCommentResolved(comment)).resolves.toBe(true)
    expect(state.resolveWorkspaceCommentApi).toHaveBeenCalledWith('workspace-1', 1, true)
    expect(state.workspaceComments.value[0]).toMatchObject({ id: 1, resolved: true })
    expect(state.resolvingCommentIds.value).toEqual([])

    subject.startWorkspaceCommentEdit(state.workspaceComments.value[0])
    await expect(subject.deleteWorkspaceComment(state.workspaceComments.value[0])).resolves.toBe(true)

    expect(state.deleteWorkspaceCommentApi).toHaveBeenCalledWith('workspace-1', 1)
    expect(state.workspaceComments.value).toEqual([])
    expect(state.workspaceCommentEditingId.value).toBe('')
    expect(state.deletingCommentIds.value).toEqual([])
  })

  it('clears and focuses comment anchors through the editor API', async () => {
    const { state, subject } = createSubject({ workspaceCommentFilter: ref('block') })

    subject.clearWorkspaceCommentAnchor()
    expect(state.editorApi.value.clearSelectedBlockAnchor).toHaveBeenCalledTimes(1)
    expect(state.workspaceCommentFilter.value).toBe('open')

    await expect(subject.focusWorkspaceCommentAnchor({ anchorBlockId: 'block-2' })).resolves.toBe(true)
    expect(state.editorApi.value.focusBlockAnchor).toHaveBeenCalledWith('block-2')
  })
})
