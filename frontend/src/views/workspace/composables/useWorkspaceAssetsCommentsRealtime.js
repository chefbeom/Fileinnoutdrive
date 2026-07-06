import { useWorkspaceCollectionRefresh } from './useWorkspaceCollectionRefresh.js'
import { useWorkspaceRealtimeConnection } from './useWorkspaceRealtimeConnection.js'
import { useWorkspaceRealtimeEvents } from './useWorkspaceRealtimeEvents.js'

export const useWorkspaceAssetsCommentsRealtime = ({
  workspaceId,
  workspaceAssets,
  workspaceAssetLoading,
  workspaceAssetError,
  workspaceComments,
  workspaceCommentLoading,
  workspaceCommentError,
  currentUserIdx,
  isWorkspacePanelCollapsed,
  activeWorkspacePanelTab,
  workspaceCommentFilter,
  activeWorkspaceAssetId,
  editorApi,
  getAccessToken = () => '',
  loadWorkspaceAssets = async () => [],
  loadWorkspaceComments = async () => [],
  normalizeWorkspaceAsset = (asset) => asset,
  normalizeWorkspaceComment = (comment) => comment,
  isWorkspaceCommentMentioningCurrentUser = () => false,
  commentAnchorLabel = () => '',
  upsertWorkspaceComment = () => {},
  showWorkspaceNotice = () => {},
  createSocket,
  createStompClient,
  logger,
  assetErrorMessage = 'Workspace assets could not be loaded.',
  commentErrorMessage = 'Workspace comments could not be loaded.',
} = {}) => {
  const {
    refreshWorkspaceCollection: refreshWorkspaceAssets,
  } = useWorkspaceCollectionRefresh({
    workspaceId,
    items: workspaceAssets,
    loading: workspaceAssetLoading,
    error: workspaceAssetError,
    loadItems: loadWorkspaceAssets,
    normalizeItem: normalizeWorkspaceAsset,
    errorMessage: assetErrorMessage,
  })

  const {
    refreshWorkspaceCollection: refreshWorkspaceComments,
  } = useWorkspaceCollectionRefresh({
    workspaceId,
    items: workspaceComments,
    loading: workspaceCommentLoading,
    error: workspaceCommentError,
    loadItems: loadWorkspaceComments,
    normalizeItem: normalizeWorkspaceComment,
    errorMessage: commentErrorMessage,
  })

  const {
    mergeWorkspaceAssets,
    removeWorkspaceAssets,
    handleWorkspaceAssetRealtimeEvent,
    handleWorkspaceCommentRealtimeEvent,
  } = useWorkspaceRealtimeEvents({
    workspaceId,
    workspaceAssets,
    workspaceComments,
    currentUserIdx,
    isWorkspacePanelCollapsed,
    activeWorkspacePanelTab,
    workspaceCommentFilter,
    activeWorkspaceAssetId,
    editorApi,
    normalizeWorkspaceAsset,
    normalizeWorkspaceComment,
    isWorkspaceCommentMentioningCurrentUser,
    commentAnchorLabel,
    upsertWorkspaceComment,
    refreshWorkspaceAssets,
    refreshWorkspaceComments,
    showWorkspaceNotice,
  })

  const realtimeConnectionOptions = {
    getAccessToken,
    onAssetEvent: (payload) => handleWorkspaceAssetRealtimeEvent(payload),
    onCommentEvent: (payload) => handleWorkspaceCommentRealtimeEvent(payload),
    refreshAssets: (targetWorkspaceId) => refreshWorkspaceAssets(targetWorkspaceId),
    refreshComments: (targetWorkspaceId) => refreshWorkspaceComments(targetWorkspaceId),
  }
  if (createSocket) realtimeConnectionOptions.createSocket = createSocket
  if (createStompClient) realtimeConnectionOptions.createStompClient = createStompClient
  if (logger) realtimeConnectionOptions.logger = logger

  const {
    connect: connectWorkspaceAssetRealtime,
    disconnect: disconnectWorkspaceAssetRealtime,
  } = useWorkspaceRealtimeConnection(realtimeConnectionOptions)

  return {
    refreshWorkspaceAssets,
    refreshWorkspaceComments,
    mergeWorkspaceAssets,
    removeWorkspaceAssets,
    handleWorkspaceAssetRealtimeEvent,
    handleWorkspaceCommentRealtimeEvent,
    connectWorkspaceAssetRealtime,
    disconnectWorkspaceAssetRealtime,
  }
}