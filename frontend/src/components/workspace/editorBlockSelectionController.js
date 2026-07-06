import {
  findBlockIndexByAnchor,
  getBlockAnchorAtIndex,
  getEditorBlockHolder,
  highlightBlockHolder,
  resolveActiveEditorBlockIndex,
} from './editorBlockNavigation.js'

export const createEditorBlockSelectionController = ({
  getEditor = () => null,
  holderElement = null,
  selectedBlockAnchorRef,
  getActiveElement = () => globalThis.document?.activeElement,
  setTimeoutImpl = (callback, delay) => setTimeout(callback, delay),
  clearTimeoutImpl = (timer) => clearTimeout(timer),
  logger = console,
} = {}) => {
  let selectionAnchorTimer = null
  let bound = false

  const getActiveEditorBlockIndex = () => resolveActiveEditorBlockIndex({
    editor: getEditor(),
    holderElement,
    activeElement: getActiveElement(),
  })

  const captureCurrentBlockAnchor = async () => {
    const editor = getEditor()
    if (!editor) return null
    try {
      await editor.isReady
      const index = getActiveEditorBlockIndex()
      if (index < 0) return selectedBlockAnchorRef?.value ?? null
      const snapshot = await editor.save()
      const anchor = getBlockAnchorAtIndex(snapshot.blocks || [], index)
      if (anchor && selectedBlockAnchorRef) {
        selectedBlockAnchorRef.value = anchor
      }
      return anchor
    } catch (error) {
      logger?.warn?.('[Editor] block anchor capture failed', error)
      return selectedBlockAnchorRef?.value ?? null
    }
  }

  const scheduleBlockAnchorCapture = () => {
    clearTimeoutImpl(selectionAnchorTimer)
    selectionAnchorTimer = setTimeoutImpl(() => {
      void captureCurrentBlockAnchor()
    }, 80)
  }

  const clearSelectedBlockAnchor = () => {
    if (selectedBlockAnchorRef) {
      selectedBlockAnchorRef.value = null
    }
  }

  const focusBlockAnchor = async (anchorBlockId) => {
    const editor = getEditor()
    if (!editor || !anchorBlockId) return false
    try {
      await editor.isReady
      const snapshot = await editor.save()
      const blocks = snapshot.blocks || []
      const targetIndex = findBlockIndexByAnchor(blocks, anchorBlockId)
      if (targetIndex < 0) return false

      const blockHolder = getEditorBlockHolder({ editor, holderElement, index: targetIndex })
      if (!highlightBlockHolder(blockHolder)) return false

      if (selectedBlockAnchorRef) {
        selectedBlockAnchorRef.value = getBlockAnchorAtIndex(blocks, targetIndex)
      }
      return true
    } catch (error) {
      logger?.warn?.('[Editor] block anchor focus failed', error)
      return false
    }
  }

  const bindSelectionEvents = () => {
    if (bound || !holderElement) return
    holderElement.addEventListener?.('click', scheduleBlockAnchorCapture)
    holderElement.addEventListener?.('keyup', scheduleBlockAnchorCapture)
    holderElement.addEventListener?.('focusin', scheduleBlockAnchorCapture)
    bound = true
    scheduleBlockAnchorCapture()
  }

  const destroy = () => {
    clearTimeoutImpl(selectionAnchorTimer)
    selectionAnchorTimer = null
    if (!bound || !holderElement) return
    holderElement.removeEventListener?.('click', scheduleBlockAnchorCapture)
    holderElement.removeEventListener?.('keyup', scheduleBlockAnchorCapture)
    holderElement.removeEventListener?.('focusin', scheduleBlockAnchorCapture)
    bound = false
  }

  return {
    bindSelectionEvents,
    captureCurrentBlockAnchor,
    clearSelectedBlockAnchor,
    destroy,
    focusBlockAnchor,
    scheduleBlockAnchorCapture,
  }
}
