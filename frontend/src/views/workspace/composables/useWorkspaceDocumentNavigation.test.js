import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceDocumentNavigation } from './useWorkspaceDocumentNavigation.js'

const createSubject = (overrides = {}) => {
  const router = { push: vi.fn() }
  const trackRecentWorkspaceDocument = vi.fn()
  const confirmDiscardIfNeeded = vi.fn(() => true)
  const setupEditor = vi.fn()

  return {
    router,
    trackRecentWorkspaceDocument,
    confirmDiscardIfNeeded,
    setupEditor,
    subject: useWorkspaceDocumentNavigation({
      currentWorkspaceKey: ref('10'),
      route: { path: '/workspace/read/10' },
      router,
      trackRecentWorkspaceDocument,
      confirmDiscardIfNeeded,
      setupEditor,
      ...overrides,
    }),
  }
}

describe('useWorkspaceDocumentNavigation', () => {
  it('ignores missing or current document navigation', async () => {
    const { subject, router, trackRecentWorkspaceDocument } = createSubject()

    await expect(subject.openWorkspaceDocument(null)).resolves.toBe(false)
    await expect(subject.openWorkspaceDocument({ id: 10 })).resolves.toBe(false)

    expect(trackRecentWorkspaceDocument).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('tracks recent document and routes to another document', async () => {
    const { subject, router, trackRecentWorkspaceDocument } = createSubject()
    const document = { id: 11, title: 'Plan' }

    await expect(subject.openWorkspaceDocument(document)).resolves.toBe(true)

    expect(trackRecentWorkspaceDocument).toHaveBeenCalledWith(document)
    expect(router.push).toHaveBeenCalledWith('/workspace/read/11')
  })

  it('does not create a new document when discard confirmation is rejected', async () => {
    const confirmDiscardIfNeeded = vi.fn(() => false)
    const { subject, router, setupEditor } = createSubject({ confirmDiscardIfNeeded })

    await expect(subject.createWorkspaceDocument()).resolves.toBe(false)

    expect(router.push).not.toHaveBeenCalled()
    expect(setupEditor).not.toHaveBeenCalled()
  })

  it('resets the editor when already on the workspace root', async () => {
    const { subject, router, setupEditor } = createSubject({ route: ref({ path: '/workspace' }) })

    await expect(subject.createWorkspaceDocument()).resolves.toBe(true)

    expect(setupEditor).toHaveBeenCalledTimes(1)
    expect(router.push).not.toHaveBeenCalled()
  })

  it('routes to the workspace root before creating a new document elsewhere', async () => {
    const { subject, router, setupEditor } = createSubject()

    await expect(subject.createWorkspaceDocument()).resolves.toBe(true)

    expect(router.push).toHaveBeenCalledWith('/workspace')
    expect(setupEditor).not.toHaveBeenCalled()
  })
})