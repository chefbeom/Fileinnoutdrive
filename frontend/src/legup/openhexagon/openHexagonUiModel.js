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
    return 'Match running'
  }
  if (countdown) {
    return `${countdownSecondsLeft || 0}s countdown`
  }
  return ready ? 'Cancel ready' : 'Ready up'
}

export const getOpenHexagonMatchStatusLabel = ({
  running = false,
  countdown = false,
} = {}) => {
  if (running) return 'Running'
  if (countdown) return 'Countdown'
  return 'Lobby'
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
  displayName = 'Pilot',
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
      subtitle: 'All pilots locked in. Shared countdown in progress.',
    }
  }

  if (gameOver && running) {
    return {
      title: 'Signal Lost',
      subtitle: 'You crashed. Remaining players are still in the round.',
    }
  }

  if (ready) {
    return {
      title: 'Ready',
      subtitle: `Waiting for everyone: ${readyCount}/${playerCount}`,
    }
  }

  return {
    title: 'Open Hexagon',
    subtitle: 'Ready up to begin a synchronized run.',
  }
}
