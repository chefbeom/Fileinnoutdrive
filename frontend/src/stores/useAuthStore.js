import { defineStore } from 'pinia'
import { ref } from 'vue'
import { logoutSession, reissueAccessToken } from '@/api/authSession.js'
import postApi from '@/api/postApi.js'
import sseApi from '@/api/sseApi.js'

const TOKEN_REFRESH_SKEW_MS = 30 * 1000

export const useAuthStore = defineStore('auth', () => {
  const isLogin = ref(false)
  const user = ref(null)
  const token = ref(null)
  const sseInstance = ref(null)

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

  const clearLocalSession = () => {
    stopSseConnection()
    isLogin.value = false
    user.value = null
    token.value = null
    localStorage.removeItem('USERINFO')
    localStorage.removeItem('ACCESS_TOKEN')
  }

  const applyAccessToken = (accessToken) => {
    if (!accessToken) return false

    const userInfo = decodeToken(accessToken)
    if (!userInfo) return false

    token.value = accessToken
    user.value = userInfo
    isLogin.value = true
    localStorage.setItem('ACCESS_TOKEN', accessToken)
    localStorage.setItem('USERINFO', JSON.stringify(userInfo))

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

  const checkLogin = () => {
    const savedToken = localStorage.getItem('ACCESS_TOKEN')

    if (!savedToken) {
      clearLocalSession()
      return false
    }

    if (applyAccessToken(savedToken)) {
      return true
    }

    clearLocalSession()
    return false
  }

  const refreshSession = async () => {
    try {
      const { accessToken } = await reissueAccessToken()
      return applyAccessToken(accessToken)
    } catch (error) {
      console.error('Session refresh failed:', error)
      return false
    }
  }

  const ensureSession = async () => {
    if (!token.value) {
      checkLogin()
    }

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
    try {
      stopSseConnection()

      if (unsubscribe && (token.value || localStorage.getItem('ACCESS_TOKEN'))) {
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

  const startSseConnection = (userId) => {
    if (sseInstance.value) return

    sseInstance.value = sseApi.connectWorkspaceSse({
      userId,
      onConnect: () => console.log(`[SSE] user ${userId} connected`),
      onTitleUpdated: (updatedData) => {
        window.dispatchEvent(new CustomEvent('sse-title-updated', { detail: updatedData }))
      },
      onError: () => {
        sseInstance.value = null
      },
    })
  }

  const stopSseConnection = () => {
    if (sseInstance.value) {
      sseApi.closeSse(sseInstance.value)
      sseInstance.value = null
    }
  }

  return {
    isLogin,
    user,
    token,
    login,
    setToken,
    checkLogin,
    refreshSession,
    ensureSession,
    logout,
  }
})
