import {
  mergeWorkspaceAssetList,
  removeWorkspaceAssetIds,
  workspaceAssetRealtimeLabel,
} from '../services/workspaceAssets.js'
import {
  createWorkspaceAssetRealtimeNotice,
  createWorkspaceCommentRealtimeNotice,
  isWorkspaceRealtimeEventFromCurrentUser,
} from '../services/workspaceRealtime.js'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readValue = (source, fallback = null) => resolveSource(source) ?? fallback
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}
const writeRef = (target, value) => {
  if (target && typeof target === 'object' && 'value' in target) {
    target.value = value
  }
}

const sameWorkspace = (payload = {}, workspaceId) =>
  Number(payload.workspaceIdx || 0) === Number(readValue(workspaceId) || 0)

export const useWorkspaceRealtimeEvents = ({
  workspaceId,
  workspaceAssets,
  workspaceComments,
  currentUserIdx,
  isWorkspacePanelCollapsed,
  activeWorkspacePanelTab,
  workspaceCommentFilter,
  activeWorkspaceAssetId,
  editorApi,
  normalizeWorkspaceAsset = (asset) => asset,
  normalizeWorkspaceComment = (comment) => comment,
  isWorkspaceCommentMentioningCurrentUser = () => false,
  commentAnchorLabel = () => '',
  upsertWorkspaceComment = () => {},
  refreshWorkspaceAssets = async () => {},
  refreshWorkspaceComments = async () => {},
  showWorkspaceNotice = () => {},
} = {}) => {
  const isCurrentUserEvent = (payload = {}) =>
    isWorkspaceRealtimeEventFromCurrentUser(payload, readValue(currentUserIdx))

  const mergeWorkspaceAssets = (nextAssets) => {
    writeRef(workspaceAssets, mergeWorkspaceAssetList(readRows(workspaceAssets), nextAssets, {
      workspaceId: readValue(workspaceId),
    }))
  }

  const removeWorkspaceAssets = (assetIds) => {
    writeRef(workspaceAssets, removeWorkspaceAssetIds(readRows(workspaceAssets), assetIds))
  }

  const removeWorkspaceComment = (commentId) => {
    if (commentId == null) return
    writeRef(workspaceComments, readRows(workspaceComments).filter((comment) =>
      String(comment.id) !== String(commentId),
    ))
  }

  const openWorkspaceRealtimeCommentNotice = (comment = null, mention = false) => {
    writeRef(isWorkspacePanelCollapsed, false)
    writeRef(activeWorkspacePanelTab, 'review')
    if (mention) {
      writeRef(workspaceCommentFilter, 'mentions')
      return
    }
    if (comment?.anchorBlockId) {
      writeRef(workspaceCommentFilter, 'block')
      readValue(editorApi)?.focusBlockAnchor?.(comment.anchorBlockId)
      return
    }
    writeRef(workspaceCommentFilter, 'open')
  }

  const notifyWorkspaceCommentRealtimeEvent = (payload = {}, comment = null, previousComment = null) => {
    if (isCurrentUserEvent(payload)) return

    const mentionedMe = Boolean(comment) && isWorkspaceCommentMentioningCurrentUser(comment) && !comment.resolved
    const anchor = comment ? commentAnchorLabel(comment) : ''
    const notice = createWorkspaceCommentRealtimeNotice({
      payload,
      comment,
      previousComment,
      mentionedMe,
      anchorLabel: anchor,
    })
    if (!notice) return

    showWorkspaceNotice(notice.message, notice.tone, {
      timeout: notice.timeout,
      actionLabel: notice.actionLabel,
      onAction: () => openWorkspaceRealtimeCommentNotice(notice.comment, notice.mention),
    })
  }

  const openWorkspaceRealtimeAssetNotice = (asset = null) => {
    writeRef(isWorkspacePanelCollapsed, false)
    writeRef(activeWorkspacePanelTab, 'assets')
    if (asset?.id != null) {
      writeRef(activeWorkspaceAssetId, asset.id)
    }
  }

  const notifyWorkspaceAssetRealtimeEvent = (payload = {}, assets = [], deletedIds = []) => {
    if (isCurrentUserEvent(payload)) return

    const label = workspaceAssetRealtimeLabel(assets, deletedIds)
    const notice = createWorkspaceAssetRealtimeNotice({
      payload,
      assets,
      deletedIds,
      assetLabel: label,
    })
    if (!notice) return

    showWorkspaceNotice(notice.message, notice.tone, {
      actionLabel: notice.actionLabel,
      onAction: () => openWorkspaceRealtimeAssetNotice(notice.asset),
    })
  }

  const handleWorkspaceAssetRealtimeEvent = (payload = {}) => {
    if (!sameWorkspace(payload, workspaceId)) return
    if (payload.action === 'UPSERT' || payload.action === 'UPLOAD') {
      const normalizedAssets = (Array.isArray(payload.assets) ? payload.assets : []).map(normalizeWorkspaceAsset)
      mergeWorkspaceAssets(normalizedAssets)
      notifyWorkspaceAssetRealtimeEvent(payload, normalizedAssets)
      return
    }
    if (payload.action === 'DELETE') {
      const assetIdxList = Array.isArray(payload.assetIdxList) ? payload.assetIdxList : []
      removeWorkspaceAssets(assetIdxList)
      notifyWorkspaceAssetRealtimeEvent(payload, [], assetIdxList)
      return
    }
    refreshWorkspaceAssets(readValue(workspaceId)).catch(() => {})
  }

  const handleWorkspaceCommentRealtimeEvent = (payload = {}) => {
    if (!sameWorkspace(payload, workspaceId)) return
    if (payload.action === 'UPSERT' && payload.comment) {
      const normalizedComment = normalizeWorkspaceComment(payload.comment)
      const previousComment = readRows(workspaceComments).find((comment) =>
        String(comment.id) === String(normalizedComment.id),
      )
      upsertWorkspaceComment(payload.comment)
      notifyWorkspaceCommentRealtimeEvent(payload, normalizedComment, previousComment)
      return
    }
    if (payload.action === 'DELETE') {
      const previousComment = readRows(workspaceComments).find((comment) =>
        String(comment.id) === String(payload.commentIdx),
      )
      removeWorkspaceComment(payload.commentIdx)
      notifyWorkspaceCommentRealtimeEvent(payload, previousComment, previousComment)
      return
    }
    refreshWorkspaceComments(readValue(workspaceId)).catch(() => {})
  }

  return {
    mergeWorkspaceAssets,
    removeWorkspaceAssets,
    removeWorkspaceComment,
    handleWorkspaceAssetRealtimeEvent,
    handleWorkspaceCommentRealtimeEvent,
  }
}
