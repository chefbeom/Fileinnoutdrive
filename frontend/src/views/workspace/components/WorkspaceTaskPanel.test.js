import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import WorkspaceTaskPanel from './WorkspaceTaskPanel.vue'

const baseTasks = [
  {
    id: 'task-1',
    text: '첫 번째 작업',
    checked: false,
    depth: 1,
    pathLabel: '본문',
    assigneeEmail: 'owner@example.test',
    assigneeName: 'Owner',
    dueDate: '2099-01-01',
  },
  {
    id: 'task-2',
    text: '완료된 작업',
    checked: true,
    depth: 0,
    pathLabel: '본문',
  },
]

const mountPanel = (props = {}) => mount(WorkspaceTaskPanel, {
  props: {
    openDocumentTasks: [baseTasks[0]],
    documentTasks: baseTasks,
    visibleDocumentTasks: baseTasks,
    taskFilterOptions: [
      { id: 'open', label: '진행', count: 1 },
      { id: 'done', label: '완료', count: 1 },
    ],
    taskAssigneeCandidates: [
      { email: 'owner@example.test', name: 'Owner' },
    ],
    newTask: '',
    newTaskAssignee: '',
    newTaskDueDate: '',
    taskFilter: 'open',
    taskEmptyLabel: '작업이 없습니다.',
    taskProgress: 50,
    taskSummaryLabel: '1/2 완료',
    canModifyWorkspacePage: true,
    canAddTask: true,
    taskAdding: false,
    isTaskToggling: vi.fn(() => false),
    ...props,
  },
})

describe('WorkspaceTaskPanel', () => {
  it('renders task rows and progress state', () => {
    const wrapper = mountPanel()

    expect(wrapper.findAll('.workspace-task-item')).toHaveLength(2)
    expect(wrapper.find('.workspace-floating-panel__count').text()).toBe('1')
    expect(wrapper.text()).toContain('1/2 완료')
    expect(wrapper.find('.workspace-task-progress__bar span').attributes('style')).toContain('50%')
  })

  it('emits composer model updates and add action', async () => {
    const wrapper = mountPanel()

    await wrapper.find('.workspace-task-composer__row input').setValue('새 작업')
    await wrapper.find('select').setValue('owner@example.test')
    await wrapper.find('input[type="date"]').setValue('2099-02-01')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('update:new-task')).toEqual([['새 작업']])
    expect(wrapper.emitted('update:new-task-assignee')).toEqual([['owner@example.test']])
    expect(wrapper.emitted('update:new-task-due-date')).toEqual([['2099-02-01']])
    expect(wrapper.emitted('add-task')).toEqual([[]])
  })

  it('emits filter, toggle, and focus actions', async () => {
    const wrapper = mountPanel()

    await wrapper.findAll('.workspace-task-filters button')[1].trigger('click')
    await wrapper.find('.workspace-task-check').trigger('click')
    await wrapper.find('.workspace-task-body').trigger('click')

    expect(wrapper.emitted('update:task-filter')).toEqual([['done']])
    expect(wrapper.emitted('toggle-task')).toEqual([[baseTasks[0]]])
    expect(wrapper.emitted('focus-task')).toEqual([[baseTasks[0]]])
  })

  it('disables composer controls when the page cannot be modified', () => {
    const wrapper = mountPanel({
      canModifyWorkspacePage: false,
      canAddTask: false,
    })

    expect(wrapper.find('.workspace-task-composer__row input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('select').attributes('disabled')).toBeDefined()
    expect(wrapper.find('input[type="date"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })
})