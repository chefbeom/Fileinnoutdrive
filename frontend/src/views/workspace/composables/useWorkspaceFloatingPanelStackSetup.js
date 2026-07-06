import { useWorkspaceFloatingPanelStackBridge } from './useWorkspaceFloatingPanelStackBridge.js'

export const createWorkspaceFloatingPanelStackContext = ({
  state = {},
  options = {},
  overview = {},
  access = {},
  members = {},
  search = {},
  tree = {},
  database = {},
  planning = {},
  tasks = {},
  relations = {},
  revisions = {},
  comments = {},
  assets = {},
  actions = {},
  refs = {},
} = {}) => {
  const {
    handleRoleAction,
    removeWorkspaceMember,
    ...actionEntries
  } = actions

  return {
    ...state,
    ...overview,
    ...access,
    ...members,
    ...search,
    ...tree,
    ...database,
    ...planning,
    ...tasks,
    ...relations,
    ...revisions,
    ...comments,
    ...assets,
    ...actionEntries,
    workspacePropertyStatusOptions: options.workspacePropertyStatusOptions ?? [],
    workspacePropertyPriorityOptions: options.workspacePropertyPriorityOptions ?? [],
    workspaceQuickBlockOptions: options.workspaceQuickBlockOptions ?? [],
    removeWorkspaceMember: removeWorkspaceMember ?? ((member) => handleRoleAction?.(member, 'KICKED')),
    registerSubpageInput: refs.registerSubpageInput,
    registerCommentInput: refs.registerCommentInput,
  }
}

export const useWorkspaceFloatingPanelStackSetup = (groups = {}) =>
  useWorkspaceFloatingPanelStackBridge(createWorkspaceFloatingPanelStackContext(groups))