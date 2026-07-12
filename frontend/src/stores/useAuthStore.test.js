import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { logoutSession, refreshAccessToken } from '@/api/authSession.js'
import postApi from '@/api/postApi.js'
import sseApi from '@/api/sseApi.js'
import { useAuthStore } from './useAuthStore.js'

vi.mock('@/api/authSession.js', () => ({
  logoutSession: vi.fn(),
  refreshAccessToken: vi.fn(),
}))

vi.mock('@/api/postApi.js', () => ({
  default: {
    unsubscribeWebPush: vi.fn(),
  },
}))

vi.mock('@/api/sseApi.js', () => ({
  default: {
    connectWorkspaceSse: vi.fn(() => ({ id: 'sse-connection' })),
    closeSse: vi.fn(),
  },
}))

const base64UrlEncode = (value) =>
  Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

const createToken = (payload) =>
  [base64UrlEncode({ alg: 'none', typ: 'JWT' }), base64UrlEncode(payload), 'signature'].join('.')

const futureExp = () => Math.floor(Date.now() / 1000) + 3600
const pastExp = () => Math.floor(Date.now() / 1000) - 3600

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('applies a valid access token, clears legacy storage, and opens SSE', () => {
    const store = useAuthStore()
    const accessToken = createToken({ idx: 7, email: 'user@example.com', exp: futureExp() })
    localStorage.setItem('USERINFO', 'legacy-user')
    localStorage.setItem('ACCESS_TOKEN', 'legacy-token')

    store.login(accessToken)

    expect(store.isLogin).toBe(true)
    expect(store.token).toBe(accessToken)
    expect(store.user).toMatchObject({ idx: 7, email: 'user@example.com' })
    expect(localStorage.getItem('USERINFO')).toBeNull()
    expect(localStorage.getItem('ACCESS_TOKEN')).toBeNull()
    expect(sseApi.connectWorkspaceSse).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        accessToken,
      }),
    )
  })

  it('clears an expired access token during login check and closes SSE', () => {
    const store = useAuthStore()
    store.login(createToken({ idx: 9, email: 'expired@example.com', exp: pastExp() }))

    expect(store.checkLogin()).toBe(false)

    expect(store.isLogin).toBe(false)
    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(sseApi.closeSse).toHaveBeenCalledWith({ id: 'sse-connection' })
  })

  it('refreshes an absent or expired session before clearing local login state', async () => {
    const store = useAuthStore()
    const refreshedToken = createToken({ idx: 11, email: 'refresh@example.com', exp: futureExp() })
    refreshAccessToken.mockResolvedValueOnce({ accessToken: refreshedToken })

    await expect(store.ensureSession()).resolves.toBe(true)

    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(store.isLogin).toBe(true)
    expect(store.token).toBe(refreshedToken)
    expect(store.user).toMatchObject({ idx: 11, email: 'refresh@example.com' })
  })

  it('logs out remotely, unsubscribes push, closes SSE, and clears local state', async () => {
    const store = useAuthStore()
    store.login(createToken({ idx: 13, email: 'logout@example.com', exp: futureExp() }))
    postApi.unsubscribeWebPush.mockResolvedValueOnce({})
    logoutSession.mockResolvedValueOnce({})

    await store.logout()

    expect(postApi.unsubscribeWebPush).toHaveBeenCalledTimes(1)
    expect(logoutSession).toHaveBeenCalledTimes(1)
    expect(sseApi.closeSse).toHaveBeenCalledWith({ id: 'sse-connection' })
    expect(store.isLogin).toBe(false)
    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
  })

  it('routes notifications and workspace events through one SSE connection', () => {
    const notificationListener = vi.fn()
    const messageListener = vi.fn()
    const titleListener = vi.fn()
    const roleListener = vi.fn()
    const previewListener = vi.fn()
    window.addEventListener('sse-notification', notificationListener)
    window.addEventListener('sse-new-message', messageListener)
    window.addEventListener('sse-title-updated', titleListener)
    window.addEventListener('sse-role-changed', roleListener)
    window.addEventListener('sse-chat-preview-update', previewListener)

    try {
      const store = useAuthStore()
      store.login(createToken({ idx: 21, email: 'events@example.com', exp: futureExp() }))

      const options = sseApi.connectWorkspaceSse.mock.calls[0][0]
      options.onNotification({ id: 'notification' })
      options.onNewMessage({ id: 'message' })
      options.onTitleUpdated({ id: 'title' })
      options.onRoleChanged({ id: 'role' })
      options.onChatPreviewUpdated({ id: 'preview' })

      expect(notificationListener).toHaveBeenCalledTimes(2)
      expect(messageListener).toHaveBeenCalledTimes(1)
      expect(titleListener).toHaveBeenCalledTimes(1)
      expect(roleListener).toHaveBeenCalledTimes(1)
      expect(previewListener).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('sse-notification', notificationListener)
      window.removeEventListener('sse-new-message', messageListener)
      window.removeEventListener('sse-title-updated', titleListener)
      window.removeEventListener('sse-role-changed', roleListener)
      window.removeEventListener('sse-chat-preview-update', previewListener)
    }
  })

  it('reuses the connection for the same token and replaces it when the token changes', () => {
    const store = useAuthStore()
    const firstToken = createToken({
      idx: 23,
      email: 'token@example.com',
      exp: futureExp(),
      version: 1,
    })
    const secondToken = createToken({
      idx: 23,
      email: 'token@example.com',
      exp: futureExp(),
      version: 2,
    })

    store.login(firstToken)
    store.setToken(firstToken)

    expect(sseApi.connectWorkspaceSse).toHaveBeenCalledTimes(1)

    store.setToken(secondToken)

    expect(sseApi.closeSse).toHaveBeenCalledWith({ id: 'sse-connection' })
    expect(sseApi.connectWorkspaceSse).toHaveBeenCalledTimes(2)
    expect(sseApi.connectWorkspaceSse).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: 23,
        accessToken: secondToken,
      }),
    )
  })

  it('coalesces reconnect attempts and cancels a pending retry on logout', async () => {
    vi.useFakeTimers()

    try {
      const store = useAuthStore()
      store.login(createToken({ idx: 25, email: 'retry@example.com', exp: futureExp() }))

      const firstOptions = sseApi.connectWorkspaceSse.mock.calls[0][0]
      firstOptions.onError()
      firstOptions.onError()

      vi.advanceTimersByTime(4_999)
      expect(sseApi.connectWorkspaceSse).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(1)
      expect(sseApi.connectWorkspaceSse).toHaveBeenCalledTimes(2)

      const secondOptions = sseApi.connectWorkspaceSse.mock.calls[1][0]
      secondOptions.onError()
      await store.logout({ remote: false, unsubscribe: false })
      vi.runAllTimers()

      expect(sseApi.connectWorkspaceSse).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
