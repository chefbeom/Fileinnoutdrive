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
    expect(getOpenHexagonPrimaryButtonLabel({ running: true })).toBe('게임 진행 중')
    expect(getOpenHexagonPrimaryButtonLabel({ countdown: true, countdownSecondsLeft: 3 })).toBe('3초 후 시작')
    expect(getOpenHexagonPrimaryButtonLabel({ ready: true })).toBe('준비 취소')
    expect(getOpenHexagonPrimaryButtonLabel()).toBe('준비 완료')

    expect(getOpenHexagonMatchStatusLabel({ running: true })).toBe('진행 중')
    expect(getOpenHexagonMatchStatusLabel({ countdown: true })).toBe('시작 대기')
    expect(getOpenHexagonMatchStatusLabel()).toBe('대기실')
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
      subtitle: '모든 플레이어가 준비되었습니다. 함께 시작을 기다리는 중입니다.',
    })
    expect(getOpenHexagonOverlayText({ running: true, gameOver: true })).toEqual({
      title: '게임 종료',
      subtitle: '충돌했습니다. 남은 플레이어는 계속 진행 중입니다.',
    })
    expect(getOpenHexagonOverlayText({ ready: true, readyCount: 1, playerCount: 3 })).toEqual({
      title: '준비됨',
      subtitle: '모든 플레이어 대기 중: 1/3',
    })
  })
})
