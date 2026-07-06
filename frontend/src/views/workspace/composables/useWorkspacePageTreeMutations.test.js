import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useWorkspacePageTreeMutations } from './useWorkspacePageTreeMutations.js'

const createSubject = (overrides = {}) => {
  const fetchWorkspaceDocument = vi.fn(async (id) => ({ title: `Fetched ${id}`, contents: `contents-${id}` }))
  const saveWorkspaceDocument = vi.fn(async () => ({}))
  const refreshWorkspaceDocuments = vi.fn(async () => {})
  const refreshWorkspacePageIndex = vi.fn(async () => {})
  const persistWorkspace = vi.fn(async () => 'current')
  const applyWorkspaceParentPage = vi.fn()
  const cancelWorkspaceTreeMove = vi.fn()
  const cancelWorkspaceTreeRename = vi.fn()
  const cancelWorkspaceTreeSubpageComposer = vi.fn()
  const createWorkspaceChildPage = vi.fn(async () => ({ id: 'new-child' }))

  const state = {
    documentId: (node) => node?.id,
    canApplyWorkspaceTreeMove: vi.fn(() => true),
    workspaceTreeMoveTargetId: ref('target'),
    workspaceTreeMoveSavingId: ref(''),
    workspaceTreeMoveError: ref(''),
    workspacePageIndexRowById: ref(new Map([['target', { id: 'target', title: 'Target parent' }]])),
    workspaceDocumentById: ref(new Map()),
    currentWorkspaceKey: ref('current'),
    editorApi: ref({ savePost: vi.fn(), updateTitleFromLocal: vi.fn() }),
    applyWorkspaceParentPage,
    persistWorkspace,
    fetchWorkspaceDocument,
    saveWorkspaceDocument,
    serializeWorkspaceSnapshotWithParent: (contents, parent) => JSON.stringify({ contents, parent }),
    refreshWorkspaceDocuments,
    refreshWorkspacePageIndex,
    collapsedWorkspacePageTreeIds: ref(['target', 'other']),
    cancelWorkspaceTreeMove,
    workspaceTreeRenameDraft: ref('Renamed page'),
    workspaceTreeRenameSavingId: ref(''),
    workspaceTreeRenameError: ref(''),
    isWorkspaceTreeRenameOpen: vi.fn(() => true),
    cancelWorkspaceTreeRename,
    title: ref('Current title'),
    titleDirty: ref(false),
    createWorkspaceChildPage,
    workspaceTreeSubpageCreatingId: ref(''),
    workspaceTreeSubpageError: ref(''),
    workspaceTreeSubpageTitle: ref('Child page'),
    workspacePageTreeQuery: ref('child'),
    cancelWorkspaceTreeSubpageComposer,
    activeWorkspacePanelTab: ref('all'),
    ...overrides,
  }

  return {
    state,
    subject: useWorkspacePageTreeMutations(state),
  }
}

describe('useWorkspacePageTreeMutations', () => {
  it('moves the current page by updating parent metadata and refreshing the index', async () => {
    const { state, subject } = createSubject()

    await expect(subject.moveWorkspaceTreePage({ id: 'current', title: 'Current', canEditProperties: true }))
      .resolves.toBe(true)

    expect(state.applyWorkspaceParentPage).toHaveBeenCalledWith({ id: 'target', title: 'Target parent' })
    expect(state.persistWorkspace).toHaveBeenCalledWith({ navigateNewDocument: false })
    expect(state.saveWorkspaceDocument).not.toHaveBeenCalled()
    expect(state.collapsedWorkspacePageTreeIds.value).toEqual(['other'])
    expect(state.refreshWorkspacePageIndex).toHaveBeenCalledOnce()
    expect(state.cancelWorkspaceTreeMove).toHaveBeenCalledOnce()
    expect(state.workspaceTreeMoveSavingId.value).toBe('')
  })

  it('renames an external page through the document API', async () => {
    const { state, subject } = createSubject({ currentWorkspaceKey: ref('current') })

    await expect(subject.renameWorkspaceTreePage({ id: 'external', title: 'Old', canEditProperties: true }))
      .resolves.toBe(true)

    expect(state.fetchWorkspaceDocument).toHaveBeenCalledWith('external')
    expect(state.saveWorkspaceDocument).toHaveBeenCalledWith({
      idx: 'external',
      title: 'Renamed page',
      contents: 'contents-external',
    })
    expect(state.refreshWorkspaceDocuments).toHaveBeenCalledOnce()
    expect(state.refreshWorkspacePageIndex).toHaveBeenCalledOnce()
    expect(state.cancelWorkspaceTreeRename).toHaveBeenCalledOnce()
  })

  it('creates a child page and resets tree search state', async () => {
    const { state, subject } = createSubject()

    await expect(subject.createWorkspaceTreeSubpage({ id: 'parent', title: 'Parent', canEditProperties: true }))
      .resolves.toBe(true)

    expect(state.createWorkspaceChildPage).toHaveBeenCalledWith({
      parentId: 'parent',
      parentTitle: 'Parent',
      pageTitle: 'Child page',
      refresh: true,
    })
    expect(state.workspacePageTreeQuery.value).toBe('')
    expect(state.activeWorkspacePanelTab.value).toBe('tree')
    expect(state.cancelWorkspaceTreeSubpageComposer).toHaveBeenCalledOnce()
    expect(state.workspaceTreeSubpageCreatingId.value).toBe('')
  })
})
