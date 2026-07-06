import api from '@/plugins/axiosinterceptor.js'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || ''

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

const extractBody = (baseResponse) => {
  if (!baseResponse) return null
  if (baseResponse?.result?.body !== undefined) return baseResponse.result.body
  if (baseResponse?.data?.result?.body !== undefined) return baseResponse.data.result.body
  if (baseResponse?.data !== undefined) return baseResponse.data
  return baseResponse
}

const apiCall = async (label, request, fallback = undefined) => {
  try {
    const response = await request()
    const baseResponse = response.data

    if (baseResponse?.success === false) {
      const code = baseResponse?.code ?? 'UNKNOWN'
      const message = baseResponse?.message ?? '알 수 없는 오류가 발생했습니다.'
      console.error(`[${label}] failed [${code}] ${message}`)
      const error = new Error(message)
      error.code = code
      error.baseResponse = baseResponse
      throw error
    }

    return extractBody(baseResponse)
  } catch (error) {
    if (error.baseResponse) throw error

    const serverData = error.response?.data
    if (serverData?.success === false) {
      const code = serverData?.code ?? error.response?.status ?? 'NETWORK'
      const message = serverData?.message ?? error.message
      console.error(`[${label}] failed [${code}] ${message}`)
      const wrappedError = new Error(message)
      wrappedError.code = code
      wrappedError.baseResponse = serverData
      throw wrappedError
    }

    console.error(`[${label}] request failed`, error)
    if (fallback !== undefined) return fallback
    throw error
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 알림
// ─────────────────────────────────────────────────────────────────────────────

const subscribeWebPush = async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return null
  }
  if (!VAPID_PUBLIC_KEY) {
    console.info('Web push registration skipped because VITE_WEB_PUSH_PUBLIC_KEY is not configured.')
    return null
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return null
    const registration = await navigator.serviceWorker.register('/sw.js')
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }
    const subscriptionJson = subscription.toJSON()
    const response = await api.post('/notification/subscribe', {
      endpoint: subscriptionJson.endpoint,
      keys: subscriptionJson.keys,
    })
    if (import.meta.env.DEV) console.debug('알림 구독 성공');
    return response.data
  } catch (error) {
    console.error('알림 구독 실패:', error)
    throw error
  }
}

const unsubscribeWebPush = async () => {
  try {
    const response = await api.post('/notification/unsubscribe')
    return response.data
  } catch (error) {
    console.error('푸시 구독 비활성화 실패:', error)
    throw error
  }
}

const getNotifications = async () => {
  try {
    const response = await api.get('/notification/list')
    return response.data
  } catch (error) {
    console.error('알림 목록 조회 실패:', error)
    throw error
  }
}

const markNotificationAsRead = async ({ id = null, uuid = null } = {}) => {
  try {
    const response = await api.patch('/notification/read', { id, uuid })
    return response.data
  } catch (error) {
    console.error('알림 읽음 처리 실패:', error)
    throw error
  }
}

const deleteNotification = async ({ id = null, uuid = null } = {}) => {
  try {
    const response = await api.delete('/notification', { data: { id, uuid } })
    return response.data
  } catch (error) {
    console.error('알림 삭제 실패:', error)
    throw error
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 워크스페이스 CRUD
// ─────────────────────────────────────────────────────────────────────────────

const savePost = async (formData) =>
  apiCall('savePost', () => api.post('/workspace/save', formData))

const getPost = async (idx) =>
  apiCall('getPost', () => api.get(`/workspace/read/${idx}`))

const allPosts = async () =>
  apiCall('allPosts', () => api.get('/workspace/list'))

const getWorkspacePreferences = async () =>
  apiCall('getWorkspacePreferences', () => api.get('/workspace/preferences'), {
    favoriteWorkspaceIds: [],
    recentWorkspaceIds: [],
    documentSections: [],
    pageIndexViews: [],
  })

const saveWorkspacePreferences = async (payload) =>
  apiCall('saveWorkspacePreferences', () => api.put('/workspace/preferences', payload))

const deletePost = async (idx) =>
  apiCall('deletePost', () => api.post(`/workspace/delete/${idx}`))

const list_delete = async (idx) =>
  apiCall('list_delete', () => api.post(`/workspace/delete/list/${idx}`))

// ─────────────────────────────────────────────────────────────────────────────
// 공유 / 초대
// ─────────────────────────────────────────────────────────────────────────────

const inviteUser = async (inviteData) =>
  apiCall(
    'inviteUser',
    () => api.post('/workspace/invite', null, {
      params: { uuid: inviteData.uuid, type: inviteData.type, email: inviteData.email, role: inviteData.role },
      timeout: 15000,
    }),
  )

const getPostByUuid = async (uuid) =>
  apiCall('getPostByUuid', () => api.get(`/workspace/by-uuid/${uuid}`))

const verifyEmail = async (uuid, type) =>
  apiCall('verifyEmail', () => api.get('/workspace/verify', { params: { uuid, type } }))

const updateShareStatus = async (idx, status) =>
  apiCall('updateShareStatus', () =>
    api.post(`/workspace/isShared/${idx}`, { type: status !== 'Private', status }),
  )

// ─────────────────────────────────────────────────────────────────────────────
// 권한
// ─────────────────────────────────────────────────────────────────────────────

const loadRole = async (idx) =>
  apiCall('loadRole', () => api.get(`/workspace/loadRole/${idx}`))

const saveRole = async (idx, roleData) =>
  apiCall('saveRole', () => api.post(`/workspace/saveRole/${idx}`, roleData))

// ✅ 단일 유저 역할 변경 (SSE로 해당 유저에게 알림)
const changeUserRole = async (postIdx, targetUserIdx, role) =>
  apiCall(
    'changeUserRole',
    () => api.post(`/workspace/${postIdx}/role/${targetUserIdx}`, { role }),
  )

// ✅ 유저 추방 (SSE로 해당 유저에게 알림)
const kickUser = async (postIdx, targetUserIdx) =>
  apiCall(
    'kickUser',
    () => api.delete(`/workspace/${postIdx}/member/${targetUserIdx}`, {
      headers: { 'Content-Type': undefined },
    }),
  )

// ─────────────────────────────────────────────────────────────────────────────
// 첨부 파일(에셋)
// ─────────────────────────────────────────────────────────────────────────────

const getWorkspaceAssets = async (workspaceId) =>
  apiCall('getWorkspaceAssets', () => api.get(`/workspace/${workspaceId}/assets`), [])

const uploadWorkspaceAssets = async (workspaceId, files) => {
  const formData = new FormData()
  const fileList = files instanceof File ? [files] : Array.from(files || [])
  if (fileList.length === 0) throw new Error('업로드할 파일이 없습니다.')
  fileList.forEach((file) => formData.append('files', file))
  return apiCall(
    'uploadWorkspaceAssets',
    () => api.post(`/workspace/${workspaceId}/assets`, formData, {
      timeout: 600000,
      transformRequest: [(data, headers) => { delete headers['Content-Type']; delete headers.common?.['Content-Type']; return data }],
    }),
    [],
  )
}

const deleteWorkspaceAsset = async (workspaceId, assetId) =>
  apiCall('deleteWorkspaceAsset', () => api.delete(`/workspace/${workspaceId}/assets/${assetId}`))

const deleteEditorJsImage = async (workspaceId, assetIdx) =>
  apiCall('deleteEditorJsImage', () => api.delete(`/workspace/${workspaceId}/assets/${assetIdx}/editorjs`))

const uploadEditorJsImage = async (workspaceId, file) => {
  if (!workspaceId) throw new Error('워크스페이스 ID가 없습니다. 먼저 게시물을 저장해주세요.')
  const formData = new FormData()
  formData.append('image', file)
  return apiCall(
    'uploadEditorJsImage',
    () => api.post(`/workspace/${workspaceId}/assets/editorjs`, formData, {
      timeout: 600000,
      transformRequest: [(data, headers) => { delete headers['Content-Type']; return data }],
    }),
  )
}

const saveWorkspaceAssetToDrive = async (workspaceId, assetId, parentId = null) =>
  apiCall('saveWorkspaceAssetToDrive', () =>
    api.post(`/workspace/${workspaceId}/assets/${assetId}/save-to-drive`, null, {
      params: parentId == null ? {} : { parentId },
    }),
  )

const getWorkspaceComments = async (workspaceId) =>
  apiCall('getWorkspaceComments', () => api.get(`/workspace/${workspaceId}/comments`), [])

const createWorkspaceComment = async (workspaceId, payload) => {
  const body = typeof payload === 'string' ? { contents: payload } : payload
  return apiCall('createWorkspaceComment', () => api.post(`/workspace/${workspaceId}/comments`, body))
}

const updateWorkspaceComment = async (workspaceId, commentId, contents) =>
  apiCall('updateWorkspaceComment', () => api.patch(`/workspace/${workspaceId}/comments/${commentId}`, { contents }))

const resolveWorkspaceComment = async (workspaceId, commentId, resolved = true) =>
  apiCall('resolveWorkspaceComment', () => api.patch(`/workspace/${workspaceId}/comments/${commentId}/resolve`, { resolved }))

const deleteWorkspaceComment = async (workspaceId, commentId) =>
  apiCall('deleteWorkspaceComment', () => api.delete(`/workspace/${workspaceId}/comments/${commentId}`))

const getWorkspaceRevisions = async (workspaceId) =>
  apiCall('getWorkspaceRevisions', () => api.get(`/workspace/${workspaceId}/revisions`), [])

const getWorkspaceRevision = async (workspaceId, revisionId) =>
  apiCall('getWorkspaceRevision', () => api.get(`/workspace/${workspaceId}/revisions/${revisionId}`))

const restoreWorkspaceRevision = async (workspaceId, revisionId) =>
  apiCall('restoreWorkspaceRevision', () => api.post(`/workspace/${workspaceId}/revisions/${revisionId}/restore`))

// ─────────────────────────────────────────────────────────────────────────────

export default {
  subscribeWebPush,
  unsubscribeWebPush,
  getNotifications,
  markNotificationAsRead,
  deleteNotification,
  savePost,
  getPost,
  allPosts,
  getWorkspacePreferences,
  saveWorkspacePreferences,
  deletePost,
  list_delete,
  inviteUser,
  getPostByUuid,
  verifyEmail,
  updateShareStatus,
  loadRole,
  saveRole,
  changeUserRole,   // ✅ 추가
  kickUser,         // ✅ 추가
  getWorkspaceAssets,
  uploadWorkspaceAssets,
  deleteWorkspaceAsset,
  deleteEditorJsImage,
  uploadEditorJsImage,
  saveWorkspaceAssetToDrive,
  getWorkspaceComments,
  createWorkspaceComment,
  updateWorkspaceComment,
  resolveWorkspaceComment,
  deleteWorkspaceComment,
  getWorkspaceRevisions,
  getWorkspaceRevision,
  restoreWorkspaceRevision,
}
