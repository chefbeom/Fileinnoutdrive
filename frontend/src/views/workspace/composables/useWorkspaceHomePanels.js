import { computed } from 'vue'

import { createWorkspaceActivityItems } from '../services/workspaceActivity.js'
import {
  createWorkspaceHomeAttentionItems,
  createWorkspaceHomeMyQueue,
  createWorkspaceHomeRecentPages,
} from '../services/workspaceHome.js'
import {
  createWorkspaceMemberRows,
  createWorkspaceWorkloadRows,
  filterWorkspaceBlockedPages,
  filterWorkspaceUnassignedPages,
  filterWorkspaceUnassignedTasks,
} from '../services/workspacePeople.js'
import { createWorkspacePanelTabs } from '../services/workspaceCommands.js'
import { createWorkspaceHomeMetricCards } from '../services/workspaceOverview.js'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}
const readValue = (source, fallback = null) => resolveSource(source) ?? fallback
const readString = (source) => String(source?.value || '')
const readCurrentUser = (source) => readValue(source, {}) || {}

export const useWorkspaceHomePanels = ({
  workspaceMembers,
  currentUserIdx,
  activeWorkspaceUserIds,
  currentUser,
  activeUsers,
  workspacePageIndexRows,
  workspaceIndexedTasks,
  openWorkspaceIndexedTasks,
  myWorkspaceIndexedTasks,
  currentUserEmail,
  initialFor,
  documentStats,
  documentOutline,
  documentTaskSummaryLabel,
  openDocumentTasks,
  documentTaskProgress,
  unresolvedWorkspaceComments,
  resolvedWorkspaceComments,
  mentionedWorkspaceComments,
  workspaceAssets,
  workspaceImages,
  workspaceFiles,
  overdueWorkspaceCalendarItems,
  lastSavedAt,
  workspaceComments,
  workspaceMemberRefreshedAt,
  formatDateTimeFor,
  workspaceFullTextResults,
  quickBlockOptions = [],
  workspaceRelationCount,
  workspaceRevisionCount,
} = {}) => {
  const workspaceMemberRows = computed(() => createWorkspaceMemberRows({
    members: readRows(workspaceMembers),
    currentUserIdx: readValue(currentUserIdx),
    activeUserIds: readValue(activeWorkspaceUserIds, new Set()),
  }))

  const workspaceWorkloadRows = computed(() =>
    createWorkspaceWorkloadRows({
      currentUser: readCurrentUser(currentUser),
      memberRows: workspaceMemberRows.value,
      activeUsers: readRows(activeUsers),
      pageRows: readRows(workspacePageIndexRows),
      indexedTasks: readRows(workspaceIndexedTasks),
      currentUserEmail: readString(currentUserEmail),
      initialFor,
    }),
  )

  const workspaceUnassignedPages = computed(() =>
    filterWorkspaceUnassignedPages(readRows(workspacePageIndexRows)),
  )

  const workspaceUnassignedTasks = computed(() =>
    filterWorkspaceUnassignedTasks(readRows(openWorkspaceIndexedTasks)),
  )

  const workspaceBlockedPages = computed(() =>
    filterWorkspaceBlockedPages(readRows(workspacePageIndexRows)),
  )

  const workspaceHomeMetricCards = computed(() => createWorkspaceHomeMetricCards({
    documentStats: readValue(documentStats, {}),
    outlineCount: readRows(documentOutline).length,
    documentTaskSummaryLabel: readString(documentTaskSummaryLabel),
    openTaskCount: readRows(openDocumentTasks).length,
    documentTaskProgress: readValue(documentTaskProgress, 0),
    unresolvedCommentCount: readRows(unresolvedWorkspaceComments).length,
    resolvedCommentCount: readRows(resolvedWorkspaceComments).length,
    mentionedCommentCount: readRows(mentionedWorkspaceComments).length,
    assetCount: readRows(workspaceAssets).length,
    imageCount: readRows(workspaceImages).length,
    fileCount: readRows(workspaceFiles).length,
  }))

  const workspaceHomeMyQueue = computed(() =>
    createWorkspaceHomeMyQueue({
      pageRows: readRows(workspacePageIndexRows),
      myTasks: readRows(myWorkspaceIndexedTasks),
      currentUserEmail: readString(currentUserEmail),
    }),
  )

  const workspaceHomeAttentionItems = computed(() =>
    createWorkspaceHomeAttentionItems({
      mentionedComments: readRows(mentionedWorkspaceComments),
      overdueItems: readRows(overdueWorkspaceCalendarItems),
      blockedPages: workspaceBlockedPages.value,
      unassignedPages: workspaceUnassignedPages.value,
      unassignedTasks: workspaceUnassignedTasks.value,
    }),
  )

  const workspaceHomeRecentPages = computed(() =>
    createWorkspaceHomeRecentPages(readRows(workspacePageIndexRows)),
  )

  const workspaceActivityItems = computed(() => createWorkspaceActivityItems({
    lastSavedAt: readValue(lastSavedAt),
    comments: readRows(workspaceComments),
    assets: readRows(workspaceAssets),
    memberRefreshedAt: readValue(workspaceMemberRefreshedAt),
    memberCount: workspaceMemberRows.value.length,
    formatDateTimeFor,
  }))

  const workspacePanelTabs = computed(() => createWorkspacePanelTabs({
    homeAttentionCount: workspaceHomeAttentionItems.value.length,
    activeUserCount: readRows(activeUsers).length,
    activityCount: workspaceActivityItems.value.length,
    fullTextResultCount: readRows(workspaceFullTextResults).length,
    quickBlockCount: quickBlockOptions.length,
    openTaskCount: readRows(openDocumentTasks).length,
    outlineCount: readRows(documentOutline).length,
    relationCount: readValue(workspaceRelationCount, 0),
    revisionCount: readValue(workspaceRevisionCount, 0),
    unresolvedCommentCount: readRows(unresolvedWorkspaceComments).length,
    assetCount: readRows(workspaceAssets).length,
  }))

  return {
    workspaceMemberRows,
    workspaceWorkloadRows,
    workspaceUnassignedPages,
    workspaceUnassignedTasks,
    workspaceBlockedPages,
    workspaceHomeMetricCards,
    workspaceHomeMyQueue,
    workspaceHomeAttentionItems,
    workspaceHomeRecentPages,
    workspaceActivityItems,
    workspacePanelTabs,
  }
}
