<script setup>
import WorkspaceCalendarPanel from './WorkspaceCalendarPanel.vue'
import WorkspaceInboxPanel from './WorkspaceInboxPanel.vue'
import WorkspaceTimelinePanel from './WorkspaceTimelinePanel.vue'

defineProps({
  activeTab: { type: String, default: '' },
  isPanelVisible: { type: Function, required: true },
  loading: { type: Boolean, default: false },
  timelineFilter: { type: String, default: 'open' },
  timelineFilterOptions: { type: Array, default: () => [] },
  timelineRange: { type: Object, default: () => ({ startLabel: '', summaryLabel: '', endLabel: '' }) },
  timelineGroups: { type: Array, default: () => [] },
  timelineEmptyLabel: { type: String, default: '' },
  timelineItemStyle: { type: Function, default: () => ({}) },
  calendarFilter: { type: String, default: 'upcoming' },
  calendarFilterOptions: { type: Array, default: () => [] },
  calendarGroups: { type: Array, default: () => [] },
  calendarEmptyLabel: { type: String, default: '' },
  todayKey: { type: String, default: '' },
  inboxOpenTaskCount: { type: Number, default: 0 },
  inboxFilterOptions: { type: Array, default: () => [] },
  inboxFilter: { type: String, default: 'mine' },
  inboxTasks: { type: Array, default: () => [] },
  inboxEmptyLabel: { type: String, default: '' },
  isTaskToggling: { type: Function, default: () => false },
})

const emit = defineEmits([
  'refresh',
  'update:timelineFilter',
  'update:calendarFilter',
  'update:inboxFilter',
  'toggle-calendar-task',
  'open-calendar-item',
  'toggle-inbox-task',
  'focus-inbox-task',
])
</script>

<template>
  <WorkspaceTimelinePanel
    v-if="isPanelVisible('timeline')"
    :filter="timelineFilter"
    :loading="loading"
    :filter-options="timelineFilterOptions"
    :range="timelineRange"
    :groups="timelineGroups"
    :empty-label="timelineEmptyLabel"
    :item-style="timelineItemStyle"
    :is-task-toggling="isTaskToggling"
    @update:filter="emit('update:timelineFilter', $event)"
    @refresh="emit('refresh')"
    @toggle-task="emit('toggle-calendar-task', $event)"
    @open-item="emit('open-calendar-item', $event)"
  />

  <div v-if="activeTab === 'all'" class="workspace-floating-divider"></div>

  <WorkspaceCalendarPanel
    v-if="isPanelVisible('calendar')"
    :filter="calendarFilter"
    :loading="loading"
    :filter-options="calendarFilterOptions"
    :groups="calendarGroups"
    :empty-label="calendarEmptyLabel"
    :today-key="todayKey"
    :is-task-toggling="isTaskToggling"
    @update:filter="emit('update:calendarFilter', $event)"
    @refresh="emit('refresh')"
    @toggle-task="emit('toggle-calendar-task', $event)"
    @open-item="emit('open-calendar-item', $event)"
  />

  <div v-if="activeTab === 'all'" class="workspace-floating-divider"></div>

  <WorkspaceInboxPanel
    v-if="isPanelVisible('inbox')"
    :open-task-count="inboxOpenTaskCount"
    :filter-options="inboxFilterOptions"
    :active-filter="inboxFilter"
    :loading="loading"
    :tasks="inboxTasks"
    :empty-label="inboxEmptyLabel"
    :is-task-toggling="isTaskToggling"
    @update:filter="emit('update:inboxFilter', $event)"
    @toggle-task="emit('toggle-inbox-task', $event)"
    @focus-task="emit('focus-inbox-task', $event)"
  />
</template>