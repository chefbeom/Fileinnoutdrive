import {
  formatOpenHexagonSeconds as formatSeconds,
  OPEN_HEXAGON_TAU as TAU,
  polarPoint,
  toOpenHexagonRgba as toRgba,
  wrapOpenHexagonAngle as wrapAngle,
} from './openHexagonViewModel.js'
import {
  buildOpenHexagonObstacles,
  getOpenHexagonSharedWorldRotation as getSharedWorldRotation,
  OPEN_HEXAGON_LANE_COUNT as LANE_COUNT,
} from './openHexagonObstacleModel.js'
import { getOpenHexagonOverlayText } from './openHexagonUiModel.js'
import { OPEN_HEXAGON_AVATARS } from './avatarManifest.js'

export const getOpenHexagonCanvasMetrics = (viewport) => {
  const minSide = Math.min(viewport.width, viewport.height)

  return {
    centerX: viewport.width / 2,
    centerY: viewport.height / 2,
    sectorAngle: TAU / LANE_COUNT,
    coreRadius: minSide * 0.11,
    playerOrbit: minSide * 0.24,
    playerSize: Math.max(11, minSide * 0.017),
    spawnRadius: minSide * 0.66,
    lanePadding: 0.06,
  }
}

export const loadOpenHexagonAvatarImages = async ({
  avatarSources = OPEN_HEXAGON_AVATARS,
  avatarImages = new Map(),
  ImageConstructor = globalThis.Image,
} = {}) => {
  if (!ImageConstructor) {
    return avatarImages
  }

  await Promise.all(
    avatarSources.map(
      (src, index) =>
        new Promise((resolve) => {
          const image = new ImageConstructor()
          image.onload = () => {
            avatarImages.set(index, image)
            resolve()
          }
          image.onerror = () => resolve()
          image.src = src
        }),
    ),
  )

  return avatarImages
}

const readValue = (accessor, fallback) => (
  typeof accessor === 'function' ? accessor() : fallback
)

export const createOpenHexagonCanvasRenderer = ({
  canvasRef,
  viewport,
  engine,
  getElapsedSeconds,
  isRunningPhase,
  isCountdownPhase,
  getMatchState,
  getRemotePlayers,
  getCurrentLocalPlayer,
  getDisplayName,
  getUi,
  getLocalRosterEntry,
  getReadyCount,
  getPlayerCount,
  getCountdownSecondsLeft,
  getPlayerAccent,
  getPlayerAvatarIndex,
  getPlayerAngle,
} = {}) => {
  const avatarImages = new Map()
  const getMetrics = () => getOpenHexagonCanvasMetrics(viewport)
  const getUiState = () => readValue(getUi, {})
  const getMatch = () => readValue(getMatchState, {})
  const getActiveObstacles = (metrics, elapsedSeconds) => buildOpenHexagonObstacles({
    patterns: getMatch().patterns,
    metrics,
    elapsedSeconds,
  })

  const drawPolygon = (ctx, centerX, centerY, radius, sides, rotation, fillStyle, strokeStyle) => {
    ctx.beginPath()

    for (let index = 0; index < sides; index += 1) {
      const angle = rotation + (TAU / sides) * index
      const point = polarPoint(centerX, centerY, radius, angle)

      if (index === 0) {
        ctx.moveTo(point.x, point.y)
      } else {
        ctx.lineTo(point.x, point.y)
      }
    }

    ctx.closePath()

    if (fillStyle) {
      ctx.fillStyle = fillStyle
      ctx.fill()
    }

    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle
      ctx.stroke()
    }
  }

  const drawObstacle = (ctx, metrics, obstacle) => {
    const outerRadius = obstacle.radius
    const innerRadius = obstacle.radius - obstacle.thickness
    const startAngle = engine.worldRotation + obstacle.lane * metrics.sectorAngle + metrics.lanePadding
    const endAngle = engine.worldRotation + (obstacle.lane + 1) * metrics.sectorAngle - metrics.lanePadding

    const outerStart = polarPoint(metrics.centerX, metrics.centerY, outerRadius, startAngle)
    const outerEnd = polarPoint(metrics.centerX, metrics.centerY, outerRadius, endAngle)
    const innerEnd = polarPoint(metrics.centerX, metrics.centerY, innerRadius, endAngle)
    const innerStart = polarPoint(metrics.centerX, metrics.centerY, innerRadius, startAngle)

    const glow = ctx.createLinearGradient(outerStart.x, outerStart.y, innerEnd.x, innerEnd.y)
    glow.addColorStop(0, `hsla(${obstacle.hue}, 100%, 66%, 0.96)`)
    glow.addColorStop(1, `hsla(${(obstacle.hue + 40) % 360}, 100%, 48%, 0.85)`)

    ctx.beginPath()
    ctx.moveTo(outerStart.x, outerStart.y)
    ctx.lineTo(outerEnd.x, outerEnd.y)
    ctx.lineTo(innerEnd.x, innerEnd.y)
    ctx.lineTo(innerStart.x, innerStart.y)
    ctx.closePath()
    ctx.fillStyle = glow
    ctx.shadowBlur = 22
    ctx.shadowColor = `hsla(${obstacle.hue}, 100%, 62%, 0.55)`
    ctx.fill()
    ctx.shadowBlur = 0
  }

  const drawFallbackTriangle = (ctx, x, y, size, accentColor) => {
    ctx.beginPath()
    ctx.moveTo(x, y - size * 0.86)
    ctx.lineTo(x - size * 0.88, y + size * 0.7)
    ctx.lineTo(x + size * 0.88, y + size * 0.7)
    ctx.closePath()
    ctx.fillStyle = accentColor
    ctx.fill()
  }

  const drawPlayerMarker = (ctx, metrics, player, { local = false, slotIndex = 0 } = {}) => {
    const ui = getUiState()
    const accentColor = getPlayerAccent(player)
    const angle = local ? wrapAngle(engine.playerAngle) : getPlayerAngle(player)
    const remoteSlot = Number(player?.orbitSlot ?? slotIndex)
    const orbitOffset = local ? -metrics.playerSize * 1.15 : metrics.playerSize * (2.8 + remoteSlot * 0.92)
    const markerRadius = metrics.playerOrbit + orbitOffset
    const markerCenter = polarPoint(metrics.centerX, metrics.centerY, markerRadius, angle)
    const markerSize = local ? metrics.playerSize * 4.9 : metrics.playerSize * 3.75
    const haloRadius = markerSize * (local ? 0.56 : 0.5)
    const isPlaying = local ? ui.running : Boolean(player.playing)
    const isAlive = local ? !ui.gameOver : Boolean(player.alive)

    ctx.save()
    ctx.globalAlpha = local ? 1 : isPlaying ? 0.94 : 0.62

    ctx.beginPath()
    ctx.arc(markerCenter.x, markerCenter.y, haloRadius + 8, 0, TAU)
    ctx.fillStyle = toRgba(accentColor, local ? 0.28 : 0.18)
    ctx.fill()

    ctx.beginPath()
    ctx.arc(markerCenter.x, markerCenter.y, haloRadius, 0, TAU)
    ctx.fillStyle = 'rgba(4, 16, 24, 0.92)'
    ctx.shadowBlur = local ? 24 : 14
    ctx.shadowColor = toRgba(accentColor, 0.42)
    ctx.fill()
    ctx.shadowBlur = 0

    ctx.lineWidth = local ? 4 : 3
    ctx.strokeStyle = accentColor
    ctx.stroke()

    const image = avatarImages.get(getPlayerAvatarIndex(player))

    if (image) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(markerCenter.x, markerCenter.y, haloRadius - 3, 0, TAU)
      ctx.clip()
      ctx.drawImage(
        image,
        markerCenter.x - haloRadius + 1,
        markerCenter.y - haloRadius + 1,
        (haloRadius - 1) * 2,
        (haloRadius - 1) * 2,
      )
      ctx.restore()
    } else {
      drawFallbackTriangle(ctx, markerCenter.x, markerCenter.y + 2, haloRadius * 0.9, accentColor)
    }

    if (!isAlive) {
      ctx.beginPath()
      ctx.moveTo(markerCenter.x - haloRadius * 0.7, markerCenter.y - haloRadius * 0.7)
      ctx.lineTo(markerCenter.x + haloRadius * 0.7, markerCenter.y + haloRadius * 0.7)
      ctx.moveTo(markerCenter.x + haloRadius * 0.7, markerCenter.y - haloRadius * 0.7)
      ctx.lineTo(markerCenter.x - haloRadius * 0.7, markerCenter.y + haloRadius * 0.7)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)'
      ctx.lineWidth = 3
      ctx.stroke()
    }

    const label = local ? `${readValue(getDisplayName, 'Pilot')} (you)` : player.nickname
    if (label) {
      ctx.font = '600 12px ui-sans-serif, system-ui'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#eef9ff'
      ctx.fillText(label, markerCenter.x, markerCenter.y + haloRadius + 18)
    }

    const scoreText = formatSeconds(local ? ui.survivalSeconds : player.currentScore)
    ctx.font = '600 11px ui-sans-serif, system-ui'
    ctx.fillStyle = toRgba(accentColor, 0.94)
    ctx.fillText(scoreText, markerCenter.x, markerCenter.y - haloRadius - 12)
    ctx.restore()
  }

  const drawPlayers = (ctx, metrics) => {
    readValue(getRemotePlayers, []).forEach((player, index) => {
      drawPlayerMarker(ctx, metrics, player, { local: false, slotIndex: index })
    })

    drawPlayerMarker(ctx, metrics, readValue(getCurrentLocalPlayer, {}), { local: true })
  }

  const drawBackdrop = (ctx, metrics) => {
    const gradient = ctx.createRadialGradient(
      metrics.centerX,
      metrics.centerY,
      metrics.coreRadius * 0.35,
      metrics.centerX,
      metrics.centerY,
      metrics.spawnRadius * 1.25,
    )
    gradient.addColorStop(0, '#02141f')
    gradient.addColorStop(0.35, '#08273d')
    gradient.addColorStop(1, '#01070b')

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, viewport.width, viewport.height)

    for (let lane = 0; lane < 18; lane += 1) {
      const angle = engine.worldRotation * 0.55 + (TAU / 18) * lane
      const start = polarPoint(metrics.centerX, metrics.centerY, metrics.coreRadius * 0.8, angle)
      const end = polarPoint(metrics.centerX, metrics.centerY, metrics.spawnRadius * 1.08, angle)
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.strokeStyle = `rgba(95, 214, 255, ${lane % 3 === 0 ? 0.12 : 0.05})`
      ctx.lineWidth = lane % 3 === 0 ? 2.2 : 1
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.arc(metrics.centerX, metrics.centerY, metrics.playerOrbit - metrics.playerSize * 1.15, 0, TAU)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 2
    ctx.stroke()

    for (let ringIndex = 0; ringIndex < Math.max(readValue(getRemotePlayers, []).length, 1); ringIndex += 1) {
      ctx.beginPath()
      ctx.arc(
        metrics.centerX,
        metrics.centerY,
        metrics.playerOrbit + metrics.playerSize * (2.8 + ringIndex * 0.92),
        0,
        TAU,
      )
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)'
      ctx.lineWidth = 1.25
      ctx.stroke()
    }
  }

  const drawCore = (ctx, metrics) => {
    drawPolygon(ctx, metrics.centerX, metrics.centerY, metrics.coreRadius * 1.25, 6, engine.worldRotation, 'rgba(12, 35, 56, 0.95)', 'rgba(88, 220, 255, 0.3)')
    drawPolygon(ctx, metrics.centerX, metrics.centerY, metrics.coreRadius * 0.84, 6, -engine.worldRotation * 1.5, 'rgba(255, 94, 157, 0.22)', 'rgba(255, 181, 212, 0.42)')
    drawPolygon(ctx, metrics.centerX, metrics.centerY, metrics.coreRadius * 0.45, 6, engine.worldRotation * 2.4, '#fff0c4', null)
  }

  const drawOverlay = (ctx) => {
    const overlayText = getOpenHexagonOverlayText({
      running: Boolean(readValue(isRunningPhase, false)),
      countdown: Boolean(readValue(isCountdownPhase, false)),
      gameOver: Boolean(getUiState().gameOver),
      ready: Boolean(readValue(getLocalRosterEntry, null)?.ready),
      readyCount: Number(readValue(getReadyCount, 0)),
      playerCount: Number(readValue(getPlayerCount, 0)),
      countdownSecondsLeft: Number(readValue(getCountdownSecondsLeft, 0)),
    })

    if (!overlayText) {
      return
    }

    ctx.fillStyle = 'rgba(2, 8, 15, 0.58)'
    ctx.fillRect(0, 0, viewport.width, viewport.height)

    ctx.fillStyle = '#f4fbff'
    ctx.textAlign = 'center'
    ctx.font = '700 38px ui-sans-serif, system-ui'
    ctx.fillText(overlayText.title, viewport.width / 2, viewport.height / 2 - 18)
    ctx.font = '500 16px ui-sans-serif, system-ui'
    ctx.fillStyle = 'rgba(240, 247, 255, 0.8)'
    ctx.fillText(overlayText.subtitle, viewport.width / 2, viewport.height / 2 + 18)
  }

  const drawFrame = () => {
    const canvas = canvasRef.value

    if (!canvas) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    const metrics = getMetrics()
    const elapsedSeconds = readValue(isRunningPhase, false) ? getElapsedSeconds() : 0
    const activeObstacles = readValue(isRunningPhase, false)
      ? getActiveObstacles(metrics, elapsedSeconds)
      : []

    engine.worldRotation = getSharedWorldRotation({
      elapsedSeconds,
      roundSeed: getMatch().roundSeed,
    })

    context.clearRect(0, 0, viewport.width, viewport.height)
    drawBackdrop(context, metrics)
    activeObstacles.forEach((obstacle) => drawObstacle(context, metrics, obstacle))
    drawCore(context, metrics)
    drawPlayers(context, metrics)
    drawOverlay(context)
  }

  const loadAvatars = async () => {
    await loadOpenHexagonAvatarImages({ avatarImages })
    drawFrame()
  }

  return {
    getMetrics,
    getActiveObstacles,
    drawFrame,
    loadAvatars,
  }
}
