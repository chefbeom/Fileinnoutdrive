import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import {
  clearMissingActiveWorkspaceAsset,
  pruneWorkspacePageIndexLifecycleState,
  useWorkspaceLifecycleWatchers,
} from './useWorkspaceLifecycleWatchers.js'

const createHarness = ({ redirected = false } = {}) => {
  const mountedCallbacks = []
  const unmountCallbacks = []
  const watchRegistrations = []
  const route = { params: { id: '1' }, path: '/workspace/read/1' }
  const editorApi = ref({
    markDirty: vi.fn(),
    setReadOnly: vi.fn(async () => {}),
  })
  const state = {
    route,
    workspaceFavoriteStorageKey: ref('favorite-a'),
    workspaceRecentStorageKey: ref('recent-a'),
    workspaceSectionsStorageKey: ref('sections-a'),
    workspacePageIndexViewsStorageKey: ref('views-a'),
    workspaceAssets: ref([{ id: 'asset-a' }]),
    activeWorkspaceAssetId: ref('asset-a'),
    currentUserEmail: ref('user@example.test'),
    workspacePageIndexRows: ref([]),
    workspacePageIndexSelectedIds: ref(['1', '2', '3']),
    collapsedWorkspacePageTreeIds: ref(['1', '2', '3']),
    workspaceId: ref(1),
    selectedBlockAnchor: ref(null),
    workspaceCommentFilter: ref('block'),
    workspaceBlockCommentSummaries: ref([]),
    workspacePropertySources: [ref('icon'), ref(false)],
    suppressWorkspacePropertyWatch: ref(false),
    isEditorLoading: ref(false),
    editorApi,
    shouldWorkspaceEditorReadOnly: computed(() => false),
    workspacePreferencesRemoteReady: ref(true),
    workspacePreferencesDirtyBeforeRemoteLoad: ref(true),
  }
  const fns = {
    syncTheme: vi.fn(),
    loadWorkspacePreferencesFromLocal: vi.fn(),
    loadWorkspacePreferences: vi.fn(async () => {}),
    refreshWorkspaceDocuments: vi.fn(async () => {}),
    checkAndRedirectUuid: vi.fn(async () => redirected),
    setupEditor: vi.fn(async () => {}),
    loadFavoriteWorkspaceDocuments: vi.fn(),
    loadRecentWorkspaceDocuments: vi.fn(),
    loadWorkspaceDocumentSections: vi.fn(),
    loadWorkspacePageIndexViews: vi.fn(),
    pruneWorkspaceTreeEditingState: vi.fn(),
    connectWorkspaceAssetRealtime: vi.fn(),
    refreshWorkspaceBacklinks: vi.fn(async () => {}),
    applyWorkspaceBlockCommentSummaries: vi.fn(),
    scheduleAutoSave: vi.fn(),
    disconnectWorkspaceAssetRealtime: vi.fn(),
    clearAutoSaveTimer: vi.fn(),
    clearWorkspaceDocumentLinkCopyTimer: vi.fn(),
    clearWorkspaceNoticeTimer: vi.fn(),
    closeWorkspaceConfirm: vi.fn(),
    clearWorkspacePreferencesSaveTimer: vi.fn(),
    destroyEditor: vi.fn(async () => {}),
  }

  useWorkspaceLifecycleWatchers({
    ...state,
    ...fns,
    watchHook: (source, callback, options) => {
      watchRegistrations.push({ source, callback, options })
    },
    onMountedHook: (callback) => mountedCallbacks.push(callback),
    onBeforeUnmountHook: (callback) => unmountCallbacks.push(callback),
  })

  return { ...state, ...fns, mountedCallbacks, unmountCallbacks, watchRegistrations }
}

describe('useWorkspaceLifecycleWatchers', () => {
  it('bootstraps workspace state on mount and skips setup when UUID redirect handled the route', async () => {
    const redirectedHarness = createHarness({ redirected: true })

    await redirectedHarness.mountedCallbacks[0]()

    expect(redirectedHarness.syncTheme).toHaveBeenCalled()
    expect(redirectedHarness.loadWorkspacePreferencesFromLocal).toHaveBeenCalled()
    expect(redirectedHarness.loadWorkspacePreferences).toHaveBeenCalled()
    expect(redirectedHarness.refreshWorkspaceDocuments).toHaveBeenCalled()
    expect(redirectedHarness.checkAndRedirectUuid).toHaveBeenCalled()
    expect(redirectedHarness.setupEditor).not.toHaveBeenCalled()

    const normalHarness = createHarness({ redirected: false })
    await normalHarness.mountedCallbacks[0]()
    expect(normalHarness.setupEditor).toHaveBeenCalled()
  })

  it('registers route, storage, preference, page index, editor, and property watchers', async () => {
    const harness = createHarness()
    const [
      routeIdWatch,
      routePathWatch,
      favoriteWatch,
      recentWatch,
      sectionsWatch,
      pageIndexViewsWatch,
      assetsWatch,
      currentUserWatch,
      pageRowsWatch,
      workspaceIdWatch,
      selectedBlockWatch,
      summariesWatch,
      propertyWatch,
      readOnlyWatch,
    ] = harness.watchRegistrations

    await routeIdWatch.callback()
    await routePathWatch.callback('/workspace')
    favoriteWatch.callback()
    recentWatch.callback()
    sectionsWatch.callback()
    pageIndexViewsWatch.callback()
    assetsWatch.callback([{ id: 'asset-b' }])

    expect(harness.activeWorkspaceAssetId.value).toBeNull()
    expect(harness.setupEditor).toHaveBeenCalledTimes(2)
    expect(harness.loadFavoriteWorkspaceDocuments).toHaveBeenCalled()
    expect(harness.loadRecentWorkspaceDocuments).toHaveBeenCalled()
    expect(harness.loadWorkspaceDocumentSections).toHaveBeenCalled()
    expect(harness.loadWorkspacePageIndexViews).toHaveBeenCalled()

    currentUserWatch.callback()
    expect(harness.workspacePreferencesRemoteReady.value).toBe(false)
    expect(harness.workspacePreferencesDirtyBeforeRemoteLoad.value).toBe(false)
    expect(harness.loadWorkspacePreferencesFromLocal).toHaveBeenCalled()
    expect(harness.loadWorkspacePreferences).toHaveBeenCalled()

    pageRowsWatch.callback([
      { id: 1, canEditProperties: true },
      { id: 2, canEditProperties: false },
    ])
    expect(harness.workspacePageIndexSelectedIds.value).toEqual(['1'])
    expect(harness.collapsedWorkspacePageTreeIds.value).toEqual(['1', '2'])
    expect(harness.pruneWorkspaceTreeEditingState).toHaveBeenCalledWith(new Set(['1', '2']))

    expect(workspaceIdWatch.options).toEqual({ immediate: true })
    workspaceIdWatch.callback(17)
    expect(harness.connectWorkspaceAssetRealtime).toHaveBeenCalledWith(17)
    expect(harness.refreshWorkspaceBacklinks).toHaveBeenCalled()

    selectedBlockWatch.callback(null)
    expect(harness.workspaceCommentFilter.value).toBe('open')

    expect(summariesWatch.options).toEqual({ deep: true })
    summariesWatch.callback()
    expect(harness.applyWorkspaceBlockCommentSummaries).toHaveBeenCalled()

    propertyWatch.callback()
    expect(harness.editorApi.value.markDirty).toHaveBeenCalled()
    expect(harness.scheduleAutoSave).toHaveBeenCalled()

    readOnlyWatch.callback(true)
    expect(harness.editorApi.value.setReadOnly).toHaveBeenCalledWith(true)
  })

  it('cleans runtime resources on unmount', async () => {
    const harness = createHarness()

    await harness.unmountCallbacks[0]()

    expect(harness.disconnectWorkspaceAssetRealtime).toHaveBeenCalled()
    expect(harness.clearAutoSaveTimer).toHaveBeenCalled()
    expect(harness.clearWorkspaceDocumentLinkCopyTimer).toHaveBeenCalled()
    expect(harness.clearWorkspaceNoticeTimer).toHaveBeenCalled()
    expect(harness.closeWorkspaceConfirm).toHaveBeenCalled()
    expect(harness.clearWorkspacePreferencesSaveTimer).toHaveBeenCalled()
    expect(harness.destroyEditor).toHaveBeenCalled()
  })

  it('clears the active workspace asset only when it disappears from the asset list', () => {
    const activeWorkspaceAssetId = ref('a')

    expect(clearMissingActiveWorkspaceAsset({
      assets: [{ id: 'a' }],
      activeWorkspaceAssetId,
    })).toBe(false)
    expect(activeWorkspaceAssetId.value).toBe('a')

    expect(clearMissingActiveWorkspaceAsset({
      assets: [{ id: 'b' }],
      activeWorkspaceAssetId,
    })).toBe(true)
    expect(activeWorkspaceAssetId.value).toBeNull()
  })

  it('prunes page-index selections and collapsed tree ids with string-normalized ids', () => {
    const selected = ref([1, '2', '3'])
    const collapsed = ref([1, '2', '9'])
    const pruneWorkspaceTreeEditingState = vi.fn()

    const result = pruneWorkspacePageIndexLifecycleState({
      rows: [
        { id: '1', canEditProperties: true },
        { id: 2, canEditProperties: false },
      ],
      workspacePageIndexSelectedIds: selected,
      collapsedWorkspacePageTreeIds: collapsed,
      pruneWorkspaceTreeEditingState,
    })

    expect(selected.value).toEqual([1])
    expect(collapsed.value).toEqual([1, '2'])
    expect([...result.editableIds]).toEqual(['1'])
    expect([...result.pageIds]).toEqual(['1', '2'])
    expect(pruneWorkspaceTreeEditingState).toHaveBeenCalledWith(new Set(['1', '2']))
  })
})