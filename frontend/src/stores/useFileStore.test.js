import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import {
  fetchFileList as fetchFileListApi,
  fetchFileListPage as fetchFileListPageApi,
  fetchStorageSummary as fetchStorageSummaryApi,
  fetchVaultFileList as fetchVaultFileListApi,
  moveFilesToVault as moveFilesToVaultApi,
  setFavoriteFiles as setFavoriteFilesApi,
} from '@/api/filesApi.js'
import { useFileStore } from './useFileStore.js'
import { useSecretFolderStore } from './useSecretFolderStore.js'

vi.mock('@/api/filesApi.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchFileList: vi.fn(),
    fetchFileListPage: vi.fn(),
    fetchStorageSummary: vi.fn(),
    fetchVaultFileList: vi.fn(),
    moveFilesToVault: vi.fn(),
    setFavoriteFiles: vi.fn(),
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
    fetchFileListApi.mockReset()
    fetchFileListPageApi.mockReset()
    fetchStorageSummaryApi.mockReset()
    fetchVaultFileListApi.mockReset()
    moveFilesToVaultApi.mockReset()
    setFavoriteFilesApi.mockReset()
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

  it('tracks recently accessed files and sorts recently uploaded files', () => {
    window.localStorage.clear()
    const store = useFileStore()
    store.clearAccessedFiles()

    store.allFiles = [
      { id: 1, name: 'old.txt', type: 'file', isTrash: false, uploadedAtMs: 1000, sizeLabel: '1 KB' },
      { id: 2, name: 'new.png', type: 'file', isTrash: false, uploadedAtMs: 5000, sizeLabel: '2 KB' },
      { id: 3, name: 'folderA', type: 'folder', isTrash: false, uploadedAtMs: 9000 },
    ]

    expect(store.recentUploadedFiles.map((f) => f.id)).toEqual([2, 1])

    store.recordFileAccess(store.allFiles[0])
    store.recordFileAccess(store.allFiles[1])
    expect(store.recentAccessedFiles.map((f) => f.id)).toEqual([2, 1])

    // Re-accessing file 1 moves it to the top
    store.recordFileAccess(store.allFiles[0])
    expect(store.recentAccessedFiles.map((f) => f.id)).toEqual([1, 2])

    store.clearAccessedFiles()
    expect(store.recentAccessedFiles).toEqual([])
  })

  it('restores cached root snapshot immediately on goBack and ignores stale subfolder responses', async () => {
    fetchStorageSummaryApi.mockResolvedValue({ planCode: 'ADMIN', totalQuotaBytes: 1000 })
    const store = useFileStore()

    fetchFileListPageApi.mockResolvedValueOnce({
      fileList: [
        { idx: 486, fileOriginName: 'Videos', nodeType: 'FOLDER', parentId: null },
        { idx: 10, fileOriginName: 'root-doc.pdf', nodeType: 'FILE', parentId: null },
      ],
      breadcrumbs: [],
      availableExtensions: ['pdf'],
      totalPage: 1,
      totalCount: 2,
      currentPage: 0,
      currentSize: 10,
    })

    await store.fetchDrivePage({ parentId: null, page: 0, size: 10 })
    expect(store.driveFiles.map((f) => f.id)).toEqual([486, 10])
    expect(store.currentFolder).toBeNull()

    // Enter subfolder 486; before its slow request resolves, navigate back to root
    const subfolderDeferred = createDeferred()
    const rootRefreshDeferred = createDeferred()
    fetchFileListPageApi
      .mockReturnValueOnce(subfolderDeferred.promise)
      .mockReturnValueOnce(rootRefreshDeferred.promise)

    store.enterFolder(486)
    expect(store.currentFolderId).toBe(486)
    expect(store.driveFiles).toEqual([])

    const subfolderPromise = store.fetchDrivePage({ parentId: 486, page: 0, size: 10 })

    // User clicks Back to Home while subfolder 486 request is still in flight
    store.goBack()
    expect(store.currentFolderId).toBeNull()
    expect(store.currentFolder).toBeNull()
    // Root snapshot is restored immediately!
    expect(store.driveFiles.map((f) => f.id)).toEqual([486, 10])

    const rootPromise = store.fetchDrivePage({ parentId: null, page: 0, size: 10, forceRefresh: true })

    // Even if the stale subfolder request resolves afterwards, it must NOT overwrite root files
    subfolderDeferred.resolve({
      fileList: [{ idx: 506, fileOriginName: 'movie.mp4', nodeType: 'FILE', parentId: 486 }],
      breadcrumbs: [{ idx: 486, fileOriginName: 'Videos', parentId: null }],
      availableExtensions: ['mp4'],
      totalPage: 1,
      totalCount: 1,
      currentPage: 0,
      currentSize: 10,
    })
    await subfolderPromise

    expect(store.currentFolderId).toBeNull()
    expect(store.driveFiles.map((f) => f.id)).toEqual([486, 10])

    rootRefreshDeferred.resolve({
      fileList: [
        { idx: 486, fileOriginName: 'Videos', nodeType: 'FOLDER', parentId: null },
        { idx: 10, fileOriginName: 'root-doc.pdf', nodeType: 'FILE', parentId: null },
      ],
      breadcrumbs: [],
      availableExtensions: ['pdf'],
      totalPage: 1,
      totalCount: 2,
      currentPage: 0,
      currentSize: 10,
    })
    await rootPromise
    expect(store.driveFiles.map((f) => f.id)).toEqual([486, 10])
  })

  it('moves folders and files to secret vault, prunes recent accessed history, and refreshes drive view', async () => {
    window.localStorage.clear()
    fetchStorageSummaryApi.mockResolvedValue({ planCode: 'ADMIN', totalQuotaBytes: 1000 })
    fetchFileListPageApi
      .mockResolvedValueOnce({
        fileList: [
          { idx: 486, fileOriginName: 'SecretCandidate', nodeType: 'FOLDER', parentId: null },
          { idx: 10, fileOriginName: 'public.pdf', nodeType: 'FILE', parentId: null },
        ],
        breadcrumbs: [],
        availableExtensions: ['pdf'],
        totalPage: 1,
        totalCount: 2,
        currentPage: 0,
        currentSize: 10,
      })
      .mockResolvedValueOnce({
        fileList: [
          { idx: 10, fileOriginName: 'public.pdf', nodeType: 'FILE', parentId: null },
        ],
        breadcrumbs: [],
        availableExtensions: ['pdf'],
        totalPage: 1,
        totalCount: 1,
        currentPage: 0,
        currentSize: 10,
      })
    moveFilesToVaultApi.mockResolvedValueOnce({ targetIdx: null, action: 'move-to-vault', affectedCount: 1 })

    const store = useFileStore()
    store.clearAccessedFiles()
    store.allFiles = [
      { id: 486, name: 'SecretCandidate', type: 'folder', isTrash: false, parentId: null },
      { id: 506, name: 'nested.txt', type: 'file', isTrash: false, parentId: 486, sizeLabel: '1 KB' },
      { id: 10, name: 'public.pdf', type: 'file', isTrash: false, parentId: null, sizeLabel: '2 KB' },
    ]
    store.recordFileAccess(store.allFiles[1])
    store.recordFileAccess(store.allFiles[2])
    expect(store.recentAccessedFiles.map((f) => f.id)).toEqual([10, 506])

    await store.fetchDrivePage({ parentId: null, page: 0, size: 10 })
    const result = await store.moveFilesToVault([486], null)

    expect(moveFilesToVaultApi).toHaveBeenCalledWith([486], null)
    expect(result).toEqual({ targetIdx: null, action: 'move-to-vault', affectedCount: 1 })
    expect(store.recentAccessedFiles.map((f) => f.id)).toEqual([10])
    expect(store.driveFiles.map((f) => f.id)).toEqual([10])
  })

  it('stores rootFolders and item locationPath during root-scoped search queries', async () => {
    fetchStorageSummaryApi.mockResolvedValue({ planCode: 'ADMIN', totalQuotaBytes: 1000 })
    fetchFileListPageApi.mockResolvedValueOnce({
      fileList: [
        {
          idx: 77,
          fileOriginName: 'report.pdf',
          fileFormat: 'pdf',
          nodeType: 'FILE',
          parentId: 12,
          locationPath: '홈 / 자료 / 2026',
        },
      ],
      breadcrumbs: [],
      rootFolders: [
        { idx: 10, fileOriginName: '자료' },
        { idx: 11, fileOriginName: '프로그램' },
      ],
      availableExtensions: ['pdf', 'png'],
      totalPage: 1,
      totalCount: 1,
      currentPage: 0,
      currentSize: 20,
    })

    const store = useFileStore()
    await store.fetchDrivePage({
      parentId: null,
      page: 0,
      size: 20,
      searchScope: 'root',
      searchRootFolderId: 10,
      searchQuery: '.pdf',
      extensionFilter: 'pdf',
    })

    expect(store.driveRootFolders.map((f) => ({ id: f.id, name: f.name }))).toEqual([
      { id: 10, name: '자료' },
      { id: 11, name: '프로그램' },
    ])
    expect(store.driveFiles[0].location).toBe('홈 / 자료 / 2026')
    expect(store.driveAvailableExtensions).toEqual(['pdf', 'png'])
  })

  it('clears and removes recent upload history without deleting Drive files', () => {
    window.localStorage.clear()
    const store = useFileStore()
    store.allFiles = [
      { id: 1, name: 'alpha.txt', type: 'file', isTrash: false, uploadedAtMs: 1000, lastModifiedMs: 1000 },
      { id: 2, name: 'beta.txt', type: 'file', isTrash: false, uploadedAtMs: 2000, lastModifiedMs: 2000 },
      { id: 3, name: 'gamma.txt', type: 'file', isTrash: false, uploadedAtMs: 3000, lastModifiedMs: 3000 },
    ]
    expect(store.recentUploadedFiles.map((f) => f.id)).toEqual([3, 2, 1])

    // Individual item removal from upload history keeps Drive files untouched
    store.removeUploadedFileHistory(2)
    expect(store.recentUploadedFiles.map((f) => f.id)).toEqual([3, 1])
    expect(store.allFiles).toHaveLength(3)

    // Clear all upload history
    store.clearUploadedFiles()
    expect(store.recentUploadedFiles).toEqual([])
    expect(store.allFiles).toHaveLength(3)

    // Subsequent upload with newer timestamp appears cleanly
    store.allFiles = [
      ...store.allFiles,
      { id: 4, name: 'delta.txt', type: 'file', isTrash: false, uploadedAtMs: 4000, lastModifiedMs: 4000 },
    ]
    store.markFilesRecentlyUploaded([4])
    expect(store.recentUploadedFiles.map((f) => f.id)).toEqual([4])
  })

  it('toggles favorites optimistically without full-library refresh and rolls back on error', async () => {
    fetchFileListPageApi.mockResolvedValueOnce({
      fileList: [{ idx: 91, fileOriginName: 'clip.mp4', fileFormat: 'mp4', nodeType: 'FILE', favorite: false }],
      breadcrumbs: [],
      availableExtensions: ['mp4'],
      totalPage: 1,
      totalCount: 1,
      currentPage: 0,
      currentSize: 20,
    })

    const store = useFileStore()
    await store.fetchDrivePage({ parentId: null, page: 0, size: 20 })
    const initialPageCalls = fetchFileListPageApi.mock.calls.length

    setFavoriteFilesApi.mockResolvedValueOnce({ affectedCount: 1 })
    await store.setFilesFavorite([91], true)
    expect(store.driveFiles[0].isFavorite).toBe(true)
    expect(fetchFileListPageApi).toHaveBeenCalledTimes(initialPageCalls)
    expect(fetchFileListApi).not.toHaveBeenCalled()

    setFavoriteFilesApi.mockRejectedValueOnce(new Error('network error'))
    await expect(store.setFilesFavorite([91], false)).rejects.toThrow('network error')
    expect(store.driveFiles[0].isFavorite).toBe(true)
  })

  it('serves cached page responses on repeat visits and clears page cache on clearVaultFiles', async () => {
    fetchStorageSummaryApi.mockResolvedValue({ planCode: 'ADMIN', totalQuotaBytes: 1000 })
    fetchFileListPageApi
      .mockResolvedValueOnce({
        fileList: [{ idx: 1, fileOriginName: 'page0.mp4', nodeType: 'FILE' }],
        breadcrumbs: [],
        availableExtensions: [],
        totalPage: 2,
        totalCount: 2,
        currentPage: 0,
        currentSize: 1,
      })
      .mockResolvedValueOnce({
        fileList: [{ idx: 2, fileOriginName: 'page1.mp4', nodeType: 'FILE' }],
        breadcrumbs: [],
        availableExtensions: [],
        totalPage: 2,
        totalCount: 2,
        currentPage: 1,
        currentSize: 1,
      })
      .mockResolvedValueOnce({
        fileList: [{ idx: 2, fileOriginName: 'page1-reloaded.mp4', nodeType: 'FILE' }],
        breadcrumbs: [],
        availableExtensions: [],
        totalPage: 2,
        totalCount: 2,
        currentPage: 1,
        currentSize: 1,
      })

    const store = useFileStore()
    await store.fetchDrivePage({ parentId: null, page: 0, size: 1 })
    await store.fetchDrivePage({ parentId: null, page: 1, size: 1 })
    expect(fetchFileListPageApi).toHaveBeenCalledTimes(2)

    // Repeat visit to page 0 uses pageResponseCache
    await store.fetchDrivePage({ parentId: null, page: 0, size: 1 })
    expect(fetchFileListPageApi).toHaveBeenCalledTimes(2)
    expect(store.driveFiles[0].name).toBe('page0.mp4')

    // Locking/clearing vault invalidates cached page entries
    store.clearVaultFiles()
    await store.fetchDrivePage({ parentId: null, page: 1, size: 1 })
    expect(fetchFileListPageApi).toHaveBeenCalledTimes(3)
    expect(store.driveFiles[0].name).toBe('page1-reloaded.mp4')
  })

  it('reflects Vault favorites immediately in vaultFavoriteItems and deduplicates in-flight favorite calls', async () => {
    fetchStorageSummaryApi.mockResolvedValue({ planCode: 'ADMIN', totalQuotaBytes: 1000 })
    fetchFileListPageApi.mockResolvedValueOnce({
      fileList: [
        {
          idx: 812,
          fileOriginName: 'vault-clip.mp4',
          fileFormat: 'mp4',
          nodeType: 'FILE',
          spaceType: 'VAULT',
          encrypted: true,
          favorite: false,
        },
      ],
      breadcrumbs: [],
      availableExtensions: ['mp4'],
      totalPage: 1,
      totalCount: 1,
      currentPage: 0,
      currentSize: 20,
    })

    const deferredFavorite = createDeferred()
    setFavoriteFilesApi.mockReturnValueOnce(deferredFavorite.promise)

    const store = useFileStore()
    await store.fetchDrivePage({ parentId: null, page: 0, size: 20, vaultMode: true })
    expect(store.vaultFavoriteItems).toHaveLength(0)

    const firstToggle = store.setFilesFavorite([812], true)
    const duplicateToggle = store.setFilesFavorite([812], true)

    // Optimistically visible immediately in vaultFavoriteItems even before vaultAllFiles is fetched
    expect(store.vaultFavoriteItems.map((f) => f.id)).toEqual([812])
    expect(setFavoriteFilesApi).toHaveBeenCalledTimes(1)

    deferredFavorite.resolve({ action: 'favorite', affectedCount: 1 })
    await expect(firstToggle).resolves.toEqual({ action: 'favorite', affectedCount: 1 })
    await expect(duplicateToggle).resolves.toBeNull()
  })

  it('refreshAll skips Drive/Shared calls in Vault mode and deduplicates storage summary requests', async () => {
    fetchStorageSummaryApi.mockResolvedValue({ planCode: 'ADMIN', totalQuotaBytes: 1000 })
    fetchFileListPageApi.mockResolvedValue({
      fileList: [{ idx: 901, fileOriginName: 'vault-doc.pdf', nodeType: 'FILE', spaceType: 'VAULT' }],
      breadcrumbs: [],
      availableExtensions: ['pdf'],
      totalPage: 1,
      totalCount: 1,
      currentPage: 0,
      currentSize: 20,
    })
    fetchVaultFileListApi.mockResolvedValue([])

    const secretStore = useSecretFolderStore()
    secretStore.vaultMode = true
    secretStore.vaultUnlocked = true

    const store = useFileStore()
    await store.fetchStorageSummary()
    await store.fetchDrivePage({ parentId: null, page: 0, size: 20, vaultMode: true })
    await store.fetchVaultFiles()

    fetchStorageSummaryApi.mockClear()
    fetchFileListApi.mockClear()
    fetchVaultFileListApi.mockClear()

    await store.refreshAll()
    await Promise.resolve()

    expect(fetchFileListApi).not.toHaveBeenCalled()
    expect(fetchVaultFileListApi).toHaveBeenCalledTimes(1)
    expect(fetchStorageSummaryApi).toHaveBeenCalledTimes(1)
  })
})
