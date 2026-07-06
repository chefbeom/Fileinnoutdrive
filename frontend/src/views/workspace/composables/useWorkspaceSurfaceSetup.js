import { useWorkspaceFloatingPanelStackSetup } from './useWorkspaceFloatingPanelStackSetup.js'
import { useWorkspaceMainLayoutSetup } from './useWorkspaceMainLayoutSetup.js'

export const createWorkspaceSurfacePanelGroups = ({
  state = {},
  options = {},
  surface = {},
  actions = {},
  refs = {},
} = {}) => ({
  state,
  options: {
    workspacePropertyStatusOptions: options.workspacePropertyStatusOptions ?? [],
    workspacePropertyPriorityOptions: options.workspacePropertyPriorityOptions ?? [],
    workspaceQuickBlockOptions: options.workspaceQuickBlockOptions ?? [],
  },
  overview: surface,
  access: surface,
  members: surface,
  search: surface,
  tree: surface,
  database: surface,
  planning: surface,
  tasks: surface,
  relations: surface,
  revisions: surface,
  comments: surface,
  assets: surface,
  actions,
  refs,
})

export const createWorkspaceSurfaceMainLayoutGroups = ({
  state = {},
  options = {},
  surface = {},
  actions = {},
} = {}) => ({
  state,
  documents: surface,
  properties: surface,
  status: surface,
  access: surface,
  presence: surface,
  assets: surface,
  templates: {
    ...surface,
    workspaceTemplates: options.workspaceTemplates ?? [],
  },
  actions,
})

export const useWorkspaceSurfaceSetup = (groups = {}) => ({
  ...useWorkspaceFloatingPanelStackSetup(createWorkspaceSurfacePanelGroups(groups)),
  ...useWorkspaceMainLayoutSetup(createWorkspaceSurfaceMainLayoutGroups(groups)),
})