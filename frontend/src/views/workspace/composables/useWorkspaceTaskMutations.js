import {
  parseWorkspaceSnapshotWithMeta,
  resolveWorkspaceSnapshotTaskItem,
} from '../services/workspaceSnapshot.js'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const setSourceValue = (source, value) => {
  if (source && typeof source === 'object' && 'value' in source) source.value = value
}
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}
const readString = (source) => String(resolveSource(source) || '')
const readBoolean = (source) => Boolean(resolveSource(source))
const errorMessage = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback

const setBusyId = (source, id, busy) => {
  const key = String(id || '')
  if (!key) return
  const currentIds = readRows(source).map((item) => String(item || '')).filter(Boolean)
  setSourceValue(source, busy
    ? [...new Set([...currentIds, key])]
    : currentIds.filter((item) => item !== key))
}

export const useWorkspaceTaskMutations = ({
  togglingWorkspaceTaskIds,
  togglingWorkspaceInboxTaskIds,
  canModifyWorkspacePage,
  editorApi,
  currentWorkspaceKey,
  fetchWorkspaceDocument,
  saveWorkspaceDocument,
  persistWorkspace,
  refreshWorkspaceDocuments,
  refreshWorkspacePageIndex,
  focusWorkspaceTaskItem,
  showWorkspaceNotice,
  newWorkspaceTask,
  selectedWorkspaceTaskAssignee,
  newWorkspaceTaskDueDate,
  workspaceTaskAdding,
} = {}) => {
  const isWorkspaceTaskToggling = (task) =>
    Boolean(task?.id) && readRows(togglingWorkspaceTaskIds).includes(String(task.id))

  const isWorkspaceInboxTaskToggling = (task) =>
    Boolean(task?.id) && readRows(togglingWorkspaceInboxTaskIds).includes(String(task.id))

  const setWorkspaceInboxTaskToggling = (task, busy) => {
    setBusyId(togglingWorkspaceInboxTaskIds, task?.id, busy)
  }

  const toggleWorkspaceTaskItem = async (task) => {
    if (!task?.id || !readBoolean(canModifyWorkspacePage) || isWorkspaceTaskToggling(task)) return false

    setBusyId(togglingWorkspaceTaskIds, task.id, true)
    try {
      const toggled = await resolveSource(editorApi)?.toggleChecklistTask?.(task)
      if (!toggled) {
        await focusWorkspaceTaskItem?.(task)
      }
      return Boolean(toggled)
    } catch (error) {
      console.error('Workspace task toggle failed:', error)
      return false
    } finally {
      setBusyId(togglingWorkspaceTaskIds, task.id, false)
    }
  }

  const toggleWorkspaceInboxTask = async (task) => {
    const documentId = task?.documentId
    if (!task?.id || !documentId || isWorkspaceInboxTaskToggling(task)) return false
    const role = String(task.documentRole || task.document?.accessRole || task.document?.role || 'READ').toUpperCase()
    if (!task.canToggle && !['ADMIN', 'WRITE'].includes(role)) return false

    setWorkspaceInboxTaskToggling(task, true)
    try {
      if (String(documentId) === readString(currentWorkspaceKey)) {
        const toggled = await resolveSource(editorApi)?.toggleChecklistTask?.(task)
        if (toggled) {
          await persistWorkspace?.({ navigateNewDocument: false })
          await refreshWorkspacePageIndex?.()
        }
        return Boolean(toggled)
      }

      const data = await fetchWorkspaceDocument?.(documentId)
      const snapshot = parseWorkspaceSnapshotWithMeta(data?.contents)
      const item = resolveWorkspaceSnapshotTaskItem(snapshot.blocks, task)
      if (!item) throw new Error('작업 위치를 찾을 수 없습니다.')

      item.meta = {
        ...(item.meta || {}),
        checked: !task.checked,
      }
      if (Object.prototype.hasOwnProperty.call(item, 'checked')) {
        item.checked = !task.checked
      }
      if (item.data && typeof item.data === 'object' && Object.prototype.hasOwnProperty.call(item.data, 'checked')) {
        item.data.checked = !task.checked
      }

      await saveWorkspaceDocument?.({
        idx: documentId,
        title: data?.title || task.documentTitle || '제목 없음',
        contents: JSON.stringify(snapshot),
      })
      await refreshWorkspaceDocuments?.()
      await refreshWorkspacePageIndex?.()
      return true
    } catch (error) {
      console.error('Workspace inbox task toggle failed:', error)
      showWorkspaceNotice?.(errorMessage(error, '작업 상태를 변경하지 못했습니다.'), 'error')
      return false
    } finally {
      setWorkspaceInboxTaskToggling(task, false)
    }
  }

  const toggleWorkspaceCalendarTask = async (item) => {
    if (item?.type !== 'task' || !item.task) return false
    return toggleWorkspaceInboxTask(item.task)
  }

  const addWorkspaceTask = async () => {
    const text = readString(newWorkspaceTask).trim()
    if (!text || !readBoolean(canModifyWorkspacePage) || readBoolean(workspaceTaskAdding)) return false

    setSourceValue(workspaceTaskAdding, true)
    try {
      const assignee = resolveSource(selectedWorkspaceTaskAssignee)
      const added = await resolveSource(editorApi)?.appendChecklistTask?.({
        text,
        assigneeEmail: assignee?.email || '',
        assigneeName: assignee?.name || '',
        dueDate: readString(newWorkspaceTaskDueDate),
      })
      if (added) {
        setSourceValue(newWorkspaceTask, '')
        return true
      }

      showWorkspaceNotice?.('작업 항목을 추가하지 못했습니다.', 'error')
      return false
    } catch (error) {
      console.error('Workspace task append failed:', error)
      showWorkspaceNotice?.(errorMessage(error, '작업 항목을 추가하지 못했습니다.'), 'error')
      return false
    } finally {
      setSourceValue(workspaceTaskAdding, false)
    }
  }

  return {
    isWorkspaceTaskToggling,
    isWorkspaceInboxTaskToggling,
    setWorkspaceInboxTaskToggling,
    toggleWorkspaceTaskItem,
    toggleWorkspaceInboxTask,
    toggleWorkspaceCalendarTask,
    addWorkspaceTask,
  }
}
