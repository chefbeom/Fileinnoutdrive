const DEFAULT_INTERVAL_MS = 5000

export const formatRealtimeStatus = (status = {}) => `[RealtimeStatus]
웹소켓 이름 = ${status.websocketName ?? 'unknown'}
Redis 이름 = ${status.redisName ?? 'unknown'}
Redis 주소 = ${status.redisEndpoint ?? 'unknown'}
Redis 연결 상태 = ${status.redisAvailable === true ? '연결됨' : '연결 안 됨'}`

export const logRealtimeStatus = async ({
  statusUrl,
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) => {
  if (!statusUrl || typeof fetchImpl !== 'function') {
    return false
  }

  try {
    const response = await fetchImpl(statusUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`status request failed: ${response.status}`)
    }

    logger.info(formatRealtimeStatus(await response.json()))
    return true
  } catch (error) {
    logger.warn('[RealtimeStatus] status fetch failed', error)
    return false
  }
}

export const createRealtimeStatusLogger = ({
  statusUrl,
  fetchImpl = globalThis.fetch,
  logger = console,
  intervalMs = DEFAULT_INTERVAL_MS,
  setIntervalImpl = globalThis.setInterval,
  clearIntervalImpl = globalThis.clearInterval,
} = {}) => {
  let timer = null
  const log = () => logRealtimeStatus({ statusUrl, fetchImpl, logger })

  const stop = () => {
    if (!timer || typeof clearIntervalImpl !== 'function') {
      return false
    }

    clearIntervalImpl(timer)
    timer = null
    return true
  }

  const start = () => {
    if (!statusUrl || timer || typeof setIntervalImpl !== 'function') {
      return false
    }

    void log()
    timer = setIntervalImpl(() => {
      void log()
    }, intervalMs)
    return true
  }

  return {
    log,
    start,
    stop,
    isRunning: () => Boolean(timer),
  }
}