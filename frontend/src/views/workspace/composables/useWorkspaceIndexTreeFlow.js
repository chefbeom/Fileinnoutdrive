import { useWorkspaceFullTextSearch } from './useWorkspaceFullTextSearch.js'
import { useWorkspacePageIndexFilters } from './useWorkspacePageIndexFilters.js'
import { useWorkspacePageIndexMutations } from './useWorkspacePageIndexMutations.js'
import { useWorkspacePageIndexSelection } from './useWorkspacePageIndexSelection.js'
import { useWorkspacePageTreeEditing } from './useWorkspacePageTreeEditing.js'
import { useWorkspacePageTreeMutations } from './useWorkspacePageTreeMutations.js'
import { useWorkspacePageTreeState } from './useWorkspacePageTreeState.js'

export const useWorkspaceIndexTreeFlow = (context = {}) => {
  const fullText = useWorkspaceFullTextSearch({
    workspaceDocuments: context.workspaceDocuments,
    fetchWorkspaceDocument: context.fetchWorkspaceDocument,
  })

  const pageIndexFilters = useWorkspacePageIndexFilters({
    workspacePageIndexRows: context.workspacePageIndexRows,
    workspacePageIndexFilter: context.workspacePageIndexFilter,
    workspacePageIndexQuery: context.workspacePageIndexQuery,
    workspacePageIndexTagFilter: context.workspacePageIndexTagFilter,
    workspacePageIndexOwnerFilter: context.workspacePageIndexOwnerFilter,
    workspacePageIndexSort: context.workspacePageIndexSort,
    workspacePropertyOwnerCandidates: context.workspacePropertyOwnerCandidates,
    priorityOptions: context.priorityOptions,
  })

  const pageIndexSelection = useWorkspacePageIndexSelection({
    workspacePageIndexRows: context.workspacePageIndexRows,
    visibleWorkspacePageIndexRows: pageIndexFilters.visibleWorkspacePageIndexRows,
    workspacePageIndexSelectedIds: context.workspacePageIndexSelectedIds,
    workspacePageIndexBulkUpdating: context.workspacePageIndexBulkUpdating,
    workspacePageIndexBulkStatus: context.workspacePageIndexBulkStatus,
    workspacePageIndexBulkPriority: context.workspacePageIndexBulkPriority,
    workspacePageIndexBulkOwnerEmail: context.workspacePageIndexBulkOwnerEmail,
    workspacePageIndexBulkDueDate: context.workspacePageIndexBulkDueDate,
    workspacePageIndexBulkClearDueDate: context.workspacePageIndexBulkClearDueDate,
  })

  const pageTreeState = useWorkspacePageTreeState({
    workspacePageIndexRows: context.workspacePageIndexRows,
    currentWorkspaceKey: context.currentWorkspaceKey,
  })

  const pageTreeEditing = useWorkspacePageTreeEditing({
    workspacePageTreeAllRows: pageTreeState.workspacePageTreeAllRows,
  })

  const pageTreeMutations = useWorkspacePageTreeMutations({
    documentId: context.documentId,
    canApplyWorkspaceTreeMove: pageTreeEditing.canApplyWorkspaceTreeMove,
    workspaceTreeMoveTargetId: pageTreeEditing.workspaceTreeMoveTargetId,
    workspaceTreeMoveSavingId: pageTreeEditing.workspaceTreeMoveSavingId,
    workspaceTreeMoveError: pageTreeEditing.workspaceTreeMoveError,
    workspacePageIndexRowById: context.workspacePageIndexRowById,
    workspaceDocumentById: context.workspaceDocumentById,
    currentWorkspaceKey: context.currentWorkspaceKey,
    editorApi: context.editorApi,
    applyWorkspaceParentPage: context.applyWorkspaceParentPage,
    persistWorkspace: context.persistWorkspace,
    fetchWorkspaceDocument: context.fetchWorkspaceDocument,
    saveWorkspaceDocument: context.saveWorkspaceDocument,
    serializeWorkspaceSnapshotWithParent: context.serializeWorkspaceSnapshotWithParent,
    refreshWorkspaceDocuments: context.refreshWorkspaceDocuments,
    refreshWorkspacePageIndex: context.refreshWorkspacePageIndex,
    collapsedWorkspacePageTreeIds: pageTreeState.collapsedWorkspacePageTreeIds,
    cancelWorkspaceTreeMove: pageTreeEditing.cancelWorkspaceTreeMove,
    workspaceTreeRenameDraft: pageTreeEditing.workspaceTreeRenameDraft,
    workspaceTreeRenameSavingId: pageTreeEditing.workspaceTreeRenameSavingId,
    workspaceTreeRenameError: pageTreeEditing.workspaceTreeRenameError,
    isWorkspaceTreeRenameOpen: pageTreeEditing.isWorkspaceTreeRenameOpen,
    cancelWorkspaceTreeRename: pageTreeEditing.cancelWorkspaceTreeRename,
    title: context.title,
    titleDirty: context.titleDirty,
    createWorkspaceChildPage: context.createWorkspaceChildPage,
    workspaceTreeSubpageCreatingId: pageTreeEditing.workspaceTreeSubpageCreatingId,
    workspaceTreeSubpageError: pageTreeEditing.workspaceTreeSubpageError,
    workspaceTreeSubpageTitle: pageTreeEditing.workspaceTreeSubpageTitle,
    workspacePageTreeQuery: pageTreeState.workspacePageTreeQuery,
    cancelWorkspaceTreeSubpageComposer: pageTreeEditing.cancelWorkspaceTreeSubpageComposer,
    activeWorkspacePanelTab: context.activeWorkspacePanelTab,
  })

  const pageIndexMutations = useWorkspacePageIndexMutations({
    workspacePageIndexRows: context.workspacePageIndexRows,
    workspacePageIndexUpdatingIds: context.workspacePageIndexUpdatingIds,
    workspacePageIndexError: context.workspacePageIndexError,
    workspaceBoardDraggingId: context.workspaceBoardDraggingId,
    workspaceBoardDragOverStatus: context.workspaceBoardDragOverStatus,
    currentWorkspaceKey: context.currentWorkspaceKey,
    editorApi: context.editorApi,
    fetchWorkspaceDocument: context.fetchWorkspaceDocument,
    saveWorkspaceDocument: context.saveWorkspaceDocument,
    extractWorkspacePropertiesFromContents: context.extractWorkspacePropertiesFromContents,
    normalizeWorkspaceProperties: context.normalizeWorkspaceProperties,
    applyWorkspaceProperties: context.applyWorkspaceProperties,
    serializeWorkspaceSnapshotWithProperties: context.serializeWorkspaceSnapshotWithProperties,
    persistWorkspace: context.persistWorkspace,
    refreshWorkspaceDocuments: context.refreshWorkspaceDocuments,
    refreshWorkspacePageIndex: context.refreshWorkspacePageIndex,
    workspacePageIndexOwnerOptions: pageIndexFilters.workspacePageIndexOwnerOptions,
    selectedWorkspacePageIndexRows: pageIndexSelection.selectedWorkspacePageIndexRows,
    canApplyWorkspacePageIndexBulkUpdate: pageIndexSelection.canApplyWorkspacePageIndexBulkUpdate,
    clearWorkspacePageIndexSelection: pageIndexSelection.clearWorkspacePageIndexSelection,
    workspacePageIndexBulkStatus: context.workspacePageIndexBulkStatus,
    workspacePageIndexBulkPriority: context.workspacePageIndexBulkPriority,
    workspacePageIndexBulkOwnerEmail: context.workspacePageIndexBulkOwnerEmail,
    workspacePageIndexBulkDueDate: context.workspacePageIndexBulkDueDate,
    workspacePageIndexBulkClearDueDate: context.workspacePageIndexBulkClearDueDate,
    workspacePageIndexBulkUpdating: context.workspacePageIndexBulkUpdating,
    workspacePropertyOwnerCandidates: context.workspacePropertyOwnerCandidates,
    statusOptions: context.statusOptions,
  })

  return {
    ...fullText,
    ...pageIndexFilters,
    ...pageIndexSelection,
    ...pageTreeState,
    ...pageTreeEditing,
    ...pageTreeMutations,
    ...pageIndexMutations,
  }
}