import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useWorkspaceAssetActions } from './useWorkspaceAssetActions.js'

const createSubject = (overrides = {}) => {
  const state = {
    workspaceId: ref(42),
    workspaceAssetUploading: ref(false),
    workspaceAssetError: ref(''),
    activeWorkspaceAssetId: ref(null),
    deletingAssetIds: ref([]),
    savingWorkspaceAssetIds: ref([]),
    activeWorkspacePanelTab: ref('home'),
    imageInput: ref({ click: vi.fn() }),
    fileInput: ref({ click: vi.fn() }),
    canManageAssets: ref(true),
  }
  const api = {
    ensureWorkspacePersisted: vi.fn(async () => 42),
    uploadWorkspaceAssets: vi.fn(async () => [{ idx: 7, assetType: 'IMAGE', previewUrl: '/p.png' }]),
    deleteWorkspaceAsset: vi.fn(async () => {}),
    saveWorkspaceAssetToDriveApi: vi.fn(async () => {}),
    downloadWorkspaceAssetFile: vi.fn(async () => {}),
    normalizeWorkspaceAsset: vi.fn((asset) => ({ id: asset.idx ?? asset.id, ...asset })),
    mergeWorkspaceAssets: vi.fn(),
    removeWorkspaceAssets: vi.fn(),
    showWorkspaceNotice: vi.fn(),
    logUploadError: vi.fn(),
  }
  const subject = useWorkspaceAssetActions({ ...state, ...api, ...overrides })
  return { subject, state, api }
}

describe('useWorkspaceAssetActions', () => {
  it('uploads files, normalizes results, merges assets, and selects the first asset', async () => {
    const { subject, state, api } = createSubject()

    const result = await subject.uploadWorkspaceFiles(['file-a'])

    expect(api.uploadWorkspaceAssets).toHaveBeenCalledWith(42, ['file-a'])
    expect(api.mergeWorkspaceAssets).toHaveBeenCalledWith([{ id: 7, idx: 7, assetType: 'IMAGE', previewUrl: '/p.png' }])
    expect(result[0]).toMatchObject({ id: 7, previewUrl: '/p.png' })
    expect(state.activeWorkspaceAssetId.value).toBe(7)
    expect(state.workspaceAssetUploading.value).toBe(false)
    expect(state.workspaceAssetError.value).toBe('')
  })

  it('persists a new workspace before uploading when requested', async () => {
    const { subject, api } = createSubject({ workspaceId: ref(null) })

    await subject.uploadWorkspaceFiles(['new-file'])

    expect(api.ensureWorkspacePersisted).toHaveBeenCalledWith({ navigate: false })
    expect(api.uploadWorkspaceAssets).toHaveBeenCalledWith(42, ['new-file'])
  })

  it('adapts editor image upload to the uploaded image asset', async () => {
    const { subject } = createSubject()

    await expect(subject.handleEditorImageUpload('image')).resolves.toMatchObject({ id: 7, previewUrl: '/p.png' })
  })

  it('logs upload selection failures and clears the input', async () => {
    const target = { files: ['bad-file'], value: 'selected' }
    const { subject, state, api } = createSubject({
      uploadWorkspaceAssets: vi.fn(async () => { throw new Error('upload failed') }),
    })

    await subject.handleAssetSelection({ target })

    expect(api.logUploadError).toHaveBeenCalled()
    expect(target.value).toBe('')
    expect(state.workspaceAssetError.value).toBe('upload failed')
  })

  it('opens file inputs only when asset management is allowed', () => {
    const { subject, state } = createSubject()

    subject.triggerImageSelect()
    expect(state.activeWorkspacePanelTab.value).toBe('assets')
    expect(state.imageInput.value.click).toHaveBeenCalled()

    state.canManageAssets.value = false
    subject.triggerFileSelect()
    expect(state.fileInput.value.click).not.toHaveBeenCalled()
  })

  it('deletes an asset and clears the active asset', async () => {
    const { subject, state, api } = createSubject()
    state.activeWorkspaceAssetId.value = 9

    await subject.handleAssetDelete({ id: 9 })

    expect(api.deleteWorkspaceAsset).toHaveBeenCalledWith(42, 9)
    expect(api.removeWorkspaceAssets).toHaveBeenCalledWith([9])
    expect(state.activeWorkspaceAssetId.value).toBeNull()
    expect(state.deletingAssetIds.value).toEqual([])
    expect(subject.isDeletingAsset(9)).toBe(false)
  })

  it('saves an asset to drive with success feedback', async () => {
    const { subject, state, api } = createSubject()

    await subject.saveWorkspaceAssetToDrive({ id: 3 })

    expect(api.saveWorkspaceAssetToDriveApi).toHaveBeenCalledWith(42, 3)
    expect(api.showWorkspaceNotice).toHaveBeenCalledWith('파일이 드라이브에 저장되었습니다.', 'success')
    expect(state.savingWorkspaceAssetIds.value).toEqual([])
  })

  it('downloads assets and reports download failures', async () => {
    const downloadWorkspaceAssetFile = vi.fn(async () => { throw new Error('blocked') })
    const { subject, state } = createSubject({ downloadWorkspaceAssetFile })

    await subject.downloadWorkspaceAsset({ downloadUrl: '/asset', originalName: 'asset.pdf' })

    expect(downloadWorkspaceAssetFile).toHaveBeenCalledWith(
      { downloadUrl: '/asset', originalName: 'asset.pdf' },
      'asset.pdf',
    )
    expect(state.workspaceAssetError.value).toBe('파일 다운로드에 실패했습니다.')
  })
})