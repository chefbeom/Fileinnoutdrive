import { computed } from 'vue'

import { useWorkspacePreferencesState } from './useWorkspacePreferencesState.js'

export const workspacePreferenceStorageKey = (name, email) =>
  `fileinnout:workspace:${name}:${String(email || '').trim().toLowerCase() || 'anonymous'}`

const resolveWorkspaceDocuments = (source) => {
  const value = typeof source === 'function' ? source() : source?.value ?? source
  return Array.isArray(value) ? value : []
}

export const useWorkspacePreferenceStores = ({
  api = null,
  currentUserEmail,
  workspaceDocuments,
  preferencesStateFactory = useWorkspacePreferencesState,
} = {}) => {
  const workspacePreferenceUserKey = computed(() =>
    String(currentUserEmail?.value ?? currentUserEmail ?? '').trim().toLowerCase() || 'anonymous',
  )
  const workspaceFavoriteStorageKey = computed(() =>
    workspacePreferenceStorageKey('favorites', workspacePreferenceUserKey.value),
  )
  const workspaceRecentStorageKey = computed(() =>
    workspacePreferenceStorageKey('recent', workspacePreferenceUserKey.value),
  )
  const workspaceSectionsStorageKey = computed(() =>
    workspacePreferenceStorageKey('sections', workspacePreferenceUserKey.value),
  )
  const workspacePageIndexViewsStorageKey = computed(() =>
    workspacePreferenceStorageKey('page-index-views', workspacePreferenceUserKey.value),
  )

  const preferenceState = preferencesStateFactory({
    api,
    workspaceDocumentsFor: () => resolveWorkspaceDocuments(workspaceDocuments),
    storageKeys: {
      favorite: workspaceFavoriteStorageKey,
      recent: workspaceRecentStorageKey,
      sections: workspaceSectionsStorageKey,
      pageIndexViews: workspacePageIndexViewsStorageKey,
    },
  })

  return {
    workspacePreferenceUserKey,
    workspaceFavoriteStorageKey,
    workspaceRecentStorageKey,
    workspaceSectionsStorageKey,
    workspacePageIndexViewsStorageKey,
    ...preferenceState,
  }
}
