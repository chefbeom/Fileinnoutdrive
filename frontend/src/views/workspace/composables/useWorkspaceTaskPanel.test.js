import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'

import { useWorkspaceTaskPanel } from './useWorkspaceTaskPanel.js'

describe('useWorkspaceTaskPanel', () => {
  it('summarizes document tasks and filters the visible list', () => {
    const documentTasks = ref([
      { id: 'open-mine', checked: false, assigneeEmail: 'me@example.com', dueDate: '2099-01-01' },
      { id: 'open-other', checked: false, assigneeEmail: 'other@example.com', dueDate: '2099-01-01' },
      { id: 'done', checked: true, assigneeEmail: 'me@example.com', dueDate: '2099-01-01' },
      { id: 'overdue', checked: false, assigneeEmail: 'me@example.com', dueDate: '2024-01-01' },
    ])
    const workspaceTaskFilter = ref('open')

    const subject = useWorkspaceTaskPanel({
      documentTasks,
      currentUserEmail: ref('ME@example.com'),
      workspaceTaskFilter,
      canModifyWorkspacePage: ref(true),
      workspaceTaskAdding: ref(false),
      newWorkspaceTask: ref('새 작업'),
      todayKey: () => '2024-02-01',
    })

    expect(subject.openDocumentTasks.value.map((task) => task.id)).toEqual([
      'open-mine',
      'open-other',
      'overdue',
    ])
    expect(subject.completedDocumentTasks.value.map((task) => task.id)).toEqual(['done'])
    expect(subject.overdueDocumentTasks.value.map((task) => task.id)).toEqual(['overdue'])
    expect(subject.myDocumentTasks.value.map((task) => task.id)).toEqual(['open-mine', 'done', 'overdue'])
    expect(subject.documentTaskProgress.value).toBe(25)
    expect(subject.documentTaskSummaryLabel.value).toBe('1/4 완료')
    expect(subject.workspaceTaskFilterOptions.value.map(({ id, count }) => [id, count])).toEqual([
      ['open', 3],
      ['mine', 3],
      ['overdue', 1],
      ['done', 1],
      ['all', 4],
    ])

    workspaceTaskFilter.value = 'mine'
    expect(subject.visibleDocumentTasks.value.map((task) => task.id)).toEqual(['open-mine', 'done', 'overdue'])

    workspaceTaskFilter.value = 'done'
    expect(subject.visibleDocumentTasks.value.map((task) => task.id)).toEqual(['done'])
  })

  it('tracks whether a new document task can be added', () => {
    const canModifyWorkspacePage = ref(true)
    const workspaceTaskAdding = ref(false)
    const newWorkspaceTask = ref('정리하기')
    const subject = useWorkspaceTaskPanel({
      documentTasks: ref([]),
      currentUserEmail: ref(''),
      workspaceTaskFilter: ref('open'),
      canModifyWorkspacePage: computed(() => canModifyWorkspacePage.value),
      workspaceTaskAdding,
      newWorkspaceTask,
    })

    expect(subject.canAddWorkspaceTask.value).toBe(true)

    newWorkspaceTask.value = '   '
    expect(subject.canAddWorkspaceTask.value).toBe(false)

    newWorkspaceTask.value = '다시 작성'
    workspaceTaskAdding.value = true
    expect(subject.canAddWorkspaceTask.value).toBe(false)

    workspaceTaskAdding.value = false
    canModifyWorkspacePage.value = false
    expect(subject.canAddWorkspaceTask.value).toBe(false)
  })
})
