import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import {
  useWorkspacePreferenceStores,
  workspacePreferenceStorageKey,
} from './useWorkspacePreferenceStores.js'

describe('useWorkspacePreferenceStores', () => {
  it('builds stable per-user local storage keys', () => {
    expect(workspacePreferenceStorageKey('favorites', ' User@Example.COM ')).toBe(
      'fileinnout:workspace:favorites:user@example.com',
    )
    expect(workspacePreferenceStorageKey('recent', '')).toBe('fileinnout:workspace:recent:anonymous')
  })

  it('wires preference state through computed storage keys and document source', () => {
    const currentUserEmail = ref('team@example.com')
    const workspaceDocuments = ref([{ id: 1 }])
    const api = { getWorkspacePreferences: vi.fn() }
    const preferencesStateFactory = vi.fn(() => ({
      favoriteWorkspaceDocumentIds: ref([]),
      loadWorkspacePreferences: vi.fn(),
    }))

    const subject = useWorkspacePreferenceStores({
      api,
      currentUserEmail,
      workspaceDocuments,
      preferencesStateFactory,
    })

    const options = preferencesStateFactory.mock.calls[0][0]
    expect(options.api).toBe(api)
    expect(options.workspaceDocumentsFor()).toEqual([{ id: 1 }])
    expect(options.storageKeys.favorite.value).toBe('fileinnout:workspace:favorites:team@example.com')
    expect(options.storageKeys.pageIndexViews.value).toBe(
      'fileinnout:workspace:page-index-views:team@example.com',
    )

    currentUserEmail.value = 'other@example.com'
    expect(subject.workspaceFavoriteStorageKey.value).toBe('fileinnout:workspace:favorites:other@example.com')
    expect(subject.favoriteWorkspaceDocumentIds.value).toEqual([])
  })
  it('supports lazy workspace document sources to avoid setup ordering hazards', () => {
    const workspaceDocuments = ref([{ id: 7 }])
    const preferencesStateFactory = vi.fn(() => ({
      favoriteWorkspaceDocumentIds: ref([]),
    }))

    useWorkspacePreferenceStores({
      currentUserEmail: ref('owner@example.com'),
      workspaceDocuments: () => workspaceDocuments.value,
      preferencesStateFactory,
    })

    const options = preferencesStateFactory.mock.calls[0][0]
    expect(options.workspaceDocumentsFor()).toEqual([{ id: 7 }])

    workspaceDocuments.value = [{ id: 8 }]
    expect(options.workspaceDocumentsFor()).toEqual([{ id: 8 }])
  })
})
