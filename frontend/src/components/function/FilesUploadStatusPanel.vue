<script setup>
import { formatBytesPerSecond } from "./uploadState.js";

defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  collapsed: {
    type: Boolean,
    default: false,
  },
  canCancel: {
    type: Boolean,
    default: false,
  },
  canClearDismissed: {
    type: Boolean,
    default: false,
  },
  panelTitle: {
    type: String,
    default: "",
  },
  panelSubtitle: {
    type: String,
    default: "",
  },
  items: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["cancel", "clear-dismissed", "toggle-collapsed", "dismiss"]);

function formatUploadSpeed(item) {
  if (!item || item.status !== "uploading") {
    return "";
  }

  const bytesPerSecond = Number(item.speedBytesPerSecond || 0);
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return "";
  }
  return formatBytesPerSecond(bytesPerSecond);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="upload-float" :class="{ 'is-collapsed': collapsed }">
      <div class="upload-panel">
        <div class="upload-panel__header">
          <div class="upload-panel__heading">
            <strong>{{ panelTitle }}</strong>
            <p v-if="!collapsed">{{ panelSubtitle }}</p>
          </div>
          <div class="upload-panel__actions">
            <button
              v-if="canCancel && !collapsed"
              type="button"
              class="upload-panel__cancel"
              @click="emit('cancel')"
            >
              업로드 취소
            </button>
            <button
              v-if="canClearDismissed && !collapsed"
              type="button"
              class="upload-panel__clear"
              @click="emit('clear-dismissed')"
            >
              정리
            </button>
            <button
              type="button"
              class="upload-panel__icon"
              :aria-label="collapsed ? '업로드 상태 펼치기' : '업로드 상태 접기'"
              @click="emit('toggle-collapsed')"
            >
              <i class="fa-solid" :class="collapsed ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
            </button>
            <button
              type="button"
              class="upload-panel__icon"
              aria-label="업로드 상태창 닫기"
              @click="emit('dismiss')"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <div v-if="!collapsed" class="upload-panel__list">
          <div v-for="item in items" :key="item.id" class="upload-item">
            <div class="upload-item__main">
              <div class="upload-item__name">{{ item.name }}</div>
              <div class="upload-item__status">{{ item.statusText }}</div>
              <div v-if="formatUploadSpeed(item)" class="upload-item__speed">{{ formatUploadSpeed(item) }}</div>
              <div class="upload-item__bar">
                <span class="upload-item__fill" :style="{ width: `${item.progress}%` }"></span>
              </div>
            </div>
            <div class="upload-item__percent" :class="`is-${item.status}`">{{ item.progress }}%</div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
