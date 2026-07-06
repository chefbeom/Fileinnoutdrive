import { describe, expect, it } from 'vitest'

import {
  countWorkspaceBlockComments,
  createWorkspaceBlockCommentSummaries,
  createWorkspaceCommentFilters,
  filterWorkspaceComments,
  filterWorkspaceMentionedComments,
  getWorkspaceCommentEmptyLabel,
  isWorkspaceCommentMentioningEmail,
  normalizeWorkspaceComment,
  splitWorkspaceComments,
} from './workspaceComments.js'

const comments = [
  {
    id: 1,
    contents: 'Ping @owner@example.com',
    anchorBlockId: 'a',
    anchorBlockType: 'paragraph',
    anchorText: 'Intro',
    resolved: false,
  },
  {
    id: 2,
    contents: 'Follow up',
    anchorBlockId: 'a',
    anchorText: '',
    resolved: false,
  },
  {
    id: 3,
    contents: 'Done @owner@example.com',
    anchorBlockId: 'b',
    anchorBlockType: 'header',
    anchorText: 'Done',
    resolved: true,
  },
]

describe('workspaceComments', () => {
  it('normalizes backend comment aliases and edit labels', () => {
    const comment = normalizeWorkspaceComment({
      idx: 11,
      workspaceIdx: 42,
      authorEmail: 'writer@example.com',
      contents: 'Updated comment',
      anchorBlockId: 'block-1',
      anchorBlockType: 'paragraph',
      resolved: true,
      createdAt: '2026-07-03T00:00:00.000Z',
      updatedAt: '2026-07-03T00:00:03.000Z',
    })

    expect(comment).toMatchObject({
      id: 11,
      workspaceId: 42,
      authorName: 'writer@example.com',
      authorEmail: 'writer@example.com',
      contents: 'Updated comment',
      anchorBlockId: 'block-1',
      anchorBlockType: 'paragraph',
      resolved: true,
      isEdited: true,
    })
    expect(comment.createdAtLabel).toContain('2026')
    expect(comment.editedLabel).toContain('수정됨')
  })

  it('splits comments by resolved state and detects current-user mentions', () => {
    const split = splitWorkspaceComments(comments)

    expect(split.unresolved.map((comment) => comment.id)).toEqual([1, 2])
    expect(split.resolved.map((comment) => comment.id)).toEqual([3])
    expect(isWorkspaceCommentMentioningEmail(comments[0], 'OWNER@example.com')).toBe(true)
    expect(filterWorkspaceMentionedComments(split.unresolved, 'owner@example.com').map((comment) => comment.id)).toEqual([1])
  })

  it('counts and summarizes unresolved comments by selected block', () => {
    expect(countWorkspaceBlockComments(comments, { anchorBlockId: 'a' })).toBe(2)
    expect(countWorkspaceBlockComments(comments, null)).toBe(0)
    expect(createWorkspaceBlockCommentSummaries(comments)).toEqual([
      { anchorBlockId: 'a', anchorBlockType: 'paragraph', anchorText: 'Intro', count: 2 },
      { anchorBlockId: 'b', anchorBlockType: 'header', anchorText: 'Done', count: 1 },
    ])
  })

  it('filters comments for open, resolved, mentioned, and block views', () => {
    const unresolvedComments = comments.filter((comment) => !comment.resolved)
    const resolvedComments = comments.filter((comment) => comment.resolved)
    const mentionedComments = [comments[0]]

    expect(filterWorkspaceComments({ filter: 'open', unresolvedComments }).map((comment) => comment.id)).toEqual([1, 2])
    expect(filterWorkspaceComments({ filter: 'resolved', resolvedComments }).map((comment) => comment.id)).toEqual([3])
    expect(filterWorkspaceComments({ filter: 'mentions', mentionedComments }).map((comment) => comment.id)).toEqual([1])
    expect(filterWorkspaceComments({ filter: 'block', unresolvedComments, selectedBlockAnchor: { anchorBlockId: 'a' } }).map((comment) => comment.id)).toEqual([1, 2])
    expect(filterWorkspaceComments({ filter: 'block', unresolvedComments, selectedBlockAnchor: null })).toEqual([])
  })

  it('creates filter metadata and empty-state labels', () => {
    expect(createWorkspaceCommentFilters({
      mentionedCount: 1,
      unresolvedCount: 2,
      blockCount: 0,
      resolvedCount: 3,
      currentUserEmail: '',
      selectedBlockAnchor: null,
    })).toEqual([
      { id: 'mentions', label: '내 멘션', count: 1, disabled: true },
      { id: 'open', label: '열림', count: 2, disabled: false },
      { id: 'block', label: '현재 블록', count: 0, disabled: true },
      { id: 'resolved', label: '해결됨', count: 3, disabled: false },
    ])

    expect(getWorkspaceCommentEmptyLabel({ filter: 'mentions', currentUserEmail: '' })).toBe('내 멘션을 보려면 로그인 이메일이 필요합니다.')
    expect(getWorkspaceCommentEmptyLabel({ filter: 'mentions', currentUserEmail: 'me@example.com' })).toBe('나를 멘션한 열린 댓글이 없습니다.')
    expect(getWorkspaceCommentEmptyLabel({ filter: 'block', selectedBlockAnchor: null })).toBe('댓글을 보려면 에디터에서 블록을 선택해 주세요.')
    expect(getWorkspaceCommentEmptyLabel({ filter: 'block', selectedBlockAnchor: { anchorBlockId: 'a' } })).toBe('현재 블록에 열린 댓글이 없습니다.')
    expect(getWorkspaceCommentEmptyLabel({ filter: 'resolved' })).toBe('해결된 댓글이 없습니다.')
    expect(getWorkspaceCommentEmptyLabel({ filter: 'open' })).toBe('열린 댓글이 없습니다.')
  })
})