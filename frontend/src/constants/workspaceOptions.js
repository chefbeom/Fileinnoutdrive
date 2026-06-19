export const WORKSPACE_PROPERTY_STATUS_OPTIONS = Object.freeze([
  { id: 'planning', label: '계획', tone: 'muted' },
  { id: 'active', label: '진행 중', tone: 'good' },
  { id: 'blocked', label: '막힘', tone: 'danger' },
  { id: 'done', label: '완료', tone: 'done' },
])

export const WORKSPACE_PROPERTY_PRIORITY_OPTIONS = Object.freeze([
  { id: 'low', label: '낮음', tone: 'muted' },
  { id: 'normal', label: '보통', tone: 'good' },
  { id: 'high', label: '높음', tone: 'warn' },
  { id: 'urgent', label: '긴급', tone: 'danger' },
])

export const WORKSPACE_COVER_COLOR_OPTIONS = Object.freeze([
  { id: 'blue', label: '파랑' },
  { id: 'green', label: '초록' },
  { id: 'amber', label: '노랑' },
  { id: 'rose', label: '장미' },
  { id: 'violet', label: '보라' },
  { id: 'slate', label: '회색' },
])

export const WORKSPACE_QUICK_BLOCK_OPTIONS = Object.freeze([
  { id: 'paragraph', label: '문단', description: '본문 텍스트 블록', icon: 'fa-regular fa-file-lines', textPlaceholder: '문단 내용' },
  { id: 'header', label: '제목', description: '섹션 제목 블록', icon: 'fa-solid fa-heading', textPlaceholder: '제목' },
  { id: 'checklist', label: '체크리스트', description: '작업 체크 항목', icon: 'fa-regular fa-square-check', textPlaceholder: '작업 내용' },
  { id: 'quote', label: '인용', description: '강조 인용 블록', icon: 'fa-solid fa-quote-left', textPlaceholder: '인용문' },
  { id: 'warning', label: '콜아웃', description: '주의/안내 블록', icon: 'fa-solid fa-triangle-exclamation', textPlaceholder: '콜아웃 제목' },
  { id: 'delimiter', label: '구분선', description: '섹션 구분선', icon: 'fa-solid fa-minus', textPlaceholder: '' },
  { id: 'table', label: '표', description: '2열 기본 표', icon: 'fa-solid fa-table-cells', textPlaceholder: '' },
])

export const PAGE_FOCUSED_WORKSPACE_PANEL_IDS = Object.freeze([
  'home',
  'summary',
  'collaboration',
  'activity',
  'search',
  'blocks',
  'tasks',
  'outline',
  'links',
  'history',
  'review',
  'assets',
])

export const workspaceTemplates = Object.freeze([
  {
    id: 'meeting',
    icon: 'fa-regular fa-clipboard',
    title: '회의록',
    description: '안건, 결정사항, 다음 액션을 빠르게 정리합니다.',
    titleValue: '회의록',
    blocks: [
      { type: 'header', data: { text: '회의록', level: 1 } },
      { type: 'paragraph', data: { text: '날짜: ' } },
      { type: 'paragraph', data: { text: '참석자: ' } },
      { type: 'header', data: { text: '안건', level: 2 } },
      { type: 'paragraph', data: { text: '- 논의할 내용을 적어주세요.' } },
      { type: 'header', data: { text: '결정사항', level: 2 } },
      { type: 'paragraph', data: { text: '- 결정된 내용을 정리해주세요.' } },
      { type: 'header', data: { text: '다음 액션', level: 2 } },
      {
        type: 'list',
        data: {
          style: 'checklist',
          items: [
            { content: '담당자 / 할 일 / 기한', meta: { checked: false }, items: [] },
          ],
        },
      },
    ],
  },
  {
    id: 'project',
    icon: 'fa-solid fa-diagram-project',
    title: '프로젝트 계획',
    description: '목표, 범위, 일정, 담당자를 한 페이지에 모읍니다.',
    titleValue: '프로젝트 계획',
    blocks: [
      { type: 'header', data: { text: '프로젝트 계획', level: 1 } },
      { type: 'header', data: { text: '목표', level: 2 } },
      { type: 'paragraph', data: { text: '이 프로젝트가 달성해야 하는 결과를 적어주세요.' } },
      { type: 'header', data: { text: '범위', level: 2 } },
      { type: 'paragraph', data: { text: '포함할 일과 제외할 일을 구분합니다.' } },
      { type: 'header', data: { text: '일정', level: 2 } },
      {
        type: 'list',
        data: {
          style: 'checklist',
          items: [
            { content: '시작일 / 마감일 / 주요 마일스톤', meta: { checked: false }, items: [] },
          ],
        },
      },
      { type: 'header', data: { text: '담당자', level: 2 } },
      { type: 'paragraph', data: { text: '- 역할과 책임을 적어주세요.' } },
    ],
  },
  {
    id: 'handoff',
    icon: 'fa-solid fa-folder-open',
    title: '파일 공유 정리',
    description: '공유 파일, 권한, 검토 요청을 한 번에 정리합니다.',
    titleValue: '파일 공유 정리',
    blocks: [
      { type: 'header', data: { text: '파일 공유 정리', level: 1 } },
      { type: 'header', data: { text: '공유 목적', level: 2 } },
      { type: 'paragraph', data: { text: '파일을 공유하는 이유와 필요한 맥락을 적어주세요.' } },
      { type: 'header', data: { text: '첨부 파일', level: 2 } },
      { type: 'paragraph', data: { text: '- 업로드 후 오른쪽 첨부 패널에서 확인할 수 있습니다.' } },
      { type: 'header', data: { text: '권한 및 검토 요청', level: 2 } },
      {
        type: 'list',
        data: {
          style: 'checklist',
          items: [
            { content: '확인 대상 / 필요한 피드백 / 공유 권한', meta: { checked: false }, items: [] },
          ],
        },
      },
    ],
  },
  {
    id: 'retro',
    icon: 'fa-regular fa-comments',
    title: '회고 노트',
    description: '좋았던 점, 아쉬운 점, 개선 액션을 남깁니다.',
    titleValue: '회고 노트',
    blocks: [
      { type: 'header', data: { text: '회고 노트', level: 1 } },
      { type: 'header', data: { text: '잘된 점', level: 2 } },
      { type: 'paragraph', data: { text: '- 유지하고 싶은 점을 적어주세요.' } },
      { type: 'header', data: { text: '아쉬운 점', level: 2 } },
      { type: 'paragraph', data: { text: '- 다음에는 다르게 해볼 점을 적어주세요.' } },
      { type: 'header', data: { text: '개선 액션', level: 2 } },
      {
        type: 'list',
        data: {
          style: 'checklist',
          items: [
            { content: '담당자 / 액션 / 기한', meta: { checked: false }, items: [] },
          ],
        },
      },
    ],
  },
])
