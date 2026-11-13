import axios from 'axios'
import { refreshAccessToken } from '@/api/authSession.js'
import { useAuthStore } from '@/stores/useAuthStore.js'
import { getSecretFolderTokensHeader, getSecretVaultToken } from '@/stores/secretSessionHeaders.js'
import { API_BASE_URL } from '@/utils/backendUrl.js'

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 20000,
})

const IDEMPOTENT_METHODS = new Set(['get', 'head', 'options'])
const TRANSIENT_STATUS_CODES = new Set([502, 503, 504])

const isAuthLifecycleRequest = (config = {}) => {
  const url = String(config.url || '')
  return url.includes('/auth/reissue') || url.includes('/auth/logout')
}

const isTransientIdempotentFailure = (error, config = {}) => {
  if (!config || config._transientRetry || isAuthLifecycleRequest(config)) {
    return false
  }
  if (axios.isCancel?.(error) || error?.code === 'ERR_CANCELED') {
    return false
  }
  const method = String(config.method || 'get').toLowerCase()
  if (!IDEMPOTENT_METHODS.has(method)) {
    return false
  }
  const status = error?.response?.status
  if (status && TRANSIENT_STATUS_CODES.has(status)) {
    return true
  }
  return (
    !error?.response &&
    (error?.code === 'ECONNABORTED' ||
      error?.code === 'ERR_NETWORK' ||
      error?.code === 'ETIMEDOUT')
  )
}

const waitMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

api.interceptors.request.use(
  (config) => {
    const authStore = useAuthStore()
    const token = authStore.token
    config.headers = config.headers || {}

    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }

    const vaultToken = getSecretVaultToken()
    if (vaultToken && !config.headers['X-FileInNOut-Vault-Token']) {
      config.headers['X-FileInNOut-Vault-Token'] = vaultToken
    }

    const folderTokensHeader = getSecretFolderTokensHeader()
    if (folderTokensHeader && !config.headers['X-FileInNOut-Secret-Tokens']) {
      config.headers['X-FileInNOut-Secret-Tokens'] = folderTokensHeader
    }

    const isFormDataRequest =
      typeof FormData !== 'undefined' &&
      config.data instanceof FormData

    if (isFormDataRequest) {
      delete config.headers['Content-Type']
      delete config.headers['content-type']
      return config
    }

    if (config.method === 'post' && !config.headers['Content-Type'] && !config.headers['content-type']) {
      config.headers['Content-Type'] = 'application/json'
    }

    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const authStore = useAuthStore()

    if (isTransientIdempotentFailure(error, originalRequest)) {
      originalRequest._transientRetry = true
      await waitMs(300)
      return api(originalRequest)
    }

    if (
      originalRequest &&
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthLifecycleRequest(originalRequest)
    ) {
      originalRequest._retry = true

      try {
        const { accessToken: newAccessToken } = await refreshAccessToken()

        if (newAccessToken) {
          authStore.setToken(newAccessToken)
          originalRequest.headers = originalRequest.headers || {}
          originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`
          return api(originalRequest)
        }
      } catch (refreshError) {
        try {
          globalThis.sessionStorage?.setItem?.('FILEINNOUT_GUEST_REFRESH_FAILED', '1')
        } catch {
          // ignore storage errors
        }
        await authStore.logout({ remote: false, unsubscribe: false })
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export default api
