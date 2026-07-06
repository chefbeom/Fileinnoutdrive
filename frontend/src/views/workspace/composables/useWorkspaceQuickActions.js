import { computed } from 'vue'

const INLINE_QUICK_BLOCK_IDS = new Set(['paragraph', 'header', 'checklist', 'quote', 'warning', 'table'])

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}
const readBoolean = (source) => Boolean(resolveSource(source))
const readString = (source) => String(resolveSource(source) || '')

export const useWorkspaceQuickActions = ({
  editorApi,
  quickBlockOptions,
  canModifyWorkspacePage,
  isEditorLoading,
  workspaceSubpageCreating,
  workspaceSubpageTitle,
} = {}) => {
  const canInsertWorkspaceQuickBlock = computed(() =>
    readBoolean(canModifyWorkspacePage) &&
    !readBoolean(isEditorLoading) &&
    Boolean(resolveSource(editorApi)?.appendWorkspaceBlock),
  )

  const workspaceInlineQuickBlockOptions = computed(() =>
    readRows(quickBlockOptions).filter((block) => INLINE_QUICK_BLOCK_IDS.has(block?.id)),
  )

  const canStartWorkspaceSubpage = computed(() =>
    readBoolean(canModifyWorkspacePage) &&
    !readBoolean(isEditorLoading) &&
    Boolean(resolveSource(editorApi)?.appendWorkspacePageLink),
  )

  const canCreateWorkspaceSubpage = computed(() =>
    canStartWorkspaceSubpage.value &&
    !readBoolean(workspaceSubpageCreating) &&
    readString(workspaceSubpageTitle).trim().length > 0,
  )

  return {
    canInsertWorkspaceQuickBlock,
    workspaceInlineQuickBlockOptions,
    canStartWorkspaceSubpage,
    canCreateWorkspaceSubpage,
  }
}
