<script setup>
import { computed } from 'vue'
import {
  WORKSPACE_COVER_COLOR_OPTIONS,
  WORKSPACE_PROPERTY_PRIORITY_OPTIONS,
  WORKSPACE_PROPERTY_STATUS_OPTIONS,
} from '@/constants/workspaceOptions.js'
import WorkspaceEditorLockOverlay from './WorkspaceEditorLockOverlay.vue'
import WorkspaceEditorToolbar from './WorkspaceEditorToolbar.vue'
import WorkspaceInlineAssetsSection from './WorkspaceInlineAssetsSection.vue'
import WorkspaceInlineBlockBar from './WorkspaceInlineBlockBar.vue'
import WorkspacePageHeader from './WorkspacePageHeader.vue'
import WorkspacePropertyPanel from './WorkspacePropertyPanel.vue'
import WorkspaceRemoteCursorsOverlay from './WorkspaceRemoteCursorsOverlay.vue'
import WorkspaceTemplatePanel from './WorkspaceTemplatePanel.vue'

const props = defineProps({
  icon: { type: String, default: '' },
  coverColor: { type: String, default: '' },
  status: { type: String, default: '' },
  priority: { type: String, default: '' },
  ownerEmail: { type: String, default: '' },
  dueDate: { type: String, default: '' },
  tagsInput: { type: String, default: '' },
  title: { type: String, default: '' },
  breadcrumbs: { type: Array, default: () => [] },
  coverColorOption: { type: Object, required: true },
  statusOption: { type: Object, required: true },
  priorityOption: { type: Object, required: true },
  ownerCandidates: { type: Array, default: () => [] },
  tags: { type: Array, default: () => [] },
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
  workspaceId: { type: [String, Number], default: null },
  linkCopied: { type: Boolean, default: false },
  presenceOpen: { type: Boolean, default: false },
  openRoleDropdownId: { type: [String, Number], default: null },
  panelCollapsed: { type: Boolean, default: false },
  activeUserPreview: { type: Array, default: () => [] },
  extraActiveUserCount: { type: Number, default: 0 },
  activeUsers: { type: Array, default: () => [] },
  presenceSummaryLabel: { type: String, default: '' },
  canManageShare: { type: Boolean, default: false },
  canEditWorkspace: { type: Boolean, default: false },
  isValid: { type: Boolean, default: false },
  isSaving: { type: Boolean, default: false },
  isEditorLoading: { type: Boolean, default: false },
  canFavoriteDocument: { type: Boolean, default: false },
  isFavorite: { type: Boolean, default: false },
  favoriteTitle: { type: String, default: '' },
  lockButtonTitle: { type: String, default: '' },
  canCopyLink: { type: Boolean, default: false },
  isLinkCopied: { type: Boolean, default: false },
  canExportMarkdown: { type: Boolean, default: false },
  markdownExporting: { type: Boolean, default: false },
  shareButtonTitle: { type: String, default: '' },
  assets: { type: Array, default: () => [] },
  images: { type: Array, default: () => [] },
  files: { type: Array, default: () => [] },
  assetLoading: { type: Boolean, default: false },
  assetUploading: { type: Boolean, default: false },
  assetError: { type: String, default: '' },
  canManageAssets: { type: Boolean, default: false },
  isDeletingAsset: { type: Function, required: true },
  canShowTemplates: { type: Boolean, default: false },
  templates: { type: Array, default: () => [] },
  templateApplying: { type: String, default: '' },
  inlineQuickBlockText: { type: String, default: '' },
  inlineQuickBlockOptions: { type: Array, default: () => [] },
  canInsertQuickBlock: { type: Boolean, default: false },
  quickBlockAdding: { type: String, default: '' },
  remoteCursors: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'update:icon',
  'update:coverColor',
  'update:status',
  'update:priority',
  'update:ownerEmail',
  'update:dueDate',
  'update:tagsInput',
  'update:presenceOpen',
  'update:openRoleDropdownId',
  'update:panelCollapsed',
  'update:inlineQuickBlockText',
  'normalize-icon',
  'title-input',
  'open-breadcrumb',
  'change-role',
  'save',
  'toggle-favorite',
  'toggle-lock',
  'copy-link',
  'export-markdown',
  'open-share',
  'asset-selection',
  'trigger-image-select',
  'trigger-file-select',
  'delete-asset',
  'download-asset',
  'apply-template',
  'insert-inline-block',
  'register-image-input',
  'register-file-input',
  'register-editor-holder',
])

const iconModel = computed({ get: () => props.icon, set: (value) => emit('update:icon', value) })
const coverColorModel = computed({ get: () => props.coverColor, set: (value) => emit('update:coverColor', value) })
const statusModel = computed({ get: () => props.status, set: (value) => emit('update:status', value) })
const priorityModel = computed({ get: () => props.priority, set: (value) => emit('update:priority', value) })
const ownerEmailModel = computed({ get: () => props.ownerEmail, set: (value) => emit('update:ownerEmail', value) })
const dueDateModel = computed({ get: () => props.dueDate, set: (value) => emit('update:dueDate', value) })
const tagsInputModel = computed({ get: () => props.tagsInput, set: (value) => emit('update:tagsInput', value) })
const presenceOpenModel = computed({ get: () => props.presenceOpen, set: (value) => emit('update:presenceOpen', value) })
const openRoleDropdownIdModel = computed({ get: () => props.openRoleDropdownId, set: (value) => emit('update:openRoleDropdownId', value) })
const panelCollapsedModel = computed({ get: () => props.panelCollapsed, set: (value) => emit('update:panelCollapsed', value) })
const inlineQuickBlockTextModel = computed({ get: () => props.inlineQuickBlockText, set: (value) => emit('update:inlineQuickBlockText', value) })

const registerImageInput = (element) => emit('register-image-input', element)
const registerFileInput = (element) => emit('register-file-input', element)
const registerEditorHolder = (element) => emit('register-editor-holder', element)
</script>

<template>
  <div class="editor-shell">
    <WorkspacePageHeader
      v-model:icon="iconModel"
      :cover-color-id="coverColorOption.id"
      :title="title"
      :breadcrumbs="breadcrumbs"
      :can-modify-page="canModifyPage"
      :save-status-class="saveStatusClass"
      :save-status-label="saveStatusLabel"
      :realtime-status-class="realtimeStatusClass"
      :realtime-status-label="realtimeStatusLabel"
      :share-status-class="shareStatusClass"
      :share-status-label="shareStatusLabel"
      :access-role-label="accessRoleLabel"
      :is-page-locked="isPageLocked"
      :lock-status-label="lockStatusLabel"
      :workspace-id="workspaceId"
      :link-copied="linkCopied"
      @normalize-icon="emit('normalize-icon')"
      @title-input="emit('title-input', $event)"
      @open-breadcrumb="emit('open-breadcrumb', $event)"
    >
      <WorkspaceEditorToolbar
        v-model:presence-open="presenceOpenModel"
        v-model:open-role-dropdown-id="openRoleDropdownIdModel"
        v-model:panel-collapsed="panelCollapsedModel"
        :active-user-preview="activeUserPreview"
        :extra-active-user-count="extraActiveUserCount"
        :active-users="activeUsers"
        :presence-summary-label="presenceSummaryLabel"
        :can-manage-share="canManageShare"
        :can-edit-workspace="canEditWorkspace"
        :is-valid="isValid"
        :is-saving="isSaving"
        :is-editor-loading="isEditorLoading"
        :can-favorite-document="canFavoriteDocument"
        :is-favorite="isFavorite"
        :favorite-title="favoriteTitle"
        :is-page-locked="isPageLocked"
        :lock-button-title="lockButtonTitle"
        :can-copy-link="canCopyLink"
        :is-link-copied="isLinkCopied"
        :can-export-markdown="canExportMarkdown"
        :markdown-exporting="markdownExporting"
        :share-button-title="shareButtonTitle"
        @change-role="(...args) => emit('change-role', ...args)"
        @save="emit('save')"
        @toggle-favorite="emit('toggle-favorite')"
        @toggle-lock="emit('toggle-lock')"
        @copy-link="emit('copy-link')"
        @export-markdown="emit('export-markdown')"
        @open-share="emit('open-share')"
      />
    </WorkspacePageHeader>

    <WorkspacePropertyPanel
      v-model:icon="iconModel"
      v-model:cover-color="coverColorModel"
      v-model:status="statusModel"
      v-model:priority="priorityModel"
      v-model:owner-email="ownerEmailModel"
      v-model:due-date="dueDateModel"
      v-model:tags-input="tagsInputModel"
      :status-option="statusOption"
      :priority-option="priorityOption"
      :cover-color-option="coverColorOption"
      :cover-color-options="WORKSPACE_COVER_COLOR_OPTIONS"
      :status-options="WORKSPACE_PROPERTY_STATUS_OPTIONS"
      :priority-options="WORKSPACE_PROPERTY_PRIORITY_OPTIONS"
      :owner-candidates="ownerCandidates"
      :tags="tags"
      :can-modify-page="canModifyPage"
      @normalize-icon="emit('normalize-icon')"
    />

    <input :ref="registerImageInput" type="file" accept="image/*" multiple hidden @change="emit('asset-selection', $event)" />
    <input :ref="registerFileInput" type="file" multiple hidden @change="emit('asset-selection', $event)" />

    <WorkspaceInlineAssetsSection
      :assets="assets"
      :images="images"
      :files="files"
      :loading="assetLoading"
      :uploading="assetUploading"
      :error="assetError"
      :workspace-id="workspaceId"
      :can-manage-assets="canManageAssets"
      :is-deleting-asset="isDeletingAsset"
      @trigger-image-select="emit('trigger-image-select')"
      @trigger-file-select="emit('trigger-file-select')"
      @delete-asset="emit('delete-asset', $event)"
      @download-asset="emit('download-asset', $event)"
    />

    <WorkspaceTemplatePanel
      v-if="canShowTemplates"
      :templates="templates"
      :applying-id="templateApplying"
      @apply="emit('apply-template', $event)"
    />

    <div class="editor-body" :class="{ 'editor-body--locked': isPageLocked }">
      <div v-if="isEditorLoading" class="loading-overlay">로딩 중...</div>
      <WorkspaceEditorLockOverlay
        v-if="isPageLocked"
        :can-edit-workspace="canEditWorkspace"
        :is-saving="isSaving"
        :is-editor-loading="isEditorLoading"
        @unlock="emit('toggle-lock')"
      />
      <div :ref="registerEditorHolder" id="editor-holder" class="editor-holder"></div>
      <WorkspaceInlineBlockBar
        v-if="canEditWorkspace"
        v-model:text="inlineQuickBlockTextModel"
        :options="inlineQuickBlockOptions"
        :can-insert="canInsertQuickBlock"
        :adding-id="quickBlockAdding"
        @insert-block="emit('insert-inline-block', $event)"
      />
    </div>

    <WorkspaceRemoteCursorsOverlay :cursors="remoteCursors" />
  </div>
</template>

<style scoped src="../styles/03-editor-header.css"></style>
<style scoped>
.editor-body {
  position: relative;
  min-height: 60vh;
  padding: 20px;
}

.editor-body--locked .editor-holder {
  filter: saturate(0.86);
  opacity: 0.72;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.05);
}

.editor-holder {
  min-height: 48vh;
  border: 1px solid var(--editor-border);
  border-radius: 12px;
  background: var(--editor-bg);
  padding: 18px;
  font-size: 16px;
}

.editor-holder :deep(.workspace-block-anchor-highlight) {
  border-radius: 10px;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16);
  transition: box-shadow 0.2s ease;
}

.editor-holder :deep(.ce-block.workspace-block-has-comments) {
  position: relative;
}

.editor-holder :deep(.ce-block.workspace-block-has-comments::before) {
  content: "";
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: -8px;
  width: 3px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.22);
}

.editor-holder :deep(.workspace-block-comment-badge) {
  position: absolute;
  top: 6px;
  right: -10px;
  z-index: 4;
  display: inline-flex;
  min-width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--editor-bg);
  border-radius: 999px;
  background: #2563eb;
  color: #ffffff;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.24);
  cursor: pointer;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
}

.editor-holder :deep(.workspace-block-comment-badge:hover) {
  background: #1d4ed8;
}

:deep(.ce-block h1) {
  font-size: 40px !important;
  font-weight: 700;
}

@media (max-width: 640px) {
  .editor-holder :deep(.workspace-block-comment-badge) {
    right: 2px;
  }
}
</style>