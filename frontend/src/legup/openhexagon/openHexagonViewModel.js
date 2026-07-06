export const OPEN_HEXAGON_TAU = Math.PI * 2
export const DEFAULT_OPEN_HEXAGON_PLAYER_ANGLE = -Math.PI / 2

export const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value))

export const wrapOpenHexagonAngle = (angle) => {
  const wrapped = angle % OPEN_HEXAGON_TAU
  return wrapped >= 0 ? wrapped : wrapped + OPEN_HEXAGON_TAU
}

export const polarPoint = (centerX, centerY, radius, angle) => ({
  x: centerX + Math.cos(angle) * radius,
  y: centerY + Math.sin(angle) * radius,
})

export const toOpenHexagonRgba = (hexColor, alpha) => {
  const normalized = String(hexColor || '').replace('#', '')

  if (normalized.length !== 6) {
    return `rgba(89, 214, 255, ${alpha})`
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export const resolveOpenHexagonDisplayName = (user) => {
  const rawName = user?.name || user?.userName || user?.nickname || user?.email
  if (!rawName) return 'Pilot'
  return String(rawName).split('@')[0]
}

export const parseOpenHexagonServerTime = (value) => {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

export const deriveOpenHexagonMatchStatus = ({
  match = {},
  frameClockMs = 0,
  serverClockOffsetMs = 0,
} = {}) => {
  const status = match?.status ?? 'LOBBY'
  const roundStartMs = parseOpenHexagonServerTime(match?.roundStartsAt)

  if (status === 'COUNTDOWN' && roundStartMs && frameClockMs + serverClockOffsetMs >= roundStartMs) {
    return 'RUNNING'
  }

  return status
}

export const formatOpenHexagonSeconds = (value) => `${Number(value || 0).toFixed(2)}s`

export const formatOpenHexagonUpdatedAt = (value, locale = 'ko-KR') => {
  if (!value) return 'No signal yet'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export const describeOpenHexagonDifficulty = (seconds) => {
  if (seconds >= 45) return 'Overclocked'
  if (seconds >= 30) return 'Hyper'
  if (seconds >= 18) return 'Tense'
  if (seconds >= 8) return 'Rising'
  return 'Calm'
}

export const isOpenHexagonAngleInsideSector = (angle, start, end) => {
  const normalizedAngle = wrapOpenHexagonAngle(angle)
  const normalizedStart = wrapOpenHexagonAngle(start)
  const normalizedEnd = wrapOpenHexagonAngle(end)

  if (normalizedStart <= normalizedEnd) {
    return normalizedAngle >= normalizedStart && normalizedAngle <= normalizedEnd
  }

  return normalizedAngle >= normalizedStart || normalizedAngle <= normalizedEnd
}