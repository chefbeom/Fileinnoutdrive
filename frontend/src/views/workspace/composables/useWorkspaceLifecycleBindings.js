import { onBeforeUnmount, onMounted } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

const noop = () => {}

const resolveWindowTarget = (windowTarget) => (
  typeof windowTarget === 'function' ? windowTarget() : windowTarget
)

export const normalizeWorkspaceWindowEvents = (events = []) => (
  Array.isArray(events)
    ? events.filter((event) => event?.type && typeof event.handler === 'function')
    : []
)

export const registerWorkspaceWindowEvents = (windowTarget, events = []) => {
  const target = resolveWindowTarget(windowTarget)
  const normalizedEvents = normalizeWorkspaceWindowEvents(events)

  normalizedEvents.forEach(({ type, handler, options }) => {
    target?.addEventListener?.(type, handler, options)
  })

  return () => {
    normalizedEvents.forEach(({ type, handler, options }) => {
      target?.removeEventListener?.(type, handler, options)
    })
  }
}

export const useWorkspaceLifecycleBindings = ({
  routeLeaveHandler = noop,
  routeUpdateHandler = routeLeaveHandler,
  windowEvents = [],
  windowTarget = () => globalThis.window,
  onMountedHook = onMounted,
  onBeforeUnmountHook = onBeforeUnmount,
  onBeforeRouteLeaveHook = onBeforeRouteLeave,
  onBeforeRouteUpdateHook = onBeforeRouteUpdate,
} = {}) => {
  onBeforeRouteLeaveHook(routeLeaveHandler)
  onBeforeRouteUpdateHook(routeUpdateHandler)

  let cleanupWindowEvents = noop

  onMountedHook(() => {
    cleanupWindowEvents = registerWorkspaceWindowEvents(windowTarget, windowEvents)
  })

  onBeforeUnmountHook(() => {
    cleanupWindowEvents()
    cleanupWindowEvents = noop
  })

  return {
    cleanupWindowEvents: () => cleanupWindowEvents(),
  }
}
