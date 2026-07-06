import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import WorkspaceReviewPanel from './WorkspaceReviewPanel.vue'

const comments = [
  {
    id: 'comment-1',
    authorName: 'Reviewer',
    createdAtLabel: '방금 전',
    isEdited: true,
    editedLabel: '수정됨',
    contents: '검토가 필요합니다.',
    anchorBlockId: 'block-1',
    resolved: false,
  },
  {
    id: 'comment-2',
    authorName: 'Owner',
    createdAtLabel: '어제',
    contents: '해결했습니다.',
    resolved: true,
  },
]

const mentionCandidates = [
  {
    email: 'owner@example.test',
    name: 'Owner',
    initial: 'O',
    image: '',
  },
]

const mountPanel = (props = {}) => mount(WorkspaceReviewPanel, {
  props: {
    unresolvedComments: [comments[0]],
    commentFilters: [
      { id: 'open', label: '열림', count: 1 },
      { id: 'resolved', label: '해결됨', count: 1 },
    ],
    commentFilter: 'open',
    canComment: true,
    selectedBlockAnchor: { anchorBlockId: 'block-1', anchorText: '대상 블록' },
    commentAnchorLabel: (comment) => comment.anchorText || comment.anchorBlockId || '문서 전체',
    showMentionMenu: true,
    canUseMentions: true,
    mentionCandidates,
    newComment: '초안',
    commentSaving: false,
    commentError: '',
    commentLoading: false,
    comments,
    visibleComments: comments,
    emptyLabel: '표시할 댓글이 없습니다.',
    editDraft: '수정 초안',
    isMentioningCurrentUser: (comment) => comment.id === 'comment-1',
    canEditComment: (comment) => comment.id === 'comment-1',
    isCommentUpdating: vi.fn(() => false),
    isCommentDeleting: vi.fn(() => false),
    isCommentEditing: (comment) => comment.id === 'comment-1',
    isCommentResolving: vi.fn(() => false),
    ...props,
  },
})

describe('WorkspaceReviewPanel', () => {
  it('renders filters, composer, and visible comments', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.workspace-floating-panel__count').text()).toBe('1')
    expect(wrapper.findAll('.workspace-comment-filter')).toHaveLength(2)
    expect(wrapper.text()).toContain('대상 블록')
    expect(wrapper.findAll('.workspace-comment-item')).toHaveLength(2)
    expect(wrapper.text()).toContain('내 멘션')
  })

  it('emits composer model updates and create actions', async () => {
    const wrapper = mountPanel()

    await wrapper.findAll('.workspace-comment-filter')[1].trigger('click')
    await wrapper.find('.workspace-mention-toggle').trigger('click')
    await wrapper.find('.workspace-mention-option').trigger('click')
    await wrapper.find('.workspace-comment-composer textarea').setValue('새 댓글')
    await wrapper.find('.workspace-comment-submit').trigger('click')
    await wrapper.find('.workspace-comment-anchor-target button').trigger('click')

    expect(wrapper.emitted('update:comment-filter')).toEqual([['resolved']])
    expect(wrapper.emitted('update:show-mention-menu')).toEqual([[false]])
    expect(wrapper.emitted('insert-mention')).toEqual([[mentionCandidates[0]]])
    expect(wrapper.emitted('update:new-comment')).toEqual([['새 댓글']])
    expect(wrapper.emitted('create-comment')).toEqual([[]])
    expect(wrapper.emitted('clear-anchor')).toEqual([[]])
  })

  it('emits comment item actions and edit draft updates', async () => {
    const wrapper = mountPanel()

    await wrapper.find('.workspace-comment-icon-btn').trigger('click')
    await wrapper.findAll('.workspace-comment-icon-btn')[1].trigger('click')
    await wrapper.find('.workspace-comment-anchor').trigger('click')
    await wrapper.find('.workspace-comment-edit textarea').setValue('수정 내용')
    await wrapper.find('.workspace-comment-edit').trigger('submit')
    await wrapper.find('.workspace-comment-edit__cancel').trigger('click')
    await wrapper.findAll('.workspace-comment-resolve')[1].trigger('click')

    expect(wrapper.emitted('start-edit')).toEqual([[comments[0]]])
    expect(wrapper.emitted('delete-comment')).toEqual([[comments[0]]])
    expect(wrapper.emitted('focus-anchor')).toEqual([[comments[0]]])
    expect(wrapper.emitted('update:edit-draft')).toEqual([['수정 내용']])
    expect(wrapper.emitted('update-comment')).toEqual([[comments[0]]])
    expect(wrapper.emitted('cancel-edit')).toEqual([[]])
    expect(wrapper.emitted('toggle-resolved')).toEqual([[comments[1]]])
  })

  it('exposes the composer textarea focus and selection contract', async () => {
    const wrapper = mountPanel({ newComment: '0123456789' })
    const textarea = wrapper.find('.workspace-comment-composer textarea').element
    textarea.focus = vi.fn()
    textarea.scrollIntoView = vi.fn()
    const setSelectionRange = vi.spyOn(textarea, 'setSelectionRange')

    wrapper.vm.focus()
    wrapper.vm.scrollIntoView({ block: 'center' })
    wrapper.vm.setSelectionRange(2, 4)

    expect(textarea.focus).toHaveBeenCalled()
    expect(textarea.scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
    expect(setSelectionRange).toHaveBeenCalledWith(2, 4)
    expect(wrapper.vm.selectionStart).toBe(2)
    expect(wrapper.vm.selectionEnd).toBe(4)
  })
})