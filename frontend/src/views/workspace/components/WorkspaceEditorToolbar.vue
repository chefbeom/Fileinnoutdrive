<script setup>
import WorkspacePresencePopover from './WorkspacePresencePopover.vue'

const props = defineProps({
  presenceOpen: { type: Boolean, default: false },
  openRoleDropdownId: { type: [String, Number], default: null },
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
  isPageLocked: { type: Boolean, default: false },
  lockButtonTitle: { type: String, default: '' },
  canCopyLink: { type: Boolean, default: false },
  isLinkCopied: { type: Boolean, default: false },
  canExportMarkdown: { type: Boolean, default: false },
  markdownExporting: { type: Boolean, default: false },
  panelCollapsed: { type: Boolean, default: false },
  shareButtonTitle: { type: String, default: '' },
})

const emit = defineEmits([
  'update:presenceOpen',
  'update:openRoleDropdownId',
  'update:panelCollapsed',
  'change-role',
  'save',
  'toggle-favorite',
  'toggle-lock',
  'copy-link',
  'export-markdown',
  'open-share',
])

const togglePanel = () => {
  emit('update:panelCollapsed', !props.panelCollapsed)
}
</script>

<template>
  <div class="editor-header__actions">
    <WorkspacePresencePopover
      :open="presenceOpen"
      :open-role-dropdown-id="openRoleDropdownId"
      :active-user-preview="activeUserPreview"
      :extra-active-user-count="extraActiveUserCount"
      :active-users="activeUsers"
      :presence-summary-label="presenceSummaryLabel"
      :can-manage-share="canManageShare"
      @update:open="emit('update:presenceOpen', $event)"
      @update:open-role-dropdown-id="emit('update:openRoleDropdownId', $event)"
      @change-role="(user, role) => emit('change-role', user, role)"
    />

    <button :disabled="!canEditWorkspace || !isValid || isSaving" class="save-btn" @click="emit('save')">
      {{ isSaving ? '저장 중' : '저장' }}
    </button>
    <button
      type="button"
      class="workspace-favorite-page-btn"
      :class="{ 'workspace-favorite-page-btn--active': isFavorite }"
      :disabled="!canFavoriteDocument"
      :title="favoriteTitle"
      :aria-pressed="isFavorite"
      @click="emit('toggle-favorite')"
    >
      <i :class="isFavorite ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
      <span>{{ isFavorite ? '즐겨찾기' : '별표' }}</span>
    </button>
    <button
      type="button"
      class="workspace-lock-btn"
      :class="{ 'workspace-lock-btn--locked': isPageLocked }"
      :disabled="!canEditWorkspace || isSaving || isEditorLoading"
      :aria-pressed="isPageLocked"
      :title="lockButtonTitle"
      @click="emit('toggle-lock')"
    >
      <i :class="isPageLocked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open'"></i>
      <span>{{ isPageLocked ? '잠김' : '잠금' }}</span>
    </button>
    <button
      type="button"
      class="workspace-copy-page-btn"
      :class="{ 'workspace-copy-page-btn--copied': isLinkCopied }"
      :disabled="!canCopyLink"
      :title="isLinkCopied ? '페이지 링크 복사됨' : '페이지 링크 복사'"
      @click="emit('copy-link')"
    >
      <i :class="isLinkCopied ? 'fa-solid fa-check' : 'fa-regular fa-clipboard'"></i>
      <span>{{ isLinkCopied ? '복사됨' : '링크' }}</span>
    </button>
    <button
      type="button"
      class="workspace-export-page-btn"
      :disabled="!canExportMarkdown"
      title="Markdown 내보내기"
      @click="emit('export-markdown')"
    >
      <i :class="markdownExporting ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-arrow-down'"></i>
      <span>{{ markdownExporting ? '내보내는 중' : 'MD' }}</span>
    </button>
    <button
      type="button"
      class="workspace-panel-toggle-btn"
      :class="{ 'workspace-panel-toggle-btn--collapsed': panelCollapsed }"
      :aria-pressed="panelCollapsed"
      :title="panelCollapsed ? '협업 패널 열기' : '협업 패널 접기'"
      @click="togglePanel"
    >
      <i class="fa-solid fa-table-columns"></i>
      <span>{{ panelCollapsed ? '패널 열기' : '패널 접기' }}</span>
    </button>
    <button
      type="button"
      class="workspace-share-btn"
      :disabled="!canManageShare || !isValid || isSaving || isEditorLoading"
      :title="shareButtonTitle"
      @click="emit('open-share')"
    >
      <i class="fa-solid fa-share-nodes"></i>
      <span>공유</span>
    </button>
  </div>
</template>
<style scoped>
.editor-header__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-shrink: 0;
}

.save-btn {
  padding: 9px 14px;
  background: #2563eb;
  color: white;
  border-radius: 10px;
  cursor: pointer;
  border: none;
  font-weight: 700;
  z-index: 10;
}

.save-btn:disabled,
.workspace-copy-page-btn:disabled,
.workspace-export-page-btn:disabled,
.workspace-favorite-page-btn:disabled,
.workspace-lock-btn:disabled,
.workspace-share-btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.workspace-copy-page-btn,
.workspace-export-page-btn,
.workspace-favorite-page-btn,
.workspace-lock-btn,
.workspace-share-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  padding: 9px 14px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 10px;
  background: #ffffff;
  color: #0f172a;
  font-size: 14px;
  font-weight: 800;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.workspace-copy-page-btn:hover:not(:disabled),
.workspace-export-page-btn:hover:not(:disabled),
.workspace-favorite-page-btn:hover:not(:disabled),
.workspace-lock-btn:hover:not(:disabled),
.workspace-share-btn:hover:not(:disabled) {
  border-color: rgba(37, 99, 235, 0.45);
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
}

.workspace-copy-page-btn:disabled,
.workspace-export-page-btn:disabled,
.workspace-favorite-page-btn:disabled,
.workspace-lock-btn:disabled,
.workspace-share-btn:disabled {
  border-color: #94a3b8;
  color: #ffffff;
}

.workspace-lock-btn--locked {
  border-color: rgba(15, 23, 42, 0.28);
  background: rgba(15, 23, 42, 0.08);
  color: #0f172a;
}

.workspace-favorite-page-btn--active {
  border-color: rgba(245, 158, 11, 0.34);
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
}

.workspace-copy-page-btn--copied {
  border-color: rgba(22, 163, 74, 0.34);
  background: rgba(22, 163, 74, 0.1);
  color: #15803d;
}

.workspace-panel-toggle-btn {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 9px 13px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  color: #334155;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.workspace-panel-toggle-btn:hover,
.workspace-panel-toggle-btn--collapsed {
  border-color: rgba(37, 99, 235, 0.42);
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
}

@media (max-width: 640px) {
  .editor-header__actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>