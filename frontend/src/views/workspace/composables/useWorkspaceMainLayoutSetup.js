import { useWorkspaceMainLayoutBridge } from './useWorkspaceMainLayoutBridge.js'

export const createWorkspaceMainLayoutContext = ({
  state = {},
  documents = {},
  properties = {},
  status = {},
  access = {},
  presence = {},
  assets = {},
  templates = {},
  actions = {},
} = {}) => ({
  ...state,
  ...documents,
  ...properties,
  ...status,
  ...access,
  ...presence,
  ...assets,
  ...templates,
  ...actions,
})

export const useWorkspaceMainLayoutSetup = (groups = {}) =>
  useWorkspaceMainLayoutBridge(createWorkspaceMainLayoutContext(groups))
