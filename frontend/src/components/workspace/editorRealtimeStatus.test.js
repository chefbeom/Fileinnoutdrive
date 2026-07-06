import { describe, expect, it, vi } from 'vitest'

import {
  createRealtimeStatusLogger,
  formatRealtimeStatus,
  logRealtimeStatus,
} from './editorRealtimeStatus.js'

describe('editorRealtimeStatus', () => {
  it('formats realtime status payloads with safe defaults', () => {
    expect(formatRealtimeStatus({ redisAvailable: false })).toBe(`[RealtimeStatus]
웹소켓 이름 = unknown
Redis 이름 = unknown
Redis 주소 = unknown
Redis 연결 상태 = 연결 안 됨`)

    expect(formatRealtimeStatus({
      websocketName: 'ws-a',
      redisName: 'redis-a',
      redisEndpoint: 'redis:6379',
      redisAvailable: true,
    })).toContain('Redis 연결 상태 = 연결됨')
  })

  it('fetches and logs realtime status snapshots', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        websocketName: 'ws-1',
        redisName: 'redis-1',
        redisEndpoint: 'redis:6379',
        redisAvailable: true,
      }),
    })
    const logger = { info: vi.fn(), warn: vi.fn() }

    await expect(logRealtimeStatus({ statusUrl: '/yjs/status', fetchImpl, logger })).resolves.toBe(true)

    expect(fetchImpl).toHaveBeenCalledWith('/yjs/status', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('웹소켓 이름 = ws-1'))
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('reports failed realtime status requests without throwing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    const logger = { info: vi.fn(), warn: vi.fn() }

    await expect(logRealtimeStatus({ statusUrl: '/yjs/status', fetchImpl, logger })).resolves.toBe(false)

    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith('[RealtimeStatus] status fetch failed', expect.any(Error))
  })

  it('starts one interval, logs immediately, and stops cleanly', async () => {
    let scheduledCallback = null
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ redisAvailable: true }),
    })
    const logger = { info: vi.fn(), warn: vi.fn() }
    const setIntervalImpl = vi.fn((callback) => {
      scheduledCallback = callback
      return 'timer-id'
    })
    const clearIntervalImpl = vi.fn()
    const realtimeLogger = createRealtimeStatusLogger({
      statusUrl: '/yjs/status',
      fetchImpl,
      logger,
      intervalMs: 1234,
      setIntervalImpl,
      clearIntervalImpl,
    })

    expect(realtimeLogger.start()).toBe(true)
    expect(realtimeLogger.start()).toBe(false)
    expect(realtimeLogger.isRunning()).toBe(true)
    expect(setIntervalImpl).toHaveBeenCalledWith(expect.any(Function), 1234)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    scheduledCallback()
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    expect(realtimeLogger.stop()).toBe(true)
    expect(clearIntervalImpl).toHaveBeenCalledWith('timer-id')
    expect(realtimeLogger.isRunning()).toBe(false)
    expect(realtimeLogger.stop()).toBe(false)
  })

  it('does not start without a status url', () => {
    const fetchImpl = vi.fn()
    const setIntervalImpl = vi.fn()
    const realtimeLogger = createRealtimeStatusLogger({ fetchImpl, setIntervalImpl })

    expect(realtimeLogger.start()).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(setIntervalImpl).not.toHaveBeenCalled()
  })
})