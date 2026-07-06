import { beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'

import { logoutSession, refreshAccessToken, reissueAccessToken } from './authSession.js'

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}))

const createDeferred = () => {
  let resolve
  let reject
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('authSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts a bearer access token from the reissue response', async () => {
    const response = { headers: { authorization: 'Bearer access-token' } }
    axios.post.mockResolvedValueOnce(response)

    await expect(reissueAccessToken()).resolves.toEqual({
      res: response,
      accessToken: 'access-token',
    })
    expect(axios.post).toHaveBeenCalledWith('/api/auth/reissue', {}, {
      withCredentials: true,
      timeout: 5000,
    })
  })

  it('rejects a reissue response that does not contain an access token', async () => {
    axios.post.mockResolvedValueOnce({ headers: {} })

    await expect(reissueAccessToken()).rejects.toThrow('without an access token')
  })

  it('shares one in-flight refresh request across concurrent callers', async () => {
    const deferred = createDeferred()
    axios.post.mockReturnValueOnce(deferred.promise)

    const firstRefresh = refreshAccessToken()
    const secondRefresh = refreshAccessToken()

    expect(secondRefresh).toBe(firstRefresh)
    expect(axios.post).toHaveBeenCalledTimes(1)

    deferred.resolve({ headers: { Authorization: 'Bearer shared-token' } })

    await expect(firstRefresh).resolves.toMatchObject({ accessToken: 'shared-token' })
    await expect(secondRefresh).resolves.toMatchObject({ accessToken: 'shared-token' })

    axios.post.mockResolvedValueOnce({ headers: { Authorization: 'Bearer next-token' } })
    await expect(refreshAccessToken()).resolves.toMatchObject({ accessToken: 'next-token' })
    expect(axios.post).toHaveBeenCalledTimes(2)
  })

  it('logs out with credentials so the server can clear the refresh cookie', async () => {
    axios.post.mockResolvedValueOnce({ status: 204 })

    await logoutSession()

    expect(axios.post).toHaveBeenCalledWith('/api/auth/logout', {}, {
      withCredentials: true,
      timeout: 5000,
    })
  })
})