import { describe, expect, it, vi } from 'vitest'

import { createEditorPresenceController } from './editorPresenceController.js'

const createEventTarget = ({ rect = { left: 0, top: 0, width: 100, height: 100 }, hidden = false } = {}) => {
  const listeners = new Map()
  const target = {
    hidden,
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
    getBoundingClientRect() {
      return rect
    },
  }
  return target
}

describe('editorPresenceController', () => {
  it('binds cursor and activity events for shared workspaces', () => {
    const cursorSurface = createEventTarget({ rect: { left: 100, top: 50, width: 200, height: 100 } })
    const holderElement = createEventTarget()
    const windowRef = createEventTarget()
    const documentRef = createEventTarget()
    const markPresenceActive = vi.fn()
    const markPresenceAway = vi.fn()
    const awareness = { setLocalState: vi.fn() }
    let tick = 0

    const controller = createEditorPresenceController({
      awareness,
      cursorSurface,
      holderElement,
      windowRef,
      documentRef,
      nowIso: () => `t${++tick}`,
      markPresenceActive,
      markPresenceAway,
      requestAnimationFrameImpl: (callback) => {
        callback()
        return 1
      },
      cancelAnimationFrameImpl: vi.fn(),
    })

    cursorSurface.emit('mousemove', { clientX: 150, clientY: 80 })
    expect(markPresenceActive).toHaveBeenCalledWith({
      mouse: { x: 25, y: 30, visible: true, lastActiveAt: 't1' },
      presence: { reason: 'cursor' },
    })

    cursorSurface.emit('mouseleave')
    expect(markPresenceAway).toHaveBeenCalledWith({
      mouse: { visible: false, lastActiveAt: 't2' },
    })

    holderElement.emit('keydown')
    expect(markPresenceActive).toHaveBeenLastCalledWith({ presence: { reason: 'activity' } })

    windowRef.emit('beforeunload')
    expect(markPresenceAway).toHaveBeenLastCalledWith({
      mouse: { visible: false, lastActiveAt: 't3' },
      presence: { reason: 'unload' },
    })
    expect(awareness.setLocalState).toHaveBeenCalledWith(null)

    controller.destroy()
    expect(cursorSurface.count('mousemove')).toBe(0)
    expect(windowRef.count('beforeunload')).toBe(0)
  })

  it('marks hidden documents away and visible documents active', () => {
    const cursorSurface = createEventTarget()
    const holderElement = createEventTarget()
    const windowRef = createEventTarget()
    const documentRef = createEventTarget({ hidden: true })
    const markPresenceActive = vi.fn()
    const markPresenceAway = vi.fn()

    createEditorPresenceController({
      awareness: {},
      cursorSurface,
      holderElement,
      windowRef,
      documentRef,
      nowIso: () => 'now',
      markPresenceActive,
      markPresenceAway,
    })

    documentRef.emit('visibilitychange')
    expect(markPresenceAway).toHaveBeenCalledWith({
      mouse: { visible: false, lastActiveAt: 'now' },
      presence: { reason: 'hidden' },
    })

    documentRef.hidden = false
    documentRef.emit('visibilitychange')
    expect(markPresenceActive).toHaveBeenCalledWith({ presence: { reason: 'visible' } })
  })

  it('does not bind presence events for private workspaces', () => {
    const cursorSurface = createEventTarget()
    const holderElement = createEventTarget()
    const windowRef = createEventTarget()
    const documentRef = createEventTarget()

    const controller = createEditorPresenceController({
      isPrivate: true,
      awareness: {},
      cursorSurface,
      holderElement,
      windowRef,
      documentRef,
    })

    expect(cursorSurface.count('mousemove')).toBe(0)
    expect(holderElement.count('keydown')).toBe(0)
    controller.destroy()
  })
})
