<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/useAuthStore.js'
import {
  getOpenHexagonAvatarSrc,
  OPEN_HEXAGON_AVATARS,
  pickOpenHexagonProfile,
} from '@/legup/openhexagon/avatarManifest.js'
import { useOpenHexagonSocket } from '@/legup/openhexagon/useOpenHexagonSocket.js'
import {
  clampNumber as clamp,
  DEFAULT_OPEN_HEXAGON_PLAYER_ANGLE as DEFAULT_PLAYER_ANGLE,
  deriveOpenHexagonMatchStatus,
  describeOpenHexagonDifficulty as difficultyDescriptor,
  formatOpenHexagonSeconds as formatSeconds,
  formatOpenHexagonUpdatedAt as formatUpdatedAt,
  parseOpenHexagonServerTime as parseServerTime,
  resolveOpenHexagonDisplayName,
  toOpenHexagonRgba as toRgba,
  wrapOpenHexagonAngle as wrapAngle,
} from '@/legup/openhexagon/openHexagonViewModel.js'
import {
  getOpenHexagonDifficultyAt as getDifficultyAt,
  hasOpenHexagonCollision,
} from '@/legup/openhexagon/openHexagonObstacleModel.js'
import {
  buildOpenHexagonLocalPlayer,
  getOpenHexagonMatchStatusLabel,
  getOpenHexagonPlayerAccent,
  getOpenHexagonPlayerAngle,
  getOpenHexagonPlayerAvatarIndex,
  getOpenHexagonPrimaryButtonLabel,
} from '@/legup/openhexagon/openHexagonUiModel.js'
import { createOpenHexagonCanvasRenderer } from '@/legup/openhexagon/openHexagonCanvasRenderer.js'
const STORAGE_KEY = 'open-hexagon-best-seconds'
const STATE_SYNC_INTERVAL_MS = 90

const authStore = useAuthStore()

const canvasRef = ref(null)
const surfaceRef = ref(null)
const serverClockOffsetMs = ref(0)
const frameClockMs = ref(Date.now())
const viewport = reactive({ width: 960, height: 720 })
const inputState = reactive({ left: false, right: false })
const ui = reactive({
  started: false,
  running: false,
  gameOver: false,
  survivalSeconds: 0,
  difficultyLabel: 'Calm',
})

const displayName = computed(() => resolveOpenHexagonDisplayName(authStore.user))

const localBestSeconds = ref(0)

const myUserId = computed(() => Number(authStore.user?.idx ?? 0))
const localStyle = computed(() => pickOpenHexagonProfile(myUserId.value || displayName.value.length || 1))

const lobbySocket = useOpenHexagonSocket(authStore)
const lobby = lobbySocket.lobby
const connectionState = lobbySocket.connectionState
const socketError = lobbySocket.socketError
const playerRoster = computed(() => (Array.isArray(lobby.value.players) ? lobby.value.players : []))
const matchState = computed(() => lobby.value.match ?? {})
const leaderboardEntries = computed(() =>
  Array.isArray(lobby.value.leaderboard) ? lobby.value.leaderboard : [],
)
const remotePlayers = computed(() =>
  playerRoster.value.filter((player) => Number(player.userIdx) !== myUserId.value),
)
const localRosterEntry = computed(() =>
  playerRoster.value.find((player) => Number(player.userIdx) === myUserId.value) ?? null,
)
const derivedMatchStatus = computed(() => deriveOpenHexagonMatchStatus({
  match: matchState.value,
  frameClockMs: frameClockMs.value,
  serverClockOffsetMs: serverClockOffsetMs.value,
}))
const isLobbyPhase = computed(() => derivedMatchStatus.value === 'LOBBY')
const isCountdownPhase = computed(() => derivedMatchStatus.value === 'COUNTDOWN')
const isRunningPhase = computed(() => derivedMatchStatus.value === 'RUNNING')
const readyCount = computed(() => Number(matchState.value.readyCount ?? 0))
const playerCount = computed(() => Number(matchState.value.playerCount ?? lobby.value.onlineCount ?? 0))

const engine = {
  playerAngle: DEFAULT_PLAYER_ANGLE,
  worldRotation: 0,
  animationId: 0,
  lastFrameTime: 0,
  submittedScore: false,
  lastPresenceSyncAt: 0,
  activeRoundNumber: 0,
}


const loadLocalBest = () => {
  const saved = Number(localStorage.getItem(STORAGE_KEY) || 0)
  localBestSeconds.value = Number.isFinite(saved) ? saved : 0
}

const saveLocalBest = () => {
  localStorage.setItem(STORAGE_KEY, String(localBestSeconds.value))
}

const getServerNowMs = () => frameClockMs.value + serverClockOffsetMs.value

const getRoundStartMs = () => parseServerTime(matchState.value.roundStartsAt)

const getCountdownEndMs = () => parseServerTime(matchState.value.countdownEndsAt)

const countdownSecondsLeft = computed(() => {
  const countdownEndMs = getCountdownEndMs()

  if (!countdownEndMs || !isCountdownPhase.value) {
    return 0
  }

  return Math.max(0, Math.ceil((countdownEndMs - getServerNowMs()) / 1000))
})

const primaryButtonLabel = computed(() => getOpenHexagonPrimaryButtonLabel({
  running: isRunningPhase.value,
  countdown: isCountdownPhase.value,
  countdownSecondsLeft: countdownSecondsLeft.value,
  ready: Boolean(localRosterEntry.value?.ready),
}))

const matchStatusLabel = computed(() => getOpenHexagonMatchStatusLabel({
  running: isRunningPhase.value,
  countdown: isCountdownPhase.value,
}))

const getPlayerAccent = (player) => getOpenHexagonPlayerAccent(player, localStyle.value.accentColor)

const getPlayerAvatarIndex = (player) => getOpenHexagonPlayerAvatarIndex({
  player,
  fallbackAvatarIndex: localStyle.value.avatarIndex,
  avatarCount: OPEN_HEXAGON_AVATARS.length,
})

const getPlayerAvatarSrc = (player) => getOpenHexagonAvatarSrc(getPlayerAvatarIndex(player))

const getPlayerAngle = (player) => getOpenHexagonPlayerAngle(player)

const currentLocalPlayer = computed(() => buildOpenHexagonLocalPlayer({
  localRosterEntry: localRosterEntry.value,
  myUserId: myUserId.value,
  displayName: displayName.value,
  localStyle: localStyle.value,
  playerAngle: engine.playerAngle,
  running: ui.running,
  gameOver: ui.gameOver,
  survivalSeconds: ui.survivalSeconds,
}))
const buildJoinPayload = () => ({
  nickname: displayName.value,
})

const buildPresencePayload = (overrides = {}) => ({
  angle: Number(engine.playerAngle.toFixed(4)),
  scoreSeconds: Number(ui.survivalSeconds.toFixed(3)),
  alive: !ui.gameOver,
  ...overrides,
})

const broadcastPresence = (force = false, overrides = {}) => {
  const now = performance.now()

  if (!force && now - engine.lastPresenceSyncAt < STATE_SYNC_INTERVAL_MS) {
    return
  }

  engine.lastPresenceSyncAt = now
  lobbySocket.sendState(buildPresencePayload(overrides))
}

const toggleReady = () => {
  if (isRunningPhase.value) {
    return
  }

  lobbySocket.sendReady(!localRosterEntry.value?.ready)
}

const getRoundElapsedSeconds = () => {
  const roundStartMs = getRoundStartMs()

  if (!roundStartMs) {
    return 0
  }

  return Math.max(0, (getServerNowMs() - roundStartMs) / 1000)
}


const renderer = createOpenHexagonCanvasRenderer({
  canvasRef,
  viewport,
  engine,
  getElapsedSeconds: getRoundElapsedSeconds,
  isRunningPhase: () => isRunningPhase.value,
  isCountdownPhase: () => isCountdownPhase.value,
  getMatchState: () => matchState.value,
  getRemotePlayers: () => remotePlayers.value,
  getCurrentLocalPlayer: () => currentLocalPlayer.value,
  getDisplayName: () => displayName.value,
  getUi: () => ui,
  getLocalRosterEntry: () => localRosterEntry.value,
  getReadyCount: () => readyCount.value,
  getPlayerCount: () => playerCount.value,
  getCountdownSecondsLeft: () => countdownSecondsLeft.value,
  getPlayerAccent,
  getPlayerAvatarIndex,
  getPlayerAngle,
})
const getMetrics = renderer.getMetrics
const getActiveObstacles = renderer.getActiveObstacles
const drawFrame = renderer.drawFrame
const loadAvatars = renderer.loadAvatars
const stopLoop = () => {
  if (engine.animationId) {
    cancelAnimationFrame(engine.animationId)
    engine.animationId = 0
  }
}

const resetGame = () => {
  engine.playerAngle = DEFAULT_PLAYER_ANGLE
  engine.worldRotation = 0
  engine.lastFrameTime = 0
  engine.submittedScore = false
  engine.lastPresenceSyncAt = 0

  ui.started = false
  ui.running = false
  ui.gameOver = false
  ui.survivalSeconds = 0
  ui.difficultyLabel = difficultyDescriptor(0)

  drawFrame()
}

const reportScore = () => {
  if (engine.submittedScore) {
    return
  }

  engine.submittedScore = true
  lobbySocket.submitScore(Number(ui.survivalSeconds.toFixed(3)))
}

const finishGame = () => {
  ui.running = false
  ui.gameOver = true

  if (ui.survivalSeconds > localBestSeconds.value) {
    localBestSeconds.value = Number(ui.survivalSeconds.toFixed(2))
    saveLocalBest()
  }

  broadcastPresence(true, { alive: false })
  reportScore()
}

const updateCollision = (metrics, activeObstacles) => {
  if (hasOpenHexagonCollision({
    metrics,
    obstacles: activeObstacles,
    playerAngle: engine.playerAngle,
    worldRotation: engine.worldRotation,
  })) {
    finishGame()
  }
}
const updateGame = (deltaTime) => {
  if (!isRunningPhase.value || ui.gameOver) {
    return
  }

  const metrics = getMetrics()
  const elapsedSeconds = getRoundElapsedSeconds()
  const difficulty = getDifficultyAt(elapsedSeconds)
  const turnSpeed = 3.9 + difficulty * 0.52

  if (inputState.left) {
    engine.playerAngle -= turnSpeed * deltaTime
  }

  if (inputState.right) {
    engine.playerAngle += turnSpeed * deltaTime
  }

  engine.playerAngle = wrapAngle(engine.playerAngle)
  ui.survivalSeconds = elapsedSeconds
  ui.difficultyLabel = difficultyDescriptor(elapsedSeconds)

  broadcastPresence()
  updateCollision(metrics, getActiveObstacles(metrics, elapsedSeconds))
}

const gameLoop = (timestamp) => {
  frameClockMs.value = Date.now()

  if (!engine.lastFrameTime) {
    engine.lastFrameTime = timestamp
  }

  const deltaTime = clamp((timestamp - engine.lastFrameTime) / 1000, 0, 0.032)
  engine.lastFrameTime = timestamp

  ui.running =
    isRunningPhase.value &&
    (Boolean(localRosterEntry.value?.playing) || Boolean(localRosterEntry.value?.ready)) &&
    !ui.gameOver
  ui.started = isCountdownPhase.value || isRunningPhase.value

  if (isRunningPhase.value && engine.activeRoundNumber !== Number(matchState.value.roundNumber ?? 0)) {
    engine.activeRoundNumber = Number(matchState.value.roundNumber ?? 0)
    engine.playerAngle = DEFAULT_PLAYER_ANGLE
    engine.submittedScore = false
    ui.gameOver = false
  }

  if (isLobbyPhase.value && engine.activeRoundNumber !== 0) {
    engine.activeRoundNumber = 0
    ui.running = false
    ui.started = false
    ui.gameOver = false
    ui.survivalSeconds = 0
    ui.difficultyLabel = difficultyDescriptor(0)
    engine.playerAngle = DEFAULT_PLAYER_ANGLE
  }

  updateGame(deltaTime)
  drawFrame()

  engine.animationId = requestAnimationFrame(gameLoop)
}

const startGame = () => {
  toggleReady()
}

const restartGame = () => {
  engine.playerAngle = DEFAULT_PLAYER_ANGLE
}

const updateCanvasSize = () => {
  const canvas = canvasRef.value
  const surface = surfaceRef.value

  if (!canvas || !surface) {
    return
  }

  const rect = surface.getBoundingClientRect()
  const width = Math.max(rect.width, 320)
  const height = Math.max(rect.height, 420)
  const ratio = window.devicePixelRatio || 1

  viewport.width = width
  viewport.height = height

  canvas.width = Math.floor(width * ratio)
  canvas.height = Math.floor(height * ratio)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const context = canvas.getContext('2d')
  context.setTransform(ratio, 0, 0, ratio, 0, 0)

  drawFrame()
}

const onKeyDown = (event) => {
  if (['ArrowLeft', 'a', 'A'].includes(event.key)) {
    inputState.left = true
  }

  if (['ArrowRight', 'd', 'D'].includes(event.key)) {
    inputState.right = true
  }

  if (event.code === 'Space' && isLobbyPhase.value) {
    event.preventDefault()
    startGame()
  }
}

const onKeyUp = (event) => {
  if (['ArrowLeft', 'a', 'A'].includes(event.key)) {
    inputState.left = false
  }

  if (['ArrowRight', 'd', 'D'].includes(event.key)) {
    inputState.right = false
  }
}

const handlePress = (direction, pressed) => {
  inputState[direction] = pressed
}

watch(
  playerRoster,
  () => {
    if (!ui.running) {
      drawFrame()
    }
  },
  { deep: true },
)

watch(
  () => matchState.value.serverTime,
  (serverTime) => {
    const parsed = parseServerTime(serverTime)
    if (parsed) {
      serverClockOffsetMs.value = parsed - Date.now()
    }
  },
  { immediate: true },
)

watch(
  () => localRosterEntry.value?.alive,
  (alive) => {
    if (isRunningPhase.value && alive === false) {
      ui.gameOver = true
      ui.running = false
    }
  },
)

onMounted(async () => {
  if (!authStore.token) {
    authStore.checkLogin()
  }

  loadLocalBest()
  updateCanvasSize()
  resetGame()
  await loadAvatars()
  engine.animationId = requestAnimationFrame(gameLoop)

  window.addEventListener('resize', updateCanvasSize)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  try {
    await lobbySocket.ensureConnection(buildJoinPayload())
    broadcastPresence(true, { alive: true, scoreSeconds: 0 })
  } catch (error) {
    console.error('Failed to initialize the Open Hexagon lobby:', error)
  }
})

onUnmounted(() => {
  stopLoop()
  lobbySocket.leave()
  window.removeEventListener('resize', updateCanvasSize)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<template>
  <section class="open-hexagon-page">
    <div class="hero-panel">
      <div>
        <p class="eyebrow">Easter Egg</p>
        <h1>Open Hexagon</h1>
        <p class="hero-copy">
          Avatars are now assigned by the server, all pilots share one countdown,
          and the incoming walls are synchronized from the same match pattern queue.
        </p>
      </div>

      <div class="hero-actions">
        <button class="primary-button" :disabled="isRunningPhase" @click="startGame">
          {{ primaryButtonLabel }}
        </button>
        <button class="secondary-button" @click="restartGame">
          Recenter ship
        </button>
      </div>
    </div>

    <div class="game-layout">
      <div class="game-shell">
        <div class="status-strip">
          <div class="status-card">
            <span class="status-label">Current</span>
            <strong>{{ formatSeconds(ui.survivalSeconds) }}</strong>
          </div>
          <div class="status-card">
            <span class="status-label">Best local</span>
            <strong>{{ formatSeconds(localBestSeconds) }}</strong>
          </div>
          <div class="status-card">
            <span class="status-label">Match</span>
            <strong>{{ matchStatusLabel }}</strong>
          </div>
          <div class="status-card">
            <span class="status-label">Ready</span>
            <strong>{{ readyCount }}/{{ playerCount }}</strong>
          </div>
          <div class="status-card" :class="`state-${connectionState}`">
            <span class="status-label">Socket</span>
            <strong>{{ connectionState }}</strong>
          </div>
        </div>

        <div ref="surfaceRef" class="canvas-surface">
          <canvas ref="canvasRef" class="game-canvas"></canvas>
        </div>

        <div class="control-row">
          <button
            class="control-button"
            @touchstart.prevent="handlePress('left', true)"
            @touchend.prevent="handlePress('left', false)"
            @mousedown.prevent="handlePress('left', true)"
            @mouseup.prevent="handlePress('left', false)"
            @mouseleave.prevent="handlePress('left', false)"
          >
            Rotate left
          </button>
          <button
            class="control-button"
            @touchstart.prevent="handlePress('right', true)"
            @touchend.prevent="handlePress('right', false)"
            @mousedown.prevent="handlePress('right', true)"
            @mouseup.prevent="handlePress('right', false)"
            @mouseleave.prevent="handlePress('right', false)"
          >
            Rotate right
          </button>
        </div>

        <p v-if="socketError" class="socket-error">{{ socketError }}</p>
      </div>

      <aside class="info-rail">
        <section class="info-card">
          <div class="card-head">
            <h2>Live lobby</h2>
            <span class="pill">{{ lobby.onlineCount }} online</span>
          </div>
          <p class="muted-copy">
            Avatar assignment, ready state, countdown, and live position are all synchronized through STOMP.
          </p>
          <ul class="player-list">
            <li
              v-for="player in playerRoster"
              :key="player.userIdx"
              class="player-item"
              :class="{ active: player.playing }"
            >
              <div class="player-meta">
                <img
                  class="player-avatar"
                  :src="getPlayerAvatarSrc(player)"
                  :alt="player.nickname"
                  :style="{
                    borderColor: getPlayerAccent(player),
                    boxShadow: `0 0 0 3px ${toRgba(getPlayerAccent(player), 0.18)}`,
                  }"
                />
                <div>
                  <strong>{{ player.nickname }}</strong>
                  <small>
                    {{ player.playing ? 'Playing now' : player.ready ? 'Ready' : 'Idle in lobby' }}
                  </small>
                </div>
              </div>
              <small>{{ formatSeconds(player.currentScore) }}</small>
            </li>
            <li v-if="!playerRoster.length" class="player-item empty">No pilots connected yet.</li>
          </ul>
        </section>

        <section class="info-card">
          <div class="card-head">
            <h2>Leaderboard</h2>
            <span class="pill accent">Live</span>
          </div>
          <ol class="leaderboard">
            <li
              v-for="entry in leaderboardEntries"
              :key="entry.userIdx"
              class="leaderboard-item"
              :class="{ mine: Number(entry.userIdx) === myUserId }"
            >
              <div class="player-meta">
                <img
                  class="player-avatar"
                  :src="getPlayerAvatarSrc(entry)"
                  :alt="entry.nickname"
                  :style="{
                    borderColor: getPlayerAccent(entry),
                    boxShadow: `0 0 0 3px ${toRgba(getPlayerAccent(entry), 0.18)}`,
                  }"
                />
                <div>
                  <strong>{{ entry.nickname }}</strong>
                  <small>{{ formatUpdatedAt(entry.updatedAt) }}</small>
                </div>
              </div>
              <span>{{ formatSeconds(entry.bestScore) }}</span>
            </li>
            <li v-if="!leaderboardEntries.length" class="leaderboard-item empty">
              No scores posted yet.
            </li>
          </ol>
        </section>

        <section class="info-card">
          <div class="card-head">
            <h2>Controls</h2>
          </div>
          <ul class="tip-list">
            <li><code>A</code> / <code>D</code> or arrow keys rotate the avatar.</li>
            <li>Everyone must ready up before the 3 second countdown begins.</li>
            <li>The round uses one shared pattern schedule for every screen.</li>
            <li>Each player gets a server-assigned avatar image and color.</li>
            <li>Open it from the profile dropdown Games menu.</li>
          </ul>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped src="./OpenHexagonArena.css"></style>
