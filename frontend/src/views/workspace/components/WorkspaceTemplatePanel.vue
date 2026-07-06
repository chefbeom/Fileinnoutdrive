<script setup>
defineProps({
  templates: {
    type: Array,
    default: () => [],
  },
  applyingId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['apply'])
</script>

<template>
  <section class="workspace-template-panel">
    <div class="workspace-template-panel__header">
      <div>
        <h3>템플릿으로 시작</h3>
        <p>새 페이지에 어울리는 구조를 먼저 만들고 바로 편집하세요.</p>
      </div>
    </div>
    <div class="workspace-template-grid">
      <button
        v-for="template in templates"
        :key="template.id"
        type="button"
        class="workspace-template-card"
        :disabled="applyingId === template.id"
        @click="emit('apply', template)"
      >
        <span class="workspace-template-card__icon">
          <i :class="template.icon"></i>
        </span>
        <strong>{{ template.title }}</strong>
        <span>{{ template.description }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.workspace-template-panel {
  display: grid;
  gap: 14px;
  margin-bottom: 18px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 16px;
  background: color-mix(in srgb, var(--editor-bg) 96%, #eff6ff 4%);
  padding: 16px;
}

.workspace-template-panel__header h3 {
  margin: 0;
  color: var(--editor-text);
  font-size: 16px;
  font-weight: 900;
}

.workspace-template-panel__header p {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.45;
}

.workspace-template-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.workspace-template-card {
  display: grid;
  min-height: 132px;
  gap: 8px;
  align-content: start;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.66);
  padding: 13px;
  color: #0f172a;
  cursor: pointer;
  text-align: left;
}

.workspace-template-card:hover:not(:disabled) {
  border-color: rgba(37, 99, 235, 0.38);
  background: rgba(37, 99, 235, 0.08);
}

.workspace-template-card:disabled {
  opacity: 0.58;
  cursor: wait;
}

.workspace-template-card__icon {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.1);
  color: #2563eb;
}

.workspace-template-card strong {
  font-size: 13px;
  font-weight: 900;
}

.workspace-template-card span:last-child {
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}
</style>
