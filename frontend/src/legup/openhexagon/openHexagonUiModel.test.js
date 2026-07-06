import { describe, expect, it } from 'vitest'

import { DEFAULT_OPEN_HEXAGON_PLAYER_ANGLE } from './openHexagonViewModel.js'
import {
  buildOpenHexagonLocalPlayer,
  getOpenHexagonMatchStatusLabel,
  getOpenHexagonOverlayText,
  getOpenHexagonPlayerAccent,
  getOpenHexagonPlayerAngle,
  getOpenHexagonPlayerAvatarIndex,
  getOpenHexagonPrimaryButtonLabel,
} from './openHexagonUiModel.js'

describe('openHexagonUiModel', () => {
  it('derives primary controls and match status labels', () => {
    expect(getOpenHexagonPrimaryButtonLabel({ running: true })).toBe('Match running')
    expect(getOpenHexagonPrimaryButtonLabel({ countdown: true, countdownSecondsLeft: 3 })).toBe('3s countdown')
    expect(getOpenHexagonPrimaryButtonLabel({ ready: true })).toBe('Cancel ready')
    expect(getOpenHexagonPrimaryButtonLabel()).toBe('Ready up')

    expect(getOpenHexagonMatchStatusLabel({ running: true })).toBe('Running')
    expect(getOpenHexagonMatchStatusLabel({ countdown: true })).toBe('Countdown')
    expect(getOpenHexagonMatchStatusLabel()).toBe('Lobby')
  })

  it('normalizes player display fallback values', () => {
    expect(getOpenHexagonPlayerAccent({ accentColor: '#fff' }, '#000')).toBe('#fff')
    expect(getOpenHexagonPlayerAccent(null, '#000')).toBe('#000')
    expect(getOpenHexagonPlayerAvatarIndex({
      player: { avatarIndex: 99 },
      fallbackAvatarIndex: 1,
      avatarCount: 4,
    })).toBe(3)
    expect(getOpenHexagonPlayerAvatarIndex({
      player: { avatarIndex: 'bad' },
      fallbackAvatarIndex: 1,
      avatarCount: 4,
    })).toBe(0)
    expect(getOpenHexagonPlayerAngle({ angle: -Math.PI })).toBeCloseTo(Math.PI)
    expect(getOpenHexagonPlayerAngle({ angle: 'bad' })).toBe(DEFAULT_OPEN_HEXAGON_PLAYER_ANGLE)
  })

  it('builds a local fallback player only when no roster entry exists', () => {
    const rosterEntry = { userIdx: 9, nickname: 'Roster' }
    expect(buildOpenHexagonLocalPlayer({ localRosterEntry: rosterEntry })).toBe(rosterEntry)

    expect(buildOpenHexagonLocalPlayer({
      myUserId: 12,
      displayName: 'Pilot',
      localStyle: { avatarIndex: 2, accentColor: '#55d6ff' },
      playerAngle: 1.25,
      running: true,
      gameOver: false,
      survivalSeconds: 4.5,
    })).toEqual({
      userIdx: 12,
      nickname: 'Pilot',
      avatarIndex: 2,
      accentColor: '#55d6ff',
      angle: 1.25,
      playing: true,
      alive: true,
      currentScore: 4.5,
    })
  })

  it('derives overlay text for running, countdown, game over, and ready states', () => {
    expect(getOpenHexagonOverlayText({ running: true, gameOver: false })).toBeNull()
    expect(getOpenHexagonOverlayText({ countdown: true, countdownSecondsLeft: 2 })).toEqual({
      title: '2',
      subtitle: 'All pilots locked in. Shared countdown in progress.',
    })
    expect(getOpenHexagonOverlayText({ running: true, gameOver: true })).toEqual({
      title: 'Signal Lost',
      subtitle: 'You crashed. Remaining players are still in the round.',
    })
    expect(getOpenHexagonOverlayText({ ready: true, readyCount: 1, playerCount: 3 })).toEqual({
      title: 'Ready',
      subtitle: 'Waiting for everyone: 1/3',
    })
  })
})
