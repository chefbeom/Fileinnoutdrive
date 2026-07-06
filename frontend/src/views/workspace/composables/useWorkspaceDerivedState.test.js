import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceDerivedState } from './useWorkspaceDerivedState.js'

describe('useWorkspaceDerivedState', () => {
  it('derives validation, user, save, and presence state from refs', () => {
    const title = ref(' Roadmap ')
    const titleDirty = ref(false)
    const isEditorDirty = ref(true)
    const workspaceId = ref(77)
    const activeUsers = ref([
      { userIdx: 1, status: 'active' },
      { userIdx: 2, status: 'away' },
      { userIdx: 3, status: 'active' },
      { userIdx: 4, status: 'active' },
      { userIdx: 5, status: 'active' },
    ])
    const saveState = ref('saving')

    const subject = useWorkspaceDerivedState({
      currentUser: () => ({ email: 'USER@Example.COM' }),
      route: { params: { id: 'route-id' } },
      title,
      titleDirty,
      isEditorDirty,
      workspaceId,
      activeUsers,
      saveState,
    })

    expect(subject.currentUserState.value.email).toBe('USER@Example.COM')
    expect(subject.currentUserEmail.value).toBe('user@example.com')
    expect(subject.isValid.value).toBe(true)
    expect(subject.hasUnsavedChanges.value).toBe(true)
    expect(subject.currentWorkspaceKey.value).toBe('77')
    expect(subject.activeUserPreview.value).toHaveLength(4)
    expect(subject.extraActiveUserCount.value).toBe(1)
    expect([...subject.activeWorkspaceUserIds.value]).toEqual(['1', '2', '3', '4', '5'])
    expect(subject.presenceSummaryLabel.value).toContain('4')
    expect(subject.isSaving.value).toBe(true)
  })

  it('falls back to route key and resolves relation sources lazily', () => {
    const breadcrumbs = ref([{ id: 'parent' }])
    const children = ref([{ id: 'child' }])
    const links = ref([{ id: 'linked' }])
    const backlinks = ref([{ id: 'backlink' }])

    const subject = useWorkspaceDerivedState({
      currentUser: ref({}),
      route: { params: { id: 'route-id' } },
      title: ref(''),
      workspaceId: ref(null),
      activeUsers: ref([]),
      workspacePageBreadcrumbTrail: () => breadcrumbs.value,
      currentWorkspaceChildPages: () => children.value,
      linkedWorkspaceDocuments: () => links.value,
      workspaceBacklinks: () => backlinks.value,
    })

    expect(subject.currentWorkspaceKey.value).toBe('route-id')
    expect(subject.isValid.value).toBe(false)
    expect(subject.workspaceRelationCount.value).toBe(4)

    backlinks.value = []
    expect(subject.workspaceRelationCount.value).toBe(3)
  })
})
