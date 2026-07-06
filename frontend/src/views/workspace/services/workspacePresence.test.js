import { describe, expect, it } from 'vitest'

import {
  countWorkspaceExtraActiveUsers,
  createActiveWorkspaceUserIdSet,
  createWorkspaceActiveUserPreview,
  createWorkspacePresenceSummaryLabel,
} from './workspacePresence.js'

describe('workspacePresence', () => {
  const users = [
    { userIdx: 10, status: 'active' },
    { userIdx: '11', status: 'away' },
    { userIdx: null, status: 'active' },
    { userIdx: 12, status: 'active' },
    { userIdx: 13, status: 'away' },
  ]

  it('creates active user preview and overflow count', () => {
    expect(createWorkspaceActiveUserPreview(users, 2)).toEqual(users.slice(0, 2))
    expect(createWorkspaceActiveUserPreview(users, 0)).toEqual([])
    expect(countWorkspaceExtraActiveUsers(users, 4)).toBe(1)
    expect(countWorkspaceExtraActiveUsers(users, 10)).toBe(0)
  })

  it('creates string user id set from active users', () => {
    expect([...createActiveWorkspaceUserIdSet(users)]).toEqual(['10', '11', '12', '13'])
  })

  it('summarizes personal and workspace presence states', () => {
    expect(createWorkspacePresenceSummaryLabel({ workspaceId: null, activeUsers: users })).toBe('개인 편집')
    expect(createWorkspacePresenceSummaryLabel({ workspaceId: 7, activeUsers: [] })).toBe('연결 준비 중')
    expect(createWorkspacePresenceSummaryLabel({ workspaceId: 7, activeUsers: [{ status: 'active' }] })).toBe('나만 편집 중')
    expect(createWorkspacePresenceSummaryLabel({ workspaceId: 7, activeUsers: [{ status: 'away' }] })).toBe('1명 자리비움')
    expect(createWorkspacePresenceSummaryLabel({ workspaceId: 7, activeUsers: users })).toBe('3명 활동 · 2명 자리비움')
    expect(createWorkspacePresenceSummaryLabel({ workspaceId: 7, activeUsers: users.filter((user) => user.status === 'active') })).toBe('3명 협업 중')
  })
})
