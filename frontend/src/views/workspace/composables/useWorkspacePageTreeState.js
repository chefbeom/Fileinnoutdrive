import { computed, ref } from 'vue'

import {
  buildWorkspacePageTreeRoots,
  filterWorkspacePageTreeNodes,
  flattenWorkspacePageTreeRows,
  normalizeWorkspaceLinkText,
  workspacePageTreeEmptyLabel as createWorkspacePageTreeEmptyLabel,
} from '../services/workspacePageTree.js'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}
const readString = (source) => String(resolveSource(source) || '')

export const useWorkspacePageTreeState = ({
  workspacePageIndexRows,
  currentWorkspaceKey,
} = {}) => {
  const workspacePageTreeQuery = ref('')
  const collapsedWorkspacePageTreeIds = ref([])

  const workspacePageTreeCollapsedIdSet = computed(() =>
    new Set(collapsedWorkspacePageTreeIds.value.map((id) => String(id))),
  )
  const workspacePageTreeRoots = computed(() =>
    buildWorkspacePageTreeRoots(readRows(workspacePageIndexRows), readString(currentWorkspaceKey)),
  )
  const workspacePageTreeFlatRows = computed(() =>
    flattenWorkspacePageTreeRows(workspacePageTreeRoots.value, workspacePageTreeCollapsedIdSet.value),
  )
  const workspacePageTreeAllRows = computed(() =>
    flattenWorkspacePageTreeRows(workspacePageTreeRoots.value),
  )
  const workspacePageTreeVisibleRows = computed(() => {
    const query = normalizeWorkspaceLinkText(workspacePageTreeQuery.value)
    if (!query) return workspacePageTreeFlatRows.value
    return filterWorkspacePageTreeNodes(workspacePageTreeRoots.value, query)
  })
  const workspacePageTreeEmptyLabel = computed(() =>
    createWorkspacePageTreeEmptyLabel({
      rowCount: workspacePageTreeAllRows.value.length,
      query: workspacePageTreeQuery.value,
    }),
  )

  const toggleWorkspacePageTreeNode = (node) => {
    if (!node?.childCount) return
    const nodeId = String(node.id)
    collapsedWorkspacePageTreeIds.value = workspacePageTreeCollapsedIdSet.value.has(nodeId)
      ? collapsedWorkspacePageTreeIds.value.filter((id) => String(id) !== nodeId)
      : [...collapsedWorkspacePageTreeIds.value, nodeId]
  }

  return {
    workspacePageTreeQuery,
    collapsedWorkspacePageTreeIds,
    workspacePageTreeCollapsedIdSet,
    workspacePageTreeRoots,
    workspacePageTreeFlatRows,
    workspacePageTreeAllRows,
    workspacePageTreeVisibleRows,
    workspacePageTreeEmptyLabel,
    toggleWorkspacePageTreeNode,
  }
}
