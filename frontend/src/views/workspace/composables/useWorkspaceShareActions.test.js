import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useWorkspaceShareActions } from './useWorkspaceShareActions.js'

const createSubject = (overrides = {}) => {
  const state = {
    workspaceId: ref(42),
    workspaceShareStatus: ref('PRIVATE'),
    workspaceUuid: ref('old-uuid'),
    workspaceAccessRole: ref('EDITOR'),
    showWorkspaceShareModal: ref(false),
    canManageWorkspaceShare: ref(true),
    isEditorLoading: ref(false),
    hasUnsavedChanges: ref(false),
  }
  const api = {
    loadWorkspace: vi.fn(async () => ({
      idx: 42,
      status: 'PUBLIC',
      type: 'LINK',
      uuid: 'new-uuid',
      accessRole: 'ADMIN',
    })),
    normalizeWorkspaceShareStatus: vi.fn(() => 'PUBLIC_LINK'),
    persistWorkspace: vi.fn(async () => 42),
    refreshWorkspaceDocuments: vi.fn(async () => {}),
    refreshWorkspaceMembers: vi.fn(async () => {}),
    showWorkspaceNotice: vi.fn(),
    logger: { error: vi.fn() },
  }
  const subject = useWorkspaceShareActions({ ...state, ...api, ...overrides })
  return { subject, state, api }
}

describe('useWorkspaceShareActions', () => {
  it('refreshes workspace share state and dependent lists', async () => {
    const { subject, state, api } = createSubject()

    const data = await subject.refreshWorkspaceShareState()

    expect(data).toMatchObject({ idx: 42 })
    expect(api.loadWorkspace).toHaveBeenCalledWith(42)
    expect(state.workspaceShareStatus.value).toBe('PUBLIC_LINK')
    expect(state.workspaceUuid.value).toBe('new-uuid')
    expect(state.workspaceAccessRole.value).toBe('ADMIN')
    expect(api.refreshWorkspaceDocuments).toHaveBeenCalled()
    expect(api.refreshWorkspaceMembers).toHaveBeenCalledWith(42)
  })

  it('persists unsaved workspaces before opening the share modal', async () => {
    const { subject, state, api } = createSubject({
      workspaceId: ref(null),
    })

    await subject.openWorkspaceShare()

    expect(api.persistWorkspace).toHaveBeenCalledWith({ navigateNewDocument: true })
    expect(api.loadWorkspace).not.toHaveBeenCalled()
    expect(state.showWorkspaceShareModal.value).toBe(true)
  })

  it('does not open sharing while share management is blocked', async () => {
    const { subject, state, api } = createSubject({
      canManageWorkspaceShare: ref(false),
    })

    await subject.openWorkspaceShare()

    expect(api.persistWorkspace).not.toHaveBeenCalled()
    expect(api.loadWorkspace).not.toHaveBeenCalled()
    expect(state.showWorkspaceShareModal.value).toBe(false)
  })

  it('reports failures while opening the share modal', async () => {
    const { subject, state, api } = createSubject({
      loadWorkspace: vi.fn(async () => {
        throw new Error('blocked')
      }),
    })

    await subject.openWorkspaceShare()

    expect(state.showWorkspaceShareModal.value).toBe(false)
    expect(api.showWorkspaceNotice).toHaveBeenCalledWith('blocked', 'error')
  })

  it('logs refresh failures without throwing', async () => {
    const { subject, api } = createSubject({
      loadWorkspace: vi.fn(async () => {
        throw new Error('refresh failed')
      }),
    })

    await subject.handleWorkspaceShareRefresh()

    expect(api.logger.error).toHaveBeenCalledWith('Workspace share state refresh failed:', expect.any(Error))
  })
})
