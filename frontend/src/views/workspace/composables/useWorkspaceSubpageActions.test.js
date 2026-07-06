import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useWorkspaceSubpageActions } from './useWorkspaceSubpageActions.js'

const createSubject = (overrides = {}) => {
  const api = {
    savePost: vi.fn(async () => ({ result: { body: { idx: 77 } } })),
  }
  const editorApi = ref({
    appendWorkspacePageLink: vi.fn(async () => true),
  })
  const state = {
    api,
    editorApi,
    title: ref('Parent Page'),
    currentWorkspaceProperties: ref({ priority: 'high', tags: ['launch'] }),
    workspaceSubpageInput: ref({ focus: vi.fn() }),
    workspaceSubpageTitle: ref('Child Page'),
    workspaceSubpageCreating: ref(false),
    workspaceSubpageError: ref('old error'),
    canStartWorkspaceSubpage: ref(true),
    canCreateWorkspaceSubpage: ref(true),
    isWorkspacePanelCollapsed: ref(true),
    activeWorkspacePanelTab: ref('all'),
    workspaceDocumentPath: vi.fn((document) => `/workspace/read/${document.id}`),
    ensureWorkspacePersisted: vi.fn(async () => 42),
    persistWorkspace: vi.fn(async () => {}),
    refreshWorkspaceDocuments: vi.fn(async () => {}),
    refreshWorkspacePageIndex: vi.fn(async () => {}),
    snapshotBuilder: vi.fn(() => '{"blocks":[]}'),
    nextTickFn: vi.fn(async () => {}),
    ...overrides,
  }

  return {
    state,
    subject: useWorkspaceSubpageActions(state),
  }
}

describe('useWorkspaceSubpageActions', () => {
  it('focuses the subpage composer by opening the links panel', async () => {
    const { state, subject } = createSubject()

    await expect(subject.focusWorkspaceSubpageComposer()).resolves.toBe(true)

    expect(state.isWorkspacePanelCollapsed.value).toBe(false)
    expect(state.activeWorkspacePanelTab.value).toBe('links')
    expect(state.nextTickFn).toHaveBeenCalled()
    expect(state.workspaceSubpageInput.value.focus).toHaveBeenCalled()
  })

  it('creates child pages and refreshes document lists when requested', async () => {
    const { state, subject } = createSubject()

    const child = await subject.createWorkspaceChildPage({
      parentId: 42,
      parentTitle: 'Parent Page',
      pageTitle: 'Child Page',
    })

    expect(child).toEqual({ id: 77, title: 'Child Page', role: 'ADMIN', scope: 'personal' })
    expect(state.api.savePost).toHaveBeenCalledWith({
      idx: null,
      title: 'Child Page',
      contents: '{"blocks":[]}',
    })
    expect(state.snapshotBuilder).toHaveBeenCalledWith(expect.objectContaining({
      parentId: 42,
      parentTitle: 'Parent Page',
      pageTitle: 'Child Page',
      currentProperties: { priority: 'high', tags: ['launch'] },
    }))
    expect(state.refreshWorkspaceDocuments).toHaveBeenCalled()
    expect(state.refreshWorkspacePageIndex).toHaveBeenCalled()
  })

  it('creates a subpage, inserts its parent link, and persists the parent document', async () => {
    const { state, subject } = createSubject()

    await expect(subject.createWorkspaceSubpage()).resolves.toBe(true)

    expect(state.ensureWorkspacePersisted).toHaveBeenCalledWith({ navigate: true })
    expect(state.editorApi.value.appendWorkspacePageLink).toHaveBeenCalledWith({
      id: 77,
      title: 'Child Page',
      path: '/workspace/read/77',
    })
    expect(state.workspaceSubpageTitle.value).toBe('')
    expect(state.persistWorkspace).toHaveBeenCalledWith({ navigateNewDocument: false })
    expect(state.activeWorkspacePanelTab.value).toBe('links')
    expect(state.workspaceSubpageCreating.value).toBe(false)
  })

  it('stores a readable error when parent link insertion fails', async () => {
    const { state, subject } = createSubject({
      editorApi: ref({ appendWorkspacePageLink: vi.fn(async () => false) }),
    })

    await expect(subject.createWorkspaceSubpage()).resolves.toBe(false)

    expect(state.workspaceSubpageError.value).toContain('하위 페이지')
    expect(state.workspaceSubpageCreating.value).toBe(false)
  })
})
