import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  COMMENT_BADGE_CLASS,
  COMMENTED_BLOCK_CLASS,
  applyBlockCommentDecorationsToHolder,
  clearBlockCommentDecorations,
  createBlockCommentSummaryMap,
} from './editorBlockComments.js'

describe('editorBlockComments', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('normalizes comment summaries into positive-count anchor maps', () => {
    const map = createBlockCommentSummaryMap([
      { anchorBlockId: 'a', count: 2 },
      { anchorBlockId: 'b', count: 0 },
      { anchorBlockId: '', count: 4 },
      null,
    ])

    expect([...map.keys()]).toEqual(['a'])
    expect(map.get('a')).toEqual({ anchorBlockId: 'a', count: 2 })
  })

  it('clears stale block comment classes and badges', () => {
    document.body.innerHTML = `
      <section id="holder">
        <div class="ce-block ${COMMENTED_BLOCK_CLASS}">
          <button class="${COMMENT_BADGE_CLASS}">3</button>
        </div>
      </section>
    `

    const holder = document.getElementById('holder')
    clearBlockCommentDecorations(holder)

    expect(holder.querySelector(`.${COMMENTED_BLOCK_CLASS}`)).toBeNull()
    expect(holder.querySelector(`.${COMMENT_BADGE_CLASS}`)).toBeNull()
  })

  it('adds badges to matching EditorJS blocks and forwards badge clicks', () => {
    document.body.innerHTML = `
      <section id="holder">
        <div class="ce-block"></div>
        <div class="ce-block"></div>
      </section>
    `

    const holder = document.getElementById('holder')
    const summaries = createBlockCommentSummaryMap([{ anchorBlockId: 'block-a', count: 2 }])
    const onSelectAnchor = vi.fn()
    const onBadgeClick = vi.fn()

    expect(applyBlockCommentDecorationsToHolder({
      holderElement: holder,
      blocks: [
        { id: 'block-a', type: 'paragraph', data: { text: 'Alpha' } },
        { id: 'block-b', type: 'paragraph', data: { text: 'Beta' } },
      ],
      summaryMap: summaries,
      onSelectAnchor,
      onBadgeClick,
    })).toBe(1)

    const blocks = holder.querySelectorAll('.ce-block')
    const badge = blocks[0].querySelector(`.${COMMENT_BADGE_CLASS}`)

    expect(blocks[0].classList.contains(COMMENTED_BLOCK_CLASS)).toBe(true)
    expect(blocks[1].classList.contains(COMMENTED_BLOCK_CLASS)).toBe(false)
    expect(badge.textContent).toBe('2')
    expect(badge.getAttribute('aria-label')).toBe('2개의 미해결 댓글 보기')

    badge.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(onSelectAnchor).toHaveBeenCalledWith(expect.objectContaining({
      anchorBlockId: 'block-a',
      anchorBlockType: 'paragraph',
      anchorText: 'Alpha',
    }))
    expect(onBadgeClick).toHaveBeenCalledWith(expect.objectContaining({ anchorBlockId: 'block-a' }))
  })
})