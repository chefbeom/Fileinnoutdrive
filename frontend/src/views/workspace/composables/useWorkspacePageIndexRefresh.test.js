import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useWorkspacePageIndexRefresh } from './useWorkspacePageIndexRefresh.js'

const createSubject = (overrides = {}) => {
  const fetchWorkspaceDocument = vi.fn(async (id) => ({
    title: `Fetched ${id}`,
    contents: JSON.stringify({
      blocks: [
        { id: `body-${id}`, type: 'paragraph', data: { text: `Preview ${id}` } },
      ],
      meta: {
        workspaceProperties: {
          status: id === 'a' ? 'active' : 'done',
          priority: id === 'a' ? 'high' : 'normal',
          ownerEmail: id === 'a' ? 'owner@example.com' : '',
          dueDate: id === 'a' ? '2026-07-04' : '',
          tags: ['docs'],
        },
      },
    }),
    updatedAt: id === 'a' ? '2026-07-04T09:00:00Z' : '2026-07-03T09:00:00Z',
    accessRole: 'WRITE',
  }))
  const statusOptions = [
    { id: 'active', label: '진행' },
    { id: 'done', label: '완료' },
  ]
  const priorityOptions = [
    { id: 'normal', label: '보통' },
    { id: 'high', label: '높음' },
  ]
  const state = {
    workspaceDocuments: ref([
      { id: 'b', title: 'B', scope: 'personal', role: 'WRITE', updatedAt: '2026-07-03T09:00:00Z' },
      { id: 'a', title: 'A', scope: 'personal', role: 'WRITE', updatedAt: '2026-07-04T09:00:00Z' },
    ]),
    workspacePageIndexRows: ref([]),
    workspacePageIndexLoading: ref(false),
    workspacePageIndexError: ref(''),
    workspacePageIndexRefreshedAt: ref(null),
    fetchWorkspaceDocument,
    propertyOptions: ref({ statusOptions, priorityOptions }),
    statusOptions: ref(statusOptions),
    priorityOptions: ref(priorityOptions),
    now: () => '2026-07-04T10:00:00.000Z',
    ...overrides,
  }

  return {
    state,
    subject: useWorkspacePageIndexRefresh(state),
  }
}

describe('useWorkspacePageIndexRefresh', () => {
  it('loads page index rows sorted by update time', async () => {
    const { state, subject } = createSubject()

    await expect(subject.refreshWorkspacePageIndex()).resolves.toHaveLength(2)

    expect(state.fetchWorkspaceDocument).toHaveBeenCalledTimes(2)
    expect(state.workspacePageIndexRows.value.map((row) => row.id)).toEqual(['a', 'b'])
    expect(state.workspacePageIndexRows.value[0]).toMatchObject({
      title: 'Fetched a',
      status: 'active',
      priority: 'high',
      ownerEmail: 'owner@example.com',
      statusLabel: '진행',
      priorityLabel: '높음',
      canEditProperties: true,
    })
    expect(state.workspacePageIndexRefreshedAt.value).toBe('2026-07-04T10:00:00.000Z')
    expect(state.workspacePageIndexLoading.value).toBe(false)
    expect(state.workspacePageIndexError.value).toBe('')
  })

  it('clears rows and loading state when there are no documents', async () => {
    const { state, subject } = createSubject({
      workspaceDocuments: ref([]),
      workspacePageIndexRows: ref([{ id: 'old' }]),
      workspacePageIndexLoading: ref(true),
      workspacePageIndexError: ref('old error'),
    })

    await expect(subject.refreshWorkspacePageIndex()).resolves.toEqual([])

    expect(state.workspacePageIndexRows.value).toEqual([])
    expect(state.workspacePageIndexLoading.value).toBe(false)
    expect(state.workspacePageIndexError.value).toBe('')
    expect(state.fetchWorkspaceDocument).not.toHaveBeenCalled()
  })

  it('keeps fulfilled rows and reports failed document loads', async () => {
    const fetchWorkspaceDocument = vi.fn(async (id) => {
      if (id === 'b') throw new Error('boom')
      return {
        title: 'Fetched A',
        contents: JSON.stringify({ blocks: [], meta: { workspaceProperties: { status: 'active' } } }),
        updatedAt: '2026-07-04T09:00:00Z',
        accessRole: 'WRITE',
      }
    })
    const { state, subject } = createSubject({ fetchWorkspaceDocument })

    await expect(subject.refreshWorkspacePageIndex()).resolves.toHaveLength(1)

    expect(state.workspacePageIndexRows.value.map((row) => row.id)).toEqual(['a'])
    expect(state.workspacePageIndexError.value).toBe('1개 페이지 속성을 불러오지 못했습니다.')
    expect(state.workspacePageIndexLoading.value).toBe(false)
  })
})
