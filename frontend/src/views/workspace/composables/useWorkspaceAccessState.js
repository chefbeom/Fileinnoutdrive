import { computed } from 'vue'

import {
  canEditWorkspacePage,
  canManageWorkspaceAssets,
  canModifyWorkspacePageContent,
  canShowWorkspaceTemplatePicker,
  canWorkspaceRoleManageShare,
  createWorkspaceLockButtonTitle,
  createWorkspaceLockStatusLabel,
  createWorkspaceShareButtonTitle,
  createWorkspaceShareStatusClass,
  createWorkspaceShareStatusLabel,
  normalizeWorkspaceRoleKey,
  shouldUseReadonlyWorkspaceEditor,
} from '../services/workspaceAccess.js'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readValue = (source, fallback = null) => resolveSource(source) ?? fallback
const readString = (source) => String(resolveSource(source) || '')
const readBoolean = (source) => Boolean(resolveSource(source))
const readCurrentUserId = (user = {}) => user?.idx ?? user?.userIdx ?? user?.userId ?? null

export const useWorkspaceAccessState = ({
  currentUser,
  workspaceId,
  workspaceAccessRole,
  workspacePageLocked,
  workspaceTemplateApplied,
  hasUnsavedChanges,
  title,
  workspaceShareStatus,
  isValid,
} = {}) => {
  const currentUserIdx = computed(() => readCurrentUserId(readValue(currentUser, {})))
  const workspaceRoleKey = computed(() => normalizeWorkspaceRoleKey(readString(workspaceAccessRole)))
  const isWorkspacePageLocked = computed(() => readBoolean(workspacePageLocked))

  const canManageAssets = computed(() =>
    canManageWorkspaceAssets({
      workspaceId: readValue(workspaceId),
      roleKey: workspaceRoleKey.value,
      isLocked: isWorkspacePageLocked.value,
    }),
  )

  const canManageWorkspaceShare = computed(() => canWorkspaceRoleManageShare(workspaceRoleKey.value))

  const canEditWorkspace = computed(() =>
    canEditWorkspacePage({ workspaceId: readValue(workspaceId), roleKey: workspaceRoleKey.value }),
  )

  const canModifyWorkspacePage = computed(() =>
    canModifyWorkspacePageContent({
      canEditWorkspace: canEditWorkspace.value,
      isLocked: isWorkspacePageLocked.value,
    }),
  )

  const shouldWorkspaceEditorReadOnly = computed(() =>
    shouldUseReadonlyWorkspaceEditor({
      canEditWorkspace: canEditWorkspace.value,
      isLocked: isWorkspacePageLocked.value,
    }),
  )

  const workspaceLockStatusLabel = computed(() => createWorkspaceLockStatusLabel(isWorkspacePageLocked.value))

  const workspaceLockButtonTitle = computed(() =>
    createWorkspaceLockButtonTitle({
      canEditWorkspace: canEditWorkspace.value,
      isLocked: isWorkspacePageLocked.value,
    }),
  )

  const canShowWorkspaceTemplates = computed(() =>
    canShowWorkspaceTemplatePicker({
      workspaceId: readValue(workspaceId),
      canModifyWorkspacePage: canModifyWorkspacePage.value,
      templateApplied: readBoolean(workspaceTemplateApplied),
      hasUnsavedChanges: readBoolean(hasUnsavedChanges),
      title: readString(title),
    }),
  )

  const workspaceShareStatusLabel = computed(() => createWorkspaceShareStatusLabel(readString(workspaceShareStatus)))
  const workspaceShareStatusClass = computed(() => createWorkspaceShareStatusClass(readString(workspaceShareStatus)))

  const workspaceShareButtonTitle = computed(() =>
    createWorkspaceShareButtonTitle({
      isValid: readBoolean(isValid),
      canManageWorkspaceShare: canManageWorkspaceShare.value,
    }),
  )

  const canCommentOnWorkspace = computed(() => {
    if (!readValue(workspaceId)) return true
    return workspaceRoleKey.value !== 'READ'
  })

  return {
    currentUserIdx,
    workspaceRoleKey,
    isWorkspacePageLocked,
    canManageAssets,
    canManageWorkspaceShare,
    canEditWorkspace,
    canModifyWorkspacePage,
    shouldWorkspaceEditorReadOnly,
    workspaceLockStatusLabel,
    workspaceLockButtonTitle,
    canShowWorkspaceTemplates,
    workspaceShareStatusLabel,
    workspaceShareStatusClass,
    workspaceShareButtonTitle,
    canCommentOnWorkspace,
  }
}