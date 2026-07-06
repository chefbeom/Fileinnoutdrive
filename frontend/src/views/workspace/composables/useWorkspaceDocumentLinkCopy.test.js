import { describe, expect, it, vi } from 'vitest'

import { useWorkspaceDocumentLinkCopy } from './useWorkspaceDocumentLinkCopy.js'

const createTimerHarness = () => {
  const timers = []
  return {
    timers,
    setTimeoutFn: vi.fn((callback, timeout) => {
      const timer = { callback, timeout, cleared: false }
      timers.push(timer)
      return timer
    }),
    clearTimeoutFn: vi.fn((timer) => {
      timer.cleared = true
    }),
  }
}

describe('useWorkspaceDocumentLinkCopy', () => {
  it('tracks the copied document id and resets it after the delay', () => {
    const harness = createTimerHarness()
    const copy = useWorkspaceDocumentLinkCopy(harness)

    copy.markWorkspaceDocumentLinkCopied({ id: 'page 1' })

    expect(copy.workspaceDocumentLinkCopiedId.value).toBe('page 1')
    expect(copy.isWorkspaceDocumentLinkCopied({ id: 'page 1' })).toBe(true)
    expect(copy.isWorkspaceDocumentLinkCopied({ id: 'page 2' })).toBe(false)
    expect(harness.setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 1800)

    harness.timers[0].callback()

    expect(copy.workspaceDocumentLinkCopiedId.value).toBe('')
    expect(copy.isWorkspaceDocumentLinkCopied({ id: 'page 1' })).toBe(false)
  })

  it('replaces an active copied marker and clears the previous timer', () => {
    const harness = createTimerHarness()
    const copy = useWorkspaceDocumentLinkCopy(harness)

    copy.markWorkspaceDocumentLinkCopied({ id: 'first' })
    copy.markWorkspaceDocumentLinkCopied({ post_idx: 2 })

    expect(harness.clearTimeoutFn).toHaveBeenCalledWith(harness.timers[0])
    expect(copy.workspaceDocumentLinkCopiedId.value).toBe('2')
    expect(copy.isWorkspaceDocumentLinkCopied({ id: 2 })).toBe(true)
  })

  it('supports custom document ids and explicit clearing', () => {
    const harness = createTimerHarness()
    const copy = useWorkspaceDocumentLinkCopy({
      ...harness,
      documentIdFor: (document) => document?.uuid,
      resetDelayMs: 0,
    })

    copy.markWorkspaceDocumentLinkCopied({ uuid: 'abc' })

    expect(copy.workspaceDocumentLinkCopiedId.value).toBe('abc')
    expect(harness.setTimeoutFn).not.toHaveBeenCalled()

    copy.clearWorkspaceDocumentLinkCopied()

    expect(copy.workspaceDocumentLinkCopiedId.value).toBe('')
  })
})
