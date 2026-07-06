import { useWorkspaceSurfaceSetup } from './useWorkspaceSurfaceSetup.js'

export const createWorkspaceSurfaceExperienceEntries = ({
  coreAccess = {},
  indexPlanning = {},
  editorExperience = {},
  peopleExperience = {},
  documentExperience = {},
  members = {},
  documentOperations = {},
  collaboration = {},
  services = {},
} = {}) => ({
  ...coreAccess,
  ...indexPlanning,
  ...editorExperience,
  ...peopleExperience,
  ...documentExperience,
  ...members,
  ...documentOperations,
  ...collaboration,
  ...services,
})

export const createWorkspaceSurfaceExperienceGroups = ({
  state = {},
  options = {},
  groups = {},
  services = {},
  refs = {},
} = {}) => {
  const entries = createWorkspaceSurfaceExperienceEntries({
    ...groups,
    services,
  })

  return {
    state,
    options,
    surface: entries,
    actions: entries,
    refs,
  }
}

export const useWorkspaceSurfaceExperienceSetup = (config = {}) =>
  useWorkspaceSurfaceSetup(createWorkspaceSurfaceExperienceGroups(config))