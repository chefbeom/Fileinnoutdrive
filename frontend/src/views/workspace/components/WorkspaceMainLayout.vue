<script setup>
import WorkspaceDocumentSidebar from './WorkspaceDocumentSidebar.vue'
import WorkspaceEditorShell from './WorkspaceEditorShell.vue'

defineProps([
  'documentQuery',
  'sectionNameDraft',
  'sectionEditDraft',
  'sectionEditingId',
  'documentsLoading',
  'currentWorkspaceKey',
  'favoriteDocuments',
  'recentDocuments',
  'documentSections',
  'visibleSectionViews',
  'sectionedDocumentCount',
  'personalDocuments',
  'sharedDocuments',
  'canModifyPage',
  'hasEditor',
  'isDocumentFavorite',
  'documentSectionId',
  'isDocumentActionLoading',
  'icon',
  'coverColor',
  'status',
  'priority',
  'ownerEmail',
  'dueDate',
  'tagsInput',
  'presenceOpen',
  'openRoleDropdownId',
  'panelCollapsed',
  'inlineQuickBlockText',
  'title',
  'breadcrumbs',
  'coverColorOption',
  'statusOption',
  'priorityOption',
  'ownerCandidates',
  'tags',
  'saveStatusClass',
  'saveStatusLabel',
  'realtimeStatusClass',
  'realtimeStatusLabel',
  'shareStatusClass',
  'shareStatusLabel',
  'accessRoleLabel',
  'isPageLocked',
  'lockStatusLabel',
  'workspaceId',
  'linkCopied',
  'activeUserPreview',
  'extraActiveUserCount',
  'activeUsers',
  'presenceSummaryLabel',
  'canManageShare',
  'canEditWorkspace',
  'isValid',
  'isSaving',
  'isEditorLoading',
  'canFavoriteDocument',
  'isFavorite',
  'favoriteTitle',
  'lockButtonTitle',
  'canCopyLink',
  'isLinkCopied',
  'canExportMarkdown',
  'markdownExporting',
  'shareButtonTitle',
  'assets',
  'images',
  'files',
  'assetLoading',
  'assetUploading',
  'assetError',
  'canManageAssets',
  'isDeletingAsset',
  'canShowTemplates',
  'templates',
  'templateApplying',
  'inlineQuickBlockOptions',
  'canInsertQuickBlock',
  'quickBlockAdding',
  'remoteCursors',
])

defineEmits([
  'update:documentQuery',
  'update:sectionNameDraft',
  'update:sectionEditDraft',
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
  'register-section-edit-input',
  'open-command-palette',
  'create-document',
  'create-section',
  'save-section-rename',
  'cancel-section-rename',
  'toggle-section',
  'start-section-rename',
  'remove-section',
  'open-document',
  'toggle-document-favorite',
  'move-section',
  'insert-link',
  'copy-link',
  'duplicate-document',
  'remove-document',
  'normalize-icon',
  'title-input',
  'open-breadcrumb',
  'change-role',
  'save',
  'toggle-current-favorite',
  'toggle-lock',
  'copy-current-link',
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
</script>

<template>
  <WorkspaceDocumentSidebar
    :document-query="documentQuery"
    :section-name-draft="sectionNameDraft"
    :section-edit-draft="sectionEditDraft"
    :section-editing-id="sectionEditingId"
    :documents-loading="documentsLoading"
    :current-workspace-key="currentWorkspaceKey"
    :favorite-documents="favoriteDocuments"
    :recent-documents="recentDocuments"
    :document-sections="documentSections"
    :visible-section-views="visibleSectionViews"
    :sectioned-document-count="sectionedDocumentCount"
    :personal-documents="personalDocuments"
    :shared-documents="sharedDocuments"
    :can-modify-page="canModifyPage"
    :has-editor="hasEditor"
    :is-document-favorite="isDocumentFavorite"
    :document-section-id="documentSectionId"
    :is-document-action-loading="isDocumentActionLoading"
    @update:document-query="$emit('update:documentQuery', $event)"
    @update:section-name-draft="$emit('update:sectionNameDraft', $event)"
    @update:section-edit-draft="$emit('update:sectionEditDraft', $event)"
    @register-section-edit-input="$emit('register-section-edit-input', $event)"
    @open-command-palette="$emit('open-command-palette')"
    @create-document="$emit('create-document')"
    @create-section="$emit('create-section')"
    @save-section-rename="$emit('save-section-rename')"
    @cancel-section-rename="$emit('cancel-section-rename')"
    @toggle-section="$emit('toggle-section', $event)"
    @start-section-rename="$emit('start-section-rename', $event)"
    @remove-section="$emit('remove-section', $event)"
    @open-document="$emit('open-document', $event)"
    @toggle-favorite="$emit('toggle-document-favorite', $event)"
    @move-section="(document, sectionId) => $emit('move-section', document, sectionId)"
    @insert-link="$emit('insert-link', $event)"
    @copy-link="$emit('copy-link', $event)"
    @duplicate-document="$emit('duplicate-document', $event)"
    @remove-document="$emit('remove-document', $event)"
  />

  <WorkspaceEditorShell
    :icon="icon"
    :cover-color="coverColor"
    :status="status"
    :priority="priority"
    :owner-email="ownerEmail"
    :due-date="dueDate"
    :tags-input="tagsInput"
    :presence-open="presenceOpen"
    :open-role-dropdown-id="openRoleDropdownId"
    :panel-collapsed="panelCollapsed"
    :inline-quick-block-text="inlineQuickBlockText"
    :title="title"
    :breadcrumbs="breadcrumbs"
    :cover-color-option="coverColorOption"
    :status-option="statusOption"
    :priority-option="priorityOption"
    :owner-candidates="ownerCandidates"
    :tags="tags"
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
    :lock-button-title="lockButtonTitle"
    :can-copy-link="canCopyLink"
    :is-link-copied="isLinkCopied"
    :can-export-markdown="canExportMarkdown"
    :markdown-exporting="markdownExporting"
    :share-button-title="shareButtonTitle"
    :assets="assets"
    :images="images"
    :files="files"
    :asset-loading="assetLoading"
    :asset-uploading="assetUploading"
    :asset-error="assetError"
    :can-manage-assets="canManageAssets"
    :is-deleting-asset="isDeletingAsset"
    :can-show-templates="canShowTemplates"
    :templates="templates"
    :template-applying="templateApplying"
    :inline-quick-block-options="inlineQuickBlockOptions"
    :can-insert-quick-block="canInsertQuickBlock"
    :quick-block-adding="quickBlockAdding"
    :remote-cursors="remoteCursors"
    @update:icon="$emit('update:icon', $event)"
    @update:cover-color="$emit('update:coverColor', $event)"
    @update:status="$emit('update:status', $event)"
    @update:priority="$emit('update:priority', $event)"
    @update:owner-email="$emit('update:ownerEmail', $event)"
    @update:due-date="$emit('update:dueDate', $event)"
    @update:tags-input="$emit('update:tagsInput', $event)"
    @update:presence-open="$emit('update:presenceOpen', $event)"
    @update:open-role-dropdown-id="$emit('update:openRoleDropdownId', $event)"
    @update:panel-collapsed="$emit('update:panelCollapsed', $event)"
    @update:inline-quick-block-text="$emit('update:inlineQuickBlockText', $event)"
    @normalize-icon="$emit('normalize-icon')"
    @title-input="$emit('title-input', $event)"
    @open-breadcrumb="$emit('open-breadcrumb', $event)"
    @change-role="(member, role) => $emit('change-role', member, role)"
    @save="$emit('save')"
    @toggle-favorite="$emit('toggle-current-favorite')"
    @toggle-lock="$emit('toggle-lock')"
    @copy-link="$emit('copy-current-link')"
    @export-markdown="$emit('export-markdown')"
    @open-share="$emit('open-share')"
    @asset-selection="$emit('asset-selection', $event)"
    @trigger-image-select="$emit('trigger-image-select')"
    @trigger-file-select="$emit('trigger-file-select')"
    @delete-asset="$emit('delete-asset', $event)"
    @download-asset="$emit('download-asset', $event)"
    @apply-template="$emit('apply-template', $event)"
    @insert-inline-block="$emit('insert-inline-block', $event)"
    @register-image-input="$emit('register-image-input', $event)"
    @register-file-input="$emit('register-file-input', $event)"
    @register-editor-holder="$emit('register-editor-holder', $event)"
  />
</template>
