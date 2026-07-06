import { unref } from 'vue'

import {
  isWorkspaceDocumentFavorite as isWorkspaceDocumentFavoriteModel,
  toggleFavoriteWorkspaceDocumentIds,
} from '../services/workspacePreferenceState.js'

const readValue = (source) => {
  if (typeof source === 'function') return source()
  return unref(source)
}

export const useWorkspaceDocumentFavorites = ({
  favoriteWorkspaceDocumentIds,
  currentWorkspaceLinkDocument,
  canFavoriteCurrentWorkspaceDocument,
  persistFavoriteWorkspaceDocuments = () => {},
} = {}) => {
  const isWorkspaceDocumentFavorite = (document) =>
    isWorkspaceDocumentFavoriteModel(readValue(favoriteWorkspaceDocumentIds), document)

  const toggleFavoriteWorkspaceDocument = (document) => {
    const currentIds = readValue(favoriteWorkspaceDocumentIds)
    const nextIds = toggleFavoriteWorkspaceDocumentIds(currentIds, document)
    if (nextIds === currentIds) return false

    favoriteWorkspaceDocumentIds.value = nextIds
    persistFavoriteWorkspaceDocuments()
    return true
  }

  const toggleCurrentWorkspaceDocumentFavorite = () => {
    if (!readValue(canFavoriteCurrentWorkspaceDocument)) return false
    return toggleFavoriteWorkspaceDocument(readValue(currentWorkspaceLinkDocument))
  }

  return {
    isWorkspaceDocumentFavorite,
    toggleFavoriteWorkspaceDocument,
    toggleCurrentWorkspaceDocumentFavorite,
  }
}
