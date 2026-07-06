import { describe, expect, it } from 'vitest'

import {
  createAwarenessUserView,
  createAwarenessViewModel,
  createLocalAwarenessState,
  createRemoteCursorView,
  sortAwarenessUsers,
} from './editorAwareness.js'

describe('editorAwareness', () => {
  it('merges local awareness state while preserving previous custom fields', () => {
    expect(createLocalAwarenessState({
      previous: {
        user: { name: 'Old', color: '#000' },
        presence: { status: 'away', reason: 'idle' },
        mouse: { visible: false },
      },
      localUserState: { name: 'Me', email: 'me@example.com' },
      fields: { presence: { reason: 'focus' }, mouse: { x: 10 } },
      activeAt: '2026-07-06T00:00:00.000Z',
    })).toEqual({
      user: { name: 'Me', color: '#000', email: 'me@example.com' },
      presence: { status: 'active', reason: 'focus', lastActiveAt: '2026-07-06T00:00:00.000Z' },
      mouse: { x: 10 },
    })
  })

  it('creates normalized user and remote cursor views', () => {
    const state = {
      user: { name: ' Alice ', email: ' alice@example.com ', role: 'write', userIdx: 7, color: '#123456' },
      presence: { status: 'away', lastActiveAt: 'now' },
      mouse: { x: 150, y: -20 },
    }

    expect(createAwarenessUserView({ state, clientId: 2, localClientId: 1, fallbackIdentity: 1 })).toEqual({
      clientId: '2',
      name: 'Alice',
      color: '#123456',
      isMe: false,
      role: 'WRITE',
      userIdx: 7,
      email: 'alice@example.com',
      initial: 'A',
      status: 'away',
      lastActiveAt: 'now',
    })

    expect(createRemoteCursorView({ state, clientId: 2, localClientId: 1, fallbackIdentity: 1 })).toEqual({
      name: 'Alice',
      color: '#123456',
      style: {
        position: 'absolute',
        left: '100%',
        top: '0%',
        willChange: 'left, top',
        transition: 'none',
      },
    })
  })

  it('skips invalid users, hidden cursors, and local cursors', () => {
    expect(createAwarenessUserView({ state: {}, clientId: 1, localClientId: 1 })).toBeNull()
    expect(createRemoteCursorView({ state: { user: { name: 'Me' }, mouse: { x: 1, y: 1 } }, clientId: 1, localClientId: 1 })).toBeNull()
    expect(createRemoteCursorView({ state: { user: { name: 'Hidden' }, mouse: { visible: false, x: 1, y: 1 } }, clientId: 2, localClientId: 1 })).toBeNull()
  })

  it('sorts local users first and then by Korean locale names', () => {
    expect(sortAwarenessUsers([
      { name: 'Beta', isMe: false },
      { name: 'Alpha', isMe: false },
      { name: 'Me', isMe: true },
    ])).toEqual([
      { name: 'Me', isMe: true },
      { name: 'Alpha', isMe: false },
      { name: 'Beta', isMe: false },
    ])
  })

  it('creates awareness view models from Yjs awareness states', () => {
    const states = new Map([
      [1, { user: { name: 'Me', color: '#111' }, presence: { status: 'active' } }],
      [2, { user: { email: 'remote@example.com', color: '#222' }, mouse: { x: 25, y: 75 } }],
      [3, { mouse: { x: 50, y: 50 } }],
    ])

    expect(createAwarenessViewModel(states, { localClientId: 1, fallbackIdentity: 1 })).toEqual({
      activeUsers: [
        expect.objectContaining({ clientId: '1', name: 'Me', isMe: true }),
        expect.objectContaining({ clientId: '2', name: '사용자 2', email: 'remote@example.com', isMe: false }),
      ],
      remoteCursors: {
        2: expect.objectContaining({
          name: '사용자 2',
          color: '#222',
          style: expect.objectContaining({ left: '25%', top: '75%' }),
        }),
      },
    })
  })
})