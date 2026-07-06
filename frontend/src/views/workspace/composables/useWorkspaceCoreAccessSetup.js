import { useWorkspaceAccessState } from './useWorkspaceAccessState.js'
import { useWorkspaceDerivedState } from './useWorkspaceDerivedState.js'
import { useWorkspaceEditorRefs } from './useWorkspaceEditorRefs.js'
import { useWorkspaceLeaveGuard } from './useWorkspaceLeaveGuard.js'
import { useWorkspaceNormalization } from './useWorkspaceNormalization.js'
import { useWorkspacePageMetadata } from './useWorkspacePageMetadata.js'

export const useWorkspaceCoreAccessSetup = ({
  platform = {},
  state = {},
  propertyOptions = {},
  documents = {},
} = {}) => {
  const normalization = useWorkspaceNormalization({
    workspaceId: state.workspaceId,
    propertyOptions,
  })

  const metadata = useWorkspacePageMetadata({
    normalizeWorkspaceProperties: normalization.normalizeWorkspaceProperties,
    workspacePropertyIcon: state.workspacePropertyIcon,
    workspacePropertyCoverColor: state.workspacePropertyCoverColor,
    workspacePropertyStatus: state.workspacePropertyStatus,
    workspacePropertyPriority: state.workspacePropertyPriority,
    workspacePropertyOwnerEmail: state.workspacePropertyOwnerEmail,
    workspacePropertyOwnerName: state.workspacePropertyOwnerName,
    workspacePropertyDueDate: state.workspacePropertyDueDate,
    workspacePropertyTagsInput: state.workspacePropertyTagsInput,
    workspacePageLocked: state.workspacePageLocked,
    workspaceParentPageId: state.workspaceParentPageId,
    workspaceParentPageTitle: state.workspaceParentPageTitle,
    currentWorkspaceParentPage: documents.currentWorkspaceParentPage,
    openWorkspaceDocument: documents.openWorkspaceDocument,
  })

  const editorRefs = useWorkspaceEditorRefs({
    editorApi: state.editorApi,
    workspaceId: state.workspaceId,
  })

  const derived = useWorkspaceDerivedState({
    currentUser: platform.currentUser,
    route: platform.route,
    title: state.title,
    titleDirty: state.titleDirty,
    isEditorDirty: editorRefs.isEditorDirty,
    workspaceId: state.workspaceId,
    activeUsers: editorRefs.activeUsers,
    saveState: state.saveState,
    workspacePageBreadcrumbTrail: documents.workspacePageBreadcrumbTrail,
    currentWorkspaceChildPages: documents.currentWorkspaceChildPages,
    linkedWorkspaceDocuments: documents.linkedWorkspaceDocuments,
    workspaceBacklinks: documents.workspaceBacklinks,
  })

  const leaveGuard = useWorkspaceLeaveGuard({
    hasUnsavedChanges: derived.hasUnsavedChanges,
  })

  const access = useWorkspaceAccessState({
    currentUser: platform.currentUser,
    workspaceId: state.workspaceId,
    workspaceAccessRole: state.workspaceAccessRole,
    workspacePageLocked: state.workspacePageLocked,
    workspaceTemplateApplied: state.workspaceTemplateApplied,
    hasUnsavedChanges: derived.hasUnsavedChanges,
    title: state.title,
    workspaceShareStatus: state.workspaceShareStatus,
    isValid: derived.isValid,
  })

  return {
    ...normalization,
    ...metadata,
    ...editorRefs,
    ...derived,
    ...leaveGuard,
    ...access,
  }
}
