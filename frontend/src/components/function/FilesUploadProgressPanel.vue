<script setup>
defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  collapsed: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: "",
  },
  subtitle: {
    type: String,
    default: "",
  },
  etaText: {
    type: String,
    default: "",
  },
  canCancel: {
    type: Boolean,
    default: false,
  },
  items: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["show", "toggle-collapsed", "dismiss", "cancel"]);

function getProgressCircleStyle(item) {
  return {
    "--progress": `${Number(item?.progress || 0)}%`,
  };
}
</script>

<template>
  <Teleport to="body">
    <button
      v-if="items.length && !visible"
      type="button"
      class="upload-panel-chip"
      @click="emit('show')"
    >
      <span class="upload-panel-chip__dot"></span>
      <span>{{ title }}</span>
    </button>

    <div
      v-if="items.length && visible"
      class="upload-panel"
    >
      <div class="upload-panel__header">
        <div class="upload-panel__header-copy">
          <strong class="upload-panel__title">{{ title }}</strong>
          <span class="upload-panel__subtitle">{{ subtitle }}</span>
        </div>

        <div class="upload-panel__actions">
          <button
            type="button"
            class="upload-panel__icon-button"
            :title="collapsed ? '펼치기' : '접기'"
            @click="emit('toggle-collapsed')"
          >
            <svg
              class="upload-panel__chevron"
              :class="{ 'is-collapsed': collapsed }"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          <button
            type="button"
            class="upload-panel__icon-button"
            title="닫기"
            @click="emit('dismiss')"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div
        v-if="!collapsed"
        class="upload-panel__body"
      >
        <div class="upload-panel__summary-bar">
          <span>{{ etaText }}</span>
          <button
            v-if="canCancel"
            type="button"
            class="upload-panel__cancel"
            @click="emit('cancel')"
          >
            취소
          </button>
        </div>

        <div class="upload-panel__list">
          <div
            v-for="item in items"
            :key="item.id"
            class="upload-item"
          >
            <div class="upload-item__file-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M7 3.75h6.586a1.5 1.5 0 0 1 1.06.44l2.914 2.914a1.5 1.5 0 0 1 .44 1.06V19.5A1.5 1.5 0 0 1 16.5 21h-9A1.5 1.5 0 0 1 6 19.5v-14A1.5 1.5 0 0 1 7.5 4Z"
                  fill="#dbeafe"
                />
                <path
                  d="M14 4v3a1 1 0 0 0 1 1h3"
                  stroke="#93c5fd"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>

            <div class="upload-item__copy">
              <div class="upload-item__name-row">
                <span class="upload-item__name">{{ item.name }}</span>
              </div>
              <div class="upload-item__detail">
                {{ item.statusText }}
              </div>
            </div>

            <div
              class="upload-item__indicator"
              :class="`is-${item.status}`"
              :style="getProgressCircleStyle(item)"
              :title="item.statusText"
            >
              <span v-if="item.status === 'completed'" class="upload-item__indicator-symbol">✓</span>
              <span v-else-if="item.status === 'failed'" class="upload-item__indicator-symbol">!</span>
              <span v-else-if="item.status === 'canceled'" class="upload-item__indicator-symbol">-</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.upload-panel-chip {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 10000;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--text-main);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  isolation: isolate;
  transform: translateZ(0);
  font-size: 13px;
  font-weight: 700;
}

.upload-panel-chip__dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #60a5fa;
  box-shadow: 0 0 0 6px rgba(96, 165, 250, 0.18);
}

.upload-panel {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 10000;
  width: 340px;
  max-width: calc(100vw - 32px);
  border-radius: 22px;
  overflow: hidden;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  isolation: isolate;
  transform: translateZ(0);
  will-change: transform;
}

.upload-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 14px;
  background: var(--bg-elevated);
}

.upload-panel__header-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.upload-panel__title {
  color: var(--text-main);
  font-size: 17px;
  font-weight: 800;
  line-height: 1.15;
}

.upload-panel__subtitle {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.upload-panel__actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.upload-panel__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  color: var(--text-secondary);
  transition: background-color 0.18s ease, color 0.18s ease;
}

.upload-panel__icon-button:hover {
  background: var(--bg-input);
  color: var(--accent);
}

.upload-panel__chevron {
  transition: transform 0.18s ease;
}

.upload-panel__chevron.is-collapsed {
  transform: rotate(180deg);
}

.upload-panel__body {
  border-top: 1px solid var(--border-color);
}

.upload-panel__summary-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  background: var(--bg-input);
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
}

.upload-panel__cancel {
  color: var(--accent);
  font-weight: 700;
}

.upload-panel__cancel:hover {
  text-decoration: underline;
}

.upload-panel__list {
  max-height: 280px;
  overflow-y: auto;
  background: var(--bg-elevated);
}

.upload-item {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
}

.upload-item + .upload-item {
  border-top: 1px solid var(--border-color);
}

.upload-item__file-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.upload-item__copy {
  min-width: 0;
}

.upload-item__name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.upload-item__name {
  color: var(--text-secondary);
  font-size: 15px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-item__detail {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-item__indicator {
  --progress: 0%;
  position: relative;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: 1.5px solid var(--border-strong);
  background: var(--bg-main);
}

.upload-item__indicator::before {
  content: "";
  position: absolute;
  inset: 3px;
  border-radius: 999px;
  background: var(--bg-main);
}

.upload-item__indicator.is-uploading,
.upload-item__indicator.is-merging,
.upload-item__indicator.is-canceling {
  border: none;
  background: conic-gradient(var(--accent) var(--progress), var(--accent-soft) 0);
}

.upload-item__indicator.is-merging {
  background: conic-gradient(var(--accent-hover) var(--progress), var(--accent-soft) 0);
}

.upload-item__indicator.is-completed {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.upload-item__indicator.is-failed {
  border-color: var(--danger);
  background: var(--danger-soft);
}

.upload-item__indicator.is-canceled {
  border-color: var(--border-strong);
  background: var(--bg-input);
}

.upload-item__indicator-symbol {
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  font-size: 14px;
  font-weight: 900;
  z-index: 1;
}

.upload-item__indicator.is-failed .upload-item__indicator-symbol {
  color: var(--danger);
}

.upload-item__indicator.is-canceled .upload-item__indicator-symbol {
  color: var(--text-muted);
}

@media (max-width: 640px) {
  .upload-panel,
  .upload-panel-chip {
    right: 12px;
    bottom: 12px;
  }

  .upload-panel {
    width: min(100vw - 24px, 340px);
  }
}
</style>
