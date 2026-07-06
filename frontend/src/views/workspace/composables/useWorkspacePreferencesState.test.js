import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useWorkspacePreferencesState } from './useWorkspacePreferencesState.js'

const createStorage = () => {
  const entries = new Map()
  return {
    getItem: vi.fn((key) => entries.get(key) ?? null),
    setItem: vi.fn((key, value) => {
      entries.set(key, value)
    }),
    entries,
  }
}

const createSubject = (options = {}) => {
  const storage = createStorage()
  const timers = []
  const api = {
    getWorkspacePreferences: vi.fn(async () => ({})),
    saveWorkspacePreferences: vi.fn(async (payload) => payload),
    ...options.api,
  }
  const subject = useWorkspacePreferencesState({
    api,
    storage,
    workspaceDocumentsFor: options.workspaceDocumentsFor ?? (() => [{ id: 10 }, { id: 11 }]),
    storageKeys: {
      favorite: ref('favorite-key'),
      recent: ref('recent-key'),
      sections: ref('sections-key'),
      pageIndexViews: ref('views-key'),
    },
    setTimeoutFn: vi.fn((callback) => {
      timers.push(callback)
      return { id: timers.length }
    }),
    clearTimeoutFn: vi.fn(),
    onLoadError: vi.fn(),
    onSaveError: vi.fn(),
  })
  return { api, storage, subject, timers }
}

describe('useWorkspacePreferencesState', () => {
  it('loads and normalizes local preference state', () => {
    const { storage, subject } = createSubject()
    storage.entries.set('favorite-key', JSON.stringify([10, '10', 11]))
    storage.entries.set('recent-key', JSON.stringify([11, 10, 10]))
    storage.entries.set('sections-key', JSON.stringify([
      { id: 'team', name: ' Team ', documentIds: [10, 12] },
    ]))
    storage.entries.set('views-key', JSON.stringify([
      { id: 'active', name: ' Active ', filter: 'blocked', sort: 'title-asc' },
    ]))

    subject.loadWorkspacePreferencesFromLocal()

    expect(subject.favoriteWorkspaceDocumentIds.value).toEqual(['10', '11'])
    expect(subject.recentWorkspaceDocumentIds.value).toEqual(['11', '10'])
    expect(subject.workspaceDocumentSections.value).toEqual([
      { id: 'team', name: 'Team', collapsed: false, documentIds: ['10'] },
    ])
    expect(subject.workspacePageIndexViews.value).toEqual([
      {
        id: 'active',
        name: 'Active',
        filter: 'blocked',
        query: '',
        tag: '',
        owner: '',
        sort: 'title-asc',
      },
    ])
  })

  it('queues remote persistence when local state changes before remote preferences are ready', () => {
    const { subject } = createSubject()
    subject.favoriteWorkspaceDocumentIds.value = ['10']

    subject.persistFavoriteWorkspaceDocuments()

    expect(subject.workspacePreferencesDirtyBeforeRemoteLoad.value).toBe(true)
    expect(subject.workspacePreferencesSaveTimer.value).toBeNull()
  })

  it('applies remote preferences and mirrors them to local storage', async () => {
    const { api, storage, subject } = createSubject({
      api: {
        getWorkspacePreferences: vi.fn(async () => ({
          favoriteWorkspaceIds: [11],
          recentWorkspaceIds: [10],
          documentSections: [{ id: 'docs', name: 'Docs', documentIds: [11] }],
          pageIndexViews: [{ id: 'mine', name: 'Mine', owner: 'me@example.com' }],
        })),
      },
    })

    await subject.loadWorkspacePreferences()

    expect(api.getWorkspacePreferences).toHaveBeenCalledTimes(1)
    expect(subject.workspacePreferencesRemoteReady.value).toBe(true)
    expect(subject.favoriteWorkspaceDocumentIds.value).toEqual(['11'])
    expect(storage.setItem).toHaveBeenCalledWith('favorite-key', JSON.stringify(['11']))
    expect(storage.setItem).toHaveBeenCalledWith('sections-key', JSON.stringify([
      { id: 'docs', name: 'Docs', collapsed: false, documentIds: ['11'] },
    ]))
  })

  it('keeps local content when remote preferences are empty', async () => {
    const { api, subject, timers } = createSubject()
    subject.favoriteWorkspaceDocumentIds.value = ['10']

    await subject.loadWorkspacePreferences()

    expect(api.getWorkspacePreferences).toHaveBeenCalledTimes(1)
    expect(subject.favoriteWorkspaceDocumentIds.value).toEqual(['10'])
    expect(subject.workspacePreferencesSaveTimer.value).toEqual({ id: 1 })
    expect(timers).toHaveLength(1)
  })

  it('tracks recent documents and persists after remote readiness', () => {
    const { storage, subject } = createSubject()
    subject.workspacePreferencesRemoteReady.value = true
    subject.recentWorkspaceDocumentIds.value = ['10']

    subject.trackRecentWorkspaceDocument({ id: 11 })

    expect(subject.recentWorkspaceDocumentIds.value).toEqual(['11', '10'])
    expect(storage.setItem).toHaveBeenCalledWith('recent-key', JSON.stringify(['11', '10']))
    expect(subject.workspacePreferencesSaveTimer.value).toEqual({ id: 1 })
  })
})
