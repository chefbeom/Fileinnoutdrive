import { useWorkspaceIndexTreeFlow } from './useWorkspaceIndexTreeFlow.js'
import { useWorkspacePageIndexViews } from './useWorkspacePageIndexViews.js'
import { useWorkspacePlanningPanels } from './useWorkspacePlanningPanels.js'
import { useWorkspacePreferenceStores } from './useWorkspacePreferenceStores.js'

export const useWorkspaceIndexPlanningSetup = ({
  platform = {},
  state = {},
  options = {},
  documents = {},
  metadata = {},
  persistence = {},
  refreshers = {},
  user = {},
} = {}) => {
  const indexTree = useWorkspaceIndexTreeFlow({
    workspaceDocuments: documents.workspaceDocuments,
    fetchWorkspaceDocument: (documentId) => platform.api.getPost(documentId),
    saveWorkspaceDocument: (payload) => platform.api.savePost(payload),
    workspacePageIndexRows: state.workspacePageIndexRows,
    workspacePageIndexFilter: state.workspacePageIndexFilter,
    workspacePageIndexQuery: state.workspacePageIndexQuery,
    workspacePageIndexTagFilter: state.workspacePageIndexTagFilter,
    workspacePageIndexOwnerFilter: state.workspacePageIndexOwnerFilter,
    workspacePageIndexSort: state.workspacePageIndexSort,
    workspacePropertyOwnerCandidates: documents.workspacePropertyOwnerCandidates,
    priorityOptions: () => options.priorityOptions,
    workspacePageIndexSelectedIds: state.workspacePageIndexSelectedIds,
    workspacePageIndexBulkUpdating: state.workspacePageIndexBulkUpdating,
    workspacePageIndexBulkStatus: state.workspacePageIndexBulkStatus,
    workspacePageIndexBulkPriority: state.workspacePageIndexBulkPriority,
    workspacePageIndexBulkOwnerEmail: state.workspacePageIndexBulkOwnerEmail,
    workspacePageIndexBulkDueDate: state.workspacePageIndexBulkDueDate,
    workspacePageIndexBulkClearDueDate: state.workspacePageIndexBulkClearDueDate,
    currentWorkspaceKey: state.currentWorkspaceKey,
    documentId: documents.documentId,
    workspacePageIndexRowById: documents.workspacePageIndexRowById,
    workspaceDocumentById: documents.workspaceDocumentById,
    editorApi: state.editorApi,
    applyWorkspaceParentPage: metadata.applyWorkspaceParentPage,
    persistWorkspace: persistence.persistWorkspace,
    serializeWorkspaceSnapshotWithParent: metadata.serializeWorkspaceSnapshotWithParent,
    refreshWorkspaceDocuments: refreshers.refreshWorkspaceDocuments,
    refreshWorkspacePageIndex: refreshers.refreshWorkspacePageIndex,
    title: state.title,
    titleDirty: state.titleDirty,
    createWorkspaceChildPage: documents.createWorkspaceChildPage,
    activeWorkspacePanelTab: state.activeWorkspacePanelTab,
    workspacePageIndexUpdatingIds: state.workspacePageIndexUpdatingIds,
    workspacePageIndexError: state.workspacePageIndexError,
    workspaceBoardDraggingId: state.workspaceBoardDraggingId,
    workspaceBoardDragOverStatus: state.workspaceBoardDragOverStatus,
    extractWorkspacePropertiesFromContents: metadata.extractWorkspacePropertiesFromContents,
    normalizeWorkspaceProperties: metadata.normalizeWorkspaceProperties,
    applyWorkspaceProperties: metadata.applyWorkspaceProperties,
    serializeWorkspaceSnapshotWithProperties: metadata.serializeWorkspaceSnapshotWithProperties,
    statusOptions: () => options.statusOptions,
  })

  const planning = useWorkspacePlanningPanels({
    workspacePageIndexRows: state.workspacePageIndexRows,
    visibleWorkspacePageIndexRows: indexTree.visibleWorkspacePageIndexRows,
    workspaceInboxFilter: state.workspaceInboxFilter,
    workspaceCalendarFilter: state.workspaceCalendarFilter,
    workspaceTimelineFilter: state.workspaceTimelineFilter,
    currentWorkspaceKey: state.currentWorkspaceKey,
    currentUserEmail: user.currentUserEmail,
    statusOptions: options.statusOptions,
  })

  const preferences = useWorkspacePreferenceStores({
    api: platform.api,
    currentUserEmail: user.currentUserEmail,
    workspaceDocuments: documents.workspaceDocuments,
  })

  const pageIndexViews = useWorkspacePageIndexViews({
    workspacePageIndexViews: preferences.workspacePageIndexViews,
    workspacePageIndexViewName: state.workspacePageIndexViewName,
    workspacePageIndexFilter: state.workspacePageIndexFilter,
    workspacePageIndexQuery: state.workspacePageIndexQuery,
    workspacePageIndexTagFilter: state.workspacePageIndexTagFilter,
    workspacePageIndexOwnerFilter: state.workspacePageIndexOwnerFilter,
    workspacePageIndexSort: state.workspacePageIndexSort,
    workspacePageIndexFilterOptions: indexTree.workspacePageIndexFilterOptions,
    workspacePageIndexSortOptions: indexTree.workspacePageIndexSortOptions,
    workspacePageIndexOwnerFilterOptions: indexTree.workspacePageIndexOwnerFilterOptions,
    persistWorkspacePageIndexViews: preferences.persistWorkspacePageIndexViews,
  })

  return {
    ...indexTree,
    ...planning,
    ...preferences,
    ...pageIndexViews,
  }
}
