import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceDocumentFavorites } from './useWorkspaceDocumentFavorites.js'

describe('useWorkspaceDocumentFavorites', () => {
  it('checks and toggles document favorite ids', () => {
    const favoriteWorkspaceDocumentIds = ref(['10'])
    const persistFavoriteWorkspaceDocuments = vi.fn()
    const subject = useWorkspaceDocumentFavorites({
      favoriteWorkspaceDocumentIds,
      persistFavoriteWorkspaceDocuments,
    })

    expect(subject.isWorkspaceDocumentFavorite({ id: 10 })).toBe(true)
    expect(subject.toggleFavoriteWorkspaceDocument({ id: 11 })).toBe(true)
    expect(favoriteWorkspaceDocumentIds.value).toEqual(['10', '11'])
    expect(persistFavoriteWorkspaceDocuments).toHaveBeenCalledTimes(1)

    expect(subject.toggleFavoriteWorkspaceDocument({ id: 10 })).toBe(true)
    expect(favoriteWorkspaceDocumentIds.value).toEqual(['11'])
    expect(persistFavoriteWorkspaceDocuments).toHaveBeenCalledTimes(2)
  })

  it('ignores documents without ids without persisting', () => {
    const ids = ['10']
    const favoriteWorkspaceDocumentIds = ref(ids)
    const persistFavoriteWorkspaceDocuments = vi.fn()
    const subject = useWorkspaceDocumentFavorites({
      favoriteWorkspaceDocumentIds,
      persistFavoriteWorkspaceDocuments,
    })

    expect(subject.toggleFavoriteWorkspaceDocument({ id: null })).toBe(false)
    expect(favoriteWorkspaceDocumentIds.value).toEqual(ids)
    expect(persistFavoriteWorkspaceDocuments).not.toHaveBeenCalled()
  })

  it('toggles the current document only when it can be favorited', () => {
    const favoriteWorkspaceDocumentIds = ref([])
    const canFavorite = ref(false)
    const currentDocument = ref({ id: 20 })
    const persistFavoriteWorkspaceDocuments = vi.fn()
    const subject = useWorkspaceDocumentFavorites({
      favoriteWorkspaceDocumentIds,
      canFavoriteCurrentWorkspaceDocument: canFavorite,
      currentWorkspaceLinkDocument: currentDocument,
      persistFavoriteWorkspaceDocuments,
    })

    expect(subject.toggleCurrentWorkspaceDocumentFavorite()).toBe(false)
    expect(favoriteWorkspaceDocumentIds.value).toEqual([])

    canFavorite.value = true

    expect(subject.toggleCurrentWorkspaceDocumentFavorite()).toBe(true)
    expect(favoriteWorkspaceDocumentIds.value).toEqual(['20'])
    expect(persistFavoriteWorkspaceDocuments).toHaveBeenCalledTimes(1)
  })
})
