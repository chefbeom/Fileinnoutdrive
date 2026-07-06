import { describe, expect, it, vi } from 'vitest'

import { useWorkspaceNotice } from './useWorkspaceNotice.js'

const createNoticeHarness = () => {
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

describe('useWorkspaceNotice', () => {
  it('shows, replaces, times out, and closes notices', () => {
    const harness = createNoticeHarness()
    const notice = useWorkspaceNotice({
      ...harness,
      createNoticeId: () => 'notice-id',
    })

    notice.showWorkspaceNotice('  저장했습니다  ', 'success', { timeout: 1200 })

    expect(notice.workspaceNotice.value).toMatchObject({
      id: 'notice-id',
      type: 'success',
      message: '저장했습니다',
      actionLabel: '',
    })
    expect(harness.setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 1200)

    notice.showWorkspaceNotice('다음 알림', 'info', { timeout: 0 })

    expect(harness.clearTimeoutFn).toHaveBeenCalledWith(harness.timers[0])
    expect(notice.workspaceNotice.value.message).toBe('다음 알림')

    notice.closeWorkspaceNotice()

    expect(notice.workspaceNotice.value).toBeNull()
  })

  it('runs notice actions and ignores blank notices', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined)
    const notice = useWorkspaceNotice({ createNoticeId: () => 'notice-id' })

    notice.showWorkspaceNotice('   ')
    expect(notice.workspaceNotice.value).toBeNull()

    notice.showWorkspaceNotice('실행', 'info', { timeout: 0, actionLabel: '열기', onAction })
    await notice.runWorkspaceNoticeAction()

    expect(onAction).toHaveBeenCalledOnce()
    expect(notice.workspaceNotice.value).toBeNull()
  })

  it('requests, confirms, closes, and reports failed confirmations', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const notice = useWorkspaceNotice({ createNoticeId: () => 'notice-id' })

    notice.requestWorkspaceConfirm({ title: '삭제', message: '삭제할까요?', tone: 'danger', onConfirm })

    expect(notice.workspaceConfirm.value).toMatchObject({ title: '삭제', tone: 'danger', loading: false })

    await notice.confirmWorkspaceAction()

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(notice.workspaceConfirm.value).toBeNull()

    const failedConfirm = vi.fn().mockRejectedValue(new Error('권한이 없습니다'))
    notice.requestWorkspaceConfirm({ onConfirm: failedConfirm })

    const confirmPromise = notice.confirmWorkspaceAction()
    expect(notice.workspaceConfirm.value.loading).toBe(true)
    await confirmPromise

    expect(notice.workspaceConfirm.value.loading).toBe(false)
    expect(notice.workspaceNotice.value).toMatchObject({ type: 'error', message: '권한이 없습니다' })

    notice.closeWorkspaceConfirm()
    expect(notice.workspaceConfirm.value).toBeNull()
  })
})
