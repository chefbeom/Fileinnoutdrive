import { describe, expect, it } from 'vitest'

import {
  createWorkspaceAssetRealtimeNotice,
  createWorkspaceCommentRealtimeNotice,
  isWorkspaceRealtimeEventFromCurrentUser,
} from './workspaceRealtime.js'

describe('workspaceRealtime', () => {
  it('detects events created by the current user', () => {
    expect(isWorkspaceRealtimeEventFromCurrentUser({ actorUserIdx: 7 }, 7)).toBe(true)
    expect(isWorkspaceRealtimeEventFromCurrentUser({ actorUserIdx: 7 }, 8)).toBe(false)
    expect(isWorkspaceRealtimeEventFromCurrentUser({}, 7)).toBe(false)
  })

  it('creates comment realtime notices', () => {
    expect(createWorkspaceCommentRealtimeNotice({ payload: { action: 'DELETE' } })).toMatchObject({
      message: '다른 사용자가 댓글을 삭제했습니다.',
      actionLabel: '댓글 보기',
    })

    expect(createWorkspaceCommentRealtimeNotice({
      payload: { action: 'UPSERT' },
      comment: { authorName: '민수', resolved: false },
      anchorLabel: '문단',
    })).toMatchObject({
      message: '민수님이 댓글을 남겼습니다. · 문단',
      tone: 'info',
    })

    expect(createWorkspaceCommentRealtimeNotice({
      payload: { action: 'UPSERT' },
      comment: { authorName: '지윤', resolved: false },
      previousComment: { resolved: false },
      mentionedMe: true,
    })).toMatchObject({
      message: '지윤님이 나를 언급했습니다.',
      tone: 'warn',
      timeout: 7200,
    })
  })

  it('creates asset realtime notices', () => {
    expect(createWorkspaceAssetRealtimeNotice({
      payload: { action: 'UPLOAD' },
      assets: [{ id: 1 }],
      assetLabel: 'a.pdf',
    })).toMatchObject({
      message: '다른 사용자가 a.pdf을 업로드했습니다.',
      actionLabel: '첨부 보기',
      asset: { id: 1 },
    })

    expect(createWorkspaceAssetRealtimeNotice({
      payload: { action: 'DELETE' },
      deletedIds: [1, 2],
      assetLabel: '2개 파일',
    })).toMatchObject({
      message: '다른 사용자가 2개 파일을 삭제했습니다.',
      asset: null,
    })
  })
})