import EditorJS from '@editorjs/editorjs'
import Header from '@editorjs/header'
import List from '@editorjs/list'
import Quote from '@editorjs/quote'
import Table from '@editorjs/table'
import CodeTool from '@editorjs/code'
import Embed from '@editorjs/embed'
import ImageTool from '@editorjs/image'
import LinkTool from '@editorjs/link'
import InlineCode from '@editorjs/inline-code'
import Delimiter from '@editorjs/delimiter'
import Marker from '@editorjs/marker'
import Warning from '@editorjs/warning'

import AlignmentTuneTool from 'editorjs-text-alignment-blocktune'
import YouTubeEmbed from 'editorjs-youtube-embed'

import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

import { ref } from 'vue'
import postApi from '@/api/postApi.js'
import { getYjsStatusUrl, getYjsWebsocketUrl } from '@/utils/yjsUrl.js'
import loadpost from './loadpost.js'
import {
  colorForIdentity,
  decodeTokenPayload,
  safeString,
} from './editorIdentity.js'
import {
  collectBlockText,
  createDocumentOutline,
  createDocumentStats,
  createDocumentTasks,
} from './editorDocumentAnalysis.js'
import {
  buildWorkspacePageLinkBlock,
  buildWorkspaceQuickBlock,
} from './editorBlockFactory.js'
import {
  appendChecklistTaskToSnapshot,
  toggleChecklistTaskInSnapshot,
} from './editorTaskMutations.js'
import {
  applyBlockCommentDecorationsToHolder,
  clearBlockCommentDecorations,
  createBlockCommentSummaryMap,
} from './editorBlockComments.js'
import { createEditorBlockSelectionController } from './editorBlockSelectionController.js'
import {
  createInitialEditorSnapshotState,
  parseEditorSnapshot,
  withWorkspaceProperties,
} from './editorSnapshot.js'
import {
  createImageAssetMap,
  listRemovedImageAssetIds,
} from './editorImageAssets.js'
import {
  bindEditorTitleRef,
  resolveEditorSaveTitle,
  seedInitialTitleIfEmpty,
  updateEditorTitleFromLocal,
} from './editorTitleBinding.js'
import { createRealtimeStatusLogger } from './editorRealtimeStatus.js'
import { createEditorYjsSyncController } from './editorYjsSync.js'
import {
  createAwarenessViewModel,
  createLocalAwarenessState,
} from './editorAwareness.js'
import { createHiddenCursorPresenceFields } from './editorPresenceEvents.js'
import { createEditorPresenceController } from './editorPresenceController.js'

export async function initEditor(holderElement, room, initialData, idx, initialTitle, isPrivate, options = {}) {
  if (!holderElement) throw new Error('holderElement is required')

  const ydoc = new Y.Doc()
  let provider = null
  let currentIdx = idx ?? null
  const realtimeWorkspaceIdx = Number(currentIdx)
  const shouldConnectRealtime = !isPrivate && Number.isFinite(realtimeWorkspaceIdx) && realtimeWorkspaceIdx > 0
  const connectionStatusRef = ref(shouldConnectRealtime ? 'connecting' : 'private')

  if (shouldConnectRealtime) {
    const realtimeProviderOptions = options?.accessToken
      ? { params: { accessToken: options.accessToken } }
      : {}
    provider = new WebsocketProvider(getYjsWebsocketUrl(), room, ydoc, realtimeProviderOptions)
  }

  const realtimeStatusLogger = createRealtimeStatusLogger({
    statusUrl: shouldConnectRealtime ? getYjsStatusUrl() : null,
    fetchImpl: typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null,
    logger: console,
    setIntervalImpl: (callback, delay) => window.setInterval(callback, delay),
    clearIntervalImpl: (timer) => window.clearInterval(timer),
  })
  const yMap         = ydoc.getMap('workspace_data')
  const yTitle       = ydoc.getText('title')
  const yPermissions = ydoc.getMap('permissions')
  const LOCAL_EDIT_ORIGIN = Symbol('local-edit-origin')
  let hasSeededInitialTitle = false
  let hasSeededInitialContents = false

  const initialSnapshotState = createInitialEditorSnapshotState(initialData, {
    onError: (error) => console.warn('Initial data parsing failed', error),
  })
  const hasInitialBlocks = initialSnapshotState.hasInitialBlocks
  const initialContentsString = initialSnapshotState.contentsString

  const runLocalTransaction = (callback) => {
    ydoc.transact(callback, LOCAL_EDIT_ORIGIN)
  }

  const seedInitialTitleIfNeeded = () => {
    if (hasSeededInitialTitle) {
      return
    }
    hasSeededInitialTitle = true
    seedInitialTitleIfEmpty({ yTitle, initialTitle, runLocalTransaction })
  }

  const seedInitialContentsIfNeeded = () => {
    if (hasSeededInitialContents) {
      return
    }

    hasSeededInitialContents = true
    if (!initialContentsString || yMap.get('contents')) {
      return
    }

    runLocalTransaction(() => {
      yMap.set('contents', initialContentsString)
    })
  }

  if (provider) {
    provider.on('status', ({ status }) => {
      connectionStatusRef.value = status
      if (status === 'connected') {
        realtimeStatusLogger.start()
        return
      }

      if (status === 'disconnected') {
        realtimeStatusLogger.stop()
      }
    })

    provider.on('sync', (isSynced) => {
      if (isSynced) {
        connectionStatusRef.value = 'synced'
      }
      if (!isSynced) return
      seedInitialTitleIfNeeded()
      seedInitialContentsIfNeeded()
    })
  } else {
    seedInitialTitleIfNeeded()
    seedInitialContentsIfNeeded()
  }

  const awareness        = provider ? provider.awareness : null
  const remoteCursorsRef = ref({})
  const activeUsersRef   = ref([])

  const tokenPayload = decodeTokenPayload(options?.accessToken)
  const providedUser = options?.currentUser || tokenPayload || {}
  const myUserIdx = providedUser.idx ?? providedUser.userIdx ?? providedUser.userId ?? tokenPayload?.idx ?? null
  const myEmail = safeString(providedUser.email) || safeString(tokenPayload?.email)
  const myName =
    safeString(providedUser.name) ||
    safeString(providedUser.username) ||
    safeString(providedUser.nickname) ||
    safeString(tokenPayload?.name) ||
    safeString(tokenPayload?.username) ||
    safeString(tokenPayload?.nickname) ||
    myEmail ||
    `사용자 ${String(ydoc.clientID).slice(-4)}`
  const myColor = colorForIdentity(myUserIdx ?? myEmail ?? myName, ydoc.clientID)
  const userRole = String(options?.userRole ?? 'READ').toUpperCase()
  const initialReadOnly = Boolean(options?.readOnly) || userRole === 'READ'
  const localUserState = {
    name: myName,
    color: myColor,
    clientId: ydoc.clientID,
    role: userRole,
    userIdx: myUserIdx,
    email: myEmail,
  }
  const nowIso = () => new Date().toISOString()
  const PRESENCE_IDLE_TIMEOUT_MS = 90000
  let presenceIdleTimer = null

  const setLocalAwarenessState = (fields = {}) => {
    if (!awareness) return
    awareness.setLocalState(createLocalAwarenessState({
      previous: awareness.getLocalState() || {},
      localUserState,
      fields,
      activeAt: nowIso(),
    }))
  }

  const clearPresenceIdleTimer = () => {
    if (!presenceIdleTimer) return
    clearTimeout(presenceIdleTimer)
    presenceIdleTimer = null
  }

  const markPresenceAway = (fields = {}) => {
    if (!awareness) return
    clearPresenceIdleTimer()
    setLocalAwarenessState({
      ...fields,
      presence: {
        ...(fields.presence || {}),
        status: 'away',
      },
    })
  }

  const schedulePresenceIdle = () => {
    clearPresenceIdleTimer()
    if (!awareness || (typeof document !== 'undefined' && document.hidden)) return
    presenceIdleTimer = setTimeout(() => {
      presenceIdleTimer = null
      markPresenceAway(createHiddenCursorPresenceFields({ activeAt: nowIso(), reason: 'idle' }))
    }, PRESENCE_IDLE_TIMEOUT_MS)
  }

  const markPresenceActive = (fields = {}) => {
    if (!awareness) return
    setLocalAwarenessState({
      ...fields,
      presence: {
        ...(fields.presence || {}),
        status: 'active',
      },
    })
    schedulePresenceIdle()
  }

  // ─── awareness 업데이트 핸들러 ────────────────────────────────────────────
  function runAwarenessUpdate() {
    if (!awareness) return
    const { remoteCursors, activeUsers } = createAwarenessViewModel(awareness.getStates(), {
      localClientId: ydoc.clientID,
      fallbackIdentity: ydoc.clientID,
    })
    remoteCursorsRef.value = remoteCursors
    activeUsersRef.value = activeUsers
  }

  if (awareness) {
    awareness.on('update', runAwarenessUpdate)
    markPresenceActive()
    runAwarenessUpdate()
  }

  yPermissions.observe(() => {
    if (yPermissions.get(String(ydoc.clientID)) === 'redirect') {
      window.location.href = '/workspace'
    }
  })

  // ─── 이미지 업로드 설정 ────────────────────────────────────────────────────
  const trackedImageAssets = new Map()
  const imageToolConfig = {
    class: ImageTool,
    config: {
      uploader: {
        async uploadByFile(files) {
          try {
            if (!currentIdx) {
              await savePost()
              if (!currentIdx) throw new Error('게시물 생성에 실패하여 이미지를 업로드할 수 없습니다.')
            }
            const result = await postApi.uploadEditorJsImage(currentIdx, files)
            if (result?.file?.assetIdx) {
              trackedImageAssets.set(result.file.assetIdx, true)
            }
            return result
          } catch (e) {
            console.error('[Editor] 이미지 업로드 실패:', e)
            return { success: 0, message: e.message || '업로드 중 오류가 발생했습니다.' }
          }
        },
      },
    },
  }

  const tools = {
    header:     { class: Header, tunes: ['alignment'], config: { levels: [1, 2, 3, 4], defaultLevel: 1 } },
    list:       { class: List, inlineToolbar: true, tunes: ['alignment'] },
    quote:      { class: Quote, inlineToolbar: true, tunes: ['alignment'] },
    table:      { class: Table, inlineToolbar: true },
    code:       { class: CodeTool },
    embed:      { class: Embed, inlineToolbar: false },
    image:      imageToolConfig,
    linkTool:   { class: LinkTool },
    inlineCode: { class: InlineCode },
    delimiter:  Delimiter,
    marker:     Marker,
    warning:    Warning,
    alignment:  { class: AlignmentTuneTool, config: { default: 'left' } },
    youtube:    { class: YouTubeEmbed },
  }

  let editor                = null
  let yjsSyncController     = null
  let previousImageAssets   = new Map()
  let titleObserver         = null
  let blockCommentSummaryMap = new Map()
  let blockSelectionController = null

  const isDirtyRef = ref(false)
  const selectedBlockAnchorRef = ref(null)
  const documentOutlineRef = ref([])
  const documentTasksRef = ref([])
  const documentSearchTextRef = ref('')
  const documentWorkspaceLinksRef = ref([])
  const readOnlyRef = ref(initialReadOnly)
  const documentStatsRef = ref({
    blockCount: 0,
    textBlockCount: 0,
    characterCount: 0,
    wordCount: 0,
    imageCount: 0,
    checklistBlockCount: 0,
  })

  blockSelectionController = createEditorBlockSelectionController({
    getEditor: () => editor,
    holderElement,
    selectedBlockAnchorRef,
    getActiveElement: () => document.activeElement,
    setTimeoutImpl: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeoutImpl: (timer) => window.clearTimeout(timer),
    logger: console,
  })
  const captureCurrentBlockAnchor = () => blockSelectionController.captureCurrentBlockAnchor()
  const clearSelectedBlockAnchor = () => blockSelectionController.clearSelectedBlockAnchor()
  const focusBlockAnchor = (anchorBlockId) => blockSelectionController.focusBlockAnchor(anchorBlockId)

  const markDirty = () => {
    isDirtyRef.value = true
    if (typeof options?.onLocalChange === 'function') {
      options.onLocalChange()
    }
  }

  const markSaved = () => {
    isDirtyRef.value = false
  }
  const isReadOnly = () => Boolean(readOnlyRef.value)

  const setReadOnly = async (nextReadOnly = false) => {
    const enabled = Boolean(nextReadOnly)
    if (readOnlyRef.value === enabled) return enabled
    readOnlyRef.value = enabled

    if (!editor?.readOnly || typeof editor.readOnly.toggle !== 'function') {
      return enabled
    }

    try {
      await editor.isReady
      await editor.readOnly.toggle(enabled)
    } catch (error) {
      console.warn('[Editor] readOnly toggle failed', error)
    }
    return enabled
  }

  const refreshImageAssetSnapshot = (blocks = []) => {
    previousImageAssets = createImageAssetMap(blocks)
  }

  const updateDocumentOutline = (blocks = []) => {
    documentOutlineRef.value = createDocumentOutline(blocks)
  }

  const updateDocumentTasks = (blocks = []) => {
    documentTasksRef.value = createDocumentTasks(blocks)
  }

  const updateDocumentStats = (blocks = []) => {
    const { stats, searchText, workspaceLinks } = createDocumentStats(blocks)
    documentStatsRef.value = stats
    documentSearchTextRef.value = searchText
    documentWorkspaceLinksRef.value = workspaceLinks
  }

  const renderTaskSnapshot = async (snapshot) => yjsSyncController.runWithLocalSuppressed(async ({ setRenderedSnapshot }) => {
    await editor.render(snapshot)
    const saved = await editor.save()
    setRenderedSnapshot(saved)
    refreshImageAssetSnapshot(saved.blocks || [])
    updateDocumentOutline(saved.blocks || [])
    updateDocumentTasks(saved.blocks || [])
    updateDocumentStats(saved.blocks || [])
    applyBlockCommentSummaries([...blockCommentSummaryMap.values()])
    return saved
  })

  const toggleChecklistTask = async (task) => {
    if (!editor || isReadOnly() || !task?.anchorBlockId) return false
    let saved = null

    try {
      await editor.isReady
      const snapshot = await editor.save()
      const mutation = toggleChecklistTaskInSnapshot(snapshot, task)
      if (!mutation.changed) return false

      saved = await renderTaskSnapshot(snapshot)
    } catch (error) {
      console.warn('[Editor] checklist task toggle failed', error)
      return false
    }

    if (!saved) return false
    markDirty()
    scheduleLocalSync(saved)
    return true
  }

  const appendChecklistTask = async (input) => {
    if (!editor || isReadOnly()) return false

    let saved = null
    let targetAnchorBlockId = ''

    try {
      await editor.isReady
      const snapshot = await editor.save()
      const mutation = appendChecklistTaskToSnapshot(snapshot, input)
      if (!mutation.changed) return false
      targetAnchorBlockId = mutation.anchorBlockId

      saved = await renderTaskSnapshot(snapshot)
    } catch (error) {
      console.warn('[Editor] checklist task append failed', error)
      return false
    }

    if (!saved) return false
    markDirty()
    scheduleLocalSync(saved)
    if (targetAnchorBlockId) {
      window.requestAnimationFrame(() => {
        void focusBlockAnchor(targetAnchorBlockId)
      })
    }
    return true
  }

  const appendWorkspaceBlock = async (input = {}) => {
    if (!editor || isReadOnly()) return false

    let saved = null
    let targetAnchorBlockId = ''

    try {
      await editor.isReady
      const snapshot = await editor.save()
      const blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : []
      snapshot.blocks = blocks
      const nextBlock = buildWorkspaceQuickBlock(input)
      blocks.push(nextBlock)
      targetAnchorBlockId = nextBlock.id
      saved = await renderTaskSnapshot(snapshot)
    } catch (error) {
      console.warn('[Editor] workspace quick block append failed', error)
      return false
    }

    if (!saved) return false
    markDirty()
    scheduleLocalSync(saved)
    window.requestAnimationFrame(() => {
      void focusBlockAnchor(targetAnchorBlockId)
    })
    return true
  }

  const appendWorkspacePageLink = async (input = {}) => {
    const nextBlock = buildWorkspacePageLinkBlock(input)
    if (!editor || isReadOnly() || !nextBlock) return false

    let saved = null
    const targetAnchorBlockId = nextBlock.id

    try {
      await editor.isReady
      const snapshot = await editor.save()
      const blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : []
      snapshot.blocks = blocks
      blocks.push(nextBlock)

      saved = await renderTaskSnapshot(snapshot)
    } catch (error) {
      console.warn('[Editor] workspace page link append failed', error)
      return false
    }

    if (!saved) return false
    markDirty()
    scheduleLocalSync(saved)
    window.requestAnimationFrame(() => {
      void focusBlockAnchor(targetAnchorBlockId)
    })
    return true
  }


  const applyBlockCommentDecorations = async () => {
    if (!editor) return
    try {
      await editor.isReady
      clearBlockCommentDecorations(holderElement)
      if (!blockCommentSummaryMap.size) return

      const snapshot = await editor.save()
      applyBlockCommentDecorationsToHolder({
        holderElement,
        blocks: snapshot.blocks || [],
        summaryMap: blockCommentSummaryMap,
        onSelectAnchor: (anchor) => {
          selectedBlockAnchorRef.value = anchor
        },
        onBadgeClick: options?.onBlockCommentBadgeClick,
      })
    } catch (error) {
      console.warn('[Editor] block comment decoration failed', error)
    }
  }

  const applyBlockCommentSummaries = (summaries = []) => {
    blockCommentSummaryMap = createBlockCommentSummaryMap(summaries)
    window.requestAnimationFrame(() => {
      void applyBlockCommentDecorations()
    })
  }

  yjsSyncController = createEditorYjsSyncController({
    getEditor: () => editor,
    yMap,
    runLocalTransaction,
    onRemoteRender: (blocks = []) => {
      refreshImageAssetSnapshot(blocks)
      updateDocumentOutline(blocks)
      updateDocumentTasks(blocks)
      updateDocumentStats(blocks)
      applyBlockCommentSummaries([...blockCommentSummaryMap.values()])
    },
    setTimeoutImpl: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeoutImpl: (timer) => window.clearTimeout(timer),
    logger: console,
  })
  const scheduleLocalSync = (savedSnapshot = null) => yjsSyncController.scheduleLocalSync(savedSnapshot)
  const renderFromY = (yval) => yjsSyncController.renderFromY(yval)
  const flushPendingRender = () => yjsSyncController.flushPendingRender()

  const applyDocumentTemplate = async (templateData, applyOptions = {}) => {
    if (!editor || isReadOnly()) return null
    try {
      await editor.isReady
      const parsed = parseEditorSnapshot(templateData, {
        onError: (error) => console.warn('[Editor] failed to parse document template snapshot', error),
      })
      await editor.render(parsed)
      const saved = await editor.save()
      refreshImageAssetSnapshot(saved.blocks || [])
      updateDocumentOutline(saved.blocks || [])
      updateDocumentTasks(saved.blocks || [])
      updateDocumentStats(saved.blocks || [])
      applyBlockCommentSummaries([...blockCommentSummaryMap.values()])
      yjsSyncController.setRenderedSnapshot(saved)
      if (applyOptions?.markSaved) {
        markSaved()
      } else {
        markDirty()
      }
      scheduleLocalSync(saved)
      return saved
    } catch (error) {
      console.error('[Editor] document template apply failed', error)
      throw error
    }
  }

  const getCurrentSnapshot = async () => {
    if (!editor) return { blocks: [] }
    await editor.isReady
    return withCurrentWorkspaceProperties(await editor.save())
  }

  const withCurrentWorkspaceProperties = (snapshot = {}) => withWorkspaceProperties(snapshot, {
    workspaceProperties: typeof options?.getWorkspaceProperties === 'function'
      ? options.getWorkspaceProperties()
      : null,
    workspaceParent: typeof options?.getWorkspaceParent === 'function'
      ? options.getWorkspaceParent()
      : null,
  })


  // ─── 초기 데이터 파싱 ─────────────────────────────────────────────────────
  const parsedData = initialSnapshotState.snapshot
  yjsSyncController.setRenderedSnapshot(parsedData)

  // ─── EditorJS 인스턴스 ────────────────────────────────────────────────────
  editor = new EditorJS({
    holder:      holderElement,
    placeholder: '명령어 "/" 로 블록 추가',
    data:        parsedData,
    readOnly:    readOnlyRef.value,
    tools,
    onReady: async () => {
      const initialY = yMap.get('contents')
      if (initialY) {
        await renderFromY(initialY)
      } else if (!provider && hasInitialBlocks) {
        runLocalTransaction(() => {
          yMap.set('contents', initialContentsString)
        })
      }

      const initialSaved = await editor.save()
      refreshImageAssetSnapshot(initialSaved.blocks)
      updateDocumentOutline(initialSaved.blocks)
      updateDocumentTasks(initialSaved.blocks)
      updateDocumentStats(initialSaved.blocks)
      applyBlockCommentSummaries([...blockCommentSummaryMap.values()])
      yjsSyncController.setRenderedSnapshot(initialSaved)
      await flushPendingRender()
    },
    onChange: async () => {
      if (yjsSyncController.isLocalSuppressed() || isReadOnly()) return
      markDirty()
      try {
        const saved = await editor.save()

        const currentImageAssets = createImageAssetMap(saved.blocks)
        for (const assetIdx of listRemovedImageAssetIds(previousImageAssets, currentImageAssets)) {
          if (currentIdx) {
            postApi.deleteEditorJsImage(currentIdx, assetIdx).catch(e =>
              console.warn('[Editor] 이미지 삭제 실패:', assetIdx, e)
            )
          }
        }

        previousImageAssets = currentImageAssets
        updateDocumentOutline(saved.blocks)
        updateDocumentTasks(saved.blocks)
        updateDocumentStats(saved.blocks)
        applyBlockCommentSummaries([...blockCommentSummaryMap.values()])

        scheduleLocalSync(saved)
      } catch (err) {
        console.error('editor save failed', err)
      }
    },
  })

  await editor.isReady

  blockSelectionController.bindSelectionEvents()

  // ─── 타이틀 바인딩 ────────────────────────────────────────────────────────
  function bindTitleRef(titleRef) {
    titleObserver = bindEditorTitleRef({
      yTitle,
      titleRef,
      previousObserver: titleObserver,
      localEditOrigin: LOCAL_EDIT_ORIGIN,
    })
  }

  function updateTitleFromLocal(val) {
    return updateEditorTitleFromLocal({
      yTitle,
      value: val,
      isReadOnly: isReadOnly(),
      runLocalTransaction,
    })
  }

  // ─── 저장 ─────────────────────────────────────────────────────────────────
  async function savePost() {
    if (!editor) return
    try {
      await editor.isReady
      const savedData     = withCurrentWorkspaceProperties(await editor.save())
      const resolvedTitle = resolveEditorSaveTitle({ yTitle, initialTitle })
      const postData      = { idx: currentIdx, title: resolvedTitle, contents: JSON.stringify(savedData) }
      const response      = await postApi.savePost(postData)
      const savedIdx      = response?.idx ?? null
      if (savedIdx != null) currentIdx = savedIdx
      await loadpost.side_list()
      markSaved()
      return response
    } catch (e) {
      console.error('savePost error:', e)
    }
  }

  // ─── Y.js 콘텐츠 변경 감지 ────────────────────────────────────────────────
  yMap.observe((event) => {
    if (event?.transaction?.origin === LOCAL_EDIT_ORIGIN) return
    const newContents = yMap.get('contents')
    void renderFromY(newContents)
  })

  // ─── 마우스 커서 트래킹 ────────────────────────────────────────────────────
  const cursorSurface = holderElement.closest('.editor-shell') || holderElement
  const presenceController = createEditorPresenceController({
    isPrivate,
    awareness,
    cursorSurface,
    holderElement,
    documentRef: document,
    windowRef: window,
    nowIso,
    markPresenceActive,
    markPresenceAway,
  })

  function updateUserPermission(clientId, status) {
    yPermissions.set(String(clientId), status)
  }

  // ─── 정리 ─────────────────────────────────────────────────────────────────
  function destroy() {
    presenceController.destroy()
    clearPresenceIdleTimer()
    blockSelectionController.destroy()
    yjsSyncController.destroy()
    clearBlockCommentDecorations(holderElement)
    realtimeStatusLogger.stop()
    if (awareness && typeof awareness.off === 'function') {
      awareness.off('update', runAwarenessUpdate)
    }
    try {
      awareness?.setLocalState?.(null)
    } catch (error) {
      console.warn('[Editor] awareness cleanup failed', error)
    }
    if (titleObserver) {
      yTitle.unobserve(titleObserver)
      titleObserver = null
    }
    try { if (provider) { provider.disconnect(); provider.destroy() } } catch (e) {}
    try { if (editor && typeof editor.destroy === 'function') editor.destroy() } catch (e) {}
    try { if (ydoc) ydoc.destroy() } catch (e) {}
  }
  window.__activeEditorDestroy = destroy

  return {
    editor,
    destroy,
    remoteCursorsRef,
    activeUsersRef,
    isDirtyRef,
    connectionStatusRef,
    selectedBlockAnchorRef,
    documentOutlineRef,
    documentTasksRef,
    documentSearchTextRef,
    documentWorkspaceLinksRef,
    readOnlyRef,
    documentStatsRef,
    updateUserPermission,
    setReadOnly,
    bindTitleRef,
    updateTitleFromLocal,
    captureCurrentBlockAnchor,
    clearSelectedBlockAnchor,
    focusBlockAnchor,
    applyBlockCommentSummaries,
    applyDocumentTemplate,
    toggleChecklistTask,
    appendChecklistTask,
    appendWorkspaceBlock,
    appendWorkspacePageLink,
    getCurrentSnapshot,
    savePost,
    markDirty,
    markSaved,
  }
}
