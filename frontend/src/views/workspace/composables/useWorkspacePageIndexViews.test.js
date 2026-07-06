import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

import { useWorkspacePageIndexViews } from './useWorkspacePageIndexViews.js'

const createSubject = () => {
  const workspacePageIndexViews = ref([
    {
      id: 'open-view',
      name: 'Open',
      filter: 'active',
      query: '',
      tag: '',
      owner: '',
      sort: 'updated-desc',
    },
  ])
  const workspacePageIndexViewName = ref('')
  const workspacePageIndexFilter = ref('all')
  const workspacePageIndexQuery = ref('')
  const workspacePageIndexTagFilter = ref('')
  const workspacePageIndexOwnerFilter = ref('')
  const workspacePageIndexSort = ref('updated-desc')
  const persistWorkspacePageIndexViews = vi.fn()

  const subject = useWorkspacePageIndexViews({
    workspacePageIndexViews,
    workspacePageIndexViewName,
    workspacePageIndexFilter,
    workspacePageIndexQuery,
    workspacePageIndexTagFilter,
    workspacePageIndexOwnerFilter,
    workspacePageIndexSort,
    workspacePageIndexFilterOptions: computed(() => [
      { id: 'all', label: 'All' },
      { id: 'active', label: 'Active' },
    ]),
    workspacePageIndexSortOptions: [
      { id: 'updated-desc', label: 'Recently updated' },
      { id: 'title-asc', label: 'Title' },
    ],
    workspacePageIndexOwnerFilterOptions: computed(() => [
      { id: 'me@example.com', label: 'Me' },
    ]),
    persistWorkspacePageIndexViews,
  })

  return {
    subject,
    workspacePageIndexViews,
    workspacePageIndexViewName,
    workspacePageIndexFilter,
    workspacePageIndexQuery,
    workspacePageIndexTagFilter,
    workspacePageIndexOwnerFilter,
    workspacePageIndexSort,
    persistWorkspacePageIndexViews,
  }
}

describe('useWorkspacePageIndexViews', () => {
  it('detects the active saved view from the current filter signature', () => {
    const { subject, workspacePageIndexFilter } = createSubject()

    expect(subject.activeWorkspacePageIndexView.value).toBeNull()
    workspacePageIndexFilter.value = 'active'

    expect(subject.activeWorkspacePageIndexView.value?.id).toBe('open-view')
  })

  it('creates normalized saved views and clears the draft name', () => {
    const {
      subject,
      workspacePageIndexViews,
      workspacePageIndexViewName,
      workspacePageIndexFilter,
      workspacePageIndexQuery,
      workspacePageIndexTagFilter,
      workspacePageIndexOwnerFilter,
      workspacePageIndexSort,
      persistWorkspacePageIndexViews,
    } = createSubject()
    workspacePageIndexViewName.value = ' Mine '
    workspacePageIndexFilter.value = 'blocked'
    workspacePageIndexQuery.value = ' roadmap '
    workspacePageIndexTagFilter.value = ' Ops '
    workspacePageIndexOwnerFilter.value = ' Me@Example.com '
    workspacePageIndexSort.value = 'title-asc'

    subject.createWorkspacePageIndexView()

    expect(workspacePageIndexViewName.value).toBe('')
    expect(workspacePageIndexViews.value).toHaveLength(2)
    expect(workspacePageIndexViews.value[1]).toMatchObject({
      name: 'Mine',
      filter: 'blocked',
      query: 'roadmap',
      tag: 'ops',
      owner: 'me@example.com',
      sort: 'title-asc',
    })
    expect(persistWorkspacePageIndexViews).toHaveBeenCalledTimes(1)
  })

  it('prevents duplicate saved view names', () => {
    const { subject, workspacePageIndexViewName, workspacePageIndexViews } = createSubject()
    workspacePageIndexViewName.value = ' open '

    expect(subject.canCreateWorkspacePageIndexView.value).toBe(false)
    subject.createWorkspacePageIndexView()

    expect(workspacePageIndexViews.value).toHaveLength(1)
  })

  it('applies saved view filters to the current page index controls', () => {
    const {
      subject,
      workspacePageIndexFilter,
      workspacePageIndexQuery,
      workspacePageIndexTagFilter,
      workspacePageIndexOwnerFilter,
      workspacePageIndexSort,
    } = createSubject()

    subject.applyWorkspacePageIndexView({
      filter: 'active',
      query: ' owner ',
      tag: 'Team',
      owner: 'Me@Example.com',
      sort: 'title-asc',
    })

    expect(workspacePageIndexFilter.value).toBe('active')
    expect(workspacePageIndexQuery.value).toBe('owner')
    expect(workspacePageIndexTagFilter.value).toBe('team')
    expect(workspacePageIndexOwnerFilter.value).toBe('me@example.com')
    expect(workspacePageIndexSort.value).toBe('title-asc')
  })

  it('summarizes and removes saved views', () => {
    const { subject, workspacePageIndexViews, persistWorkspacePageIndexViews } = createSubject()

    expect(subject.workspacePageIndexViewSummary(workspacePageIndexViews.value[0]))
      .toContain('Active')

    subject.removeWorkspacePageIndexView({ id: 'open-view' })

    expect(workspacePageIndexViews.value).toEqual([])
    expect(persistWorkspacePageIndexViews).toHaveBeenCalledTimes(1)
  })
})
