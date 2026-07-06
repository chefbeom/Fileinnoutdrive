<script setup>
const props = defineProps({
  loading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: '',
  },
  rows: {
    type: Array,
    default: () => [],
  },
  columns: {
    type: Array,
    default: () => [],
  },
  statusOptions: {
    type: Array,
    default: () => [],
  },
  draggingId: {
    type: String,
    default: '',
  },
  dragOverStatus: {
    type: String,
    default: '',
  },
  isRowUpdating: {
    type: Function,
    default: () => false,
  },
})

const emit = defineEmits([
  'refresh',
  'open-row',
  'set-drop-target',
  'clear-drop-target',
  'drop-status',
  'start-drag',
  'clear-drag',
  'move-status',
  'update-status',
])

const isBusy = (row) => props.isRowUpdating(row)
const canEdit = (row) => Boolean(row?.canEditProperties && !isBusy(row))
const isFirstStatus = (column) => column?.id === props.statusOptions[0]?.id
const isLastStatus = (column) => column?.id === props.statusOptions[props.statusOptions.length - 1]?.id
const openTaskCount = (row) => (row?.workspaceTasks || []).filter((task) => !task.checked).length
</script>

<template>
  <section class="workspace-board-panel">
    <div class="workspace-floating-panel__header">
      <div>
        <h3>Page Board</h3>
        <p>페이지 상태를 보드 컬럼으로 보고 바로 이동시킵니다.</p>
      </div>
      <button
        type="button"
        class="workspace-history-refresh-btn"
        :disabled="loading"
        title="보드 새로고침"
        @click="emit('refresh')"
      >
        <i :class="loading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-rotate-right'"></i>
      </button>
    </div>

    <p v-if="error" class="workspace-assets__error">{{ error }}</p>
    <div v-if="loading" class="workspace-floating-panel__empty">
      페이지 보드를 불러오는 중입니다.
    </div>
    <div v-else-if="rows.length === 0" class="workspace-floating-panel__empty">
      보드에 표시할 페이지가 없습니다.
    </div>
    <div v-else class="workspace-board-columns">
      <section
        v-for="column in columns"
        :key="`board-column-${column.id}`"
        class="workspace-board-column"
        :class="[
          `workspace-board-column--${column.tone}`,
          { 'workspace-board-column--drop-target': dragOverStatus === column.id },
        ]"
        @dragenter.prevent="emit('set-drop-target', column.id)"
        @dragover.prevent="emit('set-drop-target', column.id)"
        @dragleave="emit('clear-drop-target', $event, column.id)"
        @drop.prevent="emit('drop-status', $event, column.id)"
      >
        <div class="workspace-board-column__header">
          <span>{{ column.label }}</span>
          <strong>{{ column.rows.length }}</strong>
        </div>
        <small v-if="column.openTaskCount > 0" class="workspace-board-column__tasks">
          열린 작업 {{ column.openTaskCount }}
        </small>

        <div v-if="column.rows.length === 0" class="workspace-board-empty">
          페이지 없음
        </div>
        <template v-else>
          <article
            v-for="row in column.rows"
            :key="`board-card-${row.id}`"
            class="workspace-board-card"
            :class="{
              'workspace-board-card--overdue': row.isOverdue,
              'workspace-board-card--locked': row.locked,
              'workspace-board-card--draggable': canEdit(row),
              'workspace-board-card--dragging': draggingId === String(row.id),
            }"
            :draggable="canEdit(row)"
            @dragstart="emit('start-drag', $event, row)"
            @dragend="emit('clear-drag')"
          >
            <button type="button" class="workspace-board-card__main" @click="emit('open-row', row)">
              <span class="workspace-board-card__icon">{{ row.icon }}</span>
              <span class="workspace-board-card__body">
                <strong>{{ row.title }}</strong>
                <small>{{ row.scopeLabel }} · {{ row.roleLabel }}</small>
              </span>
            </button>

            <div class="workspace-board-card__meta">
              <span :class="`workspace-property-badge workspace-property-badge--${row.priorityTone}`">
                {{ row.priorityLabel }}
              </span>
              <span v-if="row.dueDate" :class="{ 'workspace-board-chip--danger': row.isOverdue }">
                <i class="fa-regular fa-calendar"></i>
                {{ row.dueDate }}
              </span>
              <span v-if="row.locked">
                <i class="fa-solid fa-lock"></i>
                잠김
              </span>
              <span v-if="row.ownerName">
                <i class="fa-regular fa-user"></i>
                {{ row.ownerName }}
              </span>
              <span v-if="row.tags.length > 0">
                <i class="fa-solid fa-tag"></i>
                {{ row.tags.slice(0, 2).join(', ') }}
              </span>
              <span v-if="openTaskCount(row) > 0">
                <i class="fa-regular fa-square-check"></i>
                {{ openTaskCount(row) }}
              </span>
            </div>

            <div class="workspace-board-card__actions">
              <button
                type="button"
                :disabled="!canEdit(row) || isFirstStatus(column)"
                title="이전 상태로 이동"
                @click="emit('move-status', row, -1)"
              >
                <i class="fa-solid fa-arrow-left"></i>
              </button>
              <select
                :value="row.status"
                :disabled="!canEdit(row)"
                title="상태 변경"
                @change="emit('update-status', row, $event.target.value)"
              >
                <option
                  v-for="option in statusOptions"
                  :key="`board-status-${row.id}-${option.id}`"
                  :value="option.id"
                >
                  {{ option.label }}
                </option>
              </select>
              <button
                type="button"
                :disabled="!canEdit(row) || isLastStatus(column)"
                title="다음 상태로 이동"
                @click="emit('move-status', row, 1)"
              >
                <i :class="isBusy(row) ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-arrow-right'"></i>
              </button>
            </div>
          </article>
        </template>
      </section>
    </div>
  </section>
</template>
