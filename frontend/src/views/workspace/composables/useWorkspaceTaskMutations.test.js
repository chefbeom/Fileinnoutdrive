import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceTaskMutations } from './useWorkspaceTaskMutations.js'

const createSnapshot = () => ({
  time: 1,
  blocks: [
    {
      id: 'block-1',
      type: 'list',
      data: {
        style: 'checklist',
        items: [
          {
            content: 'External task',
            checked: false,
            meta: { checked: false },
            data: { checked: false },
          },
        ],
      },
    },
  ],
  meta: { workspaceProperties: { status: 'active' } },
})

const createSubject = (overrides = {}) => {
  const snapshot = createSnapshot()
  const fetchWorkspaceDocument = vi.fn(async () => ({
    title: 'External document',
    contents: JSON.stringify(snapshot),
  }))
  const saveWorkspaceDocument = vi.fn(async () => ({}))
  const persistWorkspace = vi.fn(async () => 'current')
  const refreshWorkspaceDocuments = vi.fn(async () => {})
  const refreshWorkspacePageIndex = vi.fn(async () => {})
  const focusWorkspaceTaskItem = vi.fn(async () => {})
  const showWorkspaceNotice = vi.fn()
  const appendChecklistTask = vi.fn(async () => true)
  const toggleChecklistTask = vi.fn(async () => true)

  const state = {
    togglingWorkspaceTaskIds: ref([]),
    togglingWorkspaceInboxTaskIds: ref([]),
    canModifyWorkspacePage: ref(true),
    editorApi: ref({ appendChecklistTask, toggleChecklistTask }),
    currentWorkspaceKey: ref('current'),
    fetchWorkspaceDocument,
    saveWorkspaceDocument,
    persistWorkspace,
    refreshWorkspaceDocuments,
    refreshWorkspacePageIndex,
    focusWorkspaceTaskItem,
    showWorkspaceNotice,
    newWorkspaceTask: ref('Write test'),
    selectedWorkspaceTaskAssignee: ref({ email: 'owner@example.com', name: 'Owner' }),
    newWorkspaceTaskDueDate: ref('2026-07-04'),
    workspaceTaskAdding: ref(false),
    ...overrides,
  }

  return {
    state,
    subject: useWorkspaceTaskMutations(state),
  }
}

describe('useWorkspaceTaskMutations', () => {
  it('appends a workspace task and clears the draft', async () => {
    const { state, subject } = createSubject()

    await expect(subject.addWorkspaceTask()).resolves.toBe(true)

    expect(state.editorApi.value.appendChecklistTask).toHaveBeenCalledWith({
      text: 'Write test',
      assigneeEmail: 'owner@example.com',
      assigneeName: 'Owner',
      dueDate: '2026-07-04',
    })
    expect(state.newWorkspaceTask.value).toBe('')
    expect(state.workspaceTaskAdding.value).toBe(false)
    expect(state.showWorkspaceNotice).not.toHaveBeenCalled()
  })

  it('toggles a task on the current editor and clears busy state', async () => {
    const { state, subject } = createSubject()
    const task = { id: 'current:block-1:0' }

    await expect(subject.toggleWorkspaceTaskItem(task)).resolves.toBe(true)

    expect(state.editorApi.value.toggleChecklistTask).toHaveBeenCalledWith(task)
    expect(state.focusWorkspaceTaskItem).not.toHaveBeenCalled()
    expect(state.togglingWorkspaceTaskIds.value).toEqual([])
  })

  it('persists a current inbox task toggle through the editor', async () => {
    const { state, subject } = createSubject()
    const task = {
      id: 'current:block-1:0',
      documentId: 'current',
      documentRole: 'WRITE',
      checked: false,
    }

    await expect(subject.toggleWorkspaceInboxTask(task)).resolves.toBe(true)

    expect(state.editorApi.value.toggleChecklistTask).toHaveBeenCalledWith(task)
    expect(state.persistWorkspace).toHaveBeenCalledWith({ navigateNewDocument: false })
    expect(state.refreshWorkspacePageIndex).toHaveBeenCalledTimes(1)
    expect(state.saveWorkspaceDocument).not.toHaveBeenCalled()
    expect(state.togglingWorkspaceInboxTaskIds.value).toEqual([])
  })

  it('toggles an external inbox task in the stored snapshot', async () => {
    const { state, subject } = createSubject()
    const task = {
      id: 'external:block-1:0',
      documentId: 'external',
      documentTitle: 'Fallback title',
      documentRole: 'WRITE',
      anchorBlockId: 'block-1',
      blockIndex: 0,
      path: [0],
      checked: false,
    }

    await expect(subject.toggleWorkspaceCalendarTask({ type: 'task', task })).resolves.toBe(true)

    expect(state.fetchWorkspaceDocument).toHaveBeenCalledWith('external')
    const payload = state.saveWorkspaceDocument.mock.calls[0][0]
    expect(payload.idx).toBe('external')
    expect(payload.title).toBe('External document')
    const saved = JSON.parse(payload.contents)
    const item = saved.blocks[0].data.items[0]
    expect(item.meta.checked).toBe(true)
    expect(item.checked).toBe(true)
    expect(item.data.checked).toBe(true)
    expect(state.refreshWorkspaceDocuments).toHaveBeenCalledTimes(1)
    expect(state.refreshWorkspacePageIndex).toHaveBeenCalledTimes(1)
  })
})
