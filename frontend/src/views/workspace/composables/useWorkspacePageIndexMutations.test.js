import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

import { useWorkspacePageIndexMutations } from './useWorkspacePageIndexMutations.js'

const createDataTransfer = (initial = '') => {
  let value = initial
  return {
    effectAllowed: '',
    setData: vi.fn((type, nextValue) => {
      if (type === 'text/plain') value = nextValue
    }),
    getData: vi.fn(() => value),
  }
}

const createSubject = (overrides = {}) => {
  const workspacePageIndexRows = ref([
    { id: 'current', title: 'Current', status: 'active', canEditProperties: true },
    { id: 'external', title: 'External', status: 'blocked', canEditProperties: true },
  ])
  const workspacePageIndexUpdatingIds = ref([])
  const workspacePageIndexError = ref('')
  const workspaceBoardDraggingId = ref('')
  const workspaceBoardDragOverStatus = ref('')
  const selectedWorkspacePageIndexRows = ref([workspacePageIndexRows.value[1]])

  const fetchWorkspaceDocument = vi.fn(async (id) => ({ title: `Fetched ${id}`, contents: `contents-${id}` }))
  const saveWorkspaceDocument = vi.fn(async () => ({}))
  const applyWorkspaceProperties = vi.fn()
  const persistWorkspace = vi.fn(async () => 'current')
  const refreshWorkspaceDocuments = vi.fn(async () => {})
  const refreshWorkspacePageIndex = vi.fn(async () => {})
  const clearWorkspacePageIndexSelection = vi.fn()

  const state = {
    workspacePageIndexRows,
    workspacePageIndexUpdatingIds,
    workspacePageIndexError,
    workspaceBoardDraggingId,
    workspaceBoardDragOverStatus,
    currentWorkspaceKey: ref('current'),
    editorApi: ref({ savePost: vi.fn() }),
    fetchWorkspaceDocument,
    saveWorkspaceDocument,
    extractWorkspacePropertiesFromContents: vi.fn(() => ({ status: 'active', tags: ['old'] })),
    normalizeWorkspaceProperties: vi.fn((properties) => properties),
    applyWorkspaceProperties,
    serializeWorkspaceSnapshotWithProperties: vi.fn((contents, properties) => JSON.stringify({ contents, properties })),
    persistWorkspace,
    refreshWorkspaceDocuments,
    refreshWorkspacePageIndex,
    workspacePageIndexOwnerOptions: vi.fn(() => [{ email: 'owner@example.com', name: 'Owner' }]),
    selectedWorkspacePageIndexRows,
    canApplyWorkspacePageIndexBulkUpdate: computed(() => true),
    clearWorkspacePageIndexSelection,
    workspacePageIndexBulkStatus: ref('done'),
    workspacePageIndexBulkPriority: ref('high'),
    workspacePageIndexBulkOwnerEmail: ref('owner@example.com'),
    workspacePageIndexBulkDueDate: ref('2026-07-04'),
    workspacePageIndexBulkClearDueDate: ref(false),
    workspacePageIndexBulkUpdating: ref(false),
    workspacePropertyOwnerCandidates: ref([{ email: 'owner@example.com', name: 'Owner' }]),
    statusOptions: ref([{ id: 'active' }, { id: 'blocked' }, { id: 'done' }]),
    ...overrides,
  }

  return {
    state,
    subject: useWorkspacePageIndexMutations(state),
  }
}

describe('useWorkspacePageIndexMutations', () => {
  it('updates the current page through local properties and persistence', async () => {
    const { state, subject } = createSubject()

    await expect(subject.updateWorkspacePageIndexRowProperties(
      state.workspacePageIndexRows.value[0],
      { priority: 'high' },
    )).resolves.toBe(true)

    expect(state.applyWorkspaceProperties).toHaveBeenCalledWith({
      status: 'active',
      tags: ['old'],
      priority: 'high',
    })
    expect(state.persistWorkspace).toHaveBeenCalledWith({ navigateNewDocument: false })
    expect(state.saveWorkspaceDocument).not.toHaveBeenCalled()
    expect(state.refreshWorkspacePageIndex).toHaveBeenCalledTimes(1)
    expect(state.workspacePageIndexUpdatingIds.value).toEqual([])
  })

  it('updates an external page owner and tags through the document API', async () => {
    const { state, subject } = createSubject()
    const row = state.workspacePageIndexRows.value[1]

    await expect(subject.updateWorkspacePageIndexRowOwner(row, { target: { value: 'owner@example.com' } }))
      .resolves.toBe(true)
    await expect(subject.updateWorkspacePageIndexRowTags(row, { target: { value: 'alpha, beta' } }))
      .resolves.toBe(true)

    expect(state.saveWorkspaceDocument).toHaveBeenCalledWith({
      idx: 'external',
      title: 'Fetched external',
      contents: JSON.stringify({
        contents: 'contents-external',
        properties: {
          status: 'active',
          tags: ['old'],
          ownerEmail: 'owner@example.com',
          ownerName: 'Owner',
        },
      }),
    })
    expect(state.saveWorkspaceDocument).toHaveBeenLastCalledWith({
      idx: 'external',
      title: 'Fetched external',
      contents: JSON.stringify({
        contents: 'contents-external',
        properties: {
          status: 'active',
          tags: ['alpha', 'beta'],
        },
      }),
    })
    expect(state.refreshWorkspaceDocuments).toHaveBeenCalledTimes(2)
    expect(state.refreshWorkspacePageIndex).toHaveBeenCalledTimes(2)
  })

  it('applies bulk page index properties and clears selection state', async () => {
    const { state, subject } = createSubject()

    await expect(subject.updateWorkspacePageIndexBulkProperties()).resolves.toBe(true)

    expect(state.saveWorkspaceDocument).toHaveBeenCalledWith({
      idx: 'external',
      title: 'Fetched external',
      contents: JSON.stringify({
        contents: 'contents-external',
        properties: {
          status: 'done',
          tags: ['old'],
          priority: 'high',
          ownerEmail: 'owner@example.com',
          ownerName: 'Owner',
          dueDate: '2026-07-04',
        },
      }),
    })
    expect(state.clearWorkspacePageIndexSelection).toHaveBeenCalledTimes(1)
    expect(state.workspacePageIndexBulkUpdating.value).toBe(false)
  })

  it('moves board cards with drag and drop state', async () => {
    const { state, subject } = createSubject()
    const row = state.workspacePageIndexRows.value[1]
    const dataTransfer = createDataTransfer()

    expect(subject.startWorkspaceBoardCardDrag({ dataTransfer }, row)).toBe(true)
    expect(state.workspaceBoardDraggingId.value).toBe('external')
    expect(state.workspaceBoardDragOverStatus.value).toBe('blocked')
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'external')

    subject.setWorkspaceBoardDropTarget('done')
    expect(state.workspaceBoardDragOverStatus.value).toBe('done')

    await expect(subject.dropWorkspaceBoardCardStatus({ dataTransfer }, 'done')).resolves.toBe(true)

    expect(state.saveWorkspaceDocument).toHaveBeenCalledWith({
      idx: 'external',
      title: 'Fetched external',
      contents: JSON.stringify({
        contents: 'contents-external',
        properties: {
          status: 'done',
          tags: ['old'],
        },
      }),
    })
    expect(state.workspaceBoardDraggingId.value).toBe('')
    expect(state.workspaceBoardDragOverStatus.value).toBe('')
  })
})
