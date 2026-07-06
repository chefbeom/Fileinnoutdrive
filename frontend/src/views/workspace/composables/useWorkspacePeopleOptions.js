import { computed } from 'vue'

import { normalizeWorkspacePropertyTags } from '../services/workspaceProperties.js'
import {
  createWorkspaceMentionCandidates,
  createWorkspacePropertyOwnerCandidates,
  createWorkspaceTaskAssigneeCandidates,
} from '../services/workspacePeople.js'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}
const readString = (source) => String(resolveSource(source) || '')
const readObject = (source) => {
  const value = resolveSource(source)
  return value && typeof value === 'object' ? value : {}
}

const findOption = (optionsSource, selectedSource, fallbackIndex = 0) => {
  const options = readRows(optionsSource)
  return options.find((option) => option?.id === readString(selectedSource)) || options[fallbackIndex] || options[0] || null
}

export const useWorkspacePeopleOptions = ({
  workspaceMemberRows,
  activeUsers,
  currentUser,
  currentUserIdx,
  newWorkspaceTaskAssignee,
  workspacePropertyTagsInput,
  workspacePropertyOwnerEmail,
  workspacePropertyOwnerName,
  workspacePropertyStatus,
  workspacePropertyPriority,
  workspacePropertyCoverColor,
  statusOptions,
  priorityOptions,
  coverColorOptions,
  initialFor,
} = {}) => {
  const workspaceMentionCandidates = computed(() =>
    createWorkspaceMentionCandidates({
      memberRows: readRows(workspaceMemberRows),
      activeUsers: readRows(activeUsers),
      currentUser: readObject(currentUser),
      currentUserIdx: resolveSource(currentUserIdx),
      initialFor,
    }),
  )

  const workspaceTaskAssigneeCandidates = computed(() =>
    createWorkspaceTaskAssigneeCandidates({
      currentUser: readObject(currentUser),
      memberRows: readRows(workspaceMemberRows),
      activeUsers: readRows(activeUsers),
      mentionCandidates: workspaceMentionCandidates.value,
      initialFor,
    }),
  )

  const selectedWorkspaceTaskAssignee = computed(() =>
    workspaceTaskAssigneeCandidates.value.find(
      (candidate) => candidate.email === readString(newWorkspaceTaskAssignee),
    ) || null,
  )

  const workspacePropertyTags = computed(() =>
    normalizeWorkspacePropertyTags(readString(workspacePropertyTagsInput)),
  )

  const workspacePropertyOwnerCandidates = computed(() =>
    createWorkspacePropertyOwnerCandidates({
      taskAssigneeCandidates: workspaceTaskAssigneeCandidates.value,
      ownerEmail: readString(workspacePropertyOwnerEmail),
      ownerName: readString(workspacePropertyOwnerName),
      initialFor,
    }),
  )

  const selectedWorkspacePropertyOwner = computed(() =>
    workspacePropertyOwnerCandidates.value.find(
      (candidate) => candidate.email === readString(workspacePropertyOwnerEmail),
    ) || null,
  )

  const workspacePropertyStatusOption = computed(() =>
    findOption(statusOptions, workspacePropertyStatus, 0),
  )

  const workspacePropertyPriorityOption = computed(() =>
    findOption(priorityOptions, workspacePropertyPriority, 1),
  )

  const workspacePropertyCoverColorOption = computed(() =>
    findOption(coverColorOptions, workspacePropertyCoverColor, 0),
  )

  const canUseWorkspaceMentions = computed(() => workspaceMentionCandidates.value.length > 0)

  return {
    workspaceMentionCandidates,
    workspaceTaskAssigneeCandidates,
    selectedWorkspaceTaskAssignee,
    workspacePropertyTags,
    workspacePropertyOwnerCandidates,
    selectedWorkspacePropertyOwner,
    workspacePropertyStatusOption,
    workspacePropertyPriorityOption,
    workspacePropertyCoverColorOption,
    canUseWorkspaceMentions,
  }
}
