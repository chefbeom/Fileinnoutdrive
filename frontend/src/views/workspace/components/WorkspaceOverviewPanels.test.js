import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceOverviewPanels from './WorkspaceOverviewPanels.vue'

const documentRow = { id: 'doc-1', title: 'Doc' }
const taskRow = { id: 'task-1', text: 'Task' }
const memberRow = { userIdx: 7, role: 'READ' }

const stubs = {
  WorkspaceHomePanel: defineComponent({
    emits: ['refresh', 'open-metric', 'open-attention', 'open-queue', 'open-document'],
    setup(_, { emit }) {
      return { emit, documentRow }
    },
    template: `
      <section class="home-panel">
        <button class="home-refresh" @click="emit('refresh')">refresh</button>
        <button class="home-metric" @click="emit('open-metric', { id: 'metric' })">metric</button>
        <button class="home-attention" @click="emit('open-attention', { id: 'attention' })">attention</button>
        <button class="home-queue" @click="emit('open-queue', { id: 'queue' })">queue</button>
        <button class="home-document" @click="emit('open-document', documentRow)">document</button>
      </section>
    `,
  }),
  WorkspaceSummaryPanel: defineComponent({
    emits: ['open-panel'],
    setup(_, { emit }) {
      return { emit }
    },
    template: '<button class="summary-panel" @click="emit(\'open-panel\', \'tasks\')">summary</button>',
  }),
  WorkspaceCollaborationPanel: defineComponent({
    emits: ['open-share', 'trigger-file-select', 'focus-comment', 'refresh-members', 'change-member-role', 'remove-member'],
    setup(_, { emit }) {
      return { emit, memberRow }
    },
    template: `
      <section class="collaboration-panel">
        <button class="open-share" @click="emit('open-share')">share</button>
        <button class="trigger-file" @click="emit('trigger-file-select')">file</button>
        <button class="focus-comment" @click="emit('focus-comment')">comment</button>
        <button class="refresh-members" @click="emit('refresh-members')">members</button>
        <button class="change-role" @click="emit('change-member-role', memberRow, { target: { value: 'WRITE' } })">role</button>
        <button class="remove-member" @click="emit('remove-member', memberRow)">remove</button>
      </section>
    `,
  }),
  WorkspaceWorkloadPanel: defineComponent({
    emits: ['open-document', 'focus-task'],
    setup(_, { emit }) {
      return { emit, documentRow, taskRow }
    },
    template: `
      <section class="workload-panel">
        <button class="workload-document" @click="emit('open-document', documentRow)">document</button>
        <button class="workload-task" @click="emit('focus-task', taskRow)">task</button>
      </section>
    `,
  }),
  WorkspaceFullTextPanel: defineComponent({
    emits: ['update:query', 'search', 'open-document', 'copy-link', 'insert-link'],
    setup(_, { emit }) {
      return { emit, documentRow }
    },
    template: `
      <section class="fulltext-panel">
        <button class="search-query" @click="emit('update:query', 'release')">query</button>
        <button class="search-run" @click="emit('search')">search</button>
        <button class="search-open" @click="emit('open-document', documentRow)">open</button>
        <button class="search-copy" @click="emit('copy-link', documentRow)">copy</button>
        <button class="search-insert" @click="emit('insert-link', documentRow)">insert</button>
      </section>
    `,
  }),
}

const mountPanels = (overrides = {}) => mount(WorkspaceOverviewPanels, {
  props: {
    activeTab: 'all',
    isPanelVisible: (id) => ['home', 'summary', 'collaboration', 'workload', 'search'].includes(id),
    loading: false,
    homeMetricCards: [{ id: 'metric' }],
    homeAttentionItems: [{ id: 'attention' }],
    homeQueueItems: [{ id: 'queue' }],
    homeRecentPages: [documentRow],
    blockCount: 4,
    summaryCards: [{ id: 'summary' }],
    healthItems: [{ id: 'health' }],
    activeUsers: [{ id: 'user' }],
    accessRole: 'WRITE',
    shareStatusLabel: '공유됨',
    permissionItems: [{ id: 'share' }],
    canManageShare: true,
    canManageAssets: true,
    canComment: true,
    isValid: true,
    isSaving: false,
    isEditorLoading: false,
    shareButtonTitle: '공유',
    assetUploading: false,
    workspaceId: 42,
    memberSummaryLabel: '1명',
    memberError: '',
    memberLoading: false,
    memberRows: [memberRow],
    roleLabel: (role) => role,
    userInitial: (name) => String(name || '?').slice(0, 1),
    isMemberBusy: () => false,
    workloadRows: [{ key: 'owner' }],
    searchQuery: '',
    searchResults: [documentRow],
    searchLoading: false,
    searchError: '',
    canSearch: true,
    canModifyPage: true,
    hasEditor: true,
    ...overrides,
  },
  global: { stubs },
})

describe('WorkspaceOverviewPanels', () => {
  it('renders overview panels with dividers in all mode', () => {
    const wrapper = mountPanels()

    expect(wrapper.find('.home-panel').exists()).toBe(true)
    expect(wrapper.find('.summary-panel').exists()).toBe(true)
    expect(wrapper.find('.collaboration-panel').exists()).toBe(true)
    expect(wrapper.find('.workload-panel').exists()).toBe(true)
    expect(wrapper.find('.fulltext-panel').exists()).toBe(true)
    expect(wrapper.findAll('.workspace-floating-divider')).toHaveLength(4)
  })

  it('uses the visibility callback for each overview panel', () => {
    const wrapper = mountPanels({ isPanelVisible: (id) => id === 'search' })

    expect(wrapper.find('.home-panel').exists()).toBe(false)
    expect(wrapper.find('.summary-panel').exists()).toBe(false)
    expect(wrapper.find('.collaboration-panel').exists()).toBe(false)
    expect(wrapper.find('.workload-panel').exists()).toBe(false)
    expect(wrapper.find('.fulltext-panel').exists()).toBe(true)
  })

  it('forwards home, summary, collaboration, workload, and search events', async () => {
    const wrapper = mountPanels()

    for (const selector of [
      '.home-refresh',
      '.home-metric',
      '.home-attention',
      '.home-queue',
      '.home-document',
      '.summary-panel',
      '.open-share',
      '.trigger-file',
      '.focus-comment',
      '.refresh-members',
      '.change-role',
      '.remove-member',
      '.workload-document',
      '.workload-task',
      '.search-query',
      '.search-run',
      '.search-open',
      '.search-copy',
      '.search-insert',
    ]) {
      await wrapper.find(selector).trigger('click')
    }

    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(wrapper.emitted('open-home-metric')).toEqual([[{ id: 'metric' }]])
    expect(wrapper.emitted('open-home-attention')).toEqual([[{ id: 'attention' }]])
    expect(wrapper.emitted('open-home-queue')).toEqual([[{ id: 'queue' }]])
    expect(wrapper.emitted('open-document')).toEqual([[documentRow], [documentRow], [documentRow]])
    expect(wrapper.emitted('open-panel')).toEqual([['tasks']])
    expect(wrapper.emitted('open-share')).toHaveLength(1)
    expect(wrapper.emitted('trigger-file-select')).toHaveLength(1)
    expect(wrapper.emitted('focus-comment')).toHaveLength(1)
    expect(wrapper.emitted('refresh-members')).toHaveLength(1)
    expect(wrapper.emitted('change-member-role')[0][0]).toEqual(memberRow)
    expect(wrapper.emitted('remove-member')).toEqual([[memberRow]])
    expect(wrapper.emitted('focus-task')).toEqual([[taskRow]])
    expect(wrapper.emitted('update:searchQuery')).toEqual([['release']])
    expect(wrapper.emitted('search')).toHaveLength(1)
    expect(wrapper.emitted('copy-link')).toEqual([[documentRow]])
    expect(wrapper.emitted('insert-link')).toEqual([[documentRow]])
  })
})