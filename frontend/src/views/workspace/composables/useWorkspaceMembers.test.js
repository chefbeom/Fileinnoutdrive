import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import {
  useWorkspaceMembers,
  workspaceMemberActionKey,
  workspaceMemberUserId,
} from './useWorkspaceMembers.js'

const createSubject = (overrides = {}) => {
  const state = {
    workspaceId: ref(42),
    workspaceMembers: ref([]),
    workspaceMemberLoading: ref(false),
    workspaceMemberError: ref(''),
    workspaceMemberActionLoading: ref(''),
    workspaceMemberRefreshedAt: ref(null),
    openRoleDropdownId: ref('menu'),
    currentUserIdx: ref(7),
    canManageWorkspaceShare: ref(true),
  }
  const api = {
    fetchWorkspaceMembers: vi.fn(async () => [
      { idx: 2, username: 'Writer', role: 'write' },
      { userIdx: 3, email: 'reader@example.com' },
    ]),
    changeWorkspaceUserRole: vi.fn(async () => {}),
    kickWorkspaceUser: vi.fn(async () => {}),
    showWorkspaceNotice: vi.fn(),
    requestWorkspaceConfirm: vi.fn(),
  }

  const subject = useWorkspaceMembers({ ...state, ...api, ...overrides })
  return { subject, state, api }
}

describe('useWorkspaceMembers', () => {
  it('resolves member identifiers and action keys', () => {
    expect(workspaceMemberUserId({ userIdx: 3 })).toBe(3)
    expect(workspaceMemberUserId({ idx: 4 })).toBe(4)
    expect(workspaceMemberUserId({ id: 5 })).toBe(5)
    expect(workspaceMemberActionKey({ userIdx: 3 }, 'WRITE')).toBe('WRITE:3')
  })

  it('loads and normalizes workspace members', async () => {
    const { subject, state, api } = createSubject()

    const members = await subject.refreshWorkspaceMembers()

    expect(api.fetchWorkspaceMembers).toHaveBeenCalledWith(42)
    expect(members).toEqual(state.workspaceMembers.value)
    expect(state.workspaceMembers.value).toEqual([
      { userIdx: 2, name: 'Writer', email: '', image: '', role: 'WRITE' },
      { userIdx: 3, name: 'reader@example.com', email: 'reader@example.com', image: '', role: 'READ' },
    ])
    expect(state.workspaceMemberLoading.value).toBe(false)
    expect(state.workspaceMemberError.value).toBe('')
    expect(state.workspaceMemberRefreshedAt.value).toEqual(expect.any(String))
  })

  it('clears member state when no workspace exists', async () => {
    const { subject, state, api } = createSubject({ workspaceId: ref(null) })
    state.workspaceMembers.value = [{ userIdx: 1 }]
    state.workspaceMemberError.value = 'old'

    await subject.refreshWorkspaceMembers()

    expect(api.fetchWorkspaceMembers).not.toHaveBeenCalled()
    expect(state.workspaceMembers.value).toEqual([])
    expect(state.workspaceMemberError.value).toBe('')
    expect(state.workspaceMemberRefreshedAt.value).toBeNull()
  })

  it('changes roles and refreshes members', async () => {
    const { subject, state, api } = createSubject()

    await subject.handleRoleAction({ userIdx: 2, name: 'Writer', role: 'READ' }, 'WRITE')

    expect(state.openRoleDropdownId.value).toBeNull()
    expect(api.changeWorkspaceUserRole).toHaveBeenCalledWith(42, 2, 'WRITE')
    expect(api.fetchWorkspaceMembers).toHaveBeenCalledWith(42)
    expect(api.showWorkspaceNotice).toHaveBeenLastCalledWith('멤버 권한을 변경했습니다.', 'success')
    expect(state.workspaceMemberActionLoading.value).toBe('')
  })

  it('asks for confirmation before kicking a member', async () => {
    const { subject, api } = createSubject()

    await subject.handleRoleAction({ userIdx: 2, name: 'Writer' }, 'KICKED')

    expect(api.requestWorkspaceConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: '멤버 추방',
      confirmLabel: '추방',
      tone: 'danger',
    }))
    expect(api.kickWorkspaceUser).not.toHaveBeenCalled()

    await api.requestWorkspaceConfirm.mock.calls[0][0].onConfirm()

    expect(api.kickWorkspaceUser).toHaveBeenCalledWith(42, 2)
    expect(api.showWorkspaceNotice).toHaveBeenLastCalledWith('멤버를 추방했습니다.', 'success')
  })

  it('blocks changing the current user role', async () => {
    const { subject, api } = createSubject()

    await subject.handleRoleAction({ userIdx: 7, name: 'Me' }, 'READ')

    expect(api.changeWorkspaceUserRole).not.toHaveBeenCalled()
    expect(api.showWorkspaceNotice).toHaveBeenCalledWith('자신의 권한은 이 화면에서 변경할 수 없습니다.', 'warn')
  })

  it('handles role select events and busy state', async () => {
    const { subject, state, api } = createSubject()
    state.workspaceMemberActionLoading.value = 'WRITE:2'

    expect(subject.isWorkspaceMemberBusy({ userIdx: 2 })).toBe(true)
    expect(subject.isWorkspaceMemberBusy({ userIdx: 3 })).toBe(false)

    await subject.handleWorkspaceMemberRoleSelect(
      { userIdx: 3, role: 'READ' },
      { target: { value: 'ADMIN' } },
    )

    expect(api.changeWorkspaceUserRole).toHaveBeenCalledWith(42, 3, 'ADMIN')
  })
})