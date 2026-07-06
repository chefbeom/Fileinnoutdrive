import { computed } from 'vue'

import {
  createWorkspaceCalendarFilterOptions,
  createWorkspaceCalendarItems,
  createWorkspaceTimelineFilterOptions,
  createWorkspaceTimelineItems,
  createWorkspaceTimelineRange,
  filterWorkspaceCalendarItems,
  filterWorkspaceTimelineItems,
  getWorkspaceCalendarEmptyLabel,
  getWorkspaceTimelineEmptyLabel,
  groupWorkspaceCalendarItems,
  groupWorkspaceTimelineItems,
  workspaceTimelineItemOffsetStyle,
} from '../services/workspaceSchedule.js'
import {
  createWorkspaceInboxFilterOptions,
  filterWorkspaceTasksByMode,
  getWorkspaceInboxEmptyLabel,
  workspaceTaskTodayKey,
} from '../services/workspaceTasks.js'

const readRows = (source) => (Array.isArray(source?.value) ? source.value : [])
const readString = (source) => String(source?.value || '')

export const useWorkspacePlanningPanels = ({
  workspacePageIndexRows,
  visibleWorkspacePageIndexRows,
  workspaceInboxFilter,
  workspaceCalendarFilter,
  workspaceTimelineFilter,
  currentWorkspaceKey,
  currentUserEmail,
  statusOptions = [],
  todayKey = workspaceTaskTodayKey,
} = {}) => {
  const workspaceBoardRows = computed(() => readRows(visibleWorkspacePageIndexRows))

  const workspaceBoardColumns = computed(() =>
    statusOptions.map((option) => {
      const rows = workspaceBoardRows.value
        .filter((row) => row.status === option.id)
        .sort((left, right) => {
          const leftDue = left.dueDate || '9999-12-31'
          const rightDue = right.dueDate || '9999-12-31'
          if (leftDue !== rightDue) return leftDue.localeCompare(rightDue)
          return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
        })

      return {
        ...option,
        rows,
        openTaskCount: rows.reduce(
          (total, row) => total + (row.workspaceTasks || []).filter((task) => !task.checked).length,
          0,
        ),
      }
    }),
  )

  const workspaceIndexedTasks = computed(() => {
    const activeDocumentId = readString(currentWorkspaceKey)
    const activeUserEmail = readString(currentUserEmail).toLowerCase()

    return readRows(workspacePageIndexRows).flatMap((row) =>
      (Array.isArray(row.workspaceTasks) ? row.workspaceTasks : []).map((task) => ({
        ...task,
        documentId: row.id,
        documentTitle: row.title,
        documentScope: row.scope,
        documentRole: row.accessRole || row.role,
        documentUpdatedAt: row.updatedAt,
        document: row,
        scopeLabel: row.scopeLabel,
        roleLabel: row.roleLabel,
        updatedLabel: row.updatedLabel,
        isCurrentDocument: String(row.id || '') === activeDocumentId,
        canToggle: !row.locked && ['ADMIN', 'WRITE'].includes(String(row.accessRole || row.role || '').toUpperCase()),
        isMine: activeUserEmail
          ? String(task.assigneeEmail || '').toLowerCase() === activeUserEmail
          : false,
      })),
    )
  })

  const openWorkspaceIndexedTasks = computed(() =>
    workspaceIndexedTasks.value.filter((task) => !task.checked),
  )

  const completedWorkspaceIndexedTasks = computed(() =>
    workspaceIndexedTasks.value.filter((task) => task.checked),
  )

  const overdueWorkspaceIndexedTasks = computed(() =>
    workspaceIndexedTasks.value.filter((task) => task.isOverdue),
  )

  const myWorkspaceIndexedTasks = computed(() =>
    readString(currentUserEmail)
      ? openWorkspaceIndexedTasks.value.filter((task) => task.isMine)
      : [],
  )

  const workspaceCalendarItems = computed(() =>
    createWorkspaceCalendarItems(
      readRows(workspacePageIndexRows),
      workspaceIndexedTasks.value,
      readString(currentUserEmail),
    ),
  )

  const openWorkspaceCalendarItems = computed(() =>
    filterWorkspaceCalendarItems(workspaceCalendarItems.value, 'open'),
  )

  const overdueWorkspaceCalendarItems = computed(() =>
    filterWorkspaceCalendarItems(workspaceCalendarItems.value, 'overdue'),
  )

  const upcomingWorkspaceCalendarItems = computed(() =>
    filterWorkspaceCalendarItems(workspaceCalendarItems.value, 'upcoming', todayKey()),
  )

  const myWorkspaceCalendarItems = computed(() =>
    filterWorkspaceCalendarItems(workspaceCalendarItems.value, 'mine'),
  )

  const workspaceCalendarFilterOptions = computed(() =>
    createWorkspaceCalendarFilterOptions({
      allItems: workspaceCalendarItems.value,
      upcomingItems: upcomingWorkspaceCalendarItems.value,
      overdueItems: overdueWorkspaceCalendarItems.value,
      myItems: myWorkspaceCalendarItems.value,
    }),
  )

  const visibleWorkspaceCalendarItems = computed(() =>
    filterWorkspaceCalendarItems(workspaceCalendarItems.value, readString(workspaceCalendarFilter), todayKey()),
  )

  const workspaceCalendarGroups = computed(() =>
    groupWorkspaceCalendarItems(visibleWorkspaceCalendarItems.value, { todayKey: todayKey() }),
  )

  const workspaceCalendarEmptyLabel = computed(() =>
    getWorkspaceCalendarEmptyLabel({
      itemCount: workspaceCalendarItems.value.length,
      filter: readString(workspaceCalendarFilter),
    }),
  )

  const workspaceTimelineItems = computed(() =>
    createWorkspaceTimelineItems(workspaceCalendarItems.value),
  )

  const openWorkspaceTimelineItems = computed(() =>
    filterWorkspaceTimelineItems(workspaceTimelineItems.value, 'open'),
  )

  const overdueWorkspaceTimelineItems = computed(() =>
    filterWorkspaceTimelineItems(workspaceTimelineItems.value, 'overdue'),
  )

  const myWorkspaceTimelineItems = computed(() =>
    filterWorkspaceTimelineItems(workspaceTimelineItems.value, 'mine'),
  )

  const workspaceTimelineFilterOptions = computed(() =>
    createWorkspaceTimelineFilterOptions({
      allItems: workspaceTimelineItems.value,
      openItems: openWorkspaceTimelineItems.value,
      overdueItems: overdueWorkspaceTimelineItems.value,
      myItems: myWorkspaceTimelineItems.value,
    }),
  )

  const visibleWorkspaceTimelineItems = computed(() =>
    filterWorkspaceTimelineItems(workspaceTimelineItems.value, readString(workspaceTimelineFilter)),
  )

  const workspaceTimelineRange = computed(() =>
    createWorkspaceTimelineRange(visibleWorkspaceTimelineItems.value),
  )

  const workspaceTimelineGroups = computed(() =>
    groupWorkspaceTimelineItems(visibleWorkspaceTimelineItems.value),
  )

  const workspaceTimelineItemStyle = (item) =>
    workspaceTimelineItemOffsetStyle(item, workspaceTimelineRange.value)

  const workspaceTimelineEmptyLabel = computed(() =>
    getWorkspaceTimelineEmptyLabel({
      itemCount: workspaceTimelineItems.value.length,
      filter: readString(workspaceTimelineFilter),
    }),
  )

  const workspaceInboxFilterOptions = computed(() =>
    createWorkspaceInboxFilterOptions({
      allTasks: workspaceIndexedTasks.value,
      openTasks: openWorkspaceIndexedTasks.value,
      assignedTasks: myWorkspaceIndexedTasks.value,
      completedTasks: completedWorkspaceIndexedTasks.value,
      overdueTasks: overdueWorkspaceIndexedTasks.value,
    }),
  )

  const visibleWorkspaceInboxTasks = computed(() =>
    filterWorkspaceTasksByMode({
      filter: readString(workspaceInboxFilter),
      allTasks: workspaceIndexedTasks.value,
      openTasks: openWorkspaceIndexedTasks.value,
      assignedTasks: myWorkspaceIndexedTasks.value,
      completedTasks: completedWorkspaceIndexedTasks.value,
      overdueTasks: overdueWorkspaceIndexedTasks.value,
    }),
  )

  const workspaceInboxEmptyLabel = computed(() =>
    getWorkspaceInboxEmptyLabel({
      taskCount: workspaceIndexedTasks.value.length,
      filter: readString(workspaceInboxFilter),
    }),
  )

  return {
    workspaceBoardRows,
    workspaceBoardColumns,
    workspaceIndexedTasks,
    openWorkspaceIndexedTasks,
    completedWorkspaceIndexedTasks,
    overdueWorkspaceIndexedTasks,
    myWorkspaceIndexedTasks,
    workspaceCalendarItems,
    openWorkspaceCalendarItems,
    overdueWorkspaceCalendarItems,
    upcomingWorkspaceCalendarItems,
    myWorkspaceCalendarItems,
    workspaceCalendarFilterOptions,
    visibleWorkspaceCalendarItems,
    workspaceCalendarGroups,
    workspaceCalendarEmptyLabel,
    workspaceTimelineItems,
    openWorkspaceTimelineItems,
    overdueWorkspaceTimelineItems,
    myWorkspaceTimelineItems,
    workspaceTimelineFilterOptions,
    visibleWorkspaceTimelineItems,
    workspaceTimelineRange,
    workspaceTimelineGroups,
    workspaceTimelineItemStyle,
    workspaceTimelineEmptyLabel,
    workspaceInboxFilterOptions,
    visibleWorkspaceInboxTasks,
    workspaceInboxEmptyLabel,
  }
}
