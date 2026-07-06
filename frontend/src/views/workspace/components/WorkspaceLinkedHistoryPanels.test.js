import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import WorkspaceLinkedHistoryPanels from './WorkspaceLinkedHistoryPanels.vue'

const linkedExpose = {
  focus: vi.fn(),
}

const stubs = {
  WorkspaceLinkedPanel: defineComponent({
    props: ['workspaceId', 'subpageTitle'],
    emits: [
      'refresh-backlinks',
      'open-parent',
      'open-document',
      'insert-link',
      'copy-link',
      'focus-linked-source',
      'create-subpage',
      'update:subpage-title',
    ],
    setup(_, { emit, expose }) {
      expose(linkedExpose)
      return { emit }
    },
    template: `
      <section class="linked-panel">
        <button class="refresh-backlinks" @click="emit('refresh-backlinks')">refresh</button>
        <button class="open-parent" @click="emit('open-parent')">parent</button>
        <button class="open-document" @click="emit('open-document', { id: 'doc-1' })">document</button>
        <button class="insert-link" @click="emit('insert-link', { id: 'doc-1' })">insert</button>
        <button class="copy-link" @click="emit('copy-link', { id: 'doc-1' })">copy</button>
        <button class="focus-source" @click="emit('focus-linked-source', { linkAnchorBlockId: 'block-1' })">focus</button>
        <button class="create-subpage" @click="emit('create-subpage')">create</button>
        <button class="update-subpage" @click="emit('update:subpage-title', 'Child')">title</button>
      </section>
    `,
  }),
  WorkspaceHistoryPanel: defineComponent({
    props: ['revisions', 'activeRevision'],
    emits: ['refresh', 'preview', 'restore'],
    setup(_, { emit }) {
      return { emit }
    },
    template: `
      <section class="history-panel">
        <button class="refresh-revisions" @click="emit('refresh')">refresh</button>
        <button class="preview-revision" @click="emit('preview', revisions[0])">preview</button>
        <button class="restore-revision" @click="emit('restore', revisions[0])">restore</button>
      </section>
    `,
  }),
}

const mountPanels = (overrides = {}) => mount(WorkspaceLinkedHistoryPanels, {
  props: {
    activeTab: 'all',
    isPanelVisible: (id) => ['links', 'history'].includes(id),
    workspaceId: 42,
    relationCount: 2,
    parentPage: { id: 'parent' },
    childPages: [{ id: 'child' }],
    linkedDocuments: [{ id: 'doc-1' }],
    linkedEmptyLabel: '링크 없음',
    backlinks: [{ id: 'backlink' }],
    backlinkLoading: false,
    backlinkError: '',
    backlinkEmptyLabel: '백링크 없음',
    canModifyPage: true,
    hasEditor: true,
    subpageTitle: '새 페이지',
    subpageCreating: false,
    subpageError: '',
    canStartSubpage: true,
    canCreateSubpage: true,
    revisions: [{ id: 1, title: 'Draft' }],
    revisionLoading: false,
    revisionError: '',
    activeRevision: { id: 1, title: 'Draft' },
    revisionDiff: { titleChanged: false },
    diffSummary: [],
    diffItems: [],
    previewLoading: '',
    restoring: '',
    canRestore: true,
    revisionReasonLabel: (reason) => reason || 'manual',
    ...overrides,
  },
  global: { stubs },
})

describe('WorkspaceLinkedHistoryPanels', () => {
  it('renders linked and history panels with the all-tab divider', () => {
    const wrapper = mountPanels()

    expect(wrapper.find('.linked-panel').exists()).toBe(true)
    expect(wrapper.find('.history-panel').exists()).toBe(true)
    expect(wrapper.find('.workspace-floating-divider').exists()).toBe(true)
  })

  it('uses the visibility callback for both panels', () => {
    const wrapper = mountPanels({ isPanelVisible: (id) => id === 'history' })

    expect(wrapper.find('.linked-panel').exists()).toBe(false)
    expect(wrapper.find('.history-panel').exists()).toBe(true)
  })

  it('forwards linked and history panel events', async () => {
    const wrapper = mountPanels()

    await wrapper.find('.refresh-backlinks').trigger('click')
    await wrapper.find('.open-parent').trigger('click')
    await wrapper.find('.open-document').trigger('click')
    await wrapper.find('.insert-link').trigger('click')
    await wrapper.find('.copy-link').trigger('click')
    await wrapper.find('.focus-source').trigger('click')
    await wrapper.find('.create-subpage').trigger('click')
    await wrapper.find('.update-subpage').trigger('click')
    await wrapper.find('.refresh-revisions').trigger('click')
    await wrapper.find('.preview-revision').trigger('click')
    await wrapper.find('.restore-revision').trigger('click')

    expect(wrapper.emitted('refresh-backlinks')).toHaveLength(1)
    expect(wrapper.emitted('open-parent')).toHaveLength(1)
    expect(wrapper.emitted('open-document')).toEqual([[{ id: 'doc-1' }]])
    expect(wrapper.emitted('insert-link')).toEqual([[{ id: 'doc-1' }]])
    expect(wrapper.emitted('copy-link')).toEqual([[{ id: 'doc-1' }]])
    expect(wrapper.emitted('focus-linked-source')).toEqual([[{ linkAnchorBlockId: 'block-1' }]])
    expect(wrapper.emitted('create-subpage')).toHaveLength(1)
    expect(wrapper.emitted('update:subpageTitle')).toEqual([['Child']])
    expect(wrapper.emitted('refresh-revisions')).toHaveLength(1)
    expect(wrapper.emitted('preview-revision')).toEqual([[{ id: 1, title: 'Draft' }]])
    expect(wrapper.emitted('restore-revision')).toEqual([[{ id: 1, title: 'Draft' }]])
  })

  it('forwards the subpage input focus contract', () => {
    const wrapper = mountPanels()

    wrapper.vm.focus()

    expect(linkedExpose.focus).toHaveBeenCalled()
  })
})