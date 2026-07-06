import { collectWorkspaceSnapshotText } from './workspaceMarkdown.js'
import { roleLabel, formatDocumentTime } from './workspacePresentation.js'
import {
  buildWorkspaceSearchSnippet,
  collectWorkspaceSnapshotLinkIds,
  parseWorkspaceSnapshotWithMeta,
} from './workspaceSnapshot.js'
import { normalizeFavoriteWorkspaceIds } from './workspacePreferences.js'
import { normalizeWorkspaceLinkText } from './workspacePageTree.js'

export const createWorkspaceLookupMap = (rows = []) => {
  const map = new Map()
  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    if (row?.id == null) return
    map.set(String(row.id), row)
  })
  return map
}

export const workspaceDocumentId = (document = {}) =>
  document?.id ?? document?.post_idx ?? null

export const createWorkspaceDocumentPath = (document = {}, { documentIdFor = workspaceDocumentId } = {}) => {
  const id = documentIdFor(document)
  return id == null ? '' : `/workspace/read/${encodeURIComponent(String(id))}`
}

export const createWorkspaceDocumentAbsoluteUrl = (document = {}, {
  origin = '',
  documentIdFor = workspaceDocumentId,
} = {}) => {
  const path = createWorkspaceDocumentPath(document, { documentIdFor })
  const normalizedOrigin = String(origin || '').trim()
  if (!path || !normalizedOrigin) return path

  try {
    return new URL(path, normalizedOrigin).toString()
  } catch {
    return path
  }
}

export const extractSavedWorkspaceId = (response = {}) =>
  response?.result?.body?.idx ?? response?.data?.idx ?? response?.idx ?? null

export const escapeWorkspaceInlineHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const buildWorkspaceBreadcrumbPage = ({
  pageId = '',
  fallbackTitle = '',
  pageIndexRowById = new Map(),
  documentById = new Map(),
  roleLabelFor = roleLabel,
  formatDocumentTimeFor = formatDocumentTime,
} = {}) => {
  const id = String(pageId || '').trim()
  const indexedRow = pageIndexRowById.get(id)
  const listedDocument = documentById.get(id)
  const source = indexedRow || listedDocument || {}
  const accessRole = source.accessRole || source.role || ''
  return {
    ...source,
    id: source.id ?? id,
    title: source.title || fallbackTitle || '상위 페이지',
    scopeLabel: source.scopeLabel || (source.scope === 'shared' ? '공유 페이지' : '내 페이지'),
    roleLabel: source.roleLabel || (accessRole ? roleLabelFor(accessRole) : ''),
    updatedLabel: source.updatedLabel || (source.updatedAt ? formatDocumentTimeFor(source.updatedAt) : ''),
    parentWorkspaceId: String(source.parentWorkspaceId || ''),
    parentWorkspaceTitle: String(source.parentWorkspaceTitle || ''),
  }
}

export const buildWorkspaceBreadcrumbTrail = ({
  currentId = '',
  parentId = '',
  parentTitle = '',
  pageIndexRowById = new Map(),
  documentById = new Map(),
  maxDepth = 8,
  roleLabelFor = roleLabel,
  formatDocumentTimeFor = formatDocumentTime,
} = {}) => {
  let nextParentId = String(parentId || '').trim()
  let fallbackTitle = parentTitle
  const seenIds = new Set([String(currentId || '')])
  const trail = []

  for (let depth = 0; nextParentId && !seenIds.has(nextParentId) && depth < maxDepth; depth += 1) {
    seenIds.add(nextParentId)
    const page = buildWorkspaceBreadcrumbPage({
      pageId: nextParentId,
      fallbackTitle,
      pageIndexRowById,
      documentById,
      roleLabelFor,
      formatDocumentTimeFor,
    })
    trail.unshift(page)
    nextParentId = String(page.parentWorkspaceId || '').trim()
    fallbackTitle = page.parentWorkspaceTitle || ''
  }

  return trail
}


export const createWorkspaceFullTextSearchResult = (
  document = {},
  data = {},
  query = '',
  { roleLabelFor = roleLabel, formatDocumentTimeFor = formatDocumentTime } = {},
) => {
  const snapshot = parseWorkspaceSnapshotWithMeta(data?.contents)
  const bodyText = collectWorkspaceSnapshotText(snapshot.blocks)
  const titleText = String(data?.title || document.title || '')
  const normalizedQuery = normalizeWorkspaceLinkText(query)
  const normalizedTitle = normalizeWorkspaceLinkText(titleText)
  const normalizedBody = normalizeWorkspaceLinkText(bodyText)
  const titleMatched = normalizedTitle.includes(normalizedQuery)
  const bodyMatched = normalizedBody.includes(normalizedQuery)
  if (!titleMatched && !bodyMatched) return null

  return {
    ...document,
    title: titleText || document.title,
    updatedAt: data?.updatedAt || document.updatedAt,
    scopeLabel: document.scope === 'shared' ? '공유 페이지' : '내 페이지',
    roleLabel: roleLabelFor(data?.accessRole || data?.level || document.role),
    updatedLabel: formatDocumentTimeFor(data?.updatedAt || document.updatedAt),
    matchType: titleMatched ? 'title' : 'body',
    matchTypeLabel: titleMatched ? '제목' : '본문',
    snippet: bodyMatched
      ? buildWorkspaceSearchSnippet(bodyText, query)
      : '제목에서 검색어가 발견되었습니다.',
  }
}

export const createWorkspaceBacklinkResult = (
  document = {},
  data = {},
  targetId = '',
  targetTitle = '',
  { roleLabelFor = roleLabel, formatDocumentTimeFor = formatDocumentTime } = {},
) => {
  const snapshot = parseWorkspaceSnapshotWithMeta(data?.contents)
  const linkIds = collectWorkspaceSnapshotLinkIds(snapshot.blocks)
  const text = collectWorkspaceSnapshotText(snapshot.blocks)
  const normalizedTargetId = String(targetId || '')
  const normalizedTargetTitle = normalizeWorkspaceLinkText(targetTitle)
  const normalizedText = normalizeWorkspaceLinkText(text)
  const isExplicit = Boolean(normalizedTargetId && linkIds.has(normalizedTargetId))
  const isMention = Boolean(
    normalizedTargetTitle &&
    normalizedTargetTitle.length >= 2 &&
    normalizedText.includes(normalizedTargetTitle),
  )
  if (!isExplicit && !isMention) return null

  return {
    ...document,
    title: data?.title || document.title,
    updatedAt: data?.updatedAt || document.updatedAt,
    scopeLabel: document.scope === 'shared' ? '공유 페이지' : '내 페이지',
    roleLabel: roleLabelFor(data?.accessRole || data?.level || document.role),
    updatedLabel: formatDocumentTimeFor(data?.updatedAt || document.updatedAt),
    backlinkSource: isExplicit ? 'explicit' : 'mention',
    backlinkSourceLabel: isExplicit ? '삽입된 링크' : '제목 언급',
    backlinkPreview: text.slice(0, 140),
  }
}

export const filterWorkspaceDocuments = (documents = [], query = '') => {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  const rows = Array.isArray(documents) ? documents : []
  if (!normalizedQuery) return rows
  return rows.filter((item) =>
    `${item.title} ${item.status} ${item.role}`.toLowerCase().includes(normalizedQuery),
  )
}

export const collectWorkspaceDocumentSectionIds = (sections = []) =>
  new Set(
    (Array.isArray(sections) ? sections : []).flatMap((section) =>
      normalizeFavoriteWorkspaceIds(section?.documentIds),
    ),
  )

export const createWorkspaceDocumentSectionViews = ({
  sections = [],
  documentsById = new Map(),
  filteredDocuments = [],
} = {}) => {
  const filteredIds = new Set((Array.isArray(filteredDocuments) ? filteredDocuments : []).map((document) => String(document.id)))
  return (Array.isArray(sections) ? sections : []).map((section) => ({
    ...section,
    documents: normalizeFavoriteWorkspaceIds(section?.documentIds)
      .filter((documentId) => filteredIds.has(documentId))
      .map((documentId) => documentsById.get(documentId))
      .filter(Boolean),
  }))
}

export const filterVisibleWorkspaceDocumentSectionViews = (sectionViews = [], query = '') =>
  (Array.isArray(sectionViews) ? sectionViews : []).filter((section) =>
    section.documents.length > 0 || !String(query || '').trim(),
  )

export const countWorkspaceSectionedDocuments = (sectionViews = []) =>
  (Array.isArray(sectionViews) ? sectionViews : []).reduce((total, section) => total + section.documents.length, 0)

export const filterFavoriteWorkspaceDocuments = (documents = [], favoriteIds = []) => {
  const favoriteIdSet = new Set(normalizeFavoriteWorkspaceIds(favoriteIds))
  return (Array.isArray(documents) ? documents : []).filter((item) => favoriteIdSet.has(String(item.id)))
}

export const listRecentWorkspaceDocuments = (documents = [], recentIds = []) => {
  const documentById = createWorkspaceLookupMap(documents)
  return normalizeFavoriteWorkspaceIds(recentIds)
    .map((id) => documentById.get(String(id)))
    .filter(Boolean)
}

export const filterUnsectionedWorkspaceDocuments = (documents = [], sectionIds = new Set()) =>
  (Array.isArray(documents) ? documents : []).filter((item) => !sectionIds.has(String(item.id)))

export const createLinkedWorkspaceDocuments = ({
  documents = [],
  searchText = '',
  links = [],
  currentId = '',
  limit = 8,
  roleLabelFor = roleLabel,
  formatDocumentTimeFor = formatDocumentTime,
} = {}) => {
  const normalizedSearchText = normalizeWorkspaceLinkText(searchText)
  const explicitLinkMap = new Map(
    (Array.isArray(links) ? links : [])
      .filter((link) => link?.documentId)
      .map((link) => [String(link.documentId), link]),
  )
  if (!normalizedSearchText && explicitLinkMap.size === 0) return []

  const currentKey = String(currentId || '')
  return (Array.isArray(documents) ? documents : [])
    .filter((document) => {
      const id = String(document.id || '')
      const title = normalizeWorkspaceLinkText(document.title)
      if (!id || id === currentKey) return false
      if (explicitLinkMap.has(id)) return true
      if (!title || title.length < 2 || title === '제목 없음') return false
      return normalizedSearchText.includes(title)
    })
    .map((document) => {
      const id = String(document.id)
      const explicitLink = explicitLinkMap.get(id)
      return {
        ...document,
        scopeLabel: document.scope === 'shared' ? '공유 페이지' : '내 페이지',
        roleLabel: roleLabelFor(document.role),
        updatedLabel: formatDocumentTimeFor(document.updatedAt),
        linkSource: explicitLink ? 'explicit' : 'mention',
        linkSourceLabel: explicitLink ? '삽입된 링크' : '제목 언급',
        linkAnchorBlockId: explicitLink?.anchorBlockId || '',
        linkAnchorText: explicitLink?.anchorText || '',
      }
    })
    .sort((left, right) => Number(right.linkSource === 'explicit') - Number(left.linkSource === 'explicit'))
    .slice(0, limit)
}

export const linkedWorkspaceDocumentEmptyLabel = (documentCount = 0) =>
  Number(documentCount) > 1
    ? '본문에 다른 페이지 제목을 적으면 자동으로 연결됩니다.'
    : '다른 페이지가 생기면 관계를 추적할 수 있습니다.'

export const listCurrentWorkspaceChildPages = (rows = [], currentId = '', limit = 8) => {
  const currentKey = String(currentId || '')
  if (!currentKey || currentKey === 'new') return []
  return (Array.isArray(rows) ? rows : [])
    .filter((row) =>
      String(row.parentWorkspaceId || '') === currentKey &&
      String(row.id || '') !== currentKey,
    )
    .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime())
    .slice(0, limit)
}
