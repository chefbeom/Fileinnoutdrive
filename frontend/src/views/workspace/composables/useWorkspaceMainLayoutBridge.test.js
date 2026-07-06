import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import {
  createWorkspaceMainLayoutMutableValues,
  createWorkspaceMainLayoutValueSetter,
  useWorkspaceMainLayoutBridge,
} from './useWorkspaceMainLayoutBridge.js'

describe('useWorkspaceMainLayoutBridge', () => {
  it('updates registered mutable refs by key', () => {
    const workspaceDocumentQuery = ref('')
    const workspacePropertyIcon = ref('page')
    const setter = createWorkspaceMainLayoutValueSetter(createWorkspaceMainLayoutMutableValues({
      workspaceDocumentQuery,
      workspacePropertyIcon,
    }))

    setter('workspaceDocumentQuery', 'roadmap')
    setter('workspacePropertyIcon', 'doc')
    setter('missing', 'ignored')

    expect(workspaceDocumentQuery.value).toBe('roadmap')
    expect(workspacePropertyIcon.value).toBe('doc')
  })

  it('builds a main layout model from workspace refs and helper functions', () => {
    const page = { id: 11 }
    const context = {
      workspaceDocumentQuery: ref('query'),
      workspaceDocumentsLoading: ref(false),
      currentWorkspaceKey: ref('11'),
      favoriteWorkspaceDocuments: ref([{ id: 1 }]),
      canModifyWorkspacePage: ref(true),
      editorApi: ref({}),
      workspacePropertyIcon: ref('page'),
      title: ref('Spec'),
      workspaceAccessRole: ref('OWNER'),
      roleLabel: (role) => `role:${role}`,
      workspaceDocumentLinkCopiedId: ref(11),
      currentWorkspaceLinkDocument: ref(page),
      isWorkspaceDocumentLinkCopied: (document) => document.id === 11,
      workspaceAssets: ref([{ id: 'asset-1' }]),
      remoteCursors: ref([{ userId: 7 }]),
    }

    const { workspaceMainLayoutModel } = useWorkspaceMainLayoutBridge(context)
    const model = workspaceMainLayoutModel.value

    expect(model.documentQuery).toBe('query')
    expect(model.currentWorkspaceKey).toBe('11')
    expect(model.favoriteDocuments).toEqual([{ id: 1 }])
    expect(model.canModifyPage).toBe(true)
    expect(model.hasEditor).toBe(true)
    expect(model.icon).toBe('page')
    expect(model.title).toBe('Spec')
    expect(model.accessRoleLabel).toBe('role:OWNER')
    expect(model.linkCopied).toBe(true)
    expect(model.isLinkCopied).toBe(true)
    expect(model.assets).toEqual([{ id: 'asset-1' }])
    expect(model.remoteCursors).toEqual([{ userId: 7 }])
  })

  it('wraps normalization, current-link copy, and ref registration actions', () => {
    const workspacePropertyIcon = ref(' page ')
    const currentWorkspaceLinkDocument = ref({ id: 12 })
    const workspaceSectionEditInput = ref(null)
    const imageInput = ref(null)
    const copyWorkspaceDocumentLink = vi.fn()
    const handleRoleAction = vi.fn()

    const { workspaceMainLayoutActions } = useWorkspaceMainLayoutBridge({
      workspacePropertyIcon,
      currentWorkspaceLinkDocument,
      workspaceSectionEditInput,
      imageInput,
      normalizeWorkspacePageIcon: (icon) => icon.trim(),
      copyWorkspaceDocumentLink,
      handleRoleAction,
    })

    workspaceMainLayoutActions.normalizeWorkspacePageIcon()
    workspaceMainLayoutActions.copyCurrentWorkspaceDocumentLink()
    workspaceMainLayoutActions.handleRoleAction({ email: 'a@example.com' }, 'EDITOR')
    workspaceMainLayoutActions.registerSectionEditInput('section-input')
    workspaceMainLayoutActions.registerImageInput('image-input')

    expect(workspacePropertyIcon.value).toBe('page')
    expect(copyWorkspaceDocumentLink).toHaveBeenCalledWith({ id: 12 })
    expect(handleRoleAction).toHaveBeenCalledWith({ email: 'a@example.com' }, 'EDITOR')
    expect(workspaceSectionEditInput.value).toBe('section-input')
    expect(imageInput.value).toBe('image-input')
  })
})
