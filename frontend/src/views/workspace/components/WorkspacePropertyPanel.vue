<script setup>
const props = defineProps({
  icon: { type: String, default: '' },
  coverColor: { type: String, default: '' },
  status: { type: String, default: '' },
  priority: { type: String, default: '' },
  ownerEmail: { type: String, default: '' },
  dueDate: { type: String, default: '' },
  tagsInput: { type: String, default: '' },
  statusOption: { type: Object, default: () => ({ label: '', tone: 'muted' }) },
  priorityOption: { type: Object, default: () => ({ label: '', tone: 'muted' }) },
  coverColorOption: { type: Object, default: () => ({ id: '' }) },
  coverColorOptions: { type: Array, default: () => [] },
  statusOptions: { type: Array, default: () => [] },
  priorityOptions: { type: Array, default: () => [] },
  ownerCandidates: { type: Array, default: () => [] },
  tags: { type: Array, default: () => [] },
  canModifyPage: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:icon',
  'update:coverColor',
  'update:status',
  'update:priority',
  'update:ownerEmail',
  'update:dueDate',
  'update:tagsInput',
  'normalize-icon',
])

const isCoverSelected = (optionId) => props.coverColorOption?.id === optionId
</script>

<template>
  <section class="workspace-property-panel" aria-label="페이지 속성">
    <div class="workspace-property-panel__header">
      <div>
        <span>Properties</span>
        <strong>페이지 속성</strong>
      </div>
      <div class="workspace-property-badges">
        <span :class="`workspace-property-badge workspace-property-badge--${statusOption.tone}`">
          {{ statusOption.label }}
        </span>
        <span :class="`workspace-property-badge workspace-property-badge--${priorityOption.tone}`">
          {{ priorityOption.label }}
        </span>
      </div>
    </div>

    <div class="workspace-property-visual-grid">
      <label class="workspace-property-field">
        <span>아이콘</span>
        <input
          :value="icon"
          type="text"
          maxlength="4"
          :disabled="!canModifyPage"
          @input="emit('update:icon', $event.target.value)"
          @blur="emit('normalize-icon')"
        />
      </label>

      <div class="workspace-property-field workspace-property-field--cover">
        <span>커버</span>
        <div class="workspace-cover-swatches" role="radiogroup" aria-label="페이지 커버 색상">
          <button
            v-for="option in coverColorOptions"
            :key="option.id"
            type="button"
            class="workspace-cover-swatch"
            :class="[
              `workspace-cover-swatch--${option.id}`,
              { 'workspace-cover-swatch--active': isCoverSelected(option.id) },
            ]"
            :title="option.label"
            role="radio"
            :aria-checked="isCoverSelected(option.id)"
            :aria-label="option.label"
            :disabled="!canModifyPage"
            @click="emit('update:coverColor', option.id)"
          ></button>
        </div>
      </div>
    </div>

    <div class="workspace-property-grid">
      <label class="workspace-property-field">
        <span>상태</span>
        <select :value="status" :disabled="!canModifyPage" @change="emit('update:status', $event.target.value)">
          <option v-for="option in statusOptions" :key="option.id" :value="option.id">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="workspace-property-field">
        <span>우선순위</span>
        <select :value="priority" :disabled="!canModifyPage" @change="emit('update:priority', $event.target.value)">
          <option v-for="option in priorityOptions" :key="option.id" :value="option.id">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="workspace-property-field">
        <span>담당자</span>
        <select :value="ownerEmail" :disabled="!canModifyPage" @change="emit('update:ownerEmail', $event.target.value)">
          <option value="">담당자 없음</option>
          <option v-for="candidate in ownerCandidates" :key="candidate.email" :value="candidate.email">
            {{ candidate.name }}
          </option>
        </select>
      </label>

      <label class="workspace-property-field">
        <span>기한</span>
        <input
          :value="dueDate"
          type="date"
          :disabled="!canModifyPage"
          @input="emit('update:dueDate', $event.target.value)"
        />
      </label>

      <label class="workspace-property-field workspace-property-field--tags">
        <span>태그</span>
        <input
          :value="tagsInput"
          type="text"
          maxlength="180"
          placeholder="기획, 릴리즈, 회의"
          :disabled="!canModifyPage"
          @input="emit('update:tagsInput', $event.target.value)"
        />
      </label>
    </div>

    <div v-if="tags.length > 0" class="workspace-property-tags" aria-label="페이지 태그">
      <span v-for="tag in tags" :key="tag">#{{ tag }}</span>
    </div>
  </section>
</template>

<style scoped src="../styles/04-properties.css"></style>