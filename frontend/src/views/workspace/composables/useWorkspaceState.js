import { ref } from 'vue'

export const useWorkspaceState = () => {
  const editorHolder = ref(null)
  const editorApi = ref(null)
  const title = ref('')
  const isEditorLoading = ref(false)
  const showUserList = ref(false)
  const titleDirty = ref(false)
  const saveState = ref('idle')
  const saveError = ref('')
  const lastSavedAt = ref(null)
  const workspaceDocumentQuery = ref('')
  const workspaceDocumentsLoading = ref(false)
  const workspaceMarkdownExporting = ref(false)
  const workspaceSectionNameDraft = ref('')
  const workspaceSectionEditingId = ref('')
  const workspaceSectionEditDraft = ref('')
  const workspaceSectionEditInput = ref(null)
  const showWorkspaceShareModal = ref(false)
  const workspaceShareStatus = ref('Private')
  const workspaceUuid = ref('')
  const workspaceTemplateApplied = ref(false)
  const workspaceTemplateApplying = ref('')
  const workspacePropertyIcon = ref('📄')
  const workspacePropertyCoverColor = ref('blue')
  const workspacePropertyStatus = ref('planning')
  const workspacePropertyPriority = ref('normal')
  const workspacePropertyOwnerEmail = ref('')
  const workspacePropertyOwnerName = ref('')
  const workspacePropertyDueDate = ref('')
  const workspacePropertyTagsInput = ref('')
  const workspacePageLocked = ref(false)
  const workspaceParentPageId = ref('')
  const workspaceParentPageTitle = ref('')
  const workspaceId = ref(null)
  const workspaceAccessRole = ref('ADMIN')
  const workspaceAssets = ref([])
  const workspaceAssetLoading = ref(false)
  const workspaceAssetUploading = ref(false)
  const workspaceAssetError = ref('')
  const deletingAssetIds = ref([])
  const imageInput = ref(null)
  const fileInput = ref(null)
  const workspaceCommentInput = ref(null)
  const activeWorkspaceAssetId = ref(null)
  const savingWorkspaceAssetIds = ref([])
  const workspaceComments = ref([])
  const workspaceCommentLoading = ref(false)
  const workspaceCommentSaving = ref(false)
  const workspaceCommentError = ref('')
  const newWorkspaceComment = ref('')
  const workspaceCommentFilter = ref('open')
  const showWorkspaceMentionMenu = ref(false)
  const workspaceCommentEditingId = ref('')
  const workspaceCommentEditDraft = ref('')
  const newWorkspaceTask = ref('')
  const newWorkspaceTaskAssignee = ref('')
  const newWorkspaceTaskDueDate = ref('')
  const workspaceTaskFilter = ref('open')
  const workspaceTaskAdding = ref(false)
  const workspaceInboxFilter = ref('mine')
  const workspaceCalendarFilter = ref('upcoming')
  const workspaceTimelineFilter = ref('open')
  const workspaceSubpageInput = ref(null)
  const workspaceSubpageTitle = ref('')
  const workspaceSubpageCreating = ref(false)
  const workspaceSubpageError = ref('')
  const workspaceQuickBlockText = ref('')
  const workspaceInlineQuickBlockText = ref('')
  const workspaceQuickBlockAdding = ref('')
  const workspacePageIndexRows = ref([])
  const workspacePageIndexLoading = ref(false)
  const workspacePageIndexError = ref('')
  const workspacePageIndexFilter = ref('all')
  const workspacePageIndexQuery = ref('')
  const workspacePageIndexTagFilter = ref('')
  const workspacePageIndexOwnerFilter = ref('')
  const workspacePageIndexSort = ref('updated-desc')
  const workspacePageIndexViewName = ref('')
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
  const workspaceMembers = ref([])
  const workspaceMemberLoading = ref(false)
  const workspaceMemberError = ref('')
  const workspaceMemberActionLoading = ref('')
  const workspaceMemberRefreshedAt = ref(null)
  const resolvingCommentIds = ref([])
  const deletingCommentIds = ref([])
  const updatingCommentIds = ref([])
  const workspaceRevisions = ref([])
  const workspaceRevisionLoading = ref(false)
  const workspaceRevisionError = ref('')
  const activeWorkspaceRevision = ref(null)
  const workspaceRevisionDiff = ref(null)
  const workspaceRevisionPreviewLoading = ref('')
  const workspaceRevisionRestoring = ref('')
  const togglingWorkspaceTaskIds = ref([])
  const togglingWorkspaceInboxTaskIds = ref([])
  const openRoleDropdownId = ref(null)
  const activeWorkspacePanelTab = ref('all')
  const isWorkspacePanelCollapsed = ref(false)

  return {
    editorHolder,
    editorApi,
    title,
    isEditorLoading,
    showUserList,
    titleDirty,
    saveState,
    saveError,
    lastSavedAt,
    workspaceDocumentQuery,
    workspaceDocumentsLoading,
    workspaceMarkdownExporting,
    workspaceSectionNameDraft,
    workspaceSectionEditingId,
    workspaceSectionEditDraft,
    workspaceSectionEditInput,
    showWorkspaceShareModal,
    workspaceShareStatus,
    workspaceUuid,
    workspaceTemplateApplied,
    workspaceTemplateApplying,
    workspacePropertyIcon,
    workspacePropertyCoverColor,
    workspacePropertyStatus,
    workspacePropertyPriority,
    workspacePropertyOwnerEmail,
    workspacePropertyOwnerName,
    workspacePropertyDueDate,
    workspacePropertyTagsInput,
    workspacePageLocked,
    workspaceParentPageId,
    workspaceParentPageTitle,
    workspaceId,
    workspaceAccessRole,
    workspaceAssets,
    workspaceAssetLoading,
    workspaceAssetUploading,
    workspaceAssetError,
    deletingAssetIds,
    imageInput,
    fileInput,
    workspaceCommentInput,
    activeWorkspaceAssetId,
    savingWorkspaceAssetIds,
    workspaceComments,
    workspaceCommentLoading,
    workspaceCommentSaving,
    workspaceCommentError,
    newWorkspaceComment,
    workspaceCommentFilter,
    showWorkspaceMentionMenu,
    workspaceCommentEditingId,
    workspaceCommentEditDraft,
    newWorkspaceTask,
    newWorkspaceTaskAssignee,
    newWorkspaceTaskDueDate,
    workspaceTaskFilter,
    workspaceTaskAdding,
    workspaceInboxFilter,
    workspaceCalendarFilter,
    workspaceTimelineFilter,
    workspaceSubpageInput,
    workspaceSubpageTitle,
    workspaceSubpageCreating,
    workspaceSubpageError,
    workspaceQuickBlockText,
    workspaceInlineQuickBlockText,
    workspaceQuickBlockAdding,
    workspacePageIndexRows,
    workspacePageIndexLoading,
    workspacePageIndexError,
    workspacePageIndexFilter,
    workspacePageIndexQuery,
    workspacePageIndexTagFilter,
    workspacePageIndexOwnerFilter,
    workspacePageIndexSort,
    workspacePageIndexViewName,
    workspacePageIndexSelectedIds,
    workspacePageIndexBulkStatus,
    workspacePageIndexBulkPriority,
    workspacePageIndexBulkOwnerEmail,
    workspacePageIndexBulkDueDate,
    workspacePageIndexBulkClearDueDate,
    workspacePageIndexBulkUpdating,
    workspacePageIndexRefreshedAt,
    workspacePageIndexUpdatingIds,
    workspaceBoardDraggingId,
    workspaceBoardDragOverStatus,
    workspaceMembers,
    workspaceMemberLoading,
    workspaceMemberError,
    workspaceMemberActionLoading,
    workspaceMemberRefreshedAt,
    resolvingCommentIds,
    deletingCommentIds,
    updatingCommentIds,
    workspaceRevisions,
    workspaceRevisionLoading,
    workspaceRevisionError,
    activeWorkspaceRevision,
    workspaceRevisionDiff,
    workspaceRevisionPreviewLoading,
    workspaceRevisionRestoring,
    togglingWorkspaceTaskIds,
    togglingWorkspaceInboxTaskIds,
    openRoleDropdownId,
    activeWorkspacePanelTab,
    isWorkspacePanelCollapsed,
  }
}
