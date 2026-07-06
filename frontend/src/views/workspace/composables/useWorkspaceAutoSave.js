import { unref } from 'vue'

const noop = () => {}

const resolveValue = (value) => {
  if (typeof value === 'function') return value()
  return unref(value)
}

const defaultTimers = {
  setTimeout: (handler, delay) => globalThis.window?.setTimeout?.(handler, delay) ?? globalThis.setTimeout(handler, delay),
  clearTimeout: (timer) => {
    if (globalThis.window?.clearTimeout) {
      globalThis.window.clearTimeout(timer)
      return
    }
    globalThis.clearTimeout(timer)
  },
}

export const useWorkspaceAutoSave = ({
  canEditWorkspace = false,
  isValid = false,
  isEditorLoading = false,
  hasUnsavedChanges = false,
  editorApi = null,
  saveState = null,
  persistWorkspace = noop,
  delay = 1200,
  timers = defaultTimers,
} = {}) => {
  let autoSaveTimer = null

  const clearAutoSaveTimer = () => {
    if (!autoSaveTimer) return false
    timers.clearTimeout(autoSaveTimer)
    autoSaveTimer = null
    return true
  }

  const shouldScheduleAutoSave = () => Boolean(
    resolveValue(canEditWorkspace)
      && resolveValue(isValid)
      && !resolveValue(isEditorLoading)
      && resolveValue(hasUnsavedChanges)
      && resolveValue(editorApi)?.savePost,
  )

  const scheduleAutoSave = () => {
    clearAutoSaveTimer()

    if (!shouldScheduleAutoSave()) return false

    if (saveState && typeof saveState === 'object' && 'value' in saveState) {
      saveState.value = 'dirty'
    }

    autoSaveTimer = timers.setTimeout(() => {
      autoSaveTimer = null
      void persistWorkspace({ navigateNewDocument: true })
    }, delay)

    return true
  }

  const hasAutoSaveTimer = () => Boolean(autoSaveTimer)

  return {
    scheduleAutoSave,
    clearAutoSaveTimer,
    hasAutoSaveTimer,
    shouldScheduleAutoSave,
  }
}
