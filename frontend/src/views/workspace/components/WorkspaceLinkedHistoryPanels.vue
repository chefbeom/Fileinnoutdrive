<script setup>
import { ref } from 'vue'
import WorkspaceHistoryPanel from './WorkspaceHistoryPanel.vue'
import WorkspaceLinkedPanel from './WorkspaceLinkedPanel.vue'

defineProps({
  activeTab: { type: String, default: '' },
  isPanelVisible: { type: Function, required: true },
  workspaceId: { type: [String, Number], default: null },
  relationCount: { type: Number, default: 0 },
  parentPage: { type: Object, default: null },
  childPages: { type: Array, default: () => [] },
  linkedDocuments: { type: Array, default: () => [] },
  linkedEmptyLabel: { type: String, default: '' },
  backlinks: { type: Array, default: () => [] },
  backlinkLoading: { type: Boolean, default: false },
  backlinkError: { type: String, default: '' },
  backlinkEmptyLabel: { type: String, default: '' },
  canModifyPage: { type: Boolean, default: false },
  hasEditor: { type: Boolean, default: false },
  subpageTitle: { type: String, default: '' },
  subpageCreating: { type: Boolean, default: false },
  subpageError: { type: String, default: '' },
  canStartSubpage: { type: Boolean, default: false },
  canCreateSubpage: { type: Boolean, default: false },
  revisions: { type: Array, default: () => [] },
  revisionLoading: { type: Boolean, default: false },
  revisionError: { type: String, default: '' },
  activeRevision: { type: Object, default: null },
  revisionDiff: { type: Object, default: null },
  diffSummary: { type: Array, default: () => [] },
  diffItems: { type: Array, default: () => [] },
  previewLoading: { type: [String, Number], default: '' },
  restoring: { type: [String, Number], default: '' },
  canRestore: { type: Boolean, default: false },
  revisionReasonLabel: { type: Function, required: true },
})

const emit = defineEmits([
  'refresh-backlinks',
  'open-parent',
  'open-document',
  'insert-link',
  'copy-link',
  'focus-linked-source',
  'create-subpage',
  'update:subpageTitle',
  'refresh-revisions',
  'preview-revision',
  'restore-revision',
])

const linkedPanel = ref(null)

defineExpose({
  focus: () => linkedPanel.value?.focus?.(),
})
</script>

<template>
  <WorkspaceLinkedPanel
    v-if="isPanelVisible('links')"
    ref="linkedPanel"
    :workspace-id="workspaceId"
    :relation-count="relationCount"
    :parent-page="parentPage"
    :child-pages="childPages"
    :linked-documents="linkedDocuments"
    :linked-empty-label="linkedEmptyLabel"
    :backlinks="backlinks"
    :backlink-loading="backlinkLoading"
    :backlink-error="backlinkError"
    :backlink-empty-label="backlinkEmptyLabel"
    :can-modify-page="canModifyPage"
    :has-editor="hasEditor"
    :subpage-title="subpageTitle"
    :subpage-creating="subpageCreating"
    :subpage-error="subpageError"
    :can-start-subpage="canStartSubpage"
    :can-create-subpage="canCreateSubpage"
    @refresh-backlinks="emit('refresh-backlinks')"
    @open-parent="emit('open-parent')"
    @open-document="emit('open-document', $event)"
    @insert-link="emit('insert-link', $event)"
    @copy-link="emit('copy-link', $event)"
    @focus-linked-source="emit('focus-linked-source', $event)"
    @create-subpage="emit('create-subpage')"
    @update:subpage-title="emit('update:subpageTitle', $event)"
  />

  <div v-if="activeTab === 'all'" class="workspace-floating-divider"></div>

  <WorkspaceHistoryPanel
    v-if="isPanelVisible('history')"
    :workspace-id="workspaceId"
    :revisions="revisions"
    :loading="revisionLoading"
    :error="revisionError"
    :active-revision="activeRevision"
    :revision-diff="revisionDiff"
    :diff-summary="diffSummary"
    :diff-items="diffItems"
    :preview-loading="previewLoading"
    :restoring="restoring"
    :can-restore="canRestore"
    :revision-reason-label="revisionReasonLabel"
    @refresh="emit('refresh-revisions')"
    @preview="emit('preview-revision', $event)"
    @restore="emit('restore-revision', $event)"
  />
</template>