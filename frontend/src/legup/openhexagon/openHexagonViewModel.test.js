import { describe, expect, it } from 'vitest'

import {
  clampNumber,
  deriveOpenHexagonMatchStatus,
  describeOpenHexagonDifficulty,
  formatOpenHexagonSeconds,
  formatOpenHexagonUpdatedAt,
  isOpenHexagonAngleInsideSector,
  OPEN_HEXAGON_TAU,
  parseOpenHexagonServerTime,
  polarPoint,
  resolveOpenHexagonDisplayName,
  toOpenHexagonRgba,
  wrapOpenHexagonAngle,
} from './openHexagonViewModel.js'

describe('openHexagonViewModel', () => {
  it('normalizes geometry and color helpers', () => {
    expect(clampNumber(12, 0, 10)).toBe(10)
    expect(wrapOpenHexagonAngle(-Math.PI)).toBeCloseTo(Math.PI)
    expect(wrapOpenHexagonAngle(OPEN_HEXAGON_TAU + 0.25)).toBeCloseTo(0.25)
    expect(polarPoint(10, 20, 5, 0)).toEqual({ x: 15, y: 20 })
    expect(toOpenHexagonRgba('#ff8800', 0.5)).toBe('rgba(255, 136, 0, 0.5)')
    expect(toOpenHexagonRgba('bad', 0.3)).toBe('rgba(89, 214, 255, 0.3)')
  })

  it('derives display and time labels', () => {
    expect(resolveOpenHexagonDisplayName({ email: 'pilot@example.test' })).toBe('pilot')
    expect(resolveOpenHexagonDisplayName({ nickname: 'Ace' })).toBe('Ace')
    expect(resolveOpenHexagonDisplayName(null)).toBe('Pilot')
    expect(formatOpenHexagonSeconds(3.456)).toBe('3.46s')
    expect(formatOpenHexagonUpdatedAt(null)).toBe('No signal yet')
    expect(formatOpenHexagonUpdatedAt('not-a-date')).toBe('not-a-date')
  })

  it('derives match status from countdown server time', () => {
    const roundStartsAt = '2026-07-05T12:00:00.000Z'
    const startMs = parseOpenHexagonServerTime(roundStartsAt)

    expect(deriveOpenHexagonMatchStatus({ match: { status: 'LOBBY' } })).toBe('LOBBY')
    expect(deriveOpenHexagonMatchStatus({
      match: { status: 'COUNTDOWN', roundStartsAt },
      frameClockMs: startMs - 1,
    })).toBe('COUNTDOWN')
    expect(deriveOpenHexagonMatchStatus({
      match: { status: 'COUNTDOWN', roundStartsAt },
      frameClockMs: startMs,
    })).toBe('RUNNING')
  })

  it('describes difficulty and sector boundaries', () => {
    expect(describeOpenHexagonDifficulty(0)).toBe('Calm')
    expect(describeOpenHexagonDifficulty(8)).toBe('Rising')
    expect(describeOpenHexagonDifficulty(18)).toBe('Tense')
    expect(describeOpenHexagonDifficulty(30)).toBe('Hyper')
    expect(describeOpenHexagonDifficulty(45)).toBe('Overclocked')
    expect(isOpenHexagonAngleInsideSector(0.5, 0, 1)).toBe(true)
    expect(isOpenHexagonAngleInsideSector(0.5, 1, 2)).toBe(false)
    expect(isOpenHexagonAngleInsideSector(0.1, 5.5, 0.5)).toBe(true)
  })
})