import axios from 'axios'
import { apiPath } from '@/utils/backendUrl.js'

let refreshAccessTokenPromise = null

const parseBearerToken = (value) => {
  if (!value) return ''
  return String(value).replace(/^Bearer\s+/i, '')
}

export const reissueAccessToken = async () => {
  const res = await axios.post(apiPath('/auth/reissue'), {}, {
    withCredentials: true,
    timeout: 5000,
  })

  const authHeader = res.headers['authorization'] || res.headers['Authorization']
  const accessToken = parseBearerToken(authHeader)

  if (!accessToken) {
    throw new Error('Token reissue succeeded without an access token.')
  }

  return { res, accessToken }
}

export const refreshAccessToken = () => {
  if (!refreshAccessTokenPromise) {
    refreshAccessTokenPromise = reissueAccessToken()
      .finally(() => {
        refreshAccessTokenPromise = null
      })
  }

  return refreshAccessTokenPromise
}

export const logoutSession = async () => {
  return axios.post(apiPath('/auth/logout'), {}, {
    withCredentials: true,
    timeout: 5000,
  })
}
