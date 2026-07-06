const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readString = (source) => String(resolveSource(source) || '')
const writeRef = (target, value) => {
  if (target && typeof target === 'object' && 'value' in target) {
    target.value = value
  }
}

export const useWorkspaceFocusNavigation = ({
  editorApi,
  currentWorkspaceKey,
  isWorkspacePanelCollapsed,
  activeWorkspacePanelTab,
  openWorkspaceDocument = async () => {},
  focusWorkspaceMentionComments = async () => {},
} = {}) => {
  const focusBlockAnchor = async (anchorBlockId) => {
    if (!anchorBlockId) return
    await resolveSource(editorApi)?.focusBlockAnchor?.(anchorBlockId)
  }

  const focusWorkspaceOutlineItem = async (item) => {
    await focusBlockAnchor(item?.anchorBlockId)
  }

  const focusWorkspaceTaskItem = async (task) => {
    await focusBlockAnchor(task?.anchorBlockId)
  }

  const focusWorkspaceInboxTask = async (task) => {
    if (!task?.documentId) return
    if (String(task.documentId) === readString(currentWorkspaceKey)) {
      await focusWorkspaceTaskItem(task)
      return
    }
    await openWorkspaceDocument(task.document || { id: task.documentId, title: task.documentTitle })
  }

  const openWorkspaceCalendarItem = async (item) => {
    if (!item) return
    if (item.type === 'task') {
      await focusWorkspaceInboxTask(item.task)
      return
    }
    await openWorkspaceDocument(item.document)
  }

  const openWorkspaceHomeMetric = (card) => {
    if (!card?.panel) return
    writeRef(isWorkspacePanelCollapsed, false)
    writeRef(activeWorkspacePanelTab, card.panel)
  }

  const openWorkspaceHomeQueueItem = async (item) => {
    if (!item) return
    if (item.type === 'task') {
      await focusWorkspaceInboxTask(item.task)
      return
    }
    await openWorkspaceDocument(item.page)
  }

  const openWorkspaceHomeAttentionItem = async (item) => {
    if (!item) return
    if (item.comment) {
      await focusWorkspaceMentionComments(item.comment)
      return
    }
    if (item.item) {
      await openWorkspaceCalendarItem(item.item)
      return
    }
    if (item.task) {
      await focusWorkspaceInboxTask(item.task)
      return
    }
    if (item.page) {
      await openWorkspaceDocument(item.page)
    }
  }

  const focusWorkspaceLinkedDocumentSource = async (document) => {
    await focusBlockAnchor(document?.linkAnchorBlockId)
  }

  return {
    focusWorkspaceOutlineItem,
    focusWorkspaceTaskItem,
    focusWorkspaceInboxTask,
    openWorkspaceCalendarItem,
    openWorkspaceHomeMetric,
    openWorkspaceHomeQueueItem,
    openWorkspaceHomeAttentionItem,
    focusWorkspaceLinkedDocumentSource,
  }
}
