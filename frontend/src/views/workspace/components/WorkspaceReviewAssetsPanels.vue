<script setup>
import { ref } from 'vue'
import WorkspaceAssetsPanel from './WorkspaceAssetsPanel.vue'
import WorkspaceReviewPanel from './WorkspaceReviewPanel.vue'

defineProps({
  activeTab: { type: String, default: '' },
  isPanelVisible: { type: Function, required: true },
  unresolvedComments: { type: Array, default: () => [] },
  commentFilters: { type: Array, default: () => [] },
  commentFilter: { type: String, default: '' },
  canComment: { type: Boolean, default: false },
  selectedBlockAnchor: { type: Object, default: null },
  commentAnchorLabel: { type: Function, required: true },
  showMentionMenu: { type: Boolean, default: false },
  canUseMentions: { type: Boolean, default: false },
  mentionCandidates: { type: Array, default: () => [] },
  newComment: { type: String, default: '' },
  commentSaving: { type: Boolean, default: false },
  commentError: { type: String, default: '' },
  commentLoading: { type: Boolean, default: false },
  comments: { type: Array, default: () => [] },
  visibleComments: { type: Array, default: () => [] },
  emptyLabel: { type: String, default: '' },
  editDraft: { type: String, default: '' },
  isMentioningCurrentUser: { type: Function, default: () => false },
  canEditComment: { type: Function, default: () => false },
  isCommentUpdating: { type: Function, default: () => false },
  isCommentDeleting: { type: Function, default: () => false },
  isCommentEditing: { type: Function, default: () => false },
  isCommentResolving: { type: Function, default: () => false },
  assets: { type: Array, default: () => [] },
  assetLoading: { type: Boolean, default: false },
  hasAssets: { type: Boolean, default: false },
  activeAssetId: { type: [String, Number], default: null },
  canManageAssets: { type: Boolean, default: false },
  getAssetBadge: { type: Function, required: true },
  isDeletingAsset: { type: Function, default: () => false },
  isSavingAsset: { type: Function, default: () => false },
})

const emit = defineEmits([
  'clear-anchor',
  'insert-mention',
  'create-comment',
  'start-edit',
  'delete-comment',
  'focus-anchor',
  'update-comment',
  'cancel-edit',
  'toggle-resolved',
  'update:commentFilter',
  'update:showMentionMenu',
  'update:newComment',
  'update:editDraft',
  'toggle-asset',
  'delete-asset',
  'save-asset-to-drive',
  'download-asset',
])

const reviewPanel = ref(null)

defineExpose({
  focus: () => reviewPanel.value?.focus?.(),
  scrollIntoView: (options) => reviewPanel.value?.scrollIntoView?.(options),
  setSelectionRange: (...args) => reviewPanel.value?.setSelectionRange?.(...args),
  get selectionStart() {
    return reviewPanel.value?.selectionStart ?? 0
  },
  get selectionEnd() {
    return reviewPanel.value?.selectionEnd ?? 0
  },
})
</script>

<template>
  <WorkspaceReviewPanel
    v-if="isPanelVisible('review')"
    ref="reviewPanel"
    :unresolved-comments="unresolvedComments"
    :comment-filters="commentFilters"
    :comment-filter="commentFilter"
    :can-comment="canComment"
    :selected-block-anchor="selectedBlockAnchor"
    :comment-anchor-label="commentAnchorLabel"
    :show-mention-menu="showMentionMenu"
    :can-use-mentions="canUseMentions"
    :mention-candidates="mentionCandidates"
    :new-comment="newComment"
    :comment-saving="commentSaving"
    :comment-error="commentError"
    :comment-loading="commentLoading"
    :comments="comments"
    :visible-comments="visibleComments"
    :empty-label="emptyLabel"
    :edit-draft="editDraft"
    :is-mentioning-current-user="isMentioningCurrentUser"
    :can-edit-comment="canEditComment"
    :is-comment-updating="isCommentUpdating"
    :is-comment-deleting="isCommentDeleting"
    :is-comment-editing="isCommentEditing"
    :is-comment-resolving="isCommentResolving"
    @clear-anchor="emit('clear-anchor')"
    @insert-mention="emit('insert-mention', $event)"
    @create-comment="emit('create-comment')"
    @start-edit="emit('start-edit', $event)"
    @delete-comment="emit('delete-comment', $event)"
    @focus-anchor="emit('focus-anchor', $event)"
    @update-comment="emit('update-comment', $event)"
    @cancel-edit="emit('cancel-edit')"
    @toggle-resolved="emit('toggle-resolved', $event)"
    @update:comment-filter="emit('update:commentFilter', $event)"
    @update:show-mention-menu="emit('update:showMentionMenu', $event)"
    @update:new-comment="emit('update:newComment', $event)"
    @update:edit-draft="emit('update:editDraft', $event)"
  />

  <div v-if="activeTab === 'all'" class="workspace-floating-divider"></div>

  <WorkspaceAssetsPanel
    v-if="isPanelVisible('assets')"
    :assets="assets"
    :loading="assetLoading"
    :has-assets="hasAssets"
    :active-asset-id="activeAssetId"
    :can-manage-assets="canManageAssets"
    :get-asset-badge="getAssetBadge"
    :is-deleting-asset="isDeletingAsset"
    :is-saving-asset="isSavingAsset"
    @toggle-asset="emit('toggle-asset', $event)"
    @delete-asset="emit('delete-asset', $event)"
    @save-asset-to-drive="emit('save-asset-to-drive', $event)"
    @download-asset="emit('download-asset', $event)"
  />
</template>