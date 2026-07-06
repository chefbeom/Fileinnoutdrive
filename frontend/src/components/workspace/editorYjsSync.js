import { parseEditorSnapshot } from './editorSnapshot.js'

export const createEditorYjsSyncController = ({
  getEditor = () => null,
  yMap,
  runLocalTransaction = (callback) => callback(),
  onRemoteRender = () => {},
  localSyncDelayMs = 100,
  remoteRenderReleaseDelayMs = 50,
  setTimeoutImpl = (callback, delay) => setTimeout(callback, delay),
  clearTimeoutImpl = (timer) => clearTimeout(timer),
  logger = console,
} = {}) => {
  let suppressLocal = false
  let isRendering = false
  let pendingYVal = null
  let remoteRenderInFlight = false
  let localSyncTimer = null
  let remoteRenderReleaseTimer = null
  let currentRenderedContents = ''
  let pendingLocalSnapshot = null

  const isLocalSuppressed = () => suppressLocal || isRendering

  const setRenderedSnapshot = (snapshot = {}) => {
    currentRenderedContents = JSON.stringify(snapshot)
  }

  const runWithLocalSuppressed = async (callback) => {
    suppressLocal = true
    isRendering = true

    try {
      return await callback({ setRenderedSnapshot })
    } finally {
      suppressLocal = false
      isRendering = false
    }
  }

  const syncEditorToYjs = async (serializedSnapshot = null) => {
    const editor = getEditor()
    if (suppressLocal || isRendering || !editor) {
      return
    }

    try {
      const newString =
        typeof serializedSnapshot === 'string'
          ? serializedSnapshot
          : JSON.stringify(await editor.save())
      if (yMap?.get?.('contents') === newString) {
        currentRenderedContents = newString
        return
      }

      runLocalTransaction(() => {
        yMap?.set?.('contents', newString)
      })

      currentRenderedContents = newString
    } catch (error) {
      logger?.error?.('[YJS] local editor sync failed', error)
    }
  }

  const scheduleLocalSync = (savedSnapshot = null) => {
    if (suppressLocal || isRendering) {
      return
    }

    if (savedSnapshot) {
      pendingLocalSnapshot = JSON.stringify(savedSnapshot)
    }

    clearTimeoutImpl(localSyncTimer)
    localSyncTimer = setTimeoutImpl(() => {
      const nextSnapshot = pendingLocalSnapshot
      pendingLocalSnapshot = null
      void syncEditorToYjs(nextSnapshot)
    }, localSyncDelayMs)
  }

  async function renderFromY(yval) {
    if (!yval || yval === '""' || yval === '') {
      return
    }

    const editor = getEditor()
    if (!editor) {
      pendingYVal = yval
      return
    }

    if (isRendering || remoteRenderInFlight) {
      pendingYVal = yval
      return
    }

    const parsed = parseEditorSnapshot(yval, {
      onError: (error) => logger?.warn?.('[YJS] failed to parse editor snapshot', error),
    })
    const serialized = JSON.stringify(parsed)

    if (!serialized || serialized === currentRenderedContents) {
      return
    }

    remoteRenderInFlight = true
    isRendering = true
    suppressLocal = true

    try {
      await editor.isReady
      await editor.render(parsed)
      currentRenderedContents = serialized
      onRemoteRender(parsed.blocks || [], parsed)
    } catch (error) {
      logger?.warn?.('[YJS] remote render failed', error)
    } finally {
      remoteRenderReleaseTimer = setTimeoutImpl(() => {
        suppressLocal = false
        isRendering = false
        remoteRenderInFlight = false
        remoteRenderReleaseTimer = null

        if (!pendingYVal) {
          return
        }

        const nextYVal = pendingYVal
        pendingYVal = null
        if (nextYVal !== yval) {
          void renderFromY(nextYVal).catch((error) => {
            logger?.warn?.('[YJS] pending remote render flush failed', error)
          })
        }
      }, remoteRenderReleaseDelayMs)
    }
  }

  const flushPendingRender = async () => {
    if (isRendering || remoteRenderInFlight || !pendingYVal) {
      return
    }

    const nextYVal = pendingYVal
    pendingYVal = null
    await renderFromY(nextYVal)
  }

  const destroy = () => {
    clearTimeoutImpl(localSyncTimer)
    clearTimeoutImpl(remoteRenderReleaseTimer)
    localSyncTimer = null
    remoteRenderReleaseTimer = null
    pendingYVal = null
    pendingLocalSnapshot = null
  }

  return {
    destroy,
    flushPendingRender,
    isLocalSuppressed,
    renderFromY,
    runWithLocalSuppressed,
    scheduleLocalSync,
    setRenderedSnapshot,
    syncEditorToYjs,
  }
}
