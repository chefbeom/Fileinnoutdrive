import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useWorkspaceAutoSave } from './useWorkspaceAutoSave.js'

const createTimers = () => {
  let nextTimerId = 1
  const pending = new Map()
  return {
    pending,
    setTimeout: vi.fn((handler, delay) => {
      const id = nextTimerId
      nextTimerId += 1
      pending.set(id, { handler, delay })
      return id
    }),
    clearTimeout: vi.fn((timer) => {
      pending.delete(timer)
    }),
    run: (timer) => {
      const entry = pending.get(timer)
      if (!entry) return
      pending.delete(timer)
      entry.handler()
    },
  }
}

describe('useWorkspaceAutoSave', () => {
  it('schedules dirty autosave when editing is allowed and there are unsaved changes', () => {
    const timers = createTimers()
    const saveState = ref('saved')
    const persistWorkspace = vi.fn()
    const autoSave = useWorkspaceAutoSave({
      canEditWorkspace: ref(true),
      isValid: computed(() => true),
      isEditorLoading: ref(false),
      hasUnsavedChanges: ref(true),
      editorApi: ref({ savePost: vi.fn() }),
      saveState,
      persistWorkspace,
      delay: 900,
      timers,
    })

    expect(autoSave.scheduleAutoSave()).toBe(true)
    expect(saveState.value).toBe('dirty')
    expect(timers.setTimeout).toHaveBeenCalledWith(expect.any(Function), 900)
    expect(autoSave.hasAutoSaveTimer()).toBe(true)

    timers.run(1)

    expect(persistWorkspace).toHaveBeenCalledWith({ navigateNewDocument: true })
    expect(autoSave.hasAutoSaveTimer()).toBe(false)
  })

  it('does not schedule when any editing guard blocks autosave', () => {
    const timers = createTimers()
    const saveState = ref('saved')
    const autoSave = useWorkspaceAutoSave({
      canEditWorkspace: ref(false),
      isValid: ref(true),
      isEditorLoading: ref(false),
      hasUnsavedChanges: ref(true),
      editorApi: ref({ savePost: vi.fn() }),
      saveState,
      timers,
    })

    expect(autoSave.scheduleAutoSave()).toBe(false)
    expect(saveState.value).toBe('saved')
    expect(timers.setTimeout).not.toHaveBeenCalled()
  })

  it('replaces a pending timer on repeated schedule requests', () => {
    const timers = createTimers()
    const persistWorkspace = vi.fn()
    const autoSave = useWorkspaceAutoSave({
      canEditWorkspace: true,
      isValid: true,
      hasUnsavedChanges: true,
      editorApi: { savePost: vi.fn() },
      persistWorkspace,
      timers,
    })

    expect(autoSave.scheduleAutoSave()).toBe(true)
    expect(autoSave.scheduleAutoSave()).toBe(true)

    expect(timers.clearTimeout).toHaveBeenCalledWith(1)
    expect(timers.pending.has(1)).toBe(false)
    expect(timers.pending.has(2)).toBe(true)

    timers.run(2)

    expect(persistWorkspace).toHaveBeenCalledTimes(1)
  })

  it('clears a pending autosave timer without persisting', () => {
    const timers = createTimers()
    const persistWorkspace = vi.fn()
    const autoSave = useWorkspaceAutoSave({
      canEditWorkspace: true,
      isValid: true,
      hasUnsavedChanges: true,
      editorApi: { savePost: vi.fn() },
      persistWorkspace,
      timers,
    })

    autoSave.scheduleAutoSave()

    expect(autoSave.clearAutoSaveTimer()).toBe(true)
    expect(autoSave.clearAutoSaveTimer()).toBe(false)
    expect(timers.pending.size).toBe(0)
    expect(persistWorkspace).not.toHaveBeenCalled()
  })
})
