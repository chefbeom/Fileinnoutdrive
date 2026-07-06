<script setup>
const props = defineProps({
  query: {
    type: String,
    default: '',
  },
  activeIndex: {
    type: Number,
    default: 0,
  },
  items: {
    type: Array,
    default: () => [],
  },
  emptyLabel: {
    type: String,
    default: '검색 결과가 없습니다.',
  },
})

const emit = defineEmits([
  'update:query',
  'update:activeIndex',
  'move-selection',
  'execute',
  'close',
  'register-input',
])

const bindInputRef = (element) => {
  emit('register-input', element)
}
</script>

<template>
  <div class="workspace-command-overlay" @mousedown.self="emit('close')">
    <section
      class="workspace-command-palette"
      role="dialog"
      aria-modal="true"
      aria-label="워크스페이스 빠른 명령"
    >
      <div class="workspace-command-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input
          :ref="bindInputRef"
          :value="query"
          type="search"
          placeholder="문서, 템플릿, 패널, 액션 검색"
          @input="emit('update:query', $event.target.value)"
          @keydown.down.prevent="emit('move-selection', 1)"
          @keydown.up.prevent="emit('move-selection', -1)"
          @keydown.enter.prevent="emit('execute')"
          @keydown.esc.prevent="emit('close')"
        />
        <kbd>Esc</kbd>
      </div>

      <div v-if="items.length > 0" class="workspace-command-list">
        <button
          v-for="(item, index) in items"
          :key="item.id"
          type="button"
          class="workspace-command-item"
          :class="{ 'workspace-command-item--active': index === activeIndex }"
          @mouseenter="emit('update:activeIndex', index)"
          @click="emit('execute', item)"
        >
          <span class="workspace-command-item__icon">
            <i :class="item.icon"></i>
          </span>
          <span class="workspace-command-item__body">
            <strong>{{ item.title }}</strong>
            <small>{{ item.detail }}</small>
          </span>
          <span class="workspace-command-item__type">{{ item.kindLabel }}</span>
        </button>
      </div>
      <div v-else class="workspace-command-empty">
        {{ emptyLabel }}
      </div>
    </section>
  </div>
</template>

<style scoped>
.workspace-command-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: rgba(15, 23, 42, 0.28);
  padding: 9vh 16px 24px;
}

.workspace-command-palette {
  display: grid;
  width: min(620px, 100%);
  max-height: min(680px, 82vh);
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 16px;
  background: var(--editor-bg);
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.28);
}

.workspace-command-search {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--editor-border);
  padding: 14px 16px;
  color: #64748b;
}

.workspace-command-search input {
  width: 100%;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--editor-text);
  font-size: 15px;
  font-weight: 750;
}

.workspace-command-search kbd {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 7px;
  background: rgba(148, 163, 184, 0.1);
  color: #64748b;
  padding: 3px 7px;
  font-size: 11px;
  font-weight: 900;
}

.workspace-command-list {
  display: grid;
  gap: 4px;
  overflow: auto;
  padding: 8px;
}

.workspace-command-item {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: var(--editor-text);
  cursor: pointer;
  padding: 9px;
  text-align: left;
}

.workspace-command-item--active,
.workspace-command-item:hover {
  border-color: rgba(37, 99, 235, 0.22);
  background: rgba(37, 99, 235, 0.08);
}

.workspace-command-item__icon {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(100, 116, 139, 0.1);
  color: #475569;
  font-size: 13px;
}

.workspace-command-item--active .workspace-command-item__icon {
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
}

.workspace-command-item__body {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.workspace-command-item__body strong,
.workspace-command-item__body small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-command-item__body strong {
  font-size: 13px;
  font-weight: 900;
}

.workspace-command-item__body small {
  color: #64748b;
  font-size: 11px;
  font-weight: 750;
}

.workspace-command-item__type {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.13);
  color: #64748b;
  padding: 4px 7px;
  font-size: 10px;
  font-weight: 900;
}

.workspace-command-empty {
  padding: 28px 18px;
  color: #64748b;
  font-size: 13px;
  font-weight: 800;
  text-align: center;
}

@media (max-width: 640px) {
  .workspace-command-overlay { padding-top: 7vh; }
  .workspace-command-item { grid-template-columns: 30px minmax(0, 1fr); }
  .workspace-command-item__type { display: none; }
}
</style>