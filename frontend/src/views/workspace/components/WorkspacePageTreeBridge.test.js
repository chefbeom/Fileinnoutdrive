import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspacePageTreeBridge from './WorkspacePageTreeBridge.vue'

const treeNode = { id: 'page-1', title: 'Page' }

const stubs = {
  WorkspacePageTreePanel: defineComponent({
    emits: [
      'refresh',
      'toggle-node',
      'open-document',
      'open-rename',
      'open-subpage',
      'open-move',
      'copy-link',
      'insert-link',
      'rename-page',
      'cancel-rename',
      'move-page',
      'cancel-move',
      'create-subpage',
      'cancel-subpage',
      'update:query',
      'update:subpageTitle',
      'update:renameDraft',
      'update:moveTargetId',
    ],
    setup(_, { emit }) {
      return { emit, treeNode }
    },
    template: `
      <section class="page-tree-panel">
        <button class="refresh" @click="emit('refresh')">refresh</button>
        <button class="toggle" @click="emit('toggle-node', treeNode)">toggle</button>
        <button class="open-document" @click="emit('open-document', treeNode)">open</button>
        <button class="open-rename" @click="emit('open-rename', treeNode)">rename</button>
        <button class="open-subpage" @click="emit('open-subpage', treeNode)">subpage</button>
        <button class="open-move" @click="emit('open-move', treeNode)">move</button>
        <button class="copy-link" @click="emit('copy-link', treeNode)">copy</button>
        <button class="insert-link" @click="emit('insert-link', treeNode)">insert</button>
        <button class="rename-page" @click="emit('rename-page', treeNode)">rename-page</button>
        <button class="cancel-rename" @click="emit('cancel-rename')">cancel-rename</button>
        <button class="move-page" @click="emit('move-page', treeNode)">move-page</button>
        <button class="cancel-move" @click="emit('cancel-move')">cancel-move</button>
        <button class="create-subpage" @click="emit('create-subpage', treeNode)">create</button>
        <button class="cancel-subpage" @click="emit('cancel-subpage')">cancel-subpage</button>
        <button class="query" @click="emit('update:query', 'release')">query</button>
        <button class="subpage-title" @click="emit('update:subpageTitle', 'child')">subpage-title</button>
        <button class="rename-draft" @click="emit('update:renameDraft', 'renamed')">rename-draft</button>
        <button class="move-target" @click="emit('update:moveTargetId', 'target')">move-target</button>
      </section>
    `,
  }),
}

const mountBridge = (overrides = {}) => mount(WorkspacePageTreeBridge, {
  props: {
    activeTab: 'all',
    isPanelVisible: (id) => id === 'tree',
    loading: false,
    query: '',
    rows: [treeNode],
    emptyLabel: 'No pages',
    collapsedIdSet: new Set(),
    subpageError: '',
    renameError: '',
    moveError: '',
    subpageCreatingId: '',
    subpageComposerParentId: '',
    subpageTitle: '',
    renamingId: '',
    renameDraft: '',
    renameSavingId: '',
    movingId: '',
    moveTargetId: '',
    moveSavingId: '',
    canModifyPage: true,
    hasEditor: true,
    isDocumentLinkCopied: () => false,
    moveTargetOptions: () => [],
    canApplyMove: () => true,
    ...overrides,
  },
  global: { stubs },
})

describe('WorkspacePageTreeBridge', () => {
  it('renders the all-mode divider and page tree panel when visible', () => {
    const wrapper = mountBridge()

    expect(wrapper.find('.workspace-floating-divider').exists()).toBe(true)
    expect(wrapper.find('.page-tree-panel').exists()).toBe(true)
  })

  it('uses the visibility callback for the page tree panel', () => {
    const wrapper = mountBridge({ activeTab: 'tree', isPanelVisible: () => false })

    expect(wrapper.find('.workspace-floating-divider').exists()).toBe(false)
    expect(wrapper.find('.page-tree-panel').exists()).toBe(false)
  })

  it('forwards tree actions and model updates', async () => {
    const wrapper = mountBridge()

    for (const selector of [
      '.refresh',
      '.toggle',
      '.open-document',
      '.open-rename',
      '.open-subpage',
      '.open-move',
      '.copy-link',
      '.insert-link',
      '.rename-page',
      '.cancel-rename',
      '.move-page',
      '.cancel-move',
      '.create-subpage',
      '.cancel-subpage',
      '.query',
      '.subpage-title',
      '.rename-draft',
      '.move-target',
    ]) {
      await wrapper.find(selector).trigger('click')
    }

    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(wrapper.emitted('toggle-node')).toEqual([[treeNode]])
    expect(wrapper.emitted('open-document')).toEqual([[treeNode]])
    expect(wrapper.emitted('open-rename')).toEqual([[treeNode]])
    expect(wrapper.emitted('open-subpage')).toEqual([[treeNode]])
    expect(wrapper.emitted('open-move')).toEqual([[treeNode]])
    expect(wrapper.emitted('copy-link')).toEqual([[treeNode]])
    expect(wrapper.emitted('insert-link')).toEqual([[treeNode]])
    expect(wrapper.emitted('rename-page')).toEqual([[treeNode]])
    expect(wrapper.emitted('cancel-rename')).toHaveLength(1)
    expect(wrapper.emitted('move-page')).toEqual([[treeNode]])
    expect(wrapper.emitted('cancel-move')).toHaveLength(1)
    expect(wrapper.emitted('create-subpage')).toEqual([[treeNode]])
    expect(wrapper.emitted('cancel-subpage')).toHaveLength(1)
    expect(wrapper.emitted('update:query')).toEqual([['release']])
    expect(wrapper.emitted('update:subpageTitle')).toEqual([['child']])
    expect(wrapper.emitted('update:renameDraft')).toEqual([['renamed']])
    expect(wrapper.emitted('update:moveTargetId')).toEqual([['target']])
  })
})
