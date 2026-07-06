import { describe, expect, it } from 'vitest'

import {
  workspaceDocumentActionMessages,
  workspaceDocumentSectionMessages,
} from './workspaceDocumentMessages.js'

describe('workspaceDocumentMessages', () => {
  it('formats section removal confirmation text', () => {
    expect(workspaceDocumentSectionMessages.removeMessageFor({ name: '기획' })).toBe(
      '"기획" 섹션을 제거할까요? 문서는 제거되지 않습니다.',
    )
  })

  it('formats document deletion and list removal confirmation text', () => {
    expect(workspaceDocumentActionMessages.deleteMessageFor({}, 'Roadmap')).toBe(
      '"Roadmap" 문서를 삭제할까요? 이 작업은 되돌릴 수 없습니다.',
    )
    expect(workspaceDocumentActionMessages.removeMessageFor({}, 'Roadmap')).toBe(
      '"Roadmap" 문서를 목록에서 제거할까요?',
    )
  })
})
