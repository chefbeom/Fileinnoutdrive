import { ref, unref } from 'vue'

const defaultDocumentId = (document = {}) =>
  document?.id ?? document?.post_idx ?? null

const noop = () => {}

const defaultMessages = {
  untitled: 'Untitled',
  copySuffix: 'Copy',
  duplicateError: 'Failed to duplicate the document.',
  removeError: 'Failed to update the document.',
  deleteTitle: 'Delete document',
  removeTitle: 'Remove from list',
  deleteConfirmLabel: 'Delete',
  removeConfirmLabel: 'Remove',
  deleted: 'Document deleted.',
  removed: 'Removed from list.',
  deleteMessageFor: (document, title) =>
    `"${title}" document will be deleted. This cannot be undone.`,
  removeMessageFor: (document, title) =>
    `"${title}" document will be removed from the list.`,
}

const resolveValue = (value) => {
  if (typeof value === 'function') return value()
  return unref(value)
}

const copiedDocumentIdFrom = (response = {}) =>
  response?.result?.body?.idx ?? response?.data?.idx ?? response?.idx ?? null

export const useWorkspaceDocumentActions = ({
  api,
  router,
  currentWorkspaceKey = '',
  documentIdFor = defaultDocumentId,
  confirmDiscardIfNeeded = () => true,
  allowNextRouteLeave = noop,
  refreshWorkspaceDocuments = noop,
  requestWorkspaceConfirm = noop,
  showWorkspaceNotice = noop,
  messages = {},
} = {}) => {
  const documentActionLoading = ref('')
  const actionMessages = { ...defaultMessages, ...messages }

  const documentActionKey = (document, action) => `${action}:${documentIdFor(document) ?? 'new'}`

  const isDocumentActionLoading = (document, action) =>
    documentActionLoading.value === documentActionKey(document, action)

  const duplicateWorkspaceDocument = async (document) => {
    const id = documentIdFor(document)
    if (!id || isDocumentActionLoading(document, 'duplicate')) return
    if (!confirmDiscardIfNeeded()) return

    documentActionLoading.value = documentActionKey(document, 'duplicate')
    try {
      const source = await api.getPost(id)
      const sourceTitle = source?.title || document?.title || actionMessages.untitled
      const response = await api.savePost({
        idx: null,
        title: `${sourceTitle} ${actionMessages.copySuffix}`,
        contents: source?.contents || '',
      })
      const copiedId = copiedDocumentIdFrom(response)
      await refreshWorkspaceDocuments()
      if (copiedId) {
        allowNextRouteLeave()
        await router.push(`/workspace/read/${copiedId}`)
      }
    } catch (error) {
      showWorkspaceNotice(error?.message || actionMessages.duplicateError, 'error')
    } finally {
      documentActionLoading.value = ''
    }
  }

  const removeWorkspaceDocument = async (document) => {
    const id = documentIdFor(document)
    if (!id || isDocumentActionLoading(document, 'remove')) return

    const role = String(document?.role || 'READ').toUpperCase()
    const shouldDeleteWorkspace = role === 'ADMIN'
    const title = document?.title || actionMessages.untitled

    requestWorkspaceConfirm({
      title: shouldDeleteWorkspace ? actionMessages.deleteTitle : actionMessages.removeTitle,
      message: shouldDeleteWorkspace
        ? actionMessages.deleteMessageFor(document, title)
        : actionMessages.removeMessageFor(document, title),
      confirmLabel: shouldDeleteWorkspace
        ? actionMessages.deleteConfirmLabel
        : actionMessages.removeConfirmLabel,
      tone: shouldDeleteWorkspace ? 'danger' : 'warn',
      onConfirm: async () => {
        documentActionLoading.value = documentActionKey(document, 'remove')
        try {
          if (shouldDeleteWorkspace) {
            await api.deletePost(id)
          } else {
            await api.list_delete(id)
          }
          await refreshWorkspaceDocuments()
          showWorkspaceNotice(shouldDeleteWorkspace ? actionMessages.deleted : actionMessages.removed, 'success')
          if (String(id) === String(resolveValue(currentWorkspaceKey))) {
            allowNextRouteLeave()
            await router.replace('/workspace')
          }
        } catch (error) {
          showWorkspaceNotice(error?.message || actionMessages.removeError, 'error')
        } finally {
          documentActionLoading.value = ''
        }
      },
    })
  }

  return {
    documentActionLoading,
    documentActionKey,
    isDocumentActionLoading,
    duplicateWorkspaceDocument,
    removeWorkspaceDocument,
  }
}
