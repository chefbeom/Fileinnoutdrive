export const workspaceDocumentSectionMessages = Object.freeze({
  renamed: '섹션 이름을 변경했습니다.',
  removed: '섹션을 제거했습니다.',
  removeTitle: '섹션 제거',
  removeConfirmLabel: '제거',
  removeMessageFor: (section) => `"${section.name}" 섹션을 제거할까요? 문서는 제거되지 않습니다.`,
})

export const workspaceDocumentActionMessages = Object.freeze({
  untitled: '제목 없음',
  copySuffix: '복사본',
  duplicateError: '문서를 복제하지 못했습니다.',
  removeError: '문서를 정리하지 못했습니다.',
  deleteTitle: '문서 삭제',
  removeTitle: '목록에서 제거',
  deleteConfirmLabel: '삭제',
  removeConfirmLabel: '제거',
  deleted: '문서를 삭제했습니다.',
  removed: '목록에서 제거했습니다.',
  deleteMessageFor: (document, title) => `"${title}" 문서를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
  removeMessageFor: (document, title) => `"${title}" 문서를 목록에서 제거할까요?`,
})
