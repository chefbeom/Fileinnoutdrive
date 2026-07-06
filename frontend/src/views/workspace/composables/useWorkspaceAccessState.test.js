import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceAccessState } from './useWorkspaceAccessState.js'
import {
  createWorkspaceLockButtonTitle,
  createWorkspaceLockStatusLabel,
  createWorkspaceShareButtonTitle,
  createWorkspaceShareStatusClass,
  createWorkspaceShareStatusLabel,
} from '../services/workspaceAccess.js'

const createSubject = () => {
  const currentUser = ref({ idx: 11 })
  const workspaceId = ref(null)
  const workspaceAccessRole = ref('ADMIN')
  const workspacePageLocked = ref(false)
  const workspaceTemplateApplied = ref(false)
  const hasUnsavedChanges = ref(false)
  const title = ref('')
  const workspaceShareStatus = ref('Private')
  const isValid = ref(false)

  const subject = useWorkspaceAccessState({
    currentUser,
    workspaceId,
    workspaceAccessRole,
    workspacePageLocked,
    workspaceTemplateApplied,
    hasUnsavedChanges,
    title,
    workspaceShareStatus,
    isValid,
  })

  return {
    subject,
    currentUser,
    workspaceId,
    workspaceAccessRole,
    workspacePageLocked,
    workspaceTemplateApplied,
    hasUnsavedChanges,
    title,
    workspaceShareStatus,
    isValid,
  }
}

describe('useWorkspaceAccessState', () => {
  it('derives edit, lock, comment, and template availability', () => {
    const {
      subject,
      currentUser,
      workspaceId,
      workspaceAccessRole,
      workspacePageLocked,
      workspaceTemplateApplied,
      hasUnsavedChanges,
      title,
    } = createSubject()

    expect(subject.currentUserIdx.value).toBe(11)
    currentUser.value = { userId: 22 }
    expect(subject.currentUserIdx.value).toBe(22)

    expect(subject.workspaceRoleKey.value).toBe('ADMIN')
    expect(subject.canEditWorkspace.value).toBe(true)
    expect(subject.canModifyWorkspacePage.value).toBe(true)
    expect(subject.canManageAssets.value).toBe(true)
    expect(subject.canManageWorkspaceShare.value).toBe(true)
    expect(subject.shouldWorkspaceEditorReadOnly.value).toBe(false)
    expect(subject.canCommentOnWorkspace.value).toBe(true)
    expect(subject.canShowWorkspaceTemplates.value).toBe(true)

    title.value = 'Draft'
    expect(subject.canShowWorkspaceTemplates.value).toBe(false)
    title.value = ''
    hasUnsavedChanges.value = true
    expect(subject.canShowWorkspaceTemplates.value).toBe(false)
    hasUnsavedChanges.value = false
    workspaceTemplateApplied.value = true
    expect(subject.canShowWorkspaceTemplates.value).toBe(false)

    workspaceTemplateApplied.value = false
    workspaceId.value = 42
    workspaceAccessRole.value = 'READ'
    expect(subject.canEditWorkspace.value).toBe(false)
    expect(subject.canModifyWorkspacePage.value).toBe(false)
    expect(subject.canManageAssets.value).toBe(false)
    expect(subject.canManageWorkspaceShare.value).toBe(false)
    expect(subject.shouldWorkspaceEditorReadOnly.value).toBe(true)
    expect(subject.canCommentOnWorkspace.value).toBe(false)

    workspaceAccessRole.value = 'WRITE'
    workspacePageLocked.value = true
    expect(subject.canEditWorkspace.value).toBe(true)
    expect(subject.canModifyWorkspacePage.value).toBe(false)
    expect(subject.canManageAssets.value).toBe(false)
    expect(subject.shouldWorkspaceEditorReadOnly.value).toBe(true)
    expect(subject.canCommentOnWorkspace.value).toBe(true)
  })

  it('derives lock and share presentation helpers', () => {
    const { subject, workspaceAccessRole, workspacePageLocked, workspaceShareStatus, isValid } = createSubject()

    expect(subject.workspaceLockStatusLabel.value).toBe(createWorkspaceLockStatusLabel(false))
    expect(subject.workspaceLockButtonTitle.value).toBe(createWorkspaceLockButtonTitle({
      canEditWorkspace: true,
      isLocked: false,
    }))
    expect(subject.workspaceShareStatusLabel.value).toBe(createWorkspaceShareStatusLabel('Private'))
    expect(subject.workspaceShareStatusClass.value).toEqual(createWorkspaceShareStatusClass('Private'))
    expect(subject.workspaceShareButtonTitle.value).toBe(createWorkspaceShareButtonTitle({
      isValid: false,
      canManageWorkspaceShare: true,
    }))

    workspacePageLocked.value = true
    expect(subject.workspaceLockStatusLabel.value).toBe(createWorkspaceLockStatusLabel(true))
    expect(subject.workspaceLockButtonTitle.value).toBe(createWorkspaceLockButtonTitle({
      canEditWorkspace: true,
      isLocked: true,
    }))

    workspaceShareStatus.value = 'Shared'
    expect(subject.workspaceShareStatusLabel.value).toBe(createWorkspaceShareStatusLabel('Shared'))
    expect(subject.workspaceShareStatusClass.value).toEqual(createWorkspaceShareStatusClass('Shared'))

    isValid.value = true
    workspaceAccessRole.value = 'READ'
    expect(subject.workspaceShareButtonTitle.value).toBe(createWorkspaceShareButtonTitle({
      isValid: true,
      canManageWorkspaceShare: false,
    }))
  })
})