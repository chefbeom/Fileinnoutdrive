import { describe, expect, it, vi } from 'vitest'

import { createEditorBlockSelectionController } from './editorBlockSelectionController.js'

const createEventTarget = () => {
  const listeners = new Map()
  return {
    addEventListener(type, handler) {
      listeners.set(type, [...(listeners.get(type) || []), handler])
    },
    removeEventListener(type, handler) {
      listeners.set(type, (listeners.get(type) || []).filter((candidate) => candidate !== handler))
    },
    emit(type, event = {}) {
      ;(listeners.get(type) || []).forEach((handler) => handler(event))
    },
    count(type) {
      return (listeners.get(type) || []).length
    },
    querySelectorAll() {
      return []
    },
  }
}

describe('editorBlockSelectionController', () => {
  it('captures the active block anchor from the editor snapshot', async () => {
    const selectedBlockAnchorRef = { value: null }
    const editor = {
      isReady: Promise.resolve(),
      blocks: { getCurrentBlockIndex: vi.fn(() => 1) },
      save: vi.fn(async () => ({
        blocks: [
          { id: 'a', type: 'paragraph', data: { text: 'Alpha' } },
          { id: 'b', type: 'header', data: { text: 'Beta', level: 2 } },
        ],
      })),
    }

    const controller = createEditorBlockSelectionController({
      getEditor: () => editor,
      holderElement: createEventTarget(),
      selectedBlockAnchorRef,
    })

    await expect(controller.captureCurrentBlockAnchor()).resolves.toMatchObject({
      anchorBlockId: 'b',
      anchorBlockType: 'header',
      anchorText: 'Beta',
    })
    expect(selectedBlockAnchorRef.value.anchorBlockId).toBe('b')
  })

  it('focuses and highlights a block by anchor id', async () => {
    const blockHolder = document.createElement('div')
    blockHolder.scrollIntoView = vi.fn()
    const selectedBlockAnchorRef = { value: null }
    const editor = {
      isReady: Promise.resolve(),
      blocks: { getBlockByIndex: vi.fn(() => ({ holder: blockHolder })) },
      save: vi.fn(async () => ({
        blocks: [
          { id: 'a', type: 'paragraph', data: { text: 'Alpha' } },
          { id: 'b', type: 'checklist', data: { items: [{ text: 'Task' }] } },
        ],
      })),
    }

    const controller = createEditorBlockSelectionController({
      getEditor: () => editor,
      holderElement: createEventTarget(),
      selectedBlockAnchorRef,
    })

    await expect(controller.focusBlockAnchor('b')).resolves.toBe(true)

    expect(blockHolder.scrollIntoView).toHaveBeenCalled()
    expect(selectedBlockAnchorRef.value.anchorBlockId).toBe('b')
    expect(selectedBlockAnchorRef.value.anchorText).toBe('Task')
  })

  it('binds holder selection events and clears the pending timer on destroy', () => {
    const holderElement = createEventTarget()
    let timeoutHandler = null
    const clearTimeoutImpl = vi.fn()
    const controller = createEditorBlockSelectionController({
      getEditor: () => null,
      holderElement,
      selectedBlockAnchorRef: { value: null },
      setTimeoutImpl: vi.fn((handler, delay) => {
        timeoutHandler = handler
        return delay
      }),
      clearTimeoutImpl,
    })

    controller.bindSelectionEvents()
    expect(holderElement.count('click')).toBe(1)
    expect(holderElement.count('keyup')).toBe(1)
    expect(holderElement.count('focusin')).toBe(1)
    expect(timeoutHandler).toEqual(expect.any(Function))

    holderElement.emit('click')
    expect(clearTimeoutImpl).toHaveBeenCalled()

    controller.destroy()
    expect(holderElement.count('click')).toBe(0)
    expect(holderElement.count('keyup')).toBe(0)
    expect(holderElement.count('focusin')).toBe(0)
  })

  it('clears the selected anchor', () => {
    const selectedBlockAnchorRef = { value: { anchorBlockId: 'a' } }
    const controller = createEditorBlockSelectionController({ selectedBlockAnchorRef })

    controller.clearSelectedBlockAnchor()

    expect(selectedBlockAnchorRef.value).toBeNull()
  })
})
