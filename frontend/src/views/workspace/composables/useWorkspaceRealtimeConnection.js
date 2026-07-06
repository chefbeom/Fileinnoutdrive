import SockJS from 'sockjs-client'
import Stomp from '@/utils/stompClient.js'
import { apiPath } from '@/utils/backendUrl.js'

const WEBSOCKET_OPEN_STATE = 1

const isOpenSocket = (socket) => {
  if (!socket) return false
  const openState = typeof WebSocket === 'undefined' ? WEBSOCKET_OPEN_STATE : WebSocket.OPEN
  return socket.readyState === openState
}

const safeDisconnect = (client, logger = console) => {
  if (!client) return
  try {
    if (client.connected) {
      client.disconnect(() => {})
    } else if (isOpenSocket(client.ws)) {
      client.ws.close()
    }
  } catch (error) {
    logger.error?.('Workspace realtime disconnect failed:', error)
  }
}

const parseMessageBody = (message) => JSON.parse(message?.body)

export const useWorkspaceRealtimeConnection = ({
  getAccessToken = () => '',
  createSocket = () => new SockJS(apiPath('/ws-stomp')),
  createStompClient = (socket) => Stomp.over(socket),
  onAssetEvent = () => {},
  onCommentEvent = () => {},
  refreshAssets = async () => {},
  refreshComments = async () => {},
  logger = console,
} = {}) => {
  let workspaceAssetStompClient = null
  let connectedWorkspaceAssetRoomId = null

  const disconnect = () => {
    connectedWorkspaceAssetRoomId = null
    const client = workspaceAssetStompClient
    workspaceAssetStompClient = null
    safeDisconnect(client, logger)
  }

  const connect = (targetWorkspaceId) => {
    const normalizedWorkspaceId = Number(targetWorkspaceId || 0)
    const accessToken = getAccessToken()

    if (!normalizedWorkspaceId || !accessToken) {
      disconnect()
      return
    }

    if (
      workspaceAssetStompClient &&
      connectedWorkspaceAssetRoomId === normalizedWorkspaceId &&
      workspaceAssetStompClient.connected
    ) return

    disconnect()

    const socket = createSocket()
    const stompClient = createStompClient(socket)
    stompClient.debug = null
    workspaceAssetStompClient = stompClient

    stompClient.connect(
      { Authorization: `Bearer ${accessToken}` },
      () => {
        if (workspaceAssetStompClient !== stompClient) {
          safeDisconnect(stompClient, logger)
          return
        }

        connectedWorkspaceAssetRoomId = normalizedWorkspaceId
        stompClient.subscribe(`/sub/workspace/assets/${normalizedWorkspaceId}`, (message) => {
          try {
            onAssetEvent(parseMessageBody(message))
          } catch (error) {
            logger.error?.('Workspace asset realtime payload parse failed:', error)
            refreshAssets(normalizedWorkspaceId).catch(() => {})
          }
        })
        stompClient.subscribe(`/sub/workspace/comments/${normalizedWorkspaceId}`, (message) => {
          try {
            onCommentEvent(parseMessageBody(message))
          } catch (error) {
            logger.error?.('Workspace comment realtime payload parse failed:', error)
            refreshComments(normalizedWorkspaceId).catch(() => {})
          }
        })
      },
      (error) => {
        if (workspaceAssetStompClient === stompClient) {
          logger.error?.('Workspace realtime connection failed:', error)
        }
      },
    )
  }

  return {
    connect,
    disconnect,
  }
}
