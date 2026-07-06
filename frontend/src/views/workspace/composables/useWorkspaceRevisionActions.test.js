import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useWorkspaceRevisionActions } from './useWorkspaceRevisionActions.js'

const createSubject = (overrides = {}) => {
  const state = {
    workspaceId: ref(42),
    workspaceRevisions: ref([]),
    workspaceRevisionLoading: ref(false),
    workspaceRevisionError: ref(''),
    activeWorkspaceRevision: ref(null),
    workspaceRevisionDiff: ref(null),
    workspaceRevisionPreviewLoading: ref(''),
    workspaceRevisionRestoring: ref(''),
    canModifyWorkspacePage: ref(true),
    hasUnsavedChanges: ref(false),
    title: ref('Current'),
    titleDirty: ref(true),
    editorApi: ref({
      updateTitleFromLocal: vi.fn(),
      applyDocumentTemplate: vi.fn(async () => {}),
      markSaved: vi.fn(),
    }),
    workspaceAccessRole: ref('EDITOR'),
    workspaceShareStatus: ref('PRIVATE'),
    workspaceUuid: ref('old-uuid'),
    saveState: ref('dirty'),
    lastSavedAt: ref(''),
  }
  const api = {
    loadWorkspaceRevisions: vi.fn(async () => [{ idx: 1, title: 'v1' }, { idx: 2, title: 'v2' }]),
    loadWorkspaceRevision: vi.fn(async () => ({ contents: '{"blocks":[]}', title: 'Loaded' })),
    restoreWorkspaceRevisionApi: vi.fn(async () => ({
      title: 'Restored',
      contents: '{"blocks":[]}',
      accessRole: 'ADMIN',
      status: 'PUBLIC',
      type: 'LINK',
      uuid: 'new-uuid',
    })),
    normalizeWorkspaceRevision: vi.fn((revision) => ({ id: revision.idx ?? revision.id, ...revision })),
    buildWorkspaceRevisionDiff: vi.fn(async (revision) => ({ revisionId: revision.id })),
    applyWorkspaceProperties: vi.fn(),
    applyWorkspaceParentPage: vi.fn(),
    extractWorkspacePropertiesFromContents: vi.fn(() => ({ icon: 'doc' })),
    extractWorkspaceParentFromContents: vi.fn(() => ({ id: 7 })),
    normalizeWorkspaceShareStatus: vi.fn(() => 'PUBLIC_LINK'),
    refreshWorkspaceDocuments: vi.fn(async () => {}),
    requestWorkspaceConfirm: vi.fn(),
    showWorkspaceNotice: vi.fn(),
    now: vi.fn(() => '2026-07-04T00:00:00.000Z'),
  }
  const subject = useWorkspaceRevisionActions({ ...state, ...api, ...overrides })
  return { subject, state, api }
}

describe('useWorkspaceRevisionActions', () => {
  it('loads revisions and clears a stale active revision', async () => {
    const { subject, state, api } = createSubject()
    state.activeWorkspaceRevision.value = { id: 99 }
    state.workspaceRevisionDiff.value = { old: true }

    const result = await subject.refreshWorkspaceRevisions()

    expect(api.loadWorkspaceRevisions).toHaveBeenCalledWith(42)
    expect(result.map((revision) => revision.id)).toEqual([1, 2])
    expect(state.workspaceRevisions.value.map((revision) => revision.id)).toEqual([1, 2])
    expect(state.activeWorkspaceRevision.value).toBeNull()
    expect(state.workspaceRevisionDiff.value).toBeNull()
    expect(state.workspaceRevisionLoading.value).toBe(false)
  })

  it('loads a revision preview and builds its diff', async () => {
    const { subject, state, api } = createSubject()

    await subject.previewWorkspaceRevision({ id: 3, title: 'Base' })

    expect(api.loadWorkspaceRevision).toHaveBeenCalledWith(42, 3)
    expect(state.activeWorkspaceRevision.value).toMatchObject({ id: 3, title: 'Loaded' })
    expect(state.workspaceRevisionDiff.value).toEqual({ revisionId: 3 })
    expect(state.workspaceRevisionPreviewLoading.value).toBe('')
  })

  it('restores a revision after confirmation and refreshes dependent state', async () => {
    const { subject, state, api } = createSubject()

    await subject.restoreWorkspaceRevision({ id: 5 })

    expect(api.requestWorkspaceConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: '기록 복구',
      confirmLabel: '복구',
      tone: 'warn',
    }))

    await api.requestWorkspaceConfirm.mock.calls[0][0].onConfirm()

    expect(api.restoreWorkspaceRevisionApi).toHaveBeenCalledWith(42, 5)
    expect(state.title.value).toBe('Restored')
    expect(state.titleDirty.value).toBe(false)
    expect(state.workspaceAccessRole.value).toBe('ADMIN')
    expect(state.workspaceShareStatus.value).toBe('PUBLIC_LINK')
    expect(state.workspaceUuid.value).toBe('new-uuid')
    expect(state.saveState.value).toBe('saved')
    expect(state.lastSavedAt.value).toBe('2026-07-04T00:00:00.000Z')
    expect(api.refreshWorkspaceDocuments).toHaveBeenCalled()
    expect(api.showWorkspaceNotice).toHaveBeenCalledWith('선택한 기록으로 복구했습니다.', 'success')
    expect(state.workspaceRevisionRestoring.value).toBe('')
  })
})
