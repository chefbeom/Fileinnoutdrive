<script setup>
defineProps({
  coverColorId: { type: String, default: 'blue' },
  icon: { type: String, default: '📄' },
  title: { type: String, default: '' },
  breadcrumbs: { type: Array, default: () => [] },
  canModifyPage: { type: Boolean, default: false },
  saveStatusClass: { type: String, default: '' },
  saveStatusLabel: { type: String, default: '' },
  realtimeStatusClass: { type: String, default: '' },
  realtimeStatusLabel: { type: String, default: '' },
  shareStatusClass: { type: String, default: '' },
  shareStatusLabel: { type: String, default: '' },
  accessRoleLabel: { type: String, default: '' },
  isPageLocked: { type: Boolean, default: false },
  lockStatusLabel: { type: String, default: '' },
  workspaceId: { type: [Number, String], default: null },
  linkCopied: { type: Boolean, default: false },
})

const emit = defineEmits(['update:icon', 'normalize-icon', 'title-input', 'open-breadcrumb'])
</script>

<template>
  <div
    class="workspace-page-cover"
    :class="`workspace-page-cover--${coverColorId}`"
    aria-hidden="true"
  ></div>
  <div class="editor-header">
    <div class="workspace-title-stack">
      <div v-if="breadcrumbs.length > 0" class="workspace-page-breadcrumb" aria-label="페이지 계층">
        <template
          v-for="breadcrumb in breadcrumbs"
          :key="`breadcrumb-${breadcrumb.id}`"
        >
          <button type="button" @click="emit('open-breadcrumb', breadcrumb)">
            <i class="fa-regular fa-file-lines"></i>
            <span>{{ breadcrumb.title }}</span>
          </button>
          <i class="fa-solid fa-angle-right" aria-hidden="true"></i>
        </template>
        <span>{{ title || '제목 없음' }}</span>
      </div>
      <div class="workspace-title-row">
        <input
          :value="icon"
          type="text"
          maxlength="4"
          class="workspace-page-icon-input"
          aria-label="페이지 아이콘"
          :disabled="!canModifyPage"
          @input="emit('update:icon', $event.target.value)"
          @blur="emit('normalize-icon')"
        />
        <input
          :value="title"
          placeholder="제목 없음"
          class="title-input"
          :disabled="!canModifyPage"
          @input="emit('title-input', $event)"
        />
      </div>
      <div class="workspace-document-meta">
        <span class="status-pill" :class="saveStatusClass">{{ saveStatusLabel }}</span>
        <span class="status-pill" :class="realtimeStatusClass">{{ realtimeStatusLabel }}</span>
        <span class="status-pill" :class="shareStatusClass">{{ shareStatusLabel }}</span>
        <span class="status-pill status-pill--role">{{ accessRoleLabel }}</span>
        <span
          class="status-pill"
          :class="isPageLocked ? 'status-pill--locked' : 'status-pill--editable'"
        >
          {{ lockStatusLabel }}
        </span>
        <span v-if="workspaceId" class="workspace-document-id">#{{ workspaceId }}</span>
        <span v-if="linkCopied" class="status-pill status-pill--copied" aria-live="polite">
          링크 복사됨
        </span>
      </div>
    </div>

    <slot />
  </div>
</template>

<style scoped src="../styles/03-page-header.css"></style>