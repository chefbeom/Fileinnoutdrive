import { computed } from 'vue'

import {
  countWorkspaceBlockComments,
  createWorkspaceBlockCommentSummaries,
  createWorkspaceCommentFilters,
  filterWorkspaceComments,
  filterWorkspaceMentionedComments,
  getWorkspaceCommentEmptyLabel,
  isWorkspaceCommentMentioningEmail,
  splitWorkspaceComments,
} from '../services/workspaceComments.js'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}
const readString = (source) => String(resolveSource(source) || '')
const readValue = (source, fallback = null) => resolveSource(source) ?? fallback

export const useWorkspaceCommentPanel = ({
  workspaceComments,
  currentUserEmail,
  selectedBlockAnchor,
  workspaceCommentFilter,
} = {}) => {
  const workspaceCommentGroups = computed(() =>
    splitWorkspaceComments(readRows(workspaceComments)),
  )

  const unresolvedWorkspaceComments = computed(() => workspaceCommentGroups.value.unresolved)
  const resolvedWorkspaceComments = computed(() => workspaceCommentGroups.value.resolved)

  const isWorkspaceCommentMentioningCurrentUser = (comment = {}) =>
    isWorkspaceCommentMentioningEmail(comment, readString(currentUserEmail))

  const mentionedWorkspaceComments = computed(() =>
    filterWorkspaceMentionedComments(unresolvedWorkspaceComments.value, readString(currentUserEmail)),
  )

  const selectedBlockCommentCount = computed(() =>
    countWorkspaceBlockComments(unresolvedWorkspaceComments.value, readValue(selectedBlockAnchor)),
  )

  const workspaceBlockCommentSummaries = computed(() =>
    createWorkspaceBlockCommentSummaries(unresolvedWorkspaceComments.value),
  )

  const visibleWorkspaceComments = computed(() =>
    filterWorkspaceComments({
      filter: readString(workspaceCommentFilter) || 'open',
      unresolvedComments: unresolvedWorkspaceComments.value,
      resolvedComments: resolvedWorkspaceComments.value,
      mentionedComments: mentionedWorkspaceComments.value,
      selectedBlockAnchor: readValue(selectedBlockAnchor),
    }),
  )

  const workspaceCommentFilters = computed(() =>
    createWorkspaceCommentFilters({
      mentionedCount: mentionedWorkspaceComments.value.length,
      unresolvedCount: unresolvedWorkspaceComments.value.length,
      blockCount: selectedBlockCommentCount.value,
      resolvedCount: resolvedWorkspaceComments.value.length,
      currentUserEmail: readString(currentUserEmail),
      selectedBlockAnchor: readValue(selectedBlockAnchor),
    }),
  )

  const workspaceCommentEmptyLabel = computed(() =>
    getWorkspaceCommentEmptyLabel({
      filter: readString(workspaceCommentFilter) || 'open',
      currentUserEmail: readString(currentUserEmail),
      selectedBlockAnchor: readValue(selectedBlockAnchor),
    }),
  )

  return {
    workspaceCommentGroups,
    unresolvedWorkspaceComments,
    resolvedWorkspaceComments,
    isWorkspaceCommentMentioningCurrentUser,
    mentionedWorkspaceComments,
    selectedBlockCommentCount,
    workspaceBlockCommentSummaries,
    visibleWorkspaceComments,
    workspaceCommentFilters,
    workspaceCommentEmptyLabel,
  }
}
