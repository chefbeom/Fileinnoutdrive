import { computed } from 'vue'

import {
  buildWorkspaceBreadcrumbTrail,
  collectWorkspaceDocumentSectionIds,
  countWorkspaceSectionedDocuments,
  createLinkedWorkspaceDocuments,
  createWorkspaceDocumentSectionViews,
  createWorkspaceLookupMap,
  filterFavoriteWorkspaceDocuments,
  filterUnsectionedWorkspaceDocuments,
  filterVisibleWorkspaceDocumentSectionViews,
  filterWorkspaceDocuments,
  linkedWorkspaceDocumentEmptyLabel as createLinkedWorkspaceDocumentEmptyLabel,
  listCurrentWorkspaceChildPages,
  listRecentWorkspaceDocuments,
} from '../services/workspaceDocuments.js'
import { normalizeWorkspaceDocument } from '../services/workspaceProperties.js'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value ?? source)
const readArray = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}
const readString = (source) => String(resolveSource(source) || '')

export const useWorkspaceDocumentCollections = ({
  personalItems,
  sharedItems,
  workspaceDocumentQuery,
  workspaceDocumentSections,
  workspacePageIndexRows,
  currentWorkspaceKey,
  workspaceParentPageId,
  workspaceParentPageTitle,
  favoriteWorkspaceDocumentIds,
  recentWorkspaceDocumentIds,
  documentSearchText,
  documentWorkspaceLinks,
} = {}) => {
  const workspaceDocuments = computed(() => [
    ...readArray(personalItems).map((item) => normalizeWorkspaceDocument(item, 'personal')),
    ...readArray(sharedItems).map((item) => normalizeWorkspaceDocument(item, 'shared')),
  ].filter((item) => item.id != null))

  const workspaceDocumentById = computed(() =>
    createWorkspaceLookupMap(workspaceDocuments.value),
  )

  const workspacePageIndexRowById = computed(() =>
    createWorkspaceLookupMap(readArray(workspacePageIndexRows)),
  )

  const workspacePageBreadcrumbTrail = computed(() =>
    buildWorkspaceBreadcrumbTrail({
      currentId: readString(currentWorkspaceKey),
      parentId: readString(workspaceParentPageId),
      parentTitle: readString(workspaceParentPageTitle),
      pageIndexRowById: workspacePageIndexRowById.value,
      documentById: workspaceDocumentById.value,
    }),
  )

  const currentWorkspaceParentPage = computed(() => {
    const trail = workspacePageBreadcrumbTrail.value
    return trail.length ? trail[trail.length - 1] : null
  })

  const filteredWorkspaceDocuments = computed(() =>
    filterWorkspaceDocuments(workspaceDocuments.value, readString(workspaceDocumentQuery)),
  )

  const workspaceDocumentSectionIds = computed(() =>
    collectWorkspaceDocumentSectionIds(readArray(workspaceDocumentSections)),
  )

  const workspaceDocumentSectionViews = computed(() =>
    createWorkspaceDocumentSectionViews({
      sections: readArray(workspaceDocumentSections),
      documentsById: workspaceDocumentById.value,
      filteredDocuments: filteredWorkspaceDocuments.value,
    }),
  )

  const visibleWorkspaceDocumentSectionViews = computed(() =>
    filterVisibleWorkspaceDocumentSectionViews(
      workspaceDocumentSectionViews.value,
      readString(workspaceDocumentQuery),
    ),
  )

  const workspaceSectionedDocumentCount = computed(() =>
    countWorkspaceSectionedDocuments(workspaceDocumentSectionViews.value),
  )

  const favoriteWorkspaceDocuments = computed(() =>
    filterFavoriteWorkspaceDocuments(filteredWorkspaceDocuments.value, readArray(favoriteWorkspaceDocumentIds)),
  )

  const recentWorkspaceDocuments = computed(() =>
    listRecentWorkspaceDocuments(filteredWorkspaceDocuments.value, readArray(recentWorkspaceDocumentIds)),
  )

  const personalWorkspaceDocuments = computed(() =>
    filteredWorkspaceDocuments.value.filter((item) => item.scope === 'personal'),
  )

  const sharedWorkspaceDocuments = computed(() =>
    filteredWorkspaceDocuments.value.filter((item) => item.scope === 'shared'),
  )

  const unsectionedPersonalWorkspaceDocuments = computed(() =>
    filterUnsectionedWorkspaceDocuments(personalWorkspaceDocuments.value, workspaceDocumentSectionIds.value),
  )

  const unsectionedSharedWorkspaceDocuments = computed(() =>
    filterUnsectionedWorkspaceDocuments(sharedWorkspaceDocuments.value, workspaceDocumentSectionIds.value),
  )

  const linkedWorkspaceDocuments = computed(() =>
    createLinkedWorkspaceDocuments({
      documents: workspaceDocuments.value,
      searchText: readString(documentSearchText),
      links: readArray(documentWorkspaceLinks),
      currentId: readString(currentWorkspaceKey),
    }),
  )

  const linkedWorkspaceDocumentEmptyLabel = computed(() =>
    createLinkedWorkspaceDocumentEmptyLabel(workspaceDocuments.value.length),
  )

  const currentWorkspaceChildPages = computed(() =>
    listCurrentWorkspaceChildPages(readArray(workspacePageIndexRows), readString(currentWorkspaceKey)),
  )

  return {
    workspaceDocuments,
    workspaceDocumentById,
    workspacePageIndexRowById,
    workspacePageBreadcrumbTrail,
    currentWorkspaceParentPage,
    filteredWorkspaceDocuments,
    workspaceDocumentSectionIds,
    workspaceDocumentSectionViews,
    visibleWorkspaceDocumentSectionViews,
    workspaceSectionedDocumentCount,
    favoriteWorkspaceDocuments,
    recentWorkspaceDocuments,
    personalWorkspaceDocuments,
    sharedWorkspaceDocuments,
    unsectionedPersonalWorkspaceDocuments,
    unsectionedSharedWorkspaceDocuments,
    linkedWorkspaceDocuments,
    linkedWorkspaceDocumentEmptyLabel,
    currentWorkspaceChildPages,
  }
}