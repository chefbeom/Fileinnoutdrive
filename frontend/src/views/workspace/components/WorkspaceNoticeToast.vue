<script setup>
import { computed } from 'vue'

const props = defineProps({
  notice: {
    type: Object,
    required: true,
  },
})

defineEmits(['run-action', 'close'])

const noticeIconClass = computed(() => {
  if (props.notice?.type === 'success') return 'fa-regular fa-circle-check'
  if (props.notice?.type === 'error') return 'fa-solid fa-triangle-exclamation'
  return 'fa-regular fa-bell'
})
</script>

<template>
  <div
    class="workspace-notice"
    :class="`workspace-notice--${notice.type}`"
    role="status"
    aria-live="polite"
  >
    <span class="workspace-notice__icon" aria-hidden="true">
      <i :class="noticeIconClass"></i>
    </span>
    <p>{{ notice.message }}</p>
    <button
      v-if="notice.actionLabel"
      type="button"
      class="workspace-notice__action"
      @click="$emit('run-action')"
    >
      {{ notice.actionLabel }}
    </button>
    <button type="button" class="workspace-notice__close" aria-label="알림 닫기" @click="$emit('close')">
      <i class="fa-solid fa-xmark"></i>
    </button>
  </div>
</template>

<style scoped>
.workspace-notice {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1200;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  width: min(420px, calc(100vw - 32px));
  padding: 12px 14px;
  border: 1px solid var(--editor-border);
  border-radius: 14px;
  background: var(--editor-bg);
  color: var(--editor-text);
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.18);
}

.workspace-notice__icon {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #eff6ff;
  color: #2563eb;
}

.workspace-notice--success .workspace-notice__icon {
  background: #ecfdf5;
  color: #059669;
}

.workspace-notice--error .workspace-notice__icon {
  background: #fef2f2;
  color: #dc2626;
}

.workspace-notice--warn .workspace-notice__icon {
  background: #fffbeb;
  color: #d97706;
}

.workspace-notice p {
  min-width: 0;
  margin: 0;
  font-size: 13px;
  font-weight: 750;
  line-height: 1.45;
}

.workspace-notice button {
  display: inline-flex;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}

.workspace-notice__action {
  width: auto;
  min-width: 0;
  padding: 0 10px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 12px;
  font-weight: 850;
  white-space: nowrap;
}

.workspace-notice__close {
  width: 28px;
}

.workspace-notice--success .workspace-notice__action {
  background: #ecfdf5;
  color: #047857;
}

.workspace-notice--error .workspace-notice__action {
  background: #fef2f2;
  color: #dc2626;
}

.workspace-notice--warn .workspace-notice__action {
  background: #fffbeb;
  color: #b45309;
}

.workspace-notice button:hover,
.workspace-notice button:focus-visible {
  background: #f1f5f9;
  color: #111827;
  outline: none;
}
</style>