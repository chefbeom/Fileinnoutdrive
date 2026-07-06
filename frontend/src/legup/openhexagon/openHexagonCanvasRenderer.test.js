import { describe, expect, it } from 'vitest'

import {
  getOpenHexagonCanvasMetrics,
  loadOpenHexagonAvatarImages,
} from './openHexagonCanvasRenderer.js'
import { OPEN_HEXAGON_LANE_COUNT } from './openHexagonObstacleModel.js'
import { OPEN_HEXAGON_TAU } from './openHexagonViewModel.js'

describe('openHexagonCanvasRenderer', () => {
  it('derives canvas metrics from the current viewport', () => {
    const metrics = getOpenHexagonCanvasMetrics({ width: 960, height: 720 })

    expect(metrics.centerX).toBe(480)
    expect(metrics.centerY).toBe(360)
    expect(metrics.sectorAngle).toBeCloseTo(OPEN_HEXAGON_TAU / OPEN_HEXAGON_LANE_COUNT)
    expect(metrics.coreRadius).toBeCloseTo(79.2)
    expect(metrics.playerOrbit).toBeCloseTo(172.8)
    expect(metrics.playerSize).toBeCloseTo(12.24)
    expect(metrics.spawnRadius).toBeCloseTo(475.2)
    expect(metrics.lanePadding).toBe(0.06)
  })

  it('loads available avatar images into the supplied map', async () => {
    class FakeImage {
      set src(value) {
        this.loadedSrc = value
        queueMicrotask(() => this.onload())
      }
    }

    const avatarImages = new Map()
    await loadOpenHexagonAvatarImages({
      avatarSources: ['/a.png', '/b.png'],
      avatarImages,
      ImageConstructor: FakeImage,
    })

    expect(avatarImages.size).toBe(2)
    expect(avatarImages.get(0).loadedSrc).toBe('/a.png')
    expect(avatarImages.get(1).loadedSrc).toBe('/b.png')
  })
})
