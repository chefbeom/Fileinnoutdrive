import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkspaceRealtimeConnection } from './useWorkspaceRealtimeConnection.js'

const createFakeClient = () => ({
  connected: false,
  debug: undefined,
  ws: { readyState: 1, close: vi.fn() },
  connect: vi.fn(function connect(_headers, onConnected, onError) {
    this.onConnected = onConnected
    this.onError = onError
  }),
  disconnect: vi.fn((callback) => callback?.()),
  subscribe: vi.fn(),
})

const createHarness = ({ token = 'token' } = {}) => {
  const clients = []
  const logger = { error: vi.fn() }
  const onAssetEvent = vi.fn()
  const onCommentEvent = vi.fn()
  const refreshAssets = vi.fn(() => Promise.resolve())
  const refreshComments = vi.fn(() => Promise.resolve())
  const connection = useWorkspaceRealtimeConnection({
    getAccessToken: () => token,
    createSocket: vi.fn(() => ({ socket: true })),
    createStompClient: vi.fn(() => {
      const client = createFakeClient()
      clients.push(client)
      return client
    }),
    onAssetEvent,
    onCommentEvent,
    refreshAssets,
    refreshComments,
    logger,
  })

  return {
    clients,
    connection,
    logger,
    onAssetEvent,
    onCommentEvent,
    refreshAssets,
    refreshComments,
  }
}

describe('useWorkspaceRealtimeConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('connects and subscribes to workspace asset and comment topics', () => {
    const harness = createHarness()

    harness.connection.connect(12)
    const client = harness.clients[0]
    client.connected = true
    client.onConnected()

    expect(client.debug).toBeNull()
    expect(client.connect).toHaveBeenCalledWith(
      { Authorization: 'Bearer token' },
      expect.any(Function),
      expect.any(Function),
    )
    expect(client.subscribe).toHaveBeenCalledWith('/sub/workspace/assets/12', expect.any(Function))
    expect(client.subscribe).toHaveBeenCalledWith('/sub/workspace/comments/12', expect.any(Function))

    client.subscribe.mock.calls[0][1]({ body: '{"action":"UPLOAD"}' })
    client.subscribe.mock.calls[1][1]({ body: '{"action":"UPSERT"}' })

    expect(harness.onAssetEvent).toHaveBeenCalledWith({ action: 'UPLOAD' })
    expect(harness.onCommentEvent).toHaveBeenCalledWith({ action: 'UPSERT' })
  })

  it('disconnects when workspace id or token is missing', () => {
    const harness = createHarness()

    harness.connection.connect(12)
    const client = harness.clients[0]
    client.connected = true

    harness.connection.connect(0)

    expect(client.disconnect).toHaveBeenCalledTimes(1)
  })

  it('reuses the existing connected client for the same workspace', () => {
    const harness = createHarness()

    harness.connection.connect(12)
    const client = harness.clients[0]
    client.connected = true
    client.onConnected()

    harness.connection.connect(12)

    expect(harness.clients).toHaveLength(1)
    expect(client.disconnect).not.toHaveBeenCalled()
  })

  it('refreshes assets or comments when realtime payload parsing fails', async () => {
    const harness = createHarness()

    harness.connection.connect(12)
    const client = harness.clients[0]
    client.connected = true
    client.onConnected()

    client.subscribe.mock.calls[0][1]({ body: '{bad-json' })
    client.subscribe.mock.calls[1][1]({ body: '{bad-json' })

    expect(harness.refreshAssets).toHaveBeenCalledWith(12)
    expect(harness.refreshComments).toHaveBeenCalledWith(12)
    expect(harness.logger.error).toHaveBeenCalledTimes(2)
  })
})
