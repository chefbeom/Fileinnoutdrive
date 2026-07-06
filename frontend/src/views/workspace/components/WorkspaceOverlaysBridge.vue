<script setup>
import WorkspaceOverlays from './WorkspaceOverlays.vue'

defineProps({
  model: {
    type: Object,
    required: true,
  },
  actions: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <WorkspaceOverlays
    :workspace-notice="model.workspaceNotice"
    :workspace-confirm="model.workspaceConfirm"
    :is-command-palette-open="model.isCommandPaletteOpen"
    :command-query="model.commandQuery"
    :command-active-index="model.commandActiveIndex"
    :command-items="model.commandItems"
    :command-empty-label="model.commandEmptyLabel"
    :show-share-modal="model.showShareModal"
    :workspace-id="model.workspaceId"
    :workspace-uuid="model.workspaceUuid"
    :workspace-share-status="model.workspaceShareStatus"
    @run-notice-action="actions.runWorkspaceNoticeAction"
    @close-notice="actions.closeWorkspaceNotice"
    @close-confirm="actions.closeWorkspaceConfirm"
    @confirm-action="actions.confirmWorkspaceAction"
    @update:command-query="actions.setValue('workspaceCommandQuery', $event)"
    @update:command-active-index="actions.setValue('workspaceCommandActiveIndex', $event)"
    @move-command-selection="actions.moveWorkspaceCommandSelection"
    @execute-command="actions.executeWorkspaceCommand"
    @close-command-palette="actions.closeWorkspaceCommandPalette"
    @register-command-input="actions.registerCommandInput"
    @close-share="actions.closeWorkspaceShare"
    @refresh-share="actions.refreshWorkspaceShare"
  />
</template>