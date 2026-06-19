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
  clampNumber,
  colorForIdentity,
  decodeTokenPayload,
  readStoredUserInfo,
  safeString,
} from './editorIdentity.js'

export async function initEditor(holderElement, room, initialData, idx, initialTitle, isPrivate, options = {}) {
  if (!holderElement) throw new Error('holderElement is required')

  const ydoc = new Y.Doc()
  let provider = null
  let currentIdx = idx ?? null
  let realtimeStatusTimer = null
  const connectionStatusRef = ref(isPrivate ? 'private' : 'connecting')

  if (!isPrivate) {
    provider = new WebsocketProvider(getYjsWebsocketUrl(), room, ydoc)
  }

  const yjsStatusUrl = !isPrivate ? getYjsStatusUrl() : null

  const stopRealtimeStatusLogging = () => {
    if (realtimeStatusTimer) {
      clearInterval(realtimeStatusTimer)
      realtimeStatusTimer = null
    }
  }

  const logRealtimeStatus = async () => {
    if (!yjsStatusUrl) {
      return
    }

    try {
      const response = await fetch(yjsStatusUrl, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`status request failed: ${response.status}`)
      }

      const status = await response.json()
      console.info(`[RealtimeStatus]
웹소켓 이름 = ${status.websocketName ?? 'unknown'}
Redis 이름 = ${status.redisName ?? 'unknown'}
Redis 주소 = ${status.redisEndpoint ?? 'unknown'}
Redis 연결 상태 = ${status.redisAvailable === true ? '연결됨' : '연결 안 됨'}`)
    } catch (error) {
      console.warn('[RealtimeStatus] status fetch failed', error)
    }
  }

  const startRealtimeStatusLogging = () => {
    if (!yjsStatusUrl || realtimeStatusTimer) {
      return
    }

    void logRealtimeStatus()
    realtimeStatusTimer = window.setInterval(() => {
      void logRealtimeStatus()
    }, 5000)
  }

  const yMap         = ydoc.getMap('workspace_data')
  const yTitle       = ydoc.getText('title')
  const yPermissions = ydoc.getMap('permissions')
  const LOCAL_EDIT_ORIGIN = Symbol('local-edit-origin')
  let hasSeededInitialTitle = false
  let hasSeededInitialContents = false

  let initialParsedData = { blocks: [] }
  try {
    if (typeof initialData === 'string' && initialData.trim() !== '' && initialData !== '""') {
      initialParsedData = JSON.parse(initialData)
    } else if (initialData && typeof initialData === 'object' && initialData.blocks) {
      initialParsedData = initialData
    }
  } catch (e) {
    console.warn('Initial data parsing failed', e)
  }

  const hasInitialBlocks = Array.isArray(initialParsedData.blocks) && initialParsedData.blocks.length > 0
  const initialContentsString = hasInitialBlocks ? JSON.stringify(initialParsedData) : ''

  const runLocalTransaction = (callback) => {
    ydoc.transact(callback, LOCAL_EDIT_ORIGIN)
  }

  const seedInitialTitleIfNeeded = () => {
    if (hasSeededInitialTitle) {
      return
    }

    hasSeededInitialTitle = true
    const fallbackTitle = String(initialTitle ?? '')
    if (!fallbackTitle || yTitle.toString() !== '') {
      return
    }

    runLocalTransaction(() => {
      yTitle.insert(0, fallbackTitle)
    })
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
        startRealtimeStatusLogging()
        return
      }

      if (status === 'disconnected') {
        stopRealtimeStatusLogging()
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

  const tokenPayload = decodeTokenPayload(localStorage.getItem('ACCESS_TOKEN'))
  const storedUser = readStoredUserInfo()
  const providedUser = options?.currentUser || storedUser || tokenPayload || {}
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
    const previous = awareness.getLocalState() || {}
    const nextUser = {
      ...(previous.user || {}),
      ...localUserState,
      ...(fields.user || {}),
    }
    const nextPresence = {
      ...(previous.presence || {}),
      status: 'active',
      lastActiveAt: nowIso(),
      ...(fields.presence || {}),
    }
    awareness.setLocalState({
      ...previous,
      ...fields,
      user: nextUser,
      presence: nextPresence,
    })
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
      markPresenceAway({
        mouse: { visible: false, lastActiveAt: nowIso() },
        presence: { reason: 'idle' },
      })
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
    const states   = awareness.getStates()
    const remotes  = {}
    const userList = []

    states.forEach((state, clientId) => {
      if (!state || !state.user) return

      userList.push({
        clientId: String(clientId),
        name:     safeString(state.user.name) || `사용자 ${String(clientId).slice(-4)}`,
        color:    state.user.color || colorForIdentity(state.user.userIdx ?? state.user.email ?? clientId, ydoc.clientID),
        isMe:     clientId === ydoc.clientID,
        role:     String(state.user.role ?? 'READ').toUpperCase(),
        userIdx:  state.user.userIdx ?? null,     // ✅ 백엔드 유저 ID
        email:    safeString(state.user.email),
        initial:  (safeString(state.user.name) || safeString(state.user.email) || '?').slice(0, 1).toUpperCase(),
        status:   state.presence?.status || 'active',
        lastActiveAt: state.presence?.lastActiveAt || null,
      })

      if (clientId === ydoc.clientID) return

      const mouse = state.mouse || {}
      if (mouse.visible !== false && mouse.x != null && mouse.y != null) {
        remotes[clientId] = {
          name:  safeString(state.user.name) || `사용자 ${String(clientId).slice(-4)}`,
          color: state.user.color || colorForIdentity(state.user.userIdx ?? state.user.email ?? clientId, ydoc.clientID),
          style: {
            position:   'absolute',
            left:       `${clampNumber(mouse.x)}%`,
            top:        `${clampNumber(mouse.y)}%`,
            willChange: 'left, top',
            transition: 'none',
          },
        }
      }
    })

    remoteCursorsRef.value = remotes
    activeUsersRef.value = userList.sort((left, right) => {
      if (left.isMe !== right.isMe) return left.isMe ? -1 : 1
      return left.name.localeCompare(right.name, 'ko')
    })
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
  let suppressLocal         = false
  let isRendering           = false
  let previousImageAssets   = new Map()
  let pendingYVal           = null
  let remoteRenderInFlight  = false
  let localSyncTimer        = null
  let currentRenderedContents = ''
  let pendingLocalSnapshot  = null
  let titleObserver         = null
  let selectionAnchorTimer  = null
  let blockCommentSummaryMap = new Map()

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
    previousImageAssets = new Map(
      (blocks || [])
        .filter(b => b.type === 'image' && b.data?.file?.assetIdx)
        .map(b => [b.data.file.assetIdx, true])
    )
  }

  const parseEditorSnapshot = (value) => {
    if (value == null || value === '') {
      return { blocks: [] }
    }

    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed || trimmed === '""') {
        return { blocks: [] }
      }

      try {
        const parsed = JSON.parse(trimmed)
        return parsed && typeof parsed === 'object' ? parsed : { blocks: [] }
      } catch (error) {
        console.warn('[YJS] failed to parse editor snapshot', error)
        return { blocks: [] }
      }
    }

    if (typeof value === 'object') {
      return value && typeof value === 'object' ? value : { blocks: [] }
    }

    return { blocks: [] }
  }

  const blockTypeLabels = {
    header: '제목',
    paragraph: '문단',
    list: '목록',
    quote: '인용',
    table: '표',
    code: '코드',
    image: '이미지',
    embed: '임베드',
    delimiter: '구분선',
    warning: '경고',
    youtube: 'YouTube',
  }

  const stripBlockText = (value) =>
    String(value ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const collectBlockText = (value) => {
    if (value == null) return ''
    if (typeof value === 'string' || typeof value === 'number') {
      return stripBlockText(value)
    }
    if (Array.isArray(value)) {
      return value.map(collectBlockText).filter(Boolean).join(' ')
    }
    if (typeof value === 'object') {
      return ['text', 'caption', 'title', 'message', 'code', 'items', 'content']
        .map((key) => collectBlockText(value[key]))
        .filter(Boolean)
        .join(' ')
    }
    return ''
  }

  const extractWorkspaceReadPathId = (value) => {
    const match = String(value || '').match(/\/workspace\/read\/([^"'<>\s?#/]+)/i)
    if (!match) return ''
    try {
      return decodeURIComponent(match[1])
    } catch {
      return match[1]
    }
  }

  const collectWorkspacePageLinks = (value, block, blockIndex) => {
    if (value == null) return []
    if (Array.isArray(value)) {
      return value.flatMap((item) => collectWorkspacePageLinks(item, block, blockIndex))
    }
    if (typeof value === 'object') {
      return Object.values(value).flatMap((item) => collectWorkspacePageLinks(item, block, blockIndex))
    }
    if (typeof value !== 'string') return []

    const links = []
    const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
    let anchorMatch = anchorRegex.exec(value)
    while (anchorMatch) {
      const attrs = anchorMatch[1] || ''
      const body = anchorMatch[2] || ''
      const idMatch = attrs.match(/\bdata-workspace-page-id=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i)
      const hrefMatch = attrs.match(/\bhref=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i)
      const href = hrefMatch?.[1] || hrefMatch?.[2] || hrefMatch?.[3] || ''
      const documentId = idMatch?.[1] || idMatch?.[2] || idMatch?.[3] || extractWorkspaceReadPathId(href)
      if (documentId) {
        const anchor = blockAnchorFromSnapshot(block, blockIndex)
        links.push({
          documentId: String(documentId),
          title: stripBlockText(body).replace(/^↗\s*/, '').slice(0, 160),
          path: href || `/workspace/read/${encodeURIComponent(String(documentId))}`,
          anchorBlockId: anchor?.anchorBlockId || '',
          anchorText: anchor?.anchorText || '',
          blockIndex,
          source: idMatch ? 'explicit' : 'path',
        })
      }
      anchorMatch = anchorRegex.exec(value)
    }

    const pathRegex = /\/workspace\/read\/([^"'<>\s?#/]+)/gi
    let pathMatch = pathRegex.exec(value)
    while (pathMatch) {
      let documentId = pathMatch[1]
      try {
        documentId = decodeURIComponent(documentId)
      } catch {
        // Keep the raw id when a pasted URL contains malformed escaping.
      }
      if (documentId && !links.some((link) => String(link.documentId) === String(documentId))) {
        const anchor = blockAnchorFromSnapshot(block, blockIndex)
        links.push({
          documentId: String(documentId),
          title: '',
          path: `/workspace/read/${encodeURIComponent(String(documentId))}`,
          anchorBlockId: anchor?.anchorBlockId || '',
          anchorText: anchor?.anchorText || '',
          blockIndex,
          source: 'path',
        })
      }
      pathMatch = pathRegex.exec(value)
    }

    return links
  }

  const blockAnchorFromSnapshot = (block, index) => {
    if (!block) return null
    const type = block.type || 'block'
    const rawText = collectBlockText(block.data)
    return {
      anchorBlockId: block.id || `index-${index}`,
      anchorBlockType: type,
      anchorText: (rawText || `${blockTypeLabels[type] || '블록'} 블록`).slice(0, 255),
    }
  }

  const updateDocumentOutline = (blocks = []) => {
    documentOutlineRef.value = (blocks || [])
      .map((block, index) => {
        if (block?.type !== 'header') return null
        const text = collectBlockText(block.data?.text || block.data)
        if (!text) return null
        const level = Math.min(4, Math.max(1, Number(block.data?.level || 1)))
        return {
          id: block.id || `index-${index}`,
          anchorBlockId: block.id || `index-${index}`,
          anchorBlockType: 'header',
          anchorText: text.slice(0, 255),
          level,
          index,
        }
      })
      .filter(Boolean)
  }

  const collectChecklistTasks = (items = [], block, blockIndex, path = []) => {
    if (!Array.isArray(items)) return []
    const anchorBlockId = block?.id || `index-${blockIndex}`
    return items.flatMap((item, itemIndex) => {
      const currentPath = [...path, itemIndex]
      const nestedItems = Array.isArray(item?.items) ? item.items : []
      const text = collectBlockText(item?.content ?? item?.text ?? item?.label ?? item?.data?.text)
      const meta = item?.meta || {}
      const task = text
        ? [{
            id: `${anchorBlockId}:${currentPath.join('.')}`,
            anchorBlockId,
            anchorBlockType: 'list',
            anchorText: text.slice(0, 255),
            text,
            checked: Boolean(meta.checked ?? item?.checked ?? item?.data?.checked),
            assigneeEmail: safeString(meta.assigneeEmail),
            assigneeName: safeString(meta.assigneeName) || safeString(meta.assigneeEmail),
            dueDate: safeString(meta.dueDate),
            depth: Math.max(0, currentPath.length - 1),
            blockIndex,
            path: currentPath,
            pathLabel: currentPath.map((index) => index + 1).join('.'),
          }]
        : []

      return [
        ...task,
        ...collectChecklistTasks(nestedItems, block, blockIndex, currentPath),
      ]
    })
  }

  const updateDocumentTasks = (blocks = []) => {
    documentTasksRef.value = (blocks || [])
      .flatMap((block, index) => {
        const style = String(block?.data?.style || '').toLowerCase()
        if (block?.type !== 'list' || style !== 'checklist') return []
        return collectChecklistTasks(block.data?.items || [], block, index)
      })
  }

  const countWorkspaceWords = (text) => {
    const normalized = stripBlockText(text)
    if (!normalized) return 0
    return normalized.split(/\s+/).filter(Boolean).length
  }

  const updateDocumentStats = (blocks = []) => {
    const nextStats = {
      blockCount: 0,
      textBlockCount: 0,
      characterCount: 0,
      wordCount: 0,
      imageCount: 0,
      checklistBlockCount: 0,
    }
    const searchParts = []
    const workspaceLinkMap = new Map()

    ;(Array.isArray(blocks) ? blocks : []).forEach((block, blockIndex) => {
      const type = String(block?.type || 'paragraph').toLowerCase()
      const style = String(block?.data?.style || '').toLowerCase()
      const text = collectBlockText(block?.data)

      nextStats.blockCount += 1
      if (text) {
        nextStats.textBlockCount += 1
        nextStats.characterCount += text.length
        nextStats.wordCount += countWorkspaceWords(text)
        searchParts.push(text)
      }
      if (type === 'image') nextStats.imageCount += 1
      if (type === 'list' && style === 'checklist') nextStats.checklistBlockCount += 1

      collectWorkspacePageLinks(block?.data, block, blockIndex).forEach((link) => {
        const key = `${link.documentId}:${link.anchorBlockId || blockIndex}`
        if (!workspaceLinkMap.has(key)) {
          workspaceLinkMap.set(key, link)
        }
      })
    })

    documentStatsRef.value = nextStats
    documentSearchTextRef.value = searchParts.join(' ').replace(/\s+/g, ' ').trim()
    documentWorkspaceLinksRef.value = [...workspaceLinkMap.values()].slice(0, 48)
  }

  const normalizeTaskPath = (task) => {
    if (Array.isArray(task?.path)) {
      return task.path.map((index) => Number(index)).filter((index) => Number.isInteger(index) && index >= 0)
    }

    const id = String(task?.id || '')
    const separatorIndex = id.lastIndexOf(':')
    const pathText = separatorIndex >= 0 ? id.slice(separatorIndex + 1) : String(task?.pathLabel || '')
    return pathText
      .split('.')
      .map((index) => Number(index))
      .filter((index) => Number.isInteger(index) && index >= 0)
  }

  const resolveChecklistTaskTarget = (blocks = [], task = {}) => {
    const path = normalizeTaskPath(task)
    if (!path.length) return null

    const anchorId = String(task.anchorBlockId || '').trim()
    const hintedBlockIndex = Number(task.blockIndex)
    const blockIndex = Number.isInteger(hintedBlockIndex)
      && hintedBlockIndex >= 0
      && String(blocks[hintedBlockIndex]?.id || `index-${hintedBlockIndex}`) === anchorId
      ? hintedBlockIndex
      : blocks.findIndex((block, index) => String(block?.id || `index-${index}`) === anchorId)

    if (blockIndex < 0) return null

    const block = blocks[blockIndex]
    const style = String(block?.data?.style || '').toLowerCase()
    if (block?.type !== 'list' || style !== 'checklist' || !Array.isArray(block.data?.items)) {
      return null
    }

    let currentItems = block.data.items
    let item = null
    for (const index of path) {
      item = currentItems?.[index]
      if (!item) return null
      currentItems = Array.isArray(item.items) ? item.items : []
    }

    return { block, item, blockIndex, path }
  }

  const renderTaskSnapshot = async (snapshot) => {
    suppressLocal = true
    isRendering = true

    try {
      await editor.render(snapshot)
      const saved = await editor.save()
      currentRenderedContents = JSON.stringify(saved)
      refreshImageAssetSnapshot(saved.blocks || [])
      updateDocumentOutline(saved.blocks || [])
      updateDocumentTasks(saved.blocks || [])
      updateDocumentStats(saved.blocks || [])
      applyBlockCommentSummaries([...blockCommentSummaryMap.values()])
      return saved
    } finally {
      suppressLocal = false
      isRendering = false
    }
  }

  const toggleChecklistTask = async (task) => {
    if (!editor || isReadOnly() || !task?.anchorBlockId) return false
    let saved = null

    try {
      await editor.isReady
      const snapshot = await editor.save()
      const target = resolveChecklistTaskTarget(snapshot.blocks || [], task)
      if (!target?.item) return false

      const currentChecked = Boolean(
        target.item?.meta?.checked ?? target.item?.checked ?? target.item?.data?.checked,
      )
      target.item.meta = {
        ...(target.item.meta || {}),
        checked: !currentChecked,
      }

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

  const normalizeChecklistTaskInput = (input) => {
    if (input && typeof input === 'object') {
      return {
        text: input.text,
        assigneeEmail: safeString(input.assigneeEmail),
        assigneeName: safeString(input.assigneeName),
        dueDate: safeString(input.dueDate),
      }
    }
    return { text: input, assigneeEmail: '', assigneeName: '', dueDate: '' }
  }

  const appendChecklistTask = async (input) => {
    const normalizedInput = normalizeChecklistTaskInput(input)
    const content = stripBlockText(normalizedInput.text).slice(0, 255)
    if (!editor || isReadOnly() || !content) return false

    let saved = null
    let targetAnchorBlockId = ''

    try {
      await editor.isReady
      const snapshot = await editor.save()
      const blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : []
      snapshot.blocks = blocks

      const newItem = {
        content,
        meta: {
          checked: false,
          ...(normalizedInput.assigneeEmail ? { assigneeEmail: normalizedInput.assigneeEmail } : {}),
          ...(normalizedInput.assigneeName ? { assigneeName: normalizedInput.assigneeName } : {}),
          ...(normalizedInput.dueDate ? { dueDate: normalizedInput.dueDate } : {}),
        },
        items: [],
      }
      let checklistBlockIndex = blocks.findIndex((block) =>
        block?.type === 'list' && String(block?.data?.style || '').toLowerCase() === 'checklist',
      )

      if (checklistBlockIndex < 0) {
        const nextBlock = {
          id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'list',
          data: {
            style: 'checklist',
            items: [newItem],
          },
        }
        blocks.push(nextBlock)
        checklistBlockIndex = blocks.length - 1
        targetAnchorBlockId = nextBlock.id
      } else {
        const checklistBlock = blocks[checklistBlockIndex]
        checklistBlock.data = {
          ...(checklistBlock.data || {}),
          style: 'checklist',
          items: Array.isArray(checklistBlock.data?.items) ? checklistBlock.data.items : [],
        }
        checklistBlock.data.items.push(newItem)
        targetAnchorBlockId = checklistBlock.id || `index-${checklistBlockIndex}`
      }

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

  const normalizeWorkspacePageLinkInput = (input = {}) => {
    const id = safeString(input.id ?? input.idx ?? input.post_idx)
    const title = stripBlockText(input.title || '제목 없음').slice(0, 160) || '제목 없음'
    const path = safeString(input.path || (id ? `/workspace/read/${encodeURIComponent(id)}` : ''))
    return { id, title, path }
  }

  const createWorkspaceBlockId = (prefix = 'block') =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const normalizeWorkspaceBlockInput = (input = {}) => {
    const type = safeString(input.type || 'paragraph').toLowerCase()
    const text = stripBlockText(input.text || input.title || '').slice(0, 500)
    const level = clampNumber(input.level || 2, 1, 4)
    return { type, text, level }
  }

  const buildWorkspaceQuickBlock = (input = {}) => {
    const normalized = normalizeWorkspaceBlockInput(input)
    const text = escapeHtml(normalized.text)
    const id = createWorkspaceBlockId(`quick-${normalized.type}`)

    if (normalized.type === 'header') {
      return {
        id,
        type: 'header',
        data: { text: text || '새 제목', level: normalized.level },
      }
    }

    if (normalized.type === 'checklist') {
      return {
        id,
        type: 'list',
        data: {
          style: 'checklist',
          items: [{
            content: text || '새 작업',
            meta: { checked: false },
            items: [],
          }],
        },
      }
    }

    if (normalized.type === 'quote') {
      return {
        id,
        type: 'quote',
        data: { text: text || '인용문', caption: '' },
      }
    }

    if (normalized.type === 'warning') {
      return {
        id,
        type: 'warning',
        data: { title: text || '주의', message: '내용을 입력하세요.' },
      }
    }

    if (normalized.type === 'delimiter') {
      return { id, type: 'delimiter', data: {} }
    }

    if (normalized.type === 'table') {
      return {
        id,
        type: 'table',
        data: {
          withHeadings: true,
          content: [
            ['항목', '내용'],
            ['', ''],
          ],
        },
      }
    }

    return {
      id,
      type: 'paragraph',
      data: { text: text || '새 문단' },
    }
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
    const link = normalizeWorkspacePageLinkInput(input)
    if (!editor || isReadOnly() || !link.id || !link.path) return false

    let saved = null
    const targetAnchorBlockId = `workspace-link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    try {
      await editor.isReady
      const snapshot = await editor.save()
      const blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : []
      snapshot.blocks = blocks
      blocks.push({
        id: targetAnchorBlockId,
        type: 'paragraph',
        data: {
          text: `<a href="${escapeHtml(link.path)}" data-workspace-page-id="${escapeHtml(link.id)}">↗ ${escapeHtml(link.title)}</a>`,
        },
      })

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

  const clearBlockCommentDecorations = () => {
    holderElement
      .querySelectorAll('.workspace-block-has-comments')
      .forEach((block) => block.classList.remove('workspace-block-has-comments'))
    holderElement
      .querySelectorAll('.workspace-block-comment-badge')
      .forEach((badge) => badge.remove())
  }

  const applyBlockCommentDecorations = async () => {
    if (!editor) return
    try {
      await editor.isReady
      clearBlockCommentDecorations()
      if (!blockCommentSummaryMap.size) return

      const snapshot = await editor.save()
      const blocks = snapshot.blocks || []
      const blockHolders = Array.from(holderElement.querySelectorAll('.ce-block'))

      blocks.forEach((block, index) => {
        const anchor = blockAnchorFromSnapshot(block, index)
        const summary = blockCommentSummaryMap.get(String(anchor?.anchorBlockId || ''))
        const count = Number(summary?.count || 0)
        if (!anchor || count <= 0) return

        const blockHolder = blockHolders[index]
        if (!blockHolder) return

        blockHolder.classList.add('workspace-block-has-comments')
        const badge = document.createElement('button')
        badge.type = 'button'
        badge.className = 'workspace-block-comment-badge'
        badge.title = `${count}개의 미해결 댓글`
        badge.setAttribute('aria-label', `${count}개의 미해결 댓글 보기`)
        badge.textContent = String(count)
        badge.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          selectedBlockAnchorRef.value = anchor
          if (typeof options?.onBlockCommentBadgeClick === 'function') {
            options.onBlockCommentBadgeClick(anchor)
          }
        })
        blockHolder.appendChild(badge)
      })
    } catch (error) {
      console.warn('[Editor] block comment decoration failed', error)
    }
  }

  const applyBlockCommentSummaries = (summaries = []) => {
    blockCommentSummaryMap = new Map(
      (Array.isArray(summaries) ? summaries : [])
        .filter((summary) => summary?.anchorBlockId && Number(summary.count || 0) > 0)
        .map((summary) => [String(summary.anchorBlockId), summary]),
    )
    window.requestAnimationFrame(() => {
      void applyBlockCommentDecorations()
    })
  }

  const applyDocumentTemplate = async (templateData, applyOptions = {}) => {
    if (!editor || isReadOnly()) return null
    try {
      await editor.isReady
      const parsed = parseEditorSnapshot(templateData)
      await editor.render(parsed)
      const saved = await editor.save()
      refreshImageAssetSnapshot(saved.blocks || [])
      updateDocumentOutline(saved.blocks || [])
      updateDocumentTasks(saved.blocks || [])
      updateDocumentStats(saved.blocks || [])
      applyBlockCommentSummaries([...blockCommentSummaryMap.values()])
      currentRenderedContents = JSON.stringify(saved)
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
    return withWorkspaceProperties(await editor.save())
  }

  const withWorkspaceProperties = (snapshot = {}) => {
    const nextMeta = { ...(snapshot.meta || {}) }
    const workspaceProperties =
      typeof options?.getWorkspaceProperties === 'function'
        ? options.getWorkspaceProperties()
        : null
    const workspaceParent =
      typeof options?.getWorkspaceParent === 'function'
        ? options.getWorkspaceParent()
        : null
    if (workspaceProperties && typeof workspaceProperties === 'object') {
      nextMeta.workspaceProperties = workspaceProperties
    }
    if (workspaceParent && typeof workspaceParent === 'object') {
      const parentId = String(workspaceParent.id || '').trim()
      nextMeta.parentWorkspaceId = parentId
      nextMeta.parentWorkspaceTitle = parentId ? String(workspaceParent.title || '').trim() : ''
    }
    return {
      ...snapshot,
      meta: nextMeta,
    }
  }

  const getActiveEditorBlockIndex = () => {
    if (!editor) return -1
    const apiIndex = typeof editor.blocks?.getCurrentBlockIndex === 'function'
      ? editor.blocks.getCurrentBlockIndex()
      : -1
    if (Number.isInteger(apiIndex) && apiIndex >= 0) {
      return apiIndex
    }

    const activeBlock = document.activeElement?.closest?.('.ce-block')
    if (!activeBlock) return -1
    const blocks = Array.from(holderElement.querySelectorAll('.ce-block'))
    return blocks.indexOf(activeBlock)
  }

  const captureCurrentBlockAnchor = async () => {
    if (!editor) return null
    try {
      await editor.isReady
      const index = getActiveEditorBlockIndex()
      if (index < 0) return selectedBlockAnchorRef.value
      const snapshot = await editor.save()
      const anchor = blockAnchorFromSnapshot(snapshot.blocks?.[index], index)
      if (anchor) {
        selectedBlockAnchorRef.value = anchor
      }
      return anchor
    } catch (error) {
      console.warn('[Editor] block anchor capture failed', error)
      return selectedBlockAnchorRef.value
    }
  }

  const scheduleBlockAnchorCapture = () => {
    clearTimeout(selectionAnchorTimer)
    selectionAnchorTimer = setTimeout(() => {
      void captureCurrentBlockAnchor()
    }, 80)
  }

  const clearSelectedBlockAnchor = () => {
    selectedBlockAnchorRef.value = null
  }

  const focusBlockAnchor = async (anchorBlockId) => {
    if (!editor || !anchorBlockId) return false
    try {
      await editor.isReady
      const snapshot = await editor.save()
      const blocks = snapshot.blocks || []
      const targetIndex = blocks.findIndex((block, index) =>
        String(block.id || `index-${index}`) === String(anchorBlockId)
      )
      if (targetIndex < 0) return false

      const blockApi = typeof editor.blocks?.getBlockByIndex === 'function'
        ? editor.blocks.getBlockByIndex(targetIndex)
        : null
      const blockHolder = blockApi?.holder || holderElement.querySelectorAll('.ce-block')?.[targetIndex]
      if (!blockHolder) return false

      blockHolder.scrollIntoView({ block: 'center', behavior: 'smooth' })
      blockHolder.classList.add('workspace-block-anchor-highlight')
      window.setTimeout(() => {
        blockHolder.classList.remove('workspace-block-anchor-highlight')
      }, 1800)
      selectedBlockAnchorRef.value = blockAnchorFromSnapshot(blocks[targetIndex], targetIndex)
      return true
    } catch (error) {
      console.warn('[Editor] block anchor focus failed', error)
      return false
    }
  }

  const syncEditorToYjs = async (serializedSnapshot = null) => {
    if (suppressLocal || isRendering || !editor) {
      return
    }

    try {
      const newString =
        typeof serializedSnapshot === 'string'
          ? serializedSnapshot
          : JSON.stringify(await editor.save())
      if (yMap.get('contents') === newString) {
        currentRenderedContents = newString
        return
      }

      runLocalTransaction(() => {
        yMap.set('contents', newString)
      })

      currentRenderedContents = newString
    } catch (error) {
      console.error('[YJS] local editor sync failed', error)
    }
  }

  const scheduleLocalSync = (savedSnapshot = null) => {
    if (suppressLocal || isRendering) {
      return
    }

    if (savedSnapshot) {
      pendingLocalSnapshot = JSON.stringify(savedSnapshot)
    }

    clearTimeout(localSyncTimer)
    localSyncTimer = setTimeout(() => {
      const nextSnapshot = pendingLocalSnapshot
      pendingLocalSnapshot = null
      void syncEditorToYjs(nextSnapshot)
    }, 100)
  }
  // ─── 블록 단위 diff 적용 ──────────────────────────────────────────────────
  async function renderFromY(yval) {
    if (!yval || yval === '""' || yval === '') {
      return
    }

    if (!editor) {
      pendingYVal = yval
      return
    }

    if (isRendering || remoteRenderInFlight) {
      pendingYVal = yval
      return
    }

    const parsed = parseEditorSnapshot(yval)
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
      refreshImageAssetSnapshot(parsed.blocks || [])
      updateDocumentOutline(parsed.blocks || [])
      updateDocumentTasks(parsed.blocks || [])
      updateDocumentStats(parsed.blocks || [])
      applyBlockCommentSummaries([...blockCommentSummaryMap.values()])
    } catch (error) {
      console.warn('[YJS] remote render failed', error)
    } finally {
      setTimeout(() => {
        suppressLocal = false
        isRendering = false
        remoteRenderInFlight = false

        if (!pendingYVal) {
          return
        }

        const nextYVal = pendingYVal
        pendingYVal = null
        if (nextYVal !== yval) {
          void renderFromY(nextYVal).catch((error) => {
            console.warn('[YJS] pending remote render flush failed', error)
          })
        }
      }, 50)
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

  // ─── 초기 데이터 파싱 ─────────────────────────────────────────────────────
  let parsedData = { blocks: [] }
  try {
    if (typeof initialData === 'string' && initialData.trim() !== '' && initialData !== '""') {
      parsedData = JSON.parse(initialData)
    } else if (initialData && typeof initialData === 'object' && initialData.blocks) {
      parsedData = initialData
    }
  } catch (e) {
    console.warn('Initial data parsing failed', e)
  }
  currentRenderedContents = JSON.stringify(parsedData)

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
      currentRenderedContents = JSON.stringify(initialSaved)
      await flushPendingRender()
    },
    onChange: async () => {
      if (suppressLocal || isRendering || isReadOnly()) return
      markDirty()
      try {
        const saved = await editor.save()

        const currentImageAssets = new Map()
        saved.blocks
          .filter(b => b.type === 'image' && b.data?.file?.assetIdx)
          .forEach(b => currentImageAssets.set(b.data.file.assetIdx, true))

        for (const assetIdx of previousImageAssets.keys()) {
          if (!currentImageAssets.has(assetIdx) && currentIdx) {
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

  const handleEditorSelectionEvent = () => {
    scheduleBlockAnchorCapture()
  }

  holderElement.addEventListener('click', handleEditorSelectionEvent)
  holderElement.addEventListener('keyup', handleEditorSelectionEvent)
  holderElement.addEventListener('focusin', handleEditorSelectionEvent)
  scheduleBlockAnchorCapture()

  // ─── 타이틀 바인딩 ────────────────────────────────────────────────────────
  function bindTitleRef(titleRef) {
    if (!titleRef) return
    const current = yTitle.toString()
    if (current && titleRef.value !== current) {
      titleRef.value = current
    }

    const observer = (event) => {
      if (event?.transaction?.origin === LOCAL_EDIT_ORIGIN) return
      const t = yTitle.toString()
      if (titleRef.value !== t) titleRef.value = t
    }

    if (titleObserver) {
      yTitle.unobserve(titleObserver)
    }
    titleObserver = observer
    yTitle.observe(titleObserver)
  }

  function updateTitleFromLocal(val) {
    if (isReadOnly()) return false
    const nextTitle = String(val ?? '')
    const current = yTitle.toString()
    if (current !== nextTitle) {
      runLocalTransaction(() => {
        yTitle.delete(0, yTitle.length)
        if (nextTitle) {
          yTitle.insert(0, nextTitle)
        }
      })
    }
    return true
  }

  // ─── 저장 ─────────────────────────────────────────────────────────────────
  async function savePost() {
    if (!editor) return
    try {
      await editor.isReady
      const savedData     = withWorkspaceProperties(await editor.save())
      const resolvedTitle = yTitle.toString().trim() || (initialTitle ?? '').trim() || '제목 없음'
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
  let animationFrameId = null
  const cursorSurface = holderElement.closest('.editor-shell') || holderElement

  function handleMouseMove(e) {
    if (animationFrameId || !awareness || !cursorSurface) return
    animationFrameId = requestAnimationFrame(() => {
      const rect = cursorSurface.getBoundingClientRect()
      if (!rect.width || !rect.height) {
        animationFrameId = null
        return
      }
      const xPercentage = ((e.clientX - rect.left) / rect.width) * 100
      const yPercentage = ((e.clientY - rect.top) / rect.height) * 100
      const isInside =
        xPercentage >= 0 &&
        xPercentage <= 100 &&
        yPercentage >= 0 &&
        yPercentage <= 100

      if (isInside) {
        markPresenceActive({
          mouse: { x: clampNumber(xPercentage), y: clampNumber(yPercentage), visible: true, lastActiveAt: nowIso() },
          presence: { reason: 'cursor' },
        })
      } else {
        markPresenceAway({
          mouse: { visible: false, lastActiveAt: nowIso() },
          presence: { reason: 'cursor-outside' },
        })
      }
      animationFrameId = null
    })
  }

  function handleMouseLeave() {
    markPresenceAway({
      mouse: { visible: false, lastActiveAt: nowIso() },
    })
  }

  function handleWindowFocus() {
    markPresenceActive({ presence: { reason: 'focus' } })
  }

  function handleWindowBlur() {
    markPresenceAway({
      mouse: { visible: false, lastActiveAt: nowIso() },
      presence: { reason: 'blur' },
    })
  }

  function handleVisibilityChange() {
    if (typeof document !== 'undefined' && document.hidden) {
      markPresenceAway({
        mouse: { visible: false, lastActiveAt: nowIso() },
        presence: { reason: 'hidden' },
      })
      return
    }
    markPresenceActive({ presence: { reason: 'visible' } })
  }

  function handlePresenceActivity() {
    markPresenceActive({ presence: { reason: 'activity' } })
  }

  function handleBeforeUnloadPresence() {
    markPresenceAway({
      mouse: { visible: false, lastActiveAt: nowIso() },
      presence: { reason: 'unload' },
    })
    try {
      awareness?.setLocalState?.(null)
    } catch (error) {
      console.warn('[Editor] awareness cleanup failed', error)
    }
  }

  if (!isPrivate) {
    cursorSurface.addEventListener('mousemove', handleMouseMove)
    cursorSurface.addEventListener('mouseleave', handleMouseLeave)
    cursorSurface.addEventListener('click', handlePresenceActivity)
    holderElement.addEventListener('keydown', handlePresenceActivity)
    window.addEventListener('focus', handleWindowFocus)
    window.addEventListener('blur', handleWindowBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnloadPresence)
  }

  function updateUserPermission(clientId, status) {
    yPermissions.set(String(clientId), status)
  }

  // ─── 정리 ─────────────────────────────────────────────────────────────────
  function destroy() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId)
    clearPresenceIdleTimer()
    cursorSurface.removeEventListener('mousemove', handleMouseMove)
    cursorSurface.removeEventListener('mouseleave', handleMouseLeave)
    cursorSurface.removeEventListener('click', handlePresenceActivity)
    holderElement.removeEventListener('keydown', handlePresenceActivity)
    window.removeEventListener('focus', handleWindowFocus)
    window.removeEventListener('blur', handleWindowBlur)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('beforeunload', handleBeforeUnloadPresence)
    holderElement.removeEventListener('click', handleEditorSelectionEvent)
    holderElement.removeEventListener('keyup', handleEditorSelectionEvent)
    holderElement.removeEventListener('focusin', handleEditorSelectionEvent)
    clearTimeout(selectionAnchorTimer)
    clearTimeout(localSyncTimer)
    clearBlockCommentDecorations()
    stopRealtimeStatusLogging()
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
