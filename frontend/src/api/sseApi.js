import { EventSourcePolyfill } from 'event-source-polyfill'
import { apiPath } from '@/utils/backendUrl.js'

const SSE_OPTIONS = {
  heartbeatTimeout: 3600000,
}

const getAuthHeaders = (accessToken) =>
  accessToken ? { Authorization: `Bearer ${accessToken}` } : {}

const isFatalError = (eventSource) => eventSource.readyState === EventSourcePolyfill.CLOSED

const addJsonEventListener = (eventSource, eventName, callback) => {
  eventSource.addEventListener(eventName, (event) => {
    try {
      callback?.(JSON.parse(event.data))
    } catch (error) {
      console.error('[SSE:' + eventName + '] Failed to parse event payload:', error)
    }
  })
}

const connectWorkspaceSse = ({
  userId,
  accessToken,
  onConnect,
  onNotification,
  onNewMessage,
  onTitleUpdated,
  onRoleChanged,
  onChatPreviewUpdated,
  onError,
} = {}) => {
  const eventSource = new EventSourcePolyfill(apiPath('/sse/connect'), {
    headers: getAuthHeaders(accessToken),
    withCredentials: true,
    ...SSE_OPTIONS,
  })

  eventSource.onopen = (event) => {
    if (import.meta.env.DEV) console.debug('[SSE] 워크스페이스 연결 성공 (userId:', userId, ')')
    if (onConnect) onConnect(event)
  }

  addJsonEventListener(eventSource, 'notification', onNotification)
  addJsonEventListener(eventSource, 'new-message', onNewMessage)
  addJsonEventListener(eventSource, 'title-updated', onTitleUpdated)
  addJsonEventListener(eventSource, 'role-changed', onRoleChanged)
  addJsonEventListener(eventSource, 'chat-preview-update', onChatPreviewUpdated)

  eventSource.onerror = (error) => {
    if (!isFatalError(eventSource)) return
    console.error('[SSE] 워크스페이스 연결 오류 (fatal):', error)
    eventSource.close()
    if (onError) onError(error)
  }

  return eventSource
}

const closeSse = (eventSource) => {
  if (eventSource && typeof eventSource.close === 'function') {
    eventSource.close()
    if (import.meta.env.DEV) console.debug('[SSE] 연결을 정상적으로 종료했습니다.')
  }
}

export default {
  connectWorkspaceSse,
  closeSse,
}
