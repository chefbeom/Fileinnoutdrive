import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceUtilityPanels from './WorkspaceUtilityPanels.vue'

const stubs = {
  WorkspaceActivityPanel: {
    props: ['activityItems'],
    template: '<section class="activity-panel">activity {{ activityItems.length }}</section>',
  },
  WorkspaceBlockInsertPanel: {
    props: ['quickBlockText'],
    emits: ['insert-block', 'update:quick-block-text'],
    template: `
      <section class="block-panel">
        <button class="insert-block" @click="$emit('insert-block')">insert</button>
        <button class="update-quick-block" @click="$emit('update:quick-block-text', 'todo')">update</button>
        <span>{{ quickBlockText }}</span>
      </section>
    `,
  },
  WorkspaceTaskPanel: {
    props: ['newTask', 'taskProgress'],
    emits: ['add-task', 'focus-task', 'toggle-task', 'update:new-task', 'update:task-filter'],
    template: `
      <section class="task-panel">
        <button class="add-task" @click="$emit('add-task')">add</button>
        <button class="focus-task" @click="$emit('focus-task', { id: 'task-1' })">focus</button>
        <button class="toggle-task" @click="$emit('toggle-task', { id: 'task-2' })">toggle</button>
        <button class="update-task" @click="$emit('update:new-task', 'next task')">update task</button>
        <button class="update-filter" @click="$emit('update:task-filter', 'done')">filter</button>
        <span>{{ newTask }} {{ taskProgress }}</span>
      </section>
    `,
  },
  WorkspaceOutlinePanel: {
    props: ['outline'],
    emits: ['focus-outline-item'],
    template: '<button class="outline-panel" @click="$emit(\'focus-outline-item\', outline[0])">outline {{ outline.length }}</button>',
  },
}

const mountUtilityPanels = (overrides = {}) => mount(WorkspaceUtilityPanels, {
  props: {
    activeTab: 'all',
    isPanelVisible: (id) => ['activity', 'blocks', 'tasks', 'outline'].includes(id),
    activityItems: [{ id: 'a1' }],
    quickBlockOptions: [{ id: 'todo', label: '할 일' }],
    quickBlockText: '/to',
    quickBlockAdding: false,
    canInsertQuickBlock: true,
    canModifyPage: true,
    isPageLocked: false,
    openDocumentTasks: [{ id: 't1' }],
    documentTasks: [{ id: 't1' }],
    visibleDocumentTasks: [{ id: 't1' }],
    taskFilterOptions: [{ value: 'open', label: '열림' }],
    taskAssigneeCandidates: [],
    newTask: 'draft',
    newTaskAssignee: '',
    newTaskDueDate: '',
    taskFilter: 'open',
    taskEmptyLabel: '작업 없음',
    taskProgress: 42,
    taskSummaryLabel: '1개',
    canAddTask: true,
    taskAdding: false,
    isTaskToggling: () => false,
    outline: [{ id: 'h1', text: 'Header' }],
    ...overrides,
  },
  global: { stubs },
})

describe('WorkspaceUtilityPanels', () => {
  it('renders utility panels with dividers in all mode', () => {
    const wrapper = mountUtilityPanels()

    expect(wrapper.find('.activity-panel').text()).toContain('1')
    expect(wrapper.find('.block-panel').text()).toContain('/to')
    expect(wrapper.find('.task-panel').text()).toContain('42')
    expect(wrapper.find('.outline-panel').text()).toContain('1')
    expect(wrapper.findAll('.workspace-floating-divider')).toHaveLength(3)
  })

  it('forwards panel update and action events', async () => {
    const wrapper = mountUtilityPanels()

    await wrapper.find('.insert-block').trigger('click')
    await wrapper.find('.update-quick-block').trigger('click')
    await wrapper.find('.add-task').trigger('click')
    await wrapper.find('.focus-task').trigger('click')
    await wrapper.find('.toggle-task').trigger('click')
    await wrapper.find('.update-task').trigger('click')
    await wrapper.find('.update-filter').trigger('click')
    await wrapper.find('.outline-panel').trigger('click')

    expect(wrapper.emitted('insert-block')).toHaveLength(1)
    expect(wrapper.emitted('update:quickBlockText')).toEqual([['todo']])
    expect(wrapper.emitted('add-task')).toHaveLength(1)
    expect(wrapper.emitted('focus-task')).toEqual([[{ id: 'task-1' }]])
    expect(wrapper.emitted('toggle-task')).toEqual([[{ id: 'task-2' }]])
    expect(wrapper.emitted('update:newTask')).toEqual([['next task']])
    expect(wrapper.emitted('update:taskFilter')).toEqual([['done']])
    expect(wrapper.emitted('focus-outline-item')).toEqual([[{ id: 'h1', text: 'Header' }]])
  })

  it('uses the visibility callback for each panel', () => {
    const wrapper = mountUtilityPanels({
      isPanelVisible: (id) => id === 'tasks',
    })

    expect(wrapper.find('.activity-panel').exists()).toBe(false)
    expect(wrapper.find('.block-panel').exists()).toBe(false)
    expect(wrapper.find('.task-panel').exists()).toBe(true)
    expect(wrapper.find('.outline-panel').exists()).toBe(false)
  })
})