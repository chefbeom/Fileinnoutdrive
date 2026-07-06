import { computed, unref } from 'vue'

const noop = () => {}

export const createWorkspaceOverlaysMutableValues = ({
  workspaceCommandQuery,
  workspaceCommandActiveIndex,
  workspaceCommandInput,
  showWorkspaceShareModal,
} = {}) => ({
  workspaceCommandQuery,
  workspaceCommandActiveIndex,
  workspaceCommandInput,
  showWorkspaceShareModal,
})

export const createWorkspaceOverlaysValueSetter = (mutableValues = {}) => (key, value) => {
  const target = mutableValues[key]
  if (target && typeof target === 'object' && 'value' in target) {
    target.value = value
  }
}

export const useWorkspaceOverlaysBridge = (context = {}) => {
  const mutableValues = createWorkspaceOverlaysMutableValues(context)
  const setValue = context.setValue ?? createWorkspaceOverlaysValueSetter(mutableValues)

  const workspaceOverlaysModel = computed(() => ({
    workspaceNotice: unref(context.workspaceNotice),
    workspaceConfirm: unref(context.workspaceConfirm),
    isCommandPaletteOpen: unref(context.isWorkspaceCommandPaletteOpen),
    commandQuery: unref(context.workspaceCommandQuery),
    commandActiveIndex: unref(context.workspaceCommandActiveIndex),
    commandItems: unref(context.workspaceCommandItems),
    commandEmptyLabel: unref(context.workspaceCommandEmptyLabel),
    showShareModal: unref(context.showWorkspaceShareModal),
    workspaceId: unref(context.workspaceId),
    workspaceUuid: unref(context.workspaceUuid),
    workspaceShareStatus: unref(context.workspaceShareStatus),
  }))

  const workspaceOverlaysActions = {
    setValue,
    runWorkspaceNoticeAction: context.runWorkspaceNoticeAction ?? noop,
    closeWorkspaceNotice: context.closeWorkspaceNotice ?? noop,
    closeWorkspaceConfirm: context.closeWorkspaceConfirm ?? noop,
    confirmWorkspaceAction: context.confirmWorkspaceAction ?? noop,
    moveWorkspaceCommandSelection: context.moveWorkspaceCommandSelection ?? noop,
    executeWorkspaceCommand: context.executeWorkspaceCommand ?? noop,
    closeWorkspaceCommandPalette: context.closeWorkspaceCommandPalette ?? noop,
    registerCommandInput: (value) => setValue('workspaceCommandInput', value),
    closeWorkspaceShare: () => setValue('showWorkspaceShareModal', false),
    refreshWorkspaceShare: context.handleWorkspaceShareRefresh ?? noop,
  }

  return {
    workspaceOverlaysModel,
    workspaceOverlaysActions,
  }
}