import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import {
  fetchFileListPage as fetchFileListPageApi,
  fetchStorageSummary as fetchStorageSummaryApi,
  moveFilesToVault as moveFilesToVaultApi,
} from '@/api/filesApi.js'
import { useFileStore } from './useFileStore.js'

vi.mock('@/api/filesApi.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchFileListPage: vi.fn(),
    fetchStorageSummary: vi.fn(),
    moveFilesToVault: vi.fn(),
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

    const rootPromise = store.fetchDrivePage({ parentId: null, page: 0, size: 10 })

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
})
