import { beforeEach, describe, expect, it, vi } from 'vitest'

import sseApi from './sseApi.js'

const eventSourceState = vi.hoisted(() => ({
  instances: [],
}))

vi.mock('event-source-polyfill', () => {
  class EventSourcePolyfill {
    static CLOSED = 2

    constructor(url, options) {
      this.url = url
      this.options = options
      this.readyState = 1
      this.listeners = new Map()
      this.close = vi.fn()
      eventSourceState.instances.push(this)
    }

    addEventListener(eventName, listener) {
      this.listeners.set(eventName, listener)
    }

    emitJson(eventName, payload) {
      this.listeners.get(eventName)?.({ data: JSON.stringify(payload) })
    }
  }

  return { EventSourcePolyfill }
})

describe('sseApi', () => {
  beforeEach(() => {
    eventSourceState.instances.length = 0
    vi.clearAllMocks()
  })

  it('uses one connection to parse and route every application event', () => {
    const handlers = {
      onConnect: vi.fn(),
      onNotification: vi.fn(),
      onNewMessage: vi.fn(),
      onTitleUpdated: vi.fn(),
      onRoleChanged: vi.fn(),
      onChatPreviewUpdated: vi.fn(),
      onError: vi.fn(),
    }

    const connection = sseApi.connectWorkspaceSse({
      userId: 7,
      accessToken: 'access-token',
      ...handlers,
    })

    expect(eventSourceState.instances).toHaveLength(1)
    expect(connection.options.headers).toEqual({ Authorization: 'Bearer access-token' })

    connection.onopen({ type: 'open' })
    connection.emitJson('notification', { id: 'notification' })
    connection.emitJson('new-message', { id: 'message' })
    connection.emitJson('title-updated', { id: 'title' })
    connection.emitJson('role-changed', { id: 'role' })
    connection.emitJson('chat-preview-update', { id: 'preview' })

    expect(handlers.onConnect).toHaveBeenCalledTimes(1)
    expect(handlers.onNotification).toHaveBeenCalledWith({ id: 'notification' })
    expect(handlers.onNewMessage).toHaveBeenCalledWith({ id: 'message' })
    expect(handlers.onTitleUpdated).toHaveBeenCalledWith({ id: 'title' })
    expect(handlers.onRoleChanged).toHaveBeenCalledWith({ id: 'role' })
    expect(handlers.onChatPreviewUpdated).toHaveBeenCalledWith({ id: 'preview' })
  })

  it('hands fatal errors to the owner after closing the connection', () => {
    const onError = vi.fn()
    const connection = sseApi.connectWorkspaceSse({ onError })
    const error = new Error('connection closed')
    connection.readyState = 2

    connection.onerror(error)

    expect(connection.close).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(error)
  })

  it('lets the EventSource polyfill handle non-fatal reconnects', () => {
    const onError = vi.fn()
    const connection = sseApi.connectWorkspaceSse({ onError })
    connection.readyState = 0

    connection.onerror(new Error('reconnecting'))

    expect(connection.close).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })
})