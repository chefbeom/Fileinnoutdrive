import {
  normalizeFavoriteWorkspaceIds,
  normalizeRecentWorkspaceIds,
  normalizeWorkspaceDocumentSections,
  normalizeWorkspacePageIndexViews,
} from './workspacePreferences.js'

export const workspaceDocumentId = (document) => document?.id ?? document?.post_idx ?? null

export const createWorkspacePreferencePayload = ({
  favoriteWorkspaceDocumentIds = [],
  recentWorkspaceDocumentIds = [],
  workspaceDocumentSections = [],
  workspacePageIndexViews = [],
} = {}) => ({
  favoriteWorkspaceIds: normalizeFavoriteWorkspaceIds(favoriteWorkspaceDocumentIds),
  recentWorkspaceIds: normalizeRecentWorkspaceIds(recentWorkspaceDocumentIds),
  documentSections: normalizeWorkspaceDocumentSections(workspaceDocumentSections),
  pageIndexViews: normalizeWorkspacePageIndexViews(workspacePageIndexViews),
})

export const hasWorkspacePreferenceContent = (payload = {}) =>
  [
    payload.favoriteWorkspaceIds,
    payload.recentWorkspaceIds,
    payload.documentSections,
    payload.pageIndexViews,
  ].some((items) => Array.isArray(items) && items.length > 0)

export const createWorkspaceDocumentValidIdSet = (documents = []) => {
  const ids = (Array.isArray(documents) ? documents : [])
    .map((document) => document?.id)
    .filter((id) => id != null)
    .map((id) => String(id))
  return ids.length > 0 ? new Set(ids) : null
}

export const pruneRecentWorkspaceDocumentIds = (recentIds = [], documents = []) => {
  const validIds = createWorkspaceDocumentValidIdSet(documents)
  if (!validIds) return []
  return normalizeRecentWorkspaceIds(recentIds.filter((id) => validIds.has(String(id))))
}

export const trackRecentWorkspaceDocumentIds = (recentIds = [], document = {}) => {
  const id = workspaceDocumentId(document)
  if (id == null || String(id) === 'new') return recentIds
  const normalizedId = String(id)
  return normalizeRecentWorkspaceIds([
    normalizedId,
    ...recentIds.filter((item) => item !== normalizedId),
  ])
}

export const findWorkspaceDocumentSectionId = (sections = [], document = {}) => {
  const id = workspaceDocumentId(document)
  if (id == null) return ''
  const normalizedId = String(id)
  return (Array.isArray(sections) ? sections : []).find((section) =>
    normalizeFavoriteWorkspaceIds(section?.documentIds).includes(normalizedId),
  )?.id || ''
}

export const moveWorkspaceDocumentToSection = (sections = [], document = {}, sectionId = '') => {
  const id = workspaceDocumentId(document)
  if (id == null) return sections
  const normalizedId = String(id)
  const normalizedSectionId = String(sectionId || '')

  return (Array.isArray(sections) ? sections : []).map((section) => {
    const documentIds = normalizeFavoriteWorkspaceIds(section?.documentIds)
      .filter((documentId) => documentId !== normalizedId)
    if (section.id === normalizedSectionId) {
      documentIds.push(normalizedId)
    }
    return { ...section, documentIds }
  })
}

export const isWorkspaceDocumentFavorite = (favoriteIds = [], document = {}) => {
  const id = workspaceDocumentId(document)
  return id != null && normalizeFavoriteWorkspaceIds(favoriteIds).includes(String(id))
}

export const toggleFavoriteWorkspaceDocumentIds = (favoriteIds = [], document = {}) => {
  const id = workspaceDocumentId(document)
  if (id == null) return favoriteIds
  const normalizedId = String(id)
  return isWorkspaceDocumentFavorite(favoriteIds, document)
    ? favoriteIds.filter((item) => item !== normalizedId)
    : normalizeFavoriteWorkspaceIds([...favoriteIds, normalizedId])
}
