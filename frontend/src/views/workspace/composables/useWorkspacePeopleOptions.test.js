import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useWorkspacePeopleOptions } from './useWorkspacePeopleOptions.js'

const initialFor = (name) => String(name || '?').slice(0, 1).toUpperCase()

describe('useWorkspacePeopleOptions', () => {
  it('builds mention, assignee, owner, and tag state', () => {
    const currentUser = ref({ idx: 1, email: 'me@example.com', name: 'Me' })
    const workspaceMemberRows = ref([
      { userIdx: 1, email: 'me@example.com', name: 'Me' },
      { userIdx: 2, email: 'writer@example.com', name: 'Writer' },
    ])
    const activeUsers = ref([
      { userIdx: 3, email: 'viewer@example.com', name: 'Viewer', clientId: 'viewer' },
      { userIdx: 2, email: 'writer@example.com', name: 'Writer Online', clientId: 'writer' },
    ])
    const newWorkspaceTaskAssignee = ref('writer@example.com')
    const workspacePropertyOwnerEmail = ref('external@example.com')
    const workspacePropertyTagsInput = ref('alpha, beta, alpha')

    const subject = useWorkspacePeopleOptions({
      workspaceMemberRows,
      activeUsers,
      currentUser,
      currentUserIdx: ref(1),
      newWorkspaceTaskAssignee,
      workspacePropertyTagsInput,
      workspacePropertyOwnerEmail,
      workspacePropertyOwnerName: ref('External'),
      initialFor,
    })

    expect(subject.workspaceMentionCandidates.value.map((candidate) => candidate.email)).toEqual([
      'writer@example.com',
      'viewer@example.com',
    ])
    expect(subject.canUseWorkspaceMentions.value).toBe(true)
    expect(subject.workspaceTaskAssigneeCandidates.value.map((candidate) => candidate.email)).toEqual([
      'me@example.com',
      'writer@example.com',
      'viewer@example.com',
    ])
    expect(subject.selectedWorkspaceTaskAssignee.value?.email).toBe('writer@example.com')
    expect(subject.workspacePropertyTags.value).toEqual(['alpha', 'beta'])
    expect(subject.workspacePropertyOwnerCandidates.value[0]).toMatchObject({
      email: 'external@example.com',
      name: 'External',
    })
    expect(subject.selectedWorkspacePropertyOwner.value?.email).toBe('external@example.com')

    newWorkspaceTaskAssignee.value = 'missing@example.com'
    workspacePropertyOwnerEmail.value = ''
    expect(subject.selectedWorkspaceTaskAssignee.value).toBeNull()
    expect(subject.selectedWorkspacePropertyOwner.value).toBeNull()
  })

  it('resolves property option fallbacks', () => {
    const subject = useWorkspacePeopleOptions({
      workspacePropertyStatus: ref('missing'),
      workspacePropertyPriority: ref('missing'),
      workspacePropertyCoverColor: ref('green'),
      statusOptions: ref([
        { id: 'planning', label: 'Planning' },
        { id: 'done', label: 'Done' },
      ]),
      priorityOptions: ref([
        { id: 'low', label: 'Low' },
        { id: 'normal', label: 'Normal' },
        { id: 'high', label: 'High' },
      ]),
      coverColorOptions: ref([
        { id: 'blue', label: 'Blue' },
        { id: 'green', label: 'Green' },
      ]),
    })

    expect(subject.workspacePropertyStatusOption.value).toMatchObject({ id: 'planning' })
    expect(subject.workspacePropertyPriorityOption.value).toMatchObject({ id: 'normal' })
    expect(subject.workspacePropertyCoverColorOption.value).toMatchObject({ id: 'green' })
  })
})
