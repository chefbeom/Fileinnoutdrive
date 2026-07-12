import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { fetchStorageSummary as fetchStorageSummaryApi } from '@/api/filesApi.js'
import { useFileStore } from './useFileStore.js'

vi.mock('@/api/filesApi.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchStorageSummary: vi.fn(),
  }
})

const createDeferred = () => {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('useFileStore storage summary', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shares one in-flight storage summary request between concurrent callers', async () => {
    const deferred = createDeferred()
    fetchStorageSummaryApi.mockReturnValueOnce(deferred.promise)
    const store = useFileStore()

    const firstRequest = store.fetchStorageSummary()
    const secondRequest = store.fetchStorageSummary()
    expect(store.storageLoading).toBe(true)

    await Promise.resolve()
    expect(fetchStorageSummaryApi).toHaveBeenCalledTimes(1)

    const summary = { planCode: 'PLUS', totalQuotaBytes: 1000 }
    deferred.resolve(summary)

    await expect(firstRequest).resolves.toEqual(summary)
    await expect(secondRequest).resolves.toEqual(summary)
    expect(store.storageSummary).toEqual(summary)
    expect(store.storageLoading).toBe(false)
  })

  it('clears the in-flight request after failure so a retry can succeed', async () => {
    const store = useFileStore()
    fetchStorageSummaryApi.mockRejectedValueOnce(new Error('temporary failure'))

    await expect(store.fetchStorageSummary()).rejects.toThrow('temporary failure')
    expect(store.storageLoading).toBe(false)
    expect(store.storageError).toBe('temporary failure')

    const summary = { planCode: 'FREE', totalQuotaBytes: 500 }
    fetchStorageSummaryApi.mockResolvedValueOnce(summary)

    await expect(store.fetchStorageSummary()).resolves.toEqual(summary)
    expect(fetchStorageSummaryApi).toHaveBeenCalledTimes(2)
    expect(store.storageSummary).toEqual(summary)
    expect(store.storageError).toBe('')
  })
})
