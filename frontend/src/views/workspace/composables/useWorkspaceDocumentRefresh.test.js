import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceDocumentRefresh } from './useWorkspaceDocumentRefresh.js'

describe('useWorkspaceDocumentRefresh', () => {
  it('refreshes documents and runs follow-up workspace refresh tasks', async () => {
    const calls = []
    const loading = ref(false)
    const loadDocuments = vi.fn(async () => {
      calls.push('loadDocuments')
      expect(loading.value).toBe(true)
      return ['doc']
    })
    const loadDocumentSections = vi.fn(() => calls.push('loadDocumentSections'))
    const pruneRecentDocuments = vi.fn(() => calls.push('pruneRecentDocuments'))
    const persistRecentDocuments = vi.fn(() => calls.push('persistRecentDocuments'))
    const refreshBacklinks = vi.fn(() => calls.push('refreshBacklinks'))
    const refreshPageIndex = vi.fn(() => calls.push('refreshPageIndex'))

    const { refreshWorkspaceDocuments } = useWorkspaceDocumentRefresh({
      loading,
      loadDocuments,
      loadDocumentSections,
      pruneRecentDocuments,
      persistRecentDocuments,
      refreshBacklinks,
      refreshPageIndex,
    })

    await expect(refreshWorkspaceDocuments()).resolves.toEqual(['doc'])

    expect(loading.value).toBe(false)
    expect(calls).toEqual([
      'loadDocuments',
      'loadDocumentSections',
      'pruneRecentDocuments',
      'persistRecentDocuments',
      'refreshBacklinks',
      'refreshPageIndex',
    ])
  })

  it('clears loading and does not run follow-up tasks when document loading fails', async () => {
    const loading = ref(false)
    const loadDocumentSections = vi.fn()
    const refreshPageIndex = vi.fn()
    const error = new Error('network failed')
    const { refreshWorkspaceDocuments } = useWorkspaceDocumentRefresh({
      loading,
      loadDocuments: vi.fn(async () => {
        expect(loading.value).toBe(true)
        throw error
      }),
      loadDocumentSections,
      refreshPageIndex,
    })

    await expect(refreshWorkspaceDocuments()).rejects.toThrow(error)

    expect(loading.value).toBe(false)
    expect(loadDocumentSections).not.toHaveBeenCalled()
    expect(refreshPageIndex).not.toHaveBeenCalled()
  })

  it('supports optional callbacks', async () => {
    const loading = ref(true)
    const { refreshWorkspaceDocuments } = useWorkspaceDocumentRefresh({
      loading,
      loadDocuments: () => undefined,
    })

    await expect(refreshWorkspaceDocuments()).resolves.toBeUndefined()

    expect(loading.value).toBe(false)
  })
})
