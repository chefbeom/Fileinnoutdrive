import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('./useWorkspaceFullTextSearch.js', () => ({
  useWorkspaceFullTextSearch: vi.fn(),
}))
vi.mock('./useWorkspacePageIndexFilters.js', () => ({
  useWorkspacePageIndexFilters: vi.fn(),
}))
vi.mock('./useWorkspacePageIndexSelection.js', () => ({
  useWorkspacePageIndexSelection: vi.fn(),
}))
vi.mock('./useWorkspacePageTreeState.js', () => ({
  useWorkspacePageTreeState: vi.fn(),
}))
vi.mock('./useWorkspacePageTreeEditing.js', () => ({
  useWorkspacePageTreeEditing: vi.fn(),
}))
vi.mock('./useWorkspacePageTreeMutations.js', () => ({
  useWorkspacePageTreeMutations: vi.fn(),
}))
vi.mock('./useWorkspacePageIndexMutations.js', () => ({
  useWorkspacePageIndexMutations: vi.fn(),
}))

import { useWorkspaceFullTextSearch } from './useWorkspaceFullTextSearch.js'
import { useWorkspaceIndexTreeFlow } from './useWorkspaceIndexTreeFlow.js'
import { useWorkspacePageIndexFilters } from './useWorkspacePageIndexFilters.js'
import { useWorkspacePageIndexMutations } from './useWorkspacePageIndexMutations.js'
import { useWorkspacePageIndexSelection } from './useWorkspacePageIndexSelection.js'
import { useWorkspacePageTreeEditing } from './useWorkspacePageTreeEditing.js'
import { useWorkspacePageTreeMutations } from './useWorkspacePageTreeMutations.js'
import { useWorkspacePageTreeState } from './useWorkspacePageTreeState.js'

const fullTextApi = {
  workspaceFullTextQuery: ref('query'),
  searchWorkspaceContents: vi.fn(),
}
const filtersApi = {
  visibleWorkspacePageIndexRows: ref([{ id: '1' }]),
  workspacePageIndexOwnerOptions: vi.fn(() => []),
}
const selectionApi = {
  selectedWorkspacePageIndexRows: ref([{ id: '1' }]),
  canApplyWorkspacePageIndexBulkUpdate: ref(true),
  clearWorkspacePageIndexSelection: vi.fn(),
}
const treeStateApi = {
  workspacePageTreeQuery: ref(''),
  collapsedWorkspacePageTreeIds: ref(['root']),
  workspacePageTreeAllRows: ref([{ id: 'root' }]),
}
const treeEditingApi = {
  workspaceTreeMoveTargetId: ref('target'),
  workspaceTreeMoveSavingId: ref(''),
  workspaceTreeMoveError: ref(''),
  workspaceTreeRenameDraft: ref('Draft'),
  workspaceTreeRenameSavingId: ref(''),
  workspaceTreeRenameError: ref(''),
  workspaceTreeSubpageCreatingId: ref(''),
  workspaceTreeSubpageError: ref(''),
  workspaceTreeSubpageTitle: ref('Subpage'),
  canApplyWorkspaceTreeMove: vi.fn(() => true),
  cancelWorkspaceTreeMove: vi.fn(),
  isWorkspaceTreeRenameOpen: vi.fn(() => true),
  cancelWorkspaceTreeRename: vi.fn(),
  cancelWorkspaceTreeSubpageComposer: vi.fn(),
}
const treeMutationsApi = {
  moveWorkspaceTreePage: vi.fn(),
  renameWorkspaceTreePage: vi.fn(),
  createWorkspaceTreeSubpage: vi.fn(),
}
const pageIndexMutationsApi = {
  isWorkspacePageIndexRowUpdating: vi.fn(() => false),
  updateWorkspacePageIndexRowProperties: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useWorkspaceFullTextSearch).mockReturnValue(fullTextApi)
  vi.mocked(useWorkspacePageIndexFilters).mockReturnValue(filtersApi)
  vi.mocked(useWorkspacePageIndexSelection).mockReturnValue(selectionApi)
  vi.mocked(useWorkspacePageTreeState).mockReturnValue(treeStateApi)
  vi.mocked(useWorkspacePageTreeEditing).mockReturnValue(treeEditingApi)
  vi.mocked(useWorkspacePageTreeMutations).mockReturnValue(treeMutationsApi)
  vi.mocked(useWorkspacePageIndexMutations).mockReturnValue(pageIndexMutationsApi)
})

describe('useWorkspaceIndexTreeFlow', () => {
  it('composes search, page index, page tree, and mutation flows', () => {
    const context = {
      workspaceDocuments: vi.fn(() => []),
      fetchWorkspaceDocument: vi.fn(),
      saveWorkspaceDocument: vi.fn(),
      workspacePageIndexRows: ref([]),
      workspacePageIndexFilter: ref('all'),
      workspacePageIndexQuery: ref(''),
      workspacePageIndexTagFilter: ref(''),
      workspacePageIndexOwnerFilter: ref(''),
      workspacePageIndexSort: ref('updated-desc'),
      workspacePropertyOwnerCandidates: vi.fn(() => []),
      priorityOptions: vi.fn(() => []),
      workspacePageIndexSelectedIds: ref([]),
      workspacePageIndexBulkUpdating: ref(false),
      workspacePageIndexBulkStatus: ref(''),
      workspacePageIndexBulkPriority: ref(''),
      workspacePageIndexBulkOwnerEmail: ref(''),
      workspacePageIndexBulkDueDate: ref(''),
      workspacePageIndexBulkClearDueDate: ref(false),
      currentWorkspaceKey: ref('1'),
      documentId: vi.fn((row) => row.id),
      workspacePageIndexRowById: vi.fn(() => new Map()),
      workspaceDocumentById: vi.fn(() => new Map()),
      editorApi: ref(null),
      applyWorkspaceParentPage: vi.fn(),
      persistWorkspace: vi.fn(),
      serializeWorkspaceSnapshotWithParent: vi.fn(),
      refreshWorkspaceDocuments: vi.fn(),
      refreshWorkspacePageIndex: vi.fn(),
      title: ref('Title'),
      titleDirty: ref(false),
      createWorkspaceChildPage: vi.fn(),
      activeWorkspacePanelTab: ref('tree'),
      workspacePageIndexUpdatingIds: ref([]),
      workspacePageIndexError: ref(''),
      workspaceBoardDraggingId: ref(''),
      workspaceBoardDragOverStatus: ref(''),
      extractWorkspacePropertiesFromContents: vi.fn(),
      normalizeWorkspaceProperties: vi.fn(),
      applyWorkspaceProperties: vi.fn(),
      serializeWorkspaceSnapshotWithProperties: vi.fn(),
      statusOptions: vi.fn(() => []),
    }

    const result = useWorkspaceIndexTreeFlow(context)

    expect(useWorkspaceFullTextSearch).toHaveBeenCalledWith({
      workspaceDocuments: context.workspaceDocuments,
      fetchWorkspaceDocument: context.fetchWorkspaceDocument,
    })
    expect(useWorkspacePageIndexFilters).toHaveBeenCalledWith(expect.objectContaining({
      workspacePageIndexRows: context.workspacePageIndexRows,
      workspacePropertyOwnerCandidates: context.workspacePropertyOwnerCandidates,
      priorityOptions: context.priorityOptions,
    }))
    expect(useWorkspacePageIndexSelection).toHaveBeenCalledWith(expect.objectContaining({
      visibleWorkspacePageIndexRows: filtersApi.visibleWorkspacePageIndexRows,
    }))
    expect(useWorkspacePageTreeEditing).toHaveBeenCalledWith({
      workspacePageTreeAllRows: treeStateApi.workspacePageTreeAllRows,
    })
    expect(useWorkspacePageTreeMutations).toHaveBeenCalledWith(expect.objectContaining({
      workspaceTreeMoveTargetId: treeEditingApi.workspaceTreeMoveTargetId,
      collapsedWorkspacePageTreeIds: treeStateApi.collapsedWorkspacePageTreeIds,
      cancelWorkspaceTreeMove: treeEditingApi.cancelWorkspaceTreeMove,
      refreshWorkspacePageIndex: context.refreshWorkspacePageIndex,
    }))
    expect(useWorkspacePageIndexMutations).toHaveBeenCalledWith(expect.objectContaining({
      workspacePageIndexOwnerOptions: filtersApi.workspacePageIndexOwnerOptions,
      selectedWorkspacePageIndexRows: selectionApi.selectedWorkspacePageIndexRows,
      canApplyWorkspacePageIndexBulkUpdate: selectionApi.canApplyWorkspacePageIndexBulkUpdate,
      clearWorkspacePageIndexSelection: selectionApi.clearWorkspacePageIndexSelection,
      statusOptions: context.statusOptions,
    }))
    expect(result).toMatchObject({
      workspaceFullTextQuery: fullTextApi.workspaceFullTextQuery,
      visibleWorkspacePageIndexRows: filtersApi.visibleWorkspacePageIndexRows,
      selectedWorkspacePageIndexRows: selectionApi.selectedWorkspacePageIndexRows,
      workspacePageTreeQuery: treeStateApi.workspacePageTreeQuery,
      workspaceTreeMoveTargetId: treeEditingApi.workspaceTreeMoveTargetId,
      moveWorkspaceTreePage: treeMutationsApi.moveWorkspaceTreePage,
      updateWorkspacePageIndexRowProperties: pageIndexMutationsApi.updateWorkspacePageIndexRowProperties,
    })
  })
})