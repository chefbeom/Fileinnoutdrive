import { describe, expect, it } from 'vitest'

import {
  createCursorPresenceFields,
  createHiddenCursorPresenceFields,
} from './editorPresenceEvents.js'

describe('editorPresenceEvents', () => {
  it('creates active cursor presence fields for points inside the editor surface', () => {
    expect(createCursorPresenceFields({
      clientX: 150,
      clientY: 80,
      rect: { left: 100, top: 40, width: 200, height: 100 },
      activeAt: '2026-07-06T00:00:00.000Z',
    })).toEqual({
      state: 'active',
      fields: {
        mouse: {
          x: 25,
          y: 40,
          visible: true,
          lastActiveAt: '2026-07-06T00:00:00.000Z',
        },
        presence: { reason: 'cursor' },
      },
    })
  })

  it('creates away presence fields for points outside the editor surface', () => {
    expect(createCursorPresenceFields({
      clientX: 350,
      clientY: 80,
      rect: { left: 100, top: 40, width: 200, height: 100 },
      activeAt: '2026-07-06T00:01:00.000Z',
    })).toEqual({
      state: 'away',
      fields: {
        mouse: {
          visible: false,
          lastActiveAt: '2026-07-06T00:01:00.000Z',
        },
        presence: { reason: 'cursor-outside' },
      },
    })
  })

  it('skips cursor presence when the editor surface has no size', () => {
    expect(createCursorPresenceFields({
      clientX: 1,
      clientY: 1,
      rect: { left: 0, top: 0, width: 0, height: 10 },
    })).toBeNull()
  })

  it('creates hidden cursor fields with an optional reason', () => {
    expect(createHiddenCursorPresenceFields({
      activeAt: 'now',
      reason: 'blur',
    })).toEqual({
      mouse: { visible: false, lastActiveAt: 'now' },
      presence: { reason: 'blur' },
    })

    expect(createHiddenCursorPresenceFields({ activeAt: 'later' })).toEqual({
      mouse: { visible: false, lastActiveAt: 'later' },
    })
  })
})
