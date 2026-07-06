<script setup>
import { computed } from 'vue'

const props = defineProps({
  loading: {
    type: Boolean,
    default: false,
  },
  filter: {
    type: String,
    default: 'open',
  },
  filterOptions: {
    type: Array,
    default: () => [],
  },
  range: {
    type: Object,
    default: () => ({ startLabel: '', summaryLabel: '', endLabel: '' }),
  },
  groups: {
    type: Array,
    default: () => [],
  },
  emptyLabel: {
    type: String,
    default: '',
  },
  itemStyle: {
    type: Function,
    default: () => ({}),
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

const isTaskBusy = (item) => props.isTaskToggling(item?.task)

const isToggleDisabled = (item) => !item?.task?.canToggle || isTaskBusy(item)

const toggleTitle = (item) => {
  if (!item?.task?.canToggle) {
    return '편집 권한 없음'
  }
  return item.isDone ? '작업 다시 열기' : '작업 완료'
}
</script>

<template>
  <section class="workspace-timeline-panel">
    <div class="workspace-floating-panel__header">
      <div>
        <h3>Timeline</h3>
        <p>페이지와 작업 마감일을 시간 흐름으로 확인합니다.</p>
      </div>
      <button
        type="button"
        class="workspace-history-refresh-btn"
        :disabled="loading"
        title="타임라인 새로고침"
        @click="emit('refresh')"
      >
        <i :class="loading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-rotate-right'"></i>
      </button>
    </div>

    <div class="workspace-timeline-filters" role="tablist" aria-label="워크스페이스 타임라인 필터">
      <button
        v-for="option in filterOptions"
        :key="option.id"
        type="button"
        :class="{ 'workspace-timeline-filter--active': selectedFilter === option.id }"
        role="tab"
        :aria-selected="selectedFilter === option.id"
        @click="selectedFilter = option.id"
      >
        <span>{{ option.label }}</span>
        <strong>{{ option.count }}</strong>
      </button>
    </div>

    <div v-if="loading" class="workspace-floating-panel__empty">
      타임라인을 모으는 중입니다.
    </div>
    <div v-else-if="groups.length === 0" class="workspace-floating-panel__empty">
      {{ emptyLabel }}
    </div>
    <div v-else class="workspace-timeline-board">
      <div class="workspace-timeline-scale">
        <span>{{ range.startLabel }}</span>
        <strong>{{ range.summaryLabel }}</strong>
        <span>{{ range.endLabel }}</span>
      </div>

      <section
        v-for="group in groups"
        :key="`timeline-${group.id}`"
        class="workspace-timeline-group"
      >
        <div class="workspace-timeline-group__header">
          <span>{{ group.label }}</span>
          <strong>{{ group.items.length }}</strong>
        </div>

        <article
          v-for="item in group.items"
          :key="`timeline-${item.id}`"
          class="workspace-timeline-item"
          :class="[
            `workspace-timeline-item--${item.type}`,
            { 'workspace-timeline-item--done': item.isDone },
            { 'workspace-timeline-item--overdue': item.isOverdue },
          ]"
          :style="itemStyle(item)"
        >
          <span class="workspace-timeline-item__track" aria-hidden="true">
            <i></i>
          </span>
          <div class="workspace-timeline-item__content">
            <button
              v-if="item.type === 'task'"
              type="button"
              class="workspace-timeline-item__toggle"
              :disabled="isToggleDisabled(item)"
              :title="toggleTitle(item)"
              @click="emit('toggle-task', item)"
            >
              <i :class="isTaskBusy(item) ? 'fa-solid fa-spinner fa-spin' : item.isDone ? 'fa-solid fa-check' : 'fa-solid fa-minus'"></i>
            </button>
            <span v-else class="workspace-timeline-item__icon">{{ item.icon }}</span>

            <button type="button" class="workspace-timeline-item__main" @click="emit('open-item', item)">
              <span class="workspace-timeline-item__body">
                <strong>{{ item.title }}</strong>
                <small>{{ item.dateLabel }} · {{ item.typeLabel }} · {{ item.detail }}</small>
                <span class="workspace-timeline-item__meta">
                  <span>{{ item.statusLabel }}</span>
                  <span v-if="item.priorityLabel" :class="`workspace-property-badge workspace-property-badge--${item.priorityTone}`">
                    {{ item.priorityLabel }}
                  </span>
                </span>
              </span>
              <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </article>
      </section>
    </div>
  </section>
</template>
