import { computed } from 'vue'

import {
  calculateWorkspaceTaskProgress,
  createWorkspaceTaskFilterOptions,
  createWorkspaceTaskSummaryLabel,
  filterCompletedWorkspaceTasks,
  filterOpenWorkspaceTasks,
  filterOverdueWorkspaceTasks,
  filterWorkspaceTasksByMode,
  getWorkspaceTaskEmptyLabel,
  workspaceTaskTodayKey,
} from '../services/workspaceTasks.js'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}
const readString = (source) => String(resolveSource(source) || '')
const readBoolean = (source) => Boolean(resolveSource(source))

export const useWorkspaceTaskPanel = ({
  documentTasks,
  currentUserEmail,
  workspaceTaskFilter,
  canModifyWorkspacePage,
  workspaceTaskAdding,
  newWorkspaceTask,
  todayKey = workspaceTaskTodayKey,
} = {}) => {
  const openDocumentTasks = computed(() => filterOpenWorkspaceTasks(readRows(documentTasks)))
  const completedDocumentTasks = computed(() => filterCompletedWorkspaceTasks(readRows(documentTasks)))
  const overdueDocumentTasks = computed(() => filterOverdueWorkspaceTasks(readRows(documentTasks), todayKey()))
  const documentTaskProgress = computed(() => calculateWorkspaceTaskProgress(readRows(documentTasks)))
  const documentTaskSummaryLabel = computed(() => createWorkspaceTaskSummaryLabel(readRows(documentTasks)))

  const myDocumentTasks = computed(() => {
    const email = readString(currentUserEmail).toLowerCase()
    return email
      ? readRows(documentTasks).filter((task) => String(task.assigneeEmail || '').toLowerCase() === email)
      : []
  })

  const visibleDocumentTasks = computed(() =>
    filterWorkspaceTasksByMode({
      filter: readString(workspaceTaskFilter),
      allTasks: readRows(documentTasks),
      openTasks: openDocumentTasks.value,
      assignedTasks: myDocumentTasks.value,
      completedTasks: completedDocumentTasks.value,
      overdueTasks: overdueDocumentTasks.value,
    }),
  )

  const workspaceTaskFilterOptions = computed(() =>
    createWorkspaceTaskFilterOptions({
      allTasks: readRows(documentTasks),
      openTasks: openDocumentTasks.value,
      assignedTasks: myDocumentTasks.value,
      completedTasks: completedDocumentTasks.value,
      overdueTasks: overdueDocumentTasks.value,
    }),
  )

  const workspaceTaskEmptyLabel = computed(() =>
    getWorkspaceTaskEmptyLabel({
      taskCount: readRows(documentTasks).length,
      filter: readString(workspaceTaskFilter),
    }),
  )

  const canAddWorkspaceTask = computed(() =>
    readBoolean(canModifyWorkspacePage) &&
    !readBoolean(workspaceTaskAdding) &&
    readString(newWorkspaceTask).trim().length > 0,
  )

  return {
    openDocumentTasks,
    completedDocumentTasks,
    overdueDocumentTasks,
    documentTaskProgress,
    documentTaskSummaryLabel,
    myDocumentTasks,
    visibleDocumentTasks,
    workspaceTaskFilterOptions,
    workspaceTaskEmptyLabel,
    canAddWorkspaceTask,
  }
}
