<script setup>
import { defineAsyncComponent } from 'vue'

import WorkspaceCommandPalette from './WorkspaceCommandPalette.vue'
import WorkspaceConfirmDialog from './WorkspaceConfirmDialog.vue'
import WorkspaceNoticeToast from './WorkspaceNoticeToast.vue'

const ShareModal = defineAsyncComponent(() => import('@/views/workspace/ShareModal.vue').then((module) => module.default))

defineProps({
  workspaceNotice: {
    type: Object,
    default: null,
  },
  workspaceConfirm: {
    type: Object,
    default: null,
  },
  isCommandPaletteOpen: {
    type: Boolean,
    default: false,
  },
  commandQuery: {
    type: String,
    default: '',
  },
  commandActiveIndex: {
    type: Number,
    default: 0,
  },
  commandItems: {
    type: Array,
    default: () => [],
  },
  commandEmptyLabel: {
    type: String,
    default: '',
  },
  showShareModal: {
    type: Boolean,
    default: false,
  },
  workspaceId: {
    type: [Number, String],
    default: null,
  },
  workspaceUuid: {
    type: String,
    default: '',
  },
  workspaceShareStatus: {
    type: String,
    default: '',
  },
})

defineEmits([
  'run-notice-action',
  'close-notice',
  'close-confirm',
  'confirm-action',
  'update:commandQuery',
  'update:commandActiveIndex',
  'move-command-selection',
  'execute-command',
  'close-command-palette',
  'register-command-input',
  'close-share',
  'refresh-share',
])
</script>

<template>
  <transition name="workspace-notice">
    <WorkspaceNoticeToast
      v-if="workspaceNotice"
      :notice="workspaceNotice"
      @run-action="$emit('run-notice-action')"
      @close="$emit('close-notice')"
    />
  </transition>

  <WorkspaceConfirmDialog
    v-if="workspaceConfirm"
    :confirm="workspaceConfirm"
    @close="$emit('close-confirm')"
    @confirm="$emit('confirm-action')"
  />

  <WorkspaceCommandPalette
    v-if="isCommandPaletteOpen"
    :query="commandQuery"
    :active-index="commandActiveIndex"
    :items="commandItems"
    :empty-label="commandEmptyLabel"
    @update:query="$emit('update:commandQuery', $event)"
    @update:active-index="$emit('update:commandActiveIndex', $event)"
    @move-selection="$emit('move-command-selection', $event)"
    @execute="$emit('execute-command', $event)"
    @close="$emit('close-command-palette')"
    @register-input="$emit('register-command-input', $event)"
  />

  <ShareModal
    v-if="showShareModal"
    :is-open="showShareModal"
    :post-idx="workspaceId"
    :uuid="workspaceUuid"
    :initial-status="workspaceShareStatus"
    @close="$emit('close-share')"
    @refresh="$emit('refresh-share')"
  />
</template>
