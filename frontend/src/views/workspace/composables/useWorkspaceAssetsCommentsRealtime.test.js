import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceAssetsCommentsRealtime } from './useWorkspaceAssetsCommentsRealtime.js'

const createSubject = (overrides = {}) => {
  const state = {
    workspaceId: ref(42),
    workspaceAssets: ref([]),
    workspaceAssetLoading: ref(false),
    workspaceAssetError: ref(''),
    workspaceComments: ref([]),
    workspaceCommentLoading: ref(false),
    workspaceCommentError: ref(''),
    currentUserIdx: ref(7),
    isWorkspacePanelCollapsed: ref(true),
    activeWorkspacePanelTab: ref('home'),
    workspaceCommentFilter: ref('open'),
    activeWorkspaceAssetId: ref(null),
    editorApi: ref({ focusBlockAnchor: vi.fn() }),
  }
  const api = {
    getAccessToken: vi.fn(() => 'token-1'),
    loadWorkspaceAssets: vi.fn(async () => [{ idx: 1, originalName: 'asset.png' }]),
    loadWorkspaceComments: vi.fn(async () => [{ idx: 2, contents: 'comment' }]),
    normalizeWorkspaceAsset: vi.fn((asset) => ({ id: asset.id ?? asset.idx, originalName: asset.originalName, workspaceId: 42 })),
    normalizeWorkspaceComment: vi.fn((comment) => ({ id: comment.id ?? comment.idx, contents: comment.contents, resolved: Boolean(comment.resolved) })),
    isWorkspaceCommentMentioningCurrentUser: vi.fn(() => false),
    commentAnchorLabel: vi.fn(() => 'Block'),
    upsertWorkspaceComment: vi.fn(),
    showWorkspaceNotice: vi.fn(),
    logger: { error: vi.fn() },
  }
  const context = { ...state, ...api, ...overrides }
  const subject = useWorkspaceAssetsCommentsRealtime(context)
  return { subject, state: context, api }
}

describe('useWorkspaceAssetsCommentsRealtime', () => {
  it('refreshes assets and comments through normalized collection loaders', async () => {
    const { subject, state, api } = createSubject()

    await subject.refreshWorkspaceAssets()
    await subject.refreshWorkspaceComments()

    expect(api.loadWorkspaceAssets).toHaveBeenCalledWith(42)
    expect(api.loadWorkspaceComments).toHaveBeenCalledWith(42)
    expect(state.workspaceAssets.value).toEqual([{ id: 1, originalName: 'asset.png', workspaceId: 42 }])
    expect(state.workspaceComments.value).toEqual([{ id: 2, contents: 'comment', resolved: false }])
    expect(state.workspaceAssetLoading.value).toBe(false)
    expect(state.workspaceCommentLoading.value).toBe(false)
    expect(state.workspaceAssetError.value).toBe('')
    expect(state.workspaceCommentError.value).toBe('')
  })

  it('routes realtime asset and comment messages into existing event handlers', () => {
    const subscriptions = new Map()
    const stompClient = {
      connected: false,
      connect: vi.fn((headers, onConnected) => {
        stompClient.connected = true
        onConnected()
      }),
      subscribe: vi.fn((path, handler) => subscriptions.set(path, handler)),
      disconnect: vi.fn(),
    }
    const { subject, state, api } = createSubject({
      createSocket: vi.fn(() => ({ readyState: 1, close: vi.fn() })),
      createStompClient: vi.fn(() => stompClient),
    })

    subject.connectWorkspaceAssetRealtime(42)
    subscriptions.get('/sub/workspace/assets/42')({
      body: JSON.stringify({
        workspaceIdx: 42,
        action: 'UPLOAD',
        actorUserIdx: 8,
        assets: [{ idx: 3, originalName: 'realtime.pdf' }],
      }),
    })
    subscriptions.get('/sub/workspace/comments/42')({
      body: JSON.stringify({
        workspaceIdx: 42,
        action: 'UPSERT',
        actorUserIdx: 8,
        comment: { idx: 4, contents: 'new comment' },
      }),
    })

    expect(api.getAccessToken).toHaveBeenCalled()
    expect(stompClient.subscribe).toHaveBeenCalledWith('/sub/workspace/assets/42', expect.any(Function))
    expect(stompClient.subscribe).toHaveBeenCalledWith('/sub/workspace/comments/42', expect.any(Function))
    expect(state.workspaceAssets.value.map((asset) => asset.id)).toEqual([3])
    expect(api.upsertWorkspaceComment).toHaveBeenCalledWith({ idx: 4, contents: 'new comment' })
    expect(api.showWorkspaceNotice).toHaveBeenCalled()
  })

  it('exposes asset merge and removal helpers for asset mutations', () => {
    const { subject, state } = createSubject({
      workspaceAssets: ref([{ id: 1, originalName: 'old.txt', workspaceId: 42 }]),
    })

    subject.mergeWorkspaceAssets([{ id: 2, originalName: 'new.txt', workspaceId: 42 }])
    subject.removeWorkspaceAssets([1])

    expect(state.workspaceAssets.value).toEqual([expect.objectContaining({ id: 2, originalName: 'new.txt', workspaceId: 42 })])
  })
})