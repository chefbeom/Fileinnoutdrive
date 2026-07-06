import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspaceHomePanels: vi.fn(),
  useWorkspacePeopleOptions: vi.fn(),
  useWorkspaceTaskMutations: vi.fn(),
}))

vi.mock('./useWorkspaceHomePanels.js', () => ({ useWorkspaceHomePanels: mocks.useWorkspaceHomePanels }))
vi.mock('./useWorkspacePeopleOptions.js', () => ({ useWorkspacePeopleOptions: mocks.useWorkspacePeopleOptions }))
vi.mock('./useWorkspaceTaskMutations.js', () => ({ useWorkspaceTaskMutations: mocks.useWorkspaceTaskMutations }))

import { useWorkspacePeopleTaskSetup } from './useWorkspacePeopleTaskSetup.js'

describe('useWorkspacePeopleTaskSetup', () => {
  it('wires home panels, people options, and task mutations', () => {
    const workspaceMemberRows = { value: [{ id: 1 }] }
    const selectedWorkspaceTaskAssignee = { value: { email: 'admin@example.test' } }
    const api = { getPost: vi.fn(), savePost: vi.fn() }
    const persistWorkspace = vi.fn()
    const refreshWorkspaceDocuments = vi.fn()
    const refreshWorkspacePageIndex = vi.fn()
    const focusWorkspaceTaskItem = vi.fn()
    const showWorkspaceNotice = vi.fn()
    const currentUser = { value: { email: 'admin@example.test' } }
    const currentUserIdx = { value: 7 }
    const state = {
      workspaceMembers: { value: [] },
      workspacePropertyStatus: { value: 'todo' },
      workspacePropertyPriority: { value: 'high' },
      workspacePropertyCoverColor: { value: 'blue' },
      newWorkspaceTaskAssignee: { value: 'admin@example.test' },
      newWorkspaceTask: { value: 'Review' },
      newWorkspaceTaskDueDate: { value: '2026-07-06' },
      currentWorkspaceKey: { value: '42' },
    }

    mocks.useWorkspaceHomePanels.mockReturnValue({
      workspaceMemberRows,
      workspacePanelTabs: { value: [] },
    })
    mocks.useWorkspacePeopleOptions.mockReturnValue({
      selectedWorkspaceTaskAssignee,
      workspacePropertyTags: { value: [] },
    })
    mocks.useWorkspaceTaskMutations.mockReturnValue({
      addWorkspaceTask: vi.fn(),
    })

    const result = useWorkspacePeopleTaskSetup({
      platform: { api },
      state,
      options: {
        statusOptions: [{ id: 'todo' }],
        priorityOptions: [{ id: 'high' }],
        coverColorOptions: [{ id: 'blue' }],
        quickBlockOptions: [{ id: 'todo' }],
      },
      presence: {
        activeWorkspaceUserIds: { value: new Set(['7']) },
        activeUsers: { value: [] },
      },
      user: {
        currentUser,
        currentUserIdx,
        currentUserEmail: { value: 'admin@example.test' },
      },
      planning: {
        workspacePageIndexRows: { value: [] },
        workspaceIndexedTasks: { value: [] },
        openWorkspaceIndexedTasks: { value: [] },
        myWorkspaceIndexedTasks: { value: [] },
      },
      document: {
        documentStats: { value: {} },
        documentOutline: { value: [] },
        documentTaskSummaryLabel: { value: '0 tasks' },
        openDocumentTasks: { value: [] },
        documentTaskProgress: { value: 0 },
      },
      assets: {
        workspaceAssets: { value: [] },
        workspaceImages: { value: [] },
        workspaceFiles: { value: [] },
      },
      comments: {
        unresolvedWorkspaceComments: { value: [] },
        resolvedWorkspaceComments: { value: [] },
        mentionedWorkspaceComments: { value: [] },
        workspaceComments: { value: [] },
      },
      access: { canModifyWorkspacePage: { value: true } },
      persistence: { persistWorkspace },
      refreshers: { refreshWorkspaceDocuments, refreshWorkspacePageIndex },
      focus: { focusWorkspaceTaskItem },
      ui: { showWorkspaceNotice },
      formatters: {
        initialFor: vi.fn(),
        formatDateTimeFor: vi.fn(),
      },
    })

    expect(mocks.useWorkspaceHomePanels).toHaveBeenCalledWith(expect.objectContaining({
      workspaceMembers: state.workspaceMembers,
      currentUserIdx,
      currentUser,
      quickBlockOptions: [{ id: 'todo' }],
    }))
    expect(mocks.useWorkspacePeopleOptions).toHaveBeenCalledWith(expect.objectContaining({
      workspaceMemberRows,
      currentUser,
      workspacePropertyStatus: state.workspacePropertyStatus,
    }))
    expect(mocks.useWorkspaceTaskMutations).toHaveBeenCalledWith(expect.objectContaining({
      currentWorkspaceKey: state.currentWorkspaceKey,
      selectedWorkspaceTaskAssignee,
      persistWorkspace,
      refreshWorkspaceDocuments,
      refreshWorkspacePageIndex,
      focusWorkspaceTaskItem,
      showWorkspaceNotice,
    }))
    expect(result).toMatchObject({
      workspaceMemberRows,
      selectedWorkspaceTaskAssignee,
    })
  })
})
