import { computed } from 'vue'

import {
  createWorkspacePageIndexOwnerFilterOptions,
  createWorkspacePageIndexOwnerOptions,
  createWorkspacePageIndexTagOptions,
  filterWorkspacePageIndexRows,
} from '../services/workspacePageIndex.js'

export const workspacePageIndexSortOptions = Object.freeze([
  { id: 'updated-desc', label: '최근 수정순' },
  { id: 'due-asc', label: '기한 빠른순' },
  { id: 'priority-desc', label: '우선순위 높은순' },
  { id: 'title-asc', label: '제목순' },
])

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}
const readString = (source) => String(resolveSource(source) || '')

export const useWorkspacePageIndexFilters = ({
  workspacePageIndexRows,
  workspacePageIndexFilter,
  workspacePageIndexQuery,
  workspacePageIndexTagFilter,
  workspacePageIndexOwnerFilter,
  workspacePageIndexSort,
  workspacePropertyOwnerCandidates,
  priorityOptions,
} = {}) => {
  const workspacePageIndexFilterOptions = computed(() => {
    const rows = readRows(workspacePageIndexRows)
    return [
      { id: 'all', label: '전체', count: rows.length },
      { id: 'active', label: '진행', count: rows.filter((row) => row.status === 'active').length },
      { id: 'blocked', label: '막힘', count: rows.filter((row) => row.status === 'blocked').length },
      { id: 'overdue', label: '기한 지남', count: rows.filter((row) => row.isOverdue).length },
      { id: 'shared', label: '공유', count: rows.filter((row) => row.scope === 'shared').length },
    ]
  })

  const workspacePageIndexTagOptions = computed(() =>
    createWorkspacePageIndexTagOptions(readRows(workspacePageIndexRows)),
  )

  const workspacePageIndexOwnerFilterOptions = computed(() =>
    createWorkspacePageIndexOwnerFilterOptions(readRows(workspacePageIndexRows)),
  )

  const visibleWorkspacePageIndexRows = computed(() =>
    filterWorkspacePageIndexRows(readRows(workspacePageIndexRows), {
      filter: readString(workspacePageIndexFilter),
      query: readString(workspacePageIndexQuery),
      tagFilter: readString(workspacePageIndexTagFilter),
      ownerFilter: readString(workspacePageIndexOwnerFilter),
      sort: readString(workspacePageIndexSort),
      priorityOptions: readRows(priorityOptions),
    }),
  )

  const workspacePageIndexOwnerOptions = (row = {}) =>
    createWorkspacePageIndexOwnerOptions(readRows(workspacePropertyOwnerCandidates), row)

  return {
    workspacePageIndexFilterOptions,
    workspacePageIndexSortOptions,
    workspacePageIndexTagOptions,
    workspacePageIndexOwnerFilterOptions,
    visibleWorkspacePageIndexRows,
    workspacePageIndexOwnerOptions,
  }
}
