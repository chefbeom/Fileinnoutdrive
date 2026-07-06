import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceScheduleInboxPanels from './WorkspaceScheduleInboxPanels.vue'

const stubs = {
  WorkspaceTimelinePanel: defineComponent({
    props: ['filter', 'groups'],
    emits: ['refresh', 'update:filter', 'toggle-task', 'open-item'],
    setup(_, { emit }) {
      return { emit }
    },
    template: `
      <section class="timeline-panel">
        <button class="timeline-refresh" @click="emit('refresh')">refresh</button>
        <button class="timeline-filter" @click="emit('update:filter', 'done')">filter</button>
        <button class="timeline-toggle" @click="emit('toggle-task', { id: 'timeline-task' })">toggle</button>
        <button class="timeline-open" @click="emit('open-item', { id: 'timeline-item' })">open</button>
      </section>
    `,
  }),
  WorkspaceCalendarPanel: defineComponent({
    props: ['filter', 'groups'],
    emits: ['refresh', 'update:filter', 'toggle-task', 'open-item'],
    setup(_, { emit }) {
      return { emit }
    },
    template: `
      <section class="calendar-panel">
        <button class="calendar-refresh" @click="emit('refresh')">refresh</button>
        <button class="calendar-filter" @click="emit('update:filter', 'overdue')">filter</button>
        <button class="calendar-toggle" @click="emit('toggle-task', { id: 'calendar-task' })">toggle</button>
        <button class="calendar-open" @click="emit('open-item', { id: 'calendar-item' })">open</button>
      </section>
    `,
  }),
  WorkspaceInboxPanel: defineComponent({
    props: ['activeFilter', 'tasks'],
    emits: ['update:filter', 'toggle-task', 'focus-task'],
    setup(_, { emit }) {
      return { emit }
    },
    template: `
      <section class="inbox-panel">
        <button class="inbox-filter" @click="emit('update:filter', 'mine')">filter</button>
        <button class="inbox-toggle" @click="emit('toggle-task', { id: 'inbox-task' })">toggle</button>
        <button class="inbox-focus" @click="emit('focus-task', { id: 'inbox-task' })">focus</button>
      </section>
    `,
  }),
}

const mountPanels = (overrides = {}) => mount(WorkspaceScheduleInboxPanels, {
  props: {
    activeTab: 'all',
    isPanelVisible: (id) => ['timeline', 'calendar', 'inbox'].includes(id),
    loading: false,
    timelineFilter: 'open',
    timelineFilterOptions: [{ id: 'open', label: '열림' }],
    timelineRange: { startLabel: '1일', summaryLabel: '7일', endLabel: '8일' },
    timelineGroups: [{ id: 'g1', items: [] }],
    timelineEmptyLabel: '타임라인 없음',
    timelineItemStyle: () => ({ left: '0%' }),
    calendarFilter: 'upcoming',
    calendarFilterOptions: [{ id: 'upcoming', label: '예정' }],
    calendarGroups: [{ id: 'today', items: [] }],
    calendarEmptyLabel: '일정 없음',
    todayKey: '2026-07-06',
    inboxOpenTaskCount: 2,
    inboxFilterOptions: [{ id: 'mine', label: '내 작업' }],
    inboxFilter: 'mine',
    inboxTasks: [{ id: 'task-1' }],
    inboxEmptyLabel: '작업 없음',
    isTaskToggling: () => false,
    ...overrides,
  },
  global: { stubs },
})

describe('WorkspaceScheduleInboxPanels', () => {
  it('renders schedule and inbox panels with dividers in all mode', () => {
    const wrapper = mountPanels()

    expect(wrapper.find('.timeline-panel').exists()).toBe(true)
    expect(wrapper.find('.calendar-panel').exists()).toBe(true)
    expect(wrapper.find('.inbox-panel').exists()).toBe(true)
    expect(wrapper.findAll('.workspace-floating-divider')).toHaveLength(2)
  })

  it('uses the visibility callback for each panel', () => {
    const wrapper = mountPanels({ isPanelVisible: (id) => id === 'calendar' })

    expect(wrapper.find('.timeline-panel').exists()).toBe(false)
    expect(wrapper.find('.calendar-panel').exists()).toBe(true)
    expect(wrapper.find('.inbox-panel').exists()).toBe(false)
  })

  it('forwards timeline, calendar, and inbox events', async () => {
    const wrapper = mountPanels()

    await wrapper.find('.timeline-refresh').trigger('click')
    await wrapper.find('.timeline-filter').trigger('click')
    await wrapper.find('.timeline-toggle').trigger('click')
    await wrapper.find('.timeline-open').trigger('click')
    await wrapper.find('.calendar-refresh').trigger('click')
    await wrapper.find('.calendar-filter').trigger('click')
    await wrapper.find('.calendar-toggle').trigger('click')
    await wrapper.find('.calendar-open').trigger('click')
    await wrapper.find('.inbox-filter').trigger('click')
    await wrapper.find('.inbox-toggle').trigger('click')
    await wrapper.find('.inbox-focus').trigger('click')

    expect(wrapper.emitted('refresh')).toHaveLength(2)
    expect(wrapper.emitted('update:timelineFilter')).toEqual([['done']])
    expect(wrapper.emitted('update:calendarFilter')).toEqual([['overdue']])
    expect(wrapper.emitted('update:inboxFilter')).toEqual([['mine']])
    expect(wrapper.emitted('toggle-calendar-task')).toEqual([[{ id: 'timeline-task' }], [{ id: 'calendar-task' }]])
    expect(wrapper.emitted('open-calendar-item')).toEqual([[{ id: 'timeline-item' }], [{ id: 'calendar-item' }]])
    expect(wrapper.emitted('toggle-inbox-task')).toEqual([[{ id: 'inbox-task' }]])
    expect(wrapper.emitted('focus-inbox-task')).toEqual([[{ id: 'inbox-task' }]])
  })
})