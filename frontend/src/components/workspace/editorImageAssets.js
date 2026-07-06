export const createImageAssetMap = (blocks = []) => new Map(
  (Array.isArray(blocks) ? blocks : [])
    .filter((block) => block?.type === 'image' && block?.data?.file?.assetIdx)
    .map((block) => [block.data.file.assetIdx, true]),
)


export const listRemovedImageAssetIds = (previousAssets, currentAssets) => {
  if (!previousAssets || typeof previousAssets.keys !== 'function') return []
  const current = currentAssets && typeof currentAssets.has === 'function'
    ? currentAssets
    : new Map()

  return Array.from(previousAssets.keys()).filter((assetIdx) => !current.has(assetIdx))
}