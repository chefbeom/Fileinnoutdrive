import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import {
  useWorkspacePageIndexFilters,
  workspacePageIndexSortOptions,
} from './useWorkspacePageIndexFilters.js'

describe('useWorkspacePageIndexFilters', () => {
  it('builds filter counts and filter option lists', () => {
    const workspacePageIndexRows = ref([
      { id: 1, title: 'Alpha', status: 'active', scope: 'personal', tags: ['frontend'], ownerEmail: 'a@example.com', ownerName: 'A' },
      { id: 2, title: 'Beta', status: 'blocked', scope: 'shared', tags: ['frontend', 'ops'], ownerEmail: '', ownerName: '' },
      { id: 3, title: 'Gamma', status: 'done', scope: 'shared', tags: ['ops'], ownerEmail: 'b@example.com', ownerName: 'B', isOverdue: true },
    ])

    const subject = useWorkspacePageIndexFilters({ workspacePageIndexRows })

    expect(subject.workspacePageIndexFilterOptions.value.map(({ id, count }) => [id, count])).toEqual([
      ['all', 3],
      ['active', 1],
      ['blocked', 1],
      ['overdue', 1],
      ['shared', 2],
    ])
    expect(subject.workspacePageIndexTagOptions.value.map(({ id, count }) => [id, count])).toEqual([
      ['frontend', 2],
      ['ops', 2],
    ])
    expect(subject.workspacePageIndexOwnerFilterOptions.value.map(({ id, count }) => [id, count])).toEqual([
      ['__unassigned__', 1],
      ['a@example.com', 1],
      ['b@example.com', 1],
    ])
    expect(workspacePageIndexSortOptions.map((option) => option.id)).toEqual([
      'updated-desc',
      'due-asc',
      'priority-desc',
      'title-asc',
    ])
  })

  it('filters visible rows and augments owner options per row', () => {
    const workspacePageIndexRows = ref([
      {
        id: 1,
        title: 'Alpha',
        preview: 'search target',
        status: 'active',
        priority: 'high',
        tags: ['frontend'],
        ownerEmail: 'a@example.com',
        ownerName: 'A',
        updatedAt: '2026-01-02T00:00:00Z',
      },
      {
        id: 2,
        title: 'Beta',
        preview: 'other',
        status: 'blocked',
        priority: 'low',
        tags: ['ops'],
        ownerEmail: 'legacy@example.com',
        ownerName: 'Legacy',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ])
    const subject = useWorkspacePageIndexFilters({
      workspacePageIndexRows,
      workspacePageIndexFilter: ref('active'),
      workspacePageIndexQuery: ref('target'),
      workspacePageIndexTagFilter: ref('frontend'),
      workspacePageIndexOwnerFilter: ref('a@example.com'),
      workspacePageIndexSort: ref('updated-desc'),
      priorityOptions: ref([{ id: 'low' }, { id: 'high' }]),
      workspacePropertyOwnerCandidates: ref([{ email: 'a@example.com', name: 'A' }]),
    })

    expect(subject.visibleWorkspacePageIndexRows.value.map((row) => row.id)).toEqual([1])
    expect(subject.workspacePageIndexOwnerOptions(workspacePageIndexRows.value[1])).toEqual([
      { email: 'a@example.com', name: 'A' },
      { email: 'legacy@example.com', name: 'Legacy' },
    ])
  })
})
