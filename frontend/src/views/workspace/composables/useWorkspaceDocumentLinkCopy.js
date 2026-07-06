import { ref } from 'vue'

const defaultDocumentId = (document = {}) =>
  document?.id ?? document?.post_idx ?? null

export const useWorkspaceDocumentLinkCopy = ({
  documentIdFor = defaultDocumentId,
  setTimeoutFn = globalThis.window?.setTimeout ?? globalThis.setTimeout,
  clearTimeoutFn = globalThis.window?.clearTimeout ?? globalThis.clearTimeout,
  resetDelayMs = 1800,
} = {}) => {
  const workspaceDocumentLinkCopiedId = ref('')
  let workspaceDocumentLinkCopyTimer = null

  const documentLinkCopyKey = (document) => {
    const id = documentIdFor(document)
    return id == null ? '' : String(id)
  }

  const clearWorkspaceDocumentLinkCopyTimer = () => {
    if (!workspaceDocumentLinkCopyTimer) return
    clearTimeoutFn?.(workspaceDocumentLinkCopyTimer)
    workspaceDocumentLinkCopyTimer = null
  }

  const clearWorkspaceDocumentLinkCopied = () => {
    clearWorkspaceDocumentLinkCopyTimer()
    workspaceDocumentLinkCopiedId.value = ''
  }

  const markWorkspaceDocumentLinkCopied = (document) => {
    clearWorkspaceDocumentLinkCopyTimer()
    workspaceDocumentLinkCopiedId.value = documentLinkCopyKey(document)
    if (!workspaceDocumentLinkCopiedId.value) return
    if (resetDelayMs <= 0 || typeof setTimeoutFn !== 'function') return

    workspaceDocumentLinkCopyTimer = setTimeoutFn(() => {
      workspaceDocumentLinkCopiedId.value = ''
      workspaceDocumentLinkCopyTimer = null
    }, resetDelayMs)
  }

  const isWorkspaceDocumentLinkCopied = (document) => {
    const key = documentLinkCopyKey(document)
    return Boolean(key && workspaceDocumentLinkCopiedId.value === key)
  }

  return {
    workspaceDocumentLinkCopiedId,
    clearWorkspaceDocumentLinkCopyTimer,
    clearWorkspaceDocumentLinkCopied,
    markWorkspaceDocumentLinkCopied,
    isWorkspaceDocumentLinkCopied,
  }
}
