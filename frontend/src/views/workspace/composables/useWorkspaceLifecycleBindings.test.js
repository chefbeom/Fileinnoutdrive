import { describe, expect, it, vi } from 'vitest'

import {
  normalizeWorkspaceWindowEvents,
  registerWorkspaceWindowEvents,
  useWorkspaceLifecycleBindings,
} from './useWorkspaceLifecycleBindings.js'

describe('useWorkspaceLifecycleBindings', () => {
  it('normalizes invalid window event bindings away', () => {
    const handler = vi.fn()

    expect(normalizeWorkspaceWindowEvents([
      { type: 'click', handler },
      { type: '', handler },
      { type: 'keydown' },
      null,
    ])).toEqual([{ type: 'click', handler }])
  })

  it('registers and removes window event bindings symmetrically', () => {
    const target = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const click = vi.fn()
    const keydown = vi.fn()
    const options = { capture: true }

    const cleanup = registerWorkspaceWindowEvents(target, [
      { type: 'click', handler: click },
      { type: 'keydown', handler: keydown, options },
    ])

    expect(target.addEventListener).toHaveBeenCalledWith('click', click, undefined)
    expect(target.addEventListener).toHaveBeenCalledWith('keydown', keydown, options)

    cleanup()

    expect(target.removeEventListener).toHaveBeenCalledWith('click', click, undefined)
    expect(target.removeEventListener).toHaveBeenCalledWith('keydown', keydown, options)
  })

  it('wires route guards and lifecycle window cleanup hooks', () => {
    const mountedCallbacks = []
    const unmountCallbacks = []
    const routeLeaveHandler = vi.fn()
    const routeUpdateHandler = vi.fn()
    const onBeforeRouteLeaveHook = vi.fn()
    const onBeforeRouteUpdateHook = vi.fn()
    const target = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const handler = vi.fn()

    useWorkspaceLifecycleBindings({
      routeLeaveHandler,
      routeUpdateHandler,
      windowTarget: target,
      windowEvents: [{ type: 'beforeunload', handler }],
      onMountedHook: (callback) => mountedCallbacks.push(callback),
      onBeforeUnmountHook: (callback) => unmountCallbacks.push(callback),
      onBeforeRouteLeaveHook,
      onBeforeRouteUpdateHook,
    })

    expect(onBeforeRouteLeaveHook).toHaveBeenCalledWith(routeLeaveHandler)
    expect(onBeforeRouteUpdateHook).toHaveBeenCalledWith(routeUpdateHandler)
    expect(target.addEventListener).not.toHaveBeenCalled()

    mountedCallbacks[0]()
    expect(target.addEventListener).toHaveBeenCalledWith('beforeunload', handler, undefined)

    unmountCallbacks[0]()
    expect(target.removeEventListener).toHaveBeenCalledWith('beforeunload', handler, undefined)
  })
})
