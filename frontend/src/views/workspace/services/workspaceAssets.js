import { formatBytes } from '@/utils/formatBytes.js'

import { formatDateTime } from './workspacePresentation.js'

export const normalizeWorkspaceAsset = (asset = {}, { workspaceId = null } = {}) => {
  const fileSize = Number(asset.fileSize || 0)

  return {
    id: asset.idx ?? asset.id ?? null,
    workspaceId: asset.workspaceIdx ?? asset.workspaceId ?? workspaceId,
    assetType: String(asset.assetType || 'FILE').toUpperCase(),
    originalName: asset.originalName || asset.fileOriginName || '이름 없는 파일',
    storedFileName: asset.storedFileName || asset.fileSaveName || '',
    objectFolder: asset.objectFolder || '',
    objectKey: asset.objectKey || asset.fileSavePath || '',
    contentType: asset.contentType || 'application/octet-stream',
    fileSize,
    previewUrl: asset.previewUrl || '',
    downloadUrl: asset.downloadUrl || asset.presignedDownloadUrl || '',
    createdAt: asset.createdAt || null,
    createdAtLabel: formatDateTime(asset.createdAt),
    fileSizeLabel: formatBytes(fileSize),
  }
}

export const mergeWorkspaceAssetList = (currentAssets = [], nextAssets = [], options = {}) => {
  const assetMap = new Map()

  ;[...currentAssets, ...nextAssets].forEach((asset) => {
    const normalized = normalizeWorkspaceAsset(asset, options)
    if (normalized.id != null) {
      assetMap.set(String(normalized.id), normalized)
    }
  })

  return [...assetMap.values()].sort(
    (left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime(),
  )
}

export const removeWorkspaceAssetIds = (assets = [], assetIds = []) => {
  const deleteSet = new Set((assetIds || []).map((id) => String(id)))
  if (!deleteSet.size) return assets
  return assets.filter((asset) => !deleteSet.has(String(asset.id)))
}

export const workspaceAssetRealtimeLabel = (assets = [], deletedIds = []) => {
  if (assets.length > 0) {
    const firstName = assets[0]?.originalName || '첨부 파일'
    return assets.length === 1 ? firstName : `${firstName} 외 ${assets.length - 1}개`
  }

  const count = deletedIds.length
  return count > 1 ? `${count}개 파일` : '첨부 파일'
}

export const workspaceAssetBadge = (asset = {}) => (asset?.assetType === 'IMAGE' ? '이미지' : '파일')
