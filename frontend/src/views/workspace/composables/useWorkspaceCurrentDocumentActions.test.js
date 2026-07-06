import { reactive, ref } from 'vue'
import { describe, expect, it } from 'vitest'

import { useWorkspaceCurrentDocumentActions } from './useWorkspaceCurrentDocumentActions.js'

describe('useWorkspaceCurrentDocumentActions', () => {
  it('builds the current link document from indexed data and page state', () => {
    const workspaceId = ref('page-1')
    const title = ref('Current Title')
    const workspaceAccessRole = ref('WRITE')
    const workspaceDocumentById = ref(new Map([
      ['page-1', { id: 'page-1', title: 'Indexed Title', role: 'READ', scope: 'shared' }],
    ]))
    const actions = useWorkspaceCurrentDocumentActions({
      workspaceId,
      title,
      workspaceDocumentById,
      workspaceAccessRole,
      documentUrlFor: (document) => `/workspace/read/${document.id}`,
      isFavoriteDocument: (document) => document?.id === 'page-1',
    })

    expect(actions.currentWorkspaceLinkDocument.value).toMatchObject({
      id: 'page-1',
      title: 'Current Title',
      role: 'READ',
      scope: 'shared',
    })
    expect(actions.canCopyCurrentWorkspaceDocumentLink.value).toBe(true)
    expect(actions.canFavoriteCurrentWorkspaceDocument.value).toBe(true)
    expect(actions.isCurrentWorkspaceDocumentFavorite.value).toBe(true)
    expect(actions.currentWorkspaceFavoriteTitle.value).toBe('\uC990\uACA8\uCC3E\uAE30 \uD574\uC81C')
  })

  it('falls back to the route id and labels for unsaved or unindexed pages', () => {
    const workspaceId = ref('')
    const route = reactive({ params: { id: 'new' } })
    const actions = useWorkspaceCurrentDocumentActions({
      workspaceId,
      route,
      title: ref(''),
      workspaceDocumentById: ref(new Map()),
      workspaceAccessRole: ref('ADMIN'),
      labels: {
        favoriteDisabledTitle: 'Save first',
        favoriteAddTitle: 'Add',
        favoriteRemoveTitle: 'Remove',
        untitledTitle: 'Untitled',
      },
    })

    expect(actions.currentWorkspaceLinkDocument.value).toBeNull()
    expect(actions.canCopyCurrentWorkspaceDocumentLink.value).toBe(false)
    expect(actions.canFavoriteCurrentWorkspaceDocument.value).toBe(false)
    expect(actions.currentWorkspaceFavoriteTitle.value).toBe('Save first')

    route.params.id = 'page-2'

    expect(actions.currentWorkspaceLinkDocument.value).toMatchObject({
      id: 'page-2',
      title: 'Untitled',
      role: 'ADMIN',
      scope: 'personal',
    })
    expect(actions.currentWorkspaceFavoriteTitle.value).toBe('Add')
  })

  it('disables copy when the document URL cannot be produced', () => {
    const actions = useWorkspaceCurrentDocumentActions({
      workspaceId: ref('page-1'),
      title: ref('Page'),
      workspaceDocumentById: ref(new Map()),
      workspaceAccessRole: ref('ADMIN'),
      documentUrlFor: () => '',
    })

    expect(actions.currentWorkspaceLinkDocument.value?.id).toBe('page-1')
    expect(actions.canCopyCurrentWorkspaceDocumentLink.value).toBe(false)
  })
})
