import { ref, unref } from 'vue'

export const DEFAULT_WORKSPACE_LEAVE_WARNING_MESSAGE = '현재 페이지를 나가시겠습니까? 저장하지 않은 페이지는 모두 사라집니다.'

const defaultConfirm = (message) => {
  if (typeof globalThis.window?.confirm === 'function') {
    return globalThis.window.confirm(message)
  }
  return true
}

export const useWorkspaceLeaveGuard = ({
  hasUnsavedChanges = false,
  warningMessage = DEFAULT_WORKSPACE_LEAVE_WARNING_MESSAGE,
  confirmFn = defaultConfirm,
} = {}) => {
  const allowRouteLeaveOnce = ref(false)
  const allowWindowUnloadOnce = ref(false)

  const hasPendingChanges = () => Boolean(
    typeof hasUnsavedChanges === 'function'
      ? hasUnsavedChanges()
      : unref(hasUnsavedChanges),
  )

  const confirmDiscardIfNeeded = () =>
    !hasPendingChanges() || Boolean(confirmFn(warningMessage))

  const allowNextRouteLeave = () => {
    allowRouteLeaveOnce.value = true
  }

  const allowNextWindowUnload = () => {
    allowWindowUnloadOnce.value = true
  }

  const resetLeaveGuardBypass = () => {
    allowRouteLeaveOnce.value = false
    allowWindowUnloadOnce.value = false
  }

  const handleBeforeUnload = (event) => {
    if (allowWindowUnloadOnce.value) {
      allowWindowUnloadOnce.value = false
      return undefined
    }

    if (!hasPendingChanges()) return undefined

    event?.preventDefault?.()
    if (event) event.returnValue = warningMessage
    return warningMessage
  }

  const handleRouteLeave = () => {
    if (allowRouteLeaveOnce.value) {
      allowRouteLeaveOnce.value = false
      return true
    }

    return confirmDiscardIfNeeded()
  }

  return {
    allowRouteLeaveOnce,
    allowWindowUnloadOnce,
    confirmDiscardIfNeeded,
    allowNextRouteLeave,
    allowNextWindowUnload,
    resetLeaveGuardBypass,
    handleBeforeUnload,
    handleRouteLeave,
    handleRouteUpdate: handleRouteLeave,
  }
}
