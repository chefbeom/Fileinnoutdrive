import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import WorkspaceReviewAssetsPanels from './WorkspaceReviewAssetsPanels.vue'

const reviewExpose = {
  focus: vi.fn(),
  scrollIntoView: vi.fn(),
  setSelectionRange: vi.fn(),
  selectionStart: 3,
  selectionEnd: 5,
}

const stubs = {
  WorkspaceReviewPanel: defineComponent({
    props: ['unresolvedComments', 'commentFilter', 'newComment'],
    emits: [
      'clear-anchor',
      'insert-mention',
      'create-comment',
      'start-edit',
      'delete-comment',
      'focus-anchor',
      'update-comment',
      'cancel-edit',
      'toggle-resolved',
      'update:comment-filter',
      'update:show-mention-menu',
      'update:new-comment',
      'update:edit-draft',
    ],
    setup(_, { emit, expose }) {
      expose(reviewExpose)
      return { emit }
    },
    template: `
      <section class="review-panel">
        <button class="update-filter" @click="emit('update:comment-filter', 'mentions')">filter</button>
        <button class="insert-mention" @click="emit('insert-mention', { email: 'user@example.test' })">mention</button>
        <button class="create-comment" @click="emit('create-comment')">create</button>
        <button class="start-edit" @click="emit('start-edit', { id: 'comment-1' })">edit</button>
        <button class="delete-comment" @click="emit('delete-comment', { id: 'comment-1' })">delete</button>
        <button class="focus-anchor" @click="emit('focus-anchor', { anchorBlockId: 'block-1' })">anchor</button>
        <button class="update-comment" @click="emit('update-comment', { id: 'comment-1' })">update</button>
        <button class="cancel-edit" @click="emit('cancel-edit')">cancel</button>
        <button class="toggle-resolved" @click="emit('toggle-resolved', { id: 'comment-1' })">resolve</button>
        <button class="clear-anchor" @click="emit('clear-anchor')">clear</button>
        <button class="toggle-mention" @click="emit('update:show-mention-menu', false)">menu</button>
        <button class="update-new" @click="emit('update:new-comment', 'next')">new</button>
        <button class="update-draft" @click="emit('update:edit-draft', 'draft')">draft</button>
      </section>
    `,
  }),
  WorkspaceAssetsPanel: defineComponent({
    props: ['assets', 'activeAssetId'],
    emits: ['toggle-asset', 'delete-asset', 'save-asset-to-drive', 'download-asset'],
    setup(_, { emit }) {
      return { emit }
    },
    template: `
      <section class="assets-panel">
        <button class="toggle-asset" @click="emit('toggle-asset', 'asset-1')">toggle</button>
        <button class="delete-asset" @click="emit('delete-asset', assets[0])">delete</button>
        <button class="save-asset" @click="emit('save-asset-to-drive', assets[0])">save</button>
        <button class="download-asset" @click="emit('download-asset', assets[0])">download</button>
      </section>
    `,
  }),
}

const mountPanels = (overrides = {}) => mount(WorkspaceReviewAssetsPanels, {
  props: {
    activeTab: 'all',
    isPanelVisible: (id) => ['review', 'assets'].includes(id),
    unresolvedComments: [{ id: 'comment-1' }],
    commentFilters: [{ id: 'open', label: '열림' }],
    commentFilter: 'open',
    canComment: true,
    selectedBlockAnchor: { anchorBlockId: 'block-1' },
    commentAnchorLabel: (comment) => comment.anchorBlockId,
    showMentionMenu: true,
    canUseMentions: true,
    mentionCandidates: [{ email: 'user@example.test' }],
    newComment: 'comment',
    commentSaving: false,
    commentError: '',
    commentLoading: false,
    comments: [{ id: 'comment-1' }],
    visibleComments: [{ id: 'comment-1' }],
    emptyLabel: '댓글 없음',
    editDraft: '',
    isMentioningCurrentUser: () => false,
    canEditComment: () => true,
    isCommentUpdating: () => false,
    isCommentDeleting: () => false,
    isCommentEditing: () => false,
    isCommentResolving: () => false,
    assets: [{ id: 'asset-1' }],
    assetLoading: false,
    hasAssets: true,
    activeAssetId: 'asset-1',
    canManageAssets: true,
    getAssetBadge: () => 'file',
    isDeletingAsset: () => false,
    isSavingAsset: () => false,
    ...overrides,
  },
  global: { stubs },
})

describe('WorkspaceReviewAssetsPanels', () => {
  it('renders review and assets panels with the all-tab divider', () => {
    const wrapper = mountPanels()

    expect(wrapper.find('.review-panel').exists()).toBe(true)
    expect(wrapper.find('.assets-panel').exists()).toBe(true)
    expect(wrapper.find('.workspace-floating-divider').exists()).toBe(true)
  })

  it('uses the visibility callback for both panels', () => {
    const wrapper = mountPanels({ isPanelVisible: (id) => id === 'assets' })

    expect(wrapper.find('.review-panel').exists()).toBe(false)
    expect(wrapper.find('.assets-panel').exists()).toBe(true)
  })

  it('forwards review and asset events', async () => {
    const wrapper = mountPanels()

    await wrapper.find('.update-filter').trigger('click')
    await wrapper.find('.insert-mention').trigger('click')
    await wrapper.find('.create-comment').trigger('click')
    await wrapper.find('.start-edit').trigger('click')
    await wrapper.find('.delete-comment').trigger('click')
    await wrapper.find('.focus-anchor').trigger('click')
    await wrapper.find('.update-comment').trigger('click')
    await wrapper.find('.cancel-edit').trigger('click')
    await wrapper.find('.toggle-resolved').trigger('click')
    await wrapper.find('.clear-anchor').trigger('click')
    await wrapper.find('.toggle-mention').trigger('click')
    await wrapper.find('.update-new').trigger('click')
    await wrapper.find('.update-draft').trigger('click')
    await wrapper.find('.toggle-asset').trigger('click')
    await wrapper.find('.delete-asset').trigger('click')
    await wrapper.find('.save-asset').trigger('click')
    await wrapper.find('.download-asset').trigger('click')

    expect(wrapper.emitted('update:commentFilter')).toEqual([['mentions']])
    expect(wrapper.emitted('insert-mention')).toEqual([[{ email: 'user@example.test' }]])
    expect(wrapper.emitted('create-comment')).toHaveLength(1)
    expect(wrapper.emitted('start-edit')).toEqual([[{ id: 'comment-1' }]])
    expect(wrapper.emitted('delete-comment')).toEqual([[{ id: 'comment-1' }]])
    expect(wrapper.emitted('focus-anchor')).toEqual([[{ anchorBlockId: 'block-1' }]])
    expect(wrapper.emitted('update-comment')).toEqual([[{ id: 'comment-1' }]])
    expect(wrapper.emitted('cancel-edit')).toHaveLength(1)
    expect(wrapper.emitted('toggle-resolved')).toEqual([[{ id: 'comment-1' }]])
    expect(wrapper.emitted('clear-anchor')).toHaveLength(1)
    expect(wrapper.emitted('update:showMentionMenu')).toEqual([[false]])
    expect(wrapper.emitted('update:newComment')).toEqual([['next']])
    expect(wrapper.emitted('update:editDraft')).toEqual([['draft']])
    expect(wrapper.emitted('toggle-asset')).toEqual([['asset-1']])
    expect(wrapper.emitted('delete-asset')).toEqual([[[{ id: 'asset-1' }][0]]])
    expect(wrapper.emitted('save-asset-to-drive')).toEqual([[[{ id: 'asset-1' }][0]]])
    expect(wrapper.emitted('download-asset')).toEqual([[[{ id: 'asset-1' }][0]]])
  })

  it('forwards the comment composer focus and selection contract', () => {
    const wrapper = mountPanels()

    wrapper.vm.focus()
    wrapper.vm.scrollIntoView({ block: 'center' })
    wrapper.vm.setSelectionRange(1, 2)

    expect(reviewExpose.focus).toHaveBeenCalled()
    expect(reviewExpose.scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
    expect(reviewExpose.setSelectionRange).toHaveBeenCalledWith(1, 2)
    expect(wrapper.vm.selectionStart).toBe(3)
    expect(wrapper.vm.selectionEnd).toBe(5)
  })
})