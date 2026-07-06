import { describe, expect, it } from 'vitest'

import {
  blockTypeLabel,
  commentAnchorLabel,
  formatDocumentTime,
  roleLabel,
  userInitial,
  workspacePresenceStatusLabel,
  workspaceRevisionReasonLabel,
} from './workspacePresentation.js'

describe('workspacePresentation', () => {
  it('formats role, presence, initials, block labels, and revision reasons', () => {
    expect(roleLabel('ADMIN')).toBe('관리자')
    expect(roleLabel('WRITE')).toBe('편집자')
    expect(roleLabel('UNKNOWN')).toBe('뷰어')
    expect(workspacePresenceStatusLabel({ status: 'away' })).toBe('자리비움')
    expect(workspacePresenceStatusLabel({ status: 'offline' })).toBe('오프라인')
    expect(workspacePresenceStatusLabel({ status: 'online' })).toBe('접속 중')
    expect(userInitial(' beta ')).toBe('B')
    expect(blockTypeLabel('header')).toBe('제목')
    expect(blockTypeLabel('unknown')).toBe('블록')
    expect(workspaceRevisionReasonLabel('restore')).toBe('복구')
    expect(workspaceRevisionReasonLabel('save')).toBe('저장')
  })

  it('formats comment anchor labels and relative document time', () => {
    expect(commentAnchorLabel(null)).toBe('문서 전체')
    expect(commentAnchorLabel({ anchorBlockId: 'b1', anchorText: '문장' })).toBe('문장')
    expect(commentAnchorLabel({ anchorBlockId: 'b1', anchorBlockType: 'quote' })).toBe('인용 블록')

    const now = new Date('2026-07-03T12:00:00Z').getTime()
    expect(formatDocumentTime('', now)).toBe('최근 편집 정보 없음')
    expect(formatDocumentTime('bad-date', now)).toBe('최근 편집 정보 없음')
    expect(formatDocumentTime('2026-07-03T11:59:45Z', now)).toBe('방금 편집')
    expect(formatDocumentTime('2026-07-03T11:10:00Z', now)).toBe('50분 전')
    expect(formatDocumentTime('2026-07-03T08:00:00Z', now)).toBe('4시간 전')
    expect(formatDocumentTime('2026-07-01T12:00:00Z', now)).toBe('2일 전')
  })
})
