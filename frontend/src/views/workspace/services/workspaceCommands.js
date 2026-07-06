import { formatDocumentTime, roleLabel } from './workspacePresentation.js'

export const createWorkspacePanelTabs = ({
  homeAttentionCount = 0,
  activeUserCount = 0,
  activityCount = 0,
  fullTextResultCount = 0,
  quickBlockCount = 0,
  openTaskCount = 0,
  outlineCount = 0,
  relationCount = 0,
  revisionCount = 0,
  unresolvedCommentCount = 0,
  assetCount = 0,
} = {}) => [
  { id: 'all', label: '전체', count: null },
  { id: 'home', label: '페이지', count: homeAttentionCount },
  { id: 'summary', label: '요약', count: null },
  { id: 'collaboration', label: '협업', count: activeUserCount },
  { id: 'activity', label: '활동', count: activityCount },
  { id: 'search', label: '검색', count: fullTextResultCount },
  { id: 'blocks', label: '블록', count: quickBlockCount },
  { id: 'tasks', label: '작업', count: openTaskCount },
  { id: 'outline', label: '개요', count: outlineCount },
  { id: 'links', label: '연결', count: relationCount },
  { id: 'history', label: '기록', count: revisionCount },
  { id: 'review', label: '댓글', count: unresolvedCommentCount },
  { id: 'assets', label: '첨부', count: assetCount },
]

export const createWorkspaceCommandBaseItems = ({
  canEditWorkspace = false,
  hasUnsavedChanges = false,
  isWorkspacePageLocked = false,
  canFavoriteCurrentWorkspaceDocument = false,
  isCurrentWorkspaceDocumentFavorite = false,
  canManageWorkspaceShare = false,
  isValid = false,
  canExportWorkspaceMarkdown = false,
  canStartWorkspaceSubpage = false,
  currentWorkspaceParentPage = null,
  currentUserEmail = '',
  mentionedWorkspaceCommentCount = 0,
  documents = [],
  favoriteDocumentIds = [],
  canShowWorkspaceTemplates = false,
  templates = [],
  canInsertWorkspaceQuickBlock = false,
  quickBlocks = [],
  panelTabs = [],
  roleLabelFor = roleLabel,
  formatDocumentTimeFor = formatDocumentTime,
} = {}) => {
  const actionItems = [
    {
      id: 'action:new',
      type: 'action',
      kindLabel: '액션',
      action: 'new',
      icon: 'fa-regular fa-square-plus',
      title: '새 페이지',
      detail: '비어 있는 WorkSpace 페이지를 만듭니다.',
      keywords: 'new create page workspace',
    },
    ...(canEditWorkspace
      ? [{
          id: 'action:save',
          type: 'action',
          kindLabel: '액션',
          action: 'save',
          icon: 'fa-regular fa-floppy-disk',
          title: '현재 페이지 저장',
          detail: hasUnsavedChanges ? '변경사항을 바로 저장합니다.' : '현재 페이지는 저장된 상태입니다.',
          keywords: 'save persist autosave',
        }]
      : []),
    ...(canEditWorkspace
      ? [{
          id: 'action:lock',
          type: 'action',
          kindLabel: '액션',
          action: 'lock',
          icon: isWorkspacePageLocked ? 'fa-solid fa-lock-open' : 'fa-solid fa-lock',
          title: isWorkspacePageLocked ? '페이지 잠금 해제' : '페이지 잠금',
          detail: isWorkspacePageLocked
            ? '현재 페이지의 편집 보호를 해제합니다.'
            : '실수로 내용이 바뀌지 않도록 현재 페이지를 잠급니다.',
          keywords: 'lock unlock protect page readonly notion',
        }]
      : []),
    ...(canFavoriteCurrentWorkspaceDocument
      ? [{
          id: 'action:favorite-current',
          type: 'action',
          kindLabel: '액션',
          action: 'favorite-current',
          icon: isCurrentWorkspaceDocumentFavorite ? 'fa-solid fa-star' : 'fa-regular fa-star',
          title: isCurrentWorkspaceDocumentFavorite ? '현재 페이지 즐겨찾기 해제' : '현재 페이지 즐겨찾기',
          detail: '사이드바 즐겨찾기에 현재 페이지를 고정합니다.',
          keywords: 'favorite star pin current page notion',
        }]
      : []),
    ...(canManageWorkspaceShare && isValid
      ? [{
          id: 'action:share',
          type: 'action',
          kindLabel: '액션',
          action: 'share',
          icon: 'fa-solid fa-share-nodes',
          title: '공유 설정 열기',
          detail: '멤버 초대와 공개 범위를 관리합니다.',
          keywords: 'share invite member permission',
        }]
      : []),
    ...(canExportWorkspaceMarkdown
      ? [{
          id: 'action:export-markdown',
          type: 'action',
          kindLabel: '액션',
          action: 'export-markdown',
          icon: 'fa-solid fa-file-arrow-down',
          title: 'Markdown 내보내기',
          detail: '현재 페이지를 .md 파일로 저장합니다.',
          keywords: 'export markdown download md page notion',
        }]
      : []),
    ...(canStartWorkspaceSubpage
      ? [{
          id: 'action:subpage',
          type: 'action',
          kindLabel: '액션',
          action: 'subpage',
          icon: 'fa-regular fa-file-lines',
          title: '하위 페이지 만들기',
          detail: '현재 페이지에 새 페이지 링크를 추가합니다.',
          keywords: 'subpage child page nested link notion',
        }]
      : []),
    ...(currentWorkspaceParentPage
      ? [{
          id: 'action:parent',
          type: 'action',
          kindLabel: '이동',
          action: 'parent',
          icon: 'fa-solid fa-turn-up',
          title: '상위 페이지 열기',
          detail: currentWorkspaceParentPage.title,
          keywords: 'parent page breadcrumb hierarchy up',
        }]
      : []),
    ...(currentUserEmail
      ? [{
          id: 'action:mentions',
          type: 'action',
          kindLabel: '이동',
          action: 'mentions',
          icon: 'fa-solid fa-at',
          title: '내 멘션 댓글 보기',
          detail: `열린 멘션 ${mentionedWorkspaceCommentCount}개`,
          keywords: 'mention comments review notification me alert',
        }]
      : []),
  ]

  const favoriteIdSet = new Set((Array.isArray(favoriteDocumentIds) ? favoriteDocumentIds : []).map((id) => String(id)))
  const documentItems = (Array.isArray(documents) ? documents : [])
    .map((document) => {
      const favorite = favoriteIdSet.has(String(document.id))
      return {
        id: `document:${document.id}`,
        type: 'document',
        kindLabel: favorite ? '즐겨찾기' : '문서',
        icon: favorite ? 'fa-solid fa-star' : document.scope === 'shared' ? 'fa-solid fa-user-group' : 'fa-regular fa-file-lines',
        title: document.title,
        detail: `${favorite ? '즐겨찾기 · ' : ''}${document.scope === 'shared' ? '공유 페이지' : '내 페이지'} · ${roleLabelFor(document.role)} · ${formatDocumentTimeFor(document.updatedAt)}`,
        keywords: `${document.title} ${document.status} ${document.role} ${favorite ? 'favorite 즐겨찾기' : ''}`,
        document,
        favorite,
      }
    })
    .sort((left, right) => Number(right.favorite) - Number(left.favorite))

  const templateItems = canShowWorkspaceTemplates
    ? (Array.isArray(templates) ? templates : []).map((template) => ({
        id: `template:${template.id}`,
        type: 'template',
        kindLabel: '템플릿',
        icon: template.icon,
        title: template.title,
        detail: template.description,
        keywords: `${template.title} ${template.description}`,
        template,
      }))
    : []

  const blockItems = canInsertWorkspaceQuickBlock
    ? (Array.isArray(quickBlocks) ? quickBlocks : []).map((block) => ({
        id: `block:${block.id}`,
        type: 'block',
        kindLabel: '블록',
        icon: block.icon,
        title: `${block.label} 블록 삽입`,
        detail: block.description,
        keywords: `${block.id} ${block.label} ${block.description} block insert notion`,
        block,
      }))
    : []

  const panelItems = (Array.isArray(panelTabs) ? panelTabs : [])
    .filter((tab) => tab.id !== 'all')
    .map((tab) => ({
      id: `panel:${tab.id}`,
      type: 'panel',
      kindLabel: '패널',
      icon: 'fa-solid fa-table-columns',
      title: `${tab.label} 패널 열기`,
      detail: tab.count == null ? '오른쪽 협업 패널로 이동합니다.' : `${tab.count}개 항목을 확인합니다.`,
      keywords: `${tab.id} ${tab.label} panel sidebar`,
      panelId: tab.id,
    }))

  return [...actionItems, ...documentItems, ...templateItems, ...blockItems, ...panelItems]
}

export const filterWorkspaceCommandItems = (items = [], query = '', limit = 14) => {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  const rows = Array.isArray(items) ? items : []
  if (!normalizedQuery) return rows.slice(0, limit)
  return rows
    .filter((item) => `${item.title} ${item.detail} ${item.keywords || ''}`.toLowerCase().includes(normalizedQuery))
    .slice(0, limit)
}

export const workspaceCommandActiveItem = (items = [], activeIndex = 0) =>
  (Array.isArray(items) ? items : [])[activeIndex] || null

export const workspaceCommandEmptyLabel = (query = '') =>
  String(query || '').trim()
    ? '검색 결과가 없습니다.'
    : '문서, 템플릿, 패널, 액션을 바로 실행할 수 있습니다.'

const normalizeWorkspaceCommandIndexNumber = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : fallback
}

export const moveWorkspaceCommandActiveIndex = (activeIndex = 0, direction = 0, itemCount = 0) => {
  const count = normalizeWorkspaceCommandIndexNumber(itemCount)
  if (count <= 0) return 0
  const current = normalizeWorkspaceCommandIndexNumber(activeIndex)
  const step = normalizeWorkspaceCommandIndexNumber(direction)
  return ((current + step) % count + count) % count
}

export const clampWorkspaceCommandActiveIndex = (activeIndex = 0, itemCount = 0) => {
  const count = normalizeWorkspaceCommandIndexNumber(itemCount)
  if (count <= 0) return 0
  const current = normalizeWorkspaceCommandIndexNumber(activeIndex)
  return Math.min(Math.max(current, 0), count - 1)
}