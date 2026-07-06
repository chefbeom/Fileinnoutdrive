import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import WorkspaceFloatingPanelStack from './WorkspaceFloatingPanelStack.vue'

const createActions = () => ({
  setValue: vi.fn(),
  registerSubpageInput: vi.fn(),
  registerCommentInput: vi.fn(),
  refreshWorkspacePageIndex: vi.fn(),
  openWorkspaceHomeMetric: vi.fn(),
  openWorkspaceHomeAttentionItem: vi.fn(),
  openWorkspaceHomeQueueItem: vi.fn(),
  openWorkspaceDocument: vi.fn(),
  openWorkspaceShare: vi.fn(),
  triggerFileSelect: vi.fn(),
  focusWorkspaceCommentComposer: vi.fn(),
  refreshWorkspaceMembers: vi.fn(),
  handleWorkspaceMemberRoleSelect: vi.fn(),
  removeWorkspaceMember: vi.fn(),
  focusWorkspaceInboxTask: vi.fn(),
  searchWorkspaceContents: vi.fn(),
  copyWorkspaceDocumentLink: vi.fn(),
  insertWorkspacePageLink: vi.fn(),
})

const createModel = () => ({
  activeWorkspacePanelTab: 'all',
  isWorkspacePanelCollapsed: false,
  workspacePanelTabs: [
    { id: 'home', label: 'Home', count: null },
    { id: 'database', label: 'Database', count: 2 },
  ],
  isWorkspacePanelVisible: () => true,
  workspacePageIndexLoading: false,
  workspaceHomeMetricCards: [{ id: 'pages', label: 'Pages', value: 2 }],
  workspaceHomeAttentionItems: [],
  workspaceHomeMyQueue: [],
  workspaceHomeRecentPages: [],
  documentBlockCount: 3,
  workspaceSummaryCards: [],
  workspaceHealthItems: [],
  activeUsers: [],
  workspaceAccessRole: 'ADMIN',
  workspaceShareStatusLabel: 'Private',
  workspacePermissionItems: [],
  canManageWorkspaceShare: true,
  canManageAssets: true,
  canCommentOnWorkspace: true,
  isValid: true,
  isSaving: false,
  isEditorLoading: false,
  workspaceShareButtonTitle: 'Share',
  assetUploading: false,
  workspaceId: 11,
  workspaceMemberRows: [],
  roleLabel: (role) => role,
  userInitial: () => 'A',
  isWorkspaceMemberBusy: () => false,
  workspaceWorkloadRows: [],
  workspaceFullTextQuery: '',
  workspaceFullTextResults: [],
  workspaceFullTextLoading: false,
  workspaceFullTextError: '',
  canSearchWorkspaceFullText: true,
  canModifyWorkspacePage: true,
  hasEditor: true,
})

const stubs = {
  WorkspaceFloatingSidebar: {
    props: ['activeTab', 'tabs', 'collapsed'],
    emits: ['update:activeTab'],
    template: `
      <aside class="floating-sidebar-stub">
        <button class="switch-tab" @click="$emit('update:activeTab', 'database')"></button>
        <slot />
      </aside>
    `,
  },
  WorkspaceOverviewPanels: {
    props: ['activeTab', 'homeMetricCards', 'searchQuery'],
    emits: ['refresh', 'openHomeMetric', 'update:searchQuery', 'openShare'],
    template: `
      <section class="overview-stub">
        <button class="refresh" @click="$emit('refresh')"></button>
        <button class="metric" @click="$emit('openHomeMetric', homeMetricCards[0])"></button>
        <button class="search" @click="$emit('update:searchQuery', 'query')"></button>
        <button class="share" @click="$emit('openShare')"></button>
      </section>
    `,
  },
  WorkspacePageTreeBridge: true,
  WorkspaceDatabaseBoardPanels: true,
  WorkspaceScheduleInboxPanels: true,
  WorkspaceUtilityPanels: true,
  WorkspaceLinkedHistoryPanels: {
    template: '<section class="linked-stub"></section>',
    expose: ['focus'],
    setup(_, { expose }) {
      expose({ focus: vi.fn() })
    },
  },
  WorkspaceReviewAssetsPanels: {
    template: '<section class="review-stub"></section>',
    expose: ['focus'],
    setup(_, { expose }) {
      expose({ focus: vi.fn() })
    },
  },
}

describe('WorkspaceFloatingPanelStack', () => {
  it('forwards sidebar and overview events through actions', async () => {
    const actions = createActions()
    const model = createModel()
    const wrapper = mount(WorkspaceFloatingPanelStack, {
      props: { model, actions },
      global: { stubs },
    })

    await wrapper.find('.switch-tab').trigger('click')
    await wrapper.find('.refresh').trigger('click')
    await wrapper.find('.metric').trigger('click')
    await wrapper.find('.search').trigger('click')
    await wrapper.find('.share').trigger('click')

    expect(actions.setValue).toHaveBeenCalledWith('activeWorkspacePanelTab', 'database')
    expect(actions.refreshWorkspacePageIndex).toHaveBeenCalled()
    expect(actions.openWorkspaceHomeMetric).toHaveBeenCalledWith(model.workspaceHomeMetricCards[0])
    expect(actions.setValue).toHaveBeenCalledWith('workspaceFullTextQuery', 'query')
    expect(actions.openWorkspaceShare).toHaveBeenCalled()
    expect(actions.registerSubpageInput).toHaveBeenCalled()
    expect(actions.registerCommentInput).toHaveBeenCalled()
  })
})
