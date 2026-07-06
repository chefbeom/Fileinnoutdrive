import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_WORKSPACE_LEAVE_WARNING_MESSAGE,
  useWorkspaceLeaveGuard,
} from './useWorkspaceLeaveGuard.js'

describe('useWorkspaceLeaveGuard', () => {
  it('allows navigation without prompting when there are no unsaved changes', () => {
    const confirmFn = vi.fn()
    const guard = useWorkspaceLeaveGuard({ hasUnsavedChanges: ref(false), confirmFn })

    expect(guard.confirmDiscardIfNeeded()).toBe(true)
    expect(guard.handleRouteLeave()).toBe(true)
    expect(confirmFn).not.toHaveBeenCalled()
  })

  it('prompts for unsaved route changes and returns the confirm result', () => {
    const dirty = ref(true)
    const confirmFn = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    const guard = useWorkspaceLeaveGuard({ hasUnsavedChanges: computed(() => dirty.value), confirmFn })

    expect(guard.handleRouteLeave()).toBe(false)
    expect(guard.handleRouteUpdate()).toBe(true)
    expect(confirmFn).toHaveBeenCalledWith(DEFAULT_WORKSPACE_LEAVE_WARNING_MESSAGE)
  })

  it('allows one explicit route leave and then restores prompting', () => {
    const confirmFn = vi.fn().mockReturnValue(false)
    const guard = useWorkspaceLeaveGuard({ hasUnsavedChanges: true, confirmFn })

    guard.allowNextRouteLeave()

    expect(guard.handleRouteLeave()).toBe(true)
    expect(guard.allowRouteLeaveOnce.value).toBe(false)
    expect(guard.handleRouteLeave()).toBe(false)
  })

  it('handles beforeunload bypass and unsaved warning events', () => {
    const event = { preventDefault: vi.fn(), returnValue: undefined }
    const guard = useWorkspaceLeaveGuard({ hasUnsavedChanges: () => true, warningMessage: 'leave?' })

    guard.allowNextWindowUnload()
    expect(guard.handleBeforeUnload(event)).toBeUndefined()
    expect(event.preventDefault).not.toHaveBeenCalled()

    expect(guard.handleBeforeUnload(event)).toBe('leave?')
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.returnValue).toBe('leave?')
  })

  it('resets explicit bypass flags', () => {
    const guard = useWorkspaceLeaveGuard()

    guard.allowNextRouteLeave()
    guard.allowNextWindowUnload()
    guard.resetLeaveGuardBypass()

    expect(guard.allowRouteLeaveOnce.value).toBe(false)
    expect(guard.allowWindowUnloadOnce.value).toBe(false)
  })
})
