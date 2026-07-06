import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import {
  createWorkspaceFloatingPanelMutableValues,
  createWorkspaceFloatingPanelValueSetter,
  useWorkspaceFloatingPanelStackBridge,
} from './useWorkspaceFloatingPanelStackBridge.js'

describe('useWorkspaceFloatingPanelStackBridge', () => {
  it('updates registered mutable refs by key', () => {
    const activeWorkspacePanelTab = ref('home')
    const workspaceFullTextQuery = ref('')
    const setter = createWorkspaceFloatingPanelValueSetter(createWorkspaceFloatingPanelMutableValues({
      activeWorkspacePanelTab,
      workspaceFullTextQuery,
    }))

    setter('activeWorkspacePanelTab', 'database')
    setter('workspaceFullTextQuery', 'budget')
    setter('missing', 'ignored')

    expect(activeWorkspacePanelTab.value).toBe('database')
    expect(workspaceFullTextQuery.value).toBe('budget')
  })

  it('builds a stack model from refs and plain functions', () => {
    const context = {
      activeWorkspacePanelTab: ref('all'),
      isWorkspacePanelCollapsed: ref(false),
      workspacePanelTabs: ref([{ id: 'home' }]),
      workspacePageIndexLoading: ref(false),
      documentStats: ref({ blockCount: 5 }),
      workspaceFullTextQuery: ref('roadmap'),
      editorApi: ref({}),
      workspacePropertyStatusOptions: [{ value: 'TODO' }],
      workspacePropertyPriorityOptions: [{ value: 'HIGH' }],
      workspaceTaskTodayKey: () => '2026-07-06',
      openWorkspaceIndexedTasks: ref([{ id: 'task-1' }, { id: 'task-2' }]),
      workspaceQuickBlockOptions: [{ id: 'text' }],
    }

    const { workspaceFloatingPanelStackModel } = useWorkspaceFloatingPanelStackBridge(context)
    const model = workspaceFloatingPanelStackModel.value

    expect(model.activeWorkspacePanelTab).toBe('all')
    expect(model.workspacePanelTabs).toEqual([{ id: 'home' }])
    expect(model.documentBlockCount).toBe(5)
    expect(model.workspaceFullTextQuery).toBe('roadmap')
    expect(model.hasEditor).toBe(true)
    expect(model.workspacePropertyStatusOptions).toEqual([{ value: 'TODO' }])
    expect(model.todayKey).toBe('2026-07-06')
    expect(model.inboxOpenTaskCount).toBe(2)
    expect(model.workspaceQuickBlockOptions).toEqual([{ id: 'text' }])
  })

  it('wraps row updates, member removal, and ref registration actions', () => {
    const workspacePageIndexFilter = ref('all')
    const updateWorkspacePageIndexRowProperties = vi.fn()
    const updateWorkspacePageIndexRowOwner = vi.fn()
    const handleRoleAction = vi.fn()
    const registerSubpageInput = vi.fn()
    const registerCommentInput = vi.fn()

    const { workspaceFloatingPanelStackActions } = useWorkspaceFloatingPanelStackBridge({
      workspacePageIndexFilter,
      updateWorkspacePageIndexRowProperties,
      updateWorkspacePageIndexRowOwner,
      removeWorkspaceMember: (member) => handleRoleAction(member, 'KICKED'),
      registerSubpageInput,
      registerCommentInput,
    })

    workspaceFloatingPanelStackActions.setValue('workspacePageIndexFilter', 'mine')
    workspaceFloatingPanelStackActions.updateWorkspacePageIndexRowStatus({ id: 1 }, 'DONE')
    workspaceFloatingPanelStackActions.updateWorkspacePageIndexRowPriority({ id: 2 }, 'LOW')
    workspaceFloatingPanelStackActions.updateWorkspacePageIndexRowDueDate({ id: 3 }, '2026-07-07')
    workspaceFloatingPanelStackActions.updateWorkspacePageIndexRowOwner({ id: 4 }, 'owner@example.com')
    workspaceFloatingPanelStackActions.removeWorkspaceMember({ email: 'member@example.com' })
    workspaceFloatingPanelStackActions.registerSubpageInput('subpage-ref')
    workspaceFloatingPanelStackActions.registerCommentInput('comment-ref')

    expect(workspacePageIndexFilter.value).toBe('mine')
    expect(updateWorkspacePageIndexRowProperties).toHaveBeenCalledWith({ id: 1 }, { status: 'DONE' })
    expect(updateWorkspacePageIndexRowProperties).toHaveBeenCalledWith({ id: 2 }, { priority: 'LOW' })
    expect(updateWorkspacePageIndexRowProperties).toHaveBeenCalledWith({ id: 3 }, { dueDate: '2026-07-07' })
    expect(updateWorkspacePageIndexRowOwner).toHaveBeenCalledWith({ id: 4 }, 'owner@example.com')
    expect(handleRoleAction).toHaveBeenCalledWith({ email: 'member@example.com' }, 'KICKED')
    expect(registerSubpageInput).toHaveBeenCalledWith('subpage-ref')
    expect(registerCommentInput).toHaveBeenCalledWith('comment-ref')
  })
})
