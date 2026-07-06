import { blockAnchorFromSnapshot } from './editorDocumentAnalysis.js'

export const BLOCK_ANCHOR_HIGHLIGHT_CLASS = 'workspace-block-anchor-highlight'

export const getEditorApiBlockIndex = (editor) => {
  const index = typeof editor?.blocks?.getCurrentBlockIndex === 'function'
    ? editor.blocks.getCurrentBlockIndex()
    : -1
  return Number.isInteger(index) && index >= 0 ? index : -1
}

export const getActiveDomBlockIndex = (holderElement, activeElement = globalThis.document?.activeElement) => {
  const activeBlock = activeElement?.closest?.('.ce-block')
  if (!activeBlock || !holderElement?.querySelectorAll) return -1

  return Array.from(holderElement.querySelectorAll('.ce-block')).indexOf(activeBlock)
}

export const resolveActiveEditorBlockIndex = ({ editor, holderElement, activeElement } = {}) => {
  if (!editor) return -1

  const apiIndex = getEditorApiBlockIndex(editor)
  return apiIndex >= 0 ? apiIndex : getActiveDomBlockIndex(holderElement, activeElement)
}

export const getBlockAnchorAtIndex = (blocks = [], index) => {
  if (!Number.isInteger(index) || index < 0) return null
  return blockAnchorFromSnapshot(blocks?.[index], index)
}

export const findBlockIndexByAnchor = (blocks = [], anchorBlockId) => {
  const targetAnchorBlockId = String(anchorBlockId ?? '')
  if (!targetAnchorBlockId) return -1

  return (Array.isArray(blocks) ? blocks : []).findIndex((block, index) =>
    String(block?.id || `index-${index}`) === targetAnchorBlockId,
  )
}

export const getEditorBlockHolder = ({ editor, holderElement, index } = {}) => {
  if (!Number.isInteger(index) || index < 0) return null

  const blockApi = typeof editor?.blocks?.getBlockByIndex === 'function'
    ? editor.blocks.getBlockByIndex(index)
    : null

  return blockApi?.holder || holderElement?.querySelectorAll?.('.ce-block')?.[index] || null
}

export const highlightBlockHolder = (blockHolder, {
  windowObj = globalThis.window,
  highlightClass = BLOCK_ANCHOR_HIGHLIGHT_CLASS,
  durationMs = 1800,
  scrollOptions = { block: 'center', behavior: 'smooth' },
} = {}) => {
  if (!blockHolder) return false

  if (typeof blockHolder.scrollIntoView === 'function') {
    blockHolder.scrollIntoView(scrollOptions)
  }
  blockHolder.classList?.add(highlightClass)
  windowObj?.setTimeout?.(() => {
    blockHolder.classList?.remove(highlightClass)
  }, durationMs)
  return true
}