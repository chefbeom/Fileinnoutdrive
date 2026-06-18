<script setup>
import { computed, defineAsyncComponent, markRaw, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { downloadFileAsset } from '@/api/filesApi.js'
import postApi from '@/api/postApi.js'
import { initEditor } from '@/components/workspace/editor.js'
import loadpost from '@/components/workspace/loadpost.js'
import { useAuthStore } from '@/stores/useAuthStore.js'
import SockJS from 'sockjs-client'
import Stomp from 'stompjs'
import { apiPath } from '@/utils/backendUrl.js'

const route     = useRoute()
const router    = useRouter()
const authStore = useAuthStore()
const ShareModal = defineAsyncComponent(() => import('@/views/workspace/ShareModal.vue'))

const WORKSPACE_PROPERTY_STATUS_OPTIONS = Object.freeze([
  { id: 'planning', label: '계획', tone: 'muted' },
  { id: 'active', label: '진행 중', tone: 'good' },
  { id: 'blocked', label: '막힘', tone: 'danger' },
  { id: 'done', label: '완료', tone: 'done' },
])
const WORKSPACE_PROPERTY_PRIORITY_OPTIONS = Object.freeze([
  { id: 'low', label: '낮음', tone: 'muted' },
  { id: 'normal', label: '보통', tone: 'good' },
  { id: 'high', label: '높음', tone: 'warn' },
  { id: 'urgent', label: '긴급', tone: 'danger' },
])
const WORKSPACE_COVER_COLOR_OPTIONS = Object.freeze([
  { id: 'blue', label: '파랑' },
  { id: 'green', label: '초록' },
  { id: 'amber', label: '노랑' },
  { id: 'rose', label: '장미' },
  { id: 'violet', label: '보라' },
  { id: 'slate', label: '회색' },
])
const WORKSPACE_QUICK_BLOCK_OPTIONS = Object.freeze([
  { id: 'paragraph', label: '문단', description: '본문 텍스트 블록', icon: 'fa-regular fa-file-lines', textPlaceholder: '문단 내용' },
  { id: 'header', label: '제목', description: '섹션 제목 블록', icon: 'fa-solid fa-heading', textPlaceholder: '제목' },
  { id: 'checklist', label: '체크리스트', description: '작업 체크 항목', icon: 'fa-regular fa-square-check', textPlaceholder: '작업 내용' },
  { id: 'quote', label: '인용', description: '강조 인용 블록', icon: 'fa-solid fa-quote-left', textPlaceholder: '인용문' },
  { id: 'warning', label: '콜아웃', description: '주의/안내 블록', icon: 'fa-solid fa-triangle-exclamation', textPlaceholder: '콜아웃 제목' },
  { id: 'delimiter', label: '구분선', description: '섹션 구분선', icon: 'fa-solid fa-minus', textPlaceholder: '' },
  { id: 'table', label: '표', description: '2열 기본 표', icon: 'fa-solid fa-table-cells', textPlaceholder: '' },
])

const editorHolder    = ref(null)
const editorApi       = ref(null)
const title           = ref('')
const isEditorLoading = ref(false)
const showUserList    = ref(false)
const titleDirty      = ref(false)
const saveState       = ref('idle')
const saveError       = ref('')
const lastSavedAt     = ref(null)
const workspaceDocumentQuery   = ref('')
const workspaceDocumentsLoading = ref(false)
const workspaceDocumentLinkCopiedId = ref('')
const favoriteWorkspaceDocumentIds = ref([])
const recentWorkspaceDocumentIds = ref([])
const workspaceMarkdownExporting = ref(false)
const workspaceDocumentSections = ref([])
const workspaceSectionNameDraft = ref('')
const workspaceSectionEditingId = ref('')
const workspaceSectionEditDraft = ref('')
const workspaceSectionEditInput = ref(null)
const workspaceCommandInput    = ref(null)
const isWorkspaceCommandPaletteOpen = ref(false)
const workspaceCommandQuery    = ref('')
const workspaceCommandActiveIndex = ref(0)
const showWorkspaceShareModal  = ref(false)
const workspaceShareStatus     = ref('Private')
const workspaceUuid            = ref('')
const workspaceTemplateApplied = ref(false)
const workspaceTemplateApplying = ref('')
const workspacePropertyIcon     = ref('📄')
const workspacePropertyCoverColor = ref('blue')
const workspacePropertyStatus   = ref('planning')
const workspacePropertyPriority = ref('normal')
const workspacePropertyOwnerEmail = ref('')
const workspacePropertyOwnerName = ref('')
const workspacePropertyDueDate  = ref('')
const workspacePropertyTagsInput = ref('')
const workspacePageLocked        = ref(false)
const workspaceParentPageId      = ref('')
const workspaceParentPageTitle   = ref('')
const allowRouteLeaveOnce  = ref(false)
const allowWindowUnloadOnce = ref(false)

const LEAVE_WARNING_MESSAGE = '현재 페이지를 나가시겠습니까? 저장하지 않은 페이지는 모두 사라집니다.'

const workspaceId             = ref(null)
const workspaceAccessRole     = ref('ADMIN')
const workspaceAssets         = ref([])
const workspaceAssetLoading   = ref(false)
const workspaceAssetUploading = ref(false)
const workspaceAssetError     = ref('')
const deletingAssetIds        = ref([])
const imageInput              = ref(null)
const fileInput               = ref(null)
const workspaceCommentInput   = ref(null)
const activeWorkspaceAssetId  = ref(null)
const savingWorkspaceAssetIds = ref([])
const workspaceComments       = ref([])
const workspaceCommentLoading = ref(false)
const workspaceCommentSaving  = ref(false)
const workspaceCommentError   = ref('')
const newWorkspaceComment     = ref('')
const workspaceCommentFilter  = ref('open')
const showWorkspaceMentionMenu = ref(false)
const workspaceCommentEditingId = ref('')
const workspaceCommentEditDraft = ref('')
const newWorkspaceTask        = ref('')
const newWorkspaceTaskAssignee = ref('')
const newWorkspaceTaskDueDate = ref('')
const workspaceTaskFilter     = ref('open')
const workspaceTaskAdding     = ref(false)
const workspaceInboxFilter    = ref('mine')
const workspaceCalendarFilter = ref('upcoming')
const workspaceTimelineFilter = ref('open')
const workspaceSubpageInput   = ref(null)
const workspaceTreeSubpageInput = ref(null)
const workspaceTreeRenameInput = ref(null)
const workspaceSubpageTitle   = ref('')
const workspaceSubpageCreating = ref(false)
const workspaceTreeSubpageCreatingId = ref('')
const workspaceTreeSubpageComposerParentId = ref('')
const workspaceTreeSubpageTitle = ref('')
const workspaceTreeRenamingId = ref('')
const workspaceTreeRenameDraft = ref('')
const workspaceTreeRenameSavingId = ref('')
const workspaceTreeMovingId = ref('')
const workspaceTreeMoveTargetId = ref('')
const workspaceTreeMoveSavingId = ref('')
const workspaceSubpageError   = ref('')
const workspaceTreeSubpageError = ref('')
const workspaceTreeRenameError = ref('')
const workspaceTreeMoveError = ref('')
const workspaceQuickBlockText = ref('')
const workspaceInlineQuickBlockText = ref('')
const workspaceQuickBlockAdding = ref('')
const workspaceFullTextQuery  = ref('')
const workspaceFullTextResults = ref([])
const workspaceFullTextLoading = ref(false)
const workspaceFullTextError = ref('')
const workspaceFullTextRefreshedAt = ref(null)
const workspacePageTreeQuery = ref('')
const workspacePageIndexRows = ref([])
const workspacePageIndexLoading = ref(false)
const workspacePageIndexError = ref('')
const workspacePageIndexFilter = ref('all')
const workspacePageIndexQuery = ref('')
const workspacePageIndexTagFilter = ref('')
const workspacePageIndexOwnerFilter = ref('')
const workspacePageIndexSort = ref('updated-desc')
const workspacePageIndexViews = ref([])
const workspacePageIndexViewName = ref('')
const workspacePreferencesRemoteReady = ref(false)
const workspacePreferencesDirtyBeforeRemoteLoad = ref(false)
const workspacePreferencesSaving = ref(false)
const workspacePreferencesSaveTimer = ref(null)
const workspacePageIndexSelectedIds = ref([])
const workspacePageIndexBulkStatus = ref('')
const workspacePageIndexBulkPriority = ref('')
const workspacePageIndexBulkOwnerEmail = ref('')
const workspacePageIndexBulkDueDate = ref('')
const workspacePageIndexBulkClearDueDate = ref(false)
const workspacePageIndexBulkUpdating = ref(false)
const workspacePageIndexRefreshedAt = ref(null)
const workspacePageIndexUpdatingIds = ref([])
const workspaceBoardDraggingId = ref('')
const workspaceBoardDragOverStatus = ref('')
const collapsedWorkspacePageTreeIds = ref([])
const workspaceMembers        = ref([])
const workspaceMemberLoading  = ref(false)
const workspaceMemberError    = ref('')
const workspaceMemberActionLoading = ref('')
const workspaceMemberRefreshedAt = ref(null)
const resolvingCommentIds     = ref([])
const deletingCommentIds      = ref([])
const updatingCommentIds      = ref([])
const workspaceRevisions      = ref([])
const workspaceRevisionLoading = ref(false)
const workspaceRevisionError   = ref('')
const activeWorkspaceRevision  = ref(null)
const workspaceRevisionDiff    = ref(null)
const workspaceRevisionPreviewLoading = ref('')
const workspaceRevisionRestoring = ref('')
const workspaceBacklinks       = ref([])
const workspaceBacklinkLoading = ref(false)
const workspaceBacklinkError   = ref('')
const workspaceBacklinkRefreshedAt = ref(null)
const documentActionLoading   = ref('')
const workspaceNotice         = ref(null)
const workspaceConfirm        = ref(null)
const togglingWorkspaceTaskIds = ref([])
const togglingWorkspaceInboxTaskIds = ref([])

// ✅ 드롭다운 열림 상태
const openRoleDropdownId = ref(null)
const activeWorkspacePanelTab = ref('all')
const isWorkspacePanelCollapsed = ref(false)

const PAGE_FOCUSED_WORKSPACE_PANEL_IDS = Object.freeze([
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

// ─── 계산 속성 ────────────────────────────────────────────────────────────────
const workspaceTemplates = Object.freeze([
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

const isValid = computed(() => title.value.trim().length > 0)
const hasUnsavedChanges = computed(() =>
  titleDirty.value || Boolean(editorApi.value?.isDirtyRef?.value),
)

const remoteCursors = computed(() => editorApi.value?.remoteCursorsRef?.value || {})
const activeUsers   = computed(() => editorApi.value?.activeUsersRef?.value   || [])
const selectedBlockAnchor = computed(() => editorApi.value?.selectedBlockAnchorRef?.value || null)
const documentOutline = computed(() => editorApi.value?.documentOutlineRef?.value || [])
const documentTasks = computed(() => editorApi.value?.documentTasksRef?.value || [])
const documentSearchText = computed(() => editorApi.value?.documentSearchTextRef?.value || '')
const documentWorkspaceLinks = computed(() => editorApi.value?.documentWorkspaceLinksRef?.value || [])
const documentStats = computed(() => editorApi.value?.documentStatsRef?.value || {
  blockCount: 0,
  textBlockCount: 0,
  characterCount: 0,
  wordCount: 0,
  imageCount: 0,
  checklistBlockCount: 0,
})
const openDocumentTasks = computed(() => documentTasks.value.filter((task) => !task.checked))
const completedDocumentTasks = computed(() => documentTasks.value.filter((task) => task.checked))
const workspaceTaskTodayKey = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const isWorkspaceTaskOverdue = (task) =>
  Boolean(task?.dueDate && !task.checked && String(task.dueDate) < workspaceTaskTodayKey())
const overdueDocumentTasks = computed(() => documentTasks.value.filter(isWorkspaceTaskOverdue))
const documentTaskProgress = computed(() => {
  if (!documentTasks.value.length) return 0
  return Math.round((completedDocumentTasks.value.length / documentTasks.value.length) * 100)
})
const documentTaskSummaryLabel = computed(() => {
  if (!documentTasks.value.length) return '작업 없음'
  return `${completedDocumentTasks.value.length}/${documentTasks.value.length} 완료`
})
const canAddWorkspaceTask = computed(() =>
  canModifyWorkspacePage.value &&
  !workspaceTaskAdding.value &&
  newWorkspaceTask.value.trim().length > 0,
)
const canInsertWorkspaceQuickBlock = computed(() =>
  canModifyWorkspacePage.value &&
  !isEditorLoading.value &&
  Boolean(editorApi.value?.appendWorkspaceBlock),
)
const workspaceInlineQuickBlockOptions = computed(() =>
  WORKSPACE_QUICK_BLOCK_OPTIONS.filter((block) =>
    ['paragraph', 'header', 'checklist', 'quote', 'warning', 'table'].includes(block.id),
  ),
)
const canStartWorkspaceSubpage = computed(() =>
  canModifyWorkspacePage.value &&
  !isEditorLoading.value &&
  Boolean(editorApi.value?.appendWorkspacePageLink),
)
const canCreateWorkspaceSubpage = computed(() =>
  canStartWorkspaceSubpage.value &&
  !workspaceSubpageCreating.value &&
  workspaceSubpageTitle.value.trim().length > 0,
)
const canSearchWorkspaceFullText = computed(() =>
  workspaceFullTextQuery.value.trim().length >= 2 &&
  workspaceDocuments.value.length > 0 &&
  !workspaceFullTextLoading.value,
)
const workspacePageIndexFilterOptions = computed(() => [
  { id: 'all', label: '전체', count: workspacePageIndexRows.value.length },
  {
    id: 'active',
    label: '진행',
    count: workspacePageIndexRows.value.filter((row) => row.status === 'active').length,
  },
  {
    id: 'blocked',
    label: '막힘',
    count: workspacePageIndexRows.value.filter((row) => row.status === 'blocked').length,
  },
  {
    id: 'overdue',
    label: '기한 지남',
    count: workspacePageIndexRows.value.filter((row) => row.isOverdue).length,
  },
  {
    id: 'shared',
    label: '공유',
    count: workspacePageIndexRows.value.filter((row) => row.scope === 'shared').length,
  },
])
const workspacePageIndexSortOptions = Object.freeze([
  { id: 'updated-desc', label: '최근 수정순' },
  { id: 'due-asc', label: '기한 빠른순' },
  { id: 'priority-desc', label: '우선순위 높은순' },
  { id: 'title-asc', label: '제목순' },
])
const workspacePageIndexPriorityRank = (priority) =>
  WORKSPACE_PROPERTY_PRIORITY_OPTIONS.findIndex((option) => option.id === priority)
const workspacePageIndexRowSearchText = (row = {}) =>
  [
    row.title,
    row.preview,
    row.scopeLabel,
    row.roleLabel,
    row.statusLabel,
    row.priorityLabel,
    row.ownerName,
    row.ownerEmail,
    row.dueDate,
    row.locked ? 'locked 잠김 보호' : 'editable 편집 가능',
    ...(row.tags || []),
  ].join(' ').toLowerCase()
const matchesWorkspacePageIndexQuery = (row, query) =>
  !query || workspacePageIndexRowSearchText(row).includes(query)
const workspacePageIndexTagOptions = computed(() => {
  const tagCounts = new Map()
  workspacePageIndexRows.value.forEach((row) => {
    ;(row.tags || []).forEach((tag) => {
      const normalizedTag = String(tag || '').trim()
      if (!normalizedTag) return
      const tagKey = normalizedTag.toLowerCase()
      const previous = tagCounts.get(tagKey) || { id: tagKey, label: normalizedTag, count: 0 }
      previous.count += 1
      tagCounts.set(tagKey, previous)
    })
  })
  return [...tagCounts.values()]
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count
      return left.label.localeCompare(right.label, 'ko')
    })
    .slice(0, 20)
})
const workspacePageIndexOwnerFilterOptions = computed(() => {
  const ownerCounts = new Map()
  let unassignedCount = 0
  workspacePageIndexRows.value.forEach((row) => {
    const ownerEmail = String(row.ownerEmail || '').trim()
    if (!ownerEmail) {
      unassignedCount += 1
      return
    }
    const ownerKey = ownerEmail.toLowerCase()
    const previous = ownerCounts.get(ownerKey) || {
      id: ownerKey,
      email: ownerEmail,
      label: row.ownerName || ownerEmail,
      count: 0,
    }
    previous.count += 1
    previous.label = previous.label || row.ownerName || ownerEmail
    ownerCounts.set(ownerKey, previous)
  })

  return [
    ...(unassignedCount > 0
      ? [{ id: '__unassigned__', email: '', label: '미배정', count: unassignedCount }]
      : []),
    ...[...ownerCounts.values()].sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count
      return left.label.localeCompare(right.label, 'ko')
    }),
  ]
})
const sortWorkspacePageIndexRows = (rows) => {
  const nextRows = [...rows]
  if (workspacePageIndexSort.value === 'due-asc') {
    return nextRows.sort((left, right) => {
      const leftDue = left.dueDate || '9999-12-31'
      const rightDue = right.dueDate || '9999-12-31'
      if (leftDue !== rightDue) return leftDue.localeCompare(rightDue)
      return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
    })
  }
  if (workspacePageIndexSort.value === 'priority-desc') {
    return nextRows.sort((left, right) => {
      const priorityDiff =
        workspacePageIndexPriorityRank(right.priority) - workspacePageIndexPriorityRank(left.priority)
      if (priorityDiff !== 0) return priorityDiff
      return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
    })
  }
  if (workspacePageIndexSort.value === 'title-asc') {
    return nextRows.sort((left, right) => String(left.title || '').localeCompare(String(right.title || ''), 'ko'))
  }
  return nextRows.sort(
    (left, right) =>
      new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime(),
  )
}
const visibleWorkspacePageIndexRows = computed(() => {
  const query = workspacePageIndexQuery.value.trim().toLowerCase()
  const tagFilter = workspacePageIndexTagFilter.value.trim().toLowerCase()
  const ownerFilter = workspacePageIndexOwnerFilter.value.trim().toLowerCase()
  let rows = workspacePageIndexRows.value
  if (workspacePageIndexFilter.value === 'active') {
    rows = rows.filter((row) => row.status === 'active')
  }
  if (workspacePageIndexFilter.value === 'blocked') {
    rows = rows.filter((row) => row.status === 'blocked')
  }
  if (workspacePageIndexFilter.value === 'overdue') {
    rows = rows.filter((row) => row.isOverdue)
  }
  if (workspacePageIndexFilter.value === 'shared') {
    rows = rows.filter((row) => row.scope === 'shared')
  }
  if (tagFilter) {
    rows = rows.filter((row) => (row.tags || []).some((tag) => String(tag).toLowerCase() === tagFilter))
  }
  if (ownerFilter === '__unassigned__') {
    rows = rows.filter((row) => !row.ownerEmail)
  } else if (ownerFilter) {
    rows = rows.filter((row) => String(row.ownerEmail || '').toLowerCase() === ownerFilter)
  }
  return sortWorkspacePageIndexRows(rows.filter((row) => matchesWorkspacePageIndexQuery(row, query)))
})
const visibleEditableWorkspacePageIndexRows = computed(() =>
  visibleWorkspacePageIndexRows.value.filter((row) => row.canEditProperties),
)
const selectedWorkspacePageIndexRows = computed(() => {
  const selectedIds = new Set(workspacePageIndexSelectedIds.value.map((id) => String(id)))
  return workspacePageIndexRows.value.filter((row) => selectedIds.has(String(row.id)) && row.canEditProperties)
})
const areAllVisibleWorkspacePageIndexRowsSelected = computed(() => {
  const visibleIds = visibleEditableWorkspacePageIndexRows.value.map((row) => String(row.id))
  if (visibleIds.length === 0) return false
  const selectedIds = new Set(workspacePageIndexSelectedIds.value.map((id) => String(id)))
  return visibleIds.every((id) => selectedIds.has(id))
})
const canApplyWorkspacePageIndexBulkUpdate = computed(() =>
  selectedWorkspacePageIndexRows.value.length > 0 &&
  !workspacePageIndexBulkUpdating.value &&
  Boolean(
    workspacePageIndexBulkStatus.value ||
    workspacePageIndexBulkPriority.value ||
    workspacePageIndexBulkOwnerEmail.value ||
    workspacePageIndexBulkDueDate.value ||
    workspacePageIndexBulkClearDueDate.value,
  ),
)
const workspacePageIndexOwnerOptions = (row = {}) => {
  const options = new Map()
  workspacePropertyOwnerCandidates.value.forEach((candidate) => {
    const email = String(candidate.email || '').trim()
    if (!email) return
    options.set(email.toLowerCase(), {
      email,
      name: candidate.name || email,
    })
  })

  const rowEmail = String(row.ownerEmail || '').trim()
  if (rowEmail && !options.has(rowEmail.toLowerCase())) {
    options.set(rowEmail.toLowerCase(), {
      email: rowEmail,
      name: row.ownerName || rowEmail,
    })
  }

  return [...options.values()]
}
const workspaceBoardRows = computed(() => visibleWorkspacePageIndexRows.value)
const workspaceBoardColumns = computed(() =>
  WORKSPACE_PROPERTY_STATUS_OPTIONS.map((option) => {
    const rows = workspaceBoardRows.value
      .filter((row) => row.status === option.id)
      .sort((left, right) => {
        const leftDue = left.dueDate || '9999-12-31'
        const rightDue = right.dueDate || '9999-12-31'
        if (leftDue !== rightDue) return leftDue.localeCompare(rightDue)
        return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
      })
    return {
      ...option,
      rows,
      openTaskCount: rows.reduce(
        (total, row) => total + (row.workspaceTasks || []).filter((task) => !task.checked).length,
        0,
      ),
    }
  }),
)
const currentUserEmail = computed(() => String(authStore.user?.email || '').toLowerCase())
const workspaceIndexedTasks = computed(() =>
  workspacePageIndexRows.value.flatMap((row) =>
    (Array.isArray(row.workspaceTasks) ? row.workspaceTasks : []).map((task) => ({
      ...task,
      documentId: row.id,
      documentTitle: row.title,
      documentScope: row.scope,
      documentRole: row.accessRole || row.role,
      documentUpdatedAt: row.updatedAt,
      document: row,
      scopeLabel: row.scopeLabel,
      roleLabel: row.roleLabel,
      updatedLabel: row.updatedLabel,
      isCurrentDocument: String(row.id || '') === currentWorkspaceKey.value,
      canToggle: !row.locked && ['ADMIN', 'WRITE'].includes(String(row.accessRole || row.role || '').toUpperCase()),
      isMine: currentUserEmail.value
        ? String(task.assigneeEmail || '').toLowerCase() === currentUserEmail.value
        : false,
    })),
  ),
)
const openWorkspaceIndexedTasks = computed(() =>
  workspaceIndexedTasks.value.filter((task) => !task.checked),
)
const completedWorkspaceIndexedTasks = computed(() =>
  workspaceIndexedTasks.value.filter((task) => task.checked),
)
const overdueWorkspaceIndexedTasks = computed(() =>
  workspaceIndexedTasks.value.filter((task) => task.isOverdue),
)
const myWorkspaceIndexedTasks = computed(() =>
  currentUserEmail.value
    ? openWorkspaceIndexedTasks.value.filter((task) => task.isMine)
    : [],
)
const workspaceCalendarDateTime = (value) => {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : date.getTime()
}
const workspaceCalendarDateLabel = (value) => {
  if (!value) return '기한 없음'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  const today = workspaceTaskTodayKey()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowKey = [
    tomorrow.getFullYear(),
    String(tomorrow.getMonth() + 1).padStart(2, '0'),
    String(tomorrow.getDate()).padStart(2, '0'),
  ].join('-')
  if (value === today) return '오늘'
  if (value === tomorrowKey) return '내일'
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).format(date)
}
const workspaceCalendarItems = computed(() => {
  const pageItems = workspacePageIndexRows.value
    .filter((row) => row.dueDate)
    .map((row) => ({
      id: `page:${row.id}`,
      type: 'page',
      typeLabel: '페이지',
      title: row.title,
      dueDate: row.dueDate,
      isOverdue: row.isOverdue,
      isDone: row.status === 'done',
      isMine: currentUserEmail.value
        ? String(row.ownerEmail || '').toLowerCase() === currentUserEmail.value
        : false,
      document: row,
      icon: row.icon,
      statusLabel: row.statusLabel,
      priorityLabel: row.priorityLabel,
      priorityTone: row.priorityTone,
      detail: `${row.scopeLabel} · ${row.roleLabel}`,
    }))

  const taskItems = workspaceIndexedTasks.value
    .filter((task) => task.dueDate)
    .map((task) => ({
      id: `task:${task.id}`,
      type: 'task',
      typeLabel: '작업',
      title: task.text,
      dueDate: task.dueDate,
      isOverdue: task.isOverdue,
      isDone: task.checked,
      isMine: task.isMine,
      task,
      document: task.document,
      icon: '□',
      statusLabel: task.checked ? '완료' : '열림',
      priorityLabel: task.assigneeName || task.assigneeEmail || '',
      priorityTone: task.isOverdue ? 'danger' : 'muted',
      detail: `${task.documentTitle} · ${task.pathLabel}`,
    }))

  return [...pageItems, ...taskItems].sort((left, right) => {
    const dateSort = workspaceCalendarDateTime(left.dueDate) - workspaceCalendarDateTime(right.dueDate)
    if (dateSort !== 0) return dateSort
    if (left.isDone !== right.isDone) return left.isDone ? 1 : -1
    return left.type.localeCompare(right.type)
  })
})
const openWorkspaceCalendarItems = computed(() =>
  workspaceCalendarItems.value.filter((item) => !item.isDone),
)
const overdueWorkspaceCalendarItems = computed(() =>
  workspaceCalendarItems.value.filter((item) => item.isOverdue),
)
const upcomingWorkspaceCalendarItems = computed(() =>
  workspaceCalendarItems.value.filter((item) =>
    !item.isDone && !item.isOverdue && item.dueDate >= workspaceTaskTodayKey(),
  ),
)
const myWorkspaceCalendarItems = computed(() =>
  workspaceCalendarItems.value.filter((item) => item.isMine && !item.isDone),
)
const workspaceCalendarFilterOptions = computed(() => [
  { id: 'upcoming', label: '예정', count: upcomingWorkspaceCalendarItems.value.length },
  { id: 'overdue', label: '지연', count: overdueWorkspaceCalendarItems.value.length },
  { id: 'mine', label: '내 일정', count: myWorkspaceCalendarItems.value.length },
  { id: 'pages', label: '페이지', count: workspaceCalendarItems.value.filter((item) => item.type === 'page').length },
  { id: 'tasks', label: '작업', count: workspaceCalendarItems.value.filter((item) => item.type === 'task').length },
  { id: 'all', label: '전체', count: workspaceCalendarItems.value.length },
])
const visibleWorkspaceCalendarItems = computed(() => {
  if (workspaceCalendarFilter.value === 'all') return workspaceCalendarItems.value
  if (workspaceCalendarFilter.value === 'overdue') return overdueWorkspaceCalendarItems.value
  if (workspaceCalendarFilter.value === 'mine') return myWorkspaceCalendarItems.value
  if (workspaceCalendarFilter.value === 'pages') return workspaceCalendarItems.value.filter((item) => item.type === 'page')
  if (workspaceCalendarFilter.value === 'tasks') return workspaceCalendarItems.value.filter((item) => item.type === 'task')
  return upcomingWorkspaceCalendarItems.value
})
const workspaceCalendarGroups = computed(() => {
  const groups = new Map()
  visibleWorkspaceCalendarItems.value.forEach((item) => {
    const key = item.dueDate || 'none'
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        label: workspaceCalendarDateLabel(item.dueDate),
        date: item.dueDate,
        items: [],
      })
    }
    groups.get(key).items.push(item)
  })
  return [...groups.values()]
})
const workspaceCalendarEmptyLabel = computed(() => {
  if (workspaceCalendarItems.value.length === 0) return '기한이 지정된 페이지나 작업이 없습니다.'
  if (workspaceCalendarFilter.value === 'overdue') return '기한이 지난 일정이 없습니다.'
  if (workspaceCalendarFilter.value === 'mine') return '내게 배정된 일정이 없습니다.'
  if (workspaceCalendarFilter.value === 'pages') return '기한이 지정된 페이지가 없습니다.'
  if (workspaceCalendarFilter.value === 'tasks') return '기한이 지정된 작업이 없습니다.'
  return '예정된 일정이 없습니다.'
})
const workspaceTimelineDateLabel = (value) => {
  if (!value) return '기한 없음'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}
const workspaceTimelineMonthLabel = (value) => {
  if (!value) return '기한 없음'
  const date = new Date(`${value}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
  }).format(date)
}
const workspaceTimelineDaySpan = (startTime, endTime) =>
  Math.max(0, Math.round((endTime - startTime) / 86400000))
const workspaceTimelineItems = computed(() =>
  workspaceCalendarItems.value
    .map((item) => ({
      ...item,
      time: workspaceCalendarDateTime(item.dueDate),
      dateLabel: workspaceTimelineDateLabel(item.dueDate),
      monthKey: item.dueDate ? item.dueDate.slice(0, 7) : 'none',
    }))
    .filter((item) => Number.isFinite(item.time)),
)
const openWorkspaceTimelineItems = computed(() =>
  workspaceTimelineItems.value.filter((item) => !item.isDone),
)
const overdueWorkspaceTimelineItems = computed(() =>
  workspaceTimelineItems.value.filter((item) => item.isOverdue && !item.isDone),
)
const myWorkspaceTimelineItems = computed(() =>
  workspaceTimelineItems.value.filter((item) => item.isMine && !item.isDone),
)
const workspaceTimelineFilterOptions = computed(() => [
  { id: 'open', label: '열림', count: openWorkspaceTimelineItems.value.length },
  { id: 'overdue', label: '지연', count: overdueWorkspaceTimelineItems.value.length },
  { id: 'mine', label: '내 일정', count: myWorkspaceTimelineItems.value.length },
  { id: 'pages', label: '페이지', count: workspaceTimelineItems.value.filter((item) => item.type === 'page').length },
  { id: 'tasks', label: '작업', count: workspaceTimelineItems.value.filter((item) => item.type === 'task').length },
  { id: 'all', label: '전체', count: workspaceTimelineItems.value.length },
])
const visibleWorkspaceTimelineItems = computed(() => {
  if (workspaceTimelineFilter.value === 'all') return workspaceTimelineItems.value
  if (workspaceTimelineFilter.value === 'overdue') return overdueWorkspaceTimelineItems.value
  if (workspaceTimelineFilter.value === 'mine') return myWorkspaceTimelineItems.value
  if (workspaceTimelineFilter.value === 'pages') return workspaceTimelineItems.value.filter((item) => item.type === 'page')
  if (workspaceTimelineFilter.value === 'tasks') return workspaceTimelineItems.value.filter((item) => item.type === 'task')
  return openWorkspaceTimelineItems.value
})
const workspaceTimelineRange = computed(() => {
  if (visibleWorkspaceTimelineItems.value.length === 0) {
    return {
      startTime: 0,
      endTime: 0,
      daySpan: 0,
      startLabel: '',
      endLabel: '',
      summaryLabel: '일정 없음',
    }
  }

  const times = visibleWorkspaceTimelineItems.value.map((item) => item.time)
  const startTime = Math.min(...times)
  const endTime = Math.max(...times)
  const startItem = visibleWorkspaceTimelineItems.value.find((item) => item.time === startTime)
  const endItem = visibleWorkspaceTimelineItems.value.find((item) => item.time === endTime)
  const daySpan = Math.max(1, workspaceTimelineDaySpan(startTime, endTime))

  return {
    startTime,
    endTime,
    daySpan,
    startLabel: workspaceTimelineDateLabel(startItem?.dueDate),
    endLabel: workspaceTimelineDateLabel(endItem?.dueDate),
    summaryLabel: daySpan === 1 ? '하루 범위' : `${daySpan + 1}일 범위`,
  }
})
const workspaceTimelineGroups = computed(() => {
  const groups = new Map()
  visibleWorkspaceTimelineItems.value.forEach((item) => {
    const groupKey = item.monthKey || 'none'
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        id: groupKey,
        label: workspaceTimelineMonthLabel(groupKey),
        items: [],
      })
    }
    groups.get(groupKey).items.push(item)
  })

  return [...groups.values()].map((group) => ({
    ...group,
    items: group.items.sort((left, right) => {
      if (left.time !== right.time) return left.time - right.time
      if (left.isDone !== right.isDone) return left.isDone ? 1 : -1
      return left.title.localeCompare(right.title, 'ko')
    }),
  }))
})
const workspaceTimelineItemStyle = (item) => {
  const range = workspaceTimelineRange.value
  const offset = range.daySpan > 0
    ? (workspaceTimelineDaySpan(range.startTime, item.time) / range.daySpan) * 100
    : 0
  const clampedOffset = Math.min(100, Math.max(0, offset))
  return { '--workspace-timeline-offset': `${clampedOffset.toFixed(2)}%` }
}
const workspaceTimelineEmptyLabel = computed(() => {
  if (workspaceTimelineItems.value.length === 0) return '타임라인에 표시할 기한이 없습니다.'
  if (workspaceTimelineFilter.value === 'overdue') return '지연된 타임라인 항목이 없습니다.'
  if (workspaceTimelineFilter.value === 'mine') return '내게 배정된 타임라인 항목이 없습니다.'
  if (workspaceTimelineFilter.value === 'pages') return '기한이 지정된 페이지가 없습니다.'
  if (workspaceTimelineFilter.value === 'tasks') return '기한이 지정된 작업이 없습니다.'
  return '표시할 타임라인 항목이 없습니다.'
})
const workspaceInboxFilterOptions = computed(() => [
  { id: 'mine', label: '내 작업', count: myWorkspaceIndexedTasks.value.length },
  { id: 'open', label: '열림', count: openWorkspaceIndexedTasks.value.length },
  { id: 'overdue', label: '지연', count: overdueWorkspaceIndexedTasks.value.length },
  { id: 'done', label: '완료', count: completedWorkspaceIndexedTasks.value.length },
  { id: 'all', label: '전체', count: workspaceIndexedTasks.value.length },
])
const visibleWorkspaceInboxTasks = computed(() => {
  if (workspaceInboxFilter.value === 'all') return workspaceIndexedTasks.value
  if (workspaceInboxFilter.value === 'open') return openWorkspaceIndexedTasks.value
  if (workspaceInboxFilter.value === 'overdue') return overdueWorkspaceIndexedTasks.value
  if (workspaceInboxFilter.value === 'done') return completedWorkspaceIndexedTasks.value
  return myWorkspaceIndexedTasks.value
})
const workspaceInboxEmptyLabel = computed(() => {
  if (workspaceIndexedTasks.value.length === 0) return '워크스페이스 전체 작업이 없습니다.'
  if (workspaceInboxFilter.value === 'mine') return '내게 배정된 열린 작업이 없습니다.'
  if (workspaceInboxFilter.value === 'overdue') return '기한이 지난 작업이 없습니다.'
  if (workspaceInboxFilter.value === 'done') return '완료된 작업이 없습니다.'
  return '표시할 작업이 없습니다.'
})
const workspaceFavoriteStorageKey = computed(() =>
  `fileinnout:workspace:favorites:${currentUserEmail.value || 'anonymous'}`,
)
const workspaceRecentStorageKey = computed(() =>
  `fileinnout:workspace:recent:${currentUserEmail.value || 'anonymous'}`,
)
const workspaceSectionsStorageKey = computed(() =>
  `fileinnout:workspace:sections:${currentUserEmail.value || 'anonymous'}`,
)
const workspacePageIndexViewsStorageKey = computed(() =>
  `fileinnout:workspace:page-index-views:${currentUserEmail.value || 'anonymous'}`,
)
const normalizeFavoriteWorkspaceIds = (value) =>
  [...new Set((Array.isArray(value) ? value : []).map((id) => String(id)).filter(Boolean))]
const normalizeRecentWorkspaceIds = (value, limit = 8) =>
  normalizeFavoriteWorkspaceIds(value).slice(0, limit)
const createWorkspaceSectionId = () =>
  `section-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const createWorkspacePageIndexViewId = () =>
  `page-index-view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const normalizeWorkspaceSectionName = (value) => String(value || '').trim().slice(0, 32)
const normalizeWorkspacePageIndexViewName = (value) => String(value || '').trim().slice(0, 32)
const normalizeWorkspacePageIndexViewFilter = (value) => {
  const normalized = String(value || '').trim()
  return workspacePageIndexFilterOptions.value.some((option) => option.id === normalized) ? normalized : 'all'
}
const normalizeWorkspacePageIndexViewSort = (value) => {
  const normalized = String(value || '').trim()
  return workspacePageIndexSortOptions.some((option) => option.id === normalized) ? normalized : 'updated-desc'
}
const normalizeWorkspacePageIndexViewTag = (value) => String(value || '').trim().toLowerCase()
const normalizeWorkspacePageIndexViewOwner = (value) => String(value || '').trim().toLowerCase()
const workspacePageIndexViewSignature = (view = {}) =>
  `${normalizeWorkspacePageIndexViewFilter(view.filter)}|${String(view.query || '').trim().toLowerCase()}|${normalizeWorkspacePageIndexViewTag(view.tag)}|${normalizeWorkspacePageIndexViewOwner(view.owner)}|${normalizeWorkspacePageIndexViewSort(view.sort)}`
const normalizeWorkspacePageIndexViews = (value) => {
  const seenIds = new Set()
  const seenNames = new Set()
  return (Array.isArray(value) ? value : [])
    .map((view) => {
      const id = String(view?.id || '').trim()
      const name = normalizeWorkspacePageIndexViewName(view?.name)
      const nameKey = name.toLowerCase()
      if (!id || !name || seenIds.has(id) || seenNames.has(nameKey)) return null
      seenIds.add(id)
      seenNames.add(nameKey)
      return {
        id,
        name,
        filter: normalizeWorkspacePageIndexViewFilter(view?.filter),
        query: String(view?.query || '').trim().slice(0, 80),
        tag: normalizeWorkspacePageIndexViewTag(view?.tag),
        owner: normalizeWorkspacePageIndexViewOwner(view?.owner),
        sort: normalizeWorkspacePageIndexViewSort(view?.sort),
      }
    })
    .filter(Boolean)
    .slice(0, 12)
}
const currentWorkspacePageIndexViewSignature = computed(() =>
  workspacePageIndexViewSignature({
    filter: workspacePageIndexFilter.value,
    query: workspacePageIndexQuery.value,
    tag: workspacePageIndexTagFilter.value,
    owner: workspacePageIndexOwnerFilter.value,
    sort: workspacePageIndexSort.value,
  }),
)
const activeWorkspacePageIndexView = computed(() =>
  workspacePageIndexViews.value.find(
    (view) => workspacePageIndexViewSignature(view) === currentWorkspacePageIndexViewSignature.value,
  ) || null,
)
const canCreateWorkspacePageIndexView = computed(() => {
  const name = normalizeWorkspacePageIndexViewName(workspacePageIndexViewName.value)
  if (!name) return false
  return !workspacePageIndexViews.value.some((view) => view.name.toLowerCase() === name.toLowerCase())
})
const normalizeWorkspaceDocumentSections = (value, validIds = null) => {
  const seenSections = new Set()
  const seenDocuments = new Set()
  const validDocumentIds = validIds ? new Set([...validIds].map((id) => String(id))) : null

  return (Array.isArray(value) ? value : [])
    .map((section) => {
      const id = String(section?.id || '').trim()
      const name = normalizeWorkspaceSectionName(section?.name)
      if (!id || !name || seenSections.has(id)) return null
      seenSections.add(id)
      return {
        id,
        name,
        collapsed: Boolean(section?.collapsed),
        documentIds: normalizeFavoriteWorkspaceIds(section?.documentIds)
          .filter((documentId) => {
            if (validDocumentIds && !validDocumentIds.has(documentId)) return false
            if (seenDocuments.has(documentId)) return false
            seenDocuments.add(documentId)
            return true
          }),
      }
    })
    .filter(Boolean)
}

const myDocumentTasks = computed(() =>
  currentUserEmail.value
    ? documentTasks.value.filter((task) => String(task.assigneeEmail || '').toLowerCase() === currentUserEmail.value)
    : [],
)
const visibleDocumentTasks = computed(() => {
  if (workspaceTaskFilter.value === 'all') return documentTasks.value
  if (workspaceTaskFilter.value === 'mine') return myDocumentTasks.value
  if (workspaceTaskFilter.value === 'done') return completedDocumentTasks.value
  if (workspaceTaskFilter.value === 'overdue') return overdueDocumentTasks.value
  return openDocumentTasks.value
})
const workspaceTaskFilterOptions = computed(() => [
  { id: 'open', label: '열림', count: openDocumentTasks.value.length },
  { id: 'mine', label: '내 작업', count: myDocumentTasks.value.length },
  { id: 'overdue', label: '지남', count: overdueDocumentTasks.value.length },
  { id: 'done', label: '완료', count: completedDocumentTasks.value.length },
  { id: 'all', label: '전체', count: documentTasks.value.length },
])
const workspaceTaskEmptyLabel = computed(() => {
  if (documentTasks.value.length === 0) return '아직 작업 항목이 없습니다.'
  if (workspaceTaskFilter.value === 'mine') return '내게 배정된 작업이 없습니다.'
  if (workspaceTaskFilter.value === 'overdue') return '기한이 지난 작업이 없습니다.'
  if (workspaceTaskFilter.value === 'done') return '완료된 작업이 없습니다.'
  if (workspaceTaskFilter.value === 'all') return '표시할 작업이 없습니다.'
  return '열린 작업이 없습니다.'
})
const activeUserPreview = computed(() => activeUsers.value.slice(0, 4))
const extraActiveUserCount = computed(() => Math.max(activeUsers.value.length - activeUserPreview.value.length, 0))
const currentUserIdx = computed(() =>
  authStore.user?.idx ?? authStore.user?.userIdx ?? authStore.user?.userId ?? null,
)
const activeWorkspaceUserIds = computed(() =>
  new Set(
    activeUsers.value
      .map((user) => user.userIdx)
      .filter((userIdx) => userIdx != null)
      .map((userIdx) => String(userIdx)),
  ),
)
const presenceSummaryLabel = computed(() => {
  if (!workspaceId.value) return '개인 편집'
  const count = activeUsers.value.length
  if (count <= 0) return '연결 준비 중'
  const awayCount = activeUsers.value.filter((user) => user.status === 'away').length
  const activeCount = count - awayCount
  if (count === 1) return awayCount ? '1명 자리비움' : '나만 편집 중'
  if (awayCount > 0) return `${activeCount}명 활동 · ${awayCount}명 자리비움`
  return `${count}명 협업 중`
})
const connectionStatus = computed(() => editorApi.value?.connectionStatusRef?.value || (workspaceId.value ? 'connecting' : 'private'))
const isSaving = computed(() => saveState.value === 'saving')
const workspaceRoleKey = computed(() => String(workspaceAccessRole.value || 'ADMIN').toUpperCase())

const canManageAssets = computed(() => {
  if (workspacePageLocked.value) return false
  if (!workspaceId.value) return true
  if (workspaceRoleKey.value === 'READ') return false
  return ['ADMIN', 'WRITE'].includes(workspaceRoleKey.value)
})

const canManageWorkspaceShare = computed(() =>
  workspaceRoleKey.value === 'ADMIN',
)

const canEditWorkspace = computed(() =>
  !workspaceId.value || ['ADMIN', 'WRITE'].includes(workspaceRoleKey.value),
)
const isWorkspacePageLocked = computed(() => Boolean(workspacePageLocked.value))
const canModifyWorkspacePage = computed(() =>
  canEditWorkspace.value && !isWorkspacePageLocked.value,
)
const shouldWorkspaceEditorReadOnly = computed(() =>
  !canEditWorkspace.value || isWorkspacePageLocked.value,
)
const workspaceLockStatusLabel = computed(() =>
  isWorkspacePageLocked.value ? '페이지 잠김' : '편집 가능',
)
const workspaceLockButtonTitle = computed(() => {
  if (!canEditWorkspace.value) return '편집 권한 없음'
  return isWorkspacePageLocked.value ? '페이지 잠금 해제' : '페이지 잠금'
})

const canShowWorkspaceTemplates = computed(() =>
  !workspaceId.value &&
  canModifyWorkspacePage.value &&
  !workspaceTemplateApplied.value &&
  !hasUnsavedChanges.value &&
  !title.value.trim(),
)

const workspaceShareStatusLabel = computed(() => {
  const status = workspaceShareStatus.value
  if (status === 'Public') return '공개 링크'
  if (status === 'Shared') return '멤버 공유'
  return '개인 문서'
})

const workspaceShareStatusClass = computed(() => ({
  'status-pill--public': workspaceShareStatus.value === 'Public',
  'status-pill--shared': workspaceShareStatus.value === 'Shared',
  'status-pill--muted': workspaceShareStatus.value === 'Private',
}))

const workspaceShareButtonTitle = computed(() => {
  if (!isValid.value) return '제목을 입력한 뒤 공유 설정을 열 수 있습니다'
  if (!canManageWorkspaceShare.value) return '관리자만 공유 설정을 변경할 수 있습니다'
  return '공유 및 초대 설정'
})

const workspaceActivityTimestamp = (value) => {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

const truncateWorkspaceActivityText = (value, maxLength = 84) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

const workspaceImages    = computed(() => workspaceAssets.value.filter((a) => a.assetType === 'IMAGE'))
const workspaceFiles     = computed(() => workspaceAssets.value.filter((a) => a.assetType === 'FILE'))
const hasWorkspaceAssets = computed(() => workspaceAssets.value.length > 0)
const unresolvedWorkspaceComments = computed(() => workspaceComments.value.filter((comment) => !comment.resolved))
const resolvedWorkspaceComments = computed(() => workspaceComments.value.filter((comment) => comment.resolved))
const extractWorkspaceMentionEmails = (value = '') => {
  const matches = String(value || '').match(/@([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi) || []
  return [...new Set(matches.map((mention) => mention.slice(1).toLowerCase()))]
}
const isWorkspaceCommentMentioningCurrentUser = (comment = {}) => {
  const email = currentUserEmail.value
  if (!email) return false
  return extractWorkspaceMentionEmails(comment.contents).includes(email)
}
const mentionedWorkspaceComments = computed(() =>
  unresolvedWorkspaceComments.value.filter(isWorkspaceCommentMentioningCurrentUser),
)
const selectedBlockCommentCount = computed(() => {
  const anchorId = selectedBlockAnchor.value?.anchorBlockId
  if (!anchorId) return 0
  return unresolvedWorkspaceComments.value.filter((comment) =>
    String(comment.anchorBlockId || '') === String(anchorId),
  ).length
})
const workspaceBlockCommentSummaries = computed(() => {
  const summaryMap = new Map()
  unresolvedWorkspaceComments.value
    .filter((comment) => comment.anchorBlockId)
    .forEach((comment) => {
      const key = String(comment.anchorBlockId)
      const previous = summaryMap.get(key) || {
        anchorBlockId: comment.anchorBlockId,
        anchorBlockType: comment.anchorBlockType,
        anchorText: comment.anchorText,
        count: 0,
      }
      previous.count += 1
      previous.anchorText = previous.anchorText || comment.anchorText
      previous.anchorBlockType = previous.anchorBlockType || comment.anchorBlockType
      summaryMap.set(key, previous)
    })
  return [...summaryMap.values()]
})
const workspaceRevisionCount = computed(() => workspaceRevisions.value.length)
const canRestoreWorkspaceRevision = computed(() =>
  Boolean(workspaceId.value && canModifyWorkspacePage.value && activeWorkspaceRevision.value?.id),
)
const workspaceRevisionDiffSummary = computed(() => {
  const diff = workspaceRevisionDiff.value
  if (!diff) return []
  return [
    { id: 'added', label: '복구될 블록', count: diff.added.length },
    { id: 'changed', label: '변경될 블록', count: diff.changed.length },
    { id: 'removed', label: '사라질 블록', count: diff.removed.length },
  ]
})
const workspaceRevisionDiffItems = computed(() => {
  const diff = workspaceRevisionDiff.value
  if (!diff) return []
  return [
    ...diff.changed.map((item) => ({ ...item, kind: 'changed', label: '변경' })),
    ...diff.added.map((item) => ({ ...item, kind: 'added', label: '복구' })),
    ...diff.removed.map((item) => ({ ...item, kind: 'removed', label: '삭제' })),
  ].slice(0, 8)
})
const visibleWorkspaceComments = computed(() => {
  if (workspaceCommentFilter.value === 'resolved') {
    return resolvedWorkspaceComments.value
  }
  if (workspaceCommentFilter.value === 'block') {
    const anchorId = selectedBlockAnchor.value?.anchorBlockId
    if (!anchorId) return []
    return unresolvedWorkspaceComments.value.filter((comment) =>
      String(comment.anchorBlockId || '') === String(anchorId),
    )
  }
  if (workspaceCommentFilter.value === 'mentions') {
    return mentionedWorkspaceComments.value
  }
  return unresolvedWorkspaceComments.value
})
const workspaceCommentFilters = computed(() => [
  { id: 'mentions', label: '내 멘션', count: mentionedWorkspaceComments.value.length, disabled: !currentUserEmail.value },
  { id: 'open', label: '열림', count: unresolvedWorkspaceComments.value.length, disabled: false },
  { id: 'block', label: '현재 블록', count: selectedBlockCommentCount.value, disabled: !selectedBlockAnchor.value?.anchorBlockId },
  { id: 'resolved', label: '해결됨', count: resolvedWorkspaceComments.value.length, disabled: false },
])
const workspaceCommentEmptyLabel = computed(() => {
  if (workspaceCommentFilter.value === 'mentions') {
    return currentUserEmail.value ? '나를 멘션한 열린 댓글이 없습니다.' : '내 멘션을 보려면 로그인 이메일이 필요합니다.'
  }
  if (workspaceCommentFilter.value === 'block') {
    return selectedBlockAnchor.value
      ? '현재 블록에 열린 댓글이 없습니다.'
      : '댓글을 보려면 에디터에서 블록을 선택해 주세요.'
  }
  if (workspaceCommentFilter.value === 'resolved') return '해결된 댓글이 없습니다.'
  return '열린 댓글이 없습니다.'
})
const workspaceSummaryCards = computed(() => [
  {
    id: 'properties',
    icon: 'fa-solid fa-sliders',
    label: '페이지 상태',
    value: workspacePropertyStatusOption.value.label,
    detail: `${workspacePropertyPriorityOption.value.label} 우선순위${
      currentWorkspaceProperties.value.ownerName ? ` · ${currentWorkspaceProperties.value.ownerName}` : ''
    }`,
  },
  {
    id: 'content',
    icon: 'fa-regular fa-file-lines',
    label: '문서 규모',
    value: `${documentStats.value.blockCount}블록`,
    detail: `${documentStats.value.wordCount}단어 · ${documentStats.value.characterCount}자`,
  },
  {
    id: 'tasks',
    icon: 'fa-regular fa-square-check',
    label: '작업 진행',
    value: documentTasks.value.length ? `${documentTaskProgress.value}%` : '작업 없음',
    detail: documentTasks.value.length
      ? `${completedDocumentTasks.value.length}/${documentTasks.value.length} 완료`
      : '체크리스트를 추가하면 진행률을 추적합니다.',
  },
  {
    id: 'review',
    icon: 'fa-regular fa-comments',
    label: '리뷰',
    value: `${unresolvedWorkspaceComments.value.length}개 열림`,
    detail: `${resolvedWorkspaceComments.value.length}개 해결됨`,
  },
  {
    id: 'links',
    icon: 'fa-solid fa-link',
    label: '관련 페이지',
    value: `${linkedWorkspaceDocuments.value.length}개`,
    detail: linkedWorkspaceDocuments.value.length
      ? '본문에서 연결된 페이지를 추적합니다.'
      : '다른 페이지 제목을 언급하면 연결됩니다.',
  },
  {
    id: 'assets',
    icon: 'fa-regular fa-folder-open',
    label: '자료',
    value: `${workspaceAssets.value.length}개`,
    detail: `이미지 ${workspaceImages.value.length} · 파일 ${workspaceFiles.value.length}`,
  },
])
const workspaceHealthItems = computed(() => [
  {
    id: 'collaboration',
    label: '공유/권한',
    detail: `${workspaceShareStatusLabel.value} · ${roleLabel(workspaceAccessRole.value)}${
      currentWorkspaceProperties.value.ownerName ? ` · ${currentWorkspaceProperties.value.ownerName}` : ''
    }`,
    tone: workspaceShareStatus.value === 'Private' ? 'muted' : 'good',
    icon: workspaceShareStatus.value === 'Private' ? 'fa-solid fa-lock' : 'fa-solid fa-user-group',
  },
  {
    id: 'tasks',
    label: '기한 관리',
    detail: isWorkspacePropertyDueOverdue.value
      ? `페이지 기한 ${workspacePropertyDueDate.value}이 지났습니다.`
      : overdueDocumentTasks.value.length
      ? `${overdueDocumentTasks.value.length}개 작업의 기한이 지났습니다.`
      : '기한 지난 작업이 없습니다.',
    tone: isWorkspacePropertyDueOverdue.value || overdueDocumentTasks.value.length ? 'danger' : 'good',
    icon: isWorkspacePropertyDueOverdue.value || overdueDocumentTasks.value.length
      ? 'fa-regular fa-clock'
      : 'fa-regular fa-circle-check',
  },
  {
    id: 'review',
    label: '리뷰 처리',
    detail: unresolvedWorkspaceComments.value.length
      ? `${unresolvedWorkspaceComments.value.length}개 댓글이 열려 있습니다.`
      : '열린 리뷰 댓글이 없습니다.',
    tone: unresolvedWorkspaceComments.value.length ? 'warn' : 'good',
    icon: unresolvedWorkspaceComments.value.length ? 'fa-regular fa-comment-dots' : 'fa-regular fa-circle-check',
  },
  {
    id: 'saving',
    label: '저장 상태',
    detail: lastSavedAt.value ? `최근 저장 ${formatDateTime(lastSavedAt.value)}` : saveStatusLabel.value,
    tone: saveState.value === 'error' ? 'danger' : hasUnsavedChanges.value ? 'warn' : 'good',
    icon: saveState.value === 'error' ? 'fa-solid fa-triangle-exclamation' : 'fa-regular fa-floppy-disk',
  },
])
const canCommentOnWorkspace = computed(() => {
  if (!workspaceId.value) return true
  return workspaceRoleKey.value !== 'READ'
})

const workspacePermissionItems = computed(() => [
  {
    id: 'edit',
    label: '문서 편집',
    detail: canModifyWorkspacePage.value ? '가능' : isWorkspacePageLocked.value ? '페이지 잠김' : '읽기 전용',
    enabled: canModifyWorkspacePage.value,
  },
  {
    id: 'lock',
    label: '페이지 잠금',
    detail: workspaceLockStatusLabel.value,
    enabled: isWorkspacePageLocked.value,
  },
  {
    id: 'comment',
    label: '댓글 작성',
    detail: canCommentOnWorkspace.value ? '가능' : '읽기 전용',
    enabled: canCommentOnWorkspace.value,
  },
  {
    id: 'asset',
    label: '첨부 관리',
    detail: canManageAssets.value ? '가능' : '다운로드만',
    enabled: canManageAssets.value,
  },
  {
    id: 'share',
    label: '공유 관리',
    detail: canManageWorkspaceShare.value ? '관리 가능' : '관리자 전용',
    enabled: canManageWorkspaceShare.value,
  },
])
const workspaceMemberRows = computed(() => {
  const roleOrder = { ADMIN: 0, WRITE: 1, READ: 2 }
  return workspaceMembers.value
    .map((member) => ({
      ...member,
      isMe: currentUserIdx.value != null && String(member.userIdx) === String(currentUserIdx.value),
      isOnline: activeWorkspaceUserIds.value.has(String(member.userIdx)),
    }))
    .sort((left, right) => {
      const roleDiff = (roleOrder[left.role] ?? 9) - (roleOrder[right.role] ?? 9)
      if (roleDiff !== 0) return roleDiff
      if (left.isMe !== right.isMe) return left.isMe ? -1 : 1
      return left.name.localeCompare(right.name, 'ko')
    })
})
const workspaceWorkloadRows = computed(() => {
  const people = new Map()
  const unassignedKey = 'unassigned'
  const normalizeEmailKey = (email) => String(email || '').trim().toLowerCase()
  const ensurePerson = (person = {}) => {
    const email = normalizeEmailKey(person.email)
    const key = email || person.key || unassignedKey
    if (!people.has(key)) {
      people.set(key, {
        key,
        email,
        name: person.name || person.username || person.email || '담당자 없음',
        image: person.image || person.profileImage || '',
        initial: person.initial || userInitial(person.name || person.username || person.email || '?'),
        role: person.role || '',
        isMe: Boolean(person.isMe || (email && email === currentUserEmail.value)),
        isOnline: Boolean(person.isOnline),
        pages: [],
        tasks: [],
      })
    }
    const row = people.get(key)
    row.name = row.name === '담당자 없음' ? person.name || person.username || person.email || row.name : row.name
    row.image = row.image || person.image || person.profileImage || ''
    row.role = row.role || person.role || ''
    row.isMe = row.isMe || Boolean(person.isMe || (email && email === currentUserEmail.value))
    row.isOnline = row.isOnline || Boolean(person.isOnline)
    return row
  }

  ensurePerson({ ...(authStore.user || {}), isMe: true, isOnline: true })
  workspaceMemberRows.value.forEach(ensurePerson)
  activeUsers.value.forEach(ensurePerson)

  workspacePageIndexRows.value.forEach((page) => {
    const row = page.ownerEmail
      ? ensurePerson({ email: page.ownerEmail, name: page.ownerName || page.ownerEmail })
      : ensurePerson({ key: unassignedKey, name: '담당자 없음', initial: '?' })
    row.pages.push(page)
  })

  workspaceIndexedTasks.value.forEach((task) => {
    const row = task.assigneeEmail
      ? ensurePerson({ email: task.assigneeEmail, name: task.assigneeName || task.assigneeEmail })
      : ensurePerson({ key: unassignedKey, name: '담당자 없음', initial: '?' })
    row.tasks.push(task)
  })

  return [...people.values()]
    .map((person) => {
      const openTasks = person.tasks.filter((task) => !task.checked)
      const overdueTasks = person.tasks.filter((task) => task.isOverdue)
      const activePages = person.pages.filter((page) => page.status !== 'done')
      const overduePages = person.pages.filter((page) => page.isOverdue)
      return {
        ...person,
        openTasks,
        overdueTasks,
        activePages,
        overduePages,
        completedTasks: person.tasks.filter((task) => task.checked),
        workloadScore: openTasks.length * 2 + overdueTasks.length * 3 + activePages.length + overduePages.length * 2,
      }
    })
    .filter((person) =>
      person.key !== unassignedKey ||
      person.pages.length > 0 ||
      person.tasks.length > 0,
    )
    .sort((left, right) => {
      if (left.isMe !== right.isMe) return left.isMe ? -1 : 1
      if (right.workloadScore !== left.workloadScore) return right.workloadScore - left.workloadScore
      if (left.key === unassignedKey) return 1
      if (right.key === unassignedKey) return -1
      return left.name.localeCompare(right.name, 'ko')
    })
})
const workspaceUnassignedPages = computed(() =>
  workspacePageIndexRows.value.filter((page) => page.status !== 'done' && !page.ownerEmail),
)
const workspaceUnassignedTasks = computed(() =>
  openWorkspaceIndexedTasks.value.filter((task) => !task.assigneeEmail),
)
const workspaceBlockedPages = computed(() =>
  workspacePageIndexRows.value.filter((page) => page.status === 'blocked'),
)
const workspaceHomeMetricCards = computed(() => [
  {
    id: 'outline',
    icon: 'fa-solid fa-list-ul',
    label: '문서 구조',
    value: `${documentStats.value.blockCount}블록`,
    detail: documentOutline.value.length
      ? `목차 ${documentOutline.value.length}개 · 글자 ${documentStats.value.characterCount}`
      : `글자 ${documentStats.value.characterCount} · 이미지 ${documentStats.value.imageCount}`,
    panel: 'outline',
  },
  {
    id: 'tasks',
    icon: 'fa-regular fa-square-check',
    label: '페이지 작업',
    value: documentTaskSummaryLabel.value,
    detail: openDocumentTasks.value.length
      ? `열린 작업 ${openDocumentTasks.value.length}개 · 진행률 ${documentTaskProgress.value}%`
      : '체크리스트를 추가하면 진행률을 추적합니다.',
    panel: 'tasks',
  },
  {
    id: 'review',
    icon: 'fa-regular fa-comments',
    label: '댓글',
    value: `${unresolvedWorkspaceComments.value.length}개 열림`,
    detail: `${resolvedWorkspaceComments.value.length}개 해결됨 · 멘션 ${mentionedWorkspaceComments.value.length}`,
    panel: 'review',
  },
  {
    id: 'assets',
    icon: 'fa-regular fa-folder-open',
    label: '첨부',
    value: `${workspaceAssets.value.length}개`,
    detail: `이미지 ${workspaceImages.value.length} · 파일 ${workspaceFiles.value.length}`,
    panel: 'assets',
  },
])
const workspaceHomeMyQueue = computed(() => {
  const ownedPages = currentUserEmail.value
    ? workspacePageIndexRows.value
        .filter((page) =>
          page.status !== 'done' &&
          String(page.ownerEmail || '').toLowerCase() === currentUserEmail.value,
        )
        .map((page) => ({
          id: `my-page-${page.id}`,
          type: 'page',
          title: page.title,
          detail: `${page.statusLabel} · ${page.dueDate || '기한 없음'}`,
          dueDate: page.dueDate || '',
          isOverdue: page.isOverdue,
          icon: page.icon,
          page,
        }))
    : []

  const tasks = myWorkspaceIndexedTasks.value.map((task) => ({
    id: `my-task-${task.id}`,
    type: 'task',
    title: task.text,
    detail: `${task.documentTitle} · ${task.dueDate || '기한 없음'}`,
    dueDate: task.dueDate || '',
    isOverdue: task.isOverdue,
    icon: '□',
    task,
  }))

  return [...ownedPages, ...tasks]
    .sort((left, right) => {
      const leftDue = left.dueDate || '9999-12-31'
      const rightDue = right.dueDate || '9999-12-31'
      if (leftDue !== rightDue) return leftDue.localeCompare(rightDue)
      return left.title.localeCompare(right.title, 'ko')
    })
    .slice(0, 6)
})
const workspaceHomeAttentionItems = computed(() => {
  const mentionItems = mentionedWorkspaceComments.value.slice(0, 3).map((comment) => ({
    id: `mention-${comment.id}`,
    tone: 'info',
    label: '내 멘션',
    title: comment.authorName || '댓글 멘션',
    detail: truncateWorkspaceActivityText(comment.contents, 72),
    comment,
  }))
  const overdueItems = overdueWorkspaceCalendarItems.value.slice(0, 4).map((item) => ({
    id: `overdue-${item.id}`,
    tone: 'danger',
    label: '기한 지남',
    title: item.title,
    detail: `${workspaceCalendarDateLabel(item.dueDate)} · ${item.typeLabel}`,
    item,
  }))
  const blockedItems = workspaceBlockedPages.value.slice(0, 3).map((page) => ({
    id: `blocked-${page.id}`,
    tone: 'warn',
    label: '차단',
    title: page.title,
    detail: page.ownerName || page.scopeLabel,
    page,
  }))
  const unassignedItems = [
    ...workspaceUnassignedPages.value.slice(0, 2).map((page) => ({
      id: `unassigned-page-${page.id}`,
      tone: 'muted',
      label: '미배정 페이지',
      title: page.title,
      detail: page.statusLabel,
      page,
    })),
    ...workspaceUnassignedTasks.value.slice(0, 2).map((task) => ({
      id: `unassigned-task-${task.id}`,
      tone: 'muted',
      label: '미배정 작업',
      title: task.text,
      detail: task.documentTitle,
      task,
    })),
  ]
  return [...mentionItems, ...overdueItems, ...blockedItems, ...unassignedItems].slice(0, 8)
})
const workspaceHomeRecentPages = computed(() =>
  workspacePageIndexRows.value
    .slice()
    .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime())
    .slice(0, 5),
)
const workspaceMentionCandidates = computed(() => {
  const candidates = new Map()
  const currentEmail = String(authStore.user?.email || '').toLowerCase()
  const currentIdx = currentUserIdx.value == null ? '' : String(currentUserIdx.value)
  const addCandidate = (person = {}) => {
    const email = String(person.email || '').trim()
    if (!email) return
    const emailKey = email.toLowerCase()
    const userIdx = person.userIdx ?? person.idx ?? person.userId ?? null
    if (emailKey === currentEmail || (userIdx != null && String(userIdx) === currentIdx)) return
    if (candidates.has(emailKey)) return
    candidates.set(emailKey, {
      userIdx,
      email,
      name: person.name || person.username || email,
      image: person.image || person.profileImage || '',
      initial: person.initial || userInitial(person.name || email),
      source: person.isOnline ? 'online' : person.clientId ? 'active' : 'member',
    })
  }

  workspaceMemberRows.value.forEach(addCandidate)
  activeUsers.value.forEach(addCandidate)
  return [...candidates.values()].slice(0, 8)
})
const workspaceTaskAssigneeCandidates = computed(() => {
  const candidates = new Map()
  const addCandidate = (person = {}) => {
    const email = String(person.email || '').trim()
    if (!email) return
    const emailKey = email.toLowerCase()
    if (candidates.has(emailKey)) return
    candidates.set(emailKey, {
      email,
      name: person.name || person.username || email,
      image: person.image || person.profileImage || '',
      initial: person.initial || userInitial(person.name || email),
    })
  }

  addCandidate(authStore.user || {})
  workspaceMemberRows.value.forEach(addCandidate)
  activeUsers.value.forEach(addCandidate)
  workspaceMentionCandidates.value.forEach(addCandidate)
  return [...candidates.values()]
})
const selectedWorkspaceTaskAssignee = computed(() =>
  workspaceTaskAssigneeCandidates.value.find(
    (candidate) => candidate.email === newWorkspaceTaskAssignee.value,
  ) || null,
)
const workspacePropertyTags = computed(() =>
  normalizeWorkspacePropertyTags(workspacePropertyTagsInput.value),
)
const workspacePropertyOwnerCandidates = computed(() => {
  const candidates = [...workspaceTaskAssigneeCandidates.value]
  const ownerEmail = workspacePropertyOwnerEmail.value
  if (ownerEmail && !candidates.some((candidate) => candidate.email === ownerEmail)) {
    candidates.unshift({
      email: ownerEmail,
      name: workspacePropertyOwnerName.value || ownerEmail,
      image: '',
      initial: userInitial(workspacePropertyOwnerName.value || ownerEmail),
    })
  }
  return candidates
})
const selectedWorkspacePropertyOwner = computed(() =>
  workspacePropertyOwnerCandidates.value.find(
    (candidate) => candidate.email === workspacePropertyOwnerEmail.value,
  ) || null,
)
const workspacePropertyStatusOption = computed(() =>
  WORKSPACE_PROPERTY_STATUS_OPTIONS.find((option) => option.id === workspacePropertyStatus.value)
    || WORKSPACE_PROPERTY_STATUS_OPTIONS[0],
)
const workspacePropertyPriorityOption = computed(() =>
  WORKSPACE_PROPERTY_PRIORITY_OPTIONS.find((option) => option.id === workspacePropertyPriority.value)
    || WORKSPACE_PROPERTY_PRIORITY_OPTIONS[1],
)
const workspacePropertyCoverColorOption = computed(() =>
  WORKSPACE_COVER_COLOR_OPTIONS.find((option) => option.id === workspacePropertyCoverColor.value)
    || WORKSPACE_COVER_COLOR_OPTIONS[0],
)
const currentWorkspaceProperties = computed(() => normalizeWorkspaceProperties({
  icon: workspacePropertyIcon.value,
  coverColor: workspacePropertyCoverColor.value,
  status: workspacePropertyStatus.value,
  priority: workspacePropertyPriority.value,
  ownerEmail: workspacePropertyOwnerEmail.value,
  ownerName: workspacePropertyOwnerEmail.value
    ? selectedWorkspacePropertyOwner.value?.name || workspacePropertyOwnerName.value
    : '',
  dueDate: workspacePropertyDueDate.value,
  tags: workspacePropertyTags.value,
  locked: workspacePageLocked.value,
}))
const isWorkspacePropertyDueOverdue = computed(() =>
  Boolean(
    workspacePropertyDueDate.value &&
    workspacePropertyStatus.value !== 'done' &&
    workspacePropertyDueDate.value < workspaceTaskTodayKey(),
  ),
)
const canUseWorkspaceMentions = computed(() => workspaceMentionCandidates.value.length > 0)
const workspaceMemberSummaryLabel = computed(() => {
  if (!workspaceId.value) return '저장 후 멤버 관리 가능'
  if (!canManageWorkspaceShare.value) return '관리자만 멤버 목록을 관리할 수 있습니다'
  if (workspaceMemberLoading.value) return '멤버 목록을 불러오는 중'
  return `${workspaceMemberRows.value.length}명`
})
const workspaceActivityItems = computed(() => {
  const items = []

  if (lastSavedAt.value) {
    items.push({
      id: `save-${lastSavedAt.value}`,
      type: 'save',
      icon: 'fa-regular fa-floppy-disk',
      title: '문서 저장됨',
      detail: '최근 변경사항이 저장되었습니다.',
      time: workspaceActivityTimestamp(lastSavedAt.value),
      timeLabel: formatDateTime(lastSavedAt.value),
    })
  }

  workspaceComments.value.forEach((comment) => {
    const timeSource = comment.updatedAt || comment.createdAt
    const time = workspaceActivityTimestamp(timeSource)
    if (!time) return
    items.push({
      id: `comment-${comment.id || time}`,
      type: comment.resolved ? 'resolved' : 'comment',
      icon: comment.resolved ? 'fa-regular fa-circle-check' : 'fa-regular fa-comment-dots',
      title: comment.resolved ? '댓글 해결됨' : '댓글 추가됨',
      detail: truncateWorkspaceActivityText(`${comment.authorName || '멤버'}: ${comment.contents}`),
      time,
      timeLabel: formatDateTime(timeSource),
    })
  })

  workspaceAssets.value.forEach((asset) => {
    const time = workspaceActivityTimestamp(asset.createdAt)
    if (!time) return
    items.push({
      id: `asset-${asset.id || time}`,
      type: asset.assetType === 'IMAGE' ? 'image' : 'file',
      icon: asset.assetType === 'IMAGE' ? 'fa-regular fa-image' : 'fa-regular fa-file-lines',
      title: asset.assetType === 'IMAGE' ? '이미지 첨부됨' : '파일 첨부됨',
      detail: truncateWorkspaceActivityText(`${asset.originalName}${asset.fileSizeLabel ? ` · ${asset.fileSizeLabel}` : ''}`),
      time,
      timeLabel: asset.createdAtLabel || formatDateTime(asset.createdAt),
    })
  })

  if (workspaceMemberRefreshedAt.value && workspaceMemberRows.value.length > 0) {
    items.push({
      id: `members-${workspaceMemberRefreshedAt.value}`,
      type: 'member',
      icon: 'fa-solid fa-user-group',
      title: '멤버 목록 동기화됨',
      detail: `문서 멤버 ${workspaceMemberRows.value.length}명을 확인했습니다.`,
      time: workspaceActivityTimestamp(workspaceMemberRefreshedAt.value),
      timeLabel: formatDateTime(workspaceMemberRefreshedAt.value),
    })
  }

  return items
    .filter((item) => item.time > 0)
    .sort((left, right) => right.time - left.time)
    .slice(0, 8)
})
const workspacePanelTabs = computed(() => [
  { id: 'all', label: '전체', count: null },
  { id: 'home', label: '페이지', count: workspaceHomeAttentionItems.value.length },
  { id: 'summary', label: '요약', count: null },
  { id: 'collaboration', label: '협업', count: activeUsers.value.length },
  { id: 'activity', label: '활동', count: workspaceActivityItems.value.length },
  { id: 'search', label: '검색', count: workspaceFullTextResults.value.length },
  { id: 'blocks', label: '블록', count: WORKSPACE_QUICK_BLOCK_OPTIONS.length },
  { id: 'tasks', label: '작업', count: openDocumentTasks.value.length },
  { id: 'outline', label: '개요', count: documentOutline.value.length },
  { id: 'links', label: '연결', count: workspaceRelationCount.value },
  { id: 'history', label: '기록', count: workspaceRevisionCount.value },
  { id: 'review', label: '댓글', count: unresolvedWorkspaceComments.value.length },
  { id: 'assets', label: '첨부', count: workspaceAssets.value.length },
])

const workspaceCommandBaseItems = computed(() => {
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
    ...(canEditWorkspace.value
      ? [{
          id: 'action:save',
          type: 'action',
          kindLabel: '액션',
          action: 'save',
          icon: 'fa-regular fa-floppy-disk',
          title: '현재 페이지 저장',
          detail: hasUnsavedChanges.value ? '변경사항을 바로 저장합니다.' : '현재 페이지는 저장된 상태입니다.',
          keywords: 'save persist autosave',
        }]
      : []),
    ...(canEditWorkspace.value
      ? [{
          id: 'action:lock',
          type: 'action',
          kindLabel: '액션',
          action: 'lock',
          icon: isWorkspacePageLocked.value ? 'fa-solid fa-lock-open' : 'fa-solid fa-lock',
          title: isWorkspacePageLocked.value ? '페이지 잠금 해제' : '페이지 잠금',
          detail: isWorkspacePageLocked.value
            ? '현재 페이지의 편집 보호를 해제합니다.'
            : '실수로 내용이 바뀌지 않도록 현재 페이지를 잠급니다.',
          keywords: 'lock unlock protect page readonly notion',
        }]
      : []),
    ...(canFavoriteCurrentWorkspaceDocument.value
      ? [{
          id: 'action:favorite-current',
          type: 'action',
          kindLabel: '액션',
          action: 'favorite-current',
          icon: isCurrentWorkspaceDocumentFavorite.value ? 'fa-solid fa-star' : 'fa-regular fa-star',
          title: isCurrentWorkspaceDocumentFavorite.value ? '현재 페이지 즐겨찾기 해제' : '현재 페이지 즐겨찾기',
          detail: '사이드바 즐겨찾기에 현재 페이지를 고정합니다.',
          keywords: 'favorite star pin current page notion',
        }]
      : []),
    ...(canManageWorkspaceShare.value && isValid.value
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
    ...(canExportWorkspaceMarkdown.value
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
    ...(canStartWorkspaceSubpage.value
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
    ...(currentWorkspaceParentPage.value
      ? [{
          id: 'action:parent',
          type: 'action',
          kindLabel: '이동',
          action: 'parent',
          icon: 'fa-solid fa-turn-up',
          title: '상위 페이지 열기',
          detail: currentWorkspaceParentPage.value.title,
          keywords: 'parent page breadcrumb hierarchy up',
        }]
      : []),
    ...(currentUserEmail.value
      ? [{
          id: 'action:mentions',
          type: 'action',
          kindLabel: '이동',
          action: 'mentions',
          icon: 'fa-solid fa-at',
          title: '내 멘션 댓글 보기',
          detail: `열린 멘션 ${mentionedWorkspaceComments.value.length}개`,
          keywords: 'mention comments review notification me alert',
        }]
      : []),
  ]

  const documentItems = workspaceDocuments.value
    .map((document) => {
      const favorite = favoriteWorkspaceDocumentIds.value.includes(String(document.id))
      return {
        id: `document:${document.id}`,
        type: 'document',
        kindLabel: favorite ? '즐겨찾기' : '문서',
        icon: favorite ? 'fa-solid fa-star' : document.scope === 'shared' ? 'fa-solid fa-user-group' : 'fa-regular fa-file-lines',
        title: document.title,
        detail: `${favorite ? '즐겨찾기 · ' : ''}${document.scope === 'shared' ? '공유 페이지' : '내 페이지'} · ${roleLabel(document.role)} · ${formatDocumentTime(document.updatedAt)}`,
        keywords: `${document.title} ${document.status} ${document.role} ${favorite ? 'favorite 즐겨찾기' : ''}`,
        document,
        favorite,
      }
    })
    .sort((left, right) => Number(right.favorite) - Number(left.favorite))

  const templateItems = canShowWorkspaceTemplates.value
    ? workspaceTemplates.map((template) => ({
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

  const blockItems = canInsertWorkspaceQuickBlock.value
    ? WORKSPACE_QUICK_BLOCK_OPTIONS.map((block) => ({
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

  const panelItems = workspacePanelTabs.value
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
})
const workspaceCommandItems = computed(() => {
  const query = workspaceCommandQuery.value.trim().toLowerCase()
  const items = workspaceCommandBaseItems.value
  if (!query) return items.slice(0, 14)
  return items
    .filter((item) =>
      `${item.title} ${item.detail} ${item.keywords || ''}`.toLowerCase().includes(query),
    )
    .slice(0, 14)
})
const workspaceCommandActiveItem = computed(() =>
  workspaceCommandItems.value[workspaceCommandActiveIndex.value] || null,
)
const workspaceCommandEmptyLabel = computed(() =>
  workspaceCommandQuery.value.trim()
    ? '검색 결과가 없습니다.'
    : '문서, 템플릿, 패널, 액션을 바로 실행할 수 있습니다.',
)

const isWorkspacePanelVisible = (panelId) =>
  activeWorkspacePanelTab.value === 'all'
    ? PAGE_FOCUSED_WORKSPACE_PANEL_IDS.includes(panelId)
    : activeWorkspacePanelTab.value === panelId
const currentWorkspaceKey = computed(() => String(workspaceId.value || route.params.id || 'new'))

const normalizeWorkspaceDocument = (item = {}, scope = 'personal') => ({
  id: item.post_idx ?? item.idx ?? item.id ?? null,
  title: item.title || '제목 없음',
  updatedAt: item.updatedAt || null,
  status: item.status || 'Private',
  role: item.level || item.accessRole || 'ADMIN',
  scope,
})

const normalizeWorkspaceShareStatus = (status, type = false) => {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'public') return 'Public'
  if (normalized === 'shared') return 'Shared'
  if (normalized === 'private') return 'Private'
  return type ? 'Shared' : 'Private'
}

const normalizeWorkspacePropertyOption = (value, options, fallback) => {
  const normalized = String(value || '').trim().toLowerCase()
  return options.some((option) => option.id === normalized) ? normalized : fallback
}

const normalizeWorkspacePropertyTags = (value) => {
  const source = Array.isArray(value)
    ? value
    : String(value || '')
      .split(',')
      .map((tag) => tag.trim())
  return [...new Set(source.filter(Boolean).map((tag) => tag.slice(0, 28)))].slice(0, 8)
}

const normalizeWorkspacePageIcon = (value) => {
  const normalized = String(value || '').trim()
  return normalized ? [...normalized].slice(0, 2).join('') : '📄'
}

const normalizeWorkspaceCoverColor = (value) => {
  const normalized = String(value || '').trim().toLowerCase()
  return WORKSPACE_COVER_COLOR_OPTIONS.some((option) => option.id === normalized)
    ? normalized
    : WORKSPACE_COVER_COLOR_OPTIONS[0].id
}

const normalizeWorkspaceProperties = (properties = {}) => ({
  icon: normalizeWorkspacePageIcon(properties.icon),
  coverColor: normalizeWorkspaceCoverColor(properties.coverColor),
  status: normalizeWorkspacePropertyOption(
    properties.status,
    WORKSPACE_PROPERTY_STATUS_OPTIONS,
    'planning',
  ),
  priority: normalizeWorkspacePropertyOption(
    properties.priority,
    WORKSPACE_PROPERTY_PRIORITY_OPTIONS,
    'normal',
  ),
  ownerEmail: String(properties.ownerEmail || '').trim(),
  ownerName: String(properties.ownerName || properties.ownerEmail || '').trim(),
  dueDate: String(properties.dueDate || '').trim(),
  tags: normalizeWorkspacePropertyTags(properties.tags),
  locked: Boolean(properties.locked || properties.pageLocked || properties.isLocked),
})

const normalizeWorkspaceMember = (member = {}) => {
  const userIdx = member.userIdx ?? member.idx ?? member.id ?? null
  const name = member.name || member.username || member.email || '이름 없는 멤버'
  return {
    userIdx,
    name,
    email: member.email || '',
    image: member.image || member.profileImage || '',
    role: String(member.role || member.level || 'READ').toUpperCase(),
  }
}

const workspaceDocuments = computed(() => [
  ...(loadpost.personalItems?.value || []).map((item) => normalizeWorkspaceDocument(item, 'personal')),
  ...(loadpost.sharedItems?.value || []).map((item) => normalizeWorkspaceDocument(item, 'shared')),
].filter((item) => item.id != null))

const workspaceDocumentById = computed(() => {
  const map = new Map()
  workspaceDocuments.value.forEach((document) => {
    map.set(String(document.id), document)
  })
  return map
})

const workspacePageIndexRowById = computed(() => {
  const map = new Map()
  workspacePageIndexRows.value.forEach((row) => {
    map.set(String(row.id), row)
  })
  return map
})

const buildWorkspaceBreadcrumbPage = (pageId, fallbackTitle = '') => {
  const id = String(pageId || '').trim()
  const indexedRow = workspacePageIndexRowById.value.get(id)
  const listedDocument = workspaceDocumentById.value.get(id)
  const source = indexedRow || listedDocument || {}
  const accessRole = source.accessRole || source.role || ''
  return {
    ...source,
    id: source.id ?? id,
    title: source.title || fallbackTitle || '상위 페이지',
    scopeLabel: source.scopeLabel || (source.scope === 'shared' ? '공유 페이지' : '내 페이지'),
    roleLabel: source.roleLabel || (accessRole ? roleLabel(accessRole) : ''),
    updatedLabel: source.updatedLabel || (source.updatedAt ? formatDocumentTime(source.updatedAt) : ''),
    parentWorkspaceId: String(source.parentWorkspaceId || ''),
    parentWorkspaceTitle: String(source.parentWorkspaceTitle || ''),
  }
}

const workspacePageBreadcrumbTrail = computed(() => {
  const currentId = String(currentWorkspaceKey.value || '')
  let nextParentId = String(workspaceParentPageId.value || '').trim()
  let fallbackTitle = workspaceParentPageTitle.value
  const seenIds = new Set([currentId])
  const trail = []

  for (let depth = 0; nextParentId && !seenIds.has(nextParentId) && depth < 8; depth += 1) {
    seenIds.add(nextParentId)
    const page = buildWorkspaceBreadcrumbPage(nextParentId, fallbackTitle)
    trail.unshift(page)
    nextParentId = String(page.parentWorkspaceId || '').trim()
    fallbackTitle = page.parentWorkspaceTitle || ''
  }

  return trail
})

const currentWorkspaceParentPage = computed(() => {
  const trail = workspacePageBreadcrumbTrail.value
  return trail.length ? trail[trail.length - 1] : null
})

const filteredWorkspaceDocuments = computed(() => {
  const query = workspaceDocumentQuery.value.trim().toLowerCase()
  if (!query) return workspaceDocuments.value
  return workspaceDocuments.value.filter((item) =>
    `${item.title} ${item.status} ${item.role}`.toLowerCase().includes(query),
  )
})

const workspaceDocumentSectionIds = computed(() =>
  new Set(
    workspaceDocumentSections.value.flatMap((section) =>
      normalizeFavoriteWorkspaceIds(section.documentIds),
    ),
  ),
)

const workspaceDocumentSectionViews = computed(() => {
  const filteredIds = new Set(filteredWorkspaceDocuments.value.map((document) => String(document.id)))
  return workspaceDocumentSections.value.map((section) => ({
    ...section,
    documents: normalizeFavoriteWorkspaceIds(section.documentIds)
      .filter((documentId) => filteredIds.has(documentId))
      .map((documentId) => workspaceDocumentById.value.get(documentId))
      .filter(Boolean),
  }))
})

const visibleWorkspaceDocumentSectionViews = computed(() =>
  workspaceDocumentSectionViews.value.filter((section) =>
    section.documents.length > 0 || !workspaceDocumentQuery.value.trim(),
  ),
)

const workspaceSectionedDocumentCount = computed(() =>
  workspaceDocumentSectionViews.value.reduce((total, section) => total + section.documents.length, 0),
)

const favoriteWorkspaceDocuments = computed(() => {
  const favoriteIds = new Set(favoriteWorkspaceDocumentIds.value)
  return filteredWorkspaceDocuments.value.filter((item) => favoriteIds.has(String(item.id)))
})

const recentWorkspaceDocuments = computed(() => {
  const filteredById = new Map(filteredWorkspaceDocuments.value.map((document) => [String(document.id), document]))
  return recentWorkspaceDocumentIds.value
    .map((id) => filteredById.get(String(id)))
    .filter(Boolean)
})

const personalWorkspaceDocuments = computed(() =>
  filteredWorkspaceDocuments.value.filter((item) => item.scope === 'personal'),
)

const sharedWorkspaceDocuments = computed(() =>
  filteredWorkspaceDocuments.value.filter((item) => item.scope === 'shared'),
)

const unsectionedPersonalWorkspaceDocuments = computed(() =>
  personalWorkspaceDocuments.value.filter((item) => !workspaceDocumentSectionIds.value.has(String(item.id))),
)

const unsectionedSharedWorkspaceDocuments = computed(() =>
  sharedWorkspaceDocuments.value.filter((item) => !workspaceDocumentSectionIds.value.has(String(item.id))),
)

const normalizeWorkspaceLinkText = (value) =>
  String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()

const linkedWorkspaceDocuments = computed(() => {
  const searchText = normalizeWorkspaceLinkText(documentSearchText.value)
  const explicitLinkMap = new Map(
    documentWorkspaceLinks.value
      .filter((link) => link?.documentId)
      .map((link) => [String(link.documentId), link]),
  )
  if (!searchText && explicitLinkMap.size === 0) return []
  return workspaceDocuments.value
    .filter((document) => {
      const id = String(document.id || '')
      const title = normalizeWorkspaceLinkText(document.title)
      if (!id || id === currentWorkspaceKey.value) return false
      if (explicitLinkMap.has(id)) return true
      if (!title || title.length < 2 || title === '제목 없음') return false
      return searchText.includes(title)
    })
    .map((document) => ({
      ...document,
      scopeLabel: document.scope === 'shared' ? '공유 페이지' : '내 페이지',
      roleLabel: roleLabel(document.role),
      updatedLabel: formatDocumentTime(document.updatedAt),
      linkSource: explicitLinkMap.has(String(document.id)) ? 'explicit' : 'mention',
      linkSourceLabel: explicitLinkMap.has(String(document.id)) ? '삽입된 링크' : '제목 언급',
      linkAnchorBlockId: explicitLinkMap.get(String(document.id))?.anchorBlockId || '',
      linkAnchorText: explicitLinkMap.get(String(document.id))?.anchorText || '',
    }))
    .sort((left, right) => Number(right.linkSource === 'explicit') - Number(left.linkSource === 'explicit'))
    .slice(0, 8)
})
const linkedWorkspaceDocumentEmptyLabel = computed(() =>
  workspaceDocuments.value.length > 1
    ? '본문에 다른 페이지 제목을 적으면 자동으로 연결됩니다.'
    : '다른 페이지가 생기면 관계를 추적할 수 있습니다.',
)

const currentWorkspaceChildPages = computed(() => {
  const currentId = String(currentWorkspaceKey.value || '')
  if (!currentId || currentId === 'new') return []
  return workspacePageIndexRows.value
    .filter((row) =>
      String(row.parentWorkspaceId || '') === currentId &&
      String(row.id || '') !== currentId,
    )
    .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime())
    .slice(0, 8)
})

const workspacePageTreeCollapsedIdSet = computed(() =>
  new Set(collapsedWorkspacePageTreeIds.value.map((id) => String(id))),
)
const compareWorkspacePageTreeRows = (left, right) => {
  const titleCompare = String(left.title || '').localeCompare(String(right.title || ''), 'ko')
  if (titleCompare !== 0) return titleCompare
  return String(left.id || '').localeCompare(String(right.id || ''))
}
const workspacePageTreeRoots = computed(() => {
  const rows = workspacePageIndexRows.value
    .filter((row) => row?.id != null)
    .slice()
    .sort(compareWorkspacePageTreeRows)
  const rowById = new Map(rows.map((row) => [String(row.id), row]))
  const childrenByParent = new Map()

  rows.forEach((row) => {
    const rowId = String(row.id)
    const parentId = String(row.parentWorkspaceId || '').trim()
    if (!parentId || parentId === rowId || !rowById.has(parentId)) return
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, [])
    childrenByParent.get(parentId).push(row)
  })
  childrenByParent.forEach((children) => children.sort(compareWorkspacePageTreeRows))

  const visitedIds = new Set()
  const buildNode = (row, depth = 0, ancestors = new Set()) => {
    const rowId = String(row.id)
    visitedIds.add(rowId)
    if (ancestors.has(rowId)) {
      return {
        ...row,
        treeDepth: depth,
        children: [],
        childCount: 0,
        isCurrentDocument: rowId === currentWorkspaceKey.value,
      }
    }
    const nextAncestors = new Set(ancestors)
    nextAncestors.add(rowId)
    const children = (childrenByParent.get(rowId) || []).map((child) =>
      buildNode(child, depth + 1, nextAncestors),
    )
    return {
      ...row,
      treeDepth: depth,
      children,
      childCount: children.length,
      isCurrentDocument: rowId === currentWorkspaceKey.value,
    }
  }

  const roots = rows
    .filter((row) => {
      const rowId = String(row.id)
      const parentId = String(row.parentWorkspaceId || '').trim()
      return !parentId || parentId === rowId || !rowById.has(parentId)
    })
    .map((row) => buildNode(row))

  const detachedRoots = rows
    .filter((row) => !visitedIds.has(String(row.id)))
    .map((row) => buildNode(row))

  return [...roots, ...detachedRoots]
})
const workspacePageTreeFlatRows = computed(() => {
  const rows = []
  const walk = (nodes) => {
    nodes.forEach((node) => {
      rows.push(node)
      if (!workspacePageTreeCollapsedIdSet.value.has(String(node.id))) {
        walk(node.children)
      }
    })
  }
  walk(workspacePageTreeRoots.value)
  return rows
})
const workspacePageTreeAllRows = computed(() => {
  const rows = []
  const walk = (nodes) => {
    nodes.forEach((node) => {
      rows.push(node)
      walk(node.children)
    })
  }
  walk(workspacePageTreeRoots.value)
  return rows
})
const workspacePageTreeSearchText = (node = {}) =>
  normalizeWorkspaceLinkText([
    node.title,
    node.scopeLabel,
    node.statusLabel,
    node.priorityLabel,
    node.ownerName,
    node.ownerEmail,
    node.parentWorkspaceTitle,
    ...(node.tags || []),
  ].join(' '))
const filterWorkspacePageTreeNodes = (nodes = [], query = '') =>
  nodes.flatMap((node) => {
    const childRows = filterWorkspacePageTreeNodes(node.children || [], query)
    const treeMatchesQuery = workspacePageTreeSearchText(node).includes(query)
    if (!treeMatchesQuery && childRows.length === 0) return []
    return [{ ...node, treeMatchesQuery }, ...childRows]
  })
const workspacePageTreeVisibleRows = computed(() => {
  const query = normalizeWorkspaceLinkText(workspacePageTreeQuery.value)
  if (!query) return workspacePageTreeFlatRows.value
  return filterWorkspacePageTreeNodes(workspacePageTreeRoots.value, query)
})
const workspacePageTreeEmptyLabel = computed(() => {
  if (workspacePageTreeAllRows.value.length === 0) return '페이지가 없습니다.'
  if (workspacePageTreeQuery.value.trim()) return '검색 조건에 맞는 페이지가 없습니다.'
  return '표시할 페이지가 없습니다.'
})
const toggleWorkspacePageTreeNode = (node) => {
  if (!node?.childCount) return
  const nodeId = String(node.id)
  collapsedWorkspacePageTreeIds.value = workspacePageTreeCollapsedIdSet.value.has(nodeId)
    ? collapsedWorkspacePageTreeIds.value.filter((id) => String(id) !== nodeId)
    : [...collapsedWorkspacePageTreeIds.value, nodeId]
}

const workspaceRelationCount = computed(() =>
  workspacePageBreadcrumbTrail.value.length +
  currentWorkspaceChildPages.value.length +
  linkedWorkspaceDocuments.value.length +
  workspaceBacklinks.value.length,
)
const workspaceBacklinkEmptyLabel = computed(() => {
  if (!workspaceId.value) return '문서를 저장하면 백링크를 찾을 수 있습니다.'
  if (workspaceDocuments.value.length <= 1) return '다른 페이지가 생기면 백링크를 추적할 수 있습니다.'
  return '아직 이 페이지를 참조하는 다른 페이지가 없습니다.'
})

const saveStatusLabel = computed(() => {
  if (saveState.value === 'saving') return '저장 중'
  if (saveState.value === 'error') return saveError.value || '저장 실패'
  if (hasUnsavedChanges.value) return '변경사항 있음'
  if (lastSavedAt.value) return `${formatDateTime(lastSavedAt.value)} 저장됨`
  return workspaceId.value ? '저장됨' : '새 페이지'
})

const saveStatusClass = computed(() => ({
  'status-pill--saving': saveState.value === 'saving',
  'status-pill--error': saveState.value === 'error',
  'status-pill--dirty': hasUnsavedChanges.value && saveState.value !== 'saving',
  'status-pill--saved': !hasUnsavedChanges.value && saveState.value !== 'error',
}))

const realtimeStatusLabel = computed(() => {
  const status = String(connectionStatus.value || '').toLowerCase()
  if (status === 'synced' || status === 'connected') return '실시간 연결됨'
  if (status === 'connecting') return '실시간 연결 중'
  if (status === 'private') return '개인 페이지'
  return '오프라인 편집'
})

const realtimeStatusClass = computed(() => ({
  'status-pill--live': ['synced', 'connected'].includes(String(connectionStatus.value).toLowerCase()),
  'status-pill--saving': String(connectionStatus.value).toLowerCase() === 'connecting',
  'status-pill--muted': String(connectionStatus.value).toLowerCase() === 'private',
}))

// ─── 모듈 수준 변수 ──────────────────────────────────────────────────────────
let currentSetupId                = 0
let workspaceAssetStompClient     = null
let connectedWorkspaceAssetRoomId = null
let autoSaveTimer                 = null
let workspaceDocumentLinkCopyTimer = null
let workspaceNoticeTimer          = null
let suppressWorkspacePropertyWatch = false
let currentWorkspaceBacklinkScanId = 0
let currentWorkspaceFullTextSearchId = 0
let currentWorkspacePageIndexScanId = 0

const clearWorkspaceNoticeTimer = () => {
  if (!workspaceNoticeTimer) return
  clearTimeout(workspaceNoticeTimer)
  workspaceNoticeTimer = null
}

const closeWorkspaceNotice = () => {
  clearWorkspaceNoticeTimer()
  workspaceNotice.value = null
}

const showWorkspaceNotice = (
  message,
  type = 'info',
  { timeout = 3600, actionLabel = '', onAction = null } = {},
) => {
  const text = String(message || '').trim()
  if (!text) return
  clearWorkspaceNoticeTimer()
  workspaceNotice.value = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    message: text,
    actionLabel: String(actionLabel || '').trim(),
    onAction: typeof onAction === 'function' ? onAction : null,
  }
  if (timeout > 0) {
    workspaceNoticeTimer = window.setTimeout(() => {
      workspaceNotice.value = null
      workspaceNoticeTimer = null
    }, timeout)
  }
}

const runWorkspaceNoticeAction = async () => {
  const notice = workspaceNotice.value
  if (typeof notice?.onAction === 'function') {
    await notice.onAction()
  }
  closeWorkspaceNotice()
}

const closeWorkspaceConfirm = () => {
  workspaceConfirm.value = null
}

const requestWorkspaceConfirm = ({
  title = '확인이 필요합니다',
  message = '',
  confirmLabel = '확인',
  cancelLabel = '취소',
  tone = 'warn',
  onConfirm = null,
} = {}) => {
  workspaceConfirm.value = {
    title,
    message,
    confirmLabel,
    cancelLabel,
    tone,
    onConfirm,
    loading: false,
  }
}

const confirmWorkspaceAction = async () => {
  const pending = workspaceConfirm.value
  if (!pending || pending.loading) return
  if (typeof pending.onConfirm !== 'function') {
    closeWorkspaceConfirm()
    return
  }
  workspaceConfirm.value = { ...pending, loading: true }
  try {
    await pending.onConfirm()
    closeWorkspaceConfirm()
  } catch (error) {
    workspaceConfirm.value = { ...pending, loading: false }
    showWorkspaceNotice(error?.message || '요청한 작업을 완료하지 못했습니다.', 'error')
  }
}

// ─── 역할 레이블 헬퍼 ────────────────────────────────────────────────────────
const roleLabel = (role) => {
  const map = { ADMIN: '관리자', WRITE: '편집자', READ: '뷰어' }
  return map[role] || '뷰어'
}

const workspacePresenceStatusLabel = (user = {}) => {
  if (user.status === 'away') return '자리비움'
  if (user.status === 'offline') return '오프라인'
  return '접속 중'
}

const userInitial = (name) => String(name || '?').trim().slice(0, 1).toUpperCase() || '?'

const blockTypeLabel = (type) => {
  const map = {
    header: '제목',
    paragraph: '문단',
    list: '목록',
    quote: '인용',
    table: '표',
    code: '코드',
    image: '이미지',
    embed: '임베드',
    delimiter: '구분선',
    warning: '경고',
    youtube: 'YouTube',
  }
  return map[type] || '블록'
}

const commentAnchorLabel = (anchor) => {
  if (!anchor?.anchorBlockId) return '문서 전체'
  return anchor.anchorText || `${blockTypeLabel(anchor.anchorBlockType)} 블록`
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────
const formatBytes = (bytes) => {
  const size = Number(bytes || 0)
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  const units     = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value     = size / 1024 ** unitIndex
  const fractionDigits = unitIndex === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`
}

const formatDateTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(date)
}

const formatDocumentTime = (value) => {
  if (!value) return '최근 편집 정보 없음'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '최근 편집 정보 없음'
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  if (diffMinutes < 1) return '방금 편집'
  if (diffMinutes < 60) return `${diffMinutes}분 전`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}시간 전`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}일 전`
  return formatDateTime(value)
}

const refreshWorkspaceDocuments = async () => {
  workspaceDocumentsLoading.value = true
  try {
    await loadpost.side_list()
    loadWorkspaceDocumentSections()
    pruneRecentWorkspaceDocuments()
    persistRecentWorkspaceDocuments()
    void refreshWorkspaceBacklinks()
    void refreshWorkspacePageIndex()
  } finally {
    workspaceDocumentsLoading.value = false
  }
}

const confirmDiscardIfNeeded = () =>
  !hasUnsavedChanges.value || window.confirm(LEAVE_WARNING_MESSAGE)

const openWorkspaceDocument = async (document) => {
  if (!document?.id || String(document.id) === currentWorkspaceKey.value) return
  trackRecentWorkspaceDocument(document)
  await router.push(`/workspace/read/${document.id}`)
}

const workspaceDocumentPath = (document) => {
  const id = documentId(document)
  return id == null ? '' : `/workspace/read/${encodeURIComponent(String(id))}`
}

const workspaceDocumentAbsoluteUrl = (document) => {
  const path = workspaceDocumentPath(document)
  if (!path) return ''
  return typeof window === 'undefined' ? path : new URL(path, window.location.origin).toString()
}

const currentWorkspaceLinkDocument = computed(() => {
  const id = workspaceId.value || route.params.id
  if (!id || String(id) === 'new') return null
  const indexedDocument = workspaceDocumentById.value.get(String(id))
  return {
    ...(indexedDocument || {}),
    id,
    title: title.value || indexedDocument?.title || '제목 없음',
    role: indexedDocument?.role || workspaceAccessRole.value,
    scope: indexedDocument?.scope || 'personal',
  }
})

const canCopyCurrentWorkspaceDocumentLink = computed(() =>
  Boolean(currentWorkspaceLinkDocument.value && workspaceDocumentAbsoluteUrl(currentWorkspaceLinkDocument.value)),
)
const canFavoriteCurrentWorkspaceDocument = computed(() =>
  Boolean(currentWorkspaceLinkDocument.value?.id),
)
const isCurrentWorkspaceDocumentFavorite = computed(() =>
  isWorkspaceDocumentFavorite(currentWorkspaceLinkDocument.value),
)
const currentWorkspaceFavoriteTitle = computed(() => {
  if (!canFavoriteCurrentWorkspaceDocument.value) return '저장된 페이지에서 즐겨찾기를 사용할 수 있습니다'
  return isCurrentWorkspaceDocumentFavorite.value ? '즐겨찾기 해제' : '즐겨찾기 추가'
})
const canExportWorkspaceMarkdown = computed(() =>
  Boolean(editorApi.value?.getCurrentSnapshot && !isEditorLoading.value && !workspaceMarkdownExporting.value),
)

const extractSavedWorkspaceId = (response) =>
  response?.result?.body?.idx ?? response?.data?.idx ?? response?.idx ?? null

const escapeWorkspaceInlineHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const insertWorkspacePageLink = async (document) => {
  if (!canModifyWorkspacePage.value || !editorApi.value?.appendWorkspacePageLink) return
  const path = workspaceDocumentPath(document)
  if (!path) return
  const inserted = await editorApi.value.appendWorkspacePageLink({
    id: documentId(document),
    title: document?.title || '제목 없음',
    path,
  })
  if (!inserted) {
    showWorkspaceNotice('페이지 링크를 본문에 삽입하지 못했습니다.', 'error')
  }
}

const markWorkspaceDocumentLinkCopied = (document) => {
  const id = documentId(document)
  workspaceDocumentLinkCopiedId.value = id == null ? '' : String(id)
  if (workspaceDocumentLinkCopyTimer) clearTimeout(workspaceDocumentLinkCopyTimer)
  workspaceDocumentLinkCopyTimer = setTimeout(() => {
    workspaceDocumentLinkCopiedId.value = ''
    workspaceDocumentLinkCopyTimer = null
  }, 1800)
}

const isWorkspaceDocumentLinkCopied = (document) => {
  const id = documentId(document)
  return id != null && workspaceDocumentLinkCopiedId.value === String(id)
}

const writeWorkspaceClipboardTextFallback = (text) => {
  if (typeof document === 'undefined') return false
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-1000px'
  textarea.style.left = '-1000px'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

const writeWorkspaceClipboardText = async (text) => {
  const value = String(text || '')
  if (!value) return false
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // Fall through to the selection-based fallback.
  }
  return writeWorkspaceClipboardTextFallback(value)
}

const copyWorkspaceDocumentLink = async (document) => {
  const url = workspaceDocumentAbsoluteUrl(document)
  if (!url) return
  const copied = await writeWorkspaceClipboardText(url)
  if (copied) {
    markWorkspaceDocumentLinkCopied(document)
    showWorkspaceNotice('페이지 링크를 복사했습니다.', 'success')
    return
  }
  showWorkspaceNotice('링크를 자동으로 복사하지 못했습니다. 브라우저 권한을 확인해주세요.', 'error', { timeout: 5200 })
}

const exportWorkspaceMarkdown = async () => {
  if (!canExportWorkspaceMarkdown.value) return
  workspaceMarkdownExporting.value = true
  try {
    const snapshot = await editorApi.value.getCurrentSnapshot()
    const markdown = buildWorkspaceMarkdownExport(snapshot, title.value)
    downloadWorkspaceMarkdown(markdown, workspaceExportFileName(title.value))
    showWorkspaceNotice('Markdown 파일을 내보냈습니다.', 'success')
  } catch (error) {
    console.error('Workspace markdown export failed:', error)
    showWorkspaceNotice(error?.message || 'Markdown 내보내기에 실패했습니다.', 'error')
  } finally {
    workspaceMarkdownExporting.value = false
  }
}

const buildWorkspaceSubpageSnapshot = ({ parentId, parentTitle, pageTitle }) => {
  const timestamp = Date.now()
  const parentPath = workspaceDocumentPath({ id: parentId })
  const parentLabel = parentTitle || '상위 페이지'
  return JSON.stringify({
    time: timestamp,
    blocks: [
      {
        id: `subpage-title-${timestamp}`,
        type: 'header',
        data: { text: escapeWorkspaceInlineHtml(pageTitle || '새 하위 페이지'), level: 1 },
      },
      {
        id: `subpage-parent-${timestamp}`,
        type: 'paragraph',
        data: {
          text: `<a href="${escapeWorkspaceInlineHtml(parentPath)}" data-workspace-page-id="${escapeWorkspaceInlineHtml(parentId)}">← ${escapeWorkspaceInlineHtml(parentLabel)}</a>`,
        },
      },
      {
        id: `subpage-body-${timestamp}`,
        type: 'paragraph',
        data: { text: '' },
      },
    ],
    meta: {
      parentWorkspaceId: String(parentId || ''),
      parentWorkspaceTitle: parentLabel,
      workspaceProperties: normalizeWorkspaceProperties({
        icon: '📄',
        coverColor: currentWorkspaceProperties.value.coverColor,
        status: 'planning',
        priority: currentWorkspaceProperties.value.priority,
        ownerEmail: currentWorkspaceProperties.value.ownerEmail,
        ownerName: currentWorkspaceProperties.value.ownerName,
        tags: currentWorkspaceProperties.value.tags,
      }),
    },
  })
}

const focusWorkspaceSubpageComposer = async () => {
  if (!canStartWorkspaceSubpage.value) return
  isWorkspacePanelCollapsed.value = false
  activeWorkspacePanelTab.value = 'links'
  await nextTick()
  workspaceSubpageInput.value?.focus()
}

const createWorkspaceChildPage = async ({ parentId, parentTitle, pageTitle, refresh = true } = {}) => {
  if (!parentId || !pageTitle) throw new Error('하위 페이지 정보를 확인할 수 없습니다.')
  const response = await postApi.savePost({
    idx: null,
    title: pageTitle,
    contents: buildWorkspaceSubpageSnapshot({ parentId, parentTitle, pageTitle }),
  })
  const childId = extractSavedWorkspaceId(response)
  if (!childId) throw new Error('하위 페이지 저장 결과를 확인할 수 없습니다.')
  const childDocument = { id: childId, title: pageTitle, role: 'ADMIN', scope: 'personal' }
  if (refresh) {
    await refreshWorkspaceDocuments()
    await refreshWorkspacePageIndex()
  }
  return childDocument
}

const createWorkspaceSubpage = async () => {
  const pageTitle = workspaceSubpageTitle.value.trim()
  if (!pageTitle || !canCreateWorkspaceSubpage.value) return

  workspaceSubpageCreating.value = true
  workspaceSubpageError.value = ''

  try {
    const parentId = await ensureWorkspacePersisted({ navigate: true })
    const parentTitle = title.value.trim() || '상위 페이지'
    const childDocument = await createWorkspaceChildPage({
      parentId,
      parentTitle,
      pageTitle,
      refresh: false,
    })
    const inserted = await editorApi.value?.appendWorkspacePageLink?.({
      id: childDocument.id,
      title: pageTitle,
      path: workspaceDocumentPath(childDocument),
    })
    if (!inserted) throw new Error('하위 페이지는 생성됐지만 부모 문서에 링크를 삽입하지 못했습니다.')

    workspaceSubpageTitle.value = ''
    await persistWorkspace({ navigateNewDocument: false })
    await refreshWorkspaceDocuments()
    await refreshWorkspacePageIndex()
    activeWorkspacePanelTab.value = 'links'
  } catch (error) {
    workspaceSubpageError.value =
      error?.response?.data?.message || error?.message || '하위 페이지를 만들지 못했습니다.'
  } finally {
    workspaceSubpageCreating.value = false
  }
}

const isWorkspaceTreeSubpageComposerOpen = (node) =>
  Boolean(node?.id && workspaceTreeSubpageComposerParentId.value === String(node.id))

const openWorkspaceTreeSubpageComposer = async (node) => {
  if (!node?.canEditProperties || workspaceTreeSubpageCreatingId.value) return
  cancelWorkspaceTreeRename()
  cancelWorkspaceTreeMove()
  workspaceTreeSubpageComposerParentId.value = String(node.id)
  workspaceTreeSubpageTitle.value = ''
  workspaceTreeSubpageError.value = ''
  await nextTick()
  const input = Array.isArray(workspaceTreeSubpageInput.value)
    ? workspaceTreeSubpageInput.value[0]
    : workspaceTreeSubpageInput.value
  input?.focus?.()
}

const cancelWorkspaceTreeSubpageComposer = () => {
  workspaceTreeSubpageComposerParentId.value = ''
  workspaceTreeSubpageTitle.value = ''
}

const isWorkspaceTreeRenameOpen = (node) =>
  Boolean(node?.id && workspaceTreeRenamingId.value === String(node.id))

const openWorkspaceTreeRename = async (node) => {
  if (!node?.canEditProperties || workspaceTreeRenameSavingId.value) return
  cancelWorkspaceTreeSubpageComposer()
  cancelWorkspaceTreeMove()
  workspaceTreeRenamingId.value = String(node.id)
  workspaceTreeRenameDraft.value = node.title || ''
  workspaceTreeRenameError.value = ''
  await nextTick()
  const input = Array.isArray(workspaceTreeRenameInput.value)
    ? workspaceTreeRenameInput.value[0]
    : workspaceTreeRenameInput.value
  input?.focus?.()
  input?.select?.()
}

const cancelWorkspaceTreeRename = () => {
  workspaceTreeRenamingId.value = ''
  workspaceTreeRenameDraft.value = ''
}

const isWorkspaceTreeMoveOpen = (node) =>
  Boolean(node?.id && workspaceTreeMovingId.value === String(node.id))

const collectWorkspacePageTreeDescendantIds = (node, descendants = new Set()) => {
  ;(node?.children || []).forEach((child) => {
    const childId = String(child.id || '')
    if (!childId || descendants.has(childId)) return
    descendants.add(childId)
    collectWorkspacePageTreeDescendantIds(child, descendants)
  })
  return descendants
}

const workspaceTreeMoveTargetOptions = (node) => {
  const nodeId = String(node?.id || '')
  const blockedIds = collectWorkspacePageTreeDescendantIds(node)
  blockedIds.add(nodeId)
  return [
    { id: '', title: 'Workspace root', treeDepth: 0 },
    ...workspacePageTreeAllRows.value
      .filter((row) => !blockedIds.has(String(row.id || '')))
      .map((row) => ({
        id: String(row.id),
        title: row.title || 'Untitled',
        treeDepth: row.treeDepth || 0,
      })),
  ]
}

const openWorkspaceTreeMove = (node) => {
  if (!node?.canEditProperties || workspaceTreeMoveSavingId.value) return
  cancelWorkspaceTreeSubpageComposer()
  cancelWorkspaceTreeRename()
  workspaceTreeMovingId.value = String(node.id)
  workspaceTreeMoveTargetId.value = String(node.parentWorkspaceId || '')
  workspaceTreeMoveError.value = ''
}

const cancelWorkspaceTreeMove = () => {
  workspaceTreeMovingId.value = ''
  workspaceTreeMoveTargetId.value = ''
}

const canApplyWorkspaceTreeMove = (node) => {
  if (!node?.id || !node.canEditProperties || !isWorkspaceTreeMoveOpen(node)) return false
  if (workspaceTreeMoveSavingId.value) return false
  const targetId = String(workspaceTreeMoveTargetId.value || '')
  const currentParentId = String(node.parentWorkspaceId || '')
  if (targetId === currentParentId) return false
  if (targetId === String(node.id)) return false
  return !collectWorkspacePageTreeDescendantIds(node).has(targetId)
}

const moveWorkspaceTreePage = async (node) => {
  const pageId = documentId(node)
  if (!pageId || !canApplyWorkspaceTreeMove(node)) return
  const targetId = String(workspaceTreeMoveTargetId.value || '')
  const target = targetId ? workspacePageIndexRowById.value.get(targetId) || workspaceDocumentById.value.get(targetId) : null
  const parent = targetId
    ? { id: targetId, title: target?.title || 'Parent page' }
    : { id: '', title: '' }

  workspaceTreeMoveSavingId.value = String(pageId)
  workspaceTreeMoveError.value = ''
  try {
    if (String(pageId) === currentWorkspaceKey.value && editorApi.value?.savePost) {
      applyWorkspaceParentPage(parent)
      await nextTick()
      await persistWorkspace({ navigateNewDocument: false })
    } else {
      const data = await postApi.getPost(pageId)
      await postApi.savePost({
        idx: pageId,
        title: data?.title || node.title || 'Untitled',
        contents: serializeWorkspaceSnapshotWithParent(data?.contents, parent),
      })
      await refreshWorkspaceDocuments()
    }
    if (targetId) {
      collapsedWorkspacePageTreeIds.value = collapsedWorkspacePageTreeIds.value.filter(
        (id) => String(id) !== targetId,
      )
    }
    await refreshWorkspacePageIndex()
    cancelWorkspaceTreeMove()
  } catch (error) {
    workspaceTreeMoveError.value =
      error?.response?.data?.message || error?.message || '페이지 위치를 변경하지 못했습니다.'
  } finally {
    workspaceTreeMoveSavingId.value = ''
  }
}

const renameWorkspaceTreePage = async (node) => {
  const pageId = documentId(node)
  const nextTitle = workspaceTreeRenameDraft.value.trim().slice(0, 120)
  if (!pageId || !node?.canEditProperties || !isWorkspaceTreeRenameOpen(node)) return
  if (!nextTitle) {
    workspaceTreeRenameError.value = '페이지 제목을 입력해주세요.'
    return
  }
  if (nextTitle === String(node.title || '').trim()) {
    cancelWorkspaceTreeRename()
    return
  }

  workspaceTreeRenameSavingId.value = String(pageId)
  workspaceTreeRenameError.value = ''
  try {
    if (String(pageId) === currentWorkspaceKey.value && editorApi.value?.savePost) {
      title.value = nextTitle
      titleDirty.value = true
      editorApi.value.updateTitleFromLocal?.(nextTitle)
      await persistWorkspace({ navigateNewDocument: false })
    } else {
      const data = await postApi.getPost(pageId)
      await postApi.savePost({
        idx: pageId,
        title: nextTitle,
        contents: data?.contents || '',
      })
      await refreshWorkspaceDocuments()
    }
    await refreshWorkspacePageIndex()
    cancelWorkspaceTreeRename()
  } catch (error) {
    workspaceTreeRenameError.value =
      error?.response?.data?.message || error?.message || '페이지 이름을 변경하지 못했습니다.'
  } finally {
    workspaceTreeRenameSavingId.value = ''
  }
}

const createWorkspaceTreeSubpage = async (parentDocument) => {
  const parentId = documentId(parentDocument)
  if (!parentId || workspaceTreeSubpageCreatingId.value || !parentDocument?.canEditProperties) return
  const parentTitle = parentDocument.title || '상위 페이지'
  const pageTitle = workspaceTreeSubpageTitle.value.trim().slice(0, 80)
  if (!pageTitle) {
    workspaceTreeSubpageError.value = '하위 페이지 제목을 입력해주세요.'
    return
  }

  workspaceTreeSubpageCreatingId.value = String(parentId)
  workspaceTreeSubpageError.value = ''
  try {
    await createWorkspaceChildPage({
      parentId,
      parentTitle,
      pageTitle,
      refresh: true,
    })
    collapsedWorkspacePageTreeIds.value = collapsedWorkspacePageTreeIds.value.filter(
      (id) => String(id) !== String(parentId),
    )
    workspacePageTreeQuery.value = ''
    cancelWorkspaceTreeSubpageComposer()
    activeWorkspacePanelTab.value = 'tree'
  } catch (error) {
    workspaceTreeSubpageError.value =
      error?.response?.data?.message || error?.message || '하위 페이지를 만들지 못했습니다.'
  } finally {
    workspaceTreeSubpageCreatingId.value = ''
  }
}

const createWorkspaceDocument = async () => {
  if (!confirmDiscardIfNeeded()) return
  if (route.path === '/workspace') {
    await setupEditor()
    return
  }
  await router.push('/workspace')
}

const documentId = (document) => document?.id ?? document?.post_idx ?? null

const workspacePreferencePayload = () => ({
  favoriteWorkspaceIds: normalizeFavoriteWorkspaceIds(favoriteWorkspaceDocumentIds.value),
  recentWorkspaceIds: normalizeRecentWorkspaceIds(recentWorkspaceDocumentIds.value),
  documentSections: normalizeWorkspaceDocumentSections(workspaceDocumentSections.value),
  pageIndexViews: normalizeWorkspacePageIndexViews(workspacePageIndexViews.value),
})

const hasWorkspacePreferenceContent = (payload = {}) =>
  [
    payload.favoriteWorkspaceIds,
    payload.recentWorkspaceIds,
    payload.documentSections,
    payload.pageIndexViews,
  ].some((items) => Array.isArray(items) && items.length > 0)

const workspaceDocumentValidIdSet = () =>
  workspaceDocuments.value.length > 0
    ? new Set(workspaceDocuments.value.map((document) => String(document.id)))
    : null

const persistWorkspacePreferencesLocally = (payload = workspacePreferencePayload()) => {
  try {
    localStorage.setItem(
      workspaceFavoriteStorageKey.value,
      JSON.stringify(normalizeFavoriteWorkspaceIds(payload.favoriteWorkspaceIds)),
    )
    localStorage.setItem(
      workspaceRecentStorageKey.value,
      JSON.stringify(normalizeRecentWorkspaceIds(payload.recentWorkspaceIds)),
    )
    localStorage.setItem(
      workspaceSectionsStorageKey.value,
      JSON.stringify(normalizeWorkspaceDocumentSections(payload.documentSections)),
    )
    localStorage.setItem(
      workspacePageIndexViewsStorageKey.value,
      JSON.stringify(normalizeWorkspacePageIndexViews(payload.pageIndexViews)),
    )
  } catch {
    // 사용자별 워크스페이스 설정은 편의 상태라 로컬 캐시 실패가 편집을 막지 않게 둔다.
  }
}

const applyWorkspacePreferencePayload = (payload = {}) => {
  favoriteWorkspaceDocumentIds.value = normalizeFavoriteWorkspaceIds(payload.favoriteWorkspaceIds)
  recentWorkspaceDocumentIds.value = normalizeRecentWorkspaceIds(payload.recentWorkspaceIds)
  workspaceDocumentSections.value = normalizeWorkspaceDocumentSections(
    payload.documentSections,
    workspaceDocumentValidIdSet(),
  )
  workspacePageIndexViews.value = normalizeWorkspacePageIndexViews(payload.pageIndexViews)
  if (workspaceDocuments.value.length > 0) {
    pruneRecentWorkspaceDocuments()
    pruneWorkspaceDocumentSections()
  }
  persistWorkspacePreferencesLocally()
}

const persistWorkspacePreferencesToServer = async () => {
  if (!workspacePreferencesRemoteReady.value) return
  workspacePreferencesSaving.value = true
  try {
    const savedPreferences = await postApi.saveWorkspacePreferences(workspacePreferencePayload())
    applyWorkspacePreferencePayload(savedPreferences)
  } catch (error) {
    console.error('Workspace preference save failed:', error)
  } finally {
    workspacePreferencesSaving.value = false
  }
}

const queuePersistWorkspacePreferences = () => {
  if (!workspacePreferencesRemoteReady.value) {
    workspacePreferencesDirtyBeforeRemoteLoad.value = true
    return
  }
  if (workspacePreferencesSaveTimer.value) {
    clearTimeout(workspacePreferencesSaveTimer.value)
  }
  workspacePreferencesSaveTimer.value = window.setTimeout(() => {
    workspacePreferencesSaveTimer.value = null
    void persistWorkspacePreferencesToServer()
  }, 450)
}

const loadFavoriteWorkspaceDocuments = () => {
  try {
    const rawValue = localStorage.getItem(workspaceFavoriteStorageKey.value)
    favoriteWorkspaceDocumentIds.value = normalizeFavoriteWorkspaceIds(rawValue ? JSON.parse(rawValue) : [])
  } catch {
    favoriteWorkspaceDocumentIds.value = []
  }
}

const persistFavoriteWorkspaceDocuments = () => {
  try {
    localStorage.setItem(
      workspaceFavoriteStorageKey.value,
      JSON.stringify(normalizeFavoriteWorkspaceIds(favoriteWorkspaceDocumentIds.value)),
    )
  } catch {
    // 즐겨찾기는 편의 기능이므로 저장 실패가 문서 작업을 막지 않게 둔다.
  }
  queuePersistWorkspacePreferences()
}

const loadRecentWorkspaceDocuments = () => {
  try {
    const rawValue = localStorage.getItem(workspaceRecentStorageKey.value)
    recentWorkspaceDocumentIds.value = normalizeRecentWorkspaceIds(rawValue ? JSON.parse(rawValue) : [])
  } catch {
    recentWorkspaceDocumentIds.value = []
  }
}

const persistRecentWorkspaceDocuments = () => {
  try {
    localStorage.setItem(
      workspaceRecentStorageKey.value,
      JSON.stringify(normalizeRecentWorkspaceIds(recentWorkspaceDocumentIds.value)),
    )
  } catch {
    // 최근 문서는 탐색 편의 기능이므로 저장 실패가 문서 작업을 막지 않게 둔다.
  }
  queuePersistWorkspacePreferences()
}

const pruneRecentWorkspaceDocuments = () => {
  const validIds = new Set(workspaceDocuments.value.map((document) => String(document.id)))
  recentWorkspaceDocumentIds.value = normalizeRecentWorkspaceIds(
    recentWorkspaceDocumentIds.value.filter((id) => validIds.has(String(id))),
  )
}

const trackRecentWorkspaceDocument = (document) => {
  const id = documentId(document)
  if (id == null || String(id) === 'new') return
  const normalizedId = String(id)
  recentWorkspaceDocumentIds.value = normalizeRecentWorkspaceIds([
    normalizedId,
    ...recentWorkspaceDocumentIds.value.filter((item) => item !== normalizedId),
  ])
  persistRecentWorkspaceDocuments()
}

const pruneWorkspaceDocumentSections = () => {
  const validIds = new Set(workspaceDocuments.value.map((document) => String(document.id)))
  workspaceDocumentSections.value = normalizeWorkspaceDocumentSections(
    workspaceDocumentSections.value,
    validIds,
  )
}

const loadWorkspaceDocumentSections = () => {
  try {
    const rawValue = localStorage.getItem(workspaceSectionsStorageKey.value)
    workspaceDocumentSections.value = normalizeWorkspaceDocumentSections(
      rawValue ? JSON.parse(rawValue) : [],
      workspaceDocumentValidIdSet(),
    )
  } catch {
    workspaceDocumentSections.value = []
  }
}

const persistWorkspaceDocumentSections = () => {
  pruneWorkspaceDocumentSections()
  try {
    localStorage.setItem(
      workspaceSectionsStorageKey.value,
      JSON.stringify(workspaceDocumentSections.value),
    )
  } catch {
    // 섹션은 사용자별 사이드바 정리 정보라 저장 실패가 문서 편집을 막지 않게 둔다.
  }
  queuePersistWorkspacePreferences()
}

const loadWorkspacePageIndexViews = () => {
  try {
    const rawValue = localStorage.getItem(workspacePageIndexViewsStorageKey.value)
    workspacePageIndexViews.value = normalizeWorkspacePageIndexViews(rawValue ? JSON.parse(rawValue) : [])
  } catch {
    workspacePageIndexViews.value = []
  }
}

const persistWorkspacePageIndexViews = () => {
  try {
    localStorage.setItem(
      workspacePageIndexViewsStorageKey.value,
      JSON.stringify(normalizeWorkspacePageIndexViews(workspacePageIndexViews.value)),
    )
  } catch {
    // Page database views are local convenience state, so storage failures should not interrupt editing.
  }
  queuePersistWorkspacePreferences()
}

const loadWorkspacePreferencesFromLocal = () => {
  loadFavoriteWorkspaceDocuments()
  loadRecentWorkspaceDocuments()
  loadWorkspaceDocumentSections()
  loadWorkspacePageIndexViews()
  workspacePreferencesDirtyBeforeRemoteLoad.value = false
}

const loadWorkspacePreferences = async () => {
  const localPayload = workspacePreferencePayload()
  try {
    const remotePayload = await postApi.getWorkspacePreferences()
    const hasRemoteContent = hasWorkspacePreferenceContent(remotePayload)
    workspacePreferencesRemoteReady.value = true

    if (
      workspacePreferencesDirtyBeforeRemoteLoad.value ||
      (!hasRemoteContent && hasWorkspacePreferenceContent(localPayload))
    ) {
      workspacePreferencesDirtyBeforeRemoteLoad.value = false
      queuePersistWorkspacePreferences()
      return
    }

    applyWorkspacePreferencePayload(remotePayload)
    workspacePreferencesDirtyBeforeRemoteLoad.value = false
  } catch (error) {
    workspacePreferencesRemoteReady.value = false
    console.error('Workspace preference load failed:', error)
  }
}

const createWorkspacePageIndexView = () => {
  const name = normalizeWorkspacePageIndexViewName(workspacePageIndexViewName.value)
  if (!name || !canCreateWorkspacePageIndexView.value) return
  workspacePageIndexViews.value = normalizeWorkspacePageIndexViews([
    ...workspacePageIndexViews.value,
    {
      id: createWorkspacePageIndexViewId(),
      name,
      filter: workspacePageIndexFilter.value,
      query: workspacePageIndexQuery.value,
      tag: workspacePageIndexTagFilter.value,
      owner: workspacePageIndexOwnerFilter.value,
      sort: workspacePageIndexSort.value,
    },
  ])
  workspacePageIndexViewName.value = ''
  persistWorkspacePageIndexViews()
}

const applyWorkspacePageIndexView = (view) => {
  if (!view) return
  workspacePageIndexFilter.value = normalizeWorkspacePageIndexViewFilter(view.filter)
  workspacePageIndexQuery.value = String(view.query || '').trim()
  workspacePageIndexTagFilter.value = normalizeWorkspacePageIndexViewTag(view.tag)
  workspacePageIndexOwnerFilter.value = normalizeWorkspacePageIndexViewOwner(view.owner)
  workspacePageIndexSort.value = normalizeWorkspacePageIndexViewSort(view.sort)
}

const workspacePageIndexViewSummary = (view) => {
  const filterLabel =
    workspacePageIndexFilterOptions.value.find((option) => option.id === view?.filter)?.label || '전체'
  const sortLabel =
    workspacePageIndexSortOptions.find((option) => option.id === view?.sort)?.label || '최근 수정순'
  const queryLabel = view?.query ? `"${view.query}"` : '검색어 없음'
  const tagLabel = view?.tag ? `#${view.tag}` : '태그 전체'
  const ownerOption = workspacePageIndexOwnerFilterOptions.value.find((option) => option.id === view?.owner)
  const ownerLabel = view?.owner ? ownerOption?.label || view.owner : '담당자 전체'
  return `${filterLabel} · ${sortLabel} · ${tagLabel} · ${ownerLabel} · ${queryLabel}`
}

const removeWorkspacePageIndexView = (view) => {
  if (!view?.id) return
  workspacePageIndexViews.value = workspacePageIndexViews.value.filter((item) => item.id !== view.id)
  persistWorkspacePageIndexViews()
}

const createWorkspaceDocumentSection = () => {
  const name = normalizeWorkspaceSectionName(workspaceSectionNameDraft.value)
  if (!name) return
  workspaceDocumentSections.value = normalizeWorkspaceDocumentSections([
    ...workspaceDocumentSections.value,
    {
      id: createWorkspaceSectionId(),
      name,
      collapsed: false,
      documentIds: [],
    },
  ])
  workspaceSectionNameDraft.value = ''
  persistWorkspaceDocumentSections()
}

const toggleWorkspaceDocumentSection = (sectionId) => {
  workspaceDocumentSections.value = workspaceDocumentSections.value.map((section) =>
    section.id === sectionId ? { ...section, collapsed: !section.collapsed } : section,
  )
  persistWorkspaceDocumentSections()
}

const startWorkspaceDocumentSectionRename = async (section) => {
  if (!section?.id) return
  workspaceSectionEditingId.value = section.id
  workspaceSectionEditDraft.value = section.name || ''
  await nextTick()
  const input = Array.isArray(workspaceSectionEditInput.value)
    ? workspaceSectionEditInput.value[0]
    : workspaceSectionEditInput.value
  input?.focus?.()
  input?.select?.()
}

const cancelWorkspaceDocumentSectionRename = () => {
  workspaceSectionEditingId.value = ''
  workspaceSectionEditDraft.value = ''
}

const saveWorkspaceDocumentSectionRename = () => {
  const sectionId = workspaceSectionEditingId.value
  if (!sectionId) return
  const nextName = normalizeWorkspaceSectionName(workspaceSectionEditDraft.value)
  if (!nextName) {
    cancelWorkspaceDocumentSectionRename()
    return
  }
  workspaceDocumentSections.value = workspaceDocumentSections.value.map((item) =>
    item.id === sectionId ? { ...item, name: nextName } : item,
  )
  cancelWorkspaceDocumentSectionRename()
  persistWorkspaceDocumentSections()
  showWorkspaceNotice('섹션 이름을 변경했습니다.', 'success')
}

const removeWorkspaceDocumentSection = (section) => {
  if (!section?.id) return
  requestWorkspaceConfirm({
    title: '섹션 삭제',
    message: `"${section.name}" 섹션을 삭제할까요? 문서는 삭제되지 않습니다.`,
    confirmLabel: '삭제',
    tone: 'danger',
    onConfirm: async () => {
      workspaceDocumentSections.value = workspaceDocumentSections.value.filter((item) => item.id !== section.id)
      persistWorkspaceDocumentSections()
      showWorkspaceNotice('섹션을 삭제했습니다.', 'success')
    },
  })
}

const workspaceDocumentSectionId = (document) => {
  const id = documentId(document)
  if (id == null) return ''
  const normalizedId = String(id)
  return workspaceDocumentSections.value.find((section) =>
    normalizeFavoriteWorkspaceIds(section.documentIds).includes(normalizedId),
  )?.id || ''
}

const moveWorkspaceDocumentToSection = (document, sectionId) => {
  const id = documentId(document)
  if (id == null) return
  const normalizedId = String(id)
  const normalizedSectionId = String(sectionId || '')

  workspaceDocumentSections.value = workspaceDocumentSections.value.map((section) => {
    const documentIds = normalizeFavoriteWorkspaceIds(section.documentIds)
      .filter((documentId) => documentId !== normalizedId)
    if (section.id === normalizedSectionId) {
      documentIds.push(normalizedId)
    }
    return { ...section, documentIds }
  })
  persistWorkspaceDocumentSections()
}

const isWorkspaceDocumentFavorite = (document) => {
  const id = documentId(document)
  return id != null && favoriteWorkspaceDocumentIds.value.includes(String(id))
}

const toggleFavoriteWorkspaceDocument = (document) => {
  const id = documentId(document)
  if (id == null) return
  const normalizedId = String(id)
  favoriteWorkspaceDocumentIds.value = isWorkspaceDocumentFavorite(document)
    ? favoriteWorkspaceDocumentIds.value.filter((item) => item !== normalizedId)
    : normalizeFavoriteWorkspaceIds([...favoriteWorkspaceDocumentIds.value, normalizedId])
  persistFavoriteWorkspaceDocuments()
}

const toggleCurrentWorkspaceDocumentFavorite = () => {
  if (!canFavoriteCurrentWorkspaceDocument.value) return
  toggleFavoriteWorkspaceDocument(currentWorkspaceLinkDocument.value)
}

const documentActionKey = (document, action) => `${action}:${documentId(document) ?? 'new'}`

const isDocumentActionLoading = (document, action) =>
  documentActionLoading.value === documentActionKey(document, action)

const duplicateWorkspaceDocument = async (document) => {
  const id = documentId(document)
  if (!id || isDocumentActionLoading(document, 'duplicate')) return
  if (!confirmDiscardIfNeeded()) return

  documentActionLoading.value = documentActionKey(document, 'duplicate')
  try {
    const source = await postApi.getPost(id)
    const copyTitle = `${source?.title || document.title || '제목 없음'} 복사본`
    const response = await postApi.savePost({
      idx: null,
      title: copyTitle,
      contents: source?.contents || '',
    })
    const copiedId = response?.result?.body?.idx ?? response?.data?.idx ?? response?.idx ?? null
    await refreshWorkspaceDocuments()
    if (copiedId) {
      allowRouteLeaveOnce.value = true
      await router.push(`/workspace/read/${copiedId}`)
    }
  } catch (error) {
    showWorkspaceNotice(error?.message || '문서를 복제하지 못했습니다.', 'error')
  } finally {
    documentActionLoading.value = ''
  }
}

const removeWorkspaceDocument = async (document) => {
  const id = documentId(document)
  if (!id || isDocumentActionLoading(document, 'remove')) return

  const role = String(document.role || 'READ').toUpperCase()
  const shouldDeleteWorkspace = role === 'ADMIN'
  const message = shouldDeleteWorkspace
    ? `"${document.title || '제목 없음'}" 문서를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
    : `"${document.title || '제목 없음'}" 문서를 내 목록에서 제거하시겠습니까?`
  requestWorkspaceConfirm({
    title: shouldDeleteWorkspace ? '문서 삭제' : '목록에서 제거',
    message,
    confirmLabel: shouldDeleteWorkspace ? '삭제' : '제거',
    tone: shouldDeleteWorkspace ? 'danger' : 'warn',
    onConfirm: async () => {
      documentActionLoading.value = documentActionKey(document, 'remove')
      try {
        if (shouldDeleteWorkspace) {
          await postApi.deletePost(id)
        } else {
          await postApi.list_delete(id)
        }
        await refreshWorkspaceDocuments()
        showWorkspaceNotice(shouldDeleteWorkspace ? '문서를 삭제했습니다.' : '목록에서 제거했습니다.', 'success')
        if (String(id) === currentWorkspaceKey.value) {
          allowRouteLeaveOnce.value = true
          await router.replace('/workspace')
        }
      } catch (error) {
        showWorkspaceNotice(error?.message || '문서를 정리하지 못했습니다.', 'error')
      } finally {
        documentActionLoading.value = ''
      }
    },
  })
}

const scheduleAutoSave = () => {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }

  if (!canEditWorkspace.value || !isValid.value || isEditorLoading.value) return
  if (!hasUnsavedChanges.value || !editorApi.value?.savePost) return

  saveState.value = 'dirty'
  autoSaveTimer = window.setTimeout(() => {
    autoSaveTimer = null
    void persistWorkspace({ navigateNewDocument: true })
  }, 1200)
}

const normalizeWorkspaceAsset = (asset = {}) => ({
  id:             asset.idx ?? asset.id ?? null,
  workspaceId:    asset.workspaceIdx ?? asset.workspaceId ?? workspaceId.value,
  assetType:      String(asset.assetType || 'FILE').toUpperCase(),
  originalName:   asset.originalName  || asset.fileOriginName || '이름 없는 파일',
  storedFileName: asset.storedFileName || asset.fileSaveName  || '',
  objectFolder:   asset.objectFolder  || '',
  objectKey:      asset.objectKey     || asset.fileSavePath   || '',
  contentType:    asset.contentType   || 'application/octet-stream',
  fileSize:       Number(asset.fileSize || 0),
  previewUrl:     asset.previewUrl    || '',
  downloadUrl:    asset.downloadUrl   || asset.presignedDownloadUrl || '',
  createdAt:      asset.createdAt     || null,
  createdAtLabel: formatDateTime(asset.createdAt),
  fileSizeLabel:  formatBytes(asset.fileSize),
})

const normalizeWorkspaceComment = (comment = {}) => {
  const createdAt = comment.createdAt || null
  const updatedAt = comment.updatedAt || null
  const createdTime = workspaceActivityTimestamp(createdAt)
  const updatedTime = workspaceActivityTimestamp(updatedAt)
  const isEdited = Boolean(createdTime && updatedTime && updatedTime > createdTime + 1000)
  return {
    id: comment.idx ?? comment.id ?? null,
    workspaceId: comment.workspaceIdx ?? comment.workspaceId ?? workspaceId.value,
    authorIdx: comment.authorIdx ?? null,
    authorName: comment.authorName || comment.authorEmail || '알 수 없는 사용자',
    authorEmail: comment.authorEmail || '',
    contents: comment.contents || '',
    anchorBlockId: comment.anchorBlockId || '',
    anchorBlockType: comment.anchorBlockType || '',
    anchorText: comment.anchorText || '',
    resolved: Boolean(comment.resolved),
    createdAt,
    updatedAt,
    createdAtLabel: formatDateTime(createdAt),
    updatedAtLabel: formatDateTime(updatedAt || createdAt),
    isEdited,
    editedLabel: isEdited ? `수정됨 ${formatDateTime(updatedAt)}` : '',
  }
}

const normalizeWorkspaceRevision = (revision = {}) => ({
  id: revision.idx ?? revision.id ?? null,
  workspaceId: revision.workspaceIdx ?? revision.workspaceId ?? workspaceId.value,
  actorIdx: revision.actorIdx ?? null,
  actorName: revision.actorName || revision.actorEmail || '알 수 없는 사용자',
  actorEmail: revision.actorEmail || '',
  title: revision.title || '제목 없음',
  contents: revision.contents ?? null,
  reason: String(revision.reason || 'SAVE').toUpperCase(),
  contentLength: Number(revision.contentLength || revision.contents?.length || 0),
  createdAt: revision.createdAt || null,
  createdAtLabel: formatDateTime(revision.createdAt),
})

const workspaceRevisionReasonLabel = (reason) => {
  const normalized = String(reason || '').toUpperCase()
  if (normalized === 'RESTORE') return '복구'
  return '저장'
}

const parseWorkspaceSnapshot = (contents) => {
  if (!contents) return { blocks: [] }
  if (typeof contents === 'object') {
    return Array.isArray(contents.blocks) ? contents : { blocks: [] }
  }

  try {
    let parsed = JSON.parse(String(contents))
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed)
    }
    return Array.isArray(parsed?.blocks) ? parsed : { blocks: [] }
  } catch {
    return { blocks: [] }
  }
}

const parseWorkspaceSnapshotWithMeta = (contents) => {
  if (!contents) return { blocks: [], meta: {} }
  if (typeof contents === 'object') {
    return {
      ...(Array.isArray(contents.blocks) ? contents : { blocks: [] }),
      meta: contents.meta || {},
    }
  }

  try {
    let parsed = JSON.parse(String(contents))
    if (typeof parsed === 'string') parsed = JSON.parse(parsed)
    if (!parsed || typeof parsed !== 'object') return { blocks: [], meta: {} }
    return {
      ...(Array.isArray(parsed.blocks) ? parsed : { blocks: [] }),
      meta: parsed.meta || {},
    }
  } catch {
    return { blocks: [], meta: {} }
  }
}

const stripWorkspaceSnapshotText = (value) =>
  String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const collectWorkspaceSnapshotText = (value) => {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return stripWorkspaceSnapshotText(value)
  if (Array.isArray(value)) return value.map(collectWorkspaceSnapshotText).filter(Boolean).join(' ')
  if (typeof value === 'object') {
    return Object.values(value).map(collectWorkspaceSnapshotText).filter(Boolean).join(' ')
  }
  return ''
}

const workspaceMarkdownEscape = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/([*_`#\[\]])/g, '\\$1')

const workspaceMarkdownInline = (value) => {
  const source = String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
  return source
    .replace(/<a\b[^>]*href=(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>(.*?)<\/a>/gi, (_match, hrefA, hrefB, hrefC, label) => {
      const href = hrefA || hrefB || hrefC || ''
      return `[${workspaceMarkdownEscape(stripWorkspaceSnapshotText(label))}](${href})`
    })
    .replace(/<[^>]*>/g, '')
    .replace(/\s+\n/g, '\n')
    .trim()
}

const workspaceMarkdownListItems = (items = [], depth = 0) =>
  (Array.isArray(items) ? items : [])
    .flatMap((item) => {
      const text = workspaceMarkdownInline(item?.content ?? item?.text ?? item?.label ?? item?.data?.text)
      const checked = Boolean(item?.meta?.checked ?? item?.checked ?? item?.data?.checked)
      const prefix = `${'  '.repeat(depth)}- ${Object.prototype.hasOwnProperty.call(item?.meta || {}, 'checked') || Object.prototype.hasOwnProperty.call(item || {}, 'checked') ? `[${checked ? 'x' : ' '}] ` : ''}`
      return [
        text ? `${prefix}${text}` : '',
        ...workspaceMarkdownListItems(item?.items || [], depth + 1),
      ].filter(Boolean)
    })
    .join('\n')

const workspaceSnapshotBlockToMarkdown = (block = {}) => {
  const data = block.data || {}
  if (block.type === 'header') {
    const level = Math.min(6, Math.max(1, Number(data.level || 2)))
    return `${'#'.repeat(level)} ${workspaceMarkdownInline(data.text)}`
  }
  if (block.type === 'paragraph') return workspaceMarkdownInline(data.text)
  if (block.type === 'quote') return `> ${workspaceMarkdownInline(data.text || data.caption)}`
  if (block.type === 'warning') {
    const titleText = workspaceMarkdownInline(data.title)
    const messageText = workspaceMarkdownInline(data.message)
    return [`> [!NOTE]${titleText ? ` ${titleText}` : ''}`, messageText ? `> ${messageText}` : ''].filter(Boolean).join('\n')
  }
  if (block.type === 'code') return `\`\`\`\n${String(data.code || '')}\n\`\`\``
  if (block.type === 'delimiter') return '---'
  if (block.type === 'list') return workspaceMarkdownListItems(data.items || [])
  if (block.type === 'table') {
    const rows = Array.isArray(data.content) ? data.content : []
    if (rows.length === 0) return ''
    const normalizedRows = rows.map((row) => (Array.isArray(row) ? row : []).map((cell) => workspaceMarkdownInline(cell)))
    const header = normalizedRows[0]
    const divider = header.map(() => '---')
    return [header, divider, ...normalizedRows.slice(1)]
      .map((row) => `| ${row.join(' | ')} |`)
      .join('\n')
  }
  if (block.type === 'image') {
    const caption = workspaceMarkdownInline(data.caption || data.file?.originalName || 'image')
    const url = data.file?.url || data.file?.previewUrl || data.file?.downloadUrl || ''
    return url ? `![${caption}](${url})` : caption
  }
  if (block.type === 'embed') return data.source || data.embed || ''
  return collectWorkspaceSnapshotText(data)
}

const buildWorkspaceMarkdownExport = (snapshot = {}, pageTitle = title.value) => {
  const blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : []
  const body = blocks
    .map(workspaceSnapshotBlockToMarkdown)
    .map((blockText) => String(blockText || '').trim())
    .filter(Boolean)
    .join('\n\n')
  const titleText = workspaceMarkdownInline(pageTitle || '제목 없음') || '제목 없음'
  const properties = [
    workspacePropertyStatusOption.value?.label ? `- 상태: ${workspacePropertyStatusOption.value.label}` : '',
    workspacePropertyPriorityOption.value?.label ? `- 우선순위: ${workspacePropertyPriorityOption.value.label}` : '',
    workspacePropertyOwnerEmail.value ? `- 담당자: ${workspacePropertyOwnerName.value || workspacePropertyOwnerEmail.value}` : '',
    workspacePropertyDueDate.value ? `- 기한: ${workspacePropertyDueDate.value}` : '',
    workspacePropertyTags.value.length ? `- 태그: ${workspacePropertyTags.value.map((tag) => `#${tag}`).join(' ')}` : '',
  ].filter(Boolean)
  return [
    `# ${titleText}`,
    properties.length ? properties.join('\n') : '',
    body,
  ].filter(Boolean).join('\n\n')
}

const workspaceExportFileName = (pageTitle = title.value) => {
  const safeTitle = String(pageTitle || 'workspace-page')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'workspace-page'
  return `${safeTitle}.md`
}

const downloadWorkspaceMarkdown = (markdown, fileName) => {
  if (typeof window === 'undefined' || typeof Blob === 'undefined') return
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const collectWorkspaceChecklistItems = (items = [], block, blockIndex, source, path = []) => {
  if (!Array.isArray(items)) return []
  const anchorBlockId = String(block?.id || `index-${blockIndex}`)

  return items.flatMap((item, itemIndex) => {
    const currentPath = [...path, itemIndex]
    const nestedItems = Array.isArray(item?.items) ? item.items : []
    const text = collectWorkspaceSnapshotText(item?.content ?? item?.text ?? item?.label ?? item?.data?.text)
    const meta = item?.meta || {}
    const checked = Boolean(meta.checked ?? item?.checked ?? item?.data?.checked)
    const task = text
      ? [{
          id: `${source.id || 'page'}:${anchorBlockId}:${currentPath.join('.')}`,
          documentId: source.id,
          documentTitle: source.title,
          documentScope: source.scope,
          documentRole: source.role,
          documentUpdatedAt: source.updatedAt,
          document: source,
          anchorBlockId,
          anchorBlockType: 'list',
          anchorText: text.slice(0, 255),
          text,
          checked,
          assigneeEmail: String(meta.assigneeEmail || '').trim(),
          assigneeName: String(meta.assigneeName || meta.assigneeEmail || '').trim(),
          dueDate: String(meta.dueDate || '').trim(),
          depth: Math.max(0, currentPath.length - 1),
          blockIndex,
          path: currentPath,
          pathLabel: currentPath.map((index) => index + 1).join('.'),
          isOverdue: Boolean(String(meta.dueDate || '').trim() && !checked && String(meta.dueDate).trim() < workspaceTaskTodayKey()),
        }]
      : []

    return [
      ...task,
      ...collectWorkspaceChecklistItems(nestedItems, block, blockIndex, source, currentPath),
    ]
  })
}

const collectWorkspaceSnapshotTasks = (blocks = [], source = {}) =>
  (Array.isArray(blocks) ? blocks : [])
    .flatMap((block, blockIndex) => {
      const style = String(block?.data?.style || '').toLowerCase()
      if (block?.type !== 'list' || style !== 'checklist') return []
      return collectWorkspaceChecklistItems(block.data?.items || [], block, blockIndex, source)
    })

const normalizeWorkspaceTaskPath = (task = {}) => {
  if (Array.isArray(task.path)) {
    return task.path.map((index) => Number(index)).filter((index) => Number.isInteger(index) && index >= 0)
  }
  return String(task.pathLabel || '')
    .split('.')
    .map((index) => Number(index) - 1)
    .filter((index) => Number.isInteger(index) && index >= 0)
}

const resolveWorkspaceSnapshotTaskItem = (blocks = [], task = {}) => {
  const path = normalizeWorkspaceTaskPath(task)
  if (!path.length) return null

  const anchorId = String(task.anchorBlockId || '').trim()
  const hintedBlockIndex = Number(task.blockIndex)
  const blockIndex = Number.isInteger(hintedBlockIndex)
    && hintedBlockIndex >= 0
    && String(blocks[hintedBlockIndex]?.id || `index-${hintedBlockIndex}`) === anchorId
    ? hintedBlockIndex
    : blocks.findIndex((block, index) => String(block?.id || `index-${index}`) === anchorId)

  if (blockIndex < 0) return null

  const block = blocks[blockIndex]
  const style = String(block?.data?.style || '').toLowerCase()
  if (block?.type !== 'list' || style !== 'checklist' || !Array.isArray(block.data?.items)) return null

  let currentItems = block.data.items
  let item = null
  for (const index of path) {
    item = currentItems?.[index]
    if (!item) return null
    currentItems = Array.isArray(item.items) ? item.items : []
  }

  return item
}

const decodeWorkspacePathSegment = (value) => {
  try {
    return decodeURIComponent(String(value || ''))
  } catch {
    return String(value || '')
  }
}

const collectWorkspaceSnapshotLinkIds = (value) => {
  const ids = new Set()
  const visit = (source) => {
    if (source == null) return
    if (Array.isArray(source)) {
      source.forEach(visit)
      return
    }
    if (typeof source === 'object') {
      Object.values(source).forEach(visit)
      return
    }
    if (typeof source !== 'string') return

    const dataIdRegex = /\bdata-workspace-page-id=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi
    let dataIdMatch = dataIdRegex.exec(source)
    while (dataIdMatch) {
      const id = dataIdMatch[1] || dataIdMatch[2] || dataIdMatch[3]
      if (id) ids.add(String(id))
      dataIdMatch = dataIdRegex.exec(source)
    }

    const readPathRegex = /\/workspace\/read\/([^"'<>\s?#/]+)/gi
    let pathMatch = readPathRegex.exec(source)
    while (pathMatch) {
      if (pathMatch[1]) ids.add(decodeWorkspacePathSegment(pathMatch[1]))
      pathMatch = readPathRegex.exec(source)
    }
  }

  visit(value)
  return ids
}

const buildWorkspaceSearchSnippet = (text, query) => {
  const normalizedText = String(text || '').replace(/\s+/g, ' ').trim()
  if (!normalizedText) return ''
  const normalizedQuery = String(query || '').trim().toLowerCase()
  const index = normalizedText.toLowerCase().indexOf(normalizedQuery)
  if (index < 0) return normalizedText.slice(0, 160)
  const start = Math.max(0, index - 54)
  const end = Math.min(normalizedText.length, index + normalizedQuery.length + 90)
  return `${start > 0 ? '...' : ''}${normalizedText.slice(start, end)}${end < normalizedText.length ? '...' : ''}`
}

const buildWorkspaceFullTextSearchResult = (document, data, query) => {
  const snapshot = parseWorkspaceSnapshotWithMeta(data?.contents)
  const bodyText = collectWorkspaceSnapshotText(snapshot.blocks)
  const titleText = String(data?.title || document.title || '')
  const normalizedQuery = normalizeWorkspaceLinkText(query)
  const normalizedTitle = normalizeWorkspaceLinkText(titleText)
  const normalizedBody = normalizeWorkspaceLinkText(bodyText)
  const titleMatched = normalizedTitle.includes(normalizedQuery)
  const bodyMatched = normalizedBody.includes(normalizedQuery)
  if (!titleMatched && !bodyMatched) return null

  return {
    ...document,
    title: titleText || document.title,
    updatedAt: data?.updatedAt || document.updatedAt,
    scopeLabel: document.scope === 'shared' ? '공유 페이지' : '내 페이지',
    roleLabel: roleLabel(data?.accessRole || data?.level || document.role),
    updatedLabel: formatDocumentTime(data?.updatedAt || document.updatedAt),
    matchType: titleMatched ? 'title' : 'body',
    matchTypeLabel: titleMatched ? '제목' : '본문',
    snippet: bodyMatched
      ? buildWorkspaceSearchSnippet(bodyText, query)
      : '제목에서 검색어가 발견되었습니다.',
  }
}

const workspacePropertyOptionLabel = (value, options) =>
  options.find((option) => option.id === value)?.label || value || ''

const buildWorkspacePageIndexRow = (document, data) => {
  const properties = extractWorkspacePropertiesFromContents(data?.contents)
  const snapshot = parseWorkspaceSnapshotWithMeta(data?.contents)
  const meta = snapshot.meta || {}
  const bodyText = collectWorkspaceSnapshotText(snapshot.blocks)
  const updatedAt = data?.updatedAt || document.updatedAt
  const status = properties.status
  const priority = properties.priority
  const accessRole = String(data?.accessRole || data?.level || document.role || 'READ').toUpperCase()
  const rowTitle = data?.title || document.title
  const workspaceTasks = collectWorkspaceSnapshotTasks(snapshot.blocks, {
    ...document,
    title: rowTitle,
    updatedAt,
    accessRole,
    role: accessRole,
    scopeLabel: document.scope === 'shared' ? '공유 페이지' : '내 페이지',
    roleLabel: roleLabel(accessRole),
    updatedLabel: formatDocumentTime(updatedAt),
  })

  return {
    ...document,
    title: rowTitle,
    updatedAt,
    accessRole,
    icon: properties.icon,
    coverColor: properties.coverColor,
    status,
    priority,
    statusLabel: workspacePropertyOptionLabel(status, WORKSPACE_PROPERTY_STATUS_OPTIONS),
    priorityLabel: workspacePropertyOptionLabel(priority, WORKSPACE_PROPERTY_PRIORITY_OPTIONS),
    statusTone: WORKSPACE_PROPERTY_STATUS_OPTIONS.find((option) => option.id === status)?.tone || 'muted',
    priorityTone: WORKSPACE_PROPERTY_PRIORITY_OPTIONS.find((option) => option.id === priority)?.tone || 'muted',
    ownerName: properties.ownerName || properties.ownerEmail || '',
    ownerEmail: properties.ownerEmail,
    dueDate: properties.dueDate,
    tags: properties.tags,
    locked: properties.locked,
    isOverdue: Boolean(properties.dueDate && status !== 'done' && properties.dueDate < workspaceTaskTodayKey()),
    scopeLabel: document.scope === 'shared' ? '공유 페이지' : '내 페이지',
    roleLabel: roleLabel(accessRole),
    canEditProperties: !properties.locked && ['ADMIN', 'WRITE'].includes(accessRole),
    parentWorkspaceId: String(meta.parentWorkspaceId || ''),
    parentWorkspaceTitle: String(meta.parentWorkspaceTitle || ''),
    updatedLabel: formatDocumentTime(updatedAt),
    workspaceTasks,
    preview: bodyText.slice(0, 120),
  }
}

const refreshWorkspacePageIndex = async () => {
  const candidates = workspaceDocuments.value
  if (candidates.length === 0) {
    workspacePageIndexRows.value = []
    workspacePageIndexError.value = ''
    workspacePageIndexLoading.value = false
    return
  }

  const scanId = ++currentWorkspacePageIndexScanId
  workspacePageIndexLoading.value = true
  workspacePageIndexError.value = ''

  try {
    const results = await Promise.allSettled(
      candidates.map(async (document) => {
        const data = await postApi.getPost(document.id)
        return buildWorkspacePageIndexRow(document, data)
      }),
    )

    if (scanId !== currentWorkspacePageIndexScanId) return
    workspacePageIndexRows.value = results
      .filter((result) => result.status === 'fulfilled' && result.value)
      .map((result) => result.value)
      .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime())
    workspacePageIndexRefreshedAt.value = new Date().toISOString()

    const failedCount = results.filter((result) => result.status === 'rejected').length
    workspacePageIndexError.value = failedCount
      ? `${failedCount}개 페이지 속성을 불러오지 못했습니다.`
      : ''
  } catch (error) {
    if (scanId !== currentWorkspacePageIndexScanId) return
    workspacePageIndexError.value = error?.message || '페이지 데이터베이스를 불러오지 못했습니다.'
  } finally {
    if (scanId === currentWorkspacePageIndexScanId) {
      workspacePageIndexLoading.value = false
    }
  }
}

const isWorkspacePageIndexRowUpdating = (row) =>
  workspacePageIndexUpdatingIds.value.includes(String(row?.id || ''))

const setWorkspacePageIndexRowUpdating = (row, busy) => {
  const id = String(row?.id || '')
  if (!id) return
  workspacePageIndexUpdatingIds.value = busy
    ? [...new Set([...workspacePageIndexUpdatingIds.value, id])]
    : workspacePageIndexUpdatingIds.value.filter((item) => item !== id)
}

const isWorkspacePageIndexRowSelected = (row) =>
  workspacePageIndexSelectedIds.value.includes(String(row?.id || ''))

const toggleWorkspacePageIndexRowSelection = (row, event) => {
  const id = String(row?.id || '')
  if (!id || !row.canEditProperties) return
  const checked = Boolean(event?.target?.checked)
  workspacePageIndexSelectedIds.value = checked
    ? [...new Set([...workspacePageIndexSelectedIds.value, id])]
    : workspacePageIndexSelectedIds.value.filter((item) => item !== id)
}

const toggleVisibleWorkspacePageIndexSelection = (event) => {
  const checked = Boolean(event?.target?.checked)
  const visibleIds = visibleEditableWorkspacePageIndexRows.value.map((row) => String(row.id))
  if (checked) {
    workspacePageIndexSelectedIds.value = [...new Set([...workspacePageIndexSelectedIds.value, ...visibleIds])]
    return
  }
  const visibleIdSet = new Set(visibleIds)
  workspacePageIndexSelectedIds.value = workspacePageIndexSelectedIds.value.filter((id) => !visibleIdSet.has(id))
}

const clearWorkspacePageIndexSelection = () => {
  workspacePageIndexSelectedIds.value = []
  workspacePageIndexBulkStatus.value = ''
  workspacePageIndexBulkPriority.value = ''
  workspacePageIndexBulkOwnerEmail.value = ''
  workspacePageIndexBulkDueDate.value = ''
  workspacePageIndexBulkClearDueDate.value = false
}

const serializeWorkspaceSnapshotWithProperties = (contents, properties) => {
  const snapshot = parseWorkspaceSnapshotWithMeta(contents)
  return JSON.stringify({
    ...snapshot,
    meta: {
      ...(snapshot.meta || {}),
      workspaceProperties: normalizeWorkspaceProperties(properties),
    },
  })
}

const serializeWorkspaceSnapshotWithParent = (contents, parent = {}) => {
  const snapshot = parseWorkspaceSnapshotWithMeta(contents)
  const parentId = String(parent.id || '').trim()
  return JSON.stringify({
    ...snapshot,
    meta: {
      ...(snapshot.meta || {}),
      parentWorkspaceId: parentId,
      parentWorkspaceTitle: parentId ? String(parent.title || '').trim() : '',
    },
  })
}

const updateWorkspacePageIndexRowProperties = async (row, patch = {}) => {
  const id = String(row?.id || '')
  if (!id || !row.canEditProperties || isWorkspacePageIndexRowUpdating(row)) return

  setWorkspacePageIndexRowUpdating(row, true)
  workspacePageIndexError.value = ''

  try {
    const data = await postApi.getPost(id)
    const currentProperties = extractWorkspacePropertiesFromContents(data?.contents)
    const nextProperties = normalizeWorkspaceProperties({
      ...currentProperties,
      ...patch,
    })

    if (id === currentWorkspaceKey.value && editorApi.value?.savePost) {
      applyWorkspaceProperties(nextProperties)
      await nextTick()
      await persistWorkspace({ navigateNewDocument: false })
    } else {
      await postApi.savePost({
        idx: id,
        title: data?.title || row.title || '제목 없음',
        contents: serializeWorkspaceSnapshotWithProperties(data?.contents, nextProperties),
      })
      await refreshWorkspaceDocuments()
    }

    await refreshWorkspacePageIndex()
  } catch (error) {
    workspacePageIndexError.value = error?.message || '페이지 속성을 저장하지 못했습니다.'
  } finally {
    setWorkspacePageIndexRowUpdating(row, false)
  }
}

const updateWorkspacePageIndexRowOwner = async (row, event) => {
  const ownerEmail = String(event?.target?.value || '').trim()
  if (!ownerEmail) {
    await updateWorkspacePageIndexRowProperties(row, { ownerEmail: '', ownerName: '' })
    return
  }

  const owner = workspacePageIndexOwnerOptions(row).find(
    (candidate) => String(candidate.email || '').toLowerCase() === ownerEmail.toLowerCase(),
  )
  await updateWorkspacePageIndexRowProperties(row, {
    ownerEmail,
    ownerName: owner?.name || ownerEmail,
  })
}

const updateWorkspacePageIndexRowTags = async (row, event) => {
  await updateWorkspacePageIndexRowProperties(row, {
    tags: normalizeWorkspacePropertyTags(event?.target?.value || ''),
  })
}

const updateWorkspacePageIndexBulkProperties = async () => {
  if (!canApplyWorkspacePageIndexBulkUpdate.value) return
  const patch = {}
  if (workspacePageIndexBulkStatus.value) patch.status = workspacePageIndexBulkStatus.value
  if (workspacePageIndexBulkPriority.value) patch.priority = workspacePageIndexBulkPriority.value
  if (workspacePageIndexBulkOwnerEmail.value === '__none__') {
    patch.ownerEmail = ''
    patch.ownerName = ''
  } else if (workspacePageIndexBulkOwnerEmail.value) {
    const ownerEmail = workspacePageIndexBulkOwnerEmail.value
    const owner = workspacePropertyOwnerCandidates.value.find(
      (candidate) => String(candidate.email || '').toLowerCase() === ownerEmail.toLowerCase(),
    )
    patch.ownerEmail = ownerEmail
    patch.ownerName = owner?.name || ownerEmail
  }
  if (workspacePageIndexBulkClearDueDate.value) {
    patch.dueDate = ''
  } else if (workspacePageIndexBulkDueDate.value) {
    patch.dueDate = workspacePageIndexBulkDueDate.value
  }
  const rows = [...selectedWorkspacePageIndexRows.value]
  if (rows.length === 0 || Object.keys(patch).length === 0) return

  workspacePageIndexBulkUpdating.value = true
  try {
    for (const row of rows) {
      await updateWorkspacePageIndexRowProperties(row, patch)
    }
    clearWorkspacePageIndexSelection()
  } finally {
    workspacePageIndexBulkUpdating.value = false
  }
}

const moveWorkspaceBoardCardStatus = async (row, direction) => {
  const currentIndex = WORKSPACE_PROPERTY_STATUS_OPTIONS.findIndex((option) => option.id === row?.status)
  if (currentIndex < 0) return
  const nextOption = WORKSPACE_PROPERTY_STATUS_OPTIONS[currentIndex + direction]
  if (!nextOption) return
  await updateWorkspacePageIndexRowProperties(row, { status: nextOption.id })
}

const clearWorkspaceBoardDrag = () => {
  workspaceBoardDraggingId.value = ''
  workspaceBoardDragOverStatus.value = ''
}

const findWorkspaceBoardRowById = (rowId) =>
  workspacePageIndexRows.value.find((row) => String(row.id) === String(rowId))

const startWorkspaceBoardCardDrag = (event, row) => {
  if (!row?.canEditProperties || isWorkspacePageIndexRowUpdating(row)) {
    event?.preventDefault?.()
    return
  }
  const rowId = String(row.id)
  workspaceBoardDraggingId.value = rowId
  workspaceBoardDragOverStatus.value = row.status || ''
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', rowId)
  }
}

const setWorkspaceBoardDropTarget = (status) => {
  if (!workspaceBoardDraggingId.value) return
  workspaceBoardDragOverStatus.value = status
}

const clearWorkspaceBoardDropTarget = (event, status) => {
  if (workspaceBoardDragOverStatus.value !== status) return
  if (event?.currentTarget?.contains?.(event.relatedTarget)) return
  workspaceBoardDragOverStatus.value = ''
}

const dropWorkspaceBoardCardStatus = async (event, status) => {
  const rowId = event?.dataTransfer?.getData('text/plain') || workspaceBoardDraggingId.value
  const row = findWorkspaceBoardRowById(rowId)
  if (!row || !row.canEditProperties || isWorkspacePageIndexRowUpdating(row)) {
    clearWorkspaceBoardDrag()
    return
  }
  if (row.status === status) {
    clearWorkspaceBoardDrag()
    return
  }
  try {
    await updateWorkspacePageIndexRowProperties(row, { status })
  } finally {
    clearWorkspaceBoardDrag()
  }
}

const searchWorkspaceContents = async () => {
  const query = workspaceFullTextQuery.value.trim()
  if (query.length < 2) {
    workspaceFullTextResults.value = []
    workspaceFullTextError.value = '검색어를 2글자 이상 입력하세요.'
    return
  }

  const candidates = workspaceDocuments.value
  if (candidates.length === 0) {
    workspaceFullTextResults.value = []
    workspaceFullTextError.value = '검색할 문서가 없습니다.'
    return
  }

  const searchId = ++currentWorkspaceFullTextSearchId
  workspaceFullTextLoading.value = true
  workspaceFullTextError.value = ''

  try {
    const results = await Promise.allSettled(
      candidates.map(async (document) => {
        const data = await postApi.getPost(document.id)
        return buildWorkspaceFullTextSearchResult(document, data, query)
      }),
    )

    if (searchId !== currentWorkspaceFullTextSearchId) return
    workspaceFullTextResults.value = results
      .filter((result) => result.status === 'fulfilled' && result.value)
      .map((result) => result.value)
      .sort((left, right) => Number(right.matchType === 'title') - Number(left.matchType === 'title'))
      .slice(0, 20)
    workspaceFullTextRefreshedAt.value = new Date().toISOString()

    const failedCount = results.filter((result) => result.status === 'rejected').length
    workspaceFullTextError.value = failedCount
      ? `${failedCount}개 문서를 검색하지 못했습니다.`
      : ''
  } catch (error) {
    if (searchId !== currentWorkspaceFullTextSearchId) return
    workspaceFullTextError.value = error?.message || '워크스페이스 검색에 실패했습니다.'
  } finally {
    if (searchId === currentWorkspaceFullTextSearchId) {
      workspaceFullTextLoading.value = false
    }
  }
}

const extractWorkspacePropertiesFromContents = (contents) =>
  normalizeWorkspaceProperties(parseWorkspaceSnapshotWithMeta(contents).meta?.workspaceProperties)

const extractWorkspaceParentFromContents = (contents) => {
  const meta = parseWorkspaceSnapshotWithMeta(contents).meta || {}
  const parentId = String(meta.parentWorkspaceId || '').trim()
  return {
    id: parentId,
    title: parentId ? String(meta.parentWorkspaceTitle || '').trim() : '',
  }
}

const buildWorkspaceBacklink = (document, data, targetId, targetTitle) => {
  const snapshot = parseWorkspaceSnapshotWithMeta(data?.contents)
  const linkIds = collectWorkspaceSnapshotLinkIds(snapshot.blocks)
  const text = collectWorkspaceSnapshotText(snapshot.blocks)
  const normalizedText = normalizeWorkspaceLinkText(text)
  const isExplicit = linkIds.has(String(targetId))
  const isMention = Boolean(targetTitle && targetTitle.length >= 2 && normalizedText.includes(targetTitle))
  if (!isExplicit && !isMention) return null

  return {
    ...document,
    title: data?.title || document.title,
    updatedAt: data?.updatedAt || document.updatedAt,
    scopeLabel: document.scope === 'shared' ? '공유 페이지' : '내 페이지',
    roleLabel: roleLabel(data?.accessRole || data?.level || document.role),
    updatedLabel: formatDocumentTime(data?.updatedAt || document.updatedAt),
    backlinkSource: isExplicit ? 'explicit' : 'mention',
    backlinkSourceLabel: isExplicit ? '삽입된 링크' : '제목 언급',
    backlinkPreview: text.slice(0, 140),
  }
}

const refreshWorkspaceBacklinks = async () => {
  const targetId = String(workspaceId.value || '')
  if (!targetId) {
    workspaceBacklinks.value = []
    workspaceBacklinkError.value = ''
    workspaceBacklinkLoading.value = false
    return
  }

  const candidates = workspaceDocuments.value.filter((document) => String(document.id) !== targetId)
  if (candidates.length === 0) {
    workspaceBacklinks.value = []
    workspaceBacklinkError.value = ''
    workspaceBacklinkRefreshedAt.value = new Date().toISOString()
    return
  }

  const scanId = ++currentWorkspaceBacklinkScanId
  workspaceBacklinkLoading.value = true
  workspaceBacklinkError.value = ''

  try {
    const targetTitle = normalizeWorkspaceLinkText(title.value)
    const results = await Promise.allSettled(
      candidates.map(async (document) => {
        const data = await postApi.getPost(document.id)
        return buildWorkspaceBacklink(document, data, targetId, targetTitle)
      }),
    )

    if (scanId !== currentWorkspaceBacklinkScanId) return
    workspaceBacklinks.value = results
      .filter((result) => result.status === 'fulfilled' && result.value)
      .map((result) => result.value)
      .sort((left, right) =>
        Number(right.backlinkSource === 'explicit') - Number(left.backlinkSource === 'explicit'),
      )
      .slice(0, 12)
    workspaceBacklinkRefreshedAt.value = new Date().toISOString()

    const failedCount = results.filter((result) => result.status === 'rejected').length
    workspaceBacklinkError.value = failedCount
      ? `${failedCount}개 문서의 백링크를 확인하지 못했습니다.`
      : ''
  } catch (error) {
    if (scanId !== currentWorkspaceBacklinkScanId) return
    workspaceBacklinkError.value = error?.message || '백링크를 불러오지 못했습니다.'
  } finally {
    if (scanId === currentWorkspaceBacklinkScanId) {
      workspaceBacklinkLoading.value = false
    }
  }
}

const applyWorkspaceProperties = (properties = {}) => {
  const normalized = normalizeWorkspaceProperties(properties)
  suppressWorkspacePropertyWatch = true
  workspacePropertyIcon.value = normalized.icon
  workspacePropertyCoverColor.value = normalized.coverColor
  workspacePropertyStatus.value = normalized.status
  workspacePropertyPriority.value = normalized.priority
  workspacePropertyOwnerEmail.value = normalized.ownerEmail
  workspacePropertyOwnerName.value = normalized.ownerName
  workspacePropertyDueDate.value = normalized.dueDate
  workspacePropertyTagsInput.value = normalized.tags.join(', ')
  workspacePageLocked.value = normalized.locked
  nextTick(() => {
    suppressWorkspacePropertyWatch = false
  })
}

const applyWorkspaceParentPage = (parent = {}) => {
  workspaceParentPageId.value = String(parent.id || '').trim()
  workspaceParentPageTitle.value = workspaceParentPageId.value
    ? String(parent.title || '').trim()
    : ''
}

const openWorkspaceParentPage = async () => {
  if (!currentWorkspaceParentPage.value?.id) return
  await openWorkspaceDocument(currentWorkspaceParentPage.value)
}

const stableWorkspaceStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(stableWorkspaceStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableWorkspaceStringify(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

const stripWorkspaceText = (value) =>
  String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const flattenWorkspaceListItems = (items = []) =>
  (Array.isArray(items) ? items : [])
    .flatMap((item) => {
      if (typeof item === 'string') return [item]
      const children = item?.items || item?.children || []
      return [item?.content || item?.text || '', ...flattenWorkspaceListItems(children)]
    })
    .filter(Boolean)

const workspaceBlockPreviewText = (block = {}) => {
  const data = block.data || {}
  const candidates = [
    data.text,
    data.caption,
    data.title,
    data.message,
    data.code,
    data.url,
    data.file?.name,
    data.file?.originalName,
    ...flattenWorkspaceListItems(data.items),
  ]
  const text = stripWorkspaceText(candidates.find((candidate) => stripWorkspaceText(candidate)) || '')
  if (text) return text.length > 96 ? `${text.slice(0, 95)}…` : text
  return `${blockTypeLabel(block.type)} 블록`
}

const workspaceBlockDiffKey = (block, index) =>
  block?.id ? `id:${block.id}` : `index:${index}`

const workspaceBlockSignature = (block = {}) =>
  stableWorkspaceStringify({
    type: block.type || '',
    data: block.data || {},
  })

const normalizeWorkspaceDiffBlock = (entry, counterpart = null) => ({
  key: entry.key,
  type: entry.block?.type || counterpart?.block?.type || '',
  typeLabel: blockTypeLabel(entry.block?.type || counterpart?.block?.type),
  preview: workspaceBlockPreviewText(entry.block || counterpart?.block),
  previousPreview: counterpart ? workspaceBlockPreviewText(counterpart.block) : '',
})

const buildWorkspaceRevisionDiff = async (revision) => {
  const targetSnapshot = parseWorkspaceSnapshot(revision?.contents)
  const currentSnapshot = editorApi.value?.getCurrentSnapshot
    ? await editorApi.value.getCurrentSnapshot()
    : { blocks: [] }
  const targetBlocks = Array.isArray(targetSnapshot.blocks) ? targetSnapshot.blocks : []
  const currentBlocks = Array.isArray(currentSnapshot.blocks) ? currentSnapshot.blocks : []
  const currentEntries = currentBlocks.map((block, index) => ({
    key: workspaceBlockDiffKey(block, index),
    block,
    signature: workspaceBlockSignature(block),
  }))
  const targetEntries = targetBlocks.map((block, index) => ({
    key: workspaceBlockDiffKey(block, index),
    block,
    signature: workspaceBlockSignature(block),
  }))
  const currentByKey = new Map(currentEntries.map((entry) => [entry.key, entry]))
  const targetByKey = new Map(targetEntries.map((entry) => [entry.key, entry]))

  const added = targetEntries
    .filter((entry) => !currentByKey.has(entry.key))
    .map((entry) => normalizeWorkspaceDiffBlock(entry))
  const removed = currentEntries
    .filter((entry) => !targetByKey.has(entry.key))
    .map((entry) => normalizeWorkspaceDiffBlock(entry))
  const changed = targetEntries
    .filter((entry) => {
      const current = currentByKey.get(entry.key)
      return current && current.signature !== entry.signature
    })
    .map((entry) => normalizeWorkspaceDiffBlock(entry, currentByKey.get(entry.key)))

  return {
    titleChanged: String(revision?.title || '') !== String(title.value || ''),
    currentTitle: title.value || '제목 없음',
    targetTitle: revision?.title || '제목 없음',
    added,
    removed,
    changed,
    unchangedCount: targetEntries.length - added.length - changed.length,
  }
}

const syncTheme = () => {
  const savedTheme    = localStorage.getItem('theme')
  const shouldUseDark =
    savedTheme === 'dark' ||
    (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', shouldUseDark)
}

// ─── 에셋 목록 병합 / 제거 ────────────────────────────────────────────────────
const mergeWorkspaceAssets = (nextAssets) => {
  const assetMap = new Map()
  ;[...nextAssets, ...workspaceAssets.value].forEach((asset) => {
    const normalized = normalizeWorkspaceAsset(asset)
    if (normalized.id != null) assetMap.set(String(normalized.id), normalized)
  })
  workspaceAssets.value = [...assetMap.values()].sort(
    (l, r) => new Date(r.createdAt || 0).getTime() - new Date(l.createdAt || 0).getTime()
  )
}

const removeWorkspaceAssets = (assetIds) => {
  const deleteSet = new Set((assetIds || []).map((id) => String(id)))
  if (!deleteSet.size) return
  workspaceAssets.value = workspaceAssets.value.filter((a) => !deleteSet.has(String(a.id)))
}

const removeWorkspaceComment = (commentId) => {
  if (commentId == null) return
  workspaceComments.value = workspaceComments.value.filter((comment) => String(comment.id) !== String(commentId))
}

const isWorkspaceRealtimeEventFromCurrentUser = (payload = {}) => {
  const actorIdx = payload.actorUserIdx
  const currentIdx = currentUserIdx.value
  return actorIdx != null && currentIdx != null && String(actorIdx) === String(currentIdx)
}

const openWorkspaceRealtimeCommentNotice = (comment = null, mention = false) => {
  isWorkspacePanelCollapsed.value = false
  activeWorkspacePanelTab.value = 'review'
  if (mention) {
    workspaceCommentFilter.value = 'mentions'
    return
  }
  if (comment?.anchorBlockId) {
    workspaceCommentFilter.value = 'block'
    void editorApi.value?.focusBlockAnchor?.(comment.anchorBlockId)
    return
  }
  workspaceCommentFilter.value = 'open'
}

const notifyWorkspaceCommentRealtimeEvent = (payload = {}, comment = null, previousComment = null) => {
  if (isWorkspaceRealtimeEventFromCurrentUser(payload)) return

  if (payload.action === 'DELETE') {
    showWorkspaceNotice('다른 멤버가 댓글을 삭제했습니다.', 'info', {
      actionLabel: '댓글 보기',
      onAction: () => openWorkspaceRealtimeCommentNotice(),
    })
    return
  }

  if (payload.action !== 'UPSERT' || !comment) return

  const author = comment.authorName || comment.authorEmail || '다른 멤버'
  const mentionedMe = isWorkspaceCommentMentioningCurrentUser(comment) && !comment.resolved
  const anchor = commentAnchorLabel(comment)
  const anchorSuffix = anchor && anchor !== '문서 전체' ? ` · ${anchor}` : ''
  let message = `${author}님이 댓글을 수정했습니다.`

  if (mentionedMe) {
    message = `${author}님이 나를 멘션했습니다.`
  } else if (!previousComment) {
    message = `${author}님이 댓글을 남겼습니다.`
  } else if (comment.resolved && !previousComment.resolved) {
    message = `${author}님이 댓글을 해결했습니다.`
  } else if (!comment.resolved && previousComment.resolved) {
    message = `${author}님이 댓글을 다시 열었습니다.`
  }

  showWorkspaceNotice(`${message}${anchorSuffix}`, mentionedMe ? 'warn' : 'info', {
    timeout: mentionedMe ? 7200 : 4600,
    actionLabel: '댓글 보기',
    onAction: () => openWorkspaceRealtimeCommentNotice(comment, mentionedMe),
  })
}

const openWorkspaceRealtimeAssetNotice = (asset = null) => {
  isWorkspacePanelCollapsed.value = false
  activeWorkspacePanelTab.value = 'assets'
  if (asset?.id != null) {
    activeWorkspaceAssetId.value = asset.id
  }
}

const workspaceAssetRealtimeLabel = (assets = [], deletedIds = []) => {
  if (assets.length > 0) {
    const firstName = assets[0]?.originalName || '첨부 파일'
    return assets.length === 1 ? firstName : `${firstName} 외 ${assets.length - 1}개`
  }
  const count = deletedIds.length
  return count > 1 ? `${count}개 파일` : '첨부 파일'
}

const notifyWorkspaceAssetRealtimeEvent = (payload = {}, assets = [], deletedIds = []) => {
  if (isWorkspaceRealtimeEventFromCurrentUser(payload)) return

  if (payload.action === 'UPLOAD' || payload.action === 'UPSERT') {
    const label = workspaceAssetRealtimeLabel(assets)
    showWorkspaceNotice(`다른 멤버가 ${label}을 첨부했습니다.`, 'info', {
      actionLabel: '첨부 보기',
      onAction: () => openWorkspaceRealtimeAssetNotice(assets[0]),
    })
    return
  }

  if (payload.action === 'DELETE') {
    const label = workspaceAssetRealtimeLabel([], deletedIds)
    showWorkspaceNotice(`다른 멤버가 ${label}을 삭제했습니다.`, 'info', {
      actionLabel: '첨부 보기',
      onAction: () => openWorkspaceRealtimeAssetNotice(),
    })
  }
}

// ─── 에셋 실시간 이벤트 ───────────────────────────────────────────────────────
const handleWorkspaceAssetRealtimeEvent = (payload = {}) => {
  if (Number(payload.workspaceIdx || 0) !== Number(workspaceId.value || 0)) return
  if (payload.action === 'UPSERT' || payload.action === 'UPLOAD') {
    const normalizedAssets = (Array.isArray(payload.assets) ? payload.assets : []).map(normalizeWorkspaceAsset)
    mergeWorkspaceAssets(normalizedAssets)
    notifyWorkspaceAssetRealtimeEvent(payload, normalizedAssets)
    return
  }
  if (payload.action === 'DELETE') {
    const assetIdxList = Array.isArray(payload.assetIdxList) ? payload.assetIdxList : []
    removeWorkspaceAssets(assetIdxList)
    notifyWorkspaceAssetRealtimeEvent(payload, [], assetIdxList)
    return
  }
  refreshWorkspaceAssets(workspaceId.value).catch(() => {})
}

const handleWorkspaceCommentRealtimeEvent = (payload = {}) => {
  if (Number(payload.workspaceIdx || 0) !== Number(workspaceId.value || 0)) return
  if (payload.action === 'UPSERT' && payload.comment) {
    const normalizedComment = normalizeWorkspaceComment(payload.comment)
    const previousComment = workspaceComments.value.find((comment) =>
      String(comment.id) === String(normalizedComment.id),
    )
    upsertWorkspaceComment(payload.comment)
    notifyWorkspaceCommentRealtimeEvent(payload, normalizedComment, previousComment)
    return
  }
  if (payload.action === 'DELETE') {
    const previousComment = workspaceComments.value.find((comment) =>
      String(comment.id) === String(payload.commentIdx),
    )
    removeWorkspaceComment(payload.commentIdx)
    notifyWorkspaceCommentRealtimeEvent(payload, previousComment, previousComment)
    return
  }
  refreshWorkspaceComments(workspaceId.value).catch(() => {})
}

// ─── STOMP 연결 / 해제 ────────────────────────────────────────────────────────
const disconnectWorkspaceAssetRealtime = () => {
  connectedWorkspaceAssetRoomId = null
  const client = workspaceAssetStompClient
  workspaceAssetStompClient = null
  if (!client) return
  try {
    if (client.connected) {
      client.disconnect(() => {})
    } else if (client.ws?.readyState === WebSocket.OPEN) {
      client.ws.close()
    }
  } catch (error) {
    console.error('Workspace asset realtime disconnect failed:', error)
  }
}

const connectWorkspaceAssetRealtime = (targetWorkspaceId = workspaceId.value) => {
  const normalizedWorkspaceId = Number(targetWorkspaceId || 0)
  const accessToken = authStore.token || localStorage.getItem('ACCESS_TOKEN')

  if (!normalizedWorkspaceId || !accessToken) {
    disconnectWorkspaceAssetRealtime()
    return
  }

  if (
    workspaceAssetStompClient &&
    connectedWorkspaceAssetRoomId === normalizedWorkspaceId &&
    workspaceAssetStompClient.connected
  ) return

  disconnectWorkspaceAssetRealtime()

  const socket      = new SockJS(apiPath('/ws-stomp'))
  const stompClient = Stomp.over(socket)
  stompClient.debug = null

  workspaceAssetStompClient = stompClient
  stompClient.connect(
    { Authorization: `Bearer ${accessToken}` },
    () => {
      if (workspaceAssetStompClient !== stompClient) {
        stompClient.disconnect(() => {})
        return
      }
      connectedWorkspaceAssetRoomId = normalizedWorkspaceId
      stompClient.subscribe(`/sub/workspace/assets/${normalizedWorkspaceId}`, (message) => {
        try {
          const payload = JSON.parse(message.body)
          handleWorkspaceAssetRealtimeEvent(payload)
        } catch (error) {
          console.error('Workspace asset realtime payload parse failed:', error)
          refreshWorkspaceAssets(normalizedWorkspaceId).catch(() => {})
        }
      })
      stompClient.subscribe(`/sub/workspace/comments/${normalizedWorkspaceId}`, (message) => {
        try {
          const payload = JSON.parse(message.body)
          handleWorkspaceCommentRealtimeEvent(payload)
        } catch (error) {
          console.error('Workspace comment realtime payload parse failed:', error)
          refreshWorkspaceComments(normalizedWorkspaceId).catch(() => {})
        }
      })
    },
    (error) => {
      if (workspaceAssetStompClient === stompClient) {
        console.error('Workspace asset realtime connection failed:', error)
      }
    },
  )
}

// ─── 에셋 새로고침 ────────────────────────────────────────────────────────────
const refreshWorkspaceAssets = async (targetWorkspaceId = workspaceId.value) => {
  if (!targetWorkspaceId) {
    workspaceAssets.value     = []
    workspaceAssetError.value = ''
    return []
  }
  workspaceAssetLoading.value = true
  workspaceAssetError.value   = ''
  try {
    const result = await postApi.getWorkspaceAssets(targetWorkspaceId)
    workspaceAssets.value = (Array.isArray(result) ? result : []).map(normalizeWorkspaceAsset)
    return workspaceAssets.value
  } catch (error) {
    workspaceAssetError.value =
      error?.response?.data?.message || error?.message || '워크스페이스 첨부 파일을 불러오지 못했습니다.'
    workspaceAssets.value = []
    return []
  } finally {
    workspaceAssetLoading.value = false
  }
}

// ─── 저장 ─────────────────────────────────────────────────────────────────────
const persistWorkspace = async ({ navigateNewDocument = false } = {}) => {
  if (!editorApi.value?.savePost || isSaving.value) return null
  saveState.value = 'saving'
  saveError.value = ''

  try {
    const response         = await editorApi.value.savePost()
    const savedWorkspaceId = response?.result?.body?.idx ?? response?.data?.idx ?? response?.idx ?? null
    if (!savedWorkspaceId) throw new Error('워크스페이스 저장 결과를 확인할 수 없습니다.')

    titleDirty.value = false
    editorApi.value?.markSaved?.()
    workspaceId.value         = Number(savedWorkspaceId)
    workspaceAccessRole.value = workspaceAccessRole.value || 'ADMIN'
    if (response?.status !== undefined || response?.type !== undefined) {
      workspaceShareStatus.value = normalizeWorkspaceShareStatus(response?.status, response?.type)
    }
    workspaceUuid.value        = response?.uuid || workspaceUuid.value
    lastSavedAt.value         = new Date().toISOString()
    saveState.value           = 'saved'

    await refreshWorkspaceDocuments()
    void refreshWorkspaceRevisions(savedWorkspaceId)

    if (
      navigateNewDocument &&
      String(route.params.id || '') !== String(savedWorkspaceId)
    ) {
      allowRouteLeaveOnce.value = true
      await router.replace(`/workspace/read/${savedWorkspaceId}`)
    }

    return savedWorkspaceId
  } catch (error) {
    saveError.value = error?.message || '워크스페이스 저장에 실패했습니다.'
    saveState.value = 'error'
    throw error
  }
}

const refreshWorkspaceShareState = async () => {
  if (!workspaceId.value) return null
  const data = await postApi.getPost(workspaceId.value)
  workspaceShareStatus.value = normalizeWorkspaceShareStatus(data?.status, data?.type)
  workspaceUuid.value = data?.uuid || workspaceUuid.value || ''
  workspaceAccessRole.value = data?.accessRole || data?.level || workspaceAccessRole.value
  await refreshWorkspaceDocuments()
  await refreshWorkspaceMembers(data?.idx || workspaceId.value)
  return data
}

const openWorkspaceShare = async () => {
  if (!canManageWorkspaceShare.value || isEditorLoading.value) return

  try {
    if (!workspaceId.value || hasUnsavedChanges.value) {
      await persistWorkspace({ navigateNewDocument: true })
    }
    await refreshWorkspaceShareState()
    showWorkspaceShareModal.value = true
  } catch (error) {
    showWorkspaceNotice(error?.message || '공유 설정을 열기 전에 문서를 저장하지 못했습니다.', 'error')
  }
}

const handleWorkspaceShareRefresh = async () => {
  try {
    await refreshWorkspaceShareState()
  } catch (error) {
    console.error('Workspace share state refresh failed:', error)
  }
}

const refreshWorkspaceMembers = async (targetWorkspaceId = workspaceId.value) => {
  if (!targetWorkspaceId || !canManageWorkspaceShare.value) {
    workspaceMembers.value = []
    workspaceMemberError.value = ''
    workspaceMemberRefreshedAt.value = null
    return []
  }

  workspaceMemberLoading.value = true
  workspaceMemberError.value = ''
  try {
    const result = await postApi.loadRole(targetWorkspaceId)
    workspaceMembers.value = (Array.isArray(result) ? result : []).map(normalizeWorkspaceMember)
    workspaceMemberRefreshedAt.value = new Date().toISOString()
    return workspaceMembers.value
  } catch (error) {
    workspaceMembers.value = []
    workspaceMemberRefreshedAt.value = null
    workspaceMemberError.value =
      error?.response?.data?.message || error?.message || '멤버 목록을 불러오지 못했습니다.'
    return []
  } finally {
    workspaceMemberLoading.value = false
  }
}

const focusWorkspaceCommentComposer = async () => {
  if (!canCommentOnWorkspace.value) return
  activeWorkspacePanelTab.value = 'review'
  workspaceCommentFilter.value = 'open'
  await nextTick()
  workspaceCommentInput.value?.focus()
  workspaceCommentInput.value?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
}

const focusWorkspaceMentionComments = async (comment = null) => {
  isWorkspacePanelCollapsed.value = false
  activeWorkspacePanelTab.value = 'review'
  workspaceCommentFilter.value = 'mentions'
  await nextTick()
  if (comment?.anchorBlockId) {
    await editorApi.value?.focusBlockAnchor?.(comment.anchorBlockId)
  }
}

const insertWorkspaceMention = async (candidate) => {
  const email = String(candidate?.email || '').trim()
  if (!email) return
  const mention = `@${email} `
  const textarea = workspaceCommentInput.value

  if (!textarea) {
    newWorkspaceComment.value = `${newWorkspaceComment.value}${newWorkspaceComment.value.endsWith(' ') || !newWorkspaceComment.value ? '' : ' '}${mention}`
    showWorkspaceMentionMenu.value = false
    return
  }

  const start = textarea.selectionStart ?? newWorkspaceComment.value.length
  const end = textarea.selectionEnd ?? start
  const prefix = newWorkspaceComment.value.slice(0, start)
  const suffix = newWorkspaceComment.value.slice(end)
  const spacer = prefix && !/\s$/.test(prefix) ? ' ' : ''
  const nextValue = `${prefix}${spacer}${mention}${suffix}`
  const nextCaret = prefix.length + spacer.length + mention.length
  newWorkspaceComment.value = nextValue
  showWorkspaceMentionMenu.value = false
  await nextTick()
  textarea.focus()
  textarea.setSelectionRange(nextCaret, nextCaret)
}

const applyWorkspaceBlockCommentSummaries = () => {
  editorApi.value?.applyBlockCommentSummaries?.(workspaceBlockCommentSummaries.value)
}

const handleEditorBlockCommentBadgeClick = async (anchor) => {
  if (!anchor?.anchorBlockId) return
  isWorkspacePanelCollapsed.value = false
  activeWorkspacePanelTab.value = 'review'
  workspaceCommentFilter.value = 'block'
  await nextTick()
  editorApi.value?.focusBlockAnchor?.(anchor.anchorBlockId)
}

const refreshWorkspaceComments = async (targetWorkspaceId = workspaceId.value) => {
  if (!targetWorkspaceId) {
    workspaceComments.value = []
    workspaceCommentError.value = ''
    return []
  }
  workspaceCommentLoading.value = true
  workspaceCommentError.value = ''
  try {
    const result = await postApi.getWorkspaceComments(targetWorkspaceId)
    workspaceComments.value = (Array.isArray(result) ? result : []).map(normalizeWorkspaceComment)
    return workspaceComments.value
  } catch (error) {
    workspaceCommentError.value =
      error?.response?.data?.message || error?.message || '댓글을 불러오지 못했습니다.'
    workspaceComments.value = []
    return []
  } finally {
    workspaceCommentLoading.value = false
  }
}

const refreshWorkspaceRevisions = async (targetWorkspaceId = workspaceId.value) => {
  if (!targetWorkspaceId) {
    workspaceRevisions.value = []
    activeWorkspaceRevision.value = null
    workspaceRevisionDiff.value = null
    workspaceRevisionError.value = ''
    return []
  }

  workspaceRevisionLoading.value = true
  workspaceRevisionError.value = ''
  try {
    const result = await postApi.getWorkspaceRevisions(targetWorkspaceId)
    workspaceRevisions.value = (Array.isArray(result) ? result : []).map(normalizeWorkspaceRevision)
    if (
      activeWorkspaceRevision.value?.id &&
      !workspaceRevisions.value.some((revision) => String(revision.id) === String(activeWorkspaceRevision.value.id))
    ) {
      activeWorkspaceRevision.value = null
      workspaceRevisionDiff.value = null
    }
    return workspaceRevisions.value
  } catch (error) {
    workspaceRevisionError.value =
      error?.response?.data?.message || error?.message || '문서 기록을 불러오지 못했습니다.'
    workspaceRevisions.value = []
    activeWorkspaceRevision.value = null
    workspaceRevisionDiff.value = null
    return []
  } finally {
    workspaceRevisionLoading.value = false
  }
}

const previewWorkspaceRevision = async (revision) => {
  const revisionId = revision?.id
  if (!workspaceId.value || !revisionId || workspaceRevisionPreviewLoading.value) return
  workspaceRevisionPreviewLoading.value = String(revisionId)
  workspaceRevisionError.value = ''
  try {
    const result = await postApi.getWorkspaceRevision(workspaceId.value, revisionId)
    activeWorkspaceRevision.value = normalizeWorkspaceRevision({
      ...revision,
      ...result,
    })
    workspaceRevisionDiff.value = await buildWorkspaceRevisionDiff(activeWorkspaceRevision.value)
  } catch (error) {
    workspaceRevisionError.value =
      error?.response?.data?.message || error?.message || '선택한 기록을 불러오지 못했습니다.'
  } finally {
    workspaceRevisionPreviewLoading.value = ''
  }
}

const restoreWorkspaceRevision = async (revision = activeWorkspaceRevision.value) => {
  const revisionId = revision?.id
  if (!revisionId || !workspaceId.value || !canModifyWorkspacePage.value || workspaceRevisionRestoring.value) return
  const warning = hasUnsavedChanges.value
    ? '저장되지 않은 편집 내용이 있습니다. 선택한 기록으로 복구하면 현재 편집 내용이 바뀝니다. 계속할까요?'
    : '선택한 기록으로 현재 문서를 복구할까요? 복구 작업도 새 기록으로 남습니다.'
  requestWorkspaceConfirm({
    title: '기록 복구',
    message: warning,
    confirmLabel: '복구',
    tone: hasUnsavedChanges.value ? 'danger' : 'warn',
    onConfirm: async () => {
      workspaceRevisionRestoring.value = String(revisionId)
      workspaceRevisionError.value = ''
      try {
        const restored = await postApi.restoreWorkspaceRevision(workspaceId.value, revisionId)
        title.value = restored?.title || title.value
        titleDirty.value = false
        editorApi.value?.updateTitleFromLocal?.(title.value)
        if (editorApi.value?.applyDocumentTemplate) {
          await editorApi.value.applyDocumentTemplate(restored?.contents || '', { markSaved: true })
        }
        applyWorkspaceProperties(extractWorkspacePropertiesFromContents(restored?.contents))
        applyWorkspaceParentPage(extractWorkspaceParentFromContents(restored?.contents))
        editorApi.value?.markSaved?.()
        workspaceAccessRole.value = restored?.accessRole || restored?.level || workspaceAccessRole.value
        workspaceShareStatus.value = normalizeWorkspaceShareStatus(restored?.status, restored?.type)
        workspaceUuid.value = restored?.uuid || workspaceUuid.value
        saveState.value = 'saved'
        lastSavedAt.value = new Date().toISOString()
        activeWorkspaceRevision.value = null
        workspaceRevisionDiff.value = null
        await refreshWorkspaceRevisions(workspaceId.value)
        await refreshWorkspaceDocuments()
        showWorkspaceNotice('선택한 기록으로 복구했습니다.', 'success')
      } catch (error) {
        workspaceRevisionError.value =
          error?.response?.data?.message || error?.message || '문서를 복구하지 못했습니다.'
        showWorkspaceNotice(workspaceRevisionError.value, 'error')
      } finally {
        workspaceRevisionRestoring.value = ''
      }
    },
  })
}

const upsertWorkspaceComment = (comment) => {
  const normalized = normalizeWorkspaceComment(comment)
  if (normalized.id == null) return
  const next = workspaceComments.value.filter((item) => String(item.id) !== String(normalized.id))
  workspaceComments.value = [normalized, ...next].sort((left, right) => {
    if (left.resolved !== right.resolved) return left.resolved ? 1 : -1
    return new Date(right.createdAt || right.updatedAt || 0).getTime() - new Date(left.createdAt || left.updatedAt || 0).getTime()
  })
}

const createWorkspaceComment = async () => {
  const contents = newWorkspaceComment.value.trim()
  if (!contents || workspaceCommentSaving.value || !canCommentOnWorkspace.value) return
  workspaceCommentSaving.value = true
  workspaceCommentError.value = ''
  try {
    const targetWorkspaceId = await ensureWorkspacePersisted({ navigate: true })
    const anchor = await editorApi.value?.captureCurrentBlockAnchor?.()
    const created = await postApi.createWorkspaceComment(targetWorkspaceId, {
      contents,
      anchorBlockId: anchor?.anchorBlockId || null,
      anchorBlockType: anchor?.anchorBlockType || null,
      anchorText: anchor?.anchorText || null,
    })
    upsertWorkspaceComment(created)
    if (anchor?.anchorBlockId) {
      workspaceCommentFilter.value = 'block'
    }
    newWorkspaceComment.value = ''
  } catch (error) {
    workspaceCommentError.value =
      error?.response?.data?.message || error?.message || '댓글을 저장하지 못했습니다.'
  } finally {
    workspaceCommentSaving.value = false
  }
}

const isWorkspaceCommentAuthor = (comment = {}) => {
  const authorEmail = String(comment.authorEmail || '').toLowerCase()
  const authorIdx = comment.authorIdx == null ? '' : String(comment.authorIdx)
  const currentIdx = currentUserIdx.value == null ? '' : String(currentUserIdx.value)
  return Boolean(
    (authorEmail && authorEmail === currentUserEmail.value) ||
    (authorIdx && currentIdx && authorIdx === currentIdx),
  )
}

const canEditWorkspaceComment = (comment = {}) =>
  Boolean(comment?.id && workspaceId.value && canCommentOnWorkspace.value && (canManageWorkspaceShare.value || isWorkspaceCommentAuthor(comment)))

const isWorkspaceCommentEditing = (comment) =>
  Boolean(comment?.id && workspaceCommentEditingId.value === String(comment.id))

const startWorkspaceCommentEdit = (comment) => {
  if (!canEditWorkspaceComment(comment)) return
  workspaceCommentEditingId.value = String(comment.id)
  workspaceCommentEditDraft.value = comment.contents || ''
  workspaceCommentError.value = ''
}

const cancelWorkspaceCommentEdit = () => {
  workspaceCommentEditingId.value = ''
  workspaceCommentEditDraft.value = ''
}

const updateWorkspaceComment = async (comment) => {
  if (!canEditWorkspaceComment(comment) || !isWorkspaceCommentEditing(comment)) return
  const contents = workspaceCommentEditDraft.value.trim()
  if (!contents) {
    workspaceCommentError.value = '댓글 내용을 입력해주세요.'
    return
  }
  if (contents === String(comment.contents || '').trim()) {
    cancelWorkspaceCommentEdit()
    return
  }

  updatingCommentIds.value = [...updatingCommentIds.value, comment.id]
  workspaceCommentError.value = ''
  try {
    const updated = await postApi.updateWorkspaceComment(workspaceId.value, comment.id, contents)
    upsertWorkspaceComment(updated)
    cancelWorkspaceCommentEdit()
  } catch (error) {
    workspaceCommentError.value =
      error?.response?.data?.message || error?.message || '댓글을 수정하지 못했습니다.'
  } finally {
    updatingCommentIds.value = updatingCommentIds.value.filter((id) => id !== comment.id)
  }
}

const toggleWorkspaceCommentResolved = async (comment) => {
  if (!comment?.id || !workspaceId.value) return
  resolvingCommentIds.value = [...resolvingCommentIds.value, comment.id]
  workspaceCommentError.value = ''
  try {
    const updated = await postApi.resolveWorkspaceComment(workspaceId.value, comment.id, !comment.resolved)
    upsertWorkspaceComment(updated)
  } catch (error) {
    workspaceCommentError.value =
      error?.response?.data?.message || error?.message || '댓글 상태를 변경하지 못했습니다.'
  } finally {
    resolvingCommentIds.value = resolvingCommentIds.value.filter((id) => id !== comment.id)
  }
}

const deleteWorkspaceComment = async (comment) => {
  if (!comment?.id || !workspaceId.value) return
  deletingCommentIds.value = [...deletingCommentIds.value, comment.id]
  workspaceCommentError.value = ''
  try {
    await postApi.deleteWorkspaceComment(workspaceId.value, comment.id)
    workspaceComments.value = workspaceComments.value.filter((item) => item.id !== comment.id)
    if (workspaceCommentEditingId.value === String(comment.id)) cancelWorkspaceCommentEdit()
  } catch (error) {
    workspaceCommentError.value =
      error?.response?.data?.message || error?.message || '댓글을 삭제하지 못했습니다.'
  } finally {
    deletingCommentIds.value = deletingCommentIds.value.filter((id) => id !== comment.id)
  }
}

const isCommentResolving = (commentId) => resolvingCommentIds.value.includes(commentId)
const isCommentDeleting = (commentId) => deletingCommentIds.value.includes(commentId)
const isCommentUpdating = (commentId) => updatingCommentIds.value.includes(commentId)

const clearWorkspaceCommentAnchor = () => {
  editorApi.value?.clearSelectedBlockAnchor?.()
  if (workspaceCommentFilter.value === 'block') {
    workspaceCommentFilter.value = 'open'
  }
}

const focusWorkspaceCommentAnchor = async (comment) => {
  if (!comment?.anchorBlockId) return
  await editorApi.value?.focusBlockAnchor?.(comment.anchorBlockId)
}

const focusWorkspaceOutlineItem = async (item) => {
  if (!item?.anchorBlockId) return
  await editorApi.value?.focusBlockAnchor?.(item.anchorBlockId)
}

const focusWorkspaceTaskItem = async (task) => {
  if (!task?.anchorBlockId) return
  await editorApi.value?.focusBlockAnchor?.(task.anchorBlockId)
}

const focusWorkspaceInboxTask = async (task) => {
  if (!task?.documentId) return
  if (String(task.documentId) === currentWorkspaceKey.value) {
    await focusWorkspaceTaskItem(task)
    return
  }
  await openWorkspaceDocument(task.document || { id: task.documentId, title: task.documentTitle })
}

const openWorkspaceCalendarItem = async (item) => {
  if (!item) return
  if (item.type === 'task') {
    await focusWorkspaceInboxTask(item.task)
    return
  }
  await openWorkspaceDocument(item.document)
}

const openWorkspaceHomeMetric = (card) => {
  if (!card?.panel) return
  isWorkspacePanelCollapsed.value = false
  activeWorkspacePanelTab.value = card.panel
}

const openWorkspaceHomeQueueItem = async (item) => {
  if (!item) return
  if (item.type === 'task') {
    await focusWorkspaceInboxTask(item.task)
    return
  }
  await openWorkspaceDocument(item.page)
}

const openWorkspaceHomeAttentionItem = async (item) => {
  if (!item) return
  if (item.comment) {
    await focusWorkspaceMentionComments(item.comment)
    return
  }
  if (item.item) {
    await openWorkspaceCalendarItem(item.item)
    return
  }
  if (item.task) {
    await focusWorkspaceInboxTask(item.task)
    return
  }
  if (item.page) {
    await openWorkspaceDocument(item.page)
  }
}

const focusWorkspaceLinkedDocumentSource = async (document) => {
  if (!document?.linkAnchorBlockId) return
  await editorApi.value?.focusBlockAnchor?.(document.linkAnchorBlockId)
}

const isWorkspaceTaskToggling = (task) =>
  Boolean(task?.id) && togglingWorkspaceTaskIds.value.includes(task.id)

const isWorkspaceInboxTaskToggling = (task) =>
  Boolean(task?.id) && togglingWorkspaceInboxTaskIds.value.includes(task.id)

const setWorkspaceInboxTaskToggling = (task, busy) => {
  const id = String(task?.id || '')
  if (!id) return
  togglingWorkspaceInboxTaskIds.value = busy
    ? [...new Set([...togglingWorkspaceInboxTaskIds.value, id])]
    : togglingWorkspaceInboxTaskIds.value.filter((item) => item !== id)
}

const toggleWorkspaceTaskItem = async (task) => {
  if (!task?.id || !canModifyWorkspacePage.value || isWorkspaceTaskToggling(task)) return

  togglingWorkspaceTaskIds.value = [...togglingWorkspaceTaskIds.value, task.id]
  try {
    const toggled = await editorApi.value?.toggleChecklistTask?.(task)
    if (!toggled) {
      await focusWorkspaceTaskItem(task)
    }
  } catch (error) {
    console.error('Workspace task toggle failed:', error)
  } finally {
    togglingWorkspaceTaskIds.value = togglingWorkspaceTaskIds.value.filter((id) => id !== task.id)
  }
}

const toggleWorkspaceInboxTask = async (task) => {
  const documentId = task?.documentId
  if (!task?.id || !documentId || isWorkspaceInboxTaskToggling(task)) return
  const role = String(task.documentRole || task.document?.accessRole || task.document?.role || 'READ').toUpperCase()
  if (!task.canToggle && !['ADMIN', 'WRITE'].includes(role)) return

  setWorkspaceInboxTaskToggling(task, true)
  try {
    if (String(documentId) === currentWorkspaceKey.value) {
      const toggled = await editorApi.value?.toggleChecklistTask?.(task)
      if (toggled) {
        await persistWorkspace({ navigateNewDocument: false })
        await refreshWorkspacePageIndex()
      }
      return
    }

    const data = await postApi.getPost(documentId)
    const snapshot = parseWorkspaceSnapshotWithMeta(data?.contents)
    const item = resolveWorkspaceSnapshotTaskItem(snapshot.blocks, task)
    if (!item) throw new Error('작업 위치를 찾을 수 없습니다.')

    item.meta = {
      ...(item.meta || {}),
      checked: !task.checked,
    }
    if (Object.prototype.hasOwnProperty.call(item, 'checked')) {
      item.checked = !task.checked
    }
    if (item.data && typeof item.data === 'object' && Object.prototype.hasOwnProperty.call(item.data, 'checked')) {
      item.data.checked = !task.checked
    }

    await postApi.savePost({
      idx: documentId,
      title: data?.title || task.documentTitle || '제목 없음',
      contents: JSON.stringify(snapshot),
    })
    await refreshWorkspaceDocuments()
    await refreshWorkspacePageIndex()
  } catch (error) {
    console.error('Workspace inbox task toggle failed:', error)
    showWorkspaceNotice(error?.message || '작업 상태를 변경하지 못했습니다.', 'error')
  } finally {
    setWorkspaceInboxTaskToggling(task, false)
  }
}

const toggleWorkspaceCalendarTask = async (item) => {
  if (item?.type !== 'task' || !item.task) return
  await toggleWorkspaceInboxTask(item.task)
}

const addWorkspaceTask = async () => {
  const text = newWorkspaceTask.value.trim()
  if (!text || !canModifyWorkspacePage.value || workspaceTaskAdding.value) return

  workspaceTaskAdding.value = true
  try {
    const assignee = selectedWorkspaceTaskAssignee.value
    const added = await editorApi.value?.appendChecklistTask?.({
      text,
      assigneeEmail: assignee?.email || '',
      assigneeName: assignee?.name || '',
      dueDate: newWorkspaceTaskDueDate.value || '',
    })
    if (added) {
      newWorkspaceTask.value = ''
      return
    }

    showWorkspaceNotice('작업 항목을 추가하지 못했습니다.', 'error')
  } catch (error) {
    console.error('Workspace task append failed:', error)
    showWorkspaceNotice(error?.message || '작업 항목을 추가하지 못했습니다.', 'error')
  } finally {
    workspaceTaskAdding.value = false
  }
}

const insertWorkspaceQuickBlock = async (block, options = {}) => {
  if (!block?.id || !canInsertWorkspaceQuickBlock.value || workspaceQuickBlockAdding.value) return
  const blockText = options.text ?? workspaceQuickBlockText.value
  workspaceQuickBlockAdding.value = block.id
  try {
    const inserted = await editorApi.value?.appendWorkspaceBlock?.({
      type: block.id,
      text: blockText,
      level: block.id === 'header' ? 2 : undefined,
    })
    if (inserted) {
      if (typeof options.onInserted === 'function') {
        options.onInserted()
      } else {
        workspaceQuickBlockText.value = ''
      }
      if (options.revealOutline !== false) {
        activeWorkspacePanelTab.value = 'outline'
      }
      return
    }
    showWorkspaceNotice('블록을 삽입하지 못했습니다.', 'error')
  } catch (error) {
    console.error('Workspace quick block insert failed:', error)
    showWorkspaceNotice(error?.message || '블록을 삽입하지 못했습니다.', 'error')
  } finally {
    workspaceQuickBlockAdding.value = ''
  }
}

const insertWorkspaceInlineQuickBlock = async (block) => {
  await insertWorkspaceQuickBlock(block, {
    text: workspaceInlineQuickBlockText.value,
    revealOutline: false,
    onInserted: () => {
      workspaceInlineQuickBlockText.value = ''
    },
  })
}

const workspaceMemberActionKey = (member, action) =>
  `${action}:${member?.userIdx ?? member?.idx ?? member?.id ?? 'unknown'}`

const isWorkspaceMemberBusy = (member) => {
  const userIdx = member?.userIdx ?? member?.idx ?? member?.id ?? null
  return Boolean(userIdx) && workspaceMemberActionLoading.value.endsWith(`:${userIdx}`)
}

const handleWorkspaceMemberRoleSelect = async (member, event) => {
  const nextRole = event?.target?.value
  if (!nextRole || nextRole === member?.role) return
  await handleRoleAction(member, nextRole)
}

const toggleWorkspacePageLock = () => {
  if (!canEditWorkspace.value) return
  const nextLocked = !workspacePageLocked.value
  workspacePageLocked.value = nextLocked
  if (nextLocked) {
    editorApi.value?.clearSelectedBlockAnchor?.()
    if (typeof document !== 'undefined' && typeof document.activeElement?.blur === 'function') {
      document.activeElement.blur()
    }
  }
}

const handleSave = async () => {
  try {
    await persistWorkspace({ navigateNewDocument: true })
  } catch (error) {
    console.error('Workspace save failed:', error)
  }
}

const handleTitleInput = (event) => {
  if (!canModifyWorkspacePage.value) return
  const nextTitle = event?.target?.value ?? ''
  title.value = nextTitle
  titleDirty.value = true
  scheduleAutoSave()
  editorApi.value?.updateTitleFromLocal?.(nextTitle)
}

const buildWorkspaceTemplateData = (template) => {
  const timestamp = Date.now()
  return {
    time: timestamp,
    blocks: (template?.blocks || []).map((block, index) => ({
      ...JSON.parse(JSON.stringify(block)),
      id: `template-${template.id}-${timestamp}-${index}`,
    })),
  }
}

const applyWorkspaceTemplate = async (template) => {
  if (!template || !canModifyWorkspacePage.value || !editorApi.value?.applyDocumentTemplate || workspaceTemplateApplying.value) return
  workspaceTemplateApplying.value = template.id
  try {
    const nextTitle = template.titleValue || template.title || '새 페이지'
    title.value = nextTitle
    titleDirty.value = true
    editorApi.value.updateTitleFromLocal?.(nextTitle)
    await editorApi.value.applyDocumentTemplate(buildWorkspaceTemplateData(template))
    workspaceTemplateApplied.value = true
    activeWorkspacePanelTab.value = 'outline'
  } catch (error) {
    showWorkspaceNotice(error?.message || '템플릿을 적용하지 못했습니다.', 'error')
  } finally {
    workspaceTemplateApplying.value = ''
  }
}

const openWorkspaceCommandPalette = async () => {
  isWorkspaceCommandPaletteOpen.value = true
  workspaceCommandQuery.value = ''
  workspaceCommandActiveIndex.value = 0
  await nextTick()
  workspaceCommandInput.value?.focus()
}

const closeWorkspaceCommandPalette = () => {
  isWorkspaceCommandPaletteOpen.value = false
  workspaceCommandQuery.value = ''
  workspaceCommandActiveIndex.value = 0
}

const moveWorkspaceCommandSelection = (direction) => {
  const count = workspaceCommandItems.value.length
  if (!count) return
  workspaceCommandActiveIndex.value =
    (workspaceCommandActiveIndex.value + direction + count) % count
}

const executeWorkspaceCommand = async (item = workspaceCommandActiveItem.value) => {
  if (!item) return
  closeWorkspaceCommandPalette()

  if (item.type === 'document') {
    await openWorkspaceDocument(item.document)
    return
  }

  if (item.type === 'template') {
    await applyWorkspaceTemplate(item.template)
    return
  }

  if (item.type === 'block') {
    await insertWorkspaceQuickBlock(item.block)
    return
  }

  if (item.type === 'panel') {
    isWorkspacePanelCollapsed.value = false
    activeWorkspacePanelTab.value = item.panelId
    return
  }

  if (item.action === 'new') {
    await createWorkspaceDocument()
    return
  }
  if (item.action === 'save') {
    await handleSave()
    return
  }
  if (item.action === 'lock') {
    toggleWorkspacePageLock()
    return
  }
  if (item.action === 'favorite-current') {
    toggleCurrentWorkspaceDocumentFavorite()
    return
  }
  if (item.action === 'share') {
    await openWorkspaceShare()
    return
  }
  if (item.action === 'export-markdown') {
    await exportWorkspaceMarkdown()
    return
  }
  if (item.action === 'subpage') {
    await focusWorkspaceSubpageComposer()
    return
  }
  if (item.action === 'parent') {
    await openWorkspaceParentPage()
    return
  }
  if (item.action === 'mentions') {
    await focusWorkspaceMentionComments()
  }
}

const handleWorkspaceGlobalKeydown = (event) => {
  const key = String(event.key || '').toLowerCase()
  if ((event.ctrlKey || event.metaKey) && key === 'k') {
    event.preventDefault()
    void openWorkspaceCommandPalette()
    return
  }

  if (isWorkspaceCommandPaletteOpen.value && key === 'escape') {
    event.preventDefault()
    closeWorkspaceCommandPalette()
  }
}

// ─── 권한 변경 (드롭다운) ────────────────────────────────────────────────────
const handleRoleAction = async (user, action) => {
  openRoleDropdownId.value = null
  const targetUserIdx = user?.userIdx ?? user?.idx ?? user?.id ?? null
  if (!canManageWorkspaceShare.value || !workspaceId.value || !targetUserIdx) return
  if (user?.isMe || (currentUserIdx.value != null && String(targetUserIdx) === String(currentUserIdx.value))) {
    showWorkspaceNotice('자신의 권한은 이 화면에서 변경할 수 없습니다.', 'warn')
    return
  }

  const runRoleAction = async () => {
    workspaceMemberActionLoading.value = workspaceMemberActionKey({ userIdx: targetUserIdx }, action)
    try {
      if (action === 'KICKED') {
        await postApi.kickUser(workspaceId.value, targetUserIdx)
      } else {
        await postApi.changeUserRole(workspaceId.value, targetUserIdx, action)
      }
      await refreshWorkspaceMembers(workspaceId.value)
      showWorkspaceNotice(
        action === 'KICKED' ? '멤버를 추방했습니다.' : '멤버 권한을 변경했습니다.',
        'success',
      )
    } catch (e) {
      showWorkspaceNotice(e?.response?.data?.message || e?.message || '권한 변경에 실패했습니다.', 'error')
    } finally {
      workspaceMemberActionLoading.value = ''
    }
  }

  if (action === 'KICKED') {
    requestWorkspaceConfirm({
      title: '멤버 추방',
      message: `${user.name || '이 멤버'} 님을 추방하시겠습니까?`,
      confirmLabel: '추방',
      tone: 'danger',
      onConfirm: runRoleAction,
    })
    return
  }

  await runRoleAction()
}

// ─── SSE role-changed 핸들러 ────────────────────────────────────────────────
// 현재 보고 있는 페이지와 같은 워크스페이스일 때만 처리
const handleSseRoleChanged = (evt) => {
  const { postIdx, newRole } = evt?.detail || {}
  if (!postIdx) return

  // 현재 내가 보고 있는 워크스페이스가 아니면 무시
  if (Number(postIdx) !== Number(workspaceId.value)) return

  if (newRole === 'KICKED') {
    showWorkspaceNotice('해당 워크스페이스에서 추방되었습니다.', 'error', { timeout: 1200 })
    allowRouteLeaveOnce.value = true
    window.setTimeout(() => {
      router.push('/workspace')
    }, 1200)
  } else {
    // 권한이 변경되면 페이지 새로고침으로 최신 권한 반영
    allowWindowUnloadOnce.value = true
    window.location.reload()
  }
}

// ─── 드롭다운 외부 클릭 시 닫기 ──────────────────────────────────────────────
const closeRoleDropdown = () => {
  openRoleDropdownId.value = null
}

// ─── 워처 ─────────────────────────────────────────────────────────────────────
const handleBeforeUnload = (event) => {
  if (allowWindowUnloadOnce.value) {
    allowWindowUnloadOnce.value = false
    return
  }

  if (!hasUnsavedChanges.value) return

  event.preventDefault()
  event.returnValue = LEAVE_WARNING_MESSAGE
  return LEAVE_WARNING_MESSAGE
}

onBeforeRouteLeave(() => {
  if (allowRouteLeaveOnce.value) {
    allowRouteLeaveOnce.value = false
    return true
  }

  if (!hasUnsavedChanges.value) return true

  return window.confirm(LEAVE_WARNING_MESSAGE)
})

onBeforeRouteUpdate(() => {
  if (allowRouteLeaveOnce.value) {
    allowRouteLeaveOnce.value = false
    return true
  }

  if (!hasUnsavedChanges.value) return true

  return window.confirm(LEAVE_WARNING_MESSAGE)
})

watch(workspaceAssets, (assets) => {
  if (!assets.some((a) => a.id === activeWorkspaceAssetId.value)) {
    activeWorkspaceAssetId.value = null
  }
})

// ─── 데이터 준비 ──────────────────────────────────────────────────────────────
const prepareData = async () => {
  const id = route.params.id
  if (!id || route.path === '/workspace') {
    return { idx: null, title: '', contents: '', type: false, status: 'Private', uuid: '', accessRole: 'ADMIN' }
  }
  if (route.meta.initialData && String(route.meta.initialData.idx) === String(id)) {
    return route.meta.initialData
  }
  try {
    const data = await postApi.getPost(id)
    return data
  } catch (error) {
    const normalizedId = Number(id)
    const isReadonlyRoute =
      route.name === 'workspace_readonly' ||
      String(route.path || '').startsWith('/workspace/readonly/')
    const isCollaborativeRoute =
      isReadonlyRoute ||
      route.name === 'workspace_read' ||
      String(route.path || '').startsWith('/workspace/read/')

    return {
      idx: Number.isFinite(normalizedId) ? normalizedId : null,
      title: '',
      contents: '',
      type: isCollaborativeRoute,
      status: isCollaborativeRoute ? 'Public' : 'Private',
      uuid: '',
      accessRole: isReadonlyRoute ? 'READ' : isCollaborativeRoute ? 'WRITE' : 'ADMIN',
    }
  }
}

// ─── 워크스페이스 자동 저장 ──────────────────────────────────────────────────
const ensureWorkspacePersisted = async ({ navigate = false } = {}) => {
  if (workspaceId.value) return workspaceId.value
  if (!editorApi.value?.savePost) throw new Error('워크스페이스를 먼저 저장할 수 없습니다.')
  const savedWorkspaceId = await persistWorkspace({ navigateNewDocument: navigate })
  if (!savedWorkspaceId) throw new Error('워크스페이스 저장에 실패했습니다.')
  return workspaceId.value
}

// ─── 파일 업로드 ──────────────────────────────────────────────────────────────
const uploadWorkspaceFiles = async (files, { autoPersist = true } = {}) => {
  const selectedFiles = Array.from(files || []).filter(Boolean)
  if (!selectedFiles.length) return []
  let targetWorkspaceId = workspaceId.value
  if (!targetWorkspaceId && autoPersist) {
    targetWorkspaceId = await ensureWorkspacePersisted({ navigate: false })
  }
  if (!targetWorkspaceId) throw new Error('워크스페이스를 먼저 저장한 뒤 업로드해 주세요.')
  workspaceAssetUploading.value = true
  workspaceAssetError.value     = ''
  try {
    const uploaded         = await postApi.uploadWorkspaceAssets(targetWorkspaceId, selectedFiles)
    const normalizedAssets = (Array.isArray(uploaded) ? uploaded : []).map(normalizeWorkspaceAsset)
    mergeWorkspaceAssets(normalizedAssets)
    if (normalizedAssets[0]?.id != null) activeWorkspaceAssetId.value = normalizedAssets[0].id
    return normalizedAssets
  } catch (error) {
    workspaceAssetError.value =
      error?.response?.data?.message || error?.message || '파일 업로드 중 오류가 발생했습니다.'
    throw error
  } finally {
    workspaceAssetUploading.value = false
  }
}

const handleEditorImageUpload = async (file) => {
  const uploadedAssets = await uploadWorkspaceFiles([file], { autoPersist: true })
  const uploadedImage  = uploadedAssets.find((a) => a.assetType === 'IMAGE') || uploadedAssets[0]
  if (!uploadedImage?.previewUrl) throw new Error('이미지 업로드 결과를 확인할 수 없습니다.')
  return uploadedImage
}

const handleAssetSelection = async (event) => {
  const files = Array.from(event.target?.files || [])
  if (!files.length) return
  try {
    await uploadWorkspaceFiles(files, { autoPersist: true })
  } catch (error) {
    console.error('Workspace asset upload failed:', error)
  } finally {
    event.target.value = ''
  }
}

const triggerImageSelect = () => {
  if (!canManageAssets.value) return
  activeWorkspacePanelTab.value = 'assets'
  imageInput.value?.click()
}
const triggerFileSelect = () => {
  if (!canManageAssets.value) return
  activeWorkspacePanelTab.value = 'assets'
  fileInput.value?.click()
}

// ─── 에셋 액션 ────────────────────────────────────────────────────────────────
const toggleWorkspaceAssetActions = (assetId) => {
  if (assetId == null) return
  activeWorkspaceAssetId.value = activeWorkspaceAssetId.value === assetId ? null : assetId
}

const handleAssetDelete = async (asset) => {
  if (!asset?.id || !workspaceId.value || !canManageAssets.value) return
  deletingAssetIds.value    = [...deletingAssetIds.value, asset.id]
  workspaceAssetError.value = ''
  try {
    await postApi.deleteWorkspaceAsset(workspaceId.value, asset.id)
    workspaceAssets.value = workspaceAssets.value.filter((item) => item.id !== asset.id)
    if (activeWorkspaceAssetId.value === asset.id) activeWorkspaceAssetId.value = null
  } catch (error) {
    workspaceAssetError.value =
      error?.response?.data?.message || error?.message || '첨부 파일을 삭제하지 못했습니다.'
  } finally {
    deletingAssetIds.value = deletingAssetIds.value.filter((id) => id !== asset.id)
  }
}

const isDeletingAsset        = (assetId) => deletingAssetIds.value.includes(assetId)
const isSavingWorkspaceAsset = (assetId) => savingWorkspaceAssetIds.value.includes(assetId)

const saveWorkspaceAssetToDrive = async (asset) => {
  if (!asset?.id || !workspaceId.value) return
  savingWorkspaceAssetIds.value = [...savingWorkspaceAssetIds.value, asset.id]
  workspaceAssetError.value     = ''
  try {
    await postApi.saveWorkspaceAssetToDrive(workspaceId.value, asset.id)
    showWorkspaceNotice('파일이 드라이브에 저장되었습니다.', 'success')
  } catch (error) {
    workspaceAssetError.value =
      error?.response?.data?.message || error?.message || '파일을 드라이브에 저장하지 못했습니다.'
    showWorkspaceNotice(workspaceAssetError.value, 'error')
  } finally {
    savingWorkspaceAssetIds.value = savingWorkspaceAssetIds.value.filter((id) => id !== asset.id)
  }
}

const downloadWorkspaceAsset = async (asset) => {
  if (!asset?.downloadUrl) return
  try {
    await downloadFileAsset(asset, asset.originalName)
  } catch {
    workspaceAssetError.value = '파일 다운로드에 실패했습니다.'
  }
}

const getWorkspaceAssetBadge = (asset) => (asset?.assetType === 'IMAGE' ? '이미지' : '파일')

// ─── 에디터 초기화 ────────────────────────────────────────────────────────────
const setupEditor = async () => {
  const setupId = ++currentSetupId
  if (!editorHolder.value) return

  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
  isEditorLoading.value = true
  saveState.value = 'idle'
  saveError.value = ''
  lastSavedAt.value = null
  allowRouteLeaveOnce.value = false
  allowWindowUnloadOnce.value = false
  const data = await prepareData()
  if (setupId !== currentSetupId) return

  // 기존 에디터를 먼저 정리하고 새 editor를 준비한다.
  if (editorApi.value) {
    try {
      if (editorApi.value.editor?.isReady) await editorApi.value.editor.isReady
      await editorApi.value.destroy()
    } catch (error) {
      console.error('Editor destroy failed:', error)
    }
    editorApi.value = null
  }

  title.value               = data.title || ''
  titleDirty.value          = false
  workspaceTemplateApplied.value = false
  workspaceTemplateApplying.value = ''
  workspaceId.value         = data.idx ? Number(data.idx) : null
  workspaceAccessRole.value = data.accessRole || data.level || 'ADMIN'
  workspaceShareStatus.value = normalizeWorkspaceShareStatus(data.status, data.type)
  workspaceUuid.value        = data.uuid || ''
  if (workspaceId.value) {
    trackRecentWorkspaceDocument({
      id: workspaceId.value,
      title: title.value || data.title || '제목 없음',
      updatedAt: data.updatedAt || null,
      role: workspaceAccessRole.value,
      scope: workspaceDocumentById.value.get(String(workspaceId.value))?.scope || 'personal',
    })
  }
  applyWorkspaceProperties(extractWorkspacePropertiesFromContents(data.contents))
  applyWorkspaceParentPage(extractWorkspaceParentFromContents(data.contents))
  showWorkspaceShareModal.value = false

  if (String(workspaceAccessRole.value).toUpperCase() === 'READ' && data.idx) {
    await router.replace(`/workspace/readonly/${data.idx}`)
    return
  }

  await refreshWorkspaceAssets(workspaceId.value)
  await refreshWorkspaceComments(workspaceId.value)
  await refreshWorkspaceRevisions(workspaceId.value)
  await refreshWorkspaceMembers(workspaceId.value)

  await nextTick()
  if (editorHolder.value) editorHolder.value.innerHTML = ''

  try {
    const isPrivate = data.status === 'Private'

    const newEditorApi = await initEditor(
      editorHolder.value,
      `notion-room-${data.idx ? data.idx : `new-${Date.now()}`}`,
      data.contents,
      data.idx ?? null,
      data.title,
      isPrivate,
      {
        uploadImage: handleEditorImageUpload,
        userRole: workspaceAccessRole.value,  // ✅ 역할 전달
        readOnly: shouldWorkspaceEditorReadOnly.value,
        currentUser: authStore.user,
        getWorkspaceProperties: () => currentWorkspaceProperties.value,
        getWorkspaceParent: () => ({
          id: workspaceParentPageId.value,
          title: workspaceParentPageTitle.value,
        }),
        onLocalChange: scheduleAutoSave,
        onBlockCommentBadgeClick: handleEditorBlockCommentBadgeClick,
      },
    )

    if (setupId !== currentSetupId) {
      if (newEditorApi.editor?.isReady) await newEditorApi.editor.isReady
      newEditorApi.destroy()
      return
    }

    editorApi.value = markRaw(newEditorApi)
    editorApi.value?.bindTitleRef?.(title)
    editorApi.value?.markSaved?.()
    applyWorkspaceBlockCommentSummaries()
  } catch (error) {
    console.error('에디터 초기화 실패:', error)
  } finally {
    if (setupId === currentSetupId) isEditorLoading.value = false
  }
}

// ─── UUID 초대 링크 처리 ──────────────────────────────────────────────────────
const checkAndRedirectUuid = async () => {
  const uuid = route.query.uuid
  if (!route.path.includes('/invite') || !uuid) return false
  try {
    const response = await postApi.getPostByUuid(uuid)
    const data     = response?.result?.body || response?.data || response
    if (data?.idx) {
      await router.replace({ name: 'workspace_read', params: { id: data.idx } })
      return true
    }
  } catch (error) {
    console.error('UUID redirect failed:', error)
  }
  await router.replace('/workspace')
  return true
}

// ─── 라이프사이클 ────────────────────────────────────────────────────────────
onMounted(async () => {
  syncTheme()
  loadWorkspacePreferencesFromLocal()
  void loadWorkspacePreferences()
  void refreshWorkspaceDocuments()
  const redirected = await checkAndRedirectUuid()
  if (!redirected) await setupEditor()

  // ✅ SSE role-changed 리스너 등록
  window.addEventListener('sse-role-changed', handleSseRoleChanged)
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('keydown', handleWorkspaceGlobalKeydown)
  // 드롭다운 외부 클릭 닫기
  window.addEventListener('click', closeRoleDropdown)
})

watch(() => route.params.id, async () => { await setupEditor() })

watch(() => route.path, async (newPath) => {
  if (newPath === '/workspace') await setupEditor()
})

watch(workspaceFavoriteStorageKey, () => {
  loadFavoriteWorkspaceDocuments()
})

watch(workspaceRecentStorageKey, () => {
  loadRecentWorkspaceDocuments()
})

watch(workspaceSectionsStorageKey, () => {
  loadWorkspaceDocumentSections()
})

watch(workspacePageIndexViewsStorageKey, () => {
  loadWorkspacePageIndexViews()
})

watch(currentUserEmail, () => {
  workspacePreferencesRemoteReady.value = false
  workspacePreferencesDirtyBeforeRemoteLoad.value = false
  loadWorkspacePreferencesFromLocal()
  void loadWorkspacePreferences()
})

watch(workspacePageIndexRows, (rows) => {
  const editableIds = new Set(rows.filter((row) => row.canEditProperties).map((row) => String(row.id)))
  const pageIds = new Set(rows.map((row) => String(row.id)))
  workspacePageIndexSelectedIds.value = workspacePageIndexSelectedIds.value.filter((id) => editableIds.has(id))
  collapsedWorkspacePageTreeIds.value = collapsedWorkspacePageTreeIds.value.filter((id) => pageIds.has(String(id)))
  if (workspaceTreeSubpageComposerParentId.value && !pageIds.has(workspaceTreeSubpageComposerParentId.value)) {
    cancelWorkspaceTreeSubpageComposer()
  }
  if (workspaceTreeRenamingId.value && !pageIds.has(workspaceTreeRenamingId.value)) {
    cancelWorkspaceTreeRename()
  }
  if (workspaceTreeMovingId.value && !pageIds.has(workspaceTreeMovingId.value)) {
    cancelWorkspaceTreeMove()
  }
})

watch(workspaceCommandQuery, () => {
  workspaceCommandActiveIndex.value = 0
})

watch(workspaceCommandItems, (items) => {
  if (!items.length) {
    workspaceCommandActiveIndex.value = 0
    return
  }
  if (workspaceCommandActiveIndex.value >= items.length) {
    workspaceCommandActiveIndex.value = items.length - 1
  }
})

watch(
  () => workspaceId.value,
  (nextWorkspaceId) => {
    connectWorkspaceAssetRealtime(nextWorkspaceId)
    void refreshWorkspaceBacklinks()
  },
  { immediate: true },
)

watch(selectedBlockAnchor, (anchor) => {
  if (!anchor?.anchorBlockId && workspaceCommentFilter.value === 'block') {
    workspaceCommentFilter.value = 'open'
  }
})

watch(
  workspaceBlockCommentSummaries,
  () => { applyWorkspaceBlockCommentSummaries() },
  { deep: true },
)

watch(
  [
    workspacePropertyIcon,
    workspacePropertyCoverColor,
    workspacePropertyStatus,
    workspacePropertyPriority,
    workspacePropertyOwnerEmail,
    workspacePropertyDueDate,
    workspacePropertyTagsInput,
    workspacePageLocked,
  ],
  () => {
    if (suppressWorkspacePropertyWatch || isEditorLoading.value || !editorApi.value) return
    editorApi.value?.markDirty?.()
    scheduleAutoSave()
  },
)

watch(shouldWorkspaceEditorReadOnly, (readOnly) => {
  void editorApi.value?.setReadOnly?.(readOnly)
})

onBeforeUnmount(async () => {
  disconnectWorkspaceAssetRealtime()
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
  if (workspaceDocumentLinkCopyTimer) {
    clearTimeout(workspaceDocumentLinkCopyTimer)
    workspaceDocumentLinkCopyTimer = null
  }
  clearWorkspaceNoticeTimer()
  closeWorkspaceConfirm()
  if (workspacePreferencesSaveTimer.value) {
    clearTimeout(workspacePreferencesSaveTimer.value)
    workspacePreferencesSaveTimer.value = null
  }

  // ✅ SSE role-changed 리스너 해제
  window.removeEventListener('sse-role-changed', handleSseRoleChanged)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', handleWorkspaceGlobalKeydown)
  window.removeEventListener('click', closeRoleDropdown)

  if (editorApi.value?.destroy) {
    if (editorApi.value.editor?.isReady) await editorApi.value.editor.isReady
    await editorApi.value.destroy()
  }
})
</script>

<template>
  <div
    class="workspace-layout"
    :class="{ 'workspace-layout--panel-collapsed': isWorkspacePanelCollapsed }"
  >
    <transition name="workspace-notice">
      <div
        v-if="workspaceNotice"
        class="workspace-notice"
        :class="`workspace-notice--${workspaceNotice.type}`"
        role="status"
        aria-live="polite"
      >
        <span class="workspace-notice__icon" aria-hidden="true">
          <i
            :class="workspaceNotice.type === 'success'
              ? 'fa-regular fa-circle-check'
              : workspaceNotice.type === 'error'
                ? 'fa-solid fa-triangle-exclamation'
                : 'fa-regular fa-bell'"
          ></i>
        </span>
        <p>{{ workspaceNotice.message }}</p>
        <button
          v-if="workspaceNotice.actionLabel"
          type="button"
          class="workspace-notice__action"
          @click="runWorkspaceNoticeAction"
        >
          {{ workspaceNotice.actionLabel }}
        </button>
        <button type="button" class="workspace-notice__close" aria-label="알림 닫기" @click="closeWorkspaceNotice">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </transition>

    <div
      v-if="workspaceConfirm"
      class="workspace-confirm-overlay"
      @mousedown.self="closeWorkspaceConfirm"
    >
      <section
        class="workspace-confirm-card"
        :class="`workspace-confirm-card--${workspaceConfirm.tone}`"
        role="dialog"
        aria-modal="true"
        aria-label="작업 확인"
      >
        <div class="workspace-confirm-card__icon" aria-hidden="true">
          <i :class="workspaceConfirm.tone === 'danger' ? 'fa-solid fa-triangle-exclamation' : 'fa-regular fa-circle-question'"></i>
        </div>
        <div class="workspace-confirm-card__body">
          <h3>{{ workspaceConfirm.title }}</h3>
          <p>{{ workspaceConfirm.message }}</p>
        </div>
        <div class="workspace-confirm-card__actions">
          <button
            type="button"
            class="workspace-confirm-card__cancel"
            :disabled="workspaceConfirm.loading"
            @click="closeWorkspaceConfirm"
          >
            {{ workspaceConfirm.cancelLabel }}
          </button>
          <button
            type="button"
            class="workspace-confirm-card__confirm"
            :disabled="workspaceConfirm.loading"
            @click="confirmWorkspaceAction"
          >
            <i v-if="workspaceConfirm.loading" class="fa-solid fa-spinner fa-spin"></i>
            <span>{{ workspaceConfirm.loading ? '처리 중...' : workspaceConfirm.confirmLabel }}</span>
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="isWorkspaceCommandPaletteOpen"
      class="workspace-command-overlay"
      @mousedown.self="closeWorkspaceCommandPalette"
    >
      <section
        class="workspace-command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="워크스페이스 빠른 명령"
      >
        <div class="workspace-command-search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input
            ref="workspaceCommandInput"
            v-model="workspaceCommandQuery"
            type="search"
            placeholder="문서, 템플릿, 패널, 액션 검색"
            @keydown.down.prevent="moveWorkspaceCommandSelection(1)"
            @keydown.up.prevent="moveWorkspaceCommandSelection(-1)"
            @keydown.enter.prevent="executeWorkspaceCommand()"
            @keydown.esc.prevent="closeWorkspaceCommandPalette"
          />
          <kbd>Esc</kbd>
        </div>

        <div v-if="workspaceCommandItems.length > 0" class="workspace-command-list">
          <button
            v-for="(item, index) in workspaceCommandItems"
            :key="item.id"
            type="button"
            class="workspace-command-item"
            :class="{ 'workspace-command-item--active': index === workspaceCommandActiveIndex }"
            @mouseenter="workspaceCommandActiveIndex = index"
            @click="executeWorkspaceCommand(item)"
          >
            <span class="workspace-command-item__icon">
              <i :class="item.icon"></i>
            </span>
            <span class="workspace-command-item__body">
              <strong>{{ item.title }}</strong>
              <small>{{ item.detail }}</small>
            </span>
            <span class="workspace-command-item__type">{{ item.kindLabel }}</span>
          </button>
        </div>
        <div v-else class="workspace-command-empty">
          {{ workspaceCommandEmptyLabel }}
        </div>
      </section>
    </div>

    <aside class="workspace-doc-sidebar">
      <div class="workspace-doc-sidebar__top">
        <div>
          <p class="workspace-doc-sidebar__eyebrow">Workspace</p>
          <h2>협업 문서</h2>
        </div>
        <div class="workspace-doc-sidebar__actions">
          <button
            type="button"
            class="workspace-command-open-btn"
            title="빠른 명령 Ctrl+K"
            @click="openWorkspaceCommandPalette"
          >
            <i class="fa-solid fa-bolt"></i>
          </button>
          <button type="button" class="workspace-new-page-btn" title="새 페이지" @click="createWorkspaceDocument">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>
      </div>

      <label class="workspace-doc-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input v-model="workspaceDocumentQuery" type="search" placeholder="문서 검색" />
      </label>

      <form class="workspace-section-composer" @submit.prevent="createWorkspaceDocumentSection">
        <input
          v-model="workspaceSectionNameDraft"
          type="text"
          maxlength="32"
          placeholder="섹션 추가"
        />
        <button
          type="submit"
          :disabled="!workspaceSectionNameDraft.trim()"
          title="섹션 추가"
        >
          <i class="fa-solid fa-folder-plus"></i>
        </button>
      </form>

      <div v-if="workspaceDocumentsLoading" class="workspace-doc-empty">문서 목록을 불러오는 중입니다.</div>
      <div v-else class="workspace-doc-sections">
        <section v-if="favoriteWorkspaceDocuments.length > 0" class="workspace-doc-section workspace-doc-section--favorites">
          <div class="workspace-doc-section__header">
            <span>즐겨찾기</span>
            <strong>{{ favoriteWorkspaceDocuments.length }}</strong>
          </div>
          <article
            v-for="document in favoriteWorkspaceDocuments"
            :key="`favorite-${document.id}`"
            class="workspace-doc-item workspace-doc-item--favorite"
            :class="{ 'workspace-doc-item--active': String(document.id) === currentWorkspaceKey }"
          >
            <button type="button" class="workspace-doc-item__main" @click="openWorkspaceDocument(document)">
              <span class="workspace-doc-item__icon" :class="{ 'workspace-doc-item__icon--shared': document.scope === 'shared' }">
                {{ document.scope === 'shared' ? '공유' : '문서' }}
              </span>
              <span class="workspace-doc-item__body">
                <strong>{{ document.title }}</strong>
                <small>{{ formatDocumentTime(document.updatedAt) }} · {{ roleLabel(document.role) }}</small>
              </span>
            </button>
            <div class="workspace-doc-item__actions">
              <button
                type="button"
                class="workspace-doc-action-btn workspace-doc-action-btn--favorite"
                title="즐겨찾기 해제"
                @click.stop="toggleFavoriteWorkspaceDocument(document)"
              >
                <i class="fa-solid fa-star"></i>
              </button>
              <select
                v-if="workspaceDocumentSections.length > 0"
                class="workspace-doc-section-select"
                :value="workspaceDocumentSectionId(document)"
                title="섹션 이동"
                @change.stop="moveWorkspaceDocumentToSection(document, $event.target.value)"
              >
                <option value="">섹션 없음</option>
                <option
                  v-for="section in workspaceDocumentSections"
                  :key="`favorite-section-${document.id}-${section.id}`"
                  :value="section.id"
                >
                  {{ section.name }}
                </option>
              </select>
              <button
                type="button"
                class="workspace-doc-action-btn workspace-doc-action-btn--link"
                :disabled="!canModifyWorkspacePage || !editorApi"
                title="본문에 링크 삽입"
                @click.stop="insertWorkspacePageLink(document)"
              >
                <i class="fa-solid fa-link"></i>
              </button>
              <button
                type="button"
                class="workspace-doc-action-btn"
                title="페이지 링크 복사"
                @click.stop="copyWorkspaceDocumentLink(document)"
              >
                <i class="fa-regular fa-clipboard"></i>
              </button>
              <button
                type="button"
                class="workspace-doc-action-btn"
                :disabled="isDocumentActionLoading(document, 'duplicate')"
                title="복제"
                @click.stop="duplicateWorkspaceDocument(document)"
              >
                <i class="fa-regular fa-copy"></i>
              </button>
              <button
                type="button"
                class="workspace-doc-action-btn workspace-doc-action-btn--danger"
                :disabled="isDocumentActionLoading(document, 'remove')"
                :title="String(document.role).toUpperCase() === 'ADMIN' ? '삭제' : '목록에서 제거'"
                @click.stop="removeWorkspaceDocument(document)"
              >
                <i class="fa-regular fa-trash-can"></i>
              </button>
            </div>
          </article>
        </section>

        <section v-if="recentWorkspaceDocuments.length > 0" class="workspace-doc-section workspace-doc-section--recent">
          <div class="workspace-doc-section__header">
            <span>최근 문서</span>
            <strong>{{ recentWorkspaceDocuments.length }}</strong>
          </div>
          <article
            v-for="document in recentWorkspaceDocuments"
            :key="`recent-${document.id}`"
            class="workspace-doc-item workspace-doc-item--recent"
            :class="{ 'workspace-doc-item--active': String(document.id) === currentWorkspaceKey }"
          >
            <button type="button" class="workspace-doc-item__main" @click="openWorkspaceDocument(document)">
              <span class="workspace-doc-item__icon" :class="{ 'workspace-doc-item__icon--shared': document.scope === 'shared' }">
                {{ document.scope === 'shared' ? '공유' : '문서' }}
              </span>
              <span class="workspace-doc-item__body">
                <strong>{{ document.title }}</strong>
                <small>{{ formatDocumentTime(document.updatedAt) }} · {{ roleLabel(document.role) }}</small>
              </span>
            </button>
            <div class="workspace-doc-item__actions">
              <button
                type="button"
                class="workspace-doc-action-btn workspace-doc-action-btn--favorite"
                :class="{ 'workspace-doc-action-btn--favorite-active': isWorkspaceDocumentFavorite(document) }"
                :title="isWorkspaceDocumentFavorite(document) ? '즐겨찾기 해제' : '즐겨찾기 추가'"
                @click.stop="toggleFavoriteWorkspaceDocument(document)"
              >
                <i :class="isWorkspaceDocumentFavorite(document) ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
              </button>
              <button
                type="button"
                class="workspace-doc-action-btn workspace-doc-action-btn--link"
                :disabled="!canModifyWorkspacePage || !editorApi"
                title="본문에 링크 삽입"
                @click.stop="insertWorkspacePageLink(document)"
              >
                <i class="fa-solid fa-link"></i>
              </button>
              <button
                type="button"
                class="workspace-doc-action-btn"
                title="페이지 링크 복사"
                @click.stop="copyWorkspaceDocumentLink(document)"
              >
                <i class="fa-regular fa-clipboard"></i>
              </button>
            </div>
          </article>
        </section>

        <section
          v-if="workspaceDocumentSections.length > 0"
          class="workspace-doc-section workspace-doc-section--groups"
        >
          <div class="workspace-doc-section__header">
            <span>섹션</span>
            <strong>{{ workspaceSectionedDocumentCount }}</strong>
          </div>

          <article
            v-for="section in visibleWorkspaceDocumentSectionViews"
            :key="section.id"
            class="workspace-doc-group"
          >
            <div class="workspace-doc-group__header">
              <form
                v-if="workspaceSectionEditingId === section.id"
                class="workspace-doc-group__rename"
                @submit.prevent="saveWorkspaceDocumentSectionRename"
              >
                <input
                  ref="workspaceSectionEditInput"
                  v-model="workspaceSectionEditDraft"
                  type="text"
                  maxlength="32"
                  aria-label="섹션 이름"
                  @keydown.esc.prevent="cancelWorkspaceDocumentSectionRename"
                />
                <button
                  type="submit"
                  class="workspace-doc-action-btn"
                  :disabled="!workspaceSectionEditDraft.trim()"
                  title="섹션 이름 저장"
                >
                  <i class="fa-solid fa-check"></i>
                </button>
                <button
                  type="button"
                  class="workspace-doc-action-btn"
                  title="섹션 이름 변경 취소"
                  @click="cancelWorkspaceDocumentSectionRename"
                >
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </form>
              <button
                v-else
                type="button"
                class="workspace-doc-group__toggle"
                :aria-expanded="!section.collapsed"
                @click="toggleWorkspaceDocumentSection(section.id)"
              >
                <i :class="section.collapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'"></i>
                <span>{{ section.name }}</span>
                <strong>{{ section.documents.length }}</strong>
              </button>
              <div class="workspace-doc-group__actions">
                <button
                  type="button"
                  class="workspace-doc-action-btn"
                  title="섹션 이름 변경"
                  @click="startWorkspaceDocumentSectionRename(section)"
                >
                  <i class="fa-regular fa-pen-to-square"></i>
                </button>
                <button
                  type="button"
                  class="workspace-doc-action-btn workspace-doc-action-btn--danger"
                  title="섹션 삭제"
                  @click="removeWorkspaceDocumentSection(section)"
                >
                  <i class="fa-regular fa-trash-can"></i>
                </button>
              </div>
            </div>

            <div v-if="!section.collapsed" class="workspace-doc-group__items">
              <article
                v-for="document in section.documents"
                :key="`section-${section.id}-${document.id}`"
                class="workspace-doc-item workspace-doc-item--nested"
                :class="{ 'workspace-doc-item--active': String(document.id) === currentWorkspaceKey }"
              >
                <button type="button" class="workspace-doc-item__main" @click="openWorkspaceDocument(document)">
                  <span class="workspace-doc-item__icon" :class="{ 'workspace-doc-item__icon--shared': document.scope === 'shared' }">
                    {{ document.scope === 'shared' ? '공유' : '문서' }}
                  </span>
                  <span class="workspace-doc-item__body">
                    <strong>{{ document.title }}</strong>
                    <small>{{ formatDocumentTime(document.updatedAt) }} · {{ roleLabel(document.role) }}</small>
                  </span>
                </button>
                <div class="workspace-doc-item__actions">
                  <button
                    type="button"
                    class="workspace-doc-action-btn workspace-doc-action-btn--favorite"
                    :class="{ 'workspace-doc-action-btn--favorite-active': isWorkspaceDocumentFavorite(document) }"
                    :title="isWorkspaceDocumentFavorite(document) ? '즐겨찾기 해제' : '즐겨찾기 추가'"
                    @click.stop="toggleFavoriteWorkspaceDocument(document)"
                  >
                    <i :class="isWorkspaceDocumentFavorite(document) ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
                  </button>
                  <select
                    v-if="workspaceDocumentSections.length > 0"
                    class="workspace-doc-section-select"
                    :value="workspaceDocumentSectionId(document)"
                    title="섹션 이동"
                    @change.stop="moveWorkspaceDocumentToSection(document, $event.target.value)"
                  >
                    <option value="">섹션 없음</option>
                    <option
                      v-for="targetSection in workspaceDocumentSections"
                      :key="`section-move-${document.id}-${targetSection.id}`"
                      :value="targetSection.id"
                    >
                      {{ targetSection.name }}
                    </option>
                  </select>
                  <button
                    type="button"
                    class="workspace-doc-action-btn workspace-doc-action-btn--link"
                    :disabled="!canModifyWorkspacePage || !editorApi"
                    title="본문에 링크 삽입"
                    @click.stop="insertWorkspacePageLink(document)"
                  >
                    <i class="fa-solid fa-link"></i>
                  </button>
                  <button
                    type="button"
                    class="workspace-doc-action-btn"
                    title="페이지 링크 복사"
                    @click.stop="copyWorkspaceDocumentLink(document)"
                  >
                    <i class="fa-regular fa-clipboard"></i>
                  </button>
                  <button
                    type="button"
                    class="workspace-doc-action-btn"
                    :disabled="isDocumentActionLoading(document, 'duplicate')"
                    title="복제"
                    @click.stop="duplicateWorkspaceDocument(document)"
                  >
                    <i class="fa-regular fa-copy"></i>
                  </button>
                  <button
                    type="button"
                    class="workspace-doc-action-btn workspace-doc-action-btn--danger"
                    :disabled="isDocumentActionLoading(document, 'remove')"
                    :title="String(document.role).toUpperCase() === 'ADMIN' ? '삭제' : '목록에서 제거'"
                    @click.stop="removeWorkspaceDocument(document)"
                  >
                    <i class="fa-regular fa-trash-can"></i>
                  </button>
                </div>
              </article>
              <div v-if="section.documents.length === 0" class="workspace-doc-empty">
                이 섹션에 문서가 없습니다.
              </div>
            </div>
          </article>
        </section>

        <section class="workspace-doc-section">
          <div class="workspace-doc-section__header">
            <span>내 페이지</span>
            <strong>{{ unsectionedPersonalWorkspaceDocuments.length }}</strong>
          </div>
          <article
            v-for="document in unsectionedPersonalWorkspaceDocuments"
            :key="`personal-${document.id}`"
            class="workspace-doc-item"
            :class="{ 'workspace-doc-item--active': String(document.id) === currentWorkspaceKey }"
          >
            <button type="button" class="workspace-doc-item__main" @click="openWorkspaceDocument(document)">
              <span class="workspace-doc-item__icon">문서</span>
              <span class="workspace-doc-item__body">
                <strong>{{ document.title }}</strong>
                <small>{{ formatDocumentTime(document.updatedAt) }} · {{ roleLabel(document.role) }}</small>
              </span>
            </button>
            <div class="workspace-doc-item__actions">
              <button
                type="button"
                class="workspace-doc-action-btn workspace-doc-action-btn--favorite"
                :class="{ 'workspace-doc-action-btn--favorite-active': isWorkspaceDocumentFavorite(document) }"
                :title="isWorkspaceDocumentFavorite(document) ? '즐겨찾기 해제' : '즐겨찾기 추가'"
                @click.stop="toggleFavoriteWorkspaceDocument(document)"
              >
                <i :class="isWorkspaceDocumentFavorite(document) ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
              </button>
              <select
                v-if="workspaceDocumentSections.length > 0"
                class="workspace-doc-section-select"
                :value="workspaceDocumentSectionId(document)"
                title="섹션 이동"
                @change.stop="moveWorkspaceDocumentToSection(document, $event.target.value)"
              >
                <option value="">섹션 없음</option>
                <option
                  v-for="section in workspaceDocumentSections"
                  :key="`personal-section-${document.id}-${section.id}`"
                  :value="section.id"
                >
                  {{ section.name }}
                </option>
              </select>
              <button
                type="button"
                class="workspace-doc-action-btn workspace-doc-action-btn--link"
                :disabled="!canModifyWorkspacePage || !editorApi"
                title="본문에 링크 삽입"
                @click.stop="insertWorkspacePageLink(document)"
              >
                <i class="fa-solid fa-link"></i>
              </button>
              <button
                type="button"
                class="workspace-doc-action-btn"
                title="페이지 링크 복사"
                @click.stop="copyWorkspaceDocumentLink(document)"
              >
                <i class="fa-regular fa-clipboard"></i>
              </button>
              <button
                type="button"
                class="workspace-doc-action-btn"
                :disabled="isDocumentActionLoading(document, 'duplicate')"
                title="복제"
                @click="duplicateWorkspaceDocument(document)"
              >
                <i class="fa-regular fa-copy"></i>
              </button>
              <button
                type="button"
                class="workspace-doc-action-btn workspace-doc-action-btn--danger"
                :disabled="isDocumentActionLoading(document, 'remove')"
                :title="String(document.role).toUpperCase() === 'ADMIN' ? '삭제' : '목록에서 제거'"
                @click="removeWorkspaceDocument(document)"
              >
                <i class="fa-regular fa-trash-can"></i>
              </button>
            </div>
          </article>
          <div v-if="unsectionedPersonalWorkspaceDocuments.length === 0" class="workspace-doc-empty">
            내 페이지가 없습니다.
          </div>
        </section>

        <section class="workspace-doc-section">
          <div class="workspace-doc-section__header">
            <span>공유됨</span>
            <strong>{{ unsectionedSharedWorkspaceDocuments.length }}</strong>
          </div>
          <article
            v-for="document in unsectionedSharedWorkspaceDocuments"
            :key="`shared-${document.id}`"
            class="workspace-doc-item"
            :class="{ 'workspace-doc-item--active': String(document.id) === currentWorkspaceKey }"
          >
            <button type="button" class="workspace-doc-item__main" @click="openWorkspaceDocument(document)">
              <span class="workspace-doc-item__icon workspace-doc-item__icon--shared">공유</span>
              <span class="workspace-doc-item__body">
                <strong>{{ document.title }}</strong>
                <small>{{ formatDocumentTime(document.updatedAt) }} · {{ roleLabel(document.role) }}</small>
              </span>
            </button>
            <div class="workspace-doc-item__actions">
              <button
                type="button"
                class="workspace-doc-action-btn workspace-doc-action-btn--favorite"
                :class="{ 'workspace-doc-action-btn--favorite-active': isWorkspaceDocumentFavorite(document) }"
                :title="isWorkspaceDocumentFavorite(document) ? '즐겨찾기 해제' : '즐겨찾기 추가'"
                @click.stop="toggleFavoriteWorkspaceDocument(document)"
              >
                <i :class="isWorkspaceDocumentFavorite(document) ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
              </button>
              <select
                v-if="workspaceDocumentSections.length > 0"
                class="workspace-doc-section-select"
                :value="workspaceDocumentSectionId(document)"
                title="섹션 이동"
                @change.stop="moveWorkspaceDocumentToSection(document, $event.target.value)"
              >
                <option value="">섹션 없음</option>
                <option
                  v-for="section in workspaceDocumentSections"
                  :key="`shared-section-${document.id}-${section.id}`"
                  :value="section.id"
                >
                  {{ section.name }}
                </option>
              </select>
              <button
                type="button"
                class="workspace-doc-action-btn workspace-doc-action-btn--link"
                :disabled="!canModifyWorkspacePage || !editorApi"
                title="본문에 링크 삽입"
                @click.stop="insertWorkspacePageLink(document)"
              >
                <i class="fa-solid fa-link"></i>
              </button>
              <button
                type="button"
                class="workspace-doc-action-btn"
                title="페이지 링크 복사"
                @click.stop="copyWorkspaceDocumentLink(document)"
              >
                <i class="fa-regular fa-clipboard"></i>
              </button>
              <button
                type="button"
                class="workspace-doc-action-btn"
                :disabled="isDocumentActionLoading(document, 'duplicate')"
                title="복제"
                @click="duplicateWorkspaceDocument(document)"
              >
                <i class="fa-regular fa-copy"></i>
              </button>
              <button
                type="button"
                class="workspace-doc-action-btn workspace-doc-action-btn--danger"
                :disabled="isDocumentActionLoading(document, 'remove')"
                :title="String(document.role).toUpperCase() === 'ADMIN' ? '삭제' : '목록에서 제거'"
                @click="removeWorkspaceDocument(document)"
              >
                <i class="fa-regular fa-trash-can"></i>
              </button>
            </div>
          </article>
          <div v-if="unsectionedSharedWorkspaceDocuments.length === 0" class="workspace-doc-empty">
            공유 페이지가 없습니다.
          </div>
        </section>
      </div>
    </aside>

    <div class="editor-shell">
      <div
        class="workspace-page-cover"
        :class="`workspace-page-cover--${workspacePropertyCoverColorOption.id}`"
        aria-hidden="true"
      ></div>
      <div class="editor-header">
        <div class="workspace-title-stack">
          <div v-if="workspacePageBreadcrumbTrail.length > 0" class="workspace-page-breadcrumb" aria-label="페이지 계층">
            <template
              v-for="breadcrumb in workspacePageBreadcrumbTrail"
              :key="`breadcrumb-${breadcrumb.id}`"
            >
              <button type="button" @click="openWorkspaceDocument(breadcrumb)">
                <i class="fa-regular fa-file-lines"></i>
                <span>{{ breadcrumb.title }}</span>
              </button>
              <i class="fa-solid fa-angle-right" aria-hidden="true"></i>
            </template>
            <span>{{ title || '제목 없음' }}</span>
          </div>
          <div class="workspace-title-row">
            <input
              v-model="workspacePropertyIcon"
              type="text"
              maxlength="4"
              class="workspace-page-icon-input"
              aria-label="페이지 아이콘"
              :disabled="!canModifyWorkspacePage"
              @blur="workspacePropertyIcon = normalizeWorkspacePageIcon(workspacePropertyIcon)"
            />
            <input
              :value="title"
              placeholder="제목 없음"
              class="title-input"
              :disabled="!canModifyWorkspacePage"
              @input="handleTitleInput"
            />
          </div>
          <div class="workspace-document-meta">
            <span class="status-pill" :class="saveStatusClass">{{ saveStatusLabel }}</span>
            <span class="status-pill" :class="realtimeStatusClass">{{ realtimeStatusLabel }}</span>
            <span class="status-pill" :class="workspaceShareStatusClass">{{ workspaceShareStatusLabel }}</span>
            <span class="status-pill status-pill--role">{{ roleLabel(workspaceAccessRole) }}</span>
            <span
              class="status-pill"
              :class="isWorkspacePageLocked ? 'status-pill--locked' : 'status-pill--editable'"
            >
              {{ workspaceLockStatusLabel }}
            </span>
            <span v-if="workspaceId" class="workspace-document-id">#{{ workspaceId }}</span>
            <span v-if="workspaceDocumentLinkCopiedId" class="status-pill status-pill--copied" aria-live="polite">
              링크 복사됨
            </span>
          </div>
        </div>

        <div class="editor-header__actions">
          <div class="user-presence-wrapper">
            <button
              class="presence-toggle-btn"
              type="button"
              :aria-expanded="showUserList"
              aria-label="참여자 목록"
              @click.stop="showUserList = !showUserList"
            >
              <span class="presence-avatar-stack" aria-hidden="true">
                <span
                  v-for="user in activeUserPreview"
                  :key="`presence-${user.clientId}`"
                  class="presence-avatar"
                  :style="{ background: user.color }"
                  :title="`${user.name} · ${workspacePresenceStatusLabel(user)}`"
                >
                  {{ user.initial || userInitial(user.name) }}
                </span>
                <span v-if="extraActiveUserCount > 0" class="presence-avatar presence-avatar--overflow">
                  +{{ extraActiveUserCount }}
                </span>
                <span v-if="activeUsers.length === 0" class="presence-avatar presence-avatar--empty">0</span>
              </span>
              <span class="presence-toggle-label">{{ presenceSummaryLabel }}</span>
            </button>
            <div v-if="showUserList" class="user-list-popover" @click.stop>
              <div class="popover-title">현재 참여 중인 사용자</div>
              <div class="user-item-list">
                <div v-for="user in activeUsers" :key="user.clientId" class="user-item">
                  <div class="user-avatar" :style="{ background: user.color }">
                    {{ user.initial || userInitial(user.name) }}
                  </div>
                  <div class="user-info">
                    <div class="user-name-row">
                      <span class="user-name">{{ user.name }}</span>
                      <span v-if="user.isMe" class="me-tag">(나)</span>
                      <span
                        class="role-badge"
                        :class="`role-badge--${(user.role || 'READ').toLowerCase()}`"
                      >
                        {{ roleLabel(user.role) }}
                      </span>
                    </div>
                    <div class="user-subtitle">
                      <span class="presence-status-dot" :class="{ 'presence-status-dot--away': user.status === 'away' }"></span>
                      <span>{{ user.email || (user.isMe ? '현재 계정' : '공동 편집자') }} · {{ workspacePresenceStatusLabel(user) }}</span>
                    </div>

                    <div
                      v-if="canManageWorkspaceShare && !user.isMe"
                      class="permission-dropdown-wrapper"
                      @click.stop
                    >
                      <button
                        class="permission-dropdown-trigger"
                        @click.stop="openRoleDropdownId = openRoleDropdownId === user.clientId ? null : user.clientId"
                      >
                        권한 변경 <span class="dropdown-arrow">▼</span>
                      </button>

                      <div v-if="openRoleDropdownId === user.clientId" class="permission-dropdown-menu">
                        <button class="dropdown-item" @click.stop="handleRoleAction(user, 'ADMIN')">
                          관리자로 변경
                        </button>
                        <button class="dropdown-item" @click.stop="handleRoleAction(user, 'WRITE')">
                          편집자로 변경
                        </button>
                        <button class="dropdown-item" @click.stop="handleRoleAction(user, 'READ')">
                          뷰어로 변경
                        </button>
                        <div class="dropdown-divider"></div>
                        <button class="dropdown-item dropdown-item--danger" @click.stop="handleRoleAction(user, 'KICKED')">
                          추방하기
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="activeUsers.length === 0" class="workspace-doc-empty">
                  아직 참여자가 표시되지 않았습니다.
                </div>
              </div>
            </div>
          </div>

          <button :disabled="!canEditWorkspace || !isValid || isSaving" @click="handleSave" class="save-btn">
            {{ isSaving ? '저장 중' : '저장' }}
          </button>
          <button
            type="button"
            class="workspace-favorite-page-btn"
            :class="{ 'workspace-favorite-page-btn--active': isCurrentWorkspaceDocumentFavorite }"
            :disabled="!canFavoriteCurrentWorkspaceDocument"
            :title="currentWorkspaceFavoriteTitle"
            :aria-pressed="isCurrentWorkspaceDocumentFavorite"
            @click="toggleCurrentWorkspaceDocumentFavorite"
          >
            <i :class="isCurrentWorkspaceDocumentFavorite ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
            <span>{{ isCurrentWorkspaceDocumentFavorite ? '즐겨찾기' : '별표' }}</span>
          </button>
          <button
            type="button"
            class="workspace-lock-btn"
            :class="{ 'workspace-lock-btn--locked': isWorkspacePageLocked }"
            :disabled="!canEditWorkspace || isSaving || isEditorLoading"
            :aria-pressed="isWorkspacePageLocked"
            :title="workspaceLockButtonTitle"
            @click="toggleWorkspacePageLock"
          >
            <i :class="isWorkspacePageLocked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open'"></i>
            <span>{{ isWorkspacePageLocked ? '잠김' : '잠금' }}</span>
          </button>
          <button
            type="button"
            class="workspace-copy-page-btn"
            :class="{ 'workspace-copy-page-btn--copied': isWorkspaceDocumentLinkCopied(currentWorkspaceLinkDocument) }"
            :disabled="!canCopyCurrentWorkspaceDocumentLink"
            :title="isWorkspaceDocumentLinkCopied(currentWorkspaceLinkDocument) ? '페이지 링크 복사됨' : '페이지 링크 복사'"
            @click="copyWorkspaceDocumentLink(currentWorkspaceLinkDocument)"
          >
            <i :class="isWorkspaceDocumentLinkCopied(currentWorkspaceLinkDocument) ? 'fa-solid fa-check' : 'fa-regular fa-clipboard'"></i>
            <span>{{ isWorkspaceDocumentLinkCopied(currentWorkspaceLinkDocument) ? '복사됨' : '링크' }}</span>
          </button>
          <button
            type="button"
            class="workspace-export-page-btn"
            :disabled="!canExportWorkspaceMarkdown"
            title="Markdown 내보내기"
            @click="exportWorkspaceMarkdown"
          >
            <i :class="workspaceMarkdownExporting ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-arrow-down'"></i>
            <span>{{ workspaceMarkdownExporting ? '내보내는 중' : 'MD' }}</span>
          </button>
          <button
            type="button"
            class="workspace-panel-toggle-btn"
            :class="{ 'workspace-panel-toggle-btn--collapsed': isWorkspacePanelCollapsed }"
            :aria-pressed="isWorkspacePanelCollapsed"
            :title="isWorkspacePanelCollapsed ? '협업 패널 열기' : '협업 패널 접기'"
            @click="isWorkspacePanelCollapsed = !isWorkspacePanelCollapsed"
          >
            <i class="fa-solid fa-table-columns"></i>
            <span>{{ isWorkspacePanelCollapsed ? '패널 열기' : '패널 접기' }}</span>
          </button>
          <button
            type="button"
            class="workspace-share-btn"
            :disabled="!canManageWorkspaceShare || !isValid || isSaving || isEditorLoading"
            :title="workspaceShareButtonTitle"
            @click="openWorkspaceShare"
          >
            <i class="fa-solid fa-share-nodes"></i>
            <span>공유</span>
          </button>
        </div>
      </div>

      <section class="workspace-property-panel" aria-label="페이지 속성">
        <div class="workspace-property-panel__header">
          <div>
            <span>Properties</span>
            <strong>페이지 속성</strong>
          </div>
          <div class="workspace-property-badges">
            <span :class="`workspace-property-badge workspace-property-badge--${workspacePropertyStatusOption.tone}`">
              {{ workspacePropertyStatusOption.label }}
            </span>
            <span :class="`workspace-property-badge workspace-property-badge--${workspacePropertyPriorityOption.tone}`">
              {{ workspacePropertyPriorityOption.label }}
            </span>
          </div>
        </div>

        <div class="workspace-property-visual-grid">
          <label class="workspace-property-field">
            <span>아이콘</span>
            <input
              v-model="workspacePropertyIcon"
              type="text"
              maxlength="4"
              :disabled="!canModifyWorkspacePage"
              @blur="workspacePropertyIcon = normalizeWorkspacePageIcon(workspacePropertyIcon)"
            />
          </label>

          <div class="workspace-property-field workspace-property-field--cover">
            <span>커버</span>
            <div class="workspace-cover-swatches" role="radiogroup" aria-label="페이지 커버 색상">
              <button
                v-for="option in WORKSPACE_COVER_COLOR_OPTIONS"
                :key="option.id"
                type="button"
                class="workspace-cover-swatch"
                :class="[
                  `workspace-cover-swatch--${option.id}`,
                  { 'workspace-cover-swatch--active': workspacePropertyCoverColorOption.id === option.id },
                ]"
                :title="option.label"
                role="radio"
                :aria-checked="workspacePropertyCoverColorOption.id === option.id"
                :aria-label="option.label"
                :disabled="!canModifyWorkspacePage"
                @click="workspacePropertyCoverColor = option.id"
              ></button>
            </div>
          </div>
        </div>

        <div class="workspace-property-grid">
          <label class="workspace-property-field">
            <span>상태</span>
            <select v-model="workspacePropertyStatus" :disabled="!canModifyWorkspacePage">
              <option
                v-for="option in WORKSPACE_PROPERTY_STATUS_OPTIONS"
                :key="option.id"
                :value="option.id"
              >
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="workspace-property-field">
            <span>우선순위</span>
            <select v-model="workspacePropertyPriority" :disabled="!canModifyWorkspacePage">
              <option
                v-for="option in WORKSPACE_PROPERTY_PRIORITY_OPTIONS"
                :key="option.id"
                :value="option.id"
              >
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="workspace-property-field">
            <span>담당자</span>
            <select v-model="workspacePropertyOwnerEmail" :disabled="!canModifyWorkspacePage">
              <option value="">담당자 없음</option>
              <option
                v-for="candidate in workspacePropertyOwnerCandidates"
                :key="candidate.email"
                :value="candidate.email"
              >
                {{ candidate.name }}
              </option>
            </select>
          </label>

          <label class="workspace-property-field">
            <span>기한</span>
            <input v-model="workspacePropertyDueDate" type="date" :disabled="!canModifyWorkspacePage" />
          </label>

          <label class="workspace-property-field workspace-property-field--tags">
            <span>태그</span>
            <input
              v-model="workspacePropertyTagsInput"
              type="text"
              maxlength="180"
              placeholder="기획, 릴리즈, 회의"
              :disabled="!canModifyWorkspacePage"
            />
          </label>
        </div>

        <div v-if="workspacePropertyTags.length > 0" class="workspace-property-tags" aria-label="페이지 태그">
          <span v-for="tag in workspacePropertyTags" :key="tag">#{{ tag }}</span>
        </div>
      </section>

      <div class="workspace-assets">
        <div class="workspace-assets__header">
          <div>
            <p class="workspace-assets__summary workspace-assets__summary--plain">첨부 파일 {{ workspaceAssets.length }}개</p>
            <p class="workspace-assets__hint workspace-assets__hint--plain">
              업로드한 파일은 오른쪽 플로팅 목록에서 바로 저장하거나 확인할 수 있습니다.
            </p>
            <p class="workspace-assets__summary">
              이미지 {{ workspaceImages.length }}개 · 파일 {{ workspaceFiles.length }}개
            </p>
          </div>

          <div v-if="canManageAssets" class="workspace-assets__actions">
            <input ref="imageInput" type="file" accept="image/*" multiple hidden @change="handleAssetSelection" />
            <input ref="fileInput" type="file" multiple hidden @change="handleAssetSelection" />
            <button type="button" class="asset-action-btn" :disabled="workspaceAssetUploading" @click="triggerImageSelect">
              이미지 업로드
            </button>
            <button type="button" class="asset-action-btn asset-action-btn--secondary" :disabled="workspaceAssetUploading" @click="triggerFileSelect">
              파일 업로드
            </button>
          </div>
        </div>

        <p v-if="workspaceAssetError" class="workspace-assets__error">{{ workspaceAssetError }}</p>
        <p v-else-if="!workspaceId" class="workspace-assets__hint">처음 업로드할 때 워크스페이스가 먼저 저장됩니다.</p>

        <div v-if="workspaceAssetLoading" class="workspace-assets__loading">첨부 자산을 불러오는 중입니다...</div>

        <section v-if="workspaceImages.length > 0" class="workspace-assets__group">
          <div class="workspace-assets__group-header"><h4>이미지</h4></div>
          <div class="workspace-image-grid">
            <article v-for="asset in workspaceImages" :key="asset.id" class="workspace-image-card">
              <button
                v-if="canManageAssets"
                type="button"
                class="asset-remove-btn"
                :disabled="isDeletingAsset(asset.id)"
                @click.stop="handleAssetDelete(asset)"
              >×</button>
              <a :href="asset.previewUrl" target="_blank" rel="noopener noreferrer" class="workspace-image-card__preview">
                <img :src="asset.previewUrl" :alt="asset.originalName" class="workspace-image-card__image" />
              </a>
              <div class="workspace-image-card__meta">
                <strong>{{ asset.originalName }}</strong>
                <span>{{ asset.fileSizeLabel }}</span>
                <span v-if="asset.createdAtLabel">{{ asset.createdAtLabel }}</span>
              </div>
            </article>
          </div>
        </section>

        <section v-if="workspaceFiles.length > 0" class="workspace-assets__group">
          <div class="workspace-assets__group-header"><h4>파일</h4></div>
          <div class="workspace-file-list">
            <article v-for="asset in workspaceFiles" :key="asset.id" class="workspace-file-card-wrap">
              <button
                v-if="canManageAssets"
                type="button"
                class="asset-remove-btn asset-remove-btn--file"
                :disabled="isDeletingAsset(asset.id)"
                @click.stop="handleAssetDelete(asset)"
              >×</button>
              <button type="button" class="workspace-file-card" @click="downloadWorkspaceAsset(asset)">
                <div class="workspace-file-card__icon">
                  <i class="fa-solid fa-file-arrow-down"></i>
                </div>
                <div class="workspace-file-card__meta">
                  <strong>{{ asset.originalName }}</strong>
                  <span>{{ asset.fileSizeLabel }}</span>
                  <span v-if="asset.createdAtLabel">{{ asset.createdAtLabel }}</span>
                </div>
              </button>
            </article>
          </div>
        </section>

        <div v-if="!workspaceAssetLoading && workspaceImages.length === 0 && workspaceFiles.length === 0" class="workspace-assets__empty">
          업로드된 이미지나 파일이 없습니다.
        </div>
      </div>

      <section v-if="canShowWorkspaceTemplates" class="workspace-template-panel">
        <div class="workspace-template-panel__header">
          <div>
            <h3>템플릿으로 시작</h3>
            <p>새 페이지에 어울리는 구조를 먼저 만들고 바로 편집하세요.</p>
          </div>
        </div>
        <div class="workspace-template-grid">
          <button
            v-for="template in workspaceTemplates"
            :key="template.id"
            type="button"
            class="workspace-template-card"
            :disabled="workspaceTemplateApplying === template.id"
            @click="applyWorkspaceTemplate(template)"
          >
            <span class="workspace-template-card__icon">
              <i :class="template.icon"></i>
            </span>
            <strong>{{ template.title }}</strong>
            <span>{{ template.description }}</span>
          </button>
        </div>
      </section>

      <div class="editor-body" :class="{ 'editor-body--locked': isWorkspacePageLocked }">
        <div v-if="isEditorLoading" class="loading-overlay">로딩 중...</div>
        <div v-if="isWorkspacePageLocked" class="workspace-editor-lock-overlay">
          <div>
            <i class="fa-solid fa-lock"></i>
            <strong>페이지가 잠겨 있습니다.</strong>
            <span>잠금을 해제하면 본문과 속성을 다시 편집할 수 있습니다.</span>
          </div>
          <button
            type="button"
            :disabled="!canEditWorkspace || isSaving || isEditorLoading"
            @click="toggleWorkspacePageLock"
          >
            잠금 해제
          </button>
        </div>
        <div ref="editorHolder" id="editor-holder" class="editor-holder"></div>
        <div v-if="canEditWorkspace" class="workspace-inline-block-bar">
          <label class="workspace-inline-block-input">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
            <input
              v-model="workspaceInlineQuickBlockText"
              type="text"
              maxlength="500"
              placeholder="빠른 블록 내용"
              :disabled="!canInsertWorkspaceQuickBlock || Boolean(workspaceQuickBlockAdding)"
              @keydown.enter.prevent="insertWorkspaceInlineQuickBlock(WORKSPACE_QUICK_BLOCK_OPTIONS[0])"
            />
          </label>
          <div class="workspace-inline-block-actions" aria-label="빠른 블록">
            <button
              v-for="block in workspaceInlineQuickBlockOptions"
              :key="`inline-block-${block.id}`"
              type="button"
              :disabled="!canInsertWorkspaceQuickBlock || Boolean(workspaceQuickBlockAdding)"
              :title="block.label"
              @click="insertWorkspaceInlineQuickBlock(block)"
            >
              <i :class="workspaceQuickBlockAdding === block.id ? 'fa-solid fa-spinner fa-spin' : block.icon"></i>
              <span>{{ block.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="cursors-overlay" aria-hidden>
        <div v-for="(cursor, id) in remoteCursors" :key="id" class="remote-cursor" :style="cursor.style">
          <svg class="cursor-pointer" width="18" height="24" viewBox="0 0 18 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 2L16 11L9 13L13 20L10 22L6 15L2 19V2Z" :fill="cursor.color" stroke="white" stroke-width="2" stroke-linejoin="round" />
          </svg>
          <div class="cursor-label" :style="{ background: cursor.color }">{{ cursor.name }}</div>
        </div>
      </div>
    </div>

    <aside v-if="!isWorkspacePanelCollapsed" class="workspace-floating-sidebar">
      <div class="workspace-floating-panel">
        <nav class="workspace-panel-tabs" aria-label="워크스페이스 패널">
          <button
            v-for="tab in workspacePanelTabs"
            :key="tab.id"
            type="button"
            class="workspace-panel-tab"
            :class="{ 'workspace-panel-tab--active': activeWorkspacePanelTab === tab.id }"
            @click="activeWorkspacePanelTab = tab.id"
          >
            <span>{{ tab.label }}</span>
            <strong v-if="tab.count !== null">{{ tab.count }}</strong>
          </button>
        </nav>

        <section v-if="isWorkspacePanelVisible('home')" class="workspace-home-panel">
          <div class="workspace-floating-panel__header">
            <div>
              <h3>Workspace Home</h3>
              <p>전체 페이지, 작업, 일정, 업무 분배를 빠르게 확인합니다.</p>
            </div>
            <button
              type="button"
              class="workspace-history-refresh-btn"
              :disabled="workspacePageIndexLoading"
              title="홈 새로고침"
              @click="refreshWorkspacePageIndex()"
            >
              <i :class="workspacePageIndexLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-rotate-right'"></i>
            </button>
          </div>

          <div class="workspace-home-metrics" aria-label="워크스페이스 핵심 지표">
            <button
              v-for="card in workspaceHomeMetricCards"
              :key="card.id"
              type="button"
              class="workspace-home-metric"
              @click="openWorkspaceHomeMetric(card)"
            >
              <span>
                <i :class="card.icon"></i>
              </span>
              <strong>{{ card.value }}</strong>
              <small>{{ card.label }}</small>
              <em>{{ card.detail }}</em>
            </button>
          </div>

          <section class="workspace-home-section">
            <div class="workspace-home-section__header">
              <span>Attention</span>
              <strong>{{ workspaceHomeAttentionItems.length }}</strong>
            </div>
            <div v-if="workspaceHomeAttentionItems.length === 0" class="workspace-floating-panel__empty">
              지금 바로 확인해야 할 항목이 없습니다.
            </div>
            <div v-else class="workspace-home-list">
              <button
                v-for="item in workspaceHomeAttentionItems"
                :key="item.id"
                type="button"
                class="workspace-home-item"
                :class="`workspace-home-item--${item.tone}`"
                @click="openWorkspaceHomeAttentionItem(item)"
              >
                <span>{{ item.label }}</span>
                <strong>{{ item.title }}</strong>
                <small>{{ item.detail }}</small>
                <i class="fa-solid fa-arrow-right"></i>
              </button>
            </div>
          </section>

          <section class="workspace-home-section">
            <div class="workspace-home-section__header">
              <span>My Queue</span>
              <strong>{{ workspaceHomeMyQueue.length }}</strong>
            </div>
            <div v-if="workspaceHomeMyQueue.length === 0" class="workspace-floating-panel__empty">
              내게 배정된 열린 작업이나 페이지가 없습니다.
            </div>
            <div v-else class="workspace-home-list">
              <button
                v-for="item in workspaceHomeMyQueue"
                :key="item.id"
                type="button"
                class="workspace-home-item"
                :class="{ 'workspace-home-item--danger': item.isOverdue }"
                @click="openWorkspaceHomeQueueItem(item)"
              >
                <span>{{ item.type === 'task' ? '작업' : '페이지' }}</span>
                <strong>{{ item.title }}</strong>
                <small>{{ item.detail }}</small>
                <i class="fa-solid fa-arrow-right"></i>
              </button>
            </div>
          </section>

          <section class="workspace-home-section">
            <div class="workspace-home-section__header">
              <span>Recent Pages</span>
              <strong>{{ workspaceHomeRecentPages.length }}</strong>
            </div>
            <div v-if="workspaceHomeRecentPages.length === 0" class="workspace-floating-panel__empty">
              최근 페이지가 없습니다.
            </div>
            <div v-else class="workspace-home-recent">
              <button
                v-for="page in workspaceHomeRecentPages"
                :key="`home-recent-${page.id}`"
                type="button"
                @click="openWorkspaceDocument(page)"
              >
                <span>{{ page.icon }}</span>
                <strong>{{ page.title }}</strong>
                <small>{{ page.updatedLabel }}</small>
              </button>
            </div>
          </section>
        </section>

        <div v-if="activeWorkspacePanelTab === 'all'" class="workspace-floating-divider"></div>

        <section v-if="isWorkspacePanelVisible('summary')" class="workspace-summary-panel">
          <div class="workspace-floating-panel__header">
            <div>
              <h3>페이지 요약</h3>
              <p>문서 상태와 협업 체크포인트를 한눈에 확인합니다.</p>
            </div>
            <span class="workspace-floating-panel__count">{{ documentStats.blockCount }}</span>
          </div>

          <div class="workspace-summary-grid" aria-label="페이지 요약 지표">
            <article
              v-for="card in workspaceSummaryCards"
              :key="card.id"
              class="workspace-summary-card"
            >
              <span class="workspace-summary-card__icon">
                <i :class="card.icon"></i>
              </span>
              <div>
                <small>{{ card.label }}</small>
                <strong>{{ card.value }}</strong>
                <p>{{ card.detail }}</p>
              </div>
            </article>
          </div>

          <div class="workspace-health-list" aria-label="페이지 상태 점검">
            <article
              v-for="item in workspaceHealthItems"
              :key="item.id"
              class="workspace-health-item"
              :class="`workspace-health-item--${item.tone}`"
            >
              <span>
                <i :class="item.icon"></i>
              </span>
              <div>
                <strong>{{ item.label }}</strong>
                <p>{{ item.detail }}</p>
              </div>
            </article>
          </div>

          <div class="workspace-summary-actions">
            <button type="button" @click="activeWorkspacePanelTab = 'blocks'">
              <i class="fa-solid fa-plus"></i>
              <span>블록 추가</span>
            </button>
            <button type="button" @click="activeWorkspacePanelTab = 'tasks'">
              <i class="fa-regular fa-square-check"></i>
              <span>작업 보기</span>
            </button>
            <button type="button" @click="activeWorkspacePanelTab = 'review'">
              <i class="fa-regular fa-comments"></i>
              <span>댓글 보기</span>
            </button>
            <button type="button" @click="activeWorkspacePanelTab = 'assets'">
              <i class="fa-regular fa-folder-open"></i>
              <span>첨부 보기</span>
            </button>
          </div>
        </section>

        <div v-if="activeWorkspacePanelTab === 'all'" class="workspace-floating-divider"></div>

        <section v-if="isWorkspacePanelVisible('collaboration')" class="workspace-collaboration-panel">
          <div class="workspace-floating-panel__header">
            <div>
              <h3>협업 상태</h3>
              <p>현재 문서의 권한과 공동 작업 상태를 확인합니다.</p>
            </div>
            <span class="workspace-floating-panel__count">{{ activeUsers.length }}</span>
          </div>

          <div class="workspace-collaboration-summary">
            <div class="workspace-collaboration-summary__item">
              <span>내 권한</span>
              <strong>{{ roleLabel(workspaceAccessRole) }}</strong>
            </div>
            <div class="workspace-collaboration-summary__item">
              <span>공유 상태</span>
              <strong>{{ workspaceShareStatusLabel }}</strong>
            </div>
            <div class="workspace-collaboration-summary__item">
              <span>참여자</span>
              <strong>{{ activeUsers.length }}명</strong>
            </div>
          </div>

          <div class="workspace-permission-grid" aria-label="현재 권한으로 가능한 작업">
            <div
              v-for="item in workspacePermissionItems"
              :key="item.id"
              class="workspace-permission-chip"
              :class="{ 'workspace-permission-chip--disabled': !item.enabled }"
            >
              <span>{{ item.label }}</span>
              <strong>{{ item.detail }}</strong>
            </div>
          </div>

          <div class="workspace-collaboration-actions">
            <button
              type="button"
              class="workspace-collaboration-action"
              :disabled="!canManageWorkspaceShare || !isValid || isSaving || isEditorLoading"
              :title="workspaceShareButtonTitle"
              @click="openWorkspaceShare"
            >
              <i class="fa-solid fa-share-nodes"></i>
              <span>초대</span>
            </button>
            <button
              type="button"
              class="workspace-collaboration-action"
              :disabled="!canManageAssets || workspaceAssetUploading"
              title="첨부 파일 추가"
              @click="triggerFileSelect"
            >
              <i class="fa-solid fa-paperclip"></i>
              <span>첨부</span>
            </button>
            <button
              type="button"
              class="workspace-collaboration-action"
              :disabled="!canCommentOnWorkspace"
              title="댓글 작성"
              @click="focusWorkspaceCommentComposer"
            >
              <i class="fa-regular fa-comment-dots"></i>
              <span>댓글</span>
            </button>
          </div>

          <section class="workspace-member-panel">
            <div class="workspace-member-panel__header">
              <div>
                <h4>문서 멤버</h4>
                <p>{{ workspaceMemberSummaryLabel }}</p>
              </div>
              <button
                v-if="canManageWorkspaceShare && workspaceId"
                type="button"
                class="workspace-member-refresh-btn"
                :disabled="workspaceMemberLoading"
                title="멤버 목록 새로고침"
                @click="refreshWorkspaceMembers()"
              >
                <i class="fa-solid fa-rotate-right"></i>
              </button>
            </div>

            <p v-if="workspaceMemberError" class="workspace-member-error">{{ workspaceMemberError }}</p>
            <div v-else-if="!workspaceId" class="workspace-member-empty">문서를 저장하면 멤버를 관리할 수 있습니다.</div>
            <div v-else-if="!canManageWorkspaceShare" class="workspace-member-empty">관리자만 전체 멤버 목록을 볼 수 있습니다.</div>
            <div v-else-if="workspaceMemberLoading" class="workspace-member-empty">멤버 목록을 불러오는 중입니다.</div>
            <div v-else-if="workspaceMemberRows.length === 0" class="workspace-member-empty">아직 등록된 멤버가 없습니다.</div>
            <div v-else class="workspace-member-list">
              <article
                v-for="member in workspaceMemberRows"
                :key="member.userIdx"
                class="workspace-member-item"
              >
                <div class="workspace-member-avatar">
                  <img v-if="member.image" :src="member.image" :alt="member.name" />
                  <span v-else>{{ userInitial(member.name) }}</span>
                </div>
                <div class="workspace-member-meta">
                  <div class="workspace-member-name-row">
                    <strong>{{ member.name }}</strong>
                    <span v-if="member.isMe" class="me-tag">나</span>
                    <span
                      class="workspace-member-online"
                      :class="{ 'workspace-member-online--active': member.isOnline }"
                    >
                      {{ member.isOnline ? '접속 중' : '오프라인' }}
                    </span>
                  </div>
                  <span>{{ roleLabel(member.role) }}</span>
                </div>
                <div class="workspace-member-actions">
                  <select
                    :value="member.role"
                    :disabled="member.isMe || isWorkspaceMemberBusy(member)"
                    title="멤버 권한 변경"
                    @change="handleWorkspaceMemberRoleSelect(member, $event)"
                  >
                    <option value="ADMIN">관리자</option>
                    <option value="WRITE">편집자</option>
                    <option value="READ">뷰어</option>
                  </select>
                  <button
                    type="button"
                    :disabled="member.isMe || isWorkspaceMemberBusy(member)"
                    title="멤버 추방"
                    @click="handleRoleAction(member, 'KICKED')"
                  >
                    <i class="fa-regular fa-trash-can"></i>
                  </button>
                </div>
              </article>
            </div>
          </section>
        </section>

        <div v-if="activeWorkspacePanelTab === 'all'" class="workspace-floating-divider"></div>

        <section v-if="isWorkspacePanelVisible('workload')" class="workspace-workload-panel">
          <div class="workspace-floating-panel__header">
            <div>
              <h3>Workload</h3>
              <p>페이지 소유자와 작업 담당자를 사람별로 모아봅니다.</p>
            </div>
            <span class="workspace-floating-panel__count">{{ workspaceWorkloadRows.length }}</span>
          </div>

          <div v-if="workspacePageIndexLoading" class="workspace-floating-panel__empty">
            업무 분배를 계산하는 중입니다.
          </div>
          <div v-else-if="workspaceWorkloadRows.length === 0" class="workspace-floating-panel__empty">
            담당자나 소유자가 지정된 페이지/작업이 없습니다.
          </div>
          <div v-else class="workspace-workload-list">
            <article
              v-for="person in workspaceWorkloadRows"
              :key="`workload-${person.key}`"
              class="workspace-workload-person"
              :class="[
                { 'workspace-workload-person--me': person.isMe },
                { 'workspace-workload-person--overdue': person.overdueTasks.length + person.overduePages.length > 0 },
              ]"
            >
              <div class="workspace-workload-person__header">
                <span class="workspace-workload-avatar">
                  <img v-if="person.image" :src="person.image" :alt="person.name" />
                  <span v-else>{{ person.initial }}</span>
                </span>
                <span class="workspace-workload-person__identity">
                  <strong>{{ person.name }}</strong>
                  <small>
                    <template v-if="person.isMe">나 · </template>
                    <template v-if="person.isOnline">접속 중</template>
                    <template v-else>오프라인</template>
                    <template v-if="person.role"> · {{ roleLabel(person.role) }}</template>
                  </small>
                </span>
              </div>

              <div class="workspace-workload-stats" aria-label="업무 분배 요약">
                <span>
                  <strong>{{ person.activePages.length }}</strong>
                  <small>진행 페이지</small>
                </span>
                <span>
                  <strong>{{ person.openTasks.length }}</strong>
                  <small>열린 작업</small>
                </span>
                <span :class="{ 'workspace-workload-stat--danger': person.overdueTasks.length + person.overduePages.length > 0 }">
                  <strong>{{ person.overdueTasks.length + person.overduePages.length }}</strong>
                  <small>지연</small>
                </span>
              </div>

              <div v-if="person.activePages.length > 0" class="workspace-workload-section">
                <div class="workspace-workload-section__title">
                  <span>Pages</span>
                  <strong>{{ person.activePages.length }}</strong>
                </div>
                <button
                  v-for="page in person.activePages.slice(0, 3)"
                  :key="`workload-page-${person.key}-${page.id}`"
                  type="button"
                  class="workspace-workload-link"
                  :class="{ 'workspace-workload-link--danger': page.isOverdue }"
                  @click="openWorkspaceDocument(page)"
                >
                  <span>{{ page.icon }}</span>
                  <strong>{{ page.title }}</strong>
                  <small>{{ page.statusLabel }} · {{ page.dueDate || '기한 없음' }}</small>
                </button>
              </div>

              <div v-if="person.openTasks.length > 0" class="workspace-workload-section">
                <div class="workspace-workload-section__title">
                  <span>Tasks</span>
                  <strong>{{ person.openTasks.length }}</strong>
                </div>
                <button
                  v-for="task in person.openTasks.slice(0, 4)"
                  :key="`workload-task-${person.key}-${task.id}`"
                  type="button"
                  class="workspace-workload-link"
                  :class="{ 'workspace-workload-link--danger': task.isOverdue }"
                  @click="focusWorkspaceInboxTask(task)"
                >
                  <span>
                    <i class="fa-regular fa-square-check"></i>
                  </span>
                  <strong>{{ task.text }}</strong>
                  <small>{{ task.documentTitle }} · {{ task.dueDate || '기한 없음' }}</small>
                </button>
              </div>
            </article>
          </div>
        </section>

        <div v-if="activeWorkspacePanelTab === 'all'" class="workspace-floating-divider"></div>

        <section v-if="isWorkspacePanelVisible('search')" class="workspace-fulltext-panel">
          <div class="workspace-floating-panel__header">
            <div>
              <h3>워크스페이스 검색</h3>
              <p>제목과 본문을 함께 검색해 필요한 페이지를 찾습니다.</p>
            </div>
            <span class="workspace-floating-panel__count">{{ workspaceFullTextResults.length }}</span>
          </div>

          <form class="workspace-fulltext-search" @submit.prevent="searchWorkspaceContents">
            <label>
              <i class="fa-solid fa-magnifying-glass"></i>
              <input
                v-model="workspaceFullTextQuery"
                type="search"
                maxlength="80"
                placeholder="본문 검색어"
              />
            </label>
            <button
              type="submit"
              :disabled="!canSearchWorkspaceFullText"
            >
              <i :class="workspaceFullTextLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-arrow-right'"></i>
              <span>검색</span>
            </button>
          </form>

          <p v-if="workspaceFullTextError" class="workspace-assets__error">{{ workspaceFullTextError }}</p>
          <div v-if="workspaceFullTextLoading" class="workspace-floating-panel__empty">
            문서 본문을 검색하는 중입니다.
          </div>
          <div v-else-if="workspaceFullTextResults.length === 0" class="workspace-floating-panel__empty">
            검색어를 입력하면 워크스페이스 문서 본문까지 찾아봅니다.
          </div>
          <div v-else class="workspace-fulltext-results">
            <article
              v-for="result in workspaceFullTextResults"
              :key="`fulltext-${result.id}`"
              class="workspace-fulltext-result"
            >
              <button type="button" class="workspace-fulltext-result__main" @click="openWorkspaceDocument(result)">
                <span class="workspace-fulltext-result__icon" :class="{ 'workspace-fulltext-result__icon--shared': result.scope === 'shared' }">
                  <i :class="result.scope === 'shared' ? 'fa-solid fa-user-group' : 'fa-regular fa-file-lines'"></i>
                </span>
                <span class="workspace-fulltext-result__body">
                  <strong>{{ result.title }}</strong>
                  <small>{{ result.matchTypeLabel }} · {{ result.scopeLabel }} · {{ result.roleLabel }} · {{ result.updatedLabel }}</small>
                </span>
                <i class="fa-solid fa-arrow-right"></i>
              </button>
              <p>{{ result.snippet }}</p>
              <div class="workspace-fulltext-result__actions">
                <button type="button" title="페이지 링크 복사" @click="copyWorkspaceDocumentLink(result)">
                  <i class="fa-regular fa-clipboard"></i>
                </button>
                <button
                  type="button"
                  :disabled="!canModifyWorkspacePage || !editorApi"
                  title="본문에 링크 삽입"
                  @click="insertWorkspacePageLink(result)"
                >
                  <i class="fa-solid fa-link"></i>
                </button>
              </div>
            </article>
          </div>
        </section>

        <div v-if="activeWorkspacePanelTab === 'all'" class="workspace-floating-divider"></div>

        <section v-if="isWorkspacePanelVisible('tree')" class="workspace-page-tree-panel">
          <div class="workspace-floating-panel__header">
            <div>
              <h3>Page Tree</h3>
            </div>
            <button
              type="button"
              class="workspace-history-refresh-btn"
              :disabled="workspacePageIndexLoading"
              title="Refresh page tree"
              @click="refreshWorkspacePageIndex()"
            >
              <i :class="workspacePageIndexLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-rotate-right'"></i>
            </button>
          </div>

          <label class="workspace-page-tree-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input
              v-model="workspacePageTreeQuery"
              type="search"
              placeholder="Find pages"
            />
            <button
              v-if="workspacePageTreeQuery"
              type="button"
              title="Clear"
              @click="workspacePageTreeQuery = ''"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </label>

          <div v-if="workspacePageIndexLoading" class="workspace-floating-panel__empty">
            페이지 트리를 불러오는 중입니다.
          </div>
          <template v-else>
          <p v-if="workspaceTreeSubpageError" class="workspace-assets__error">{{ workspaceTreeSubpageError }}</p>
          <p v-if="workspaceTreeRenameError" class="workspace-assets__error">{{ workspaceTreeRenameError }}</p>
          <p v-if="workspaceTreeMoveError" class="workspace-assets__error">{{ workspaceTreeMoveError }}</p>
          <div v-if="workspacePageTreeVisibleRows.length === 0" class="workspace-floating-panel__empty">
            {{ workspacePageTreeEmptyLabel }}
          </div>
          <div v-else class="workspace-page-tree-list">
            <article
              v-for="node in workspacePageTreeVisibleRows"
              :key="`tree-node-${node.id}`"
              class="workspace-page-tree-item"
              :class="{
                'workspace-page-tree-item--active': node.isCurrentDocument,
                'workspace-page-tree-item--overdue': node.isOverdue,
                'workspace-page-tree-item--matched': node.treeMatchesQuery,
              }"
              :style="{ '--workspace-tree-indent': `${8 + node.treeDepth * 14}px` }"
            >
              <button
                v-if="node.childCount > 0"
                type="button"
                class="workspace-page-tree-toggle"
                :aria-expanded="!workspacePageTreeCollapsedIdSet.has(String(node.id))"
                :title="workspacePageTreeCollapsedIdSet.has(String(node.id)) ? 'Expand' : 'Collapse'"
                @click="toggleWorkspacePageTreeNode(node)"
              >
                <i :class="workspacePageTreeCollapsedIdSet.has(String(node.id)) ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'"></i>
              </button>
              <span v-else class="workspace-page-tree-toggle workspace-page-tree-toggle--empty"></span>

              <button type="button" class="workspace-page-tree-main" @click="openWorkspaceDocument(node)">
                <span class="workspace-page-tree-icon">{{ node.icon }}</span>
                <span class="workspace-page-tree-body">
                  <strong>{{ node.title }}</strong>
                  <small>
                    {{ node.scopeLabel }} · {{ node.statusLabel }}
                    <template v-if="node.locked"> · 잠김</template>
                    <template v-if="node.childCount > 0"> · 하위 {{ node.childCount }}</template>
                  </small>
                </span>
              </button>

              <div class="workspace-page-tree-actions">
                <button
                  type="button"
                  :disabled="!node.canEditProperties || Boolean(workspaceTreeRenameSavingId)"
                  title="Rename page"
                  @click="openWorkspaceTreeRename(node)"
                >
                  <i :class="isWorkspaceTreeRenameOpen(node) ? 'fa-solid fa-pen' : 'fa-regular fa-pen-to-square'"></i>
                </button>
                <button
                  type="button"
                  :disabled="!node.canEditProperties || Boolean(workspaceTreeSubpageCreatingId)"
                  title="Create child page"
                  @click="openWorkspaceTreeSubpageComposer(node)"
                >
                  <i :class="isWorkspaceTreeSubpageComposerOpen(node) ? 'fa-solid fa-pen' : 'fa-solid fa-plus'"></i>
                </button>
                <button
                  type="button"
                  :disabled="!node.canEditProperties || Boolean(workspaceTreeMoveSavingId)"
                  title="Move page"
                  @click="openWorkspaceTreeMove(node)"
                >
                  <i :class="isWorkspaceTreeMoveOpen(node) ? 'fa-solid fa-location-arrow' : 'fa-solid fa-turn-up'"></i>
                </button>
                <button type="button" title="Copy page link" @click="copyWorkspaceDocumentLink(node)">
                  <i :class="isWorkspaceDocumentLinkCopied(node) ? 'fa-solid fa-check' : 'fa-regular fa-clipboard'"></i>
                </button>
                <button
                  type="button"
                  :disabled="!canModifyWorkspacePage || !editorApi"
                  title="Insert page link"
                  @click="insertWorkspacePageLink(node)"
                >
                  <i class="fa-solid fa-link"></i>
                </button>
              </div>

              <form
                v-if="isWorkspaceTreeRenameOpen(node)"
                class="workspace-page-tree-composer workspace-page-tree-composer--rename"
                @submit.prevent="renameWorkspaceTreePage(node)"
              >
                <label>
                  <i class="fa-regular fa-pen-to-square"></i>
                  <input
                    ref="workspaceTreeRenameInput"
                    v-model="workspaceTreeRenameDraft"
                    type="text"
                    maxlength="120"
                    placeholder="Page name"
                    :disabled="workspaceTreeRenameSavingId === String(node.id)"
                    @keydown.esc.prevent="cancelWorkspaceTreeRename"
                  />
                </label>
                <button
                  type="submit"
                  :disabled="workspaceTreeRenameSavingId === String(node.id) || !workspaceTreeRenameDraft.trim()"
                  title="Save"
                >
                  <i :class="workspaceTreeRenameSavingId === String(node.id) ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-check'"></i>
                </button>
                <button
                  type="button"
                  :disabled="workspaceTreeRenameSavingId === String(node.id)"
                  title="Cancel"
                  @click="cancelWorkspaceTreeRename"
                >
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </form>

              <form
                v-if="isWorkspaceTreeMoveOpen(node)"
                class="workspace-page-tree-composer workspace-page-tree-composer--move"
                @submit.prevent="moveWorkspaceTreePage(node)"
              >
                <label>
                  <i class="fa-solid fa-turn-up"></i>
                  <select
                    v-model="workspaceTreeMoveTargetId"
                    :disabled="workspaceTreeMoveSavingId === String(node.id)"
                    @keydown.esc.prevent="cancelWorkspaceTreeMove"
                  >
                    <option
                      v-for="option in workspaceTreeMoveTargetOptions(node)"
                      :key="`move-target-${node.id}-${option.id || 'root'}`"
                      :value="option.id"
                    >
                      {{ `${'· '.repeat(option.treeDepth)}${option.title}` }}
                    </option>
                  </select>
                </label>
                <button
                  type="submit"
                  :disabled="!canApplyWorkspaceTreeMove(node)"
                  title="Move"
                >
                  <i :class="workspaceTreeMoveSavingId === String(node.id) ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-check'"></i>
                </button>
                <button
                  type="button"
                  :disabled="workspaceTreeMoveSavingId === String(node.id)"
                  title="Cancel"
                  @click="cancelWorkspaceTreeMove"
                >
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </form>

              <form
                v-if="isWorkspaceTreeSubpageComposerOpen(node)"
                class="workspace-page-tree-composer"
                @submit.prevent="createWorkspaceTreeSubpage(node)"
              >
                <label>
                  <i class="fa-regular fa-file-lines"></i>
                  <input
                    ref="workspaceTreeSubpageInput"
                    v-model="workspaceTreeSubpageTitle"
                    type="text"
                    maxlength="80"
                    placeholder="New child page"
                    :disabled="workspaceTreeSubpageCreatingId === String(node.id)"
                    @keydown.esc.prevent="cancelWorkspaceTreeSubpageComposer"
                  />
                </label>
                <button
                  type="submit"
                  :disabled="workspaceTreeSubpageCreatingId === String(node.id) || !workspaceTreeSubpageTitle.trim()"
                  title="Create"
                >
                  <i :class="workspaceTreeSubpageCreatingId === String(node.id) ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-check'"></i>
                </button>
                <button
                  type="button"
                  :disabled="workspaceTreeSubpageCreatingId === String(node.id)"
                  title="Cancel"
                  @click="cancelWorkspaceTreeSubpageComposer"
                >
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </form>
            </article>
          </div>
          </template>
        </section>

        <div v-if="activeWorkspacePanelTab === 'all'" class="workspace-floating-divider"></div>

        <section v-if="isWorkspacePanelVisible('database')" class="workspace-page-index-panel">
          <div class="workspace-floating-panel__header">
            <div>
              <h3>페이지 데이터베이스</h3>
              <p>전체 페이지의 상태, 우선순위, 담당자, 기한을 한눈에 봅니다.</p>
            </div>
            <button
              type="button"
              class="workspace-history-refresh-btn"
              :disabled="workspacePageIndexLoading"
              title="페이지 데이터베이스 새로고침"
              @click="refreshWorkspacePageIndex()"
            >
              <i :class="workspacePageIndexLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-rotate-right'"></i>
            </button>
          </div>

          <div class="workspace-page-index-filters" role="tablist" aria-label="페이지 데이터베이스 필터">
            <button
              v-for="filter in workspacePageIndexFilterOptions"
              :key="filter.id"
              type="button"
              :class="{ 'workspace-page-index-filter--active': workspacePageIndexFilter === filter.id }"
              role="tab"
              :aria-selected="workspacePageIndexFilter === filter.id"
              @click="workspacePageIndexFilter = filter.id"
            >
              <span>{{ filter.label }}</span>
              <strong>{{ filter.count }}</strong>
            </button>
          </div>

          <div class="workspace-page-index-tools" aria-label="페이지 데이터베이스 검색과 정렬">
            <label class="workspace-page-index-search">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input
                v-model="workspacePageIndexQuery"
                type="search"
                maxlength="80"
                placeholder="제목, 담당자, 태그 검색"
              />
              <button
                v-if="workspacePageIndexQuery"
                type="button"
                title="검색어 지우기"
                @click="workspacePageIndexQuery = ''"
              >
                <i class="fa-solid fa-xmark"></i>
              </button>
            </label>
            <label class="workspace-page-index-sort">
              <span>정렬</span>
              <select v-model="workspacePageIndexSort">
                <option
                  v-for="option in workspacePageIndexSortOptions"
                  :key="option.id"
                  :value="option.id"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label class="workspace-page-index-owner-filter">
              <span>담당자</span>
              <select v-model="workspacePageIndexOwnerFilter">
                <option value="">전체 담당자</option>
                <option
                  v-for="owner in workspacePageIndexOwnerFilterOptions"
                  :key="`page-index-owner-filter-${owner.id}`"
                  :value="owner.id"
                >
                  {{ owner.label }} ({{ owner.count }})
                </option>
              </select>
            </label>
          </div>

          <div v-if="workspacePageIndexTagOptions.length > 0" class="workspace-page-index-tag-filter" aria-label="태그 필터">
            <button
              type="button"
              :class="{ 'workspace-page-index-tag-filter--active': !workspacePageIndexTagFilter }"
              @click="workspacePageIndexTagFilter = ''"
            >
              전체 태그
            </button>
            <button
              v-for="tag in workspacePageIndexTagOptions"
              :key="`page-index-tag-${tag.id}`"
              type="button"
              :class="{ 'workspace-page-index-tag-filter--active': workspacePageIndexTagFilter === tag.id }"
              @click="workspacePageIndexTagFilter = tag.id"
            >
              #{{ tag.label }}
              <strong>{{ tag.count }}</strong>
            </button>
          </div>

          <div class="workspace-page-index-views" aria-label="저장된 페이지 데이터베이스 보기">
            <div v-if="workspacePageIndexViews.length > 0" class="workspace-page-index-view-list">
              <span>저장된 보기</span>
              <div>
                <span
                  v-for="view in workspacePageIndexViews"
                  :key="view.id"
                  class="workspace-page-index-view-pill"
                  :class="{ 'workspace-page-index-view-pill--active': activeWorkspacePageIndexView?.id === view.id }"
                >
                  <button type="button" @click="applyWorkspacePageIndexView(view)">
                    <strong>{{ view.name }}</strong>
                    <small>{{ workspacePageIndexViewSummary(view) }}</small>
                  </button>
                  <button
                    type="button"
                    title="보기 삭제"
                    @click="removeWorkspacePageIndexView(view)"
                  >
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </span>
              </div>
            </div>
            <form class="workspace-page-index-view-form" @submit.prevent="createWorkspacePageIndexView">
              <label>
                <i class="fa-regular fa-bookmark"></i>
                <input
                  v-model="workspacePageIndexViewName"
                  type="text"
                  maxlength="32"
                  placeholder="현재 조건을 보기로 저장"
                />
              </label>
              <button type="submit" :disabled="!canCreateWorkspacePageIndexView">
                저장
              </button>
            </form>
          </div>

          <div class="workspace-page-index-bulk" aria-label="페이지 데이터베이스 일괄 편집">
            <label class="workspace-page-index-select-visible">
              <input
                type="checkbox"
                :checked="areAllVisibleWorkspacePageIndexRowsSelected"
                :disabled="visibleEditableWorkspacePageIndexRows.length === 0"
                @change="toggleVisibleWorkspacePageIndexSelection"
              />
              <span>현재 보기 선택</span>
              <strong>{{ visibleEditableWorkspacePageIndexRows.length }}</strong>
            </label>
            <div v-if="selectedWorkspacePageIndexRows.length > 0" class="workspace-page-index-bulk-actions">
              <span>
                <strong>{{ selectedWorkspacePageIndexRows.length }}</strong>
                선택됨
              </span>
              <select v-model="workspacePageIndexBulkStatus" :disabled="workspacePageIndexBulkUpdating">
                <option value="">상태 유지</option>
                <option
                  v-for="option in WORKSPACE_PROPERTY_STATUS_OPTIONS"
                  :key="`bulk-status-${option.id}`"
                  :value="option.id"
                >
                  {{ option.label }}
                </option>
              </select>
              <select v-model="workspacePageIndexBulkPriority" :disabled="workspacePageIndexBulkUpdating">
                <option value="">우선순위 유지</option>
                <option
                  v-for="option in WORKSPACE_PROPERTY_PRIORITY_OPTIONS"
                  :key="`bulk-priority-${option.id}`"
                  :value="option.id"
                >
                  {{ option.label }}
                </option>
              </select>
              <select v-model="workspacePageIndexBulkOwnerEmail" :disabled="workspacePageIndexBulkUpdating">
                <option value="">담당자 유지</option>
                <option value="__none__">담당자 없음</option>
                <option
                  v-for="candidate in workspacePropertyOwnerCandidates"
                  :key="`bulk-owner-${candidate.email}`"
                  :value="candidate.email"
                >
                  {{ candidate.name }}
                </option>
              </select>
              <input
                v-model="workspacePageIndexBulkDueDate"
                type="date"
                :disabled="workspacePageIndexBulkUpdating || workspacePageIndexBulkClearDueDate"
                title="일괄 기한"
              />
              <label class="workspace-page-index-bulk-check">
                <input
                  v-model="workspacePageIndexBulkClearDueDate"
                  type="checkbox"
                  :disabled="workspacePageIndexBulkUpdating"
                  @change="workspacePageIndexBulkDueDate = ''"
                />
                <span>기한 지우기</span>
              </label>
              <button
                type="button"
                :disabled="!canApplyWorkspacePageIndexBulkUpdate"
                @click="updateWorkspacePageIndexBulkProperties"
              >
                {{ workspacePageIndexBulkUpdating ? '적용 중' : '일괄 적용' }}
              </button>
              <button type="button" @click="clearWorkspacePageIndexSelection">
                해제
              </button>
            </div>
          </div>

          <p v-if="workspacePageIndexError" class="workspace-assets__error">{{ workspacePageIndexError }}</p>
          <div v-if="workspacePageIndexLoading" class="workspace-floating-panel__empty">
            페이지 속성을 불러오는 중입니다.
          </div>
          <div v-else-if="visibleWorkspacePageIndexRows.length === 0" class="workspace-floating-panel__empty">
            조건에 맞는 페이지가 없습니다.
          </div>
          <div v-else class="workspace-page-index-list">
            <article
              v-for="row in visibleWorkspacePageIndexRows"
              :key="`page-index-${row.id}`"
              class="workspace-page-index-row"
              :class="{
                'workspace-page-index-row--overdue': row.isOverdue,
                'workspace-page-index-row--locked': row.locked,
              }"
            >
              <label class="workspace-page-index-row__select" title="행 선택">
                <input
                  type="checkbox"
                  :checked="isWorkspacePageIndexRowSelected(row)"
                  :disabled="!row.canEditProperties"
                  @change="toggleWorkspacePageIndexRowSelection(row, $event)"
                />
                <span>
                  <i class="fa-solid fa-check"></i>
                </span>
              </label>
              <button type="button" class="workspace-page-index-row__main" @click="openWorkspaceDocument(row)">
                <span class="workspace-page-index-row__icon">{{ row.icon }}</span>
                  <span class="workspace-page-index-row__body">
                    <strong>{{ row.title }}</strong>
                  <small>
                    {{ row.scopeLabel }} · {{ row.roleLabel }} · {{ row.updatedLabel }}
                    <template v-if="row.locked"> · 잠김</template>
                  </small>
                  <em v-if="row.preview">{{ row.preview }}</em>
                </span>
              </button>
              <div class="workspace-page-index-row__props">
                <label class="workspace-page-index-edit">
                  <span>상태</span>
                  <select
                    :value="row.status"
                    :disabled="!row.canEditProperties || isWorkspacePageIndexRowUpdating(row)"
                    @change="updateWorkspacePageIndexRowProperties(row, { status: $event.target.value })"
                  >
                    <option
                      v-for="option in WORKSPACE_PROPERTY_STATUS_OPTIONS"
                      :key="`row-status-${row.id}-${option.id}`"
                      :value="option.id"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <label class="workspace-page-index-edit">
                  <span>우선순위</span>
                  <select
                    :value="row.priority"
                    :disabled="!row.canEditProperties || isWorkspacePageIndexRowUpdating(row)"
                    @change="updateWorkspacePageIndexRowProperties(row, { priority: $event.target.value })"
                  >
                    <option
                      v-for="option in WORKSPACE_PROPERTY_PRIORITY_OPTIONS"
                      :key="`row-priority-${row.id}-${option.id}`"
                      :value="option.id"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <label class="workspace-page-index-edit workspace-page-index-edit--owner">
                  <span>담당자</span>
                  <select
                    :value="row.ownerEmail"
                    :disabled="!row.canEditProperties || isWorkspacePageIndexRowUpdating(row)"
                    @change="updateWorkspacePageIndexRowOwner(row, $event)"
                  >
                    <option value="">담당자 없음</option>
                    <option
                      v-for="candidate in workspacePageIndexOwnerOptions(row)"
                      :key="`row-owner-${row.id}-${candidate.email}`"
                      :value="candidate.email"
                    >
                      {{ candidate.name }}
                    </option>
                  </select>
                </label>
                <label
                  class="workspace-page-index-edit workspace-page-index-edit--date"
                  :class="{ 'workspace-page-index-chip--danger': row.isOverdue }"
                >
                  <span>기한</span>
                  <input
                    type="date"
                    :value="row.dueDate"
                    :disabled="!row.canEditProperties || isWorkspacePageIndexRowUpdating(row)"
                    @change="updateWorkspacePageIndexRowProperties(row, { dueDate: $event.target.value })"
                  />
                </label>
                <label class="workspace-page-index-edit workspace-page-index-edit--tags">
                  <span>태그</span>
                  <input
                    type="text"
                    :value="row.tags.join(', ')"
                    maxlength="140"
                    placeholder="태그, 쉼표로 구분"
                    :disabled="!row.canEditProperties || isWorkspacePageIndexRowUpdating(row)"
                    @change="updateWorkspacePageIndexRowTags(row, $event)"
                  />
                </label>
                <span v-if="isWorkspacePageIndexRowUpdating(row)" class="workspace-page-index-chip">
                  <i class="fa-solid fa-spinner fa-spin"></i>
                  저장 중
                </span>
              </div>
              <div v-if="row.tags.length > 0" class="workspace-page-index-tags">
                <button
                  v-for="tag in row.tags"
                  :key="`${row.id}-${tag}`"
                  type="button"
                  :class="{ 'workspace-page-index-tag--active': workspacePageIndexTagFilter === String(tag).toLowerCase() }"
                  @click="workspacePageIndexTagFilter = String(tag).toLowerCase()"
                >
                  #{{ tag }}
                </button>
              </div>
            </article>
          </div>
        </section>

        <div v-if="activeWorkspacePanelTab === 'all'" class="workspace-floating-divider"></div>

        <section v-if="isWorkspacePanelVisible('board')" class="workspace-board-panel">
          <div class="workspace-floating-panel__header">
            <div>
              <h3>Page Board</h3>
              <p>페이지 상태를 보드 컬럼으로 보고 바로 이동시킵니다.</p>
            </div>
            <button
              type="button"
              class="workspace-history-refresh-btn"
              :disabled="workspacePageIndexLoading"
              title="보드 새로고침"
              @click="refreshWorkspacePageIndex()"
            >
              <i :class="workspacePageIndexLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-rotate-right'"></i>
            </button>
          </div>

          <p v-if="workspacePageIndexError" class="workspace-assets__error">{{ workspacePageIndexError }}</p>
          <div v-if="workspacePageIndexLoading" class="workspace-floating-panel__empty">
            페이지 보드를 불러오는 중입니다.
          </div>
          <div v-else-if="workspaceBoardRows.length === 0" class="workspace-floating-panel__empty">
            보드에 표시할 페이지가 없습니다.
          </div>
          <div v-else class="workspace-board-columns">
            <section
              v-for="column in workspaceBoardColumns"
              :key="`board-column-${column.id}`"
              class="workspace-board-column"
              :class="[
                `workspace-board-column--${column.tone}`,
                { 'workspace-board-column--drop-target': workspaceBoardDragOverStatus === column.id },
              ]"
              @dragenter.prevent="setWorkspaceBoardDropTarget(column.id)"
              @dragover.prevent="setWorkspaceBoardDropTarget(column.id)"
              @dragleave="clearWorkspaceBoardDropTarget($event, column.id)"
              @drop.prevent="dropWorkspaceBoardCardStatus($event, column.id)"
            >
              <div class="workspace-board-column__header">
                <span>{{ column.label }}</span>
                <strong>{{ column.rows.length }}</strong>
              </div>
              <small v-if="column.openTaskCount > 0" class="workspace-board-column__tasks">
                열린 작업 {{ column.openTaskCount }}
              </small>

              <div v-if="column.rows.length === 0" class="workspace-board-empty">
                페이지 없음
              </div>
              <template v-else>
                <article
                  v-for="row in column.rows"
                  :key="`board-card-${row.id}`"
                  class="workspace-board-card"
                  :class="{
                    'workspace-board-card--overdue': row.isOverdue,
                    'workspace-board-card--locked': row.locked,
                    'workspace-board-card--draggable': row.canEditProperties && !isWorkspacePageIndexRowUpdating(row),
                    'workspace-board-card--dragging': workspaceBoardDraggingId === String(row.id),
                  }"
                  :draggable="row.canEditProperties && !isWorkspacePageIndexRowUpdating(row)"
                  @dragstart="startWorkspaceBoardCardDrag($event, row)"
                  @dragend="clearWorkspaceBoardDrag"
                >
                  <button type="button" class="workspace-board-card__main" @click="openWorkspaceDocument(row)">
                    <span class="workspace-board-card__icon">{{ row.icon }}</span>
                    <span class="workspace-board-card__body">
                      <strong>{{ row.title }}</strong>
                      <small>{{ row.scopeLabel }} · {{ row.roleLabel }}</small>
                    </span>
                  </button>

                  <div class="workspace-board-card__meta">
                    <span :class="`workspace-property-badge workspace-property-badge--${row.priorityTone}`">
                      {{ row.priorityLabel }}
                    </span>
                    <span v-if="row.dueDate" :class="{ 'workspace-board-chip--danger': row.isOverdue }">
                      <i class="fa-regular fa-calendar"></i>
                      {{ row.dueDate }}
                    </span>
                    <span v-if="row.locked">
                      <i class="fa-solid fa-lock"></i>
                      잠김
                    </span>
                    <span v-if="row.ownerName">
                      <i class="fa-regular fa-user"></i>
                      {{ row.ownerName }}
                    </span>
                    <span v-if="row.tags.length > 0">
                      <i class="fa-solid fa-tag"></i>
                      {{ row.tags.slice(0, 2).join(', ') }}
                    </span>
                    <span v-if="(row.workspaceTasks || []).filter((task) => !task.checked).length > 0">
                      <i class="fa-regular fa-square-check"></i>
                      {{ (row.workspaceTasks || []).filter((task) => !task.checked).length }}
                    </span>
                  </div>

                  <div class="workspace-board-card__actions">
                    <button
                      type="button"
                      :disabled="!row.canEditProperties || isWorkspacePageIndexRowUpdating(row) || column.id === WORKSPACE_PROPERTY_STATUS_OPTIONS[0].id"
                      title="이전 상태로 이동"
                      @click="moveWorkspaceBoardCardStatus(row, -1)"
                    >
                      <i class="fa-solid fa-arrow-left"></i>
                    </button>
                    <select
                      :value="row.status"
                      :disabled="!row.canEditProperties || isWorkspacePageIndexRowUpdating(row)"
                      title="상태 변경"
                      @change="updateWorkspacePageIndexRowProperties(row, { status: $event.target.value })"
                    >
                      <option
                        v-for="option in WORKSPACE_PROPERTY_STATUS_OPTIONS"
                        :key="`board-status-${row.id}-${option.id}`"
                        :value="option.id"
                      >
                        {{ option.label }}
                      </option>
                    </select>
                    <button
                      type="button"
                      :disabled="!row.canEditProperties || isWorkspacePageIndexRowUpdating(row) || column.id === WORKSPACE_PROPERTY_STATUS_OPTIONS[WORKSPACE_PROPERTY_STATUS_OPTIONS.length - 1].id"
                      title="다음 상태로 이동"
                      @click="moveWorkspaceBoardCardStatus(row, 1)"
                    >
                      <i :class="isWorkspacePageIndexRowUpdating(row) ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-arrow-right'"></i>
                    </button>
                  </div>
                </article>
              </template>
            </section>
          </div>
        </section>

        <div v-if="activeWorkspacePanelTab === 'all'" class="workspace-floating-divider"></div>

        <section v-if="isWorkspacePanelVisible('timeline')" class="workspace-timeline-panel">
          <div class="workspace-floating-panel__header">
            <div>
              <h3>Timeline</h3>
              <p>페이지와 작업 마감일을 시간 흐름으로 확인합니다.</p>
            </div>
            <button
              type="button"
              class="workspace-history-refresh-btn"
              :disabled="workspacePageIndexLoading"
              title="타임라인 새로고침"
              @click="refreshWorkspacePageIndex()"
            >
              <i :class="workspacePageIndexLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-rotate-right'"></i>
            </button>
          </div>

          <div class="workspace-timeline-filters" role="tablist" aria-label="워크스페이스 타임라인 필터">
            <button
              v-for="filter in workspaceTimelineFilterOptions"
              :key="filter.id"
              type="button"
              :class="{ 'workspace-timeline-filter--active': workspaceTimelineFilter === filter.id }"
              role="tab"
              :aria-selected="workspaceTimelineFilter === filter.id"
              @click="workspaceTimelineFilter = filter.id"
            >
              <span>{{ filter.label }}</span>
              <strong>{{ filter.count }}</strong>
            </button>
          </div>

          <div v-if="workspacePageIndexLoading" class="workspace-floating-panel__empty">
            타임라인을 모으는 중입니다.
          </div>
          <div v-else-if="workspaceTimelineGroups.length === 0" class="workspace-floating-panel__empty">
            {{ workspaceTimelineEmptyLabel }}
          </div>
          <div v-else class="workspace-timeline-board">
            <div class="workspace-timeline-scale">
              <span>{{ workspaceTimelineRange.startLabel }}</span>
              <strong>{{ workspaceTimelineRange.summaryLabel }}</strong>
              <span>{{ workspaceTimelineRange.endLabel }}</span>
            </div>

            <section
              v-for="group in workspaceTimelineGroups"
              :key="`timeline-${group.id}`"
              class="workspace-timeline-group"
            >
              <div class="workspace-timeline-group__header">
                <span>{{ group.label }}</span>
                <strong>{{ group.items.length }}</strong>
              </div>

              <article
                v-for="item in group.items"
                :key="`timeline-${item.id}`"
                class="workspace-timeline-item"
                :class="[
                  `workspace-timeline-item--${item.type}`,
                  { 'workspace-timeline-item--done': item.isDone },
                  { 'workspace-timeline-item--overdue': item.isOverdue },
                ]"
                :style="workspaceTimelineItemStyle(item)"
              >
                <span class="workspace-timeline-item__track" aria-hidden="true">
                  <i></i>
                </span>
                <div class="workspace-timeline-item__content">
                  <button
                    v-if="item.type === 'task'"
                    type="button"
                    class="workspace-timeline-item__toggle"
                    :disabled="!item.task?.canToggle || isWorkspaceInboxTaskToggling(item.task)"
                    :title="!item.task?.canToggle ? '편집 권한 없음' : item.isDone ? '작업 다시 열기' : '작업 완료'"
                    @click="toggleWorkspaceCalendarTask(item)"
                  >
                    <i :class="isWorkspaceInboxTaskToggling(item.task) ? 'fa-solid fa-spinner fa-spin' : item.isDone ? 'fa-solid fa-check' : 'fa-solid fa-minus'"></i>
                  </button>
                  <span v-else class="workspace-timeline-item__icon">{{ item.icon }}</span>

                  <button type="button" class="workspace-timeline-item__main" @click="openWorkspaceCalendarItem(item)">
                    <span class="workspace-timeline-item__body">
                      <strong>{{ item.title }}</strong>
                      <small>{{ item.dateLabel }} · {{ item.typeLabel }} · {{ item.detail }}</small>
                      <span class="workspace-timeline-item__meta">
                        <span>{{ item.statusLabel }}</span>
                        <span v-if="item.priorityLabel" :class="`workspace-property-badge workspace-property-badge--${item.priorityTone}`">
                          {{ item.priorityLabel }}
                        </span>
                      </span>
                    </span>
                    <i class="fa-solid fa-arrow-right"></i>
                  </button>
                </div>
              </article>
            </section>
          </div>
        </section>

        <div v-if="activeWorkspacePanelTab === 'all'" class="workspace-floating-divider"></div>

        <section v-if="isWorkspacePanelVisible('calendar')" class="workspace-calendar-panel">
          <div class="workspace-floating-panel__header">
            <div>
              <h3>Calendar</h3>
              <p>페이지 기한과 작업 마감일을 날짜별로 확인합니다.</p>
            </div>
            <button
              type="button"
              class="workspace-history-refresh-btn"
              :disabled="workspacePageIndexLoading"
              title="일정 새로고침"
              @click="refreshWorkspacePageIndex()"
            >
              <i :class="workspacePageIndexLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-rotate-right'"></i>
            </button>
          </div>

          <div class="workspace-calendar-filters" role="tablist" aria-label="워크스페이스 일정 필터">
            <button
              v-for="filter in workspaceCalendarFilterOptions"
              :key="filter.id"
              type="button"
              :class="{ 'workspace-calendar-filter--active': workspaceCalendarFilter === filter.id }"
              role="tab"
              :aria-selected="workspaceCalendarFilter === filter.id"
              @click="workspaceCalendarFilter = filter.id"
            >
              <span>{{ filter.label }}</span>
              <strong>{{ filter.count }}</strong>
            </button>
          </div>

          <div v-if="workspacePageIndexLoading" class="workspace-floating-panel__empty">
            워크스페이스 일정을 모으는 중입니다.
          </div>
          <div v-else-if="workspaceCalendarGroups.length === 0" class="workspace-floating-panel__empty">
            {{ workspaceCalendarEmptyLabel }}
          </div>
          <div v-else class="workspace-calendar-groups">
            <section
              v-for="group in workspaceCalendarGroups"
              :key="`calendar-${group.id}`"
              class="workspace-calendar-group"
              :class="{ 'workspace-calendar-group--overdue': group.date && group.date < workspaceTaskTodayKey() }"
            >
              <div class="workspace-calendar-group__header">
                <span>{{ group.label }}</span>
                <strong>{{ group.items.length }}</strong>
              </div>
              <article
                v-for="item in group.items"
                :key="item.id"
                class="workspace-calendar-item"
                :class="[
                  `workspace-calendar-item--${item.type}`,
                  { 'workspace-calendar-item--done': item.isDone },
                  { 'workspace-calendar-item--overdue': item.isOverdue },
                ]"
              >
                <button
                  v-if="item.type === 'task'"
                  type="button"
                  class="workspace-calendar-item__toggle"
                  :disabled="!item.task?.canToggle || isWorkspaceInboxTaskToggling(item.task)"
                  :title="!item.task?.canToggle ? '편집 권한 없음' : item.isDone ? '작업 다시 열기' : '작업 완료'"
                  @click="toggleWorkspaceCalendarTask(item)"
                >
                  <i :class="isWorkspaceInboxTaskToggling(item.task) ? 'fa-solid fa-spinner fa-spin' : item.isDone ? 'fa-solid fa-check' : 'fa-solid fa-minus'"></i>
                </button>
                <span v-else class="workspace-calendar-item__icon">{{ item.icon }}</span>

                <button type="button" class="workspace-calendar-item__main" @click="openWorkspaceCalendarItem(item)">
                  <span class="workspace-calendar-item__body">
                    <strong>{{ item.title }}</strong>
                    <small>{{ item.typeLabel }} · {{ item.detail }}</small>
                    <span class="workspace-calendar-item__meta">
                      <span>{{ item.statusLabel }}</span>
                      <span v-if="item.priorityLabel" :class="`workspace-property-badge workspace-property-badge--${item.priorityTone}`">
                        {{ item.priorityLabel }}
                      </span>
                    </span>
                  </span>
                  <i class="fa-solid fa-arrow-right"></i>
                </button>
              </article>
            </section>
          </div>
        </section>

        <div v-if="activeWorkspacePanelTab === 'all'" class="workspace-floating-divider"></div>

        <section v-if="isWorkspacePanelVisible('inbox')" class="workspace-inbox-panel">
          <div class="workspace-floating-panel__header">
            <div>
              <h3>Workspace Inbox</h3>
              <p>전체 페이지의 체크리스트 작업을 한곳에서 확인합니다.</p>
            </div>
            <span class="workspace-floating-panel__count">{{ openWorkspaceIndexedTasks.length }}</span>
          </div>

          <div class="workspace-inbox-filters" role="tablist" aria-label="워크스페이스 작업 필터">
            <button
              v-for="filter in workspaceInboxFilterOptions"
              :key="filter.id"
              type="button"
              :class="{ 'workspace-inbox-filter--active': workspaceInboxFilter === filter.id }"
              role="tab"
              :aria-selected="workspaceInboxFilter === filter.id"
              @click="workspaceInboxFilter = filter.id"
            >
              <span>{{ filter.label }}</span>
              <strong>{{ filter.count }}</strong>
            </button>
          </div>

          <div v-if="workspacePageIndexLoading" class="workspace-floating-panel__empty">
            워크스페이스 작업을 모으는 중입니다.
          </div>
          <div v-else-if="visibleWorkspaceInboxTasks.length === 0" class="workspace-floating-panel__empty">
            {{ workspaceInboxEmptyLabel }}
          </div>
          <div v-else class="workspace-inbox-list">
            <article
              v-for="task in visibleWorkspaceInboxTasks"
              :key="`workspace-inbox-${task.id}`"
              class="workspace-inbox-item"
              :class="[
                { 'workspace-inbox-item--done': task.checked },
                { 'workspace-inbox-item--overdue': task.isOverdue },
                { 'workspace-inbox-item--mine': task.isMine },
              ]"
            >
              <button
                type="button"
                class="workspace-inbox-item__toggle"
                :disabled="!task.canToggle || isWorkspaceInboxTaskToggling(task)"
                :title="!task.canToggle ? '편집 권한 없음' : task.checked ? '작업 다시 열기' : '작업 완료'"
                @click="toggleWorkspaceInboxTask(task)"
              >
                <i :class="isWorkspaceInboxTaskToggling(task) ? 'fa-solid fa-spinner fa-spin' : task.checked ? 'fa-solid fa-check' : 'fa-solid fa-minus'"></i>
              </button>
              <button type="button" class="workspace-inbox-item__main" @click="focusWorkspaceInboxTask(task)">
                <span class="workspace-inbox-item__body">
                  <strong>{{ task.text }}</strong>
                  <small>{{ task.documentTitle }} · {{ task.pathLabel }}</small>
                  <span class="workspace-inbox-item__meta">
                    <span v-if="task.assigneeEmail">
                      <i class="fa-regular fa-user"></i>
                      {{ task.assigneeName || task.assigneeEmail }}
                    </span>
                    <span v-if="task.dueDate" :class="{ 'workspace-inbox-item__meta--danger': task.isOverdue }">
                      <i class="fa-regular fa-calendar"></i>
                      {{ task.dueDate }}
                    </span>
                    <span>
                      <i class="fa-regular fa-file-lines"></i>
                      {{ task.scopeLabel || '페이지' }}
                    </span>
                  </span>
                </span>
                <i class="fa-solid fa-arrow-right"></i>
              </button>
            </article>
          </div>
        </section>

        <div v-if="activeWorkspacePanelTab === 'all'" class="workspace-floating-divider"></div>

        <section v-if="isWorkspacePanelVisible('activity')" class="workspace-activity-panel">
          <div class="workspace-floating-panel__header">
            <div>
              <h3>최근 활동</h3>
              <p>저장, 댓글, 첨부, 멤버 동기화 이력을 한곳에서 봅니다.</p>
            </div>
            <span class="workspace-floating-panel__count">{{ workspaceActivityItems.length }}</span>
          </div>

          <div v-if="workspaceActivityItems.length === 0" class="workspace-floating-panel__empty">
            아직 표시할 활동이 없습니다.
          </div>
          <div v-else class="workspace-activity-list">
            <article
              v-for="activity in workspaceActivityItems"
              :key="activity.id"
              class="workspace-activity-item"
              :class="`workspace-activity-item--${activity.type}`"
            >
              <div class="workspace-activity-item__icon">
                <i :class="activity.icon"></i>
              </div>
              <div class="workspace-activity-item__body">
                <strong>{{ activity.title }}</strong>
                <p>{{ activity.detail }}</p>
                <span>{{ activity.timeLabel }}</span>
              </div>
            </article>
          </div>

        </section>

        <div v-if="activeWorkspacePanelTab === 'all'" class="workspace-floating-divider"></div>

        <section v-if="isWorkspacePanelVisible('blocks')" class="workspace-block-insert-panel">
          <div class="workspace-floating-panel__header">
            <div>
              <h3>빠른 블록</h3>
              <p>제목, 체크리스트, 표 같은 자주 쓰는 블록을 본문 끝에 추가합니다.</p>
            </div>
            <span class="workspace-floating-panel__count">{{ WORKSPACE_QUICK_BLOCK_OPTIONS.length }}</span>
          </div>

          <label class="workspace-block-insert-input">
            <span>내용</span>
            <input
              v-model="workspaceQuickBlockText"
              type="text"
              maxlength="500"
              placeholder="비워두면 기본 내용으로 추가됩니다."
              :disabled="!canInsertWorkspaceQuickBlock || Boolean(workspaceQuickBlockAdding)"
            />
          </label>

          <div class="workspace-block-insert-grid">
            <button
              v-for="block in WORKSPACE_QUICK_BLOCK_OPTIONS"
              :key="block.id"
              type="button"
              class="workspace-block-insert-card"
              :disabled="!canInsertWorkspaceQuickBlock || Boolean(workspaceQuickBlockAdding)"
              @click="insertWorkspaceQuickBlock(block)"
            >
              <span class="workspace-block-insert-card__icon">
                <i :class="workspaceQuickBlockAdding === block.id ? 'fa-solid fa-spinner fa-spin' : block.icon"></i>
              </span>
              <strong>{{ block.label }}</strong>
              <small>{{ block.description }}</small>
            </button>
          </div>

          <div v-if="!canModifyWorkspacePage" class="workspace-floating-panel__empty">
            {{ isWorkspacePageLocked ? '페이지 잠금 중에는 블록을 삽입할 수 없습니다.' : '보기 권한에서는 블록을 삽입할 수 없습니다.' }}
          </div>
        </section>

        <div v-if="activeWorkspacePanelTab === 'all'" class="workspace-floating-divider"></div>

        <section v-if="isWorkspacePanelVisible('tasks')" class="workspace-task-panel">
          <div class="workspace-floating-panel__header">
            <div>
              <h3>작업 목록</h3>
              <p>문서 체크리스트의 진행 상태입니다.</p>
            </div>
            <span class="workspace-floating-panel__count">{{ openDocumentTasks.length }}</span>
          </div>

          <form class="workspace-task-composer" @submit.prevent="addWorkspaceTask">
            <div class="workspace-task-composer__row">
              <input
                v-model="newWorkspaceTask"
                type="text"
                maxlength="255"
                placeholder="새 작업"
                :disabled="!canModifyWorkspacePage || workspaceTaskAdding"
              />
              <button
                type="submit"
                :disabled="!canAddWorkspaceTask"
                title="작업 추가"
              >
                <i :class="workspaceTaskAdding ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-plus'"></i>
                <span>추가</span>
              </button>
            </div>
            <div class="workspace-task-composer__meta">
              <select
                v-model="newWorkspaceTaskAssignee"
                :disabled="!canModifyWorkspacePage || workspaceTaskAdding"
                title="담당자"
              >
                <option value="">담당자 없음</option>
                <option
                  v-for="candidate in workspaceTaskAssigneeCandidates"
                  :key="candidate.email"
                  :value="candidate.email"
                >
                  {{ candidate.name }}
                </option>
              </select>
              <input
                v-model="newWorkspaceTaskDueDate"
                type="date"
                :disabled="!canModifyWorkspacePage || workspaceTaskAdding"
                title="기한"
              />
            </div>
          </form>

          <div v-if="documentTasks.length > 0" class="workspace-task-progress">
            <div>
              <strong>{{ documentTaskProgress }}%</strong>
              <span>{{ documentTaskSummaryLabel }}</span>
            </div>
            <div class="workspace-task-progress__bar" aria-hidden="true">
              <span :style="{ width: `${documentTaskProgress}%` }"></span>
            </div>
          </div>

          <div
            v-if="documentTasks.length > 0"
            class="workspace-task-filters"
            role="tablist"
            aria-label="작업 필터"
          >
            <button
              v-for="filter in workspaceTaskFilterOptions"
              :key="filter.id"
              type="button"
              :class="{ 'workspace-task-filter--active': workspaceTaskFilter === filter.id }"
              role="tab"
              :aria-selected="workspaceTaskFilter === filter.id"
              @click="workspaceTaskFilter = filter.id"
            >
              <span>{{ filter.label }}</span>
              <strong>{{ filter.count }}</strong>
            </button>
          </div>

          <div
            v-if="documentTasks.length === 0 || visibleDocumentTasks.length === 0"
            class="workspace-floating-panel__empty"
          >
            {{ workspaceTaskEmptyLabel }}
          </div>
          <div v-else class="workspace-task-list">
            <article
              v-for="task in visibleDocumentTasks"
              :key="task.id"
              class="workspace-task-item"
              :class="[
                { 'workspace-task-item--done': task.checked },
                { 'workspace-task-item--overdue': isWorkspaceTaskOverdue(task) },
                `workspace-task-item--depth-${Math.min(task.depth || 0, 3)}`,
              ]"
            >
              <button
                type="button"
                class="workspace-task-check"
                :disabled="!canModifyWorkspacePage || isWorkspaceTaskToggling(task)"
                :title="task.checked ? '작업 다시 열기' : '작업 완료'"
                @click="toggleWorkspaceTaskItem(task)"
              >
                <i :class="isWorkspaceTaskToggling(task) ? 'fa-solid fa-spinner fa-spin' : task.checked ? 'fa-solid fa-check' : 'fa-solid fa-minus'"></i>
              </button>
              <button
                type="button"
                class="workspace-task-body"
                title="원본 체크리스트 블록으로 이동"
                @click="focusWorkspaceTaskItem(task)"
              >
                <strong>{{ task.text }}</strong>
                <small>{{ task.pathLabel }} · {{ task.checked ? '완료' : '진행 중' }}</small>
                <span v-if="task.assigneeEmail || task.dueDate" class="workspace-task-meta">
                  <span v-if="task.assigneeEmail">
                    <i class="fa-regular fa-user"></i>
                    {{ task.assigneeName || task.assigneeEmail }}
                  </span>
                  <span
                    v-if="task.dueDate"
                    :class="{ 'workspace-task-meta--overdue': isWorkspaceTaskOverdue(task) }"
                  >
                    <i class="fa-regular fa-calendar"></i>
                    {{ task.dueDate }}
                  </span>
                </span>
              </button>
            </article>
          </div>
        </section>

        <div v-if="activeWorkspacePanelTab === 'all'" class="workspace-floating-divider"></div>

        <section v-if="isWorkspacePanelVisible('outline')" class="workspace-outline-panel">
          <div class="workspace-floating-panel__header">
            <div>
              <h3>문서 개요</h3>
              <p>제목 블록을 기준으로 페이지 안을 빠르게 이동합니다.</p>
            </div>
            <span class="workspace-floating-panel__count">{{ documentOutline.length }}</span>
          </div>

          <div v-if="documentOutline.length === 0" class="workspace-floating-panel__empty">
            제목 블록을 추가하면 개요가 표시됩니다.
          </div>
          <div v-else class="workspace-outline-list">
            <button
              v-for="item in documentOutline"
              :key="item.id"
              type="button"
              class="workspace-outline-item"
              :class="`workspace-outline-item--level-${item.level}`"
              @click="focusWorkspaceOutlineItem(item)"
            >
              <span>{{ item.anchorText }}</span>
            </button>
          </div>
        </section>

        <div v-if="activeWorkspacePanelTab === 'all'" class="workspace-floating-divider"></div>

        <section v-if="isWorkspacePanelVisible('links')" class="workspace-linked-panel">
          <div class="workspace-floating-panel__header">
            <div>
              <h3>관련 페이지</h3>
              <p>본문에서 언급한 워크스페이스 문서를 자동으로 연결합니다.</p>
            </div>
            <div class="workspace-linked-header-actions">
              <span class="workspace-floating-panel__count">{{ workspaceRelationCount }}</span>
              <button
                type="button"
                class="workspace-history-refresh-btn"
                :disabled="workspaceBacklinkLoading || !workspaceId"
                title="백링크 새로고침"
                @click="refreshWorkspaceBacklinks()"
              >
                <i class="fa-solid fa-rotate-right"></i>
              </button>
            </div>
          </div>

          <template v-if="currentWorkspaceParentPage">
            <div class="workspace-linked-subheader">
              <span>Parent page</span>
              <strong>1</strong>
            </div>
            <article class="workspace-linked-item workspace-linked-item--parent">
              <button type="button" class="workspace-linked-item__main" @click="openWorkspaceParentPage">
                <span class="workspace-linked-item__icon">
                  <i class="fa-solid fa-turn-up"></i>
                </span>
                <span class="workspace-linked-item__body">
                  <strong>{{ currentWorkspaceParentPage.title }}</strong>
                  <small>
                    {{ currentWorkspaceParentPage.scopeLabel }}
                    <template v-if="currentWorkspaceParentPage.roleLabel"> · {{ currentWorkspaceParentPage.roleLabel }}</template>
                    <template v-if="currentWorkspaceParentPage.updatedLabel"> · {{ currentWorkspaceParentPage.updatedLabel }}</template>
                  </small>
                </span>
                <i class="fa-solid fa-arrow-right"></i>
              </button>
              <div class="workspace-linked-item__actions">
                <button
                  type="button"
                  :disabled="!canModifyWorkspacePage || !editorApi"
                  title="본문에 링크 삽입"
                  @click="insertWorkspacePageLink(currentWorkspaceParentPage)"
                >
                  <i class="fa-solid fa-link"></i>
                </button>
                <button
                  type="button"
                  title="페이지 링크 복사"
                  @click="copyWorkspaceDocumentLink(currentWorkspaceParentPage)"
                >
                  <i class="fa-regular fa-clipboard"></i>
                </button>
              </div>
            </article>
          </template>

          <form class="workspace-subpage-composer" @submit.prevent="createWorkspaceSubpage">
            <label>
              <span><i class="fa-regular fa-file-lines"></i> 하위 페이지</span>
              <input
                ref="workspaceSubpageInput"
                v-model="workspaceSubpageTitle"
                type="text"
                maxlength="80"
                placeholder="새 페이지 제목"
                :disabled="!canStartWorkspaceSubpage || workspaceSubpageCreating"
              />
            </label>
            <button type="submit" :disabled="!canCreateWorkspaceSubpage">
              <i :class="workspaceSubpageCreating ? 'fa-solid fa-spinner fa-spin' : 'fa-regular fa-square-plus'"></i>
              만들기
            </button>
            <p v-if="workspaceSubpageError" class="workspace-assets__error">{{ workspaceSubpageError }}</p>
          </form>

          <template v-if="currentWorkspaceChildPages.length > 0">
            <div class="workspace-linked-subheader">
              <span>Child pages</span>
              <strong>{{ currentWorkspaceChildPages.length }}</strong>
            </div>
            <div class="workspace-linked-list workspace-linked-list--children">
              <article
                v-for="document in currentWorkspaceChildPages"
                :key="`child-${document.id}`"
                class="workspace-linked-item workspace-linked-item--child"
              >
                <button type="button" class="workspace-linked-item__main" @click="openWorkspaceDocument(document)">
                  <span class="workspace-linked-item__icon" :class="{ 'workspace-linked-item__icon--shared': document.scope === 'shared' }">
                    {{ document.icon }}
                  </span>
                  <span class="workspace-linked-item__body">
                    <strong>{{ document.title }}</strong>
                    <small>{{ document.scopeLabel }} · {{ document.roleLabel }} · {{ document.updatedLabel }}</small>
                  </span>
                  <i class="fa-solid fa-arrow-right"></i>
                </button>
                <div class="workspace-linked-item__actions">
                  <button
                    type="button"
                    :disabled="!canModifyWorkspacePage || !editorApi"
                    title="본문에 링크 삽입"
                    @click="insertWorkspacePageLink(document)"
                  >
                    <i class="fa-solid fa-link"></i>
                  </button>
                  <button
                    type="button"
                    title="페이지 링크 복사"
                    @click="copyWorkspaceDocumentLink(document)"
                  >
                    <i class="fa-regular fa-clipboard"></i>
                  </button>
                </div>
              </article>
            </div>
          </template>

          <div class="workspace-linked-subheader">
            <span>Outgoing</span>
            <strong>{{ linkedWorkspaceDocuments.length }}</strong>
          </div>
          <div v-if="linkedWorkspaceDocuments.length === 0" class="workspace-floating-panel__empty">
            {{ linkedWorkspaceDocumentEmptyLabel }}
          </div>
          <div v-else class="workspace-linked-list">
            <article
              v-for="document in linkedWorkspaceDocuments"
              :key="document.id"
              class="workspace-linked-item"
            >
              <button type="button" class="workspace-linked-item__main" @click="openWorkspaceDocument(document)">
                <span class="workspace-linked-item__icon" :class="{ 'workspace-linked-item__icon--shared': document.scope === 'shared' }">
                  <i :class="document.scope === 'shared' ? 'fa-solid fa-user-group' : 'fa-regular fa-file-lines'"></i>
                </span>
                <span class="workspace-linked-item__body">
                  <strong>{{ document.title }}</strong>
                  <small>{{ document.linkSourceLabel }} · {{ document.scopeLabel }} · {{ document.roleLabel }} · {{ document.updatedLabel }}</small>
                </span>
                <i class="fa-solid fa-arrow-right"></i>
              </button>
              <div class="workspace-linked-item__actions">
                <button
                  type="button"
                  :disabled="!canModifyWorkspacePage || !editorApi"
                  title="본문에 링크 삽입"
                  @click="insertWorkspacePageLink(document)"
                >
                  <i class="fa-solid fa-link"></i>
                </button>
                <button
                  type="button"
                  :disabled="!document.linkAnchorBlockId"
                  title="링크 위치로 이동"
                  @click="focusWorkspaceLinkedDocumentSource(document)"
                >
                  <i class="fa-solid fa-location-crosshairs"></i>
                </button>
                <button
                  type="button"
                  title="페이지 링크 복사"
                  @click="copyWorkspaceDocumentLink(document)"
                >
                  <i class="fa-regular fa-clipboard"></i>
                </button>
              </div>
            </article>
          </div>

          <div class="workspace-linked-subheader">
            <span>Backlinks</span>
            <strong>{{ workspaceBacklinks.length }}</strong>
          </div>
          <div v-if="workspaceBacklinkLoading" class="workspace-floating-panel__empty">
            백링크를 찾는 중입니다.
          </div>
          <p v-else-if="workspaceBacklinkError" class="workspace-assets__error">{{ workspaceBacklinkError }}</p>
          <div v-else-if="workspaceBacklinks.length === 0" class="workspace-floating-panel__empty">
            {{ workspaceBacklinkEmptyLabel }}
          </div>
          <div v-else class="workspace-linked-list workspace-linked-list--backlinks">
            <article
              v-for="document in workspaceBacklinks"
              :key="`backlink-${document.id}`"
              class="workspace-linked-item workspace-linked-item--backlink"
            >
              <button type="button" class="workspace-linked-item__main" @click="openWorkspaceDocument(document)">
                <span class="workspace-linked-item__icon" :class="{ 'workspace-linked-item__icon--shared': document.scope === 'shared' }">
                  <i :class="document.scope === 'shared' ? 'fa-solid fa-user-group' : 'fa-regular fa-file-lines'"></i>
                </span>
                <span class="workspace-linked-item__body">
                  <strong>{{ document.title }}</strong>
                  <small>{{ document.backlinkSourceLabel }} · {{ document.scopeLabel }} · {{ document.roleLabel }} · {{ document.updatedLabel }}</small>
                </span>
                <i class="fa-solid fa-arrow-right"></i>
              </button>
              <p v-if="document.backlinkPreview" class="workspace-linked-item__preview">
                {{ document.backlinkPreview }}
              </p>
              <div class="workspace-linked-item__actions">
                <button
                  type="button"
                  title="페이지 링크 복사"
                  @click="copyWorkspaceDocumentLink(document)"
                >
                  <i class="fa-regular fa-clipboard"></i>
                </button>
              </div>
            </article>
          </div>
        </section>

        <div v-if="activeWorkspacePanelTab === 'all'" class="workspace-floating-divider"></div>

        <section v-if="isWorkspacePanelVisible('history')" class="workspace-history-panel">
          <div class="workspace-floating-panel__header">
            <div>
              <h3>버전 기록</h3>
              <p>저장된 시점으로 문서를 되돌릴 수 있습니다.</p>
            </div>
            <button
              v-if="workspaceId"
              type="button"
              class="workspace-history-refresh-btn"
              :disabled="workspaceRevisionLoading"
              title="버전 기록 새로고침"
              @click="refreshWorkspaceRevisions()"
            >
              <i class="fa-solid fa-rotate-right"></i>
            </button>
          </div>

          <p v-if="workspaceRevisionError" class="workspace-assets__error">{{ workspaceRevisionError }}</p>
          <div v-if="!workspaceId" class="workspace-floating-panel__empty">
            문서를 저장하면 버전 기록이 생성됩니다.
          </div>
          <div v-else-if="workspaceRevisionLoading" class="workspace-floating-panel__empty">
            버전 기록을 불러오는 중입니다.
          </div>
          <div v-else-if="workspaceRevisions.length === 0" class="workspace-floating-panel__empty">
            아직 저장된 기록이 없습니다.
          </div>
          <div v-else class="workspace-history-list">
            <article
              v-for="revision in workspaceRevisions"
              :key="revision.id"
              class="workspace-history-item"
              :class="{ 'workspace-history-item--active': activeWorkspaceRevision?.id === revision.id }"
            >
              <button
                type="button"
                class="workspace-history-item__main"
                :disabled="workspaceRevisionPreviewLoading === String(revision.id)"
                @click="previewWorkspaceRevision(revision)"
              >
                <span>{{ workspaceRevisionReasonLabel(revision.reason) }}</span>
                <strong>{{ revision.title }}</strong>
                <small>{{ revision.actorName }} · {{ revision.createdAtLabel }}</small>
              </button>
            </article>
          </div>

          <div v-if="activeWorkspaceRevision" class="workspace-history-preview">
            <div>
              <span>선택한 기록</span>
              <strong>{{ activeWorkspaceRevision.title }}</strong>
              <small>{{ activeWorkspaceRevision.actorName }} · {{ activeWorkspaceRevision.createdAtLabel }}</small>
            </div>

            <div v-if="workspaceRevisionDiff" class="workspace-history-diff">
              <div
                v-if="workspaceRevisionDiff.titleChanged"
                class="workspace-history-title-diff"
              >
                <span>제목 변경</span>
                <strong>{{ workspaceRevisionDiff.currentTitle }}</strong>
                <i class="fa-solid fa-arrow-right"></i>
                <strong>{{ workspaceRevisionDiff.targetTitle }}</strong>
              </div>

              <div class="workspace-history-diff-summary" aria-label="버전 변경 요약">
                <span
                  v-for="item in workspaceRevisionDiffSummary"
                  :key="item.id"
                  :class="`workspace-history-diff-summary__item workspace-history-diff-summary__item--${item.id}`"
                >
                  {{ item.label }} {{ item.count }}
                </span>
              </div>

              <div v-if="workspaceRevisionDiffItems.length > 0" class="workspace-history-diff-list">
                <article
                  v-for="item in workspaceRevisionDiffItems"
                  :key="`${item.kind}-${item.key}`"
                  class="workspace-history-diff-item"
                  :class="`workspace-history-diff-item--${item.kind}`"
                >
                  <span>{{ item.label }}</span>
                  <div>
                    <strong>{{ item.typeLabel }}</strong>
                    <p>{{ item.preview }}</p>
                    <small v-if="item.previousPreview && item.previousPreview !== item.preview">
                      현재: {{ item.previousPreview }}
                    </small>
                  </div>
                </article>
              </div>
              <p v-else class="workspace-history-diff-empty">
                현재 문서와 블록 내용이 같습니다.
              </p>
            </div>

            <button
              type="button"
              :disabled="!canRestoreWorkspaceRevision || workspaceRevisionRestoring === String(activeWorkspaceRevision.id)"
              @click="restoreWorkspaceRevision(activeWorkspaceRevision)"
            >
              {{ workspaceRevisionRestoring === String(activeWorkspaceRevision.id) ? '복구 중' : '이 버전으로 복구' }}
            </button>
          </div>
        </section>

        <div v-if="activeWorkspacePanelTab === 'all'" class="workspace-floating-divider"></div>

        <section v-if="isWorkspacePanelVisible('review')" class="workspace-review-panel">
          <div class="workspace-floating-panel__header">
            <div>
              <h3>검토 댓글</h3>
              <p>문서 단위로 의견을 남기고 해결 상태를 관리합니다.</p>
            </div>
            <span class="workspace-floating-panel__count">{{ unresolvedWorkspaceComments.length }}</span>
          </div>

          <div class="workspace-comment-filters" role="tablist" aria-label="댓글 필터">
            <button
              v-for="filter in workspaceCommentFilters"
              :key="filter.id"
              type="button"
              class="workspace-comment-filter"
              :class="{ 'workspace-comment-filter--active': workspaceCommentFilter === filter.id }"
              :disabled="filter.disabled"
              @click="workspaceCommentFilter = filter.id"
            >
              <span>{{ filter.label }}</span>
              <strong>{{ filter.count }}</strong>
            </button>
          </div>

          <div v-if="canCommentOnWorkspace" class="workspace-comment-composer">
            <div
              class="workspace-comment-anchor-target"
              :class="{ 'workspace-comment-anchor-target--document': !selectedBlockAnchor }"
            >
              <div>
                <span>{{ selectedBlockAnchor ? '현재 블록' : '문서 전체' }}</span>
                <strong>{{ selectedBlockAnchor ? commentAnchorLabel(selectedBlockAnchor) : '문서 전체' }}</strong>
              </div>
              <button
                v-if="selectedBlockAnchor"
                type="button"
                @click="clearWorkspaceCommentAnchor"
              >
                문서 전체로
              </button>
            </div>
            <div class="workspace-mention-tools">
              <button
                type="button"
                class="workspace-mention-toggle"
                :class="{ 'workspace-mention-toggle--active': showWorkspaceMentionMenu }"
                :disabled="!canUseWorkspaceMentions"
                @click="showWorkspaceMentionMenu = !showWorkspaceMentionMenu"
              >
                <i class="fa-solid fa-at"></i>
                <span>멘션</span>
              </button>
              <div v-if="showWorkspaceMentionMenu && canUseWorkspaceMentions" class="workspace-mention-menu">
                <button
                  v-for="candidate in workspaceMentionCandidates"
                  :key="candidate.email"
                  type="button"
                  class="workspace-mention-option"
                  @click="insertWorkspaceMention(candidate)"
                >
                  <span class="workspace-mention-avatar">
                    <img v-if="candidate.image" :src="candidate.image" :alt="candidate.name" />
                    <span v-else>{{ candidate.initial }}</span>
                  </span>
                  <span class="workspace-mention-meta">
                    <strong>{{ candidate.name }}</strong>
                    <small>{{ candidate.email }}</small>
                  </span>
                </button>
              </div>
            </div>
            <textarea
              ref="workspaceCommentInput"
              v-model="newWorkspaceComment"
              rows="3"
              maxlength="4000"
              placeholder="의견, 요청사항, 확인할 내용을 남겨주세요."
              @keydown.ctrl.enter.prevent="createWorkspaceComment"
              @keydown.meta.enter.prevent="createWorkspaceComment"
            ></textarea>
            <button
              type="button"
              class="workspace-comment-submit"
              :disabled="workspaceCommentSaving || !newWorkspaceComment.trim()"
              @click="createWorkspaceComment"
            >
              {{ workspaceCommentSaving ? '작성 중' : '댓글 추가' }}
            </button>
          </div>

          <p v-if="workspaceCommentError" class="workspace-assets__error">{{ workspaceCommentError }}</p>
          <div v-if="workspaceCommentLoading" class="workspace-floating-panel__empty">
            댓글을 불러오는 중입니다.
          </div>
          <div v-else-if="workspaceComments.length === 0" class="workspace-floating-panel__empty">
            아직 댓글이 없습니다.
          </div>
          <div v-else-if="visibleWorkspaceComments.length === 0" class="workspace-floating-panel__empty">
            {{ workspaceCommentEmptyLabel }}
          </div>
          <div v-else class="workspace-comment-list">
            <article
              v-for="comment in visibleWorkspaceComments"
              :key="comment.id"
              class="workspace-comment-item"
              :class="{
                'workspace-comment-item--resolved': comment.resolved,
                'workspace-comment-item--mentioned': isWorkspaceCommentMentioningCurrentUser(comment),
              }"
            >
              <div class="workspace-comment-item__header">
                <div>
                  <strong>{{ comment.authorName }}</strong>
                  <span>
                    {{ comment.createdAtLabel }}
                    <template v-if="comment.isEdited"> · {{ comment.editedLabel }}</template>
                  </span>
                  <span
                    v-if="isWorkspaceCommentMentioningCurrentUser(comment)"
                    class="workspace-comment-mention-chip"
                  >
                    <i class="fa-solid fa-at"></i>
                    내 멘션
                  </span>
                </div>
                <div class="workspace-comment-item__actions">
                  <button
                    v-if="canEditWorkspaceComment(comment)"
                    type="button"
                    class="workspace-comment-icon-btn"
                    :disabled="isCommentUpdating(comment.id) || isCommentDeleting(comment.id)"
                    @click="startWorkspaceCommentEdit(comment)"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    class="workspace-comment-icon-btn"
                    :disabled="isCommentDeleting(comment.id)"
                    @click="deleteWorkspaceComment(comment)"
                  >
                    삭제
                  </button>
                </div>
              </div>
              <button
                v-if="comment.anchorBlockId"
                type="button"
                class="workspace-comment-anchor"
                @click="focusWorkspaceCommentAnchor(comment)"
              >
                <i class="fa-solid fa-location-dot"></i>
                <span>{{ commentAnchorLabel(comment) }}</span>
              </button>
              <form
                v-if="isWorkspaceCommentEditing(comment)"
                class="workspace-comment-edit"
                @submit.prevent="updateWorkspaceComment(comment)"
              >
                <textarea
                  v-model="workspaceCommentEditDraft"
                  rows="3"
                  maxlength="4000"
                  :disabled="isCommentUpdating(comment.id)"
                  @keydown.ctrl.enter.prevent="updateWorkspaceComment(comment)"
                  @keydown.meta.enter.prevent="updateWorkspaceComment(comment)"
                ></textarea>
                <div>
                  <button
                    type="button"
                    class="workspace-comment-edit__cancel"
                    :disabled="isCommentUpdating(comment.id)"
                    @click="cancelWorkspaceCommentEdit"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    class="workspace-comment-edit__save"
                    :disabled="isCommentUpdating(comment.id) || !workspaceCommentEditDraft.trim()"
                  >
                    {{ isCommentUpdating(comment.id) ? '저장 중' : '저장' }}
                  </button>
                </div>
              </form>
              <p v-else>{{ comment.contents }}</p>
              <button
                type="button"
                class="workspace-comment-resolve"
                :disabled="isCommentResolving(comment.id) || isWorkspaceCommentEditing(comment)"
                @click="toggleWorkspaceCommentResolved(comment)"
              >
                {{ isCommentResolving(comment.id) ? '처리 중' : comment.resolved ? '다시 열기' : '해결로 표시' }}
              </button>
            </article>
          </div>
        </section>

        <div v-if="activeWorkspacePanelTab === 'all'" class="workspace-floating-divider"></div>

        <section v-if="isWorkspacePanelVisible('assets')" class="workspace-assets-panel">
        <div class="workspace-floating-panel__header">
          <div><h3>첨부 파일</h3></div>
          <span class="workspace-floating-panel__count">{{ workspaceAssets.length }}</span>
        </div>

        <div v-if="workspaceAssetLoading" class="workspace-floating-panel__empty">
          첨부 파일을 불러오는 중입니다...
        </div>
        <div v-else-if="!hasWorkspaceAssets" class="workspace-floating-panel__empty">
          아직 첨부된 파일이 없습니다.
        </div>
        <div v-else class="workspace-floating-list">
          <article
            v-for="asset in workspaceAssets"
            :key="asset.id"
            class="workspace-floating-item"
            :class="{ 'workspace-floating-item--active': activeWorkspaceAssetId === asset.id }"
          >
            <button
              type="button"
              class="workspace-floating-item__main"
              @click="toggleWorkspaceAssetActions(asset.id)"
            >
              <div
                class="workspace-floating-item__icon"
                :class="asset.assetType === 'IMAGE' ? 'workspace-floating-item__icon--image' : 'workspace-floating-item__icon--file'"
              >
                <i :class="asset.assetType === 'IMAGE' ? 'fa-regular fa-image' : 'fa-regular fa-file-lines'"></i>
              </div>
              <div class="workspace-floating-item__meta">
                <div class="workspace-floating-item__title-row">
                  <strong>{{ asset.originalName }}</strong>
                  <span class="workspace-floating-item__badge">{{ getWorkspaceAssetBadge(asset) }}</span>
                </div>
                <span>{{ asset.fileSizeLabel }}</span>
                <span v-if="asset.createdAtLabel">{{ asset.createdAtLabel }}</span>
              </div>
            </button>

            <button
              v-if="canManageAssets"
              type="button"
              class="workspace-floating-item__remove"
              :disabled="isDeletingAsset(asset.id)"
              @click.stop="handleAssetDelete(asset)"
            >×</button>

            <div v-if="activeWorkspaceAssetId === asset.id" class="workspace-floating-item__actions">
              <button
                type="button"
                class="workspace-floating-item__action workspace-floating-item__action--drive"
                :disabled="isSavingWorkspaceAsset(asset.id)"
                @click.stop="saveWorkspaceAssetToDrive(asset)"
              >
                {{ isSavingWorkspaceAsset(asset.id) ? '저장 중...' : '드라이브에 저장' }}
              </button>
              <button
                type="button"
                class="workspace-floating-item__action workspace-floating-item__action--download"
                @click.stop="downloadWorkspaceAsset(asset)"
              >
                로컬에 저장
              </button>
            </div>
          </article>
        </div>
        </section>
      </div>
    </aside>
  </div>

  <ShareModal
    v-if="showWorkspaceShareModal"
    :is-open="showWorkspaceShareModal"
    :post-idx="workspaceId"
    :uuid="workspaceUuid"
    :initial-status="workspaceShareStatus"
    @close="showWorkspaceShareModal = false"
    @refresh="handleWorkspaceShareRefresh"
  />
</template>

<style scoped>
:root {
  --editor-bg: #ffffff;
  --editor-text: #1f2937;
  --editor-border: #e5e7eb;
  --editor-input-bg: #ffffff;
}

:global(html.dark) {
  --editor-bg: #1e1e1e;
  --editor-text: #e5e7eb;
  --editor-border: #333333;
  --editor-input-bg: #2d2d2d;
}

.workspace-layout {
  display: grid;
  grid-template-columns: 264px minmax(0, 1fr) 320px;
  gap: 24px;
  align-items: start;
  max-width: 1680px;
  margin: 24px auto;
  padding: 0 20px 28px;
}

.workspace-layout--panel-collapsed {
  grid-template-columns: 264px minmax(0, 1fr);
  max-width: 1360px;
}

.workspace-notice {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1200;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  width: min(420px, calc(100vw - 32px));
  padding: 12px 14px;
  border: 1px solid var(--editor-border);
  border-radius: 14px;
  background: var(--editor-bg);
  color: var(--editor-text);
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.18);
}

.workspace-notice__icon {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #eff6ff;
  color: #2563eb;
}

.workspace-notice--success .workspace-notice__icon {
  background: #ecfdf5;
  color: #059669;
}

.workspace-notice--error .workspace-notice__icon {
  background: #fef2f2;
  color: #dc2626;
}

.workspace-notice--warn .workspace-notice__icon {
  background: #fffbeb;
  color: #d97706;
}

.workspace-notice p {
  min-width: 0;
  margin: 0;
  font-size: 13px;
  font-weight: 750;
  line-height: 1.45;
}

.workspace-notice button {
  display: inline-flex;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}

.workspace-notice__action {
  width: auto;
  min-width: 0;
  padding: 0 10px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 12px;
  font-weight: 850;
  white-space: nowrap;
}

.workspace-notice__close {
  width: 28px;
}

.workspace-notice--success .workspace-notice__action {
  background: #ecfdf5;
  color: #047857;
}

.workspace-notice--error .workspace-notice__action {
  background: #fef2f2;
  color: #dc2626;
}

.workspace-notice--warn .workspace-notice__action {
  background: #fffbeb;
  color: #b45309;
}

.workspace-notice button:hover,
.workspace-notice button:focus-visible {
  background: #f1f5f9;
  color: #111827;
  outline: none;
}

.workspace-notice-enter-active,
.workspace-notice-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.workspace-notice-enter-from,
.workspace-notice-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.workspace-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1190;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(2px);
}

.workspace-confirm-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  width: min(520px, 100%);
  padding: 18px;
  border: 1px solid var(--editor-border);
  border-radius: 16px;
  background: var(--editor-bg);
  color: var(--editor-text);
  box-shadow: 0 22px 58px rgba(15, 23, 42, 0.22);
}

.workspace-confirm-card__icon {
  display: inline-flex;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: #fffbeb;
  color: #d97706;
}

.workspace-confirm-card--danger .workspace-confirm-card__icon {
  background: #fef2f2;
  color: #dc2626;
}

.workspace-confirm-card__body {
  min-width: 0;
}

.workspace-confirm-card h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 850;
}

.workspace-confirm-card p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.55;
}

.workspace-confirm-card__actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.workspace-confirm-card__actions button {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 10px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 850;
  cursor: pointer;
}

.workspace-confirm-card__actions button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.workspace-confirm-card__cancel {
  border: 1px solid var(--editor-border);
  background: var(--editor-input-bg);
  color: #64748b;
}

.workspace-confirm-card__confirm {
  border: 1px solid #2563eb;
  background: #2563eb;
  color: white;
}

.workspace-confirm-card--danger .workspace-confirm-card__confirm {
  border-color: #dc2626;
  background: #dc2626;
}

.workspace-doc-sidebar {
  position: sticky;
  top: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: calc(100vh - 48px);
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--editor-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--editor-bg) 96%, #f8fafc 4%);
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.06);
}

.workspace-doc-sidebar__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.workspace-doc-sidebar__actions {
  display: inline-flex;
  flex-shrink: 0;
  gap: 7px;
}

.workspace-doc-sidebar__eyebrow {
  margin: 0 0 4px;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.workspace-doc-sidebar h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.25;
}

.workspace-new-page-btn {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 10px;
  background: #111827;
  color: white;
  cursor: pointer;
}

.workspace-command-open-btn {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 10px;
  background: var(--editor-input-bg);
  color: #475569;
  cursor: pointer;
}

.workspace-command-open-btn:hover,
.workspace-new-page-btn:hover {
  transform: translateY(-1px);
}

.workspace-command-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: rgba(15, 23, 42, 0.28);
  padding: 9vh 16px 24px;
}

.workspace-command-palette {
  display: grid;
  width: min(620px, 100%);
  max-height: min(680px, 82vh);
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 16px;
  background: var(--editor-bg);
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.28);
}

.workspace-command-search {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--editor-border);
  padding: 14px 16px;
  color: #64748b;
}

.workspace-command-search input {
  width: 100%;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--editor-text);
  font-size: 15px;
  font-weight: 750;
}

.workspace-command-search kbd {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 7px;
  background: rgba(148, 163, 184, 0.1);
  color: #64748b;
  padding: 3px 7px;
  font-size: 11px;
  font-weight: 900;
}

.workspace-command-list {
  display: grid;
  gap: 4px;
  overflow: auto;
  padding: 8px;
}

.workspace-command-item {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: var(--editor-text);
  cursor: pointer;
  padding: 9px;
  text-align: left;
}

.workspace-command-item--active,
.workspace-command-item:hover {
  border-color: rgba(37, 99, 235, 0.22);
  background: rgba(37, 99, 235, 0.08);
}

.workspace-command-item__icon {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(100, 116, 139, 0.1);
  color: #475569;
  font-size: 13px;
}

.workspace-command-item--active .workspace-command-item__icon {
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
}

.workspace-command-item__body {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.workspace-command-item__body strong,
.workspace-command-item__body small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-command-item__body strong {
  font-size: 13px;
  font-weight: 900;
}

.workspace-command-item__body small {
  color: #64748b;
  font-size: 11px;
  font-weight: 750;
}

.workspace-command-item__type {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.13);
  color: #64748b;
  padding: 4px 7px;
  font-size: 10px;
  font-weight: 900;
}

.workspace-command-empty {
  padding: 28px 18px;
  color: #64748b;
  font-size: 13px;
  font-weight: 800;
  text-align: center;
}

.workspace-doc-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 11px;
  border: 1px solid var(--editor-border);
  border-radius: 10px;
  background: var(--editor-input-bg);
  color: #64748b;
}

.workspace-doc-search input {
  width: 100%;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--editor-text);
  font-size: 13px;
}

.workspace-section-composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  gap: 8px;
}

.workspace-section-composer input {
  min-width: 0;
  height: 34px;
  border: 1px solid var(--editor-border);
  border-radius: 9px;
  background: var(--editor-input-bg);
  color: var(--editor-text);
  padding: 0 10px;
  font-size: 12px;
  font-weight: 750;
  outline: none;
}

.workspace-section-composer input:focus {
  border-color: rgba(37, 99, 235, 0.42);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
}

.workspace-section-composer button {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 9px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  cursor: pointer;
}

.workspace-section-composer button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.workspace-doc-sections {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
  padding-right: 2px;
}

.workspace-doc-section {
  display: grid;
  gap: 8px;
}

.workspace-doc-section--favorites {
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  padding-bottom: 12px;
}

.workspace-doc-section--recent {
  border-bottom: 1px solid rgba(14, 165, 233, 0.18);
  padding-bottom: 12px;
}

.workspace-doc-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.workspace-doc-group {
  display: grid;
  gap: 6px;
}

.workspace-doc-group__header {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.04);
  padding: 5px;
}

.workspace-doc-group__toggle {
  display: inline-flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 7px;
  border: none;
  background: transparent;
  color: var(--editor-text);
  cursor: pointer;
  padding: 3px;
  text-align: left;
}

.workspace-doc-group__toggle i {
  width: 12px;
  color: #64748b;
  font-size: 10px;
}

.workspace-doc-group__toggle span {
  overflow: hidden;
  min-width: 0;
  flex: 1;
  font-size: 12px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-doc-group__toggle strong {
  display: inline-flex;
  min-width: 22px;
  justify-content: center;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  padding: 2px 6px;
  font-size: 10px;
}

.workspace-doc-group__rename {
  display: grid;
  min-width: 0;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 4px;
  align-items: center;
}

.workspace-doc-group__rename input {
  min-width: 0;
  border: 1px solid rgba(37, 99, 235, 0.28);
  border-radius: 8px;
  background: var(--editor-input-bg);
  color: var(--editor-text);
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 850;
}

.workspace-doc-group__rename input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  outline: none;
}

.workspace-doc-group__actions {
  display: inline-flex;
  flex-shrink: 0;
  gap: 4px;
}

.workspace-doc-group__items {
  display: grid;
  gap: 6px;
  padding-left: 8px;
  border-left: 2px solid rgba(148, 163, 184, 0.18);
}

.workspace-doc-item {
  display: flex;
  width: 100%;
  gap: 10px;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 6px;
  background: transparent;
  color: var(--editor-text);
  text-align: left;
}

.workspace-doc-item:hover,
.workspace-doc-item--active {
  border-color: rgba(37, 99, 235, 0.18);
  background: rgba(37, 99, 235, 0.08);
}

.workspace-doc-item--favorite {
  background: rgba(250, 204, 21, 0.07);
}

.workspace-doc-item--nested {
  padding-left: 4px;
}

.workspace-doc-item__main {
  display: flex;
  min-width: 0;
  flex: 1;
  gap: 10px;
  align-items: flex-start;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  padding: 3px;
}

.workspace-doc-item__icon {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.08);
  color: #334155;
  font-size: 11px;
  font-weight: 900;
}

.workspace-doc-item__icon--shared {
  background: rgba(22, 163, 74, 0.12);
  color: #15803d;
}

.workspace-doc-item__body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.workspace-doc-item__body strong {
  overflow: hidden;
  font-size: 13px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-doc-item__body small {
  color: #64748b;
  font-size: 11px;
  line-height: 1.35;
}

.workspace-doc-item__actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 4px;
  flex: 0 0 auto;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.workspace-doc-item:hover .workspace-doc-item__actions,
.workspace-doc-item:focus-within .workspace-doc-item__actions,
.workspace-doc-item--active .workspace-doc-item__actions,
.workspace-doc-item--favorite .workspace-doc-item__actions {
  opacity: 1;
}

.workspace-doc-action-btn {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  cursor: pointer;
  font-size: 12px;
}

.workspace-doc-action-btn:hover {
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
}

.workspace-doc-action-btn--danger:hover {
  background: rgba(220, 38, 38, 0.12);
  color: #dc2626;
}

.workspace-doc-action-btn--link,
.workspace-doc-action-btn--link:hover {
  color: #1d4ed8;
}

.workspace-doc-action-btn--favorite,
.workspace-doc-action-btn--favorite:hover,
.workspace-doc-action-btn--favorite-active {
  color: #ca8a04;
}

.workspace-doc-action-btn--favorite-active {
  background: rgba(250, 204, 21, 0.16);
}

.workspace-doc-action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.workspace-doc-section-select {
  max-width: 92px;
  height: 28px;
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 8px;
  background: var(--editor-input-bg);
  color: #475569;
  font-size: 11px;
  font-weight: 800;
  outline: none;
}

.workspace-doc-section-select:focus {
  border-color: rgba(37, 99, 235, 0.42);
}

.workspace-doc-empty {
  padding: 10px;
  border-radius: 10px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}

.editor-shell {
  position: relative;
  overflow: visible;
  min-width: 0;
  background: var(--editor-bg);
  color: var(--editor-text);
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  transition: background 0.3s, color 0.3s;
}

.workspace-page-cover {
  height: 112px;
  border-radius: 16px 16px 0 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0)),
    #2563eb;
}

.workspace-page-cover--blue {
  background:
    linear-gradient(135deg, rgba(219, 234, 254, 0.82), rgba(37, 99, 235, 0.18)),
    #2563eb;
}

.workspace-page-cover--green {
  background:
    linear-gradient(135deg, rgba(220, 252, 231, 0.84), rgba(22, 163, 74, 0.18)),
    #16a34a;
}

.workspace-page-cover--amber {
  background:
    linear-gradient(135deg, rgba(254, 243, 199, 0.88), rgba(217, 119, 6, 0.2)),
    #d97706;
}

.workspace-page-cover--rose {
  background:
    linear-gradient(135deg, rgba(255, 228, 230, 0.86), rgba(225, 29, 72, 0.18)),
    #e11d48;
}

.workspace-page-cover--violet {
  background:
    linear-gradient(135deg, rgba(237, 233, 254, 0.86), rgba(124, 58, 237, 0.18)),
    #7c3aed;
}

.workspace-page-cover--slate {
  background:
    linear-gradient(135deg, rgba(226, 232, 240, 0.9), rgba(71, 85, 105, 0.18)),
    #475569;
}

.editor-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid var(--editor-border);
  position: relative;
  z-index: 200;          /* ✅ 추가 */
  overflow: visible;     /* ✅ 추가 */
}

.workspace-title-stack {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 10px;
}

.workspace-page-breadcrumb {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 850;
}

.workspace-page-breadcrumb button {
  display: inline-flex;
  min-width: 0;
  max-width: min(360px, 52vw);
  align-items: center;
  gap: 6px;
  border: none;
  border-radius: 8px;
  background: rgba(100, 116, 139, 0.1);
  color: #334155;
  cursor: pointer;
  padding: 5px 8px;
  font: inherit;
}

.workspace-page-breadcrumb i {
  flex-shrink: 0;
}

.workspace-page-breadcrumb button:hover,
.workspace-page-breadcrumb button:focus-visible {
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
  outline: none;
}

.workspace-page-breadcrumb span {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-page-breadcrumb > span {
  color: #94a3b8;
}

.workspace-title-row {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}

.workspace-page-icon-input {
  width: 54px;
  height: 54px;
  min-width: 54px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 10px;
  background: rgba(248, 250, 252, 0.78);
  color: var(--editor-text);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  font-size: 28px;
  font-weight: 900;
  line-height: 1;
  text-align: center;
  outline: none;
}

.workspace-page-icon-input:focus {
  border-color: rgba(37, 99, 235, 0.45);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.workspace-page-icon-input:disabled {
  cursor: default;
  opacity: 0.78;
}

.editor-header__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-shrink: 0;
}

.title-input {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--editor-text);
  font-size: 34px;
  font-weight: 800;
  line-height: 1.15;
}

.title-input:disabled {
  cursor: default;
  opacity: 0.78;
}

.workspace-document-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.status-pill {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  font-size: 12px;
  font-weight: 800;
}

.status-pill--saved,
.status-pill--live {
  background: rgba(22, 163, 74, 0.12);
  color: #15803d;
}

.status-pill--dirty,
.status-pill--saving {
  background: rgba(245, 158, 11, 0.16);
  color: #b45309;
}

.status-pill--error {
  background: rgba(220, 38, 38, 0.12);
  color: #dc2626;
}

.status-pill--role {
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
}

.status-pill--copied {
  background: rgba(22, 163, 74, 0.12);
  color: #15803d;
}

.status-pill--shared {
  background: rgba(14, 165, 233, 0.12);
  color: #0369a1;
}

.status-pill--public {
  background: rgba(124, 58, 237, 0.12);
  color: #6d28d9;
}

.status-pill--locked {
  background: rgba(15, 23, 42, 0.12);
  color: #0f172a;
}

.status-pill--editable {
  background: rgba(20, 184, 166, 0.12);
  color: #0f766e;
}

.status-pill--muted,
.workspace-document-id {
  background: rgba(100, 116, 139, 0.1);
  color: #64748b;
}

.workspace-document-id {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 800;
}

.save-btn,
.asset-action-btn {
  padding: 9px 14px;
  background: #2563eb;
  color: white;
  border-radius: 10px;
  cursor: pointer;
  border: none;
  font-weight: 700;
  z-index: 10;
}

.save-btn:disabled,
.asset-action-btn:disabled,
.workspace-copy-page-btn:disabled,
.workspace-export-page-btn:disabled,
.workspace-favorite-page-btn:disabled,
.workspace-lock-btn:disabled,
.workspace-share-btn:disabled,
.workspace-floating-item__action:disabled,
.workspace-floating-item__remove:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.workspace-copy-page-btn,
.workspace-export-page-btn,
.workspace-favorite-page-btn,
.workspace-lock-btn,
.workspace-share-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  padding: 9px 14px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 10px;
  background: #ffffff;
  color: #0f172a;
  font-size: 14px;
  font-weight: 800;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.workspace-copy-page-btn:hover:not(:disabled),
.workspace-export-page-btn:hover:not(:disabled),
.workspace-favorite-page-btn:hover:not(:disabled),
.workspace-lock-btn:hover:not(:disabled),
.workspace-share-btn:hover:not(:disabled) {
  border-color: rgba(37, 99, 235, 0.45);
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
}

.workspace-copy-page-btn:disabled,
.workspace-export-page-btn:disabled,
.workspace-favorite-page-btn:disabled,
.workspace-lock-btn:disabled,
.workspace-share-btn:disabled {
  border-color: #94a3b8;
  color: #ffffff;
}

.workspace-lock-btn--locked {
  border-color: rgba(15, 23, 42, 0.28);
  background: rgba(15, 23, 42, 0.08);
  color: #0f172a;
}

.workspace-favorite-page-btn--active {
  border-color: rgba(245, 158, 11, 0.34);
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
}

.workspace-copy-page-btn--copied {
  border-color: rgba(22, 163, 74, 0.34);
  background: rgba(22, 163, 74, 0.1);
  color: #15803d;
}

.workspace-panel-toggle-btn {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 9px 13px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  color: #334155;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.workspace-panel-toggle-btn:hover,
.workspace-panel-toggle-btn--collapsed {
  border-color: rgba(37, 99, 235, 0.42);
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
}

.asset-action-btn--secondary { background: #0f172a; }

.user-presence-wrapper { position: relative; }

.presence-toggle-btn {
  display: inline-flex;
  align-items: center;
  max-width: 260px;
  min-height: 38px;
  gap: 10px;
  padding: 6px 11px 6px 7px;
  background: var(--editor-input-bg);
  border: 1px solid var(--editor-border);
  border-radius: 10px;
  cursor: pointer;
  color: var(--editor-text);
  font-size: 13px;
  font-weight: 800;
}

.presence-avatar-stack {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.presence-avatar {
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  margin-left: -8px;
  border: 2px solid var(--editor-bg);
  border-radius: 999px;
  color: white;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.14);
}

.presence-avatar:first-child { margin-left: 0; }

.presence-avatar--overflow,
.presence-avatar--empty {
  background: #e2e8f0;
  color: #475569;
}

.presence-toggle-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-list-popover {
  position: absolute;
  top: 45px;
  right: 0;
  width: 280px;
  background: var(--editor-bg);
  border: 1px solid var(--editor-border);
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  z-index: 9999;         /* ✅ 1000 → 9999 */
  padding: 16px;
}

.popover-title {
  font-size: 12px;
  color: #888;
  margin-bottom: 12px;
  font-weight: 600;
}

.user-item-list { display: grid; gap: 10px; }

.user-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  font-size: 14px;
  flex-shrink: 0;
}

.user-info { flex: 1; min-width: 0; }

/* ✅ 이름 + 배지 한 줄 */
.user-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.user-name { font-size: 14px; font-weight: 500; }
.me-tag    { font-size: 11px; color: #888; }

.user-subtitle {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
  margin-top: 3px;
  color: #64748b;
  font-size: 11px;
}

.user-subtitle span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.presence-status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #16a34a;
}

.presence-status-dot--away { background: #f59e0b; }

/* ✅ 역할 배지 */
.role-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  margin-left: auto;
  white-space: nowrap;
}
.role-badge--admin { background: rgba(37, 99, 235, 0.12); color: #2563eb; }
.role-badge--write { background: rgba(22, 163, 74, 0.12);  color: #16a34a; }
.role-badge--read  { background: rgba(100, 116, 139, 0.12); color: #64748b; }

/* ✅ 드롭다운 */
.permission-dropdown-wrapper {
  position: relative;
  margin-top: 4px;
}

.permission-dropdown-trigger {
  font-size: 11px;
  color: #2563eb;
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
}

.dropdown-arrow { font-size: 9px; }

.permission-dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 150px;
  background: var(--editor-bg);
  border: 1px solid var(--editor-border);
  border-radius: 10px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  z-index: 2000;
  overflow: hidden;
  padding: 4px 0;
}

.dropdown-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 500;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--editor-text);
  transition: background 0.15s;
}
.dropdown-item:hover { background: rgba(0, 0, 0, 0.05); }

.dropdown-divider {
  height: 1px;
  background: var(--editor-border);
  margin: 4px 0;
}

.dropdown-item--danger       { color: #dc2626; }
.dropdown-item--danger:hover { background: rgba(220, 38, 38, 0.07); }

/* ─── 나머지 기존 스타일 유지 ────────────────────────────────────────────── */

.workspace-property-panel {
  display: grid;
  gap: 12px;
  padding: 14px 20px 16px;
  border-bottom: 1px solid var(--editor-border);
  background: color-mix(in srgb, var(--editor-bg) 97%, #f8fafc 3%);
}

.workspace-property-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.workspace-property-panel__header div:first-child {
  display: grid;
  gap: 2px;
}

.workspace-property-panel__header span {
  color: #64748b;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.workspace-property-panel__header strong {
  color: var(--editor-text);
  font-size: 13px;
  font-weight: 900;
}

.workspace-property-badges,
.workspace-property-tags {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
}

.workspace-property-badge,
.workspace-property-tags span {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  padding: 4px 9px;
  font-size: 11px;
  font-weight: 900;
}

.workspace-property-badge--good,
.workspace-property-badge--done {
  background: rgba(34, 197, 94, 0.13);
  color: #15803d;
}

.workspace-property-badge--warn {
  background: rgba(245, 158, 11, 0.16);
  color: #b45309;
}

.workspace-property-badge--danger {
  background: rgba(220, 38, 38, 0.12);
  color: #b91c1c;
}

.workspace-property-visual-grid {
  display: grid;
  grid-template-columns: minmax(120px, 160px) minmax(0, 1fr);
  align-items: end;
  gap: 8px;
}

.workspace-property-field--cover {
  min-width: 0;
}

.workspace-cover-swatches {
  display: flex;
  min-height: 34px;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.workspace-cover-swatch {
  position: relative;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 8px;
  cursor: pointer;
  outline: none;
}

.workspace-cover-swatch::after {
  position: absolute;
  inset: 8px;
  border: 2px solid rgba(255, 255, 255, 0.95);
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.16);
  content: '';
  opacity: 0;
  transform: scale(0.72);
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.workspace-cover-swatch:hover,
.workspace-cover-swatch:focus-visible {
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.workspace-cover-swatch--active::after {
  opacity: 1;
  transform: scale(1);
}

.workspace-cover-swatch:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.workspace-cover-swatch--blue {
  background: linear-gradient(135deg, #dbeafe, #2563eb);
}

.workspace-cover-swatch--green {
  background: linear-gradient(135deg, #dcfce7, #16a34a);
}

.workspace-cover-swatch--amber {
  background: linear-gradient(135deg, #fef3c7, #d97706);
}

.workspace-cover-swatch--rose {
  background: linear-gradient(135deg, #ffe4e6, #e11d48);
}

.workspace-cover-swatch--violet {
  background: linear-gradient(135deg, #ede9fe, #7c3aed);
}

.workspace-cover-swatch--slate {
  background: linear-gradient(135deg, #e2e8f0, #475569);
}

.workspace-property-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.workspace-property-field {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.workspace-property-field--tags {
  grid-column: span 2;
}

.workspace-property-field span {
  color: #64748b;
  font-size: 11px;
  font-weight: 900;
}

.workspace-property-field input,
.workspace-property-field select {
  width: 100%;
  min-width: 0;
  min-height: 34px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 10px;
  background: var(--editor-input-bg);
  color: var(--editor-text);
  padding: 0 10px;
  font-size: 12px;
  font-weight: 750;
  outline: none;
}

.workspace-property-field input:focus,
.workspace-property-field select:focus {
  border-color: rgba(37, 99, 235, 0.45);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
}

.workspace-property-field input:disabled,
.workspace-property-field select:disabled {
  background: rgba(148, 163, 184, 0.08);
  color: #94a3b8;
  cursor: not-allowed;
}

.workspace-assets {
  padding: 20px;
  border-bottom: 1px solid var(--editor-border);
}

.workspace-assets__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.workspace-assets__summary,
.workspace-assets__hint {
  margin-top: 4px;
  font-size: 13px;
  color: #64748b;
}

.workspace-assets__summary--plain,
.workspace-assets__hint--plain { display: block; }

.workspace-assets__summary:not(.workspace-assets__summary--plain) { display: none; }

.workspace-assets__hint:not(.workspace-assets__hint--plain) { font-size: 0; }
.workspace-assets__hint:not(.workspace-assets__hint--plain)::before {
  content: "처음 파일을 추가하면 워크스페이스가 먼저 저장됩니다.";
  font-size: 13px;
}

.workspace-assets__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.workspace-assets__actions .asset-action-btn:first-of-type { display: none; }

.workspace-assets__actions .asset-action-btn--secondary { font-size: 0; }
.workspace-assets__actions .asset-action-btn--secondary::after {
  content: "파일 추가";
  font-size: 14px;
}

.workspace-assets__error {
  margin-top: 12px;
  color: #dc2626;
  font-size: 13px;
  font-weight: 600;
}

.workspace-assets__loading,
.workspace-assets__empty {
  margin-top: 16px;
  padding: 18px;
  border: 1px dashed var(--editor-border);
  border-radius: 14px;
  font-size: 13px;
  color: #64748b;
  text-align: center;
}

.workspace-assets__group,
.workspace-assets__empty { display: none; }

.workspace-template-panel {
  display: grid;
  gap: 14px;
  margin-bottom: 18px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 16px;
  background: color-mix(in srgb, var(--editor-bg) 96%, #eff6ff 4%);
  padding: 16px;
}

.workspace-template-panel__header h3 {
  margin: 0;
  color: var(--editor-text);
  font-size: 16px;
  font-weight: 900;
}

.workspace-template-panel__header p {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.45;
}

.workspace-template-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.workspace-template-card {
  display: grid;
  min-height: 132px;
  gap: 8px;
  align-content: start;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.66);
  padding: 13px;
  color: #0f172a;
  cursor: pointer;
  text-align: left;
}

.workspace-template-card:hover:not(:disabled) {
  border-color: rgba(37, 99, 235, 0.38);
  background: rgba(37, 99, 235, 0.08);
}

.workspace-template-card:disabled {
  opacity: 0.58;
  cursor: wait;
}

.workspace-template-card__icon {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.1);
  color: #2563eb;
}

.workspace-template-card strong {
  font-size: 13px;
  font-weight: 900;
}

.workspace-template-card span:last-child {
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}

.workspace-assets__loading { font-size: 0; }
.workspace-assets__loading::before {
  content: "첨부 파일을 불러오는 중입니다...";
  font-size: 13px;
}

.workspace-assets__group-header {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 700;
  color: #64748b;
}

.workspace-image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
}

.workspace-image-card,
.workspace-file-card-wrap { position: relative; }

.workspace-image-card {
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid var(--editor-border);
  background: color-mix(in srgb, var(--editor-bg) 96%, #eff6ff 4%);
}

.workspace-image-card__preview {
  display: block;
  aspect-ratio: 16 / 11;
  overflow: hidden;
}

.workspace-image-card__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.workspace-image-card__meta,
.workspace-file-card__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
}

.workspace-image-card__meta strong,
.workspace-file-card__meta strong {
  font-size: 13px;
  line-height: 1.4;
  word-break: break-all;
}

.workspace-image-card__meta span,
.workspace-file-card__meta span {
  font-size: 12px;
  color: #64748b;
}

.workspace-file-list { display: grid; gap: 12px; }

.workspace-file-card {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  text-align: left;
  border: 1px solid var(--editor-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--editor-bg) 97%, #f8fafc 3%);
  padding: 12px 14px;
  cursor: pointer;
}

.workspace-file-card__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(37, 99, 235, 0.12);
  color: #2563eb;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 18px;
}

.asset-remove-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: none;
  background: rgba(15, 23, 42, 0.72);
  color: white;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  z-index: 2;
}

.asset-remove-btn--file { top: 12px; right: 12px; }
.asset-remove-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.workspace-floating-sidebar { position: sticky; top: 24px; }

.workspace-floating-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: calc(100vh - 48px);
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--editor-border);
  background: color-mix(in srgb, var(--editor-bg) 96%, #eff6ff 4%);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
}

.workspace-panel-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  border-bottom: 1px solid var(--editor-border);
  padding-bottom: 12px;
}

.workspace-panel-tab {
  display: inline-flex;
  min-width: 0;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.58);
  color: #64748b;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.workspace-panel-tab strong {
  display: inline-flex;
  min-width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.1);
  color: #475569;
  font-size: 10px;
  font-weight: 900;
}

.workspace-panel-tab--active {
  border-color: rgba(37, 99, 235, 0.38);
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
}

.workspace-panel-tab--active strong {
  background: rgba(37, 99, 235, 0.16);
  color: #1d4ed8;
}

.workspace-review-panel {
  display: grid;
  gap: 14px;
}

.workspace-home-panel {
  display: grid;
  gap: 12px;
}

.workspace-home-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.workspace-home-metric {
  display: grid;
  min-width: 0;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 4px 8px;
  align-items: center;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.64);
  color: var(--editor-text);
  cursor: pointer;
  padding: 10px;
  text-align: left;
}

.workspace-home-metric:hover,
.workspace-home-metric:focus-visible {
  border-color: rgba(37, 99, 235, 0.3);
  background: rgba(37, 99, 235, 0.08);
  outline: none;
}

.workspace-home-metric > span {
  display: inline-flex;
  width: 30px;
  height: 30px;
  grid-row: span 3;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  font-size: 12px;
}

.workspace-home-metric strong {
  color: #0f172a;
  font-size: 16px;
  font-weight: 950;
  line-height: 1;
}

.workspace-home-metric small,
.workspace-home-metric em {
  overflow: hidden;
  color: #64748b;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-home-metric small {
  font-size: 10px;
  font-weight: 900;
}

.workspace-home-metric em {
  font-size: 10px;
  font-style: normal;
  font-weight: 750;
}

.workspace-home-section {
  display: grid;
  gap: 7px;
}

.workspace-home-section__header {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #64748b;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}

.workspace-home-section__header strong {
  display: inline-flex;
  min-width: 22px;
  justify-content: center;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  padding: 2px 7px;
  font-size: 10px;
}

.workspace-home-list,
.workspace-home-recent {
  display: grid;
  gap: 7px;
}

.workspace-home-item,
.workspace-home-recent button {
  display: grid;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 6px 8px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.62);
  color: var(--editor-text);
  cursor: pointer;
  padding: 8px;
  text-align: left;
}

.workspace-home-item {
  grid-template-columns: minmax(68px, 82px) minmax(0, 1fr) 14px;
}

.workspace-home-recent button {
  grid-template-columns: 28px minmax(0, 1fr) auto;
}

.workspace-home-item:hover,
.workspace-home-item:focus-visible,
.workspace-home-recent button:hover,
.workspace-home-recent button:focus-visible {
  border-color: rgba(37, 99, 235, 0.28);
  background: rgba(37, 99, 235, 0.08);
  outline: none;
}

.workspace-home-item--danger {
  border-color: rgba(220, 38, 38, 0.24);
  background: rgba(254, 242, 242, 0.74);
}

.workspace-home-item--warn {
  border-color: rgba(245, 158, 11, 0.24);
  background: rgba(255, 251, 235, 0.78);
}

.workspace-home-item--info {
  border-color: rgba(37, 99, 235, 0.24);
  background: rgba(239, 246, 255, 0.78);
}

.workspace-home-item--muted {
  border-color: rgba(100, 116, 139, 0.22);
}

.workspace-home-item > span,
.workspace-home-recent button > span {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  padding: 4px 7px;
  font-size: 10px;
  font-weight: 900;
}

.workspace-home-recent button > span {
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 14px;
}

.workspace-home-item strong,
.workspace-home-item small,
.workspace-home-recent strong,
.workspace-home-recent small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-home-item strong,
.workspace-home-recent strong {
  color: #0f172a;
  font-size: 12px;
  font-weight: 900;
}

.workspace-home-item small,
.workspace-home-recent small {
  color: #64748b;
  font-size: 10px;
  font-weight: 750;
}

.workspace-home-item > i {
  color: #94a3b8;
  font-size: 11px;
}

.workspace-summary-panel {
  display: grid;
  gap: 12px;
}

.workspace-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.workspace-summary-card {
  display: grid;
  min-width: 0;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 9px;
  align-items: flex-start;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.62);
  padding: 10px;
}

.workspace-summary-card__icon {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  font-size: 13px;
}

.workspace-summary-card div,
.workspace-health-item div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.workspace-summary-card small {
  color: #64748b;
  font-size: 10px;
  font-weight: 900;
}

.workspace-summary-card strong {
  overflow: hidden;
  color: #0f172a;
  font-size: 14px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-summary-card p,
.workspace-health-item p {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: #64748b;
  font-size: 11px;
  font-weight: 750;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-health-list {
  display: grid;
  gap: 7px;
}

.workspace-health-item {
  display: grid;
  min-width: 0;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: flex-start;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.56);
  padding: 9px;
}

.workspace-health-item > span {
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(100, 116, 139, 0.11);
  color: #475569;
  font-size: 12px;
}

.workspace-health-item strong {
  color: #0f172a;
  font-size: 12px;
  font-weight: 900;
}

.workspace-health-item--good > span {
  background: rgba(34, 197, 94, 0.13);
  color: #15803d;
}

.workspace-health-item--warn > span {
  background: rgba(245, 158, 11, 0.15);
  color: #b45309;
}

.workspace-health-item--danger > span {
  background: rgba(220, 38, 38, 0.12);
  color: #b91c1c;
}

.workspace-summary-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.workspace-summary-actions button {
  display: inline-flex;
  min-width: 0;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
  cursor: pointer;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 900;
}

.workspace-summary-actions span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-collaboration-panel {
  display: grid;
  gap: 14px;
}

.workspace-assets-panel {
  display: grid;
  gap: 12px;
}

.workspace-collaboration-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.workspace-collaboration-summary__item {
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.62);
  padding: 10px;
}

.workspace-collaboration-summary__item span,
.workspace-permission-chip span {
  display: block;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
}

.workspace-collaboration-summary__item strong,
.workspace-permission-chip strong {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: #0f172a;
  font-size: 13px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-permission-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.workspace-permission-chip {
  display: grid;
  gap: 4px;
  min-width: 0;
  border: 1px solid rgba(34, 197, 94, 0.24);
  border-radius: 12px;
  background: rgba(34, 197, 94, 0.08);
  padding: 10px;
}

.workspace-permission-chip--disabled {
  border-color: rgba(148, 163, 184, 0.28);
  background: rgba(148, 163, 184, 0.09);
}

.workspace-permission-chip--disabled strong {
  color: #64748b;
}

.workspace-collaboration-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.workspace-collaboration-action {
  display: inline-flex;
  min-width: 0;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(37, 99, 235, 0.24);
  border-radius: 12px;
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.workspace-collaboration-action:disabled {
  border-color: rgba(148, 163, 184, 0.28);
  background: rgba(148, 163, 184, 0.12);
  color: #94a3b8;
  cursor: not-allowed;
}

.workspace-member-panel {
  display: grid;
  gap: 10px;
  border-top: 1px solid var(--editor-border);
  padding-top: 14px;
}

.workspace-member-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.workspace-member-panel__header h4 {
  margin: 0;
  color: #0f172a;
  font-size: 14px;
  font-weight: 900;
}

.workspace-member-panel__header p {
  margin: 3px 0 0;
  color: #64748b;
  font-size: 12px;
}

.workspace-member-refresh-btn {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.62);
  color: #475569;
  cursor: pointer;
}

.workspace-member-refresh-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.workspace-member-error,
.workspace-member-empty {
  margin: 0;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 700;
}

.workspace-member-error {
  background: rgba(244, 63, 94, 0.1);
  color: #be123c;
}

.workspace-member-empty {
  background: rgba(148, 163, 184, 0.1);
  color: #64748b;
}

.workspace-member-list {
  display: grid;
  gap: 8px;
}

.workspace-member-item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.62);
  padding: 9px;
}

.workspace-member-avatar {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 900;
}

.workspace-member-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.workspace-member-meta {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.workspace-member-name-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.workspace-member-name-row strong {
  overflow: hidden;
  color: #0f172a;
  font-size: 13px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-member-meta > span {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.workspace-member-online {
  flex-shrink: 0;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.14);
  color: #64748b;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 900;
}

.workspace-member-online--active {
  background: rgba(34, 197, 94, 0.13);
  color: #15803d;
}

.workspace-member-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.workspace-member-actions select {
  min-height: 32px;
  max-width: 88px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 10px;
  background: #ffffff;
  color: #0f172a;
  font-size: 12px;
  font-weight: 800;
}

.workspace-member-actions button {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(244, 63, 94, 0.2);
  border-radius: 10px;
  background: rgba(244, 63, 94, 0.08);
  color: #be123c;
  cursor: pointer;
}

.workspace-member-actions select:disabled,
.workspace-member-actions button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.workspace-workload-panel {
  display: grid;
  gap: 12px;
}

.workspace-workload-list {
  display: grid;
  gap: 10px;
}

.workspace-workload-person {
  display: grid;
  gap: 10px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.64);
  padding: 10px;
}

.workspace-workload-person--me {
  border-color: rgba(37, 99, 235, 0.28);
  background: rgba(37, 99, 235, 0.06);
}

.workspace-workload-person--overdue {
  border-color: rgba(220, 38, 38, 0.26);
}

.workspace-workload-person__header {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
}

.workspace-workload-avatar {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 950;
}

.workspace-workload-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.workspace-workload-person__identity {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.workspace-workload-person__identity strong,
.workspace-workload-person__identity small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-workload-person__identity strong {
  color: #0f172a;
  font-size: 13px;
  font-weight: 950;
}

.workspace-workload-person__identity small {
  color: #64748b;
  font-size: 11px;
  font-weight: 750;
}

.workspace-workload-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.workspace-workload-stats span {
  display: grid;
  min-width: 0;
  gap: 2px;
  border-radius: 10px;
  background: rgba(100, 116, 139, 0.1);
  padding: 7px 6px;
  text-align: center;
}

.workspace-workload-stats strong {
  color: #0f172a;
  font-size: 13px;
  font-weight: 950;
}

.workspace-workload-stats small {
  overflow: hidden;
  color: #64748b;
  font-size: 10px;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-workload-stat--danger {
  background: rgba(220, 38, 38, 0.12) !important;
}

.workspace-workload-stat--danger strong,
.workspace-workload-stat--danger small {
  color: #b91c1c;
}

.workspace-workload-section {
  display: grid;
  gap: 6px;
}

.workspace-workload-section__title {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #64748b;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}

.workspace-workload-section__title strong {
  display: inline-flex;
  min-width: 22px;
  justify-content: center;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  padding: 2px 7px;
  font-size: 10px;
}

.workspace-workload-link {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 10px;
  background: rgba(248, 250, 252, 0.72);
  color: var(--editor-text);
  cursor: pointer;
  padding: 7px;
  text-align: left;
}

.workspace-workload-link:hover,
.workspace-workload-link:focus-visible {
  border-color: rgba(37, 99, 235, 0.28);
  background: rgba(37, 99, 235, 0.08);
  outline: none;
}

.workspace-workload-link--danger {
  border-color: rgba(220, 38, 38, 0.22);
  background: rgba(254, 242, 242, 0.78);
}

.workspace-workload-link > span {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(100, 116, 139, 0.1);
  font-size: 13px;
}

.workspace-workload-link strong,
.workspace-workload-link small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-workload-link strong {
  color: #0f172a;
  font-size: 12px;
  font-weight: 900;
}

.workspace-workload-link small {
  color: #64748b;
  font-size: 10px;
  font-weight: 750;
}

.workspace-fulltext-panel {
  display: grid;
  gap: 12px;
}

.workspace-fulltext-search {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.workspace-fulltext-search label {
  display: flex;
  min-width: 0;
  height: 38px;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 10px;
  background: var(--editor-input-bg);
  color: #64748b;
  padding: 0 11px;
}

.workspace-fulltext-search input {
  width: 100%;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--editor-text);
  font-size: 13px;
  font-weight: 750;
}

.workspace-fulltext-search button {
  display: inline-flex;
  min-width: 72px;
  height: 38px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  border-radius: 10px;
  background: #2563eb;
  color: #ffffff;
  cursor: pointer;
  font-size: 12px;
  font-weight: 900;
}

.workspace-fulltext-search button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.workspace-fulltext-results {
  display: grid;
  gap: 8px;
}

.workspace-fulltext-result {
  display: grid;
  gap: 7px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.62);
  padding: 9px;
}

.workspace-fulltext-result:hover,
.workspace-fulltext-result:focus-within {
  border-color: rgba(37, 99, 235, 0.28);
  background: rgba(37, 99, 235, 0.08);
}

.workspace-fulltext-result__main {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: 32px minmax(0, 1fr) 14px;
  align-items: center;
  gap: 9px;
  border: none;
  background: transparent;
  color: var(--editor-text);
  cursor: pointer;
  padding: 0 38px 0 0;
  text-align: left;
}

.workspace-fulltext-result__icon {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  font-size: 12px;
}

.workspace-fulltext-result__icon--shared {
  background: rgba(22, 163, 74, 0.12);
  color: #15803d;
}

.workspace-fulltext-result__body {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.workspace-fulltext-result__body strong,
.workspace-fulltext-result__body small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-fulltext-result__body strong {
  color: #0f172a;
  font-size: 13px;
  font-weight: 900;
}

.workspace-fulltext-result__body small {
  color: #64748b;
  font-size: 11px;
  font-weight: 750;
}

.workspace-fulltext-result > p {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.workspace-fulltext-result__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.workspace-fulltext-result__actions button {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  cursor: pointer;
}

.workspace-fulltext-result__actions button:hover {
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
}

.workspace-fulltext-result__actions button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.workspace-page-tree-panel {
  display: grid;
  gap: 12px;
}

.workspace-page-tree-list {
  display: grid;
  gap: 6px;
}

.workspace-page-tree-search {
  display: grid;
  min-width: 0;
  min-height: 34px;
  grid-template-columns: 18px minmax(0, 1fr) 26px;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 10px;
  background: var(--editor-input-bg);
  color: #64748b;
  padding: 0 9px;
}

.workspace-page-tree-search input {
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--editor-text);
  font-size: 12px;
  font-weight: 800;
}

.workspace-page-tree-search button {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 7px;
  background: rgba(100, 116, 139, 0.12);
  color: #64748b;
  cursor: pointer;
  font-size: 10px;
}

.workspace-page-tree-item {
  display: grid;
  min-width: 0;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.68);
  padding: 7px 8px 7px var(--workspace-tree-indent, 8px);
}

.workspace-page-tree-item--active {
  border-color: rgba(37, 99, 235, 0.36);
  background: rgba(37, 99, 235, 0.09);
}

.workspace-page-tree-item--overdue {
  border-color: rgba(220, 38, 38, 0.22);
}

.workspace-page-tree-item--matched {
  border-color: rgba(14, 165, 233, 0.32);
  background: rgba(240, 249, 255, 0.88);
}

.workspace-page-tree-toggle,
.workspace-page-tree-actions button {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 7px;
  background: rgba(100, 116, 139, 0.1);
  color: #64748b;
  cursor: pointer;
  font-size: 10px;
}

.workspace-page-tree-toggle--empty {
  background: transparent;
  cursor: default;
}

.workspace-page-tree-main {
  display: grid;
  min-width: 0;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: var(--editor-text);
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.workspace-page-tree-icon {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: rgba(37, 99, 235, 0.1);
  font-size: 14px;
}

.workspace-page-tree-body {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.workspace-page-tree-body strong,
.workspace-page-tree-body small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-page-tree-body strong {
  color: #0f172a;
  font-size: 12px;
  font-weight: 900;
}

.workspace-page-tree-body small {
  color: #64748b;
  font-size: 10px;
  font-weight: 750;
}

.workspace-page-tree-actions {
  display: inline-flex;
  gap: 4px;
}

.workspace-page-tree-toggle:hover,
.workspace-page-tree-actions button:hover:not(:disabled) {
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
}

.workspace-page-tree-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.46;
}

.workspace-page-tree-composer {
  display: grid;
  min-width: 0;
  grid-column: 1 / -1;
  grid-template-columns: minmax(0, 1fr) 28px 28px;
  align-items: center;
  gap: 6px;
  padding-left: 30px;
}

.workspace-page-tree-composer label {
  display: grid;
  min-width: 0;
  min-height: 32px;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(37, 99, 235, 0.22);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.82);
  color: #64748b;
  padding: 0 9px;
}

.workspace-page-tree-composer--rename label {
  border-color: rgba(14, 165, 233, 0.24);
  background: rgba(240, 249, 255, 0.88);
}

.workspace-page-tree-composer--move label {
  border-color: rgba(124, 58, 237, 0.24);
  background: rgba(245, 243, 255, 0.9);
}

.workspace-page-tree-composer input,
.workspace-page-tree-composer select {
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--editor-text);
  font-size: 12px;
  font-weight: 800;
}

.workspace-page-tree-composer select {
  width: 100%;
  cursor: pointer;
}

.workspace-page-tree-composer button {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
  cursor: pointer;
  font-size: 11px;
}

.workspace-page-tree-composer button:last-child {
  background: rgba(100, 116, 139, 0.12);
  color: #64748b;
}

.workspace-page-tree-composer button:disabled,
.workspace-page-tree-composer input:disabled,
.workspace-page-tree-composer select:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.workspace-page-index-panel {
  display: grid;
  gap: 12px;
}

.workspace-page-index-filters {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}

.workspace-page-index-filters button {
  display: flex;
  min-width: 0;
  min-height: 34px;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.62);
  color: #475569;
  cursor: pointer;
  padding: 6px 8px;
  font-size: 11px;
  font-weight: 900;
}

.workspace-page-index-filters button span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-page-index-filters button strong {
  flex-shrink: 0;
  color: #1d4ed8;
  font-size: 10px;
}

.workspace-page-index-filter--active {
  border-color: rgba(37, 99, 235, 0.32) !important;
  background: rgba(37, 99, 235, 0.1) !important;
  color: #1d4ed8 !important;
}

.workspace-page-index-tools {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(128px, 170px) minmax(132px, 190px);
  align-items: end;
  gap: 8px;
}

.workspace-page-index-search {
  display: grid;
  min-width: 0;
  min-height: 34px;
  grid-template-columns: 18px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 10px;
  background: var(--editor-input-bg);
  padding: 0 6px 0 10px;
}

.workspace-page-index-search i {
  color: #94a3b8;
  font-size: 12px;
}

.workspace-page-index-search input {
  min-width: 0;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--editor-text);
  font-size: 12px;
  font-weight: 800;
  outline: none;
}

.workspace-page-index-search button {
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: rgba(100, 116, 139, 0.12);
  color: #64748b;
  cursor: pointer;
}

.workspace-page-index-sort,
.workspace-page-index-owner-filter {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.workspace-page-index-sort span,
.workspace-page-index-owner-filter span {
  color: #64748b;
  font-size: 10px;
  font-weight: 900;
}

.workspace-page-index-sort select,
.workspace-page-index-owner-filter select {
  min-width: 0;
  height: 34px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 10px;
  background: var(--editor-input-bg);
  color: var(--editor-text);
  padding: 0 8px;
  font-size: 12px;
  font-weight: 850;
  outline: none;
}

.workspace-page-index-tag-filter {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
}

.workspace-page-index-tag-filter button {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.68);
  color: #475569;
  cursor: pointer;
  padding: 4px 9px;
  font-size: 11px;
  font-weight: 850;
}

.workspace-page-index-tag-filter button strong {
  color: #1d4ed8;
  font-size: 10px;
}

.workspace-page-index-tag-filter--active {
  border-color: rgba(37, 99, 235, 0.35) !important;
  background: rgba(37, 99, 235, 0.1) !important;
  color: #1d4ed8 !important;
}

.workspace-page-index-views {
  display: grid;
  gap: 8px;
}

.workspace-page-index-view-list {
  display: grid;
  gap: 6px;
}

.workspace-page-index-view-list > span {
  color: #64748b;
  font-size: 10px;
  font-weight: 900;
}

.workspace-page-index-view-list > div {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
}

.workspace-page-index-view-pill {
  display: inline-grid;
  min-width: min(100%, 170px);
  max-width: 240px;
  grid-template-columns: minmax(0, 1fr) 28px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.68);
}

.workspace-page-index-view-pill--active {
  border-color: rgba(37, 99, 235, 0.34);
  background: rgba(37, 99, 235, 0.08);
}

.workspace-page-index-view-pill button {
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--editor-text);
  cursor: pointer;
}

.workspace-page-index-view-pill button:first-child {
  display: grid;
  gap: 2px;
  padding: 7px 8px;
  text-align: left;
}

.workspace-page-index-view-pill button:last-child {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
}

.workspace-page-index-view-pill strong,
.workspace-page-index-view-pill small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-page-index-view-pill strong {
  font-size: 11px;
  font-weight: 900;
}

.workspace-page-index-view-pill small {
  color: #64748b;
  font-size: 10px;
  font-weight: 750;
}

.workspace-page-index-view-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 58px;
  gap: 6px;
}

.workspace-page-index-view-form label {
  display: grid;
  min-width: 0;
  min-height: 34px;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 10px;
  background: var(--editor-input-bg);
  padding: 0 10px;
}

.workspace-page-index-view-form i {
  color: #94a3b8;
  font-size: 12px;
}

.workspace-page-index-view-form input {
  min-width: 0;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--editor-text);
  font-size: 12px;
  font-weight: 800;
  outline: none;
}

.workspace-page-index-view-form > button {
  border: none;
  border-radius: 10px;
  background: #111827;
  color: white;
  cursor: pointer;
  font-size: 12px;
  font-weight: 900;
}

.workspace-page-index-view-form > button:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.workspace-page-index-bulk {
  display: grid;
  gap: 8px;
}

.workspace-page-index-select-visible {
  display: inline-flex;
  width: max-content;
  max-width: 100%;
  min-height: 32px;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.68);
  color: #475569;
  cursor: pointer;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 900;
}

.workspace-page-index-select-visible input {
  accent-color: #2563eb;
}

.workspace-page-index-select-visible:has(input:disabled) {
  cursor: not-allowed;
  opacity: 0.55;
}

.workspace-page-index-select-visible strong {
  color: #1d4ed8;
}

.workspace-page-index-bulk-actions {
  display: grid;
  grid-template-columns: minmax(74px, auto) repeat(4, minmax(108px, 1fr)) minmax(96px, auto) auto auto;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 12px;
  background: rgba(37, 99, 235, 0.07);
  padding: 8px;
}

.workspace-page-index-bulk-actions > span {
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 900;
  white-space: nowrap;
}

.workspace-page-index-bulk-actions select,
.workspace-page-index-bulk-actions input,
.workspace-page-index-bulk-actions button {
  min-width: 0;
  height: 32px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 9px;
  background: var(--editor-input-bg);
  color: var(--editor-text);
  padding: 0 8px;
  font-size: 11px;
  font-weight: 850;
}

.workspace-page-index-bulk-actions button {
  border: none;
  background: #111827;
  color: #fff;
  cursor: pointer;
}

.workspace-page-index-bulk-actions button:last-child {
  background: rgba(100, 116, 139, 0.14);
  color: #475569;
}

.workspace-page-index-bulk-actions button:disabled,
.workspace-page-index-bulk-actions input:disabled,
.workspace-page-index-bulk-actions select:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.workspace-page-index-bulk-check {
  display: inline-flex;
  min-width: 0;
  height: 32px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.62);
  color: #475569;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 850;
  white-space: nowrap;
}

.workspace-page-index-bulk-check input {
  width: 14px;
  height: 14px;
  accent-color: #2563eb;
}

.workspace-page-index-list {
  display: grid;
  gap: 8px;
}

.workspace-page-index-row {
  position: relative;
  display: grid;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.62);
  padding: 10px;
}

.workspace-page-index-row--overdue {
  border-color: rgba(220, 38, 38, 0.24);
  background: rgba(254, 242, 242, 0.72);
}

.workspace-page-index-row--locked {
  border-color: rgba(15, 23, 42, 0.18);
  background: rgba(248, 250, 252, 0.78);
}

.workspace-page-index-row--locked .workspace-page-index-row__icon {
  background: rgba(15, 23, 42, 0.08);
  color: #334155;
}

.workspace-page-index-row__main {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  border: none;
  background: transparent;
  color: var(--editor-text);
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.workspace-page-index-row__select {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.workspace-page-index-row__select input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.workspace-page-index-row__select span {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.82);
  color: transparent;
  font-size: 11px;
}

.workspace-page-index-row__select input:checked + span {
  border-color: rgba(37, 99, 235, 0.5);
  background: #2563eb;
  color: #fff;
}

.workspace-page-index-row__select input:disabled + span {
  background: rgba(148, 163, 184, 0.12);
  cursor: not-allowed;
  opacity: 0.5;
}

.workspace-page-index-row__icon {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  font-size: 19px;
  font-weight: 900;
}

.workspace-page-index-row__body {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.workspace-page-index-row__body strong,
.workspace-page-index-row__body small,
.workspace-page-index-row__body em {
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-page-index-row__body strong,
.workspace-page-index-row__body small {
  white-space: nowrap;
}

.workspace-page-index-row__body strong {
  color: #0f172a;
  font-size: 13px;
  font-style: normal;
  font-weight: 900;
}

.workspace-page-index-row__body small,
.workspace-page-index-row__body em {
  color: #64748b;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  line-height: 1.4;
}

.workspace-page-index-row__props,
.workspace-page-index-tags {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
}

.workspace-page-index-edit {
  display: inline-grid;
  min-width: 112px;
  gap: 4px;
}

.workspace-page-index-edit span {
  color: #64748b;
  font-size: 10px;
  font-weight: 900;
}

.workspace-page-index-edit select,
.workspace-page-index-edit input {
  min-width: 0;
  height: 30px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 8px;
  background: var(--editor-input-bg);
  color: var(--editor-text);
  padding: 0 8px;
  font-size: 11px;
  font-weight: 850;
  outline: none;
}

.workspace-page-index-edit select:disabled,
.workspace-page-index-edit input:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.workspace-page-index-edit--date {
  min-width: 132px;
}

.workspace-page-index-edit--owner {
  min-width: 132px;
}

.workspace-page-index-edit--tags {
  min-width: 180px;
  max-width: 260px;
  flex: 1 1 180px;
}

.workspace-page-index-chip,
.workspace-page-index-tags span,
.workspace-page-index-tags button {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  gap: 5px;
  border: none;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  cursor: pointer;
  padding: 4px 9px;
  font-size: 11px;
  font-weight: 850;
}

.workspace-page-index-tags button:hover,
.workspace-page-index-tag--active {
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
}

.workspace-page-index-chip--danger {
  background: rgba(220, 38, 38, 0.12);
  color: #b91c1c;
}

.workspace-board-panel {
  display: grid;
  gap: 12px;
}

.workspace-board-columns {
  display: grid;
  grid-auto-columns: minmax(190px, 220px);
  grid-auto-flow: column;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 3px;
}

.workspace-board-column {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.76);
  padding: 9px;
  transition: background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.workspace-board-column--good {
  border-color: rgba(22, 163, 74, 0.22);
}

.workspace-board-column--warn {
  border-color: rgba(217, 119, 6, 0.24);
}

.workspace-board-column--danger {
  border-color: rgba(220, 38, 38, 0.24);
}

.workspace-board-column--done {
  border-color: rgba(79, 70, 229, 0.22);
}

.workspace-board-column--drop-target {
  border-color: rgba(37, 99, 235, 0.42);
  background: rgba(239, 246, 255, 0.88);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.12);
}

.workspace-board-column__header {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.workspace-board-column__header span {
  overflow: hidden;
  color: #0f172a;
  font-size: 12px;
  font-weight: 950;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-board-column__header strong {
  display: inline-flex;
  min-width: 24px;
  justify-content: center;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 950;
}

.workspace-board-column__tasks,
.workspace-board-empty {
  color: #64748b;
  font-size: 11px;
  font-weight: 750;
}

.workspace-board-empty {
  border: 1px dashed rgba(148, 163, 184, 0.28);
  border-radius: 10px;
  padding: 14px 8px;
  text-align: center;
}

.workspace-board-card {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.76);
  padding: 8px;
  transition: background 0.16s ease, border-color 0.16s ease, opacity 0.16s ease, transform 0.16s ease;
}

.workspace-board-card:hover,
.workspace-board-card:focus-within {
  border-color: rgba(37, 99, 235, 0.28);
  background: rgba(37, 99, 235, 0.08);
}

.workspace-board-card--overdue {
  border-color: rgba(220, 38, 38, 0.28);
  background: rgba(254, 242, 242, 0.82);
}

.workspace-board-card--locked {
  border-color: rgba(15, 23, 42, 0.18);
  background: rgba(248, 250, 252, 0.86);
}

.workspace-board-card--draggable {
  cursor: grab;
}

.workspace-board-card--dragging {
  border-style: dashed;
  opacity: 0.56;
  transform: scale(0.985);
}

.workspace-board-card__main {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: var(--editor-text);
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.workspace-board-card__icon {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: rgba(37, 99, 235, 0.1);
  font-size: 15px;
}

.workspace-board-card__body {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.workspace-board-card__body strong,
.workspace-board-card__body small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-board-card__body strong {
  color: #0f172a;
  font-size: 12px;
  font-weight: 900;
}

.workspace-board-card__body small {
  color: #64748b;
  font-size: 10px;
  font-weight: 750;
}

.workspace-board-card__meta {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 5px;
}

.workspace-board-card__meta > span:not(.workspace-property-badge) {
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  padding: 3px 8px;
  font-size: 10px;
  font-weight: 850;
}

.workspace-board-chip--danger {
  background: rgba(220, 38, 38, 0.12) !important;
  color: #b91c1c !important;
}

.workspace-board-card__actions {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 28px;
  gap: 6px;
}

.workspace-board-card__actions button,
.workspace-board-card__actions select {
  height: 28px;
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 8px;
  background: var(--editor-input-bg);
  color: var(--editor-text);
  font-size: 11px;
  font-weight: 850;
}

.workspace-board-card__actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.workspace-board-card__actions select {
  padding: 0 6px;
}

.workspace-board-card__actions button:hover:not(:disabled) {
  border-color: rgba(37, 99, 235, 0.35);
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
}

.workspace-board-card__actions button:disabled,
.workspace-board-card__actions select:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.workspace-timeline-panel {
  display: grid;
  gap: 12px;
}

.workspace-timeline-filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.workspace-timeline-filters button {
  display: grid;
  min-width: 0;
  gap: 3px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.64);
  color: #64748b;
  cursor: pointer;
  padding: 7px 5px;
  text-align: center;
}

.workspace-timeline-filters button span,
.workspace-timeline-filters button strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-timeline-filters button span {
  font-size: 10px;
  font-weight: 850;
}

.workspace-timeline-filters button strong {
  color: #0f172a;
  font-size: 12px;
  font-weight: 950;
}

.workspace-timeline-filter--active {
  border-color: rgba(37, 99, 235, 0.35) !important;
  background: rgba(37, 99, 235, 0.1) !important;
  color: #1d4ed8 !important;
}

.workspace-timeline-board {
  display: grid;
  gap: 12px;
}

.workspace-timeline-scale {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.66);
  color: #64748b;
  padding: 8px 10px;
  font-size: 11px;
  font-weight: 850;
}

.workspace-timeline-scale span:first-child {
  text-align: left;
}

.workspace-timeline-scale span:last-child {
  text-align: right;
}

.workspace-timeline-scale strong {
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 950;
  white-space: nowrap;
}

.workspace-timeline-group {
  display: grid;
  gap: 8px;
}

.workspace-timeline-group__header {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #475569;
  font-size: 12px;
  font-weight: 950;
}

.workspace-timeline-group__header strong {
  display: inline-flex;
  min-width: 24px;
  justify-content: center;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  padding: 2px 7px;
  font-size: 10px;
}

.workspace-timeline-item {
  display: grid;
  gap: 6px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.66);
  padding: 8px;
}

.workspace-timeline-item--overdue {
  border-color: rgba(220, 38, 38, 0.28);
  background: rgba(254, 242, 242, 0.72);
}

.workspace-timeline-item--done {
  opacity: 0.72;
}

.workspace-timeline-item__track {
  position: relative;
  display: block;
  height: 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(37, 99, 235, 0.08), rgba(14, 165, 233, 0.16));
}

.workspace-timeline-item__track::before {
  content: "";
  position: absolute;
  top: 6px;
  right: 0;
  left: 0;
  height: 2px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.18);
}

.workspace-timeline-item__track i {
  position: absolute;
  top: 50%;
  left: var(--workspace-timeline-offset, 0%);
  width: 12px;
  height: 12px;
  border: 2px solid #ffffff;
  border-radius: 999px;
  background: #2563eb;
  box-shadow: 0 4px 10px rgba(37, 99, 235, 0.22);
  transform: translate(-50%, -50%);
}

.workspace-timeline-item--task .workspace-timeline-item__track i {
  background: #0f766e;
}

.workspace-timeline-item--overdue .workspace-timeline-item__track i {
  background: #dc2626;
}

.workspace-timeline-item__content {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: start;
  gap: 9px;
}

.workspace-timeline-item__icon,
.workspace-timeline-item__toggle {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 950;
}

.workspace-timeline-item__icon {
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
}

.workspace-timeline-item__toggle {
  border: none;
  background: rgba(15, 118, 110, 0.12);
  color: #0f766e;
  cursor: pointer;
}

.workspace-timeline-item__toggle:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.workspace-timeline-item__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 14px;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.workspace-timeline-item__main > i {
  color: #94a3b8;
  font-size: 11px;
}

.workspace-timeline-item__body {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.workspace-timeline-item__body strong,
.workspace-timeline-item__body small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-timeline-item__body strong {
  color: #0f172a;
  font-size: 13px;
  font-weight: 950;
}

.workspace-timeline-item__body small {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.workspace-timeline-item__meta {
  display: inline-flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 5px;
  color: #64748b;
  font-size: 10px;
  font-weight: 850;
}

.workspace-calendar-panel {
  display: grid;
  gap: 12px;
}

.workspace-calendar-filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.workspace-calendar-filters button {
  display: grid;
  min-width: 0;
  gap: 3px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.64);
  color: #64748b;
  cursor: pointer;
  padding: 7px 5px;
  text-align: center;
}

.workspace-calendar-filters button span,
.workspace-calendar-filters button strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-calendar-filters button span {
  font-size: 10px;
  font-weight: 850;
}

.workspace-calendar-filters button strong {
  color: #0f172a;
  font-size: 12px;
  font-weight: 950;
}

.workspace-calendar-filter--active {
  border-color: rgba(37, 99, 235, 0.35) !important;
  background: rgba(37, 99, 235, 0.1) !important;
  color: #1d4ed8 !important;
}

.workspace-calendar-groups {
  display: grid;
  gap: 10px;
}

.workspace-calendar-group {
  display: grid;
  gap: 7px;
  border-left: 2px solid rgba(37, 99, 235, 0.28);
  padding-left: 9px;
}

.workspace-calendar-group--overdue {
  border-left-color: rgba(220, 38, 38, 0.42);
}

.workspace-calendar-group__header {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #475569;
  font-size: 12px;
  font-weight: 950;
}

.workspace-calendar-group__header strong {
  display: inline-flex;
  min-width: 24px;
  justify-content: center;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  padding: 2px 7px;
  font-size: 10px;
}

.workspace-calendar-item {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: start;
  gap: 9px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.64);
  padding: 8px;
}

.workspace-calendar-item:hover,
.workspace-calendar-item:focus-within {
  border-color: rgba(37, 99, 235, 0.28);
  background: rgba(37, 99, 235, 0.08);
}

.workspace-calendar-item--overdue {
  border-color: rgba(220, 38, 38, 0.28);
  background: rgba(254, 242, 242, 0.78);
}

.workspace-calendar-item--done {
  opacity: 0.68;
}

.workspace-calendar-item__toggle,
.workspace-calendar-item__icon {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 9px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  font-size: 12px;
}

.workspace-calendar-item__toggle {
  cursor: pointer;
}

.workspace-calendar-item__toggle:hover,
.workspace-calendar-item__toggle:focus-visible {
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
  outline: none;
}

.workspace-calendar-item__toggle:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.workspace-calendar-item__main {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) 14px;
  align-items: start;
  gap: 8px;
  border: none;
  background: transparent;
  color: var(--editor-text);
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.workspace-calendar-item__body {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.workspace-calendar-item__body strong,
.workspace-calendar-item__body small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-calendar-item__body strong {
  color: #0f172a;
  font-size: 13px;
  font-weight: 900;
}

.workspace-calendar-item--done .workspace-calendar-item__body strong {
  text-decoration: line-through;
}

.workspace-calendar-item__body small {
  color: #64748b;
  font-size: 11px;
  font-weight: 750;
}

.workspace-calendar-item__meta {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 5px;
}

.workspace-calendar-item__meta > span:not(.workspace-property-badge) {
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  padding: 3px 8px;
  font-size: 10px;
  font-weight: 850;
}

.workspace-calendar-item__main > i {
  color: #94a3b8;
  font-size: 11px;
  margin-top: 8px;
}

.workspace-inbox-panel {
  display: grid;
  gap: 12px;
}

.workspace-inbox-filters {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}

.workspace-inbox-filters button {
  display: grid;
  min-width: 0;
  gap: 3px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.64);
  color: #64748b;
  cursor: pointer;
  padding: 7px 5px;
  text-align: center;
}

.workspace-inbox-filters button span,
.workspace-inbox-filters button strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-inbox-filters button span {
  font-size: 10px;
  font-weight: 850;
}

.workspace-inbox-filters button strong {
  color: #0f172a;
  font-size: 12px;
  font-weight: 950;
}

.workspace-inbox-filter--active {
  border-color: rgba(37, 99, 235, 0.35) !important;
  background: rgba(37, 99, 235, 0.1) !important;
  color: #1d4ed8 !important;
}

.workspace-inbox-list {
  display: grid;
  gap: 8px;
}

.workspace-inbox-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: start;
  gap: 9px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.62);
  padding: 8px;
}

.workspace-inbox-item:hover,
.workspace-inbox-item:focus-within {
  border-color: rgba(37, 99, 235, 0.28);
  background: rgba(37, 99, 235, 0.08);
}

.workspace-inbox-item--mine {
  border-color: rgba(37, 99, 235, 0.28);
}

.workspace-inbox-item--overdue {
  border-color: rgba(220, 38, 38, 0.28);
  background: rgba(254, 242, 242, 0.78);
}

.workspace-inbox-item--done {
  opacity: 0.68;
}

.workspace-inbox-item__main {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) 14px;
  align-items: start;
  gap: 9px;
  border: none;
  background: transparent;
  color: var(--editor-text);
  cursor: pointer;
  padding: 1px;
  text-align: left;
}

.workspace-inbox-item__toggle {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 9px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  cursor: pointer;
  font-size: 11px;
}

.workspace-inbox-item__toggle:hover,
.workspace-inbox-item__toggle:focus-visible {
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
  outline: none;
}

.workspace-inbox-item__toggle:disabled {
  cursor: wait;
  opacity: 0.58;
}

.workspace-inbox-item--done .workspace-inbox-item__toggle {
  background: rgba(22, 163, 74, 0.12);
  color: #15803d;
}

.workspace-inbox-item--overdue .workspace-inbox-item__toggle {
  background: rgba(220, 38, 38, 0.12);
  color: #b91c1c;
}

.workspace-inbox-item__body {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.workspace-inbox-item__body strong,
.workspace-inbox-item__body small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-inbox-item__body strong {
  color: #0f172a;
  font-size: 13px;
  font-weight: 900;
}

.workspace-inbox-item--done .workspace-inbox-item__body strong {
  text-decoration: line-through;
}

.workspace-inbox-item__body small {
  color: #64748b;
  font-size: 11px;
  font-weight: 750;
}

.workspace-inbox-item__meta {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 5px;
}

.workspace-inbox-item__meta span {
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  padding: 3px 8px;
  font-size: 10px;
  font-weight: 850;
}

.workspace-inbox-item__meta--danger {
  background: rgba(220, 38, 38, 0.12) !important;
  color: #b91c1c !important;
}

.workspace-inbox-item__main > i {
  color: #94a3b8;
  font-size: 11px;
  margin-top: 8px;
}

.workspace-activity-panel {
  display: grid;
  gap: 12px;
}

.workspace-activity-list {
  display: grid;
  gap: 8px;
}

.workspace-activity-item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  align-items: flex-start;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.62);
  padding: 10px;
}

.workspace-activity-item__icon {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.1);
  color: #2563eb;
  font-size: 14px;
}

.workspace-activity-item--comment .workspace-activity-item__icon {
  background: rgba(14, 165, 233, 0.12);
  color: #0369a1;
}

.workspace-activity-item--resolved .workspace-activity-item__icon {
  background: rgba(34, 197, 94, 0.12);
  color: #15803d;
}

.workspace-activity-item--image .workspace-activity-item__icon,
.workspace-activity-item--file .workspace-activity-item__icon {
  background: rgba(124, 58, 237, 0.1);
  color: #6d28d9;
}

.workspace-activity-item--member .workspace-activity-item__icon {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.workspace-activity-item__body {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.workspace-activity-item__body strong {
  color: #0f172a;
  font-size: 13px;
  font-weight: 900;
}

.workspace-activity-item__body p {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: #475569;
  font-size: 12px;
  line-height: 1.45;
  text-overflow: ellipsis;
}

.workspace-activity-item__body span {
  color: #94a3b8;
  font-size: 11px;
  font-weight: 800;
}

.workspace-block-insert-panel {
  display: grid;
  gap: 12px;
}

.workspace-block-insert-input {
  display: grid;
  gap: 6px;
}

.workspace-block-insert-input span {
  color: #64748b;
  font-size: 11px;
  font-weight: 900;
}

.workspace-block-insert-input input {
  width: 100%;
  min-width: 0;
  min-height: 36px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 10px;
  background: var(--editor-input-bg);
  color: var(--editor-text);
  padding: 0 11px;
  font-size: 12px;
  font-weight: 750;
  outline: none;
}

.workspace-block-insert-input input:focus {
  border-color: rgba(37, 99, 235, 0.45);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
}

.workspace-block-insert-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.workspace-block-insert-card {
  display: grid;
  min-width: 0;
  min-height: 104px;
  align-content: start;
  gap: 7px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.68);
  color: var(--editor-text);
  cursor: pointer;
  padding: 10px;
  text-align: left;
}

.workspace-block-insert-card:hover,
.workspace-block-insert-card:focus-visible {
  border-color: rgba(37, 99, 235, 0.3);
  background: rgba(37, 99, 235, 0.08);
}

.workspace-block-insert-card:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.workspace-block-insert-card__icon {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
}

.workspace-block-insert-card strong {
  overflow: hidden;
  font-size: 13px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-block-insert-card small {
  color: #64748b;
  font-size: 11px;
  font-weight: 750;
  line-height: 1.35;
}

.workspace-task-panel {
  display: grid;
  gap: 12px;
}

.workspace-task-composer {
  display: grid;
  gap: 8px;
}

.workspace-task-composer__row,
.workspace-task-composer__meta {
  display: grid;
  min-width: 0;
  gap: 8px;
}

.workspace-task-composer__row {
  grid-template-columns: minmax(0, 1fr) auto;
}

.workspace-task-composer__meta {
  grid-template-columns: minmax(0, 1fr) 132px;
}

.workspace-task-composer input,
.workspace-task-composer select {
  width: 100%;
  min-width: 0;
  min-height: 36px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 10px;
  background: var(--editor-input-bg);
  color: var(--editor-text);
  padding: 0 10px;
  font-size: 13px;
  font-weight: 700;
  outline: none;
}

.workspace-task-composer select {
  appearance: none;
}

.workspace-task-composer input:focus,
.workspace-task-composer select:focus {
  border-color: rgba(37, 99, 235, 0.45);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
}

.workspace-task-composer input:disabled,
.workspace-task-composer select:disabled {
  background: rgba(148, 163, 184, 0.08);
  color: #94a3b8;
  cursor: not-allowed;
}

.workspace-task-composer button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  border-radius: 10px;
  background: #2563eb;
  color: #ffffff;
  cursor: pointer;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 900;
}

.workspace-task-composer button:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.workspace-task-progress {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(37, 99, 235, 0.16);
  border-radius: 12px;
  background: rgba(37, 99, 235, 0.06);
  padding: 10px;
}

.workspace-task-progress > div:first-child {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.workspace-task-progress strong {
  color: #1d4ed8;
  font-size: 18px;
  font-weight: 900;
}

.workspace-task-progress span {
  color: #475569;
  font-size: 12px;
  font-weight: 800;
}

.workspace-task-progress__bar {
  overflow: hidden;
  height: 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.24);
}

.workspace-task-progress__bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #2563eb;
  transition: width 0.18s ease;
}

.workspace-task-filters {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 5px;
}

.workspace-task-filters button {
  display: inline-flex;
  min-width: 0;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.58);
  color: #64748b;
  cursor: pointer;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 850;
}

.workspace-task-filters span,
.workspace-task-filters strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-task-filters strong {
  color: #94a3b8;
  font-size: 10px;
}

.workspace-task-filter--active {
  border-color: rgba(37, 99, 235, 0.28) !important;
  background: rgba(37, 99, 235, 0.1) !important;
  color: #1d4ed8 !important;
}

.workspace-task-filter--active strong {
  color: #1d4ed8;
}

.workspace-task-list {
  display: grid;
  gap: 7px;
}

.workspace-task-item {
  display: grid;
  width: 100%;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: flex-start;
  gap: 9px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.68);
  padding: 9px;
  text-align: left;
}

.workspace-task-item:hover,
.workspace-task-item:focus-within {
  border-color: rgba(37, 99, 235, 0.28);
  background: rgba(37, 99, 235, 0.08);
}

.workspace-task-item--overdue {
  border-color: rgba(220, 38, 38, 0.25);
  background: rgba(254, 242, 242, 0.74);
}

.workspace-task-item--depth-1 { margin-left: 12px; width: calc(100% - 12px); }
.workspace-task-item--depth-2 { margin-left: 22px; width: calc(100% - 22px); }
.workspace-task-item--depth-3 { margin-left: 32px; width: calc(100% - 32px); }

.workspace-task-check {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(37, 99, 235, 0.3);
  border-radius: 8px;
  background: #ffffff;
  color: #2563eb;
  cursor: pointer;
  font-size: 11px;
}

.workspace-task-check:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.workspace-task-item--done .workspace-task-check {
  border-color: rgba(22, 163, 74, 0.28);
  background: rgba(34, 197, 94, 0.13);
  color: #15803d;
}

.workspace-task-body {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 3px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.workspace-task-body strong {
  overflow: hidden;
  color: #0f172a;
  font-size: 13px;
  font-weight: 850;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-task-body small {
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
}

.workspace-task-meta {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 1px;
}

.workspace-task-meta span {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.13);
  color: #475569;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 850;
  line-height: 1.3;
}

.workspace-task-meta i {
  font-size: 10px;
}

.workspace-task-meta .workspace-task-meta--overdue {
  background: rgba(220, 38, 38, 0.11);
  color: #b91c1c;
}

.workspace-task-item--done .workspace-task-body strong {
  color: #64748b;
  text-decoration: line-through;
}

.workspace-floating-divider {
  height: 1px;
  background: var(--editor-border);
}

.workspace-outline-panel {
  display: grid;
  gap: 12px;
}

.workspace-outline-list {
  display: grid;
  gap: 4px;
}

.workspace-outline-item {
  display: flex;
  width: 100%;
  min-height: 30px;
  align-items: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #475569;
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.35;
  text-align: left;
}

.workspace-outline-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-outline-item:hover,
.workspace-outline-item:focus-visible {
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
}

.workspace-outline-item--level-1 { padding: 6px 8px; }
.workspace-outline-item--level-2 { padding: 6px 8px 6px 18px; font-weight: 750; }
.workspace-outline-item--level-3 { padding: 6px 8px 6px 28px; font-weight: 700; }
.workspace-outline-item--level-4 { padding: 6px 8px 6px 38px; font-weight: 650; }

.workspace-linked-panel {
  display: grid;
  gap: 12px;
}

.workspace-linked-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.workspace-subpage-composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: end;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 12px;
  background: rgba(37, 99, 235, 0.06);
  padding: 10px;
}

.workspace-subpage-composer label {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.workspace-subpage-composer span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #475569;
  font-size: 11px;
  font-weight: 900;
}

.workspace-subpage-composer input {
  width: 100%;
  min-width: 0;
  height: 36px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 10px;
  background: var(--editor-input-bg);
  color: var(--editor-text);
  padding: 0 10px;
  font-size: 13px;
  font-weight: 750;
  outline: none;
}

.workspace-subpage-composer input:focus {
  border-color: rgba(37, 99, 235, 0.45);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
}

.workspace-subpage-composer button {
  display: inline-flex;
  min-width: 78px;
  height: 36px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  border-radius: 10px;
  background: #2563eb;
  color: #ffffff;
  cursor: pointer;
  font-size: 12px;
  font-weight: 900;
}

.workspace-subpage-composer button:disabled,
.workspace-subpage-composer input:disabled {
  cursor: not-allowed;
  opacity: 0.54;
}

.workspace-subpage-composer .workspace-assets__error {
  grid-column: 1 / -1;
}

.workspace-linked-subheader {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #64748b;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}

.workspace-linked-subheader strong {
  display: inline-flex;
  min-width: 24px;
  justify-content: center;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  padding: 2px 7px;
  font-size: 10px;
}

.workspace-linked-list {
  display: grid;
  gap: 7px;
}

.workspace-linked-list--children {
  padding-top: 2px;
}

.workspace-linked-list--backlinks {
  padding-top: 2px;
}

.workspace-linked-item {
  display: grid;
  gap: 7px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.62);
  padding: 8px;
}

.workspace-linked-item:hover,
.workspace-linked-item:focus-within {
  border-color: rgba(37, 99, 235, 0.28);
  background: rgba(37, 99, 235, 0.08);
}

.workspace-linked-item--backlink {
  border-color: rgba(16, 185, 129, 0.22);
}

.workspace-linked-item--parent {
  border-color: rgba(124, 58, 237, 0.24);
  background: rgba(124, 58, 237, 0.06);
}

.workspace-linked-item--child {
  border-color: rgba(37, 99, 235, 0.24);
  background: rgba(37, 99, 235, 0.06);
}

.workspace-linked-item__main {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: 32px minmax(0, 1fr) 14px;
  align-items: center;
  gap: 9px;
  border: none;
  background: transparent;
  color: var(--editor-text);
  cursor: pointer;
  padding: 1px;
  text-align: left;
}

.workspace-linked-item__main:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.32);
  outline-offset: 3px;
}

.workspace-linked-item__icon {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  font-size: 12px;
}

.workspace-linked-item__icon--shared {
  background: rgba(22, 163, 74, 0.12);
  color: #15803d;
}

.workspace-linked-item__body {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.workspace-linked-item__body strong,
.workspace-linked-item__body small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-linked-item__body strong {
  color: #0f172a;
  font-size: 13px;
  font-weight: 900;
}

.workspace-linked-item__body small {
  color: #64748b;
  font-size: 11px;
  font-weight: 750;
}

.workspace-linked-item__main > i {
  color: #94a3b8;
  font-size: 11px;
}

.workspace-linked-item__preview {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: #64748b;
  font-size: 11px;
  font-weight: 650;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.workspace-linked-item__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.workspace-linked-item__actions button {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  cursor: pointer;
  font-size: 12px;
}

.workspace-linked-item__actions button:hover {
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
}

.workspace-linked-item__actions button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.workspace-history-panel {
  display: grid;
  gap: 12px;
}

.workspace-history-refresh-btn {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.62);
  color: #475569;
  cursor: pointer;
}

.workspace-history-refresh-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.workspace-history-list {
  display: grid;
  gap: 8px;
}

.workspace-history-item {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.62);
  overflow: hidden;
}

.workspace-history-item--active {
  border-color: rgba(37, 99, 235, 0.42);
  background: rgba(37, 99, 235, 0.08);
}

.workspace-history-item__main {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 4px;
  border: none;
  background: transparent;
  padding: 10px;
  color: #0f172a;
  cursor: pointer;
  text-align: left;
}

.workspace-history-item__main:disabled {
  opacity: 0.58;
  cursor: wait;
}

.workspace-history-item__main span {
  width: fit-content;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  padding: 3px 7px;
  font-size: 10px;
  font-weight: 900;
}

.workspace-history-item__main strong,
.workspace-history-preview strong {
  min-width: 0;
  overflow: hidden;
  color: #0f172a;
  font-size: 13px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-history-item__main small,
.workspace-history-preview small {
  min-width: 0;
  overflow: hidden;
  color: #64748b;
  font-size: 11px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-history-preview {
  display: grid;
  gap: 10px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 12px;
  background: rgba(37, 99, 235, 0.07);
  padding: 11px;
}

.workspace-history-preview div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.workspace-history-preview span {
  color: #2563eb;
  font-size: 10px;
  font-weight: 900;
}

.workspace-history-diff {
  display: grid;
  gap: 9px;
  border-top: 1px solid rgba(37, 99, 235, 0.12);
  padding-top: 10px;
}

.workspace-history-title-diff {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 16px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.62);
  padding: 8px;
}

.workspace-history-title-diff span {
  grid-column: 1 / -1;
  color: #64748b;
}

.workspace-history-title-diff i {
  color: #94a3b8;
  font-size: 11px;
  text-align: center;
}

.workspace-history-diff-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.workspace-history-diff-summary__item {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: rgba(148, 163, 184, 0.12);
  color: #475569;
  font-size: 10px;
  font-weight: 900;
}

.workspace-history-diff-summary__item--added {
  background: rgba(34, 197, 94, 0.12);
  color: #15803d;
}

.workspace-history-diff-summary__item--changed {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.workspace-history-diff-summary__item--removed {
  background: rgba(244, 63, 94, 0.1);
  color: #be123c;
}

.workspace-history-diff-list {
  display: grid;
  gap: 7px;
}

.workspace-history-diff-item {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.62);
  padding: 8px;
}

.workspace-history-diff-item > span {
  display: inline-flex;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.12);
  color: #475569;
  font-size: 10px;
  font-weight: 900;
}

.workspace-history-diff-item--added > span {
  background: rgba(34, 197, 94, 0.12);
  color: #15803d;
}

.workspace-history-diff-item--changed > span {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.workspace-history-diff-item--removed > span {
  background: rgba(244, 63, 94, 0.1);
  color: #be123c;
}

.workspace-history-diff-item div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.workspace-history-diff-item strong {
  color: #0f172a;
  font-size: 12px;
  font-weight: 900;
}

.workspace-history-diff-item p,
.workspace-history-diff-item small,
.workspace-history-diff-empty {
  margin: 0;
  color: #64748b;
  font-size: 11px;
  line-height: 1.45;
}

.workspace-history-diff-item p,
.workspace-history-diff-item small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-history-diff-empty {
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.62);
  padding: 9px;
  font-weight: 800;
}

.workspace-history-preview button {
  min-height: 34px;
  border: none;
  border-radius: 10px;
  background: #2563eb;
  color: #ffffff;
  cursor: pointer;
  font-size: 12px;
  font-weight: 900;
}

.workspace-history-preview button:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.workspace-floating-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.workspace-floating-panel__header h3 { margin: 0; font-size: 16px; font-weight: 800; }
.workspace-floating-panel__header p  { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: #64748b; }

.workspace-floating-panel__count {
  display: inline-flex;
  min-width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.12);
  color: #2563eb;
  font-size: 13px;
  font-weight: 800;
}

.workspace-comment-filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(74px, 1fr));
  gap: 6px;
  border-radius: 12px;
  padding: 4px;
  background: rgba(100, 116, 139, 0.1);
}

.workspace-comment-filter {
  display: inline-flex;
  min-width: 0;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 11px;
  font-weight: 900;
}

.workspace-comment-filter strong {
  display: inline-flex;
  min-width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.14);
  color: inherit;
  font-size: 10px;
}

.workspace-comment-filter--active {
  background: var(--editor-bg);
  color: #1d4ed8;
  box-shadow: 0 1px 5px rgba(15, 23, 42, 0.08);
}

.workspace-comment-filter:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.workspace-comment-composer {
  display: grid;
  gap: 10px;
}

.workspace-comment-anchor-target {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid rgba(37, 99, 235, 0.16);
  border-radius: 12px;
  padding: 9px 10px;
  background: rgba(37, 99, 235, 0.07);
}

.workspace-comment-anchor-target--document {
  border-color: var(--editor-border);
  background: var(--editor-input-bg);
}

.workspace-comment-anchor-target div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.workspace-comment-anchor-target span {
  color: #64748b;
  font-size: 10px;
  font-weight: 900;
}

.workspace-comment-anchor-target strong {
  overflow: hidden;
  color: var(--editor-text);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-comment-anchor-target button {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #2563eb;
  cursor: pointer;
  font-size: 11px;
  font-weight: 900;
}

.workspace-mention-tools {
  position: relative;
  display: flex;
  justify-content: flex-start;
}

.workspace-mention-toggle {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(37, 99, 235, 0.22);
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
  cursor: pointer;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 900;
}

.workspace-mention-toggle--active {
  border-color: rgba(37, 99, 235, 0.45);
  background: rgba(37, 99, 235, 0.14);
}

.workspace-mention-toggle:disabled {
  border-color: rgba(148, 163, 184, 0.24);
  background: rgba(148, 163, 184, 0.1);
  color: #94a3b8;
  cursor: not-allowed;
}

.workspace-mention-menu {
  position: absolute;
  top: 38px;
  left: 0;
  z-index: 12;
  display: grid;
  width: min(100%, 300px);
  max-height: 220px;
  overflow: auto;
  gap: 4px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 12px;
  background: var(--editor-bg);
  padding: 6px;
  box-shadow: 0 16px 35px rgba(15, 23, 42, 0.16);
}

.workspace-mention-option {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  padding: 7px;
  text-align: left;
}

.workspace-mention-option:hover,
.workspace-mention-option:focus-visible {
  background: rgba(37, 99, 235, 0.08);
}

.workspace-mention-avatar {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 900;
}

.workspace-mention-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.workspace-mention-meta {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.workspace-mention-meta strong,
.workspace-mention-meta small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-mention-meta strong {
  color: #0f172a;
  font-size: 12px;
  font-weight: 900;
}

.workspace-mention-meta small {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.workspace-comment-composer textarea {
  width: 100%;
  min-height: 88px;
  resize: vertical;
  border: 1px solid var(--editor-border);
  border-radius: 12px;
  padding: 11px 12px;
  background: var(--editor-input-bg);
  color: var(--editor-text);
  font-size: 13px;
  line-height: 1.5;
  outline: none;
}

.workspace-comment-composer textarea:focus {
  border-color: rgba(37, 99, 235, 0.45);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
}

.workspace-comment-submit {
  justify-self: end;
  border: none;
  border-radius: 10px;
  padding: 9px 12px;
  background: #111827;
  color: white;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.workspace-comment-submit:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.workspace-comment-list {
  display: grid;
  gap: 10px;
}

.workspace-comment-item {
  display: grid;
  gap: 10px;
  border: 1px solid var(--editor-border);
  border-radius: 14px;
  padding: 12px;
  background: var(--editor-input-bg);
}

.workspace-comment-item--resolved {
  opacity: 0.74;
}

.workspace-comment-item--mentioned {
  border-color: rgba(37, 99, 235, 0.34);
  background: rgba(37, 99, 235, 0.06);
}

.workspace-comment-item__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.workspace-comment-item__header div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.workspace-comment-item__actions {
  display: inline-flex !important;
  flex-shrink: 0;
  align-items: center;
  gap: 6px !important;
}

.workspace-comment-item__header strong {
  color: var(--editor-text);
  font-size: 13px;
  line-height: 1.35;
}

.workspace-comment-item__header span {
  color: #64748b;
  font-size: 11px;
}

.workspace-comment-item__header .workspace-comment-mention-chip {
  display: inline-flex;
  width: max-content;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
  padding: 3px 7px;
  font-size: 10px;
  font-weight: 900;
}

.workspace-comment-item p {
  margin: 0;
  color: var(--editor-text);
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.workspace-comment-anchor {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  justify-self: start;
  gap: 6px;
  border: none;
  border-radius: 999px;
  padding: 6px 9px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  cursor: pointer;
  font-size: 11px;
  font-weight: 900;
}

.workspace-comment-anchor span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-comment-icon-btn {
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 11px;
  font-weight: 800;
}

.workspace-comment-icon-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.workspace-comment-edit {
  display: grid;
  gap: 8px;
}

.workspace-comment-edit textarea {
  width: 100%;
  min-height: 78px;
  resize: vertical;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 10px;
  background: var(--editor-bg);
  color: var(--editor-text);
  padding: 9px 10px;
  font-size: 13px;
  line-height: 1.5;
  outline: none;
}

.workspace-comment-edit textarea:focus {
  border-color: rgba(37, 99, 235, 0.45);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
}

.workspace-comment-edit div {
  display: inline-flex;
  justify-content: flex-end;
  gap: 6px;
}

.workspace-comment-edit button {
  min-height: 30px;
  border: none;
  border-radius: 9px;
  padding: 0 10px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 900;
}

.workspace-comment-edit__cancel {
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
}

.workspace-comment-edit__save {
  background: #2563eb;
  color: #ffffff;
}

.workspace-comment-edit button:disabled,
.workspace-comment-edit textarea:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.workspace-comment-resolve {
  justify-self: start;
  border: none;
  border-radius: 999px;
  padding: 7px 10px;
  background: rgba(22, 163, 74, 0.12);
  color: #15803d;
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
}

.workspace-comment-resolve:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.workspace-comment-resolved {
  display: grid;
  gap: 10px;
}

.workspace-comment-resolved summary {
  color: #64748b;
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  list-style-position: inside;
}

.workspace-floating-panel__empty {
  padding: 18px 14px;
  border-radius: 14px;
  border: 1px dashed var(--editor-border);
  text-align: center;
  font-size: 13px;
  color: #64748b;
}

.workspace-floating-list {
  display: grid;
  gap: 12px;
  overflow-y: auto;
  min-height: 0;
  padding-right: 2px;
}

.workspace-floating-item {
  position: relative;
  border: 1px solid var(--editor-border);
  border-radius: 16px;
  background: var(--editor-input-bg);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.workspace-floating-item--active {
  border-color: rgba(37, 99, 235, 0.38);
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.08);
}

.workspace-floating-item__main {
  display: flex;
  width: 100%;
  gap: 12px;
  padding: 14px 44px 14px 14px;
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
}

.workspace-floating-item__icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 18px;
}

.workspace-floating-item__icon--image { background: rgba(14, 165, 233, 0.12); color: #0ea5e9; }
.workspace-floating-item__icon--file  { background: rgba(37, 99, 235, 0.12);  color: #2563eb; }

.workspace-floating-item__meta {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.workspace-floating-item__title-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.workspace-floating-item__title-row strong {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  line-height: 1.45;
  word-break: break-all;
}

.workspace-floating-item__meta span { font-size: 12px; color: #64748b; }

.workspace-floating-item__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 999px;
  padding: 4px 8px;
  background: rgba(15, 23, 42, 0.08);
  color: #334155;
  font-size: 11px;
  font-weight: 700;
}

.workspace-floating-item__remove {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: none;
  background: rgba(15, 23, 42, 0.72);
  color: white;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.workspace-floating-item__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 0 14px 14px;
}

.workspace-floating-item__action {
  border: none;
  border-radius: 12px;
  padding: 11px 12px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.workspace-floating-item__action--drive    { background: rgba(6, 182, 212, 0.14); color: #0f766e; }
.workspace-floating-item__action--download { background: rgba(37, 99, 235, 0.12);  color: #1d4ed8; }

.editor-body {
  position: relative;
  min-height: 60vh;
  padding: 20px;
}

.editor-body--locked .editor-holder {
  filter: saturate(0.86);
  opacity: 0.72;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.workspace-editor-lock-overlay {
  position: absolute;
  top: 20px;
  right: 20px;
  bottom: 20px;
  left: 20px;
  z-index: 12;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.72);
  backdrop-filter: blur(2px);
  pointer-events: auto;
}

.workspace-editor-lock-overlay div {
  display: grid;
  max-width: min(360px, 70%);
  gap: 6px;
  color: #334155;
  text-align: left;
}

.workspace-editor-lock-overlay i {
  color: #0f172a;
  font-size: 20px;
}

.workspace-editor-lock-overlay strong {
  color: #0f172a;
  font-size: 16px;
  font-weight: 950;
}

.workspace-editor-lock-overlay span {
  color: #64748b;
  font-size: 13px;
  line-height: 1.45;
}

.workspace-editor-lock-overlay button {
  flex-shrink: 0;
  border: none;
  border-radius: 10px;
  background: #0f172a;
  color: #ffffff;
  cursor: pointer;
  padding: 10px 13px;
  font-size: 13px;
  font-weight: 900;
}

.workspace-editor-lock-overlay button:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.editor-holder {
  min-height: 48vh;
  border-radius: 12px;
  border: 1px solid var(--editor-border);
  padding: 18px;
  font-size: 16px;
  background: var(--editor-bg);
}

.workspace-inline-block-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.82);
  padding: 8px;
}

.workspace-inline-block-input {
  display: grid;
  min-width: 0;
  min-height: 34px;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 10px;
  background: #ffffff;
  padding: 0 10px;
}

.workspace-inline-block-input i {
  color: #64748b;
  font-size: 12px;
}

.workspace-inline-block-input input {
  min-width: 0;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--editor-text);
  font-size: 12px;
  font-weight: 800;
  outline: none;
}

.workspace-inline-block-input input:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.workspace-inline-block-actions {
  display: inline-flex;
  min-width: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.workspace-inline-block-actions button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 10px;
  background: #ffffff;
  color: #334155;
  cursor: pointer;
  padding: 0 9px;
  font-size: 11px;
  font-weight: 900;
}

.workspace-inline-block-actions button:hover:not(:disabled),
.workspace-inline-block-actions button:focus-visible {
  border-color: rgba(37, 99, 235, 0.35);
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
  outline: none;
}

.workspace-inline-block-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.cursors-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 100;
}

.remote-cursor {
  position: absolute;
  display: flex;
  align-items: flex-start;
  transition: none !important;
  will-change: transform;
}

.cursor-pointer {
  position: absolute;
  top: -2px;
  left: -2px;
  filter: drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.3));
}

.cursor-label {
  color: white;
  font-size: 12px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 12px;
  white-space: nowrap;
  margin-top: 18px;
  margin-left: 10px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.editor-holder :deep(.workspace-block-anchor-highlight) {
  border-radius: 10px;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16);
  transition: box-shadow 0.2s ease;
}

.editor-holder :deep(.ce-block.workspace-block-has-comments) {
  position: relative;
}

.editor-holder :deep(.ce-block.workspace-block-has-comments::before) {
  content: "";
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: -8px;
  width: 3px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.22);
}

.editor-holder :deep(.workspace-block-comment-badge) {
  position: absolute;
  top: 6px;
  right: -10px;
  display: inline-flex;
  min-width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--editor-bg);
  border-radius: 999px;
  background: #2563eb;
  color: #ffffff;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.24);
  z-index: 4;
}

.editor-holder :deep(.workspace-block-comment-badge:hover) {
  background: #1d4ed8;
}

:deep(.ce-block h1) { font-size: 40px !important; font-weight: 700; }

@media (max-width: 1300px) {
  .workspace-layout { grid-template-columns: 240px minmax(0, 1fr); }
  .workspace-layout--panel-collapsed { grid-template-columns: 240px minmax(0, 1fr); }
  .workspace-floating-sidebar { grid-column: 2; position: static; }
  .workspace-floating-panel   { max-height: none; }
}

@media (max-width: 1100px) {
  .workspace-layout { grid-template-columns: minmax(0, 1fr); }
  .workspace-layout--panel-collapsed { grid-template-columns: minmax(0, 1fr); }
  .workspace-doc-sidebar,
  .workspace-floating-sidebar { position: static; }
  .workspace-doc-sidebar { max-height: none; }
  .workspace-floating-sidebar { grid-column: auto; }
  .workspace-floating-panel   { max-height: none; }
}

@media (max-width: 900px) {
  .editor-header,
  .workspace-assets__header { flex-direction: column; align-items: stretch; }
  .workspace-property-visual-grid,
  .workspace-property-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .workspace-page-index-filters,
  .workspace-timeline-filters,
  .workspace-calendar-filters,
  .workspace-inbox-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .workspace-assets__actions { justify-content: flex-start; }
}

@media (max-width: 640px) {
  .workspace-layout { padding: 0 12px 20px; }
  .workspace-page-cover { height: 82px; }
  .workspace-title-row { grid-template-columns: 46px minmax(0, 1fr); gap: 10px; }
  .workspace-page-icon-input { width: 46px; height: 46px; min-width: 46px; font-size: 24px; }
  .title-input { font-size: 28px; }
  .editor-header__actions { justify-content: flex-start; flex-wrap: wrap; }
  .workspace-panel-tabs { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .workspace-property-panel__header { flex-direction: column; }
  .workspace-property-visual-grid,
  .workspace-property-grid,
  .workspace-property-field--tags { grid-template-columns: 1fr; grid-column: auto; }
  .workspace-home-metrics,
  .workspace-summary-grid,
  .workspace-summary-actions,
  .workspace-fulltext-search,
  .workspace-subpage-composer,
  .workspace-inline-block-bar,
  .workspace-block-insert-grid { grid-template-columns: 1fr; }
  .workspace-collaboration-summary,
  .workspace-collaboration-actions,
  .workspace-permission-grid { grid-template-columns: 1fr; }
  .workspace-member-item { grid-template-columns: 34px minmax(0, 1fr); }
  .workspace-member-actions { grid-column: 1 / -1; justify-content: flex-end; }
  .editor-holder :deep(.workspace-block-comment-badge) { right: 2px; }
  .workspace-floating-item__actions { grid-template-columns: 1fr; }
  .workspace-command-overlay { padding-top: 7vh; }
  .workspace-command-item { grid-template-columns: 30px minmax(0, 1fr); }
  .workspace-command-item__type { display: none; }
}
</style>
