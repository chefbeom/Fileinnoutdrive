import { nextTick, ref } from 'vue'

import {
  canApplyWorkspaceTreeMoveTarget,
  createWorkspaceTreeMoveTargetOptions,
} from '../services/workspacePageTree.js'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}

const resolveTemplateRef = (source) => {
  const value = source?.value
  return Array.isArray(value) ? value[0] : value
}

const toIdSet = (ids) => {
  if (ids instanceof Set) return new Set([...ids].map((id) => String(id)))
  if (Array.isArray(ids)) return new Set(ids.map((id) => String(id)))
  return new Set()
}

export const useWorkspacePageTreeEditing = ({ workspacePageTreeAllRows } = {}) => {
  const workspaceTreeSubpageInput = ref(null)
  const workspaceTreeRenameInput = ref(null)
  const workspaceTreeSubpageCreatingId = ref('')
  const workspaceTreeSubpageComposerParentId = ref('')
  const workspaceTreeSubpageTitle = ref('')
  const workspaceTreeRenamingId = ref('')
  const workspaceTreeRenameDraft = ref('')
  const workspaceTreeRenameSavingId = ref('')
  const workspaceTreeMovingId = ref('')
  const workspaceTreeMoveTargetId = ref('')
  const workspaceTreeMoveSavingId = ref('')
  const workspaceTreeSubpageError = ref('')
  const workspaceTreeRenameError = ref('')
  const workspaceTreeMoveError = ref('')

  const isWorkspaceTreeSubpageComposerOpen = (node) =>
    Boolean(node?.id && workspaceTreeSubpageComposerParentId.value === String(node.id))

  const cancelWorkspaceTreeSubpageComposer = () => {
    workspaceTreeSubpageComposerParentId.value = ''
    workspaceTreeSubpageTitle.value = ''
  }

  const isWorkspaceTreeRenameOpen = (node) =>
    Boolean(node?.id && workspaceTreeRenamingId.value === String(node.id))

  const cancelWorkspaceTreeRename = () => {
    workspaceTreeRenamingId.value = ''
    workspaceTreeRenameDraft.value = ''
  }

  const isWorkspaceTreeMoveOpen = (node) =>
    Boolean(node?.id && workspaceTreeMovingId.value === String(node.id))

  const cancelWorkspaceTreeMove = () => {
    workspaceTreeMovingId.value = ''
    workspaceTreeMoveTargetId.value = ''
  }

  const openWorkspaceTreeSubpageComposer = async (node) => {
    if (!node?.canEditProperties || workspaceTreeSubpageCreatingId.value) return
    cancelWorkspaceTreeRename()
    cancelWorkspaceTreeMove()
    workspaceTreeSubpageComposerParentId.value = String(node.id)
    workspaceTreeSubpageTitle.value = ''
    workspaceTreeSubpageError.value = ''
    await nextTick()
    resolveTemplateRef(workspaceTreeSubpageInput)?.focus?.()
  }

  const openWorkspaceTreeRename = async (node) => {
    if (!node?.canEditProperties || workspaceTreeRenameSavingId.value) return
    cancelWorkspaceTreeSubpageComposer()
    cancelWorkspaceTreeMove()
    workspaceTreeRenamingId.value = String(node.id)
    workspaceTreeRenameDraft.value = node.title || ''
    workspaceTreeRenameError.value = ''
    await nextTick()
    const input = resolveTemplateRef(workspaceTreeRenameInput)
    input?.focus?.()
    input?.select?.()
  }

  const workspaceTreeMoveTargetOptions = (node) =>
    createWorkspaceTreeMoveTargetOptions(node, readRows(workspacePageTreeAllRows))

  const openWorkspaceTreeMove = (node) => {
    if (!node?.canEditProperties || workspaceTreeMoveSavingId.value) return
    cancelWorkspaceTreeSubpageComposer()
    cancelWorkspaceTreeRename()
    workspaceTreeMovingId.value = String(node.id)
    workspaceTreeMoveTargetId.value = String(node.parentWorkspaceId || '')
    workspaceTreeMoveError.value = ''
  }

  const canApplyWorkspaceTreeMove = (node) =>
    canApplyWorkspaceTreeMoveTarget(node, {
      targetId: workspaceTreeMoveTargetId.value,
      movingId: workspaceTreeMovingId.value,
      savingId: workspaceTreeMoveSavingId.value,
    })

  const pruneWorkspaceTreeEditingState = (ids) => {
    const pageIds = toIdSet(ids)
    if (workspaceTreeSubpageComposerParentId.value && !pageIds.has(workspaceTreeSubpageComposerParentId.value)) {
      cancelWorkspaceTreeSubpageComposer()
    }
    if (workspaceTreeRenamingId.value && !pageIds.has(workspaceTreeRenamingId.value)) {
      cancelWorkspaceTreeRename()
    }
    if (workspaceTreeMovingId.value && !pageIds.has(workspaceTreeMovingId.value)) {
      cancelWorkspaceTreeMove()
    }
  }

  return {
    workspaceTreeSubpageInput,
    workspaceTreeRenameInput,
    workspaceTreeSubpageCreatingId,
    workspaceTreeSubpageComposerParentId,
    workspaceTreeSubpageTitle,
    workspaceTreeRenamingId,
    workspaceTreeRenameDraft,
    workspaceTreeRenameSavingId,
    workspaceTreeMovingId,
    workspaceTreeMoveTargetId,
    workspaceTreeMoveSavingId,
    workspaceTreeSubpageError,
    workspaceTreeRenameError,
    workspaceTreeMoveError,
    isWorkspaceTreeSubpageComposerOpen,
    openWorkspaceTreeSubpageComposer,
    cancelWorkspaceTreeSubpageComposer,
    isWorkspaceTreeRenameOpen,
    openWorkspaceTreeRename,
    cancelWorkspaceTreeRename,
    isWorkspaceTreeMoveOpen,
    workspaceTreeMoveTargetOptions,
    openWorkspaceTreeMove,
    cancelWorkspaceTreeMove,
    canApplyWorkspaceTreeMove,
    pruneWorkspaceTreeEditingState,
  }
}
