import { describe, expect, it } from 'vitest'

import { OPEN_HEXAGON_TAU } from './openHexagonViewModel.js'
import {
  buildOpenHexagonObstacles,
  getOpenHexagonDifficultyAt,
  getOpenHexagonSharedWorldRotation,
  hasOpenHexagonCollision,
  OPEN_HEXAGON_LANE_COUNT,
} from './openHexagonObstacleModel.js'

const metrics = {
  sectorAngle: OPEN_HEXAGON_TAU / OPEN_HEXAGON_LANE_COUNT,
  coreRadius: 40,
  playerOrbit: 200,
  playerSize: 12,
  spawnRadius: 400,
  lanePadding: 0.06,
}

describe('openHexagonObstacleModel', () => {
  it('derives difficulty and deterministic shared world rotation', () => {
    expect(getOpenHexagonDifficultyAt(0)).toBe(1)
    expect(getOpenHexagonDifficultyAt(18)).toBe(2)
    expect(getOpenHexagonDifficultyAt(999)).toBeCloseTo(5.6)

    const rotation = getOpenHexagonSharedWorldRotation({
      elapsedSeconds: 12.5,
      roundSeed: 128,
    })

    expect(rotation).toBeGreaterThanOrEqual(0)
    expect(rotation).toBeLessThan(OPEN_HEXAGON_TAU)
    expect(getOpenHexagonSharedWorldRotation({ elapsedSeconds: 12.5, roundSeed: 128 })).toBe(rotation)
  })

  it('builds gate obstacles while preserving the safe lane', () => {
    const obstacles = buildOpenHexagonObstacles({
      patterns: [{ spawnAtMs: 0, patternType: 'gate', ringCount: 1, safeStart: 0 }],
      metrics,
      elapsedSeconds: 0,
    })

    expect(obstacles).toHaveLength(OPEN_HEXAGON_LANE_COUNT - 1)
    expect(obstacles.map((obstacle) => obstacle.lane)).toEqual([1, 2, 3, 4, 5])
    expect(obstacles[0]).toMatchObject({ radius: 540, thickness: 35, speed: 237 })
  })

  it('ignores patterns before their spawn time and expired rings', () => {
    expect(buildOpenHexagonObstacles({
      patterns: [{ spawnAtMs: 1000, patternType: 'gate', ringCount: 1, safeStart: 0 }],
      metrics,
      elapsedSeconds: 0.5,
    })).toEqual([])

    expect(buildOpenHexagonObstacles({
      patterns: [{ spawnAtMs: 0, patternType: 'gate', ringCount: 1, safeStart: 0 }],
      metrics,
      elapsedSeconds: 10,
    })).toEqual([])
  })

  it('detects player collisions by radial overlap and lane sector', () => {
    const obstacles = [{
      lane: 0,
      radius: 212,
      thickness: 32,
      hue: 15,
    }]

    expect(hasOpenHexagonCollision({
      metrics,
      obstacles,
      playerAngle: metrics.sectorAngle / 2,
      worldRotation: 0,
    })).toBe(true)

    expect(hasOpenHexagonCollision({
      metrics,
      obstacles,
      playerAngle: metrics.sectorAngle * 2.5,
      worldRotation: 0,
    })).toBe(false)
  })
})
