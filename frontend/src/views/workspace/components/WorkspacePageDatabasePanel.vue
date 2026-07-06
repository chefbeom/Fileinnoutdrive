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
  filter: {
    type: String,
    default: 'all',
  },
  filterOptions: {
    type: Array,
    default: () => [],
  },
  query: {
    type: String,
    default: '',
  },
  sort: {
    type: String,
    default: 'updated-desc',
  },
  sortOptions: {
    type: Array,
    default: () => [],
  },
  ownerFilter: {
    type: String,
    default: '',
  },
  ownerFilterOptions: {
    type: Array,
    default: () => [],
  },
  tagFilter: {
    type: String,
    default: '',
  },
  tagOptions: {
    type: Array,
    default: () => [],
  },
  views: {
    type: Array,
    default: () => [],
  },
  activeView: {
    type: Object,
    default: null,
  },
  viewName: {
    type: String,
    default: '',
  },
  canCreateView: {
    type: Boolean,
    default: false,
  },
  visibleEditableRows: {
    type: Array,
    default: () => [],
  },
  selectedRows: {
    type: Array,
    default: () => [],
  },
  allVisibleRowsSelected: {
    type: Boolean,
    default: false,
  },
  canApplyBulkUpdate: {
    type: Boolean,
    default: false,
  },
  bulkStatus: {
    type: String,
    default: '',
  },
  bulkPriority: {
    type: String,
    default: '',
  },
  bulkOwnerEmail: {
    type: String,
    default: '',
  },
  bulkDueDate: {
    type: String,
    default: '',
  },
  bulkClearDueDate: {
    type: Boolean,
    default: false,
  },
  bulkUpdating: {
    type: Boolean,
    default: false,
  },
  ownerCandidates: {
    type: Array,
    default: () => [],
  },
  statusOptions: {
    type: Array,
    default: () => [],
  },
  priorityOptions: {
    type: Array,
    default: () => [],
  },
  rows: {
    type: Array,
    default: () => [],
  },
  ownerOptions: {
    type: Function,
    default: () => [],
  },
  isRowSelected: {
    type: Function,
    default: () => false,
  },
  isRowUpdating: {
    type: Function,
    default: () => false,
  },
  viewSummary: {
    type: Function,
    default: () => '',
  },
})

const emit = defineEmits([
  'refresh',
  'update:filter',
  'update:query',
  'update:sort',
  'update:ownerFilter',
  'update:tagFilter',
  'update:viewName',
  'update:bulkStatus',
  'update:bulkPriority',
  'update:bulkOwnerEmail',
  'update:bulkDueDate',
  'update:bulkClearDueDate',
  'apply-view',
  'remove-view',
  'create-view',
  'toggle-visible-selection',
  'toggle-row-selection',
  'apply-bulk',
  'clear-selection',
  'open-row',
  'update-row-status',
  'update-row-priority',
  'update-row-owner',
  'update-row-due-date',
  'update-row-tags',
])

const rowTags = (row) => (Array.isArray(row?.tags) ? row.tags : [])
const isBusy = (row) => props.isRowUpdating(row)
const isEditable = (row) => Boolean(row?.canEditProperties && !isBusy(row))

const setBulkClearDueDate = (event) => {
  const checked = Boolean(event?.target?.checked)
  emit('update:bulkClearDueDate', checked)
  if (checked) {
    emit('update:bulkDueDate', '')
  }
}
</script>

<template>
  <section class="workspace-page-index-panel">
    <div class="workspace-floating-panel__header">
      <div>
        <h3>페이지 데이터베이스</h3>
        <p>전체 페이지의 상태, 우선순위, 담당자, 기한을 한눈에 봅니다.</p>
      </div>
      <button
        type="button"
        class="workspace-history-refresh-btn"
        :disabled="loading"
        title="페이지 데이터베이스 새로고침"
        @click="emit('refresh')"
      >
        <i :class="loading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-rotate-right'"></i>
      </button>
    </div>

    <div class="workspace-page-index-filters" role="tablist" aria-label="페이지 데이터베이스 필터">
      <button
        v-for="option in filterOptions"
        :key="option.id"
        type="button"
        :class="{ 'workspace-page-index-filter--active': filter === option.id }"
        role="tab"
        :aria-selected="filter === option.id"
        @click="emit('update:filter', option.id)"
      >
        <span>{{ option.label }}</span>
        <strong>{{ option.count }}</strong>
      </button>
    </div>

    <div class="workspace-page-index-tools" aria-label="페이지 데이터베이스 검색과 정렬">
      <label class="workspace-page-index-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input
          :value="query"
          type="search"
          maxlength="80"
          placeholder="제목, 담당자, 태그 검색"
          @input="emit('update:query', $event.target.value)"
        />
        <button
          v-if="query"
          type="button"
          title="검색어 지우기"
          @click="emit('update:query', '')"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </label>
      <label class="workspace-page-index-sort">
        <span>정렬</span>
        <select :value="sort" @change="emit('update:sort', $event.target.value)">
          <option
            v-for="option in sortOptions"
            :key="option.id"
            :value="option.id"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="workspace-page-index-owner-filter">
        <span>담당자</span>
        <select :value="ownerFilter" @change="emit('update:ownerFilter', $event.target.value)">
          <option value="">전체 담당자</option>
          <option
            v-for="owner in ownerFilterOptions"
            :key="`page-index-owner-filter-${owner.id}`"
            :value="owner.id"
          >
            {{ owner.label }} ({{ owner.count }})
          </option>
        </select>
      </label>
    </div>

    <div v-if="tagOptions.length > 0" class="workspace-page-index-tag-filter" aria-label="태그 필터">
      <button
        type="button"
        :class="{ 'workspace-page-index-tag-filter--active': !tagFilter }"
        @click="emit('update:tagFilter', '')"
      >
        전체 태그
      </button>
      <button
        v-for="tag in tagOptions"
        :key="`page-index-tag-${tag.id}`"
        type="button"
        :class="{ 'workspace-page-index-tag-filter--active': tagFilter === tag.id }"
        @click="emit('update:tagFilter', tag.id)"
      >
        #{{ tag.label }}
        <strong>{{ tag.count }}</strong>
      </button>
    </div>

    <div class="workspace-page-index-views" aria-label="저장된 페이지 데이터베이스 보기">
      <div v-if="views.length > 0" class="workspace-page-index-view-list">
        <span>저장된 보기</span>
        <div>
          <span
            v-for="view in views"
            :key="view.id"
            class="workspace-page-index-view-pill"
            :class="{ 'workspace-page-index-view-pill--active': activeView?.id === view.id }"
          >
            <button type="button" @click="emit('apply-view', view)">
              <strong>{{ view.name }}</strong>
              <small>{{ viewSummary(view) }}</small>
            </button>
            <button
              type="button"
              title="보기 삭제"
              @click="emit('remove-view', view)"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </span>
        </div>
      </div>
      <form class="workspace-page-index-view-form" @submit.prevent="emit('create-view')">
        <label>
          <i class="fa-regular fa-bookmark"></i>
          <input
            :value="viewName"
            type="text"
            maxlength="32"
            placeholder="현재 조건을 보기로 저장"
            @input="emit('update:viewName', $event.target.value)"
          />
        </label>
        <button type="submit" :disabled="!canCreateView">
          저장
        </button>
      </form>
    </div>

    <div class="workspace-page-index-bulk" aria-label="페이지 데이터베이스 일괄 편집">
      <label class="workspace-page-index-select-visible">
        <input
          type="checkbox"
          :checked="allVisibleRowsSelected"
          :disabled="visibleEditableRows.length === 0"
          @change="emit('toggle-visible-selection', $event)"
        />
        <span>현재 보기 선택</span>
        <strong>{{ visibleEditableRows.length }}</strong>
      </label>
      <div v-if="selectedRows.length > 0" class="workspace-page-index-bulk-actions">
        <span>
          <strong>{{ selectedRows.length }}</strong>
          선택됨
        </span>
        <select :value="bulkStatus" :disabled="bulkUpdating" @change="emit('update:bulkStatus', $event.target.value)">
          <option value="">상태 유지</option>
          <option
            v-for="option in statusOptions"
            :key="`bulk-status-${option.id}`"
            :value="option.id"
          >
            {{ option.label }}
          </option>
        </select>
        <select :value="bulkPriority" :disabled="bulkUpdating" @change="emit('update:bulkPriority', $event.target.value)">
          <option value="">우선순위 유지</option>
          <option
            v-for="option in priorityOptions"
            :key="`bulk-priority-${option.id}`"
            :value="option.id"
          >
            {{ option.label }}
          </option>
        </select>
        <select :value="bulkOwnerEmail" :disabled="bulkUpdating" @change="emit('update:bulkOwnerEmail', $event.target.value)">
          <option value="">담당자 유지</option>
          <option value="__none__">담당자 없음</option>
          <option
            v-for="candidate in ownerCandidates"
            :key="`bulk-owner-${candidate.email}`"
            :value="candidate.email"
          >
            {{ candidate.name }}
          </option>
        </select>
        <input
          :value="bulkDueDate"
          type="date"
          :disabled="bulkUpdating || bulkClearDueDate"
          title="일괄 기한"
          @input="emit('update:bulkDueDate', $event.target.value)"
          @change="emit('update:bulkDueDate', $event.target.value)"
        />
        <label class="workspace-page-index-bulk-check">
          <input
            type="checkbox"
            :checked="bulkClearDueDate"
            :disabled="bulkUpdating"
            @change="setBulkClearDueDate"
          />
          <span>기한 지우기</span>
        </label>
        <button
          type="button"
          :disabled="!canApplyBulkUpdate"
          @click="emit('apply-bulk')"
        >
          {{ bulkUpdating ? '적용 중' : '일괄 적용' }}
        </button>
        <button type="button" @click="emit('clear-selection')">
          해제
        </button>
      </div>
    </div>

    <p v-if="error" class="workspace-assets__error">{{ error }}</p>
    <div v-if="loading" class="workspace-floating-panel__empty">
      페이지 속성을 불러오는 중입니다.
    </div>
    <div v-else-if="rows.length === 0" class="workspace-floating-panel__empty">
      조건에 맞는 페이지가 없습니다.
    </div>
    <div v-else class="workspace-page-index-list">
      <article
        v-for="row in rows"
        :key="`page-index-${row.id}`"
        class="workspace-page-index-row"
        :class="{
          'workspace-page-index-row--overdue': row.isOverdue,
          'workspace-page-index-row--locked': row.locked,
        }"
      >
        <label class="workspace-page-index-row__select" title="행 선택">
          <input
            type="checkbox"
            :checked="isRowSelected(row)"
            :disabled="!row.canEditProperties"
            @change="emit('toggle-row-selection', row, $event)"
          />
          <span>
            <i class="fa-solid fa-check"></i>
          </span>
        </label>
        <button type="button" class="workspace-page-index-row__main" @click="emit('open-row', row)">
          <span class="workspace-page-index-row__icon">{{ row.icon }}</span>
          <span class="workspace-page-index-row__body">
            <strong>{{ row.title }}</strong>
            <small>
              {{ row.scopeLabel }} · {{ row.roleLabel }} · {{ row.updatedLabel }}
              <template v-if="row.locked"> · 잠김</template>
            </small>
            <em v-if="row.preview">{{ row.preview }}</em>
          </span>
        </button>
        <div class="workspace-page-index-row__props">
          <label class="workspace-page-index-edit">
            <span>상태</span>
            <select
              :value="row.status"
              :disabled="!isEditable(row)"
              @change="emit('update-row-status', row, $event.target.value)"
            >
              <option
                v-for="option in statusOptions"
                :key="`row-status-${row.id}-${option.id}`"
                :value="option.id"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
          <label class="workspace-page-index-edit">
            <span>우선순위</span>
            <select
              :value="row.priority"
              :disabled="!isEditable(row)"
              @change="emit('update-row-priority', row, $event.target.value)"
            >
              <option
                v-for="option in priorityOptions"
                :key="`row-priority-${row.id}-${option.id}`"
                :value="option.id"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
          <label class="workspace-page-index-edit workspace-page-index-edit--owner">
            <span>담당자</span>
            <select
              :value="row.ownerEmail"
              :disabled="!isEditable(row)"
              @change="emit('update-row-owner', row, $event)"
            >
              <option value="">담당자 없음</option>
              <option
                v-for="candidate in ownerOptions(row)"
                :key="`row-owner-${row.id}-${candidate.email}`"
                :value="candidate.email"
              >
                {{ candidate.name }}
              </option>
            </select>
          </label>
          <label
            class="workspace-page-index-edit workspace-page-index-edit--date"
            :class="{ 'workspace-page-index-chip--danger': row.isOverdue }"
          >
            <span>기한</span>
            <input
              type="date"
              :value="row.dueDate"
              :disabled="!isEditable(row)"
              @change="emit('update-row-due-date', row, $event.target.value)"
            />
          </label>
          <label class="workspace-page-index-edit workspace-page-index-edit--tags">
            <span>태그</span>
            <input
              type="text"
              :value="rowTags(row).join(', ')"
              maxlength="140"
              placeholder="태그, 쉼표로 구분"
              :disabled="!isEditable(row)"
              @change="emit('update-row-tags', row, $event)"
            />
          </label>
          <span v-if="isBusy(row)" class="workspace-page-index-chip">
            <i class="fa-solid fa-spinner fa-spin"></i>
            저장 중
          </span>
        </div>
        <div v-if="rowTags(row).length > 0" class="workspace-page-index-tags">
          <button
            v-for="tag in rowTags(row)"
            :key="`${row.id}-${tag}`"
            type="button"
            :class="{ 'workspace-page-index-tag--active': tagFilter === String(tag).toLowerCase() }"
            @click="emit('update:tagFilter', String(tag).toLowerCase())"
          >
            #{{ tag }}
          </button>
        </div>
      </article>
    </div>
  </section>
</template>
