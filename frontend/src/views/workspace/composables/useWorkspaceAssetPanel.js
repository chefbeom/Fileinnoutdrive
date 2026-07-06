import { computed } from 'vue'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}
const readIdSet = (source) => new Set(readRows(source).map((id) => String(id)))

export const useWorkspaceAssetPanel = ({
  workspaceAssets,
  savingWorkspaceAssetIds,
} = {}) => {
  const workspaceImages = computed(() =>
    readRows(workspaceAssets).filter((asset) => asset?.assetType === 'IMAGE'),
  )

  const workspaceFiles = computed(() =>
    readRows(workspaceAssets).filter((asset) => asset?.assetType === 'FILE'),
  )

  const hasWorkspaceAssets = computed(() => readRows(workspaceAssets).length > 0)

  const isSavingWorkspaceAsset = (assetId) =>
    readIdSet(savingWorkspaceAssetIds).has(String(assetId))

  return {
    workspaceImages,
    workspaceFiles,
    hasWorkspaceAssets,
    isSavingWorkspaceAsset,
  }
}
