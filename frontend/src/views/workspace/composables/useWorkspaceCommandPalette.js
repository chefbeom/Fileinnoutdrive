import { computed, nextTick, ref, watch } from 'vue'

import {
  clampWorkspaceCommandActiveIndex,
  filterWorkspaceCommandItems,
  moveWorkspaceCommandActiveIndex,
  workspaceCommandActiveItem as selectWorkspaceCommandActiveItem,
  workspaceCommandEmptyLabel as createWorkspaceCommandEmptyLabel,
} from '../services/workspaceCommands.js'

const noop = () => {}

export const useWorkspaceCommandPalette = ({
  workspaceCommandBaseItems,
  onDocument = noop,
  onTemplate = noop,
  onBlock = noop,
  onPanel = noop,
  actionHandlers = {},
  nextTickFn = nextTick,
} = {}) => {
  const workspaceCommandInput = ref(null)
  const isWorkspaceCommandPaletteOpen = ref(false)
  const workspaceCommandQuery = ref('')
  const workspaceCommandActiveIndex = ref(0)

  const workspaceCommandItems = computed(() =>
    filterWorkspaceCommandItems(workspaceCommandBaseItems?.value, workspaceCommandQuery.value),
  )

  const workspaceCommandActiveItem = computed(() =>
    selectWorkspaceCommandActiveItem(workspaceCommandItems.value, workspaceCommandActiveIndex.value),
  )

  const workspaceCommandEmptyLabel = computed(() =>
    createWorkspaceCommandEmptyLabel(workspaceCommandQuery.value),
  )

  const openWorkspaceCommandPalette = async () => {
    isWorkspaceCommandPaletteOpen.value = true
    workspaceCommandQuery.value = ''
    workspaceCommandActiveIndex.value = 0
    await nextTickFn()
    workspaceCommandInput.value?.focus?.()
  }

  const closeWorkspaceCommandPalette = () => {
    isWorkspaceCommandPaletteOpen.value = false
    workspaceCommandQuery.value = ''
    workspaceCommandActiveIndex.value = 0
  }

  const moveWorkspaceCommandSelection = (direction) => {
    workspaceCommandActiveIndex.value = moveWorkspaceCommandActiveIndex(
      workspaceCommandActiveIndex.value,
      direction,
      workspaceCommandItems.value.length,
    )
  }

  const executeWorkspaceCommand = async (item = workspaceCommandActiveItem.value) => {
    if (!item) return
    closeWorkspaceCommandPalette()

    if (item.type === 'document') {
      await onDocument(item.document, item)
      return
    }

    if (item.type === 'template') {
      await onTemplate(item.template, item)
      return
    }

    if (item.type === 'block') {
      await onBlock(item.block, item)
      return
    }

    if (item.type === 'panel') {
      await onPanel(item.panelId, item)
      return
    }

    const handler = actionHandlers[item.action]
    if (typeof handler === 'function') {
      await handler(item)
    }
  }

  const handleWorkspaceGlobalKeydown = (event) => {
    const key = String(event?.key || '').toLowerCase()
    if ((event?.ctrlKey || event?.metaKey) && key === 'k') {
      event.preventDefault?.()
      void openWorkspaceCommandPalette()
      return
    }

    if (isWorkspaceCommandPaletteOpen.value && key === 'escape') {
      event.preventDefault?.()
      closeWorkspaceCommandPalette()
    }
  }

  watch(workspaceCommandQuery, () => {
    workspaceCommandActiveIndex.value = 0
  })

  watch(workspaceCommandItems, (items) => {
    workspaceCommandActiveIndex.value = clampWorkspaceCommandActiveIndex(
      workspaceCommandActiveIndex.value,
      items.length,
    )
  })

  return {
    workspaceCommandInput,
    isWorkspaceCommandPaletteOpen,
    workspaceCommandQuery,
    workspaceCommandActiveIndex,
    workspaceCommandItems,
    workspaceCommandActiveItem,
    workspaceCommandEmptyLabel,
    openWorkspaceCommandPalette,
    closeWorkspaceCommandPalette,
    moveWorkspaceCommandSelection,
    executeWorkspaceCommand,
    handleWorkspaceGlobalKeydown,
  }
}
