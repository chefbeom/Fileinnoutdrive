import {
  createCursorPresenceFields,
  createHiddenCursorPresenceFields,
} from './editorPresenceEvents.js'

const defaultRequestFrame = (windowRef) => {
  if (windowRef && typeof windowRef.requestAnimationFrame === 'function') {
    return windowRef.requestAnimationFrame.bind(windowRef)
  }
  return (callback) => {
    callback()
    return null
  }
}

const defaultCancelFrame = (windowRef) => {
  if (windowRef && typeof windowRef.cancelAnimationFrame === 'function') {
    return windowRef.cancelAnimationFrame.bind(windowRef)
  }
  return () => {}
}

export const createEditorPresenceController = ({
  isPrivate = false,
  awareness = null,
  cursorSurface = null,
  holderElement = null,
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null,
  nowIso = () => new Date().toISOString(),
  markPresenceActive = () => {},
  markPresenceAway = () => {},
  requestAnimationFrameImpl = defaultRequestFrame(windowRef),
  cancelAnimationFrameImpl = defaultCancelFrame(windowRef),
  logger = console,
} = {}) => {
  let animationFrameId = null
  let bound = false

  const addEvent = (target, type, handler) => {
    target?.addEventListener?.(type, handler)
  }

  const removeEvent = (target, type, handler) => {
    target?.removeEventListener?.(type, handler)
  }

  function handleMouseMove(event) {
    if (animationFrameId || !awareness || !cursorSurface) return
    animationFrameId = requestAnimationFrameImpl(() => {
      const presence = createCursorPresenceFields({
        clientX: event.clientX,
        clientY: event.clientY,
        rect: cursorSurface.getBoundingClientRect(),
        activeAt: nowIso(),
      })
      if (!presence) {
        animationFrameId = null
        return
      }
      if (presence.state === 'active') {
        markPresenceActive(presence.fields)
      } else {
        markPresenceAway(presence.fields)
      }
      animationFrameId = null
    })
  }

  function handleMouseLeave() {
    markPresenceAway(createHiddenCursorPresenceFields({ activeAt: nowIso() }))
  }

  function handleWindowFocus() {
    markPresenceActive({ presence: { reason: 'focus' } })
  }

  function handleWindowBlur() {
    markPresenceAway(createHiddenCursorPresenceFields({ activeAt: nowIso(), reason: 'blur' }))
  }

  function handleVisibilityChange() {
    if (documentRef?.hidden) {
      markPresenceAway(createHiddenCursorPresenceFields({ activeAt: nowIso(), reason: 'hidden' }))
      return
    }
    markPresenceActive({ presence: { reason: 'visible' } })
  }

  function handlePresenceActivity() {
    markPresenceActive({ presence: { reason: 'activity' } })
  }

  function handleBeforeUnloadPresence() {
    markPresenceAway(createHiddenCursorPresenceFields({ activeAt: nowIso(), reason: 'unload' }))
    try {
      awareness?.setLocalState?.(null)
    } catch (error) {
      logger?.warn?.('[Editor] awareness cleanup failed', error)
    }
  }

  if (!isPrivate && cursorSurface && holderElement && documentRef && windowRef) {
    addEvent(cursorSurface, 'mousemove', handleMouseMove)
    addEvent(cursorSurface, 'mouseleave', handleMouseLeave)
    addEvent(cursorSurface, 'click', handlePresenceActivity)
    addEvent(holderElement, 'keydown', handlePresenceActivity)
    addEvent(windowRef, 'focus', handleWindowFocus)
    addEvent(windowRef, 'blur', handleWindowBlur)
    addEvent(documentRef, 'visibilitychange', handleVisibilityChange)
    addEvent(windowRef, 'beforeunload', handleBeforeUnloadPresence)
    bound = true
  }

  const destroy = () => {
    if (animationFrameId) {
      cancelAnimationFrameImpl(animationFrameId)
      animationFrameId = null
    }
    if (!bound) return
    removeEvent(cursorSurface, 'mousemove', handleMouseMove)
    removeEvent(cursorSurface, 'mouseleave', handleMouseLeave)
    removeEvent(cursorSurface, 'click', handlePresenceActivity)
    removeEvent(holderElement, 'keydown', handlePresenceActivity)
    removeEvent(windowRef, 'focus', handleWindowFocus)
    removeEvent(windowRef, 'blur', handleWindowBlur)
    removeEvent(documentRef, 'visibilitychange', handleVisibilityChange)
    removeEvent(windowRef, 'beforeunload', handleBeforeUnloadPresence)
    bound = false
  }

  return {
    destroy,
  }
}
