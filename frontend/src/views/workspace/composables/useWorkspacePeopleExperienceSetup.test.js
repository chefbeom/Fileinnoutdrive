import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useWorkspacePeopleTaskSetup: vi.fn(),
}))

vi.mock('./useWorkspacePeopleTaskSetup.js', () => ({
  useWorkspacePeopleTaskSetup: mocks.useWorkspacePeopleTaskSetup,
}))

import {
  createWorkspacePeopleExperienceGroups,
  useWorkspacePeopleExperienceSetup,
} from './useWorkspacePeopleExperienceSetup.js'

describe('useWorkspacePeopleExperienceSetup', () => {
  it('maps workspace state and derived people/task dependencies into setup groups', () => {
    const workspaceState = {
      workspaceMembers: { value: [] },
      workspaceMemberRefreshedAt: { value: null },
      lastSavedAt: { value: null },
      newWorkspaceTaskAssignee: { value: '' },
      workspacePropertyTagsInput: { value: '' },
      workspacePropertyOwnerEmail: { value: 'admin@example.test' },
      workspacePropertyOwnerName: { value: 'Admin' },
      workspacePropertyStatus: { value: 'todo' },
      workspacePropertyPriority: { value: 'high' },
      workspacePropertyCoverColor: { value: 'blue' },
      togglingWorkspaceTaskIds: { value: new Set() },
      togglingWorkspaceInboxTaskIds: { value: new Set() },
      editorApi: { value: {} },
      newWorkspaceTask: { value: 'Review' },
      newWorkspaceTaskDueDate: { value: '2026-07-06' },
      workspaceTaskAdding: { value: false },
      workspacePageIndexRows: { value: [{ id: 1 }] },
      workspaceAssets: { value: [{ id: 2 }] },
      workspaceComments: { value: [{ id: 3 }] },
    }
    const planning = {
      currentWorkspaceKey: { value: 'workspace-1' },
      workspaceIndexedTasks: { value: [] },
      openWorkspaceIndexedTasks: { value: [] },
      myWorkspaceIndexedTasks: { value: [] },
      overdueWorkspaceCalendarItems: { value: [] },
      workspaceFullTextResults: { value: [] },
      workspaceRelationCount: () => 4,
    }

    const groups = createWorkspacePeopleExperienceGroups({
      workspaceState,
      planning,
      options: {
        quickBlockOptions: [{ id: 'todo' }],
        statusOptions: () => [{ id: 'todo' }],
      },
      assets: {
        workspaceImages: { value: [] },
        workspaceFiles: { value: [] },
      },
      comments: {
        unresolvedWorkspaceComments: { value: [] },
        resolvedWorkspaceComments: { value: [] },
        mentionedWorkspaceComments: { value: [] },
      },
    })

    expect(groups.state).toMatchObject({
      workspaceMembers: { value: [] },
      currentWorkspaceKey: { value: 'workspace-1' },
      newWorkspaceTask: { value: 'Review' },
    })
    expect(groups.planning).toMatchObject({
      workspacePageIndexRows: { value: [{ id: 1 }] },
      workspaceIndexedTasks: { value: [] },
    })
    expect(groups.assets).toMatchObject({
      workspaceAssets: { value: [{ id: 2 }] },
      workspaceImages: { value: [] },
    })
    expect(groups.comments).toMatchObject({
      workspaceComments: { value: [{ id: 3 }] },
      unresolvedWorkspaceComments: { value: [] },
    })
    expect(groups.options.quickBlockOptions).toEqual([{ id: 'todo' }])
    expect(groups.options.statusOptions).toEqual(expect.any(Function))
  })

  it('delegates mapped groups to useWorkspacePeopleTaskSetup', () => {
    const platform = { api: { getPost: vi.fn() } }
    const workspaceState = { workspaceMembers: { value: [] } }
    const user = { currentUserEmail: { value: 'admin@example.test' } }
    const result = { workspaceMemberRows: { value: [] }, addWorkspaceTask: vi.fn() }
    mocks.useWorkspacePeopleTaskSetup.mockReturnValue(result)

    expect(useWorkspacePeopleExperienceSetup({ platform, workspaceState, user })).toBe(result)
    expect(mocks.useWorkspacePeopleTaskSetup).toHaveBeenCalledWith(expect.objectContaining({
      platform,
      user,
      state: expect.objectContaining({ workspaceMembers: { value: [] } }),
    }))
  })
})
