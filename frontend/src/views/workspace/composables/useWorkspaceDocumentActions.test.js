import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceDocumentActions } from './useWorkspaceDocumentActions.js'

const createSubject = (overrides = {}) => {
  const api = {
    getPost: vi.fn(async () => ({ title: 'Source', contents: 'body' })),
    savePost: vi.fn(async () => ({ result: { body: { idx: 22 } } })),
    deletePost: vi.fn(async () => {}),
    list_delete: vi.fn(async () => {}),
    ...overrides.api,
  }
  const router = {
    push: vi.fn(async () => {}),
    replace: vi.fn(async () => {}),
  }
  const currentWorkspaceKey = ref(overrides.currentWorkspaceKey ?? '22')
  const confirmDiscardIfNeeded = vi.fn(() => overrides.confirmDiscard ?? true)
  const allowNextRouteLeave = vi.fn()
  const refreshWorkspaceDocuments = vi.fn(async () => {})
  const requestWorkspaceConfirm = vi.fn()
  const showWorkspaceNotice = vi.fn()

  const subject = useWorkspaceDocumentActions({
    api,
    router,
    currentWorkspaceKey,
    confirmDiscardIfNeeded,
    allowNextRouteLeave,
    refreshWorkspaceDocuments,
    requestWorkspaceConfirm,
    showWorkspaceNotice,
    messages: {
      untitled: 'Untitled',
      copySuffix: 'Copy',
      duplicateError: 'duplicate failed',
      removeError: 'remove failed',
      deleteTitle: 'Delete',
      removeTitle: 'Remove',
      deleteConfirmLabel: 'Delete',
      removeConfirmLabel: 'Remove',
      deleted: 'deleted',
      removed: 'removed',
      deleteMessageFor: (document, title) => `delete ${title}`,
      removeMessageFor: (document, title) => `remove ${title}`,
    },
  })

  return {
    subject,
    api,
    router,
    currentWorkspaceKey,
    confirmDiscardIfNeeded,
    allowNextRouteLeave,
    refreshWorkspaceDocuments,
    requestWorkspaceConfirm,
    showWorkspaceNotice,
  }
}

describe('useWorkspaceDocumentActions', () => {
  it('duplicates documents and navigates to the copied document', async () => {
    const {
      subject,
      api,
      router,
      confirmDiscardIfNeeded,
      allowNextRouteLeave,
      refreshWorkspaceDocuments,
    } = createSubject()

    await subject.duplicateWorkspaceDocument({ id: 10, title: 'Original' })

    expect(confirmDiscardIfNeeded).toHaveBeenCalledTimes(1)
    expect(api.getPost).toHaveBeenCalledWith(10)
    expect(api.savePost).toHaveBeenCalledWith({
      idx: null,
      title: 'Source Copy',
      contents: 'body',
    })
    expect(refreshWorkspaceDocuments).toHaveBeenCalledTimes(1)
    expect(allowNextRouteLeave).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith('/workspace/read/22')
    expect(subject.documentActionLoading.value).toBe('')
  })

  it('does not duplicate when the discard confirmation fails', async () => {
    const { subject, api, confirmDiscardIfNeeded } = createSubject({ confirmDiscard: false })

    await subject.duplicateWorkspaceDocument({ id: 10 })

    expect(confirmDiscardIfNeeded).toHaveBeenCalledTimes(1)
    expect(api.getPost).not.toHaveBeenCalled()
    expect(api.savePost).not.toHaveBeenCalled()
  })

  it('reports duplicate failures and clears loading state', async () => {
    const { subject, showWorkspaceNotice } = createSubject({
      api: {
        getPost: vi.fn(async () => {
          throw new Error('network')
        }),
      },
    })

    await subject.duplicateWorkspaceDocument({ id: 10 })

    expect(showWorkspaceNotice).toHaveBeenCalledWith('network', 'error')
    expect(subject.documentActionLoading.value).toBe('')
  })

  it('removes non-owned shared documents from the list', async () => {
    const {
      subject,
      api,
      router,
      requestWorkspaceConfirm,
      refreshWorkspaceDocuments,
      showWorkspaceNotice,
    } = createSubject({ currentWorkspaceKey: '99' })

    await subject.removeWorkspaceDocument({ id: 10, title: 'Shared', role: 'READ' })

    expect(requestWorkspaceConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Remove',
      message: 'remove Shared',
      confirmLabel: 'Remove',
      tone: 'warn',
    }))

    await requestWorkspaceConfirm.mock.calls[0][0].onConfirm()

    expect(api.list_delete).toHaveBeenCalledWith(10)
    expect(api.deletePost).not.toHaveBeenCalled()
    expect(refreshWorkspaceDocuments).toHaveBeenCalledTimes(1)
    expect(showWorkspaceNotice).toHaveBeenCalledWith('removed', 'success')
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('deletes owned documents and leaves the current route when needed', async () => {
    const {
      subject,
      api,
      router,
      requestWorkspaceConfirm,
      allowNextRouteLeave,
      showWorkspaceNotice,
    } = createSubject({ currentWorkspaceKey: '10' })

    await subject.removeWorkspaceDocument({ id: 10, title: 'Owned', role: 'ADMIN' })
    await requestWorkspaceConfirm.mock.calls[0][0].onConfirm()

    expect(api.deletePost).toHaveBeenCalledWith(10)
    expect(api.list_delete).not.toHaveBeenCalled()
    expect(allowNextRouteLeave).toHaveBeenCalledTimes(1)
    expect(router.replace).toHaveBeenCalledWith('/workspace')
    expect(showWorkspaceNotice).toHaveBeenCalledWith('deleted', 'success')
    expect(subject.documentActionLoading.value).toBe('')
  })
})
