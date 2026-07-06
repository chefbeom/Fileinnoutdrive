import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceCommentPanel } from './useWorkspaceCommentPanel.js'

const comments = [
  {
    id: 1,
    contents: 'Ping @owner@example.com',
    anchorBlockId: 'intro',
    anchorBlockType: 'paragraph',
    anchorText: 'Intro',
    resolved: false,
  },
  {
    id: 2,
    contents: 'Follow up',
    anchorBlockId: 'intro',
    anchorBlockType: 'paragraph',
    anchorText: 'Intro',
    resolved: false,
  },
  {
    id: 3,
    contents: 'Resolved item',
    anchorBlockId: 'done',
    anchorBlockType: 'header',
    anchorText: 'Done',
    resolved: true,
  },
]

const createSubject = () => {
  const workspaceComments = ref([...comments])
  const currentUserEmail = ref('owner@example.com')
  const selectedBlockAnchor = ref({ anchorBlockId: 'intro' })
  const workspaceCommentFilter = ref('open')

  const subject = useWorkspaceCommentPanel({
    workspaceComments,
    currentUserEmail,
    selectedBlockAnchor,
    workspaceCommentFilter,
  })

  return {
    subject,
    workspaceComments,
    currentUserEmail,
    selectedBlockAnchor,
    workspaceCommentFilter,
  }
}

describe('useWorkspaceCommentPanel', () => {
  it('splits comments and derives mention/block summaries', () => {
    const { subject } = createSubject()

    expect(subject.unresolvedWorkspaceComments.value.map((comment) => comment.id)).toEqual([1, 2])
    expect(subject.resolvedWorkspaceComments.value.map((comment) => comment.id)).toEqual([3])
    expect(subject.mentionedWorkspaceComments.value.map((comment) => comment.id)).toEqual([1])
    expect(subject.selectedBlockCommentCount.value).toBe(2)
    expect(subject.workspaceBlockCommentSummaries.value).toEqual([
      {
        anchorBlockId: 'intro',
        anchorBlockType: 'paragraph',
        anchorText: 'Intro',
        count: 2,
      },
    ])
    expect(subject.isWorkspaceCommentMentioningCurrentUser(comments[0])).toBe(true)
  })

  it('updates visible comments when filter changes', () => {
    const { subject, workspaceCommentFilter } = createSubject()

    expect(subject.visibleWorkspaceComments.value.map((comment) => comment.id)).toEqual([1, 2])

    workspaceCommentFilter.value = 'mentions'
    expect(subject.visibleWorkspaceComments.value.map((comment) => comment.id)).toEqual([1])

    workspaceCommentFilter.value = 'block'
    expect(subject.visibleWorkspaceComments.value.map((comment) => comment.id)).toEqual([1, 2])

    workspaceCommentFilter.value = 'resolved'
    expect(subject.visibleWorkspaceComments.value.map((comment) => comment.id)).toEqual([3])
  })

  it('reacts to email, selected block, and comment changes', () => {
    const {
      subject,
      workspaceComments,
      currentUserEmail,
      selectedBlockAnchor,
      workspaceCommentFilter,
    } = createSubject()

    currentUserEmail.value = ''
    expect(subject.mentionedWorkspaceComments.value).toEqual([])
    expect(subject.workspaceCommentFilters.value.find((filter) => filter.id === 'mentions')?.disabled).toBe(true)

    selectedBlockAnchor.value = null
    workspaceCommentFilter.value = 'block'
    expect(subject.selectedBlockCommentCount.value).toBe(0)
    expect(subject.visibleWorkspaceComments.value).toEqual([])

    workspaceComments.value = [
      ...workspaceComments.value,
      {
        id: 4,
        contents: 'New open item',
        anchorBlockId: 'later',
        resolved: false,
      },
    ]
    workspaceCommentFilter.value = 'open'
    expect(subject.unresolvedWorkspaceComments.value.map((comment) => comment.id)).toEqual([1, 2, 4])
  })
})
