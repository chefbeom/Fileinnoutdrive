import { normalizeWorkspaceComment as normalizeWorkspaceCommentModel } from '../services/workspaceComments.js'
import {
  extractWorkspaceParentFromContents as extractWorkspaceParentFromContentsModel,
  extractWorkspacePropertiesFromContents as extractWorkspacePropertiesFromContentsModel,
  normalizeWorkspaceProperties as normalizeWorkspacePropertiesBase,
  serializeWorkspaceSnapshotWithParent as serializeWorkspaceSnapshotWithParentModel,
  serializeWorkspaceSnapshotWithProperties as serializeWorkspaceSnapshotWithPropertiesModel,
} from '../services/workspaceProperties.js'
import { normalizeWorkspaceRevision as normalizeWorkspaceRevisionModel } from '../services/workspaceRevisionDiff.js'
import { normalizeWorkspaceAsset as normalizeWorkspaceAssetModel } from '../services/workspaceAssets.js'

const currentValue = (source) => {
  if (source && typeof source === 'object' && 'value' in source) return source.value
  return source
}

export const useWorkspaceNormalization = ({ workspaceId, propertyOptions = {} } = {}) => {
  const currentWorkspaceId = () => currentValue(workspaceId)

  const normalizeWorkspaceProperties = (properties = {}) =>
    normalizeWorkspacePropertiesBase(properties, propertyOptions)

  const normalizeWorkspaceAsset = (asset = {}) =>
    normalizeWorkspaceAssetModel(asset, { workspaceId: currentWorkspaceId() })

  const normalizeWorkspaceComment = (comment = {}) =>
    normalizeWorkspaceCommentModel(comment, { workspaceId: currentWorkspaceId() })

  const normalizeWorkspaceRevision = (revision = {}) =>
    normalizeWorkspaceRevisionModel(revision, { workspaceId: currentWorkspaceId() })

  const serializeWorkspaceSnapshotWithProperties = (contents, properties) =>
    serializeWorkspaceSnapshotWithPropertiesModel(contents, properties, propertyOptions)

  const serializeWorkspaceSnapshotWithParent = (contents, parent = {}) =>
    serializeWorkspaceSnapshotWithParentModel(contents, parent)

  const extractWorkspacePropertiesFromContents = (contents) =>
    extractWorkspacePropertiesFromContentsModel(contents, propertyOptions)

  const extractWorkspaceParentFromContents = (contents) =>
    extractWorkspaceParentFromContentsModel(contents)

  return {
    normalizeWorkspaceProperties,
    normalizeWorkspaceAsset,
    normalizeWorkspaceComment,
    normalizeWorkspaceRevision,
    serializeWorkspaceSnapshotWithProperties,
    serializeWorkspaceSnapshotWithParent,
    extractWorkspacePropertiesFromContents,
    extractWorkspaceParentFromContents,
  }
}
