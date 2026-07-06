import { ref, unref } from 'vue'

import {
  normalizeFavoriteWorkspaceIds,
  normalizeRecentWorkspaceIds,
  normalizeWorkspaceDocumentSections,
  normalizeWorkspacePageIndexViews,
} from '../services/workspacePreferences.js'
import {
  createWorkspaceDocumentValidIdSet,
  createWorkspacePreferencePayload,
  hasWorkspacePreferenceContent,
  pruneRecentWorkspaceDocumentIds,
  trackRecentWorkspaceDocumentIds,
} from '../services/workspacePreferenceState.js'

const fallbackStorage = () => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const resolveValue = (value) => {
  if (typeof value === 'function') return value()
  return unref(value)
}

const readJson = (storage, key, fallbackValue = []) => {
  try {
    const rawValue = storage?.getItem?.(key)
    return rawValue ? JSON.parse(rawValue) : fallbackValue
  } catch {
    return fallbackValue
  }
}

const writeJson = (storage, key, value) => {
  try {
    storage?.setItem?.(key, JSON.stringify(value))
  } catch {
    // Preference persistence is best-effort local convenience state.
  }
}

export const useWorkspacePreferencesState = ({
  api = null,
  workspaceDocumentsFor = () => [],
  storageKeys = {},
  storage = fallbackStorage(),
  setTimeoutFn = globalThis.window?.setTimeout ?? globalThis.setTimeout,
  clearTimeoutFn = globalThis.window?.clearTimeout ?? globalThis.clearTimeout,
  saveDelayMs = 450,
  onLoadError = (error) => console.error('Workspace preference load failed:', error),
  onSaveError = (error) => console.error('Workspace preference save failed:', error),
} = {}) => {
  const favoriteWorkspaceDocumentIds = ref([])
  const recentWorkspaceDocumentIds = ref([])
  const workspaceDocumentSections = ref([])
  const workspacePageIndexViews = ref([])
  const workspacePreferencesRemoteReady = ref(false)
  const workspacePreferencesDirtyBeforeRemoteLoad = ref(false)
  const workspacePreferencesSaving = ref(false)
  const workspacePreferencesSaveTimer = ref(null)

  const keyFor = (name) => String(resolveValue(storageKeys[name]) || '')
  const workspaceDocuments = () => resolveValue(workspaceDocumentsFor) || []

  const workspacePreferencePayload = () => createWorkspacePreferencePayload({
    favoriteWorkspaceDocumentIds: favoriteWorkspaceDocumentIds.value,
    recentWorkspaceDocumentIds: recentWorkspaceDocumentIds.value,
    workspaceDocumentSections: workspaceDocumentSections.value,
    workspacePageIndexViews: workspacePageIndexViews.value,
  })

  const workspaceDocumentValidIdSet = () => createWorkspaceDocumentValidIdSet(workspaceDocuments())

  const persistWorkspacePreferencesLocally = (payload = workspacePreferencePayload()) => {
    writeJson(storage, keyFor('favorite'), normalizeFavoriteWorkspaceIds(payload.favoriteWorkspaceIds))
    writeJson(storage, keyFor('recent'), normalizeRecentWorkspaceIds(payload.recentWorkspaceIds))
    writeJson(storage, keyFor('sections'), normalizeWorkspaceDocumentSections(payload.documentSections))
    writeJson(storage, keyFor('pageIndexViews'), normalizeWorkspacePageIndexViews(payload.pageIndexViews))
  }

  const pruneRecentWorkspaceDocuments = () => {
    recentWorkspaceDocumentIds.value = pruneRecentWorkspaceDocumentIds(
      recentWorkspaceDocumentIds.value,
      workspaceDocuments(),
    )
  }

  const pruneWorkspaceDocumentSections = () => {
    workspaceDocumentSections.value = normalizeWorkspaceDocumentSections(
      workspaceDocumentSections.value,
      workspaceDocumentValidIdSet(),
    )
  }

  const applyWorkspacePreferencePayload = (payload = {}) => {
    favoriteWorkspaceDocumentIds.value = normalizeFavoriteWorkspaceIds(payload.favoriteWorkspaceIds)
    recentWorkspaceDocumentIds.value = normalizeRecentWorkspaceIds(payload.recentWorkspaceIds)
    workspaceDocumentSections.value = normalizeWorkspaceDocumentSections(
      payload.documentSections,
      workspaceDocumentValidIdSet(),
    )
    workspacePageIndexViews.value = normalizeWorkspacePageIndexViews(payload.pageIndexViews)
    if (workspaceDocuments().length > 0) {
      pruneRecentWorkspaceDocuments()
      pruneWorkspaceDocumentSections()
    }
    persistWorkspacePreferencesLocally()
  }

  const clearWorkspacePreferencesSaveTimer = () => {
    if (!workspacePreferencesSaveTimer.value) return
    clearTimeoutFn?.(workspacePreferencesSaveTimer.value)
    workspacePreferencesSaveTimer.value = null
  }

  const persistWorkspacePreferencesToServer = async () => {
    if (!workspacePreferencesRemoteReady.value || !api?.saveWorkspacePreferences) return
    workspacePreferencesSaving.value = true
    try {
      const savedPreferences = await api.saveWorkspacePreferences(workspacePreferencePayload())
      applyWorkspacePreferencePayload(savedPreferences)
    } catch (error) {
      onSaveError(error)
    } finally {
      workspacePreferencesSaving.value = false
    }
  }

  const queuePersistWorkspacePreferences = () => {
    if (!workspacePreferencesRemoteReady.value) {
      workspacePreferencesDirtyBeforeRemoteLoad.value = true
      return
    }
    clearWorkspacePreferencesSaveTimer()
    workspacePreferencesSaveTimer.value = setTimeoutFn?.(() => {
      workspacePreferencesSaveTimer.value = null
      void persistWorkspacePreferencesToServer()
    }, saveDelayMs) ?? null
  }

  const loadFavoriteWorkspaceDocuments = () => {
    favoriteWorkspaceDocumentIds.value = normalizeFavoriteWorkspaceIds(readJson(storage, keyFor('favorite')))
  }

  const persistFavoriteWorkspaceDocuments = () => {
    writeJson(storage, keyFor('favorite'), normalizeFavoriteWorkspaceIds(favoriteWorkspaceDocumentIds.value))
    queuePersistWorkspacePreferences()
  }

  const loadRecentWorkspaceDocuments = () => {
    recentWorkspaceDocumentIds.value = normalizeRecentWorkspaceIds(readJson(storage, keyFor('recent')))
  }

  const persistRecentWorkspaceDocuments = () => {
    writeJson(storage, keyFor('recent'), normalizeRecentWorkspaceIds(recentWorkspaceDocumentIds.value))
    queuePersistWorkspacePreferences()
  }

  const trackRecentWorkspaceDocument = (document) => {
    const nextIds = trackRecentWorkspaceDocumentIds(recentWorkspaceDocumentIds.value, document)
    if (nextIds === recentWorkspaceDocumentIds.value) return
    recentWorkspaceDocumentIds.value = nextIds
    persistRecentWorkspaceDocuments()
  }

  const loadWorkspaceDocumentSections = () => {
    workspaceDocumentSections.value = normalizeWorkspaceDocumentSections(
      readJson(storage, keyFor('sections')),
      workspaceDocumentValidIdSet(),
    )
  }

  const persistWorkspaceDocumentSections = () => {
    pruneWorkspaceDocumentSections()
    writeJson(storage, keyFor('sections'), workspaceDocumentSections.value)
    queuePersistWorkspacePreferences()
  }

  const loadWorkspacePageIndexViews = () => {
    workspacePageIndexViews.value = normalizeWorkspacePageIndexViews(readJson(storage, keyFor('pageIndexViews')))
  }

  const persistWorkspacePageIndexViews = () => {
    writeJson(storage, keyFor('pageIndexViews'), normalizeWorkspacePageIndexViews(workspacePageIndexViews.value))
    queuePersistWorkspacePreferences()
  }

  const loadWorkspacePreferencesFromLocal = () => {
    loadFavoriteWorkspaceDocuments()
    loadRecentWorkspaceDocuments()
    loadWorkspaceDocumentSections()
    loadWorkspacePageIndexViews()
    workspacePreferencesDirtyBeforeRemoteLoad.value = false
  }

  const loadWorkspacePreferences = async () => {
    if (!api?.getWorkspacePreferences) {
      workspacePreferencesRemoteReady.value = false
      return
    }
    const localPayload = workspacePreferencePayload()
    try {
      const remotePayload = await api.getWorkspacePreferences()
      const hasRemoteContent = hasWorkspacePreferenceContent(remotePayload)
      workspacePreferencesRemoteReady.value = true

      if (
        workspacePreferencesDirtyBeforeRemoteLoad.value ||
        (!hasRemoteContent && hasWorkspacePreferenceContent(localPayload))
      ) {
        workspacePreferencesDirtyBeforeRemoteLoad.value = false
        queuePersistWorkspacePreferences()
        return
      }

      applyWorkspacePreferencePayload(remotePayload)
      workspacePreferencesDirtyBeforeRemoteLoad.value = false
    } catch (error) {
      workspacePreferencesRemoteReady.value = false
      onLoadError(error)
    }
  }

  return {
    favoriteWorkspaceDocumentIds,
    recentWorkspaceDocumentIds,
    workspaceDocumentSections,
    workspacePageIndexViews,
    workspacePreferencesRemoteReady,
    workspacePreferencesDirtyBeforeRemoteLoad,
    workspacePreferencesSaving,
    workspacePreferencesSaveTimer,
    workspacePreferencePayload,
    workspaceDocumentValidIdSet,
    persistWorkspacePreferencesLocally,
    applyWorkspacePreferencePayload,
    persistWorkspacePreferencesToServer,
    queuePersistWorkspacePreferences,
    loadFavoriteWorkspaceDocuments,
    persistFavoriteWorkspaceDocuments,
    loadRecentWorkspaceDocuments,
    persistRecentWorkspaceDocuments,
    pruneRecentWorkspaceDocuments,
    trackRecentWorkspaceDocument,
    pruneWorkspaceDocumentSections,
    loadWorkspaceDocumentSections,
    persistWorkspaceDocumentSections,
    loadWorkspacePageIndexViews,
    persistWorkspacePageIndexViews,
    loadWorkspacePreferencesFromLocal,
    loadWorkspacePreferences,
    clearWorkspacePreferencesSaveTimer,
  }
}
