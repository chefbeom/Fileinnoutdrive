const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readValue = (source, fallback = null) => resolveSource(source) ?? fallback
const readBoolean = (source) => Boolean(resolveSource(source))
const writeRef = (target, value) => {
  if (target && typeof target === 'object' && 'value' in target) {
    target.value = value
  }
}
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}

const addUniqueId = (ids = [], id) => {
  const idKey = String(id)
  return ids.some((item) => String(item) === idKey) ? ids : [...ids, id]
}

const removeId = (ids = [], id) => {
  const idKey = String(id)
  return ids.filter((item) => String(item) !== idKey)
}

export const useWorkspaceAssetActions = ({
  workspaceId,
  workspaceAssetUploading,
  workspaceAssetError,
  activeWorkspaceAssetId,
  deletingAssetIds,
  savingWorkspaceAssetIds,
  activeWorkspacePanelTab,
  imageInput,
  fileInput,
  canManageAssets,
  ensureWorkspacePersisted = async () => null,
  uploadWorkspaceAssets = async () => [],
  deleteWorkspaceAsset = async () => {},
  saveWorkspaceAssetToDriveApi = async () => {},
  downloadWorkspaceAssetFile = async () => {},
  normalizeWorkspaceAsset = (asset) => asset,
  mergeWorkspaceAssets = () => {},
  removeWorkspaceAssets = () => {},
  showWorkspaceNotice = () => {},
  logUploadError = (error) => console.error('Workspace asset upload failed:', error),
} = {}) => {
  const uploadWorkspaceFiles = async (files, { autoPersist = true } = {}) => {
    const selectedFiles = Array.from(files || []).filter(Boolean)
    if (!selectedFiles.length) return []

    let targetWorkspaceId = readValue(workspaceId)
    if (!targetWorkspaceId && autoPersist) {
      targetWorkspaceId = await ensureWorkspacePersisted({ navigate: false })
    }
    if (!targetWorkspaceId) {
      throw new Error('워크스페이스를 먼저 저장한 뒤 업로드해주세요.')
    }

    writeRef(workspaceAssetUploading, true)
    writeRef(workspaceAssetError, '')
    try {
      const uploaded = await uploadWorkspaceAssets(targetWorkspaceId, selectedFiles)
      const normalizedAssets = (Array.isArray(uploaded) ? uploaded : []).map(normalizeWorkspaceAsset)
      mergeWorkspaceAssets(normalizedAssets)
      if (normalizedAssets[0]?.id != null) {
        writeRef(activeWorkspaceAssetId, normalizedAssets[0].id)
      }
      return normalizedAssets
    } catch (error) {
      writeRef(
        workspaceAssetError,
        error?.response?.data?.message || error?.message || '파일 업로드 중 오류가 발생했습니다.',
      )
      throw error
    } finally {
      writeRef(workspaceAssetUploading, false)
    }
  }

  const handleEditorImageUpload = async (file) => {
    const uploadedAssets = await uploadWorkspaceFiles([file], { autoPersist: true })
    const uploadedImage = uploadedAssets.find((asset) => asset.assetType === 'IMAGE') || uploadedAssets[0]
    if (!uploadedImage?.previewUrl) {
      throw new Error('이미지 업로드 결과를 확인할 수 없습니다.')
    }
    return uploadedImage
  }

  const handleAssetSelection = async (event) => {
    const files = Array.from(event?.target?.files || [])
    if (!files.length) return
    try {
      await uploadWorkspaceFiles(files, { autoPersist: true })
    } catch (error) {
      logUploadError(error)
    } finally {
      if (event?.target) event.target.value = ''
    }
  }

  const triggerAssetSelect = (inputRef) => {
    if (!readBoolean(canManageAssets)) return
    writeRef(activeWorkspacePanelTab, 'assets')
    resolveSource(inputRef)?.click?.()
  }

  const triggerImageSelect = () => triggerAssetSelect(imageInput)
  const triggerFileSelect = () => triggerAssetSelect(fileInput)

  const toggleWorkspaceAssetActions = (assetId) => {
    if (assetId == null) return
    writeRef(activeWorkspaceAssetId, readValue(activeWorkspaceAssetId) === assetId ? null : assetId)
  }

  const handleAssetDelete = async (asset) => {
    if (asset?.id == null || !readValue(workspaceId) || !readBoolean(canManageAssets)) return

    writeRef(deletingAssetIds, addUniqueId(readRows(deletingAssetIds), asset.id))
    writeRef(workspaceAssetError, '')
    try {
      await deleteWorkspaceAsset(readValue(workspaceId), asset.id)
      removeWorkspaceAssets([asset.id])
      if (readValue(activeWorkspaceAssetId) === asset.id) {
        writeRef(activeWorkspaceAssetId, null)
      }
    } catch (error) {
      writeRef(
        workspaceAssetError,
        error?.response?.data?.message || error?.message || '첨부 파일을 삭제하지 못했습니다.',
      )
    } finally {
      writeRef(deletingAssetIds, removeId(readRows(deletingAssetIds), asset.id))
    }
  }

  const isDeletingAsset = (assetId) =>
    readRows(deletingAssetIds).some((id) => String(id) === String(assetId))

  const saveWorkspaceAssetToDrive = async (asset) => {
    if (asset?.id == null || !readValue(workspaceId)) return

    writeRef(savingWorkspaceAssetIds, addUniqueId(readRows(savingWorkspaceAssetIds), asset.id))
    writeRef(workspaceAssetError, '')
    try {
      await saveWorkspaceAssetToDriveApi(readValue(workspaceId), asset.id)
      showWorkspaceNotice('파일이 드라이브에 저장되었습니다.', 'success')
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || '파일을 드라이브에 저장하지 못했습니다.'
      writeRef(workspaceAssetError, message)
      showWorkspaceNotice(message, 'error')
    } finally {
      writeRef(savingWorkspaceAssetIds, removeId(readRows(savingWorkspaceAssetIds), asset.id))
    }
  }

  const downloadWorkspaceAsset = async (asset) => {
    if (!asset?.downloadUrl) return
    try {
      await downloadWorkspaceAssetFile(asset, asset.originalName)
    } catch {
      writeRef(workspaceAssetError, '파일 다운로드에 실패했습니다.')
    }
  }

  return {
    uploadWorkspaceFiles,
    handleEditorImageUpload,
    handleAssetSelection,
    triggerImageSelect,
    triggerFileSelect,
    toggleWorkspaceAssetActions,
    handleAssetDelete,
    isDeletingAsset,
    saveWorkspaceAssetToDrive,
    downloadWorkspaceAsset,
  }
}