<script setup>
import { computed } from 'vue'

const props = defineProps({
  confirm: {
    type: Object,
    required: true,
  },
})

defineEmits(['close', 'confirm'])

const confirmIconClass = computed(() =>
  props.confirm?.tone === 'danger'
    ? 'fa-solid fa-triangle-exclamation'
    : 'fa-regular fa-circle-question',
)
</script>

<template>
  <div class="workspace-confirm-overlay" @mousedown.self="$emit('close')">
    <section
      class="workspace-confirm-card"
      :class="`workspace-confirm-card--${confirm.tone}`"
      role="dialog"
      aria-modal="true"
      aria-label="작업 확인"
    >
      <div class="workspace-confirm-card__icon" aria-hidden="true">
        <i :class="confirmIconClass"></i>
      </div>
      <div class="workspace-confirm-card__body">
        <h3>{{ confirm.title }}</h3>
        <p>{{ confirm.message }}</p>
      </div>
      <div class="workspace-confirm-card__actions">
        <button
          type="button"
          class="workspace-confirm-card__cancel"
          :disabled="confirm.loading"
          @click="$emit('close')"
        >
          {{ confirm.cancelLabel }}
        </button>
        <button
          type="button"
          class="workspace-confirm-card__confirm"
          :disabled="confirm.loading"
          @click="$emit('confirm')"
        >
          <i v-if="confirm.loading" class="fa-solid fa-spinner fa-spin"></i>
          <span>{{ confirm.loading ? '처리 중...' : confirm.confirmLabel }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.workspace-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1190;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(2px);
}

.workspace-confirm-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  width: min(520px, 100%);
  padding: 18px;
  border: 1px solid var(--editor-border);
  border-radius: 16px;
  background: var(--editor-bg);
  color: var(--editor-text);
  box-shadow: 0 22px 58px rgba(15, 23, 42, 0.22);
}

.workspace-confirm-card__icon {
  display: inline-flex;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: #fffbeb;
  color: #d97706;
}

.workspace-confirm-card--danger .workspace-confirm-card__icon {
  background: #fef2f2;
  color: #dc2626;
}

.workspace-confirm-card__body {
  min-width: 0;
}

.workspace-confirm-card h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 850;
}

.workspace-confirm-card p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.55;
}

.workspace-confirm-card__actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.workspace-confirm-card__actions button {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 10px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 850;
  cursor: pointer;
}

.workspace-confirm-card__actions button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.workspace-confirm-card__cancel {
  border: 1px solid var(--editor-border);
  background: var(--editor-input-bg);
  color: #64748b;
}

.workspace-confirm-card__confirm {
  border: 1px solid #2563eb;
  background: #2563eb;
  color: white;
}

.workspace-confirm-card--danger .workspace-confirm-card__confirm {
  border-color: #dc2626;
  background: #dc2626;
}
</style>