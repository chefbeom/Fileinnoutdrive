import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useWorkspaceCollectionRefresh } from './useWorkspaceCollectionRefresh.js'

describe('useWorkspaceCollectionRefresh', () => {
  it('loads, normalizes, and stores collection items', async () => {
    const items = ref([])
    const loading = ref(false)
    const error = ref('old error')
    const loadItems = vi.fn(async () => [{ idx: 1 }, { idx: 2 }])
    const normalizeItem = vi.fn((item) => ({ id: item.idx }))
    const { refreshWorkspaceCollection } = useWorkspaceCollectionRefresh({
      workspaceId: ref(42),
      items,
      loading,
      error,
      loadItems,
      normalizeItem,
    })

    const result = await refreshWorkspaceCollection()

    expect(loadItems).toHaveBeenCalledWith(42)
    expect(result).toEqual([{ id: 1 }, { id: 2 }])
    expect(items.value).toEqual([{ id: 1 }, { id: 2 }])
    expect(error.value).toBe('')
    expect(loading.value).toBe(false)
  })

  it('clears items and errors when no workspace is selected', async () => {
    const items = ref([{ id: 1 }])
    const error = ref('old error')
    const loading = ref(false)
    const loadItems = vi.fn()
    const { refreshWorkspaceCollection } = useWorkspaceCollectionRefresh({
      workspaceId: ref(null),
      items,
      loading,
      error,
      loadItems,
    })

    const result = await refreshWorkspaceCollection()

    expect(result).toEqual([])
    expect(items.value).toEqual([])
    expect(error.value).toBe('')
    expect(loading.value).toBe(false)
    expect(loadItems).not.toHaveBeenCalled()
  })

  it('stores an error message and clears items when loading fails', async () => {
    const items = ref([{ id: 1 }])
    const loading = ref(false)
    const error = ref('')
    const loadItems = vi.fn(async () => {
      throw new Error('blocked')
    })
    const { refreshWorkspaceCollection } = useWorkspaceCollectionRefresh({
      workspaceId: ref(42),
      items,
      loading,
      error,
      loadItems,
      errorMessage: 'fallback',
    })

    const result = await refreshWorkspaceCollection()

    expect(result).toEqual([])
    expect(items.value).toEqual([])
    expect(error.value).toBe('blocked')
    expect(loading.value).toBe(false)
  })
})
