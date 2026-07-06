import { ref } from 'vue'

const defaultNoticeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

export const useWorkspaceNotice = ({
  setTimeoutFn = globalThis.window?.setTimeout ?? globalThis.setTimeout,
  clearTimeoutFn = globalThis.window?.clearTimeout ?? globalThis.clearTimeout,
  createNoticeId = defaultNoticeId,
} = {}) => {
  const workspaceNotice = ref(null)
  const workspaceConfirm = ref(null)
  let workspaceNoticeTimer = null

  const clearWorkspaceNoticeTimer = () => {
    if (!workspaceNoticeTimer) return
    clearTimeoutFn?.(workspaceNoticeTimer)
    workspaceNoticeTimer = null
  }

  const closeWorkspaceNotice = () => {
    clearWorkspaceNoticeTimer()
    workspaceNotice.value = null
  }

  const showWorkspaceNotice = (
    message,
    type = 'info',
    { timeout = 3600, actionLabel = '', onAction = null } = {},
  ) => {
    const text = String(message || '').trim()
    if (!text) return

    clearWorkspaceNoticeTimer()
    workspaceNotice.value = {
      id: createNoticeId(),
      type,
      message: text,
      actionLabel: String(actionLabel || '').trim(),
      onAction: typeof onAction === 'function' ? onAction : null,
    }

    if (timeout > 0 && typeof setTimeoutFn === 'function') {
      workspaceNoticeTimer = setTimeoutFn(() => {
        workspaceNotice.value = null
        workspaceNoticeTimer = null
      }, timeout)
    }
  }

  const runWorkspaceNoticeAction = async () => {
    const notice = workspaceNotice.value
    if (typeof notice?.onAction === 'function') {
      await notice.onAction()
    }
    closeWorkspaceNotice()
  }

  const closeWorkspaceConfirm = () => {
    workspaceConfirm.value = null
  }

  const requestWorkspaceConfirm = ({
    title = '확인이 필요합니다',
    message = '',
    confirmLabel = '확인',
    cancelLabel = '취소',
    tone = 'warn',
    onConfirm = null,
  } = {}) => {
    workspaceConfirm.value = {
      title,
      message,
      confirmLabel,
      cancelLabel,
      tone,
      onConfirm,
      loading: false,
    }
  }

  const confirmWorkspaceAction = async () => {
    const pending = workspaceConfirm.value
    if (!pending || pending.loading) return
    if (typeof pending.onConfirm !== 'function') {
      closeWorkspaceConfirm()
      return
    }

    workspaceConfirm.value = { ...pending, loading: true }
    try {
      await pending.onConfirm()
      closeWorkspaceConfirm()
    } catch (error) {
      workspaceConfirm.value = { ...pending, loading: false }
      showWorkspaceNotice(error?.message || '요청한 작업을 완료하지 못했습니다.', 'error')
    }
  }

  return {
    workspaceNotice,
    workspaceConfirm,
    clearWorkspaceNoticeTimer,
    closeWorkspaceNotice,
    showWorkspaceNotice,
    runWorkspaceNoticeAction,
    closeWorkspaceConfirm,
    requestWorkspaceConfirm,
    confirmWorkspaceAction,
  }
}
