const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readBoolean = (source) => Boolean(resolveSource(source))
const readString = (source) => String(resolveSource(source) || '')
const writeRef = (target, value) => {
  if (target && typeof target === 'object' && 'value' in target) {
    target.value = value
  }
}

export const useWorkspaceCommentComposer = ({
  canCommentOnWorkspace,
  activeWorkspacePanelTab,
  workspaceCommentFilter,
  workspaceCommentInput,
  newWorkspaceComment,
  showWorkspaceMentionMenu,
  isWorkspacePanelCollapsed,
  editorApi,
  workspaceBlockCommentSummaries,
  waitForDomUpdate = async () => {},
} = {}) => {
  const focusWorkspaceCommentComposer = async () => {
    if (!readBoolean(canCommentOnWorkspace)) return
    writeRef(activeWorkspacePanelTab, 'review')
    writeRef(workspaceCommentFilter, 'open')
    await waitForDomUpdate()
    resolveSource(workspaceCommentInput)?.focus?.()
    resolveSource(workspaceCommentInput)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }

  const focusWorkspaceMentionComments = async (comment = null) => {
    writeRef(isWorkspacePanelCollapsed, false)
    writeRef(activeWorkspacePanelTab, 'review')
    writeRef(workspaceCommentFilter, 'mentions')
    await waitForDomUpdate()
    if (comment?.anchorBlockId) {
      await resolveSource(editorApi)?.focusBlockAnchor?.(comment.anchorBlockId)
    }
  }

  const insertWorkspaceMention = async (candidate) => {
    const email = String(candidate?.email || '').trim()
    if (!email) return

    const mention = `@${email} `
    const textarea = resolveSource(workspaceCommentInput)
    const currentComment = readString(newWorkspaceComment)

    if (!textarea) {
      const spacer = currentComment && !currentComment.endsWith(' ') ? ' ' : ''
      writeRef(newWorkspaceComment, `${currentComment}${spacer}${mention}`)
      writeRef(showWorkspaceMentionMenu, false)
      return
    }

    const start = textarea.selectionStart ?? currentComment.length
    const end = textarea.selectionEnd ?? start
    const prefix = currentComment.slice(0, start)
    const suffix = currentComment.slice(end)
    const spacer = prefix && !/\s$/.test(prefix) ? ' ' : ''
    const nextValue = `${prefix}${spacer}${mention}${suffix}`
    const nextCaret = prefix.length + spacer.length + mention.length

    writeRef(newWorkspaceComment, nextValue)
    writeRef(showWorkspaceMentionMenu, false)
    await waitForDomUpdate()
    textarea.focus?.()
    textarea.setSelectionRange?.(nextCaret, nextCaret)
  }

  const applyWorkspaceBlockCommentSummaries = () => {
    resolveSource(editorApi)?.applyBlockCommentSummaries?.(resolveSource(workspaceBlockCommentSummaries))
  }

  const handleEditorBlockCommentBadgeClick = async (anchor) => {
    if (!anchor?.anchorBlockId) return
    writeRef(isWorkspacePanelCollapsed, false)
    writeRef(activeWorkspacePanelTab, 'review')
    writeRef(workspaceCommentFilter, 'block')
    await waitForDomUpdate()
    await resolveSource(editorApi)?.focusBlockAnchor?.(anchor.anchorBlockId)
  }

  return {
    focusWorkspaceCommentComposer,
    focusWorkspaceMentionComments,
    insertWorkspaceMention,
    applyWorkspaceBlockCommentSummaries,
    handleEditorBlockCommentBadgeClick,
  }
}
