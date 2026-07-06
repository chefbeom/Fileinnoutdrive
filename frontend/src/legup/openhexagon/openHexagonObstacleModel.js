import {
  isOpenHexagonAngleInsideSector,
  OPEN_HEXAGON_TAU,
  wrapOpenHexagonAngle,
} from './openHexagonViewModel.js'

export const OPEN_HEXAGON_LANE_COUNT = 6

export const getOpenHexagonDifficultyAt = (elapsedSeconds) =>
  1 + Math.min(Number(elapsedSeconds || 0) / 18, 4.6)

export const getOpenHexagonSharedWorldRotation = ({
  elapsedSeconds = 0,
  roundSeed = 0,
} = {}) => {
  const seed = Number(roundSeed ?? 0)
  const phaseOffset = ((seed % 4096) / 4096) * OPEN_HEXAGON_TAU
  const difficulty = getOpenHexagonDifficultyAt(elapsedSeconds)
  const baseSpin = elapsedSeconds * (0.52 + difficulty * 0.11)
  const harmonic =
    Math.sin(elapsedSeconds * 0.9 + phaseOffset) * 0.65 +
    Math.cos(elapsedSeconds * 0.33 + phaseOffset * 0.5) * 0.22

  return wrapOpenHexagonAngle(phaseOffset + baseSpin + harmonic)
}

const appendOpenHexagonPatternObstacles = (
  buffer,
  pattern,
  metrics,
  elapsedSeconds,
  laneCount = OPEN_HEXAGON_LANE_COUNT,
) => {
  const spawnAtSeconds = Number(pattern?.spawnAtMs ?? 0) / 1000
  const age = elapsedSeconds - spawnAtSeconds

  if (age < 0) {
    return
  }

  const difficulty = getOpenHexagonDifficultyAt(spawnAtSeconds)
  const patternType = pattern?.patternType ?? 'gate'
  const ringCount = Number(pattern?.ringCount ?? 1)
  const safeStart = Number(pattern?.safeStart ?? 0)
  const safeWidth = patternType === 'gate' ? 1 : 2

  for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
    const offsetSafeStart = (safeStart + ringIndex) % laneCount
    const baseRadius = metrics.spawnRadius + 140 + ringIndex * 110
    const thickness = 30 + difficulty * 5
    const speed = 195 + difficulty * 42 + ringIndex * 14
    const radius = baseRadius - speed * age

    if (radius <= metrics.coreRadius * 0.78) {
      continue
    }

    for (let lane = 0; lane < laneCount; lane += 1) {
      const inSafeWindow =
        lane === offsetSafeStart ||
        (safeWidth === 2 && lane === (offsetSafeStart + 1) % laneCount)

      if (patternType === 'spiral') {
        const spiralLane = (safeStart + ringIndex + lane) % laneCount
        const shouldBlock =
          spiralLane !== offsetSafeStart &&
          spiralLane !== (offsetSafeStart + 1) % laneCount

        if (!shouldBlock) {
          continue
        }

        buffer.push({
          lane,
          radius:
            metrics.spawnRadius +
            160 +
            ringIndex * 120 -
            (205 + difficulty * 44 + ringIndex * 18) * age,
          thickness: 32 + difficulty * 6,
          speed: 205 + difficulty * 44 + ringIndex * 18,
          hue: 340 - lane * 18 + ringIndex * 12,
        })
        continue
      }

      if (patternType === 'zigzag') {
        const parityBlock = (lane + ringIndex) % 2 === 0
        if (!parityBlock || inSafeWindow) {
          continue
        }
      } else if (inSafeWindow) {
        continue
      }

      buffer.push({
        lane,
        radius,
        thickness,
        speed,
        hue: 15 + lane * 12 + ringIndex * 15,
      })
    }
  }
}

export const buildOpenHexagonObstacles = ({
  patterns = [],
  metrics,
  elapsedSeconds = 0,
  laneCount = OPEN_HEXAGON_LANE_COUNT,
} = {}) => {
  if (!metrics || !Array.isArray(patterns)) {
    return []
  }

  const obstacles = []
  for (const pattern of patterns) {
    appendOpenHexagonPatternObstacles(obstacles, pattern, metrics, elapsedSeconds, laneCount)
  }
  return obstacles
}

export const hasOpenHexagonCollision = ({
  metrics,
  obstacles = [],
  playerAngle,
  worldRotation = 0,
} = {}) => {
  if (!metrics || !Array.isArray(obstacles)) {
    return false
  }

  for (const obstacle of obstacles) {
    const outerRadius = obstacle.radius
    const innerRadius = obstacle.radius - obstacle.thickness
    const radialOverlap =
      metrics.playerOrbit + metrics.playerSize > innerRadius &&
      metrics.playerOrbit - metrics.playerSize < outerRadius

    if (!radialOverlap) {
      continue
    }

    const startAngle = worldRotation + obstacle.lane * metrics.sectorAngle + metrics.lanePadding
    const endAngle = worldRotation + (obstacle.lane + 1) * metrics.sectorAngle - metrics.lanePadding

    if (isOpenHexagonAngleInsideSector(playerAngle, startAngle, endAngle)) {
      return true
    }
  }

  return false
}
