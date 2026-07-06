import { computed } from 'vue'

import {
  createWorkspacePageIndexViewId,
  createWorkspacePageIndexViewSummary,
  normalizeWorkspacePageIndexViewFilter,
  normalizeWorkspacePageIndexViewName,
  normalizeWorkspacePageIndexViewOwner,
  normalizeWorkspacePageIndexViews,
  normalizeWorkspacePageIndexViewSort,
  normalizeWorkspacePageIndexViewTag,
  workspacePageIndexViewSignature,
} from '../services/workspacePreferences.js'

export const useWorkspacePageIndexViews = ({
  workspacePageIndexViews,
  workspacePageIndexViewName,
  workspacePageIndexFilter,
  workspacePageIndexQuery,
  workspacePageIndexTagFilter,
  workspacePageIndexOwnerFilter,
  workspacePageIndexSort,
  workspacePageIndexFilterOptions,
  workspacePageIndexSortOptions = [],
  workspacePageIndexOwnerFilterOptions,
  persistWorkspacePageIndexViews = () => {},
} = {}) => {
  const currentWorkspacePageIndexViewSignature = computed(() =>
    workspacePageIndexViewSignature({
      filter: workspacePageIndexFilter?.value,
      query: workspacePageIndexQuery?.value,
      tag: workspacePageIndexTagFilter?.value,
      owner: workspacePageIndexOwnerFilter?.value,
      sort: workspacePageIndexSort?.value,
    }),
  )

  const activeWorkspacePageIndexView = computed(() =>
    workspacePageIndexViews?.value?.find(
      (view) => workspacePageIndexViewSignature(view) === currentWorkspacePageIndexViewSignature.value,
    ) || null,
  )

  const canCreateWorkspacePageIndexView = computed(() => {
    const name = normalizeWorkspacePageIndexViewName(workspacePageIndexViewName?.value)
    if (!name) return false
    return !(workspacePageIndexViews?.value || []).some((view) =>
      view.name.toLowerCase() === name.toLowerCase(),
    )
  })

  const createWorkspacePageIndexView = () => {
    const name = normalizeWorkspacePageIndexViewName(workspacePageIndexViewName?.value)
    if (!name || !canCreateWorkspacePageIndexView.value) return
    workspacePageIndexViews.value = normalizeWorkspacePageIndexViews([
      ...(workspacePageIndexViews.value || []),
      {
        id: createWorkspacePageIndexViewId(),
        name,
        filter: workspacePageIndexFilter?.value,
        query: workspacePageIndexQuery?.value,
        tag: workspacePageIndexTagFilter?.value,
        owner: workspacePageIndexOwnerFilter?.value,
        sort: workspacePageIndexSort?.value,
      },
    ])
    workspacePageIndexViewName.value = ''
    persistWorkspacePageIndexViews()
  }

  const applyWorkspacePageIndexView = (view) => {
    if (!view) return
    workspacePageIndexFilter.value = normalizeWorkspacePageIndexViewFilter(view.filter)
    workspacePageIndexQuery.value = String(view.query || '').trim()
    workspacePageIndexTagFilter.value = normalizeWorkspacePageIndexViewTag(view.tag)
    workspacePageIndexOwnerFilter.value = normalizeWorkspacePageIndexViewOwner(view.owner)
    workspacePageIndexSort.value = normalizeWorkspacePageIndexViewSort(view.sort)
  }

  const workspacePageIndexViewSummary = (view) =>
    createWorkspacePageIndexViewSummary(view, {
      filterOptions: workspacePageIndexFilterOptions?.value || [],
      sortOptions: workspacePageIndexSortOptions,
      ownerOptions: workspacePageIndexOwnerFilterOptions?.value || [],
    })

  const removeWorkspacePageIndexView = (view) => {
    if (!view?.id) return
    workspacePageIndexViews.value = (workspacePageIndexViews.value || [])
      .filter((item) => item.id !== view.id)
    persistWorkspacePageIndexViews()
  }

  return {
    currentWorkspacePageIndexViewSignature,
    activeWorkspacePageIndexView,
    canCreateWorkspacePageIndexView,
    createWorkspacePageIndexView,
    applyWorkspacePageIndexView,
    workspacePageIndexViewSummary,
    removeWorkspacePageIndexView,
  }
}
