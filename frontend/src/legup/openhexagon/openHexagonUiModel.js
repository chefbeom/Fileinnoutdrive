import {
  DEFAULT_OPEN_HEXAGON_PLAYER_ANGLE,
  clampNumber,
  wrapOpenHexagonAngle,
} from './openHexagonViewModel.js'

export const getOpenHexagonPrimaryButtonLabel = ({
  running = false,
  countdown = false,
  countdownSecondsLeft = 0,
  ready = false,
} = {}) => {
  if (running) {
    return '게임 진행 중'
  }
  if (countdown) {
    return `${countdownSecondsLeft || 0}초 후 시작`
  }
  return ready ? '준비 취소' : '준비 완료'
}

export const getOpenHexagonMatchStatusLabel = ({
  running = false,
  countdown = false,
} = {}) => {
  if (running) return '진행 중'
  if (countdown) return '시작 대기'
  return '대기실'
}

export const getOpenHexagonPlayerAccent = (player, fallbackAccentColor) =>
  player?.accentColor || fallbackAccentColor

export const getOpenHexagonPlayerAvatarIndex = ({
  player,
  fallbackAvatarIndex = 0,
  avatarCount = 1,
} = {}) => {
  const rawIndex = Number(player?.avatarIndex ?? fallbackAvatarIndex)
  const safeIndex = Number.isFinite(rawIndex) ? rawIndex : 0
  return clampNumber(safeIndex, 0, Math.max(0, avatarCount - 1))
}

export const getOpenHexagonPlayerAngle = (player) => {
  const rawAngle = Number(player?.angle)
  return Number.isFinite(rawAngle)
    ? wrapOpenHexagonAngle(rawAngle)
    : DEFAULT_OPEN_HEXAGON_PLAYER_ANGLE
}

export const buildOpenHexagonLocalPlayer = ({
  localRosterEntry,
  myUserId = 0,
  displayName = '플레이어',
  localStyle = {},
  playerAngle = DEFAULT_OPEN_HEXAGON_PLAYER_ANGLE,
  running = false,
  gameOver = false,
  survivalSeconds = 0,
} = {}) => {
  if (localRosterEntry) {
    return localRosterEntry
  }

  return {
    userIdx: myUserId,
    nickname: displayName,
    avatarIndex: localStyle.avatarIndex,
    accentColor: localStyle.accentColor,
    angle: playerAngle,
    playing: running,
    alive: !gameOver,
    currentScore: survivalSeconds,
  }
}

export const getOpenHexagonOverlayText = ({
  running = false,
  countdown = false,
  gameOver = false,
  ready = false,
  readyCount = 0,
  playerCount = 0,
  countdownSecondsLeft = 0,
} = {}) => {
  if (running && !gameOver) {
    return null
  }

  if (countdown) {
    return {
      title: String(countdownSecondsLeft || 0),
      subtitle: '모든 플레이어가 준비되었습니다. 함께 시작을 기다리는 중입니다.',
    }
  }

  if (gameOver && running) {
    return {
      title: '게임 종료',
      subtitle: '충돌했습니다. 남은 플레이어는 계속 진행 중입니다.',
    }
  }

  if (ready) {
    return {
      title: '준비됨',
      subtitle: `모든 플레이어 대기 중: ${readyCount}/${playerCount}`,
    }
  }

  return {
    title: '오픈 헥사곤',
    subtitle: '준비를 완료하면 함께 게임을 시작합니다.',
  }
}
