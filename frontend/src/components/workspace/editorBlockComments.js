import { blockAnchorFromSnapshot } from './editorDocumentAnalysis.js'

export const COMMENTED_BLOCK_CLASS = 'workspace-block-has-comments'
export const COMMENT_BADGE_CLASS = 'workspace-block-comment-badge'

export const createBlockCommentSummaryMap = (summaries = []) => new Map(
  (Array.isArray(summaries) ? summaries : [])
    .filter((summary) => summary?.anchorBlockId && Number(summary.count || 0) > 0)
    .map((summary) => [String(summary.anchorBlockId), summary]),
)

export const clearBlockCommentDecorations = (holderElement) => {
  if (!holderElement?.querySelectorAll) return

  holderElement
    .querySelectorAll(`.${COMMENTED_BLOCK_CLASS}`)
    .forEach((block) => block.classList.remove(COMMENTED_BLOCK_CLASS))
  holderElement
    .querySelectorAll(`.${COMMENT_BADGE_CLASS}`)
    .forEach((badge) => badge.remove())
}

export const createBlockCommentBadge = ({ count, anchor, onSelectAnchor, onBadgeClick }) => {
  const badge = document.createElement('button')
  badge.type = 'button'
  badge.className = COMMENT_BADGE_CLASS
  badge.title = `${count}개의 미해결 댓글`
  badge.setAttribute('aria-label', `${count}개의 미해결 댓글 보기`)
  badge.textContent = String(count)
  badge.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (typeof onSelectAnchor === 'function') {
      onSelectAnchor(anchor)
    }
    if (typeof onBadgeClick === 'function') {
      onBadgeClick(anchor)
    }
  })
  return badge
}

export const applyBlockCommentDecorationsToHolder = ({
  holderElement,
  blocks = [],
  summaryMap = new Map(),
  onSelectAnchor,
  onBadgeClick,
} = {}) => {
  if (!holderElement?.querySelectorAll || !summaryMap?.size) return 0

  const blockHolders = Array.from(holderElement.querySelectorAll('.ce-block'))
  let decoratedCount = 0

  ;(Array.isArray(blocks) ? blocks : []).forEach((block, index) => {
    const anchor = blockAnchorFromSnapshot(block, index)
    const summary = summaryMap.get(String(anchor?.anchorBlockId || ''))
    const count = Number(summary?.count || 0)
    if (!anchor || count <= 0) return

    const blockHolder = blockHolders[index]
    if (!blockHolder) return

    blockHolder.classList.add(COMMENTED_BLOCK_CLASS)
    blockHolder.appendChild(createBlockCommentBadge({ count, anchor, onSelectAnchor, onBadgeClick }))
    decoratedCount += 1
  })

  return decoratedCount
}