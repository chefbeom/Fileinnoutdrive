const WORKSPACE_PAGE_INDEX_FILTER_IDS = Object.freeze(['all', 'active', 'blocked', 'overdue', 'shared'])
const WORKSPACE_PAGE_INDEX_SORT_IDS = Object.freeze(['updated-desc', 'due-asc', 'priority-desc', 'title-asc'])

export const normalizeFavoriteWorkspaceIds = (value) =>
  [...new Set((Array.isArray(value) ? value : []).map((id) => (id == null ? '' : String(id))).filter(Boolean))]

export const normalizeRecentWorkspaceIds = (value, limit = 8) =>
  normalizeFavoriteWorkspaceIds(value).slice(0, limit)

export const createWorkspaceSectionId = () =>
  `section-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const createWorkspacePageIndexViewId = () =>
  `page-index-view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const normalizeWorkspaceSectionName = (value) => String(value || '').trim().slice(0, 32)

export const normalizeWorkspacePageIndexViewName = (value) => String(value || '').trim().slice(0, 32)

export const normalizeWorkspacePageIndexViewFilter = (value) => {
  const normalized = String(value || '').trim()
  return WORKSPACE_PAGE_INDEX_FILTER_IDS.includes(normalized) ? normalized : 'all'
}

export const normalizeWorkspacePageIndexViewSort = (value) => {
  const normalized = String(value || '').trim()
  return WORKSPACE_PAGE_INDEX_SORT_IDS.includes(normalized) ? normalized : 'updated-desc'
}

export const normalizeWorkspacePageIndexViewTag = (value) => String(value || '').trim().toLowerCase()

export const normalizeWorkspacePageIndexViewOwner = (value) => String(value || '').trim().toLowerCase()

export const workspacePageIndexViewSignature = (view = {}) =>
  `${normalizeWorkspacePageIndexViewFilter(view.filter)}|${String(view.query || '').trim().toLowerCase()}|${normalizeWorkspacePageIndexViewTag(view.tag)}|${normalizeWorkspacePageIndexViewOwner(view.owner)}|${normalizeWorkspacePageIndexViewSort(view.sort)}`

const optionLabel = (options = [], id = '') =>
  (Array.isArray(options) ? options : []).find(
    (option) => String(option?.id || '').toLowerCase() === String(id || '').toLowerCase(),
  )?.label

export const createWorkspacePageIndexViewSummary = (view = {}, options = {}) => {
  const filterLabel = optionLabel(options.filterOptions, view?.filter) || '전체'
  const sortLabel = optionLabel(options.sortOptions, view?.sort) || '최근 수정순'
  const query = String(view?.query || '').trim()
  const tag = String(view?.tag || '').trim()
  const owner = String(view?.owner || '').trim()
  const ownerLabel = owner
    ? optionLabel(options.ownerOptions, owner) || owner
    : '담당자 전체'

  return [
    filterLabel,
    sortLabel,
    tag ? `#${tag}` : '태그 전체',
    ownerLabel,
    query ? `"${query}"` : '검색어 없음',
  ].join(' · ')
}
export const normalizeWorkspacePageIndexViews = (value) => {
  const seenIds = new Set()
  const seenNames = new Set()
  return (Array.isArray(value) ? value : [])
    .map((view) => {
      const id = String(view?.id || '').trim()
      const name = normalizeWorkspacePageIndexViewName(view?.name)
      const nameKey = name.toLowerCase()
      if (!id || !name || seenIds.has(id) || seenNames.has(nameKey)) return null
      seenIds.add(id)
      seenNames.add(nameKey)
      return {
        id,
        name,
        filter: normalizeWorkspacePageIndexViewFilter(view?.filter),
        query: String(view?.query || '').trim().slice(0, 80),
        tag: normalizeWorkspacePageIndexViewTag(view?.tag),
        owner: normalizeWorkspacePageIndexViewOwner(view?.owner),
        sort: normalizeWorkspacePageIndexViewSort(view?.sort),
      }
    })
    .filter(Boolean)
    .slice(0, 12)
}

export const normalizeWorkspaceDocumentSections = (value, validIds = null) => {
  const seenSections = new Set()
  const seenDocuments = new Set()
  const validDocumentIds = validIds ? new Set([...validIds].map((id) => String(id))) : null

  return (Array.isArray(value) ? value : [])
    .map((section) => {
      const id = String(section?.id || '').trim()
      const name = normalizeWorkspaceSectionName(section?.name)
      if (!id || !name || seenSections.has(id)) return null
      seenSections.add(id)
      return {
        id,
        name,
        collapsed: Boolean(section?.collapsed),
        documentIds: normalizeFavoriteWorkspaceIds(section?.documentIds)
          .filter((documentId) => {
            if (validDocumentIds && !validDocumentIds.has(documentId)) return false
            if (seenDocuments.has(documentId)) return false
            seenDocuments.add(documentId)
            return true
          }),
      }
    })
    .filter(Boolean)
}