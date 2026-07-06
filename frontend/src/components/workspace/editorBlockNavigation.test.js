import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BLOCK_ANCHOR_HIGHLIGHT_CLASS,
  findBlockIndexByAnchor,
  getActiveDomBlockIndex,
  getBlockAnchorAtIndex,
  getEditorApiBlockIndex,
  getEditorBlockHolder,
  highlightBlockHolder,
  resolveActiveEditorBlockIndex,
} from './editorBlockNavigation.js'

describe('editorBlockNavigation', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('resolves active block index from EditorJS API before DOM fallback', () => {
    const editor = { blocks: { getCurrentBlockIndex: vi.fn(() => 2) } }

    expect(getEditorApiBlockIndex(editor)).toBe(2)
    expect(resolveActiveEditorBlockIndex({ editor, holderElement: document.body })).toBe(2)
    expect(getEditorApiBlockIndex({ blocks: { getCurrentBlockIndex: vi.fn(() => -1) } })).toBe(-1)
  })

  it('falls back to the active ce-block in the holder', () => {
    document.body.innerHTML = `
      <section id="holder">
        <div class="ce-block"><button id="a">A</button></div>
        <div class="ce-block"><button id="b">B</button></div>
      </section>
    `
    const holder = document.getElementById('holder')
    const activeElement = document.getElementById('b')

    expect(getActiveDomBlockIndex(holder, activeElement)).toBe(1)
    expect(resolveActiveEditorBlockIndex({ editor: {}, holderElement: holder, activeElement })).toBe(1)
  })

  it('finds block anchors and holders by index or anchor id', () => {
    document.body.innerHTML = '<section id="holder"><div class="ce-block"></div><div class="ce-block"></div></section>'
    const holder = document.getElementById('holder')
    const apiHolder = document.createElement('div')
    const editor = { blocks: { getBlockByIndex: vi.fn(() => ({ holder: apiHolder })) } }
    const blocks = [
      { id: 'block-a', type: 'paragraph', data: { text: 'Alpha' } },
      { type: 'header', data: { text: 'Beta', level: 2 } },
    ]

    expect(findBlockIndexByAnchor(blocks, 'block-a')).toBe(0)
    expect(findBlockIndexByAnchor(blocks, 'index-1')).toBe(1)
    expect(findBlockIndexByAnchor(blocks, '')).toBe(-1)
    expect(getBlockAnchorAtIndex(blocks, 1)).toMatchObject({
      anchorBlockId: 'index-1',
      anchorBlockType: 'header',
      anchorText: 'Beta',
    })
    expect(getEditorBlockHolder({ editor, holderElement: holder, index: 0 })).toBe(apiHolder)
    expect(getEditorBlockHolder({ editor: {}, holderElement: holder, index: 1 })).toBe(holder.querySelectorAll('.ce-block')[1])
  })

  it('scrolls and temporarily highlights block holders', () => {
    const blockHolder = document.createElement('div')
    blockHolder.scrollIntoView = vi.fn()
    let timeoutHandler = null
    const windowObj = {
      setTimeout: vi.fn((handler, timeout) => {
        timeoutHandler = handler
        return timeout
      }),
    }

    expect(highlightBlockHolder(blockHolder, { windowObj, durationMs: 50 })).toBe(true)
    expect(blockHolder.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    expect(blockHolder.classList.contains(BLOCK_ANCHOR_HIGHLIGHT_CLASS)).toBe(true)
    expect(windowObj.setTimeout).toHaveBeenCalledWith(expect.any(Function), 50)

    timeoutHandler()

    expect(blockHolder.classList.contains(BLOCK_ANCHOR_HIGHLIGHT_CLASS)).toBe(false)
    expect(highlightBlockHolder(null)).toBe(false)
  })
})