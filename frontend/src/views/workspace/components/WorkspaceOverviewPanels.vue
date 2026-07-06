<script setup>
import WorkspaceCollaborationPanel from './WorkspaceCollaborationPanel.vue'
import WorkspaceFullTextPanel from './WorkspaceFullTextPanel.vue'
import WorkspaceHomePanel from './WorkspaceHomePanel.vue'
import WorkspaceSummaryPanel from './WorkspaceSummaryPanel.vue'
import WorkspaceWorkloadPanel from './WorkspaceWorkloadPanel.vue'

defineProps({
  activeTab: { type: String, default: '' },
  isPanelVisible: { type: Function, required: true },
  loading: { type: Boolean, default: false },
  homeMetricCards: { type: Array, default: () => [] },
  homeAttentionItems: { type: Array, default: () => [] },
  homeQueueItems: { type: Array, default: () => [] },
  homeRecentPages: { type: Array, default: () => [] },
  blockCount: { type: Number, default: 0 },
  summaryCards: { type: Array, default: () => [] },
  healthItems: { type: Array, default: () => [] },
  activeUsers: { type: Array, default: () => [] },
  accessRole: { type: String, default: '' },
  shareStatusLabel: { type: String, default: '' },
  permissionItems: { type: Array, default: () => [] },
  canManageShare: { type: Boolean, default: false },
  canManageAssets: { type: Boolean, default: false },
  canComment: { type: Boolean, default: false },
  isValid: { type: Boolean, default: false },
  isSaving: { type: Boolean, default: false },
  isEditorLoading: { type: Boolean, default: false },
  shareButtonTitle: { type: String, default: '' },
  assetUploading: { type: Boolean, default: false },
  workspaceId: { type: [Number, String], default: null },
  memberSummaryLabel: { type: String, default: '' },
  memberError: { type: String, default: '' },
  memberLoading: { type: Boolean, default: false },
  memberRows: { type: Array, default: () => [] },
  roleLabel: { type: Function, default: (role) => role || '' },
  userInitial: { type: Function, default: (name) => String(name || '?').charAt(0).toUpperCase() },
  isMemberBusy: { type: Function, default: () => false },
  workloadRows: { type: Array, default: () => [] },
  searchQuery: { type: String, default: '' },
  searchResults: { type: Array, default: () => [] },
  searchLoading: { type: Boolean, default: false },
  searchError: { type: String, default: '' },
  canSearch: { type: Boolean, default: false },
  canModifyPage: { type: Boolean, default: false },
  hasEditor: { type: Boolean, default: false },
})

const emit = defineEmits([
  'refresh',
  'open-home-metric',
  'open-home-attention',
  'open-home-queue',
  'open-document',
  'open-panel',
  'open-share',
  'trigger-file-select',
  'focus-comment',
  'refresh-members',
  'change-member-role',
  'remove-member',
  'focus-task',
  'update:searchQuery',
  'search',
  'copy-link',
  'insert-link',
])
</script>

<template>
  <WorkspaceHomePanel
    v-if="isPanelVisible('home')"
    :loading="loading"
    :metric-cards="homeMetricCards"
    :attention-items="homeAttentionItems"
    :queue-items="homeQueueItems"
    :recent-pages="homeRecentPages"
    @refresh="emit('refresh')"
    @open-metric="emit('open-home-metric', $event)"
    @open-attention="emit('open-home-attention', $event)"
    @open-queue="emit('open-home-queue', $event)"
    @open-document="emit('open-document', $event)"
  />

  <div v-if="activeTab === 'all'" class="workspace-floating-divider"></div>

  <WorkspaceSummaryPanel
    v-if="isPanelVisible('summary')"
    :block-count="blockCount"
    :summary-cards="summaryCards"
    :health-items="healthItems"
    @open-panel="emit('open-panel', $event)"
  />

  <div v-if="activeTab === 'all'" class="workspace-floating-divider"></div>

  <WorkspaceCollaborationPanel
    v-if="isPanelVisible('collaboration')"
    :active-users="activeUsers"
    :access-role="accessRole"
    :share-status-label="shareStatusLabel"
    :permission-items="permissionItems"
    :can-manage-share="canManageShare"
    :can-manage-assets="canManageAssets"
    :can-comment="canComment"
    :is-valid="isValid"
    :is-saving="isSaving"
    :is-editor-loading="isEditorLoading"
    :share-button-title="shareButtonTitle"
    :asset-uploading="assetUploading"
    :workspace-id="workspaceId"
    :member-summary-label="memberSummaryLabel"
    :member-error="memberError"
    :member-loading="memberLoading"
    :member-rows="memberRows"
    :role-label="roleLabel"
    :user-initial="userInitial"
    :is-member-busy="isMemberBusy"
    @open-share="emit('open-share')"
    @trigger-file-select="emit('trigger-file-select')"
    @focus-comment="emit('focus-comment')"
    @refresh-members="emit('refresh-members')"
    @change-member-role="(...args) => emit('change-member-role', ...args)"
    @remove-member="emit('remove-member', $event)"
  />

  <div v-if="activeTab === 'all'" class="workspace-floating-divider"></div>

  <WorkspaceWorkloadPanel
    v-if="isPanelVisible('workload')"
    :loading="loading"
    :workload-rows="workloadRows"
    :role-label="roleLabel"
    @open-document="emit('open-document', $event)"
    @focus-task="emit('focus-task', $event)"
  />

  <div v-if="activeTab === 'all'" class="workspace-floating-divider"></div>

  <WorkspaceFullTextPanel
    v-if="isPanelVisible('search')"
    :query="searchQuery"
    :results="searchResults"
    :loading="searchLoading"
    :error="searchError"
    :can-search="canSearch"
    :can-modify-page="canModifyPage"
    :has-editor="hasEditor"
    @update:query="emit('update:searchQuery', $event)"
    @search="emit('search')"
    @open-document="emit('open-document', $event)"
    @copy-link="emit('copy-link', $event)"
    @insert-link="emit('insert-link', $event)"
  />
</template>