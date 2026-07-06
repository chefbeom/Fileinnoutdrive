import { describe, expect, it } from 'vitest'
import { isRef } from 'vue'
import { useWorkspaceState } from './useWorkspaceState.js'

describe('useWorkspaceState', () => {
  it('exposes workspace state as refs with stable defaults', () => {
    const state = useWorkspaceState()

    expect(Object.values(state).every(isRef)).toBe(true)
    expect(state.title.value).toBe('')
    expect(state.saveState.value).toBe('idle')
    expect(state.workspaceShareStatus.value).toBe('Private')
    expect(state.workspacePropertyIcon.value).toBe('📄')
    expect(state.workspacePropertyCoverColor.value).toBe('blue')
    expect(state.workspacePropertyStatus.value).toBe('planning')
    expect(state.workspacePropertyPriority.value).toBe('normal')
    expect(state.workspaceAccessRole.value).toBe('ADMIN')
    expect(state.workspaceCommentFilter.value).toBe('open')
    expect(state.workspaceTaskFilter.value).toBe('open')
    expect(state.workspaceInboxFilter.value).toBe('mine')
    expect(state.workspaceCalendarFilter.value).toBe('upcoming')
    expect(state.workspaceTimelineFilter.value).toBe('open')
    expect(state.workspacePageIndexFilter.value).toBe('all')
    expect(state.workspacePageIndexSort.value).toBe('updated-desc')
    expect(state.activeWorkspacePanelTab.value).toBe('all')
    expect(state.isWorkspacePanelCollapsed.value).toBe(false)
  })

  it('keeps external integration refs nullable until mounted', () => {
    const state = useWorkspaceState()

    expect(state.editorHolder.value).toBeNull()
    expect(state.editorApi.value).toBeNull()
    expect(state.workspaceSectionEditInput.value).toBeNull()
    expect(state.imageInput.value).toBeNull()
    expect(state.fileInput.value).toBeNull()
    expect(state.workspaceCommentInput.value).toBeNull()
    expect(state.workspaceSubpageInput.value).toBeNull()
    expect(state.workspaceId.value).toBeNull()
    expect(state.lastSavedAt.value).toBeNull()
    expect(state.openRoleDropdownId.value).toBeNull()
  })

  it('creates independent mutable collections per instance', () => {
    const first = useWorkspaceState()
    const second = useWorkspaceState()

    first.workspaceAssets.value.push({ id: 1 })
    first.workspaceComments.value.push({ id: 2 })
    first.workspacePageIndexRows.value.push({ id: 3 })
    first.workspacePageIndexSelectedIds.value.push(4)
    first.togglingWorkspaceTaskIds.value.push('task-1')

    expect(second.workspaceAssets.value).toEqual([])
    expect(second.workspaceComments.value).toEqual([])
    expect(second.workspacePageIndexRows.value).toEqual([])
    expect(second.workspacePageIndexSelectedIds.value).toEqual([])
    expect(second.togglingWorkspaceTaskIds.value).toEqual([])
  })
})
