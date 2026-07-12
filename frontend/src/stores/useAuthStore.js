import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { logoutSession, refreshAccessToken } from '@/api/authSession.js'
import postApi from '@/api/postApi.js'
import sseApi from '@/api/sseApi.js'

const TOKEN_REFRESH_SKEW_MS = 30 * 1000
const SSE_RECONNECT_DELAY_MS = 5 * 1000
const LEGACY_SESSION_KEYS = ['USERINFO', 'ACCESS_TOKEN']

export const useAuthStore = defineStore('auth', () => {
  const isLogin = ref(false)
  const user = ref(null)
  const token = ref(null)
  const sseInstance = shallowRef(null)
  let sseReconnectTimer = null
  let sseConnectionVersion = 0
  let activeSseUserId = null
  let activeSseAccessToken = null

  const dispatchSseEvent = (eventName, detail) => {
    globalThis.window?.dispatchEvent(new CustomEvent(eventName, { detail }))
  }

  const clearSseReconnectTimer = () => {
    if (sseReconnectTimer == null) return
    globalThis.clearTimeout(sseReconnectTimer)
    sseReconnectTimer = null
  }

  const stopSseConnection = () => {
    sseConnectionVersion += 1
    clearSseReconnectTimer()

    const activeConnection = sseInstance.value
    sseInstance.value = null
    activeSseUserId = null
    activeSseAccessToken = null

    if (activeConnection) {
      sseApi.closeSse(activeConnection)
    }
  }

  const scheduleSseReconnect = (userId, accessToken, connectionVersion) => {
    clearSseReconnectTimer()
    sseReconnectTimer = globalThis.setTimeout(() => {
      sseReconnectTimer = null
      if (connectionVersion !== sseConnectionVersion) return
      if (user.value?.idx !== userId || token.value !== accessToken) return
      startSseConnection(userId)
    }, SSE_RECONNECT_DELAY_MS)
  }

  const startSseConnection = (userId) => {
    const accessToken = token.value
    if (!userId || !accessToken) {
      stopSseConnection()
      return
    }

    if (sseInstance.value && activeSseUserId === userId && activeSseAccessToken === accessToken) {
      return
    }

    stopSseConnection()
    const connectionVersion = sseConnectionVersion
    activeSseUserId = userId
    activeSseAccessToken = accessToken

    sseInstance.value = sseApi.connectWorkspaceSse({
      userId,
      accessToken,
      onConnect: () => {
        if (import.meta.env.DEV) console.debug('[SSE] user ' + userId + ' connected')
      },
      onNotification: (payload) => dispatchSseEvent('sse-notification', payload),
      onNewMessage: (payload) => {
        dispatchSseEvent('sse-notification', payload)
        dispatchSseEvent('sse-new-message', payload)
      },
      onTitleUpdated: (payload) => dispatchSseEvent('sse-title-updated', payload),
      onRoleChanged: (payload) => dispatchSseEvent('sse-role-changed', payload),
      onChatPreviewUpdated: (payload) => dispatchSseEvent('sse-chat-preview-update', payload),
      onError: () => {
        if (connectionVersion !== sseConnectionVersion) return
        sseInstance.value = null
        activeSseUserId = null
        activeSseAccessToken = null
        scheduleSseReconnect(userId, accessToken, connectionVersion)
      },
    })
  }

  const decodeToken = (tokenStr) => {
    try {
      const payload = tokenStr.split('.')[1]
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
      const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
      const decoded = new TextDecoder().decode(bytes)
      return JSON.parse(decoded)
    } catch (error) {
      console.error('Token decode failed:', error)
      return null
    }
  }

  const isAccessTokenExpired = (accessToken) => {
    const decoded = decodeToken(accessToken)
    if (!decoded) return true
    if (!decoded.exp) return false
    return decoded.exp * 1000 <= Date.now() + TOKEN_REFRESH_SKEW_MS
  }

  const clearLegacyLocalSession = () => {
    for (const key of LEGACY_SESSION_KEYS) {
      localStorage.removeItem(key)
    }
  }

  const clearLocalSession = () => {
    stopSseConnection()
    isLogin.value = false
    user.value = null
    token.value = null
    clearLegacyLocalSession()
  }

  const applyAccessToken = (accessToken) => {
    if (!accessToken) return false

    const userInfo = decodeToken(accessToken)
    if (!userInfo) return false

    token.value = accessToken
    user.value = userInfo
    isLogin.value = true
    clearLegacyLocalSession()

    if (userInfo.idx) {
      startSseConnection(userInfo.idx)
    }

    return true
  }

  const login = (accessToken) => {
    applyAccessToken(accessToken)
  }

  const setToken = (newAccessToken) => {
    applyAccessToken(newAccessToken)
  }

  const setUser = (nextUser) => {
    user.value = nextUser || null
    isLogin.value = Boolean(user.value && token.value)
  }

  const checkLogin = () => {
    clearLegacyLocalSession()

    if (!token.value) {
      isLogin.value = false
      user.value = null
      stopSseConnection()
      return false
    }

    if (isAccessTokenExpired(token.value)) {
      clearLocalSession()
      return false
    }

    return true
  }

  const refreshSession = async () => {
    try {
      const { accessToken } = await refreshAccessToken()
      return applyAccessToken(accessToken)
    } catch (error) {
      console.error('Session refresh failed:', error)
      return false
    }
  }

  const ensureSession = async () => {
    if (token.value && !isAccessTokenExpired(token.value)) {
      return true
    }

    if (await refreshSession()) {
      return true
    }

    clearLocalSession()
    return false
  }

  const logout = async ({ remote = true, unsubscribe = true } = {}) => {
    const hadToken = Boolean(token.value)

    try {
      stopSseConnection()

      if (unsubscribe && hadToken) {
        try {
          await postApi.unsubscribeWebPush()
        } catch (error) {
          console.error('Push unsubscribe failed:', error)
        }
      }

      if (remote) {
        await logoutSession()
      }
    } catch (error) {
      console.error('Logout API failed:', error)
    } finally {
      clearLocalSession()
    }
  }

  return {
    isLogin,
    user,
    token,
    login,
    setToken,
    setUser,
    checkLogin,
    refreshSession,
    ensureSession,
    logout,
  }
})
