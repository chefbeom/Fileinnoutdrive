import { describe, expect, it } from 'vitest'

import {
  createWorkspaceMemberRows,
  createWorkspaceMentionCandidates,
  createWorkspacePropertyOwnerCandidates,
  createWorkspaceTaskAssigneeCandidates,
  createWorkspaceWorkloadRows,
  filterWorkspaceBlockedPages,
  filterWorkspaceUnassignedPages,
  filterWorkspaceUnassignedTasks,
  normalizeWorkspaceMember,
  workspaceUserInitial,
} from './workspacePeople.js'

describe('workspacePeople', () => {
  it('creates user initials with a fallback', () => {
    expect(workspaceUserInitial('alice')).toBe('A')
    expect(workspaceUserInitial('')).toBe('?')
    expect(workspaceUserInitial(null)).toBe('?')
  })

  it('normalizes workspace members from backend aliases', () => {
    expect(normalizeWorkspaceMember({ idx: 3, username: 'Writer', level: 'write', profileImage: 'p.png' })).toEqual({
      userIdx: 3,
      name: 'Writer',
      email: '',
      image: 'p.png',
      role: 'WRITE',
    })
    expect(normalizeWorkspaceMember({ userIdx: 4, email: 'reader@example.com' })).toMatchObject({
      userIdx: 4,
      name: 'reader@example.com',
      role: 'READ',
    })
  })
  it('builds workload rows with current user first, scores, and unassigned items last', () => {
    const rows = createWorkspaceWorkloadRows({
      currentUser: { email: 'me@example.com', name: 'Me' },
      currentUserEmail: 'me@example.com',
      memberRows: [{ email: 'owner@example.com', name: 'Owner', role: 'WRITE' }],
      activeUsers: [{ email: 'owner@example.com', name: 'Owner Online', isOnline: true }],
      pageRows: [
        { id: 1, ownerEmail: 'owner@example.com', ownerName: 'Owner', status: 'active', isOverdue: true },
        { id: 2, ownerEmail: '', status: 'active', isOverdue: false },
        { id: 3, ownerEmail: 'me@example.com', ownerName: 'Me', status: 'done', isOverdue: false },
      ],
      indexedTasks: [
        { id: 'task-1', assigneeEmail: 'owner@example.com', assigneeName: 'Owner', checked: false, isOverdue: true },
        { id: 'task-2', assigneeEmail: 'me@example.com', assigneeName: 'Me', checked: true, isOverdue: false },
        { id: 'task-3', assigneeEmail: '', checked: false, isOverdue: false },
      ],
    })

    expect(rows.map((row) => row.key)).toEqual(['me@example.com', 'owner@example.com', 'unassigned'])
    expect(rows[0]).toMatchObject({ email: 'me@example.com', isMe: true, workloadScore: 0 })
    expect(rows[0].completedTasks.map((task) => task.id)).toEqual(['task-2'])

    const owner = rows.find((row) => row.email === 'owner@example.com')
    expect(owner).toMatchObject({ role: 'WRITE', isOnline: true, workloadScore: 8 })
    expect(owner.openTasks.map((task) => task.id)).toEqual(['task-1'])
    expect(owner.overdueTasks.map((task) => task.id)).toEqual(['task-1'])
    expect(owner.activePages.map((page) => page.id)).toEqual([1])
    expect(owner.overduePages.map((page) => page.id)).toEqual([1])

    const unassigned = rows.at(-1)
    expect(unassigned).toMatchObject({ key: 'unassigned', name: '담당자 없음', workloadScore: 3 })
    expect(unassigned.pages.map((page) => page.id)).toEqual([2])
    expect(unassigned.tasks.map((task) => task.id)).toEqual(['task-3'])
  })

  it('builds mention candidates excluding current user and deduplicating active members', () => {
    const candidates = createWorkspaceMentionCandidates({
      currentUser: { email: 'me@example.com' },
      currentUserIdx: 1,
      memberRows: [
        { userIdx: 1, email: 'me@example.com', name: 'Me' },
        { userIdx: 2, email: 'member@example.com', name: 'Member' },
      ],
      activeUsers: [
        { userId: 3, email: 'active@example.com', name: 'Active', clientId: 'client-a' },
        { userId: 2, email: 'member@example.com', name: 'Duplicate', isOnline: true },
      ],
    })

    expect(candidates).toEqual([
      {
        userIdx: 2,
        email: 'member@example.com',
        name: 'Member',
        image: '',
        initial: 'M',
        source: 'member',
      },
      {
        userIdx: 3,
        email: 'active@example.com',
        name: 'Active',
        image: '',
        initial: 'A',
        source: 'active',
      },
    ])
  })

  it('builds task assignee candidates from current user, members, active users, and mentions', () => {
    const candidates = createWorkspaceTaskAssigneeCandidates({
      currentUser: { email: 'me@example.com', name: 'Me' },
      memberRows: [{ email: 'member@example.com', name: 'Member' }],
      activeUsers: [{ email: 'member@example.com', name: 'Duplicate' }],
      mentionCandidates: [{ email: 'mention@example.com', name: 'Mention' }],
    })

    expect(candidates.map((candidate) => candidate.email)).toEqual([
      'me@example.com',
      'member@example.com',
      'mention@example.com',
    ])
  })

  it('prepends the current property owner when it is not already selectable', () => {
    const candidates = createWorkspacePropertyOwnerCandidates({
      taskAssigneeCandidates: [{ email: 'member@example.com', name: 'Member', image: '', initial: 'M' }],
      ownerEmail: 'owner@example.com',
      ownerName: 'Owner',
    })

    expect(candidates.map((candidate) => candidate.email)).toEqual(['owner@example.com', 'member@example.com'])
    expect(candidates[0]).toMatchObject({ name: 'Owner', initial: 'O' })
  })
  it('sorts workspace member rows by role, current user, and name while marking online users', () => {
    const rows = createWorkspaceMemberRows({
      currentUserIdx: 2,
      activeUserIds: new Set(['1', '3']),
      members: [
        { userIdx: 3, name: 'Charlie', role: 'READ' },
        { userIdx: 2, name: 'Me', role: 'WRITE' },
        { userIdx: 1, name: 'Admin', role: 'ADMIN' },
        { userIdx: 4, name: 'Beta', role: 'WRITE' },
      ],
    })

    expect(rows.map((row) => row.userIdx)).toEqual([1, 2, 4, 3])
    expect(rows.map((row) => [row.userIdx, row.isMe, row.isOnline])).toEqual([
      [1, false, true],
      [2, true, false],
      [4, false, false],
      [3, false, true],
    ])
  })

  it('filters unassigned and blocked workspace attention sources', () => {
    const pages = [
      { id: 1, status: 'active', ownerEmail: '' },
      { id: 2, status: 'done', ownerEmail: '' },
      { id: 3, status: 'blocked', ownerEmail: 'owner@example.com' },
      { id: 4, status: 'blocked', ownerEmail: '' },
    ]
    const tasks = [
      { id: 'a', assigneeEmail: '' },
      { id: 'b', assigneeEmail: 'owner@example.com' },
    ]

    expect(filterWorkspaceUnassignedPages(pages).map((page) => page.id)).toEqual([1, 4])
    expect(filterWorkspaceBlockedPages(pages).map((page) => page.id)).toEqual([3, 4])
    expect(filterWorkspaceUnassignedTasks(tasks).map((task) => task.id)).toEqual(['a'])
  })
})
