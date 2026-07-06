import { useWorkspaceAssetActions } from './useWorkspaceAssetActions.js'
import { useWorkspaceAssetPanel } from './useWorkspaceAssetPanel.js'
import { useWorkspaceAutoSave } from './useWorkspaceAutoSave.js'
import { useWorkspaceCommentMutations } from './useWorkspaceCommentMutations.js'
import { useWorkspaceCommentPanel } from './useWorkspaceCommentPanel.js'
import { useWorkspaceEditorMutations } from './useWorkspaceEditorMutations.js'
import { useWorkspaceQuickActions } from './useWorkspaceQuickActions.js'
import { useWorkspaceRevisionPanel } from './useWorkspaceRevisionPanel.js'
import { useWorkspaceTaskPanel } from './useWorkspaceTaskPanel.js'

export const useWorkspaceEditorInteractionSetup = ({
  platform = {},
  state = {},
  options = {},
  access = {},
  user = {},
  persistence = {},
  assets = {},
  comments = {},
  revisions = {},
  ui = {},
} = {}) => {
  const autoSave = useWorkspaceAutoSave({
    canEditWorkspace: access.canEditWorkspace,
    isValid: state.isValid,
    isEditorLoading: state.isEditorLoading,
    hasUnsavedChanges: state.hasUnsavedChanges,
    editorApi: state.editorApi,
    saveState: state.saveState,
    persistWorkspace: persistence.persistWorkspace,
  })

  const quickActions = useWorkspaceQuickActions({
    editorApi: state.editorApi,
    quickBlockOptions: () => options.quickBlockOptions,
    canModifyWorkspacePage: access.canModifyWorkspacePage,
    isEditorLoading: state.isEditorLoading,
    workspaceSubpageCreating: state.workspaceSubpageCreating,
    workspaceSubpageTitle: state.workspaceSubpageTitle,
  })

  const editorMutations = useWorkspaceEditorMutations({
    editorApi: state.editorApi,
    canInsertWorkspaceQuickBlock: quickActions.canInsertWorkspaceQuickBlock,
    workspaceQuickBlockAdding: state.workspaceQuickBlockAdding,
    workspaceQuickBlockText: state.workspaceQuickBlockText,
    workspaceInlineQuickBlockText: state.workspaceInlineQuickBlockText,
    activeWorkspacePanelTab: state.activeWorkspacePanelTab,
    showWorkspaceNotice: ui.showWorkspaceNotice,
    canEditWorkspace: access.canEditWorkspace,
    workspacePageLocked: state.workspacePageLocked,
    canModifyWorkspacePage: access.canModifyWorkspacePage,
    title: state.title,
    titleDirty: state.titleDirty,
    scheduleAutoSave: autoSave.scheduleAutoSave,
    persistWorkspace: persistence.persistWorkspace,
    workspaceTemplateApplying: state.workspaceTemplateApplying,
    workspaceTemplateApplied: state.workspaceTemplateApplied,
  })

  const taskPanel = useWorkspaceTaskPanel({
    documentTasks: state.documentTasks,
    currentUserEmail: user.currentUserEmail,
    workspaceTaskFilter: state.workspaceTaskFilter,
    canModifyWorkspacePage: access.canModifyWorkspacePage,
    workspaceTaskAdding: state.workspaceTaskAdding,
    newWorkspaceTask: state.newWorkspaceTask,
  })

  const assetPanel = useWorkspaceAssetPanel({
    workspaceAssets: state.workspaceAssets,
    savingWorkspaceAssetIds: state.savingWorkspaceAssetIds,
  })

  const assetActions = useWorkspaceAssetActions({
    workspaceId: state.workspaceId,
    workspaceAssetUploading: state.workspaceAssetUploading,
    workspaceAssetError: state.workspaceAssetError,
    activeWorkspaceAssetId: state.activeWorkspaceAssetId,
    deletingAssetIds: state.deletingAssetIds,
    savingWorkspaceAssetIds: state.savingWorkspaceAssetIds,
    activeWorkspacePanelTab: state.activeWorkspacePanelTab,
    imageInput: state.imageInput,
    fileInput: state.fileInput,
    canManageAssets: access.canManageAssets,
    ensureWorkspacePersisted: persistence.ensureWorkspacePersisted,
    uploadWorkspaceAssets: (targetWorkspaceId, files) => platform.api.uploadWorkspaceAssets(targetWorkspaceId, files),
    deleteWorkspaceAsset: (targetWorkspaceId, assetId) => platform.api.deleteWorkspaceAsset(targetWorkspaceId, assetId),
    saveWorkspaceAssetToDriveApi: (targetWorkspaceId, assetId) => platform.api.saveWorkspaceAssetToDrive(targetWorkspaceId, assetId),
    downloadWorkspaceAssetFile: assets.downloadWorkspaceAssetFile,
    normalizeWorkspaceAsset: assets.normalizeWorkspaceAsset,
    mergeWorkspaceAssets: assets.mergeWorkspaceAssets,
    removeWorkspaceAssets: assets.removeWorkspaceAssets,
    showWorkspaceNotice: ui.showWorkspaceNotice,
  })

  const commentPanel = useWorkspaceCommentPanel({
    workspaceComments: state.workspaceComments,
    currentUserEmail: user.currentUserEmail,
    selectedBlockAnchor: state.selectedBlockAnchor,
    workspaceCommentFilter: state.workspaceCommentFilter,
  })

  const revisionPanel = useWorkspaceRevisionPanel({
    workspaceRevisions: state.workspaceRevisions,
    workspaceId: state.workspaceId,
    canModifyWorkspacePage: access.canModifyWorkspacePage,
    activeWorkspaceRevision: state.activeWorkspaceRevision,
    workspaceRevisionDiff: state.workspaceRevisionDiff,
    editorApi: state.editorApi,
    title: state.title,
    blockTypeLabel: revisions.blockTypeLabel,
  })

  const commentMutations = useWorkspaceCommentMutations({
    workspaceId: state.workspaceId,
    workspaceComments: state.workspaceComments,
    workspaceCommentFilter: state.workspaceCommentFilter,
    workspaceCommentSaving: state.workspaceCommentSaving,
    workspaceCommentError: state.workspaceCommentError,
    workspaceCommentEditingId: state.workspaceCommentEditingId,
    workspaceCommentEditDraft: state.workspaceCommentEditDraft,
    newWorkspaceComment: state.newWorkspaceComment,
    resolvingCommentIds: state.resolvingCommentIds,
    deletingCommentIds: state.deletingCommentIds,
    updatingCommentIds: state.updatingCommentIds,
    currentUserEmail: user.currentUserEmail,
    currentUserIdx: user.currentUserIdx,
    canManageWorkspaceShare: access.canManageWorkspaceShare,
    canCommentOnWorkspace: access.canCommentOnWorkspace,
    editorApi: state.editorApi,
    normalizeWorkspaceComment: comments.normalizeWorkspaceComment,
    ensureWorkspacePersisted: persistence.ensureWorkspacePersisted,
    createWorkspaceCommentApi: (targetWorkspaceId, payload) => platform.api.createWorkspaceComment(targetWorkspaceId, payload),
    updateWorkspaceCommentApi: (targetWorkspaceId, commentId, contents) => platform.api.updateWorkspaceComment(targetWorkspaceId, commentId, contents),
    resolveWorkspaceCommentApi: (targetWorkspaceId, commentId, resolved) => platform.api.resolveWorkspaceComment(targetWorkspaceId, commentId, resolved),
    deleteWorkspaceCommentApi: (targetWorkspaceId, commentId) => platform.api.deleteWorkspaceComment(targetWorkspaceId, commentId),
  })

  return {
    ...autoSave,
    ...quickActions,
    ...editorMutations,
    ...taskPanel,
    ...assetPanel,
    ...assetActions,
    ...commentPanel,
    ...revisionPanel,
    ...commentMutations,
  }
}
