<script setup>
import { computed } from 'vue'

const props = defineProps({
  loading: {
    type: Boolean,
    default: false,
  },
  filter: {
    type: String,
    default: 'upcoming',
  },
  filterOptions: {
    type: Array,
    default: () => [],
  },
  groups: {
    type: Array,
    default: () => [],
  },
  emptyLabel: {
    type: String,
    default: '',
  },
  todayKey: {
    type: String,
    default: '',
  },
  isTaskToggling: {
    type: Function,
    default: () => false,
  },
})

const emit = defineEmits(['refresh', 'update:filter', 'toggle-task', 'open-item'])

const selectedFilter = computed({
  get: () => props.filter,
  set: (value) => emit('update:filter', value),
})

const isOverdueGroup = (group) => Boolean(group?.date && props.todayKey && group.date < props.todayKey)

const isToggleDisabled = (item) => !item?.task?.canToggle || props.isTaskToggling(item.task)

const toggleTitle = (item) => {
  if (!item?.task?.canToggle) {
    return '편집 권한 없음'
  }
  return item.isDone ? '작업 다시 열기' : '작업 완료'
}
</script>

<template>
  <section class="workspace-calendar-panel">
    <div class="workspace-floating-panel__header">
      <div>
        <h3>Calendar</h3>
        <p>페이지 기한과 작업 마감일을 날짜별로 확인합니다.</p>
      </div>
      <button
        type="button"
        class="workspace-history-refresh-btn"
        :disabled="loading"
        title="일정 새로고침"
        @click="emit('refresh')"
      >
        <i :class="loading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-rotate-right'"></i>
      </button>
    </div>

    <div class="workspace-calendar-filters" role="tablist" aria-label="워크스페이스 일정 필터">
      <button
        v-for="option in filterOptions"
        :key="option.id"
        type="button"
        :class="{ 'workspace-calendar-filter--active': selectedFilter === option.id }"
        role="tab"
        :aria-selected="selectedFilter === option.id"
        @click="selectedFilter = option.id"
      >
        <span>{{ option.label }}</span>
        <strong>{{ option.count }}</strong>
      </button>
    </div>

    <div v-if="loading" class="workspace-floating-panel__empty">
      워크스페이스 일정을 모으는 중입니다.
    </div>
    <div v-else-if="groups.length === 0" class="workspace-floating-panel__empty">
      {{ emptyLabel }}
    </div>
    <div v-else class="workspace-calendar-groups">
      <section
        v-for="group in groups"
        :key="`calendar-${group.id}`"
        class="workspace-calendar-group"
        :class="{ 'workspace-calendar-group--overdue': isOverdueGroup(group) }"
      >
        <div class="workspace-calendar-group__header">
          <span>{{ group.label }}</span>
          <strong>{{ group.items.length }}</strong>
        </div>
        <article
          v-for="item in group.items"
          :key="item.id"
          class="workspace-calendar-item"
          :class="[
            `workspace-calendar-item--${item.type}`,
            { 'workspace-calendar-item--done': item.isDone },
            { 'workspace-calendar-item--overdue': item.isOverdue },
          ]"
        >
          <button
            v-if="item.type === 'task'"
            type="button"
            class="workspace-calendar-item__toggle"
            :disabled="isToggleDisabled(item)"
            :title="toggleTitle(item)"
            @click="emit('toggle-task', item)"
          >
            <i :class="props.isTaskToggling(item.task) ? 'fa-solid fa-spinner fa-spin' : item.isDone ? 'fa-solid fa-check' : 'fa-solid fa-minus'"></i>
          </button>
          <span v-else class="workspace-calendar-item__icon">{{ item.icon }}</span>

          <button type="button" class="workspace-calendar-item__main" @click="emit('open-item', item)">
            <span class="workspace-calendar-item__body">
              <strong>{{ item.title }}</strong>
              <small>{{ item.typeLabel }} · {{ item.detail }}</small>
              <span class="workspace-calendar-item__meta">
                <span>{{ item.statusLabel }}</span>
                <span v-if="item.priorityLabel" :class="`workspace-property-badge workspace-property-badge--${item.priorityTone}`">
                  {{ item.priorityLabel }}
                </span>
              </span>
            </span>
            <i class="fa-solid fa-arrow-right"></i>
          </button>
        </article>
      </section>
    </div>
  </section>
</template>
