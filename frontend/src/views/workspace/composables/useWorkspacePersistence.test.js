import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import {
  __workspacePersistenceTestables,
  useWorkspacePersistence,
} from './useWorkspacePersistence.js'

const createSubject = (overrides = {}) => {
  const editorApi = ref({
    savePost: vi.fn(async () => ({
      result: { body: { idx: 42 } },
      status: 'Public',
      type: true,
      uuid: 'new-uuid',
    })),
    markSaved: vi.fn(),
  })
  const state = {
    editorApi,
    workspaceId: ref(null),
    workspaceAccessRole: ref(''),
    workspaceShareStatus: ref('PRIVATE'),
    workspaceUuid: ref('old-uuid'),
    titleDirty: ref(true),
    saveState: ref('dirty'),
    saveError: ref('old error'),
    lastSavedAt: ref(null),
    route: { params: { id: 'new' } },
    router: { replace: vi.fn(async () => {}) },
    normalizeWorkspaceShareStatus: vi.fn(() => 'PUBLIC_LINK'),
    refreshWorkspaceDocuments: vi.fn(async () => {}),
    refreshWorkspaceRevisions: vi.fn(async () => {}),
    allowNextRouteLeave: vi.fn(),
    now: () => '2026-07-04T00:00:00.000Z',
    ...overrides,
  }

  return {
    state,
    subject: useWorkspacePersistence(state),
  }
}

describe('useWorkspacePersistence', () => {
  it('persists the current editor snapshot and updates workspace save state', async () => {
    const { state, subject } = createSubject()

    await expect(subject.persistWorkspace({ navigateNewDocument: true })).resolves.toBe(42)

    expect(state.editorApi.value.savePost).toHaveBeenCalled()
    expect(state.editorApi.value.markSaved).toHaveBeenCalled()
    expect(state.workspaceId.value).toBe(42)
    expect(state.workspaceAccessRole.value).toBe('ADMIN')
    expect(state.workspaceShareStatus.value).toBe('PUBLIC_LINK')
    expect(state.workspaceUuid.value).toBe('new-uuid')
    expect(state.titleDirty.value).toBe(false)
    expect(state.saveState.value).toBe('saved')
    expect(state.saveError.value).toBe('')
    expect(state.lastSavedAt.value).toBe('2026-07-04T00:00:00.000Z')
    expect(state.refreshWorkspaceDocuments).toHaveBeenCalled()
    expect(state.refreshWorkspaceRevisions).toHaveBeenCalledWith(42)
    expect(state.allowNextRouteLeave).toHaveBeenCalled()
    expect(state.router.replace).toHaveBeenCalledWith('/workspace/read/42')
  })

  it('does not start another save while a save is already running', async () => {
    const { state, subject } = createSubject({
      saveState: ref('saving'),
    })

    await expect(subject.persistWorkspace()).resolves.toBeNull()

    expect(state.editorApi.value.savePost).not.toHaveBeenCalled()
  })

  it('records save failures and rethrows the error', async () => {
    const error = new Error('failed hard')
    const { state, subject } = createSubject({
      editorApi: ref({ savePost: vi.fn(async () => { throw error }) }),
    })

    await expect(subject.persistWorkspace()).rejects.toBe(error)

    expect(state.saveState.value).toBe('error')
    expect(state.saveError.value).toBe('failed hard')
  })

  it('ensures an unsaved workspace is persisted before dependent actions', async () => {
    const { state, subject } = createSubject()

    await expect(subject.ensureWorkspacePersisted({ navigate: true })).resolves.toBe(42)

    expect(state.editorApi.value.savePost).toHaveBeenCalled()
    expect(state.router.replace).toHaveBeenCalledWith('/workspace/read/42')
  })

  it('extracts saved workspace ids from supported backend response shapes', () => {
    expect(__workspacePersistenceTestables.savedWorkspaceIdFrom({ result: { body: { idx: 1 } } })).toBe(1)
    expect(__workspacePersistenceTestables.savedWorkspaceIdFrom({ data: { idx: 2 } })).toBe(2)
    expect(__workspacePersistenceTestables.savedWorkspaceIdFrom({ idx: 3 })).toBe(3)
    expect(__workspacePersistenceTestables.savedWorkspaceIdFrom({})).toBeNull()
  })
})
