import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useWorkspaceRealtimeEvents } from './useWorkspaceRealtimeEvents.js'

const createSubject = (overrides = {}) => {
  const state = {
    workspaceId: ref(42),
    workspaceAssets: ref([{ id: 1, originalName: 'old.txt', workspaceId: 42 }]),
    workspaceComments: ref([{ id: 5, authorName: 'Old', resolved: false }]),
    currentUserIdx: ref(7),
    isWorkspacePanelCollapsed: ref(true),
    activeWorkspacePanelTab: ref('home'),
    workspaceCommentFilter: ref('open'),
    activeWorkspaceAssetId: ref(null),
    editorApi: ref({ focusBlockAnchor: vi.fn() }),
  }
  const api = {
    normalizeWorkspaceAsset: vi.fn((asset) => ({
      id: asset.id ?? asset.idx,
      originalName: asset.originalName,
      workspaceId: 42,
    })),
    normalizeWorkspaceComment: vi.fn((comment) => ({
      id: comment.id ?? comment.idx,
      authorName: comment.authorName,
      anchorBlockId: comment.anchorBlockId,
      resolved: Boolean(comment.resolved),
    })),
    isWorkspaceCommentMentioningCurrentUser: vi.fn(() => false),
    commentAnchorLabel: vi.fn(() => '문단'),
    upsertWorkspaceComment: vi.fn(),
    refreshWorkspaceAssets: vi.fn(() => Promise.resolve()),
    refreshWorkspaceComments: vi.fn(() => Promise.resolve()),
    showWorkspaceNotice: vi.fn(),
  }

  const subject = useWorkspaceRealtimeEvents({ ...state, ...api, ...overrides })
  return { subject, state, api }
}

describe('useWorkspaceRealtimeEvents', () => {
  it('merges uploaded realtime assets and opens the asset notice target', () => {
    const { subject, state, api } = createSubject()

    subject.handleWorkspaceAssetRealtimeEvent({
      workspaceIdx: 42,
      action: 'UPLOAD',
      actorUserIdx: 8,
      assets: [{ idx: 2, originalName: 'new.pdf' }],
    })

    expect(state.workspaceAssets.value.map((asset) => asset.id)).toEqual([1, 2])
    expect(api.showWorkspaceNotice).toHaveBeenCalledWith(
      expect.any(String),
      'info',
      expect.objectContaining({ actionLabel: '첨부 보기' }),
    )

    api.showWorkspaceNotice.mock.calls[0][2].onAction()
    expect(state.isWorkspacePanelCollapsed.value).toBe(false)
    expect(state.activeWorkspacePanelTab.value).toBe('assets')
    expect(state.activeWorkspaceAssetId.value).toBe(2)
  })

  it('removes deleted realtime assets without notifying for the current user', () => {
    const { subject, state, api } = createSubject({
      workspaceAssets: ref([
        { id: 1, originalName: 'old.txt', workspaceId: 42 },
        { id: 2, originalName: 'remove.txt', workspaceId: 42 },
      ]),
    })

    subject.handleWorkspaceAssetRealtimeEvent({
      workspaceIdx: 42,
      action: 'DELETE',
      actorUserIdx: 7,
      assetIdxList: [2],
    })

    expect(state.workspaceAssets.value.map((asset) => asset.id)).toEqual([1])
    expect(api.showWorkspaceNotice).not.toHaveBeenCalled()
  })

  it('upserts realtime comments and opens mentions from the notice action', () => {
    const { subject, state, api } = createSubject({
      isWorkspaceCommentMentioningCurrentUser: vi.fn(() => true),
    })

    subject.handleWorkspaceCommentRealtimeEvent({
      workspaceIdx: 42,
      action: 'UPSERT',
      actorUserIdx: 8,
      comment: { idx: 9, authorName: '민수', anchorBlockId: 'block-1' },
    })

    expect(api.upsertWorkspaceComment).toHaveBeenCalledWith({ idx: 9, authorName: '민수', anchorBlockId: 'block-1' })
    expect(api.showWorkspaceNotice).toHaveBeenCalledWith(
      expect.any(String),
      'warn',
      expect.objectContaining({ actionLabel: '댓글 보기' }),
    )

    api.showWorkspaceNotice.mock.calls[0][2].onAction()
    expect(state.isWorkspacePanelCollapsed.value).toBe(false)
    expect(state.activeWorkspacePanelTab.value).toBe('review')
    expect(state.workspaceCommentFilter.value).toBe('mentions')
    expect(state.editorApi.value.focusBlockAnchor).not.toHaveBeenCalled()
  })

  it('falls back to refresh callbacks for unknown realtime actions in the current workspace', () => {
    const { subject, api } = createSubject()

    subject.handleWorkspaceAssetRealtimeEvent({ workspaceIdx: 42, action: 'UNKNOWN' })
    subject.handleWorkspaceCommentRealtimeEvent({ workspaceIdx: 42, action: 'UNKNOWN' })

    expect(api.refreshWorkspaceAssets).toHaveBeenCalledWith(42)
    expect(api.refreshWorkspaceComments).toHaveBeenCalledWith(42)
  })
})
