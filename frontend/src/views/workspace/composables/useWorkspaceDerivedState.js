import { computed, unref } from 'vue'

import {
  countWorkspaceExtraActiveUsers,
  createActiveWorkspaceUserIdSet,
  createWorkspaceActiveUserPreview,
  createWorkspacePresenceSummaryLabel,
} from '../services/workspacePresence.js'

const resolveSource = (source) => {
  if (typeof source === 'function') return source()
  return unref(source)
}

const readArray = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}

const readBoolean = (source) => Boolean(resolveSource(source))
const readObject = (source) => {
  const value = resolveSource(source)
  return value && typeof value === 'object' ? value : {}
}
const readString = (source) => String(resolveSource(source) || '')

export const useWorkspaceDerivedState = ({
  currentUser,
  route,
  title,
  titleDirty,
  isEditorDirty,
  workspaceId,
  activeUsers,
  saveState,
  workspacePageBreadcrumbTrail,
  currentWorkspaceChildPages,
  linkedWorkspaceDocuments,
  workspaceBacklinks,
} = {}) => {
  const currentUserState = computed(() => readObject(currentUser))

  const isValid = computed(() => readString(title).trim().length > 0)

  const hasUnsavedChanges = computed(() =>
    readBoolean(titleDirty) || readBoolean(isEditorDirty),
  )

  const currentUserEmail = computed(() =>
    String(currentUserState.value.email || '').toLowerCase(),
  )

  const currentWorkspaceKey = computed(() =>
    String(resolveSource(workspaceId) || route?.params?.id || 'new'),
  )

  const activeUserPreview = computed(() =>
    createWorkspaceActiveUserPreview(readArray(activeUsers)),
  )

  const extraActiveUserCount = computed(() =>
    countWorkspaceExtraActiveUsers(readArray(activeUsers)),
  )

  const activeWorkspaceUserIds = computed(() =>
    createActiveWorkspaceUserIdSet(readArray(activeUsers)),
  )

  const presenceSummaryLabel = computed(() =>
    createWorkspacePresenceSummaryLabel({
      workspaceId: resolveSource(workspaceId),
      activeUsers: readArray(activeUsers),
    }),
  )

  const isSaving = computed(() => readString(saveState) === 'saving')

  const workspaceRelationCount = computed(() =>
    readArray(workspacePageBreadcrumbTrail).length +
    readArray(currentWorkspaceChildPages).length +
    readArray(linkedWorkspaceDocuments).length +
    readArray(workspaceBacklinks).length,
  )

  return {
    currentUserState,
    isValid,
    hasUnsavedChanges,
    currentUserEmail,
    currentWorkspaceKey,
    activeUserPreview,
    extraActiveUserCount,
    activeWorkspaceUserIds,
    presenceSummaryLabel,
    isSaving,
    workspaceRelationCount,
  }
}
