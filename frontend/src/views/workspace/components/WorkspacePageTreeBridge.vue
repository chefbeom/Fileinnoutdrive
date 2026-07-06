<script setup>
import WorkspacePageTreePanel from './WorkspacePageTreePanel.vue'

defineProps({
  activeTab: { type: String, default: '' },
  isPanelVisible: { type: Function, required: true },
  loading: { type: Boolean, default: false },
  query: { type: String, default: '' },
  rows: { type: Array, default: () => [] },
  emptyLabel: { type: String, default: '' },
  collapsedIdSet: { type: Object, default: () => new Set() },
  subpageError: { type: String, default: '' },
  renameError: { type: String, default: '' },
  moveError: { type: String, default: '' },
  subpageCreatingId: { type: String, default: '' },
  subpageComposerParentId: { type: String, default: '' },
  subpageTitle: { type: String, default: '' },
  renamingId: { type: String, default: '' },
  renameDraft: { type: String, default: '' },
  renameSavingId: { type: String, default: '' },
  movingId: { type: String, default: '' },
  moveTargetId: { type: String, default: '' },
  moveSavingId: { type: String, default: '' },
  canModifyPage: { type: Boolean, default: false },
  hasEditor: { type: Boolean, default: false },
  isDocumentLinkCopied: { type: Function, default: () => false },
  moveTargetOptions: { type: Function, default: () => [] },
  canApplyMove: { type: Function, default: () => false },
})

const emit = defineEmits([
  'refresh',
  'update:query',
  'update:subpageTitle',
  'update:renameDraft',
  'update:moveTargetId',
  'toggle-node',
  'open-document',
  'open-rename',
  'open-subpage',
  'open-move',
  'copy-link',
  'insert-link',
  'rename-page',
  'cancel-rename',
  'move-page',
  'cancel-move',
  'create-subpage',
  'cancel-subpage',
])
</script>

<template>
  <div v-if="activeTab === 'all'" class="workspace-floating-divider"></div>

  <WorkspacePageTreePanel
    v-if="isPanelVisible('tree')"
    :query="query"
    :subpage-title="subpageTitle"
    :rename-draft="renameDraft"
    :move-target-id="moveTargetId"
    :loading="loading"
    :rows="rows"
    :empty-label="emptyLabel"
    :collapsed-id-set="collapsedIdSet"
    :subpage-error="subpageError"
    :rename-error="renameError"
    :move-error="moveError"
    :subpage-creating-id="subpageCreatingId"
    :subpage-composer-parent-id="subpageComposerParentId"
    :renaming-id="renamingId"
    :rename-saving-id="renameSavingId"
    :moving-id="movingId"
    :move-saving-id="moveSavingId"
    :can-modify-page="canModifyPage"
    :has-editor="hasEditor"
    :is-document-link-copied="isDocumentLinkCopied"
    :move-target-options="moveTargetOptions"
    :can-apply-move="canApplyMove"
    @refresh="emit('refresh')"
    @toggle-node="emit('toggle-node', $event)"
    @open-document="emit('open-document', $event)"
    @open-rename="emit('open-rename', $event)"
    @open-subpage="emit('open-subpage', $event)"
    @open-move="emit('open-move', $event)"
    @copy-link="emit('copy-link', $event)"
    @insert-link="emit('insert-link', $event)"
    @rename-page="emit('rename-page', $event)"
    @cancel-rename="emit('cancel-rename')"
    @move-page="emit('move-page', $event)"
    @cancel-move="emit('cancel-move')"
    @create-subpage="emit('create-subpage', $event)"
    @cancel-subpage="emit('cancel-subpage')"
    @update:query="emit('update:query', $event)"
    @update:subpage-title="emit('update:subpageTitle', $event)"
    @update:rename-draft="emit('update:renameDraft', $event)"
    @update:move-target-id="emit('update:moveTargetId', $event)"
  />
</template>
