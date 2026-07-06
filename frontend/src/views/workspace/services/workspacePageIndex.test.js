import { describe, expect, it } from 'vitest'

import {
  createWorkspacePageIndexOwnerFilterOptions,
  createWorkspacePageIndexOwnerOptions,
  createWorkspacePageIndexRow,
  createWorkspacePageIndexTagOptions,
  createWorkspacePageIndexBulkPatch,
  filterWorkspacePageIndexRows,
  findWorkspacePageIndexRowById,
  isWorkspacePageIndexRowBusy,
  isWorkspacePageIndexRowSelected,
  matchesWorkspacePageIndexQuery,
  sortWorkspacePageIndexRows,
  setWorkspacePageIndexRowBusyIds,
  toggleVisibleWorkspacePageIndexSelectedIds,
  toggleWorkspacePageIndexSelectedIds,
  workspacePageIndexNextStatusId,
  workspacePageIndexRowSearchText,
} from './workspacePageIndex.js'

const priorityOptions = [
  { id: 'low' },
  { id: 'normal' },
  { id: 'high' },
  { id: 'urgent' },
]

const rows = [
  {
    id: 1,
    title: 'Alpha plan',
    status: 'active',
    priority: 'normal',
    dueDate: '2026-07-10',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ownerEmail: 'owner@example.com',
    tags: ['Roadmap'],
    scope: 'owned',
    locked: false,
  },
  {
    id: 2,
    title: 'Blocked launch',
    status: 'blocked',
    priority: 'urgent',
    dueDate: '2026-07-02',
    updatedAt: '2026-07-02T00:00:00.000Z',
    ownerEmail: '',
    tags: ['Risk'],
    scope: 'shared',
    locked: true,
    isOverdue: true,
  },
  {
    id: 3,
    title: 'Cleanup note',
    status: 'done',
    priority: 'low',
    dueDate: '',
    updatedAt: '2026-07-03T00:00:00.000Z',
    ownerEmail: 'teammate@example.com',
    tags: ['Roadmap'],
    scope: 'owned',
    locked: false,
  },
]

describe('workspacePageIndex', () => {
  it('builds a page index row from post contents, properties, and checklist tasks', () => {
    const row = createWorkspacePageIndexRow(
      { id: 7, title: 'Fallback title', updatedAt: '2026-07-01T00:00:00.000Z', role: 'READ', scope: 'shared' },
      {
        title: 'Loaded title',
        updatedAt: '2026-07-03T00:00:00.000Z',
        accessRole: 'WRITE',
        contents: JSON.stringify({
          meta: {
            parentWorkspaceId: 3,
            parentWorkspaceTitle: 'Parent page',
            workspaceProperties: {
              icon: '🚀',
              coverColor: 'green',
              status: 'active',
              priority: 'urgent',
              ownerEmail: 'owner@example.com',
              dueDate: '2026-07-02',
              tags: ['Risk'],
            },
          },
          blocks: [
            { id: 'body', type: 'paragraph', data: { text: 'Launch readiness checklist' } },
            {
              id: 'tasks',
              type: 'list',
              data: {
                style: 'checklist',
                items: [{ content: 'Verify rollout', checked: false, meta: { dueDate: '2026-07-02' } }],
              },
            },
          ],
        }),
      },
      {
        todayKey: '2026-07-03',
        propertyOptions: {
          coverColorOptions: [{ id: 'blue' }, { id: 'green' }],
          statusOptions: [{ id: 'planning' }, { id: 'active' }, { id: 'done' }],
          priorityOptions: [{ id: 'normal' }, { id: 'urgent' }],
        },
        statusOptions: [{ id: 'active', label: '진행 중', tone: 'success' }],
        priorityOptions: [{ id: 'urgent', label: '긴급', tone: 'danger' }],
      },
    )

    expect(row).toMatchObject({
      id: 7,
      title: 'Loaded title',
      accessRole: 'WRITE',
      scopeLabel: '공유 페이지',
      roleLabel: '편집자',
      icon: '🚀',
      coverColor: 'green',
      status: 'active',
      statusLabel: '진행 중',
      statusTone: 'success',
      priority: 'urgent',
      priorityLabel: '긴급',
      priorityTone: 'danger',
      ownerEmail: 'owner@example.com',
      dueDate: '2026-07-02',
      isOverdue: true,
      canEditProperties: true,
      parentWorkspaceId: '3',
      parentWorkspaceTitle: 'Parent page',
    })
    expect(row.preview).toContain('Launch readiness checklist')
    expect(row.workspaceTasks).toHaveLength(1)
    expect(row.workspaceTasks[0]).toMatchObject({ text: 'Verify rollout', isOverdue: true })
  })

  it('builds searchable text from row fields and lock state', () => {
    const text = workspacePageIndexRowSearchText(rows[1])

    expect(text).toContain('blocked launch')
    expect(text).toContain('risk')
    expect(text).toContain('locked')
    expect(matchesWorkspacePageIndexQuery(rows[0], 'roadmap')).toBe(true)
    expect(matchesWorkspacePageIndexQuery(rows[0], 'missing')).toBe(false)
  })

  it('sorts rows by due date, priority, title, and update time', () => {
    expect(sortWorkspacePageIndexRows(rows, 'due-asc').map((row) => row.id)).toEqual([2, 1, 3])
    expect(sortWorkspacePageIndexRows(rows, 'priority-desc', priorityOptions).map((row) => row.id)).toEqual([2, 1, 3])
    expect(sortWorkspacePageIndexRows(rows, 'title-asc').map((row) => row.id)).toEqual([1, 2, 3])
    expect(sortWorkspacePageIndexRows(rows, 'updated-desc').map((row) => row.id)).toEqual([3, 2, 1])
  })

  it('filters by status, tags, owner, scope, overdue, and query before sorting', () => {
    expect(filterWorkspacePageIndexRows(rows, { filter: 'blocked' }).map((row) => row.id)).toEqual([2])
    expect(filterWorkspacePageIndexRows(rows, { filter: 'shared' }).map((row) => row.id)).toEqual([2])
    expect(filterWorkspacePageIndexRows(rows, { filter: 'overdue' }).map((row) => row.id)).toEqual([2])
    expect(filterWorkspacePageIndexRows(rows, { tagFilter: 'roadmap', sort: 'title-asc' }).map((row) => row.id)).toEqual([1, 3])
    expect(filterWorkspacePageIndexRows(rows, { ownerFilter: '__unassigned__' }).map((row) => row.id)).toEqual([2])
    expect(filterWorkspacePageIndexRows(rows, { ownerFilter: 'teammate@example.com' }).map((row) => row.id)).toEqual([3])
    expect(filterWorkspacePageIndexRows(rows, { query: 'alpha' }).map((row) => row.id)).toEqual([1])
  })
  it('creates tag and owner filter options with counts', () => {
    const tagOptions = createWorkspacePageIndexTagOptions(rows)
    const ownerOptions = createWorkspacePageIndexOwnerFilterOptions(rows)

    expect(tagOptions).toEqual([
      { id: 'roadmap', label: 'Roadmap', count: 2 },
      { id: 'risk', label: 'Risk', count: 1 },
    ])
    expect(ownerOptions).toEqual([
      { id: '__unassigned__', email: '', label: '\uBBF8\uBC30\uC815', count: 1 },
      { id: 'owner@example.com', email: 'owner@example.com', label: 'owner@example.com', count: 1 },
      { id: 'teammate@example.com', email: 'teammate@example.com', label: 'teammate@example.com', count: 1 },
    ])
  })

  it('creates editable owner options from known candidates and row fallback owner', () => {
    expect(
      createWorkspacePageIndexOwnerOptions(
        [
          { email: ' owner@example.com ', name: 'Owner Name' },
          { email: 'owner@example.com', name: 'Duplicate Owner' },
          { email: '', name: 'Missing Email' },
        ],
        { ownerEmail: 'ROW@example.com', ownerName: 'Row Owner' },
      ),
    ).toEqual([
      { email: 'owner@example.com', name: 'Duplicate Owner' },
      { email: 'ROW@example.com', name: 'Row Owner' },
    ])
  })
  it('manages selection and busy row ids without mutating inputs', () => {
    const editableRow = { id: 10, canEditProperties: true }
    const lockedRow = { id: 11, canEditProperties: false }
    const selected = ['5']
    const busy = ['1']

    expect(toggleWorkspacePageIndexSelectedIds(selected, editableRow, true)).toEqual(['5', '10'])
    expect(toggleWorkspacePageIndexSelectedIds(['5', '10'], editableRow, false)).toEqual(['5'])
    expect(toggleWorkspacePageIndexSelectedIds(selected, lockedRow, true)).toEqual(['5'])
    expect(toggleVisibleWorkspacePageIndexSelectedIds(['5'], [editableRow, { id: 12 }], true)).toEqual(['5', '10', '12'])
    expect(toggleVisibleWorkspacePageIndexSelectedIds(['5', '10', '12'], [editableRow], false)).toEqual(['5', '12'])
    expect(isWorkspacePageIndexRowSelected(editableRow, ['10'])).toBe(true)

    expect(setWorkspacePageIndexRowBusyIds(busy, editableRow, true)).toEqual(['1', '10'])
    expect(setWorkspacePageIndexRowBusyIds(['1', '10'], editableRow, false)).toEqual(['1'])
    expect(isWorkspacePageIndexRowBusy(editableRow, ['10'])).toBe(true)
    expect(selected).toEqual(['5'])
    expect(busy).toEqual(['1'])
  })

  it('creates bulk property patches and resolves board rows/status transitions', () => {
    const ownerCandidates = [{ email: 'owner@example.com', name: 'Owner Name' }]

    expect(createWorkspacePageIndexBulkPatch({ status: 'active', priority: 'urgent' })).toEqual({
      status: 'active',
      priority: 'urgent',
    })
    expect(createWorkspacePageIndexBulkPatch({ ownerEmail: 'owner@example.com', ownerCandidates })).toEqual({
      ownerEmail: 'owner@example.com',
      ownerName: 'Owner Name',
    })
    expect(createWorkspacePageIndexBulkPatch({ ownerEmail: '__none__', clearDueDate: true })).toEqual({
      ownerEmail: '',
      ownerName: '',
      dueDate: '',
    })
    expect(createWorkspacePageIndexBulkPatch({ dueDate: '2026-07-05' })).toEqual({ dueDate: '2026-07-05' })
    expect(findWorkspacePageIndexRowById(rows, '2')).toMatchObject({ id: 2 })
    expect(findWorkspacePageIndexRowById(rows, 'missing')).toBeNull()
    expect(workspacePageIndexNextStatusId({ status: 'active' }, 1, [{ id: 'active' }, { id: 'done' }])).toBe('done')
    expect(workspacePageIndexNextStatusId({ status: 'done' }, 1, [{ id: 'active' }, { id: 'done' }])).toBe('')
  })
})