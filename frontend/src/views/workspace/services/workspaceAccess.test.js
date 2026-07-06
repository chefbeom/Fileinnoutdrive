import { describe, expect, it } from 'vitest'

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
} from './workspaceAccess.js'

describe('workspaceAccess', () => {
  it('normalizes roles and resolves edit/share permissions', () => {
    expect(normalizeWorkspaceRoleKey('write')).toBe('WRITE')
    expect(normalizeWorkspaceRoleKey('')).toBe('ADMIN')
    expect(canEditWorkspacePage({ workspaceId: null, roleKey: 'READ' })).toBe(true)
    expect(canEditWorkspacePage({ workspaceId: 12, roleKey: 'WRITE' })).toBe(true)
    expect(canEditWorkspacePage({ workspaceId: 12, roleKey: 'READ' })).toBe(false)
    expect(canWorkspaceRoleManageShare('ADMIN')).toBe(true)
    expect(canWorkspaceRoleManageShare('WRITE')).toBe(false)
  })

  it('blocks asset and editor changes when locked or read-only', () => {
    expect(canManageWorkspaceAssets({ workspaceId: 1, roleKey: 'WRITE', isLocked: false })).toBe(true)
    expect(canManageWorkspaceAssets({ workspaceId: 1, roleKey: 'WRITE', isLocked: true })).toBe(false)
    expect(canManageWorkspaceAssets({ workspaceId: 1, roleKey: 'READ', isLocked: false })).toBe(false)
    expect(canManageWorkspaceAssets({ workspaceId: null, roleKey: 'READ', isLocked: false })).toBe(true)
    expect(canModifyWorkspacePageContent({ canEditWorkspace: true, isLocked: false })).toBe(true)
    expect(canModifyWorkspacePageContent({ canEditWorkspace: true, isLocked: true })).toBe(false)
    expect(shouldUseReadonlyWorkspaceEditor({ canEditWorkspace: false, isLocked: false })).toBe(true)
  })

  it('creates lock and template labels', () => {
    expect(createWorkspaceLockStatusLabel(true)).toBe('페이지 잠김')
    expect(createWorkspaceLockStatusLabel(false)).toBe('편집 가능')
    expect(createWorkspaceLockButtonTitle({ canEditWorkspace: false, isLocked: false })).toBe('편집 권한 없음')
    expect(createWorkspaceLockButtonTitle({ canEditWorkspace: true, isLocked: true })).toBe('페이지 잠금 해제')
    expect(createWorkspaceLockButtonTitle({ canEditWorkspace: true, isLocked: false })).toBe('페이지 잠금')
    expect(canShowWorkspaceTemplatePicker({ canModifyWorkspacePage: true, title: '' })).toBe(true)
    expect(canShowWorkspaceTemplatePicker({ canModifyWorkspacePage: true, title: 'Draft' })).toBe(false)
    expect(canShowWorkspaceTemplatePicker({ workspaceId: 1, canModifyWorkspacePage: true })).toBe(false)
  })

  it('creates share status labels and button text', () => {
    expect(createWorkspaceShareStatusLabel('Public')).toBe('공개 링크')
    expect(createWorkspaceShareStatusLabel('Shared')).toBe('멤버 공유')
    expect(createWorkspaceShareStatusLabel('Private')).toBe('개인 문서')
    expect(createWorkspaceShareStatusClass('Shared')).toEqual({
      'status-pill--public': false,
      'status-pill--shared': true,
      'status-pill--muted': false,
    })
    expect(createWorkspaceShareButtonTitle({ isValid: false, canManageWorkspaceShare: true })).toBe('제목을 입력한 뒤 공유 설정을 열 수 있습니다')
    expect(createWorkspaceShareButtonTitle({ isValid: true, canManageWorkspaceShare: false })).toBe('관리자만 공유 설정을 변경할 수 있습니다')
    expect(createWorkspaceShareButtonTitle({ isValid: true, canManageWorkspaceShare: true })).toBe('공유 및 초대 설정')
  })
})
