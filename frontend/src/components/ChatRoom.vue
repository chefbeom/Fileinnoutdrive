<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch, computed } from 'vue'
import api from '@/plugins/axiosinterceptor.js'
import { useAuthStore } from '@/stores/useAuthStore.js'
import SockJS from 'sockjs-client'
import Stomp from 'stompjs'
import { apiPath } from '@/utils/backendUrl.js'
import { formatBytes as formatFileSize } from '@/utils/formatBytes.js'

const props = defineProps({
  room: Object,
  currentUser: Object,
  participantsRefreshKey: {
    type: Number,
    default: 0
  }
})
const emit = defineEmits(['back', 'open-invite', 'room-preview-update'])
const authStore = useAuthStore()

const chatMessages = ref([])
const newMessage = ref('')
const scrollContainer = ref(null)
let stompClient = null
let presenceHeartbeatTimer = null
let activePresenceRoomId = null

const HEARTBEAT_INTERVAL_MS = 60 * 1000

const currentPage = ref(0)
const isLastPage = ref(false)
const isLoading = ref(false)
const scrollObserver = ref(null)
const messageMenuVisible = ref(false)
const messageMenuPos = ref({ x: 0, y: 0 })
const selectedMessage = ref(null)
const imagePreviewUrl = ref('')
const imagePreviewName = ref('')
const participants = ref([])
const participantsLoading = ref(false)
const participantsError = ref('')
const isParticipantsPanelOpen = ref(false)

const myProfileImageUrl = computed(() => authStore.user?.profileImageUrl || null)
const myName = computed(() => authStore.user?.userName || authStore.user?.name || 'Guest')
const currentUserIdx = computed(() => authStore.user?.idx ?? props.currentUser?.idx ?? props.currentUser?.id ?? null)
const participantCountLabel = computed(() => (
  participants.value.length || props.room?.userCount || props.room?.participantCount || 0
))
const DELETED_MESSAGE_TEXT = '삭제된 메시지입니다.'

const isDeletedMessagePayload = (payload = {}) => (
  Boolean(payload.deleted) ||
  (
    String(payload.contents ?? payload.text ?? '').trim() === DELETED_MESSAGE_TEXT &&
    !payload.fileUrl &&
    !payload.fileName
  )
)

const toChatMessage = (payload = {}, options = {}) => {
  const deleted = isDeletedMessagePayload(payload)
  const isMe = Boolean(options.isMe)
  const isPending = Boolean(options.isPending)

  return {
    id: payload.idx ?? payload.id,
    sender: payload.senderNickname ?? payload.sender ?? myName.value,
    text: deleted ? DELETED_MESSAGE_TEXT : (payload.contents ?? payload.text ?? ''),
    time: payload.createdAt ?? payload.time ?? new Date().toISOString(),
    isMe,
    isPending,
    deleted,
    messageUnreadCount: payload.messageUnreadCount ?? 0,
    profileImageUrl: deleted ? null : (payload.profileImageUrl ?? null),
    fileUrl: deleted ? null : (payload.fileUrl ?? null),
    fileName: deleted ? null : (payload.fileName ?? null),
    fileType: deleted ? null : (payload.fileType ?? null),
    fileSize: deleted ? null : (payload.fileSize ?? null),
    messageType: deleted ? 'TEXT' : (payload.messageType || 'TEXT'),
  }
}

const getPreviewText = (message = {}) => {
  const text = String(message.text ?? message.contents ?? '').trim()
  if (text) return text

  const normalizedMessageType = String(message.messageType ?? '').toUpperCase()
  if (normalizedMessageType === 'IMAGE') return '사진'
  if (normalizedMessageType === 'FILE') return '문서'

  const normalizedFileType = String(message.fileType ?? '').toLowerCase()
  if (normalizedFileType.startsWith('image/')) return '사진'
  if (normalizedFileType) return '문서'

  const fileHint = String(message.fileName ?? message.fileUrl ?? '').toLowerCase()
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(fileHint)) return '사진'
  if (fileHint) return '문서'

  return ''
}

const emitRoomPreviewUpdate = (message = {}) => {
  const lastMsg = getPreviewText(message)
  if (!props.room?.id || !lastMsg) return

  emit('room-preview-update', {
    roomId: props.room.id,
    lastMsg,
    time: message.time ?? message.createdAt ?? new Date().toISOString(),
  })
}

const applyDeletedMessage = (messageId, deletedText = DELETED_MESSAGE_TEXT) => {
  const target = chatMessages.value.find((msg) => msg.id === messageId)
  if (!target) return

  target.text = deletedText || DELETED_MESSAGE_TEXT
  target.deleted = true
  target.isPending = false
  target.fileUrl = null
  target.fileName = null
  target.fileType = null
  target.fileSize = null
  target.messageType = 'TEXT'
  emitRoomPreviewUpdate(target)
}

const openMessageMenu = (event, msg) => {
  if (!msg?.isMe || msg?.isSystem || msg?.isPending || msg?.deleted) return

  event.preventDefault()
  selectedMessage.value = msg
  messageMenuPos.value = { x: event.clientX, y: event.clientY }
  messageMenuVisible.value = true
}

const closeMessageMenu = () => {
  messageMenuVisible.value = false
  selectedMessage.value = null
}

const openImagePreview = (message) => {
  if (!message?.fileUrl) return
  imagePreviewUrl.value = message.fileUrl
  imagePreviewName.value = message.fileName ?? '이미지 미리보기'
}

const closeImagePreview = () => {
  imagePreviewUrl.value = ''
  imagePreviewName.value = ''
}

const downloadImagePreview = async () => {
  if (!imagePreviewUrl.value) return

  const fallbackName = imagePreviewName.value?.trim() || 'image'

  try {
    const response = await fetch(imagePreviewUrl.value)
    if (!response.ok) {
      throw new Error(`download failed: ${response.status}`)
    }

    const blob = await response.blob()
    const objectUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = fallbackName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(objectUrl)
  } catch (error) {
    console.error('이미지 다운로드 실패:', error)
    window.open(imagePreviewUrl.value, '_blank', 'noopener,noreferrer')
  }
}

const handleWindowKeydown = (event) => {
  if (event.key !== 'Escape') return
  closeMessageMenu()
  closeImagePreview()
  closeParticipantsPanel()
}

const formatTime = (isoString) => {
  if (!isoString) return ''
  const date = new Date(isoString)
  return new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  }).format(date)
}

const formatDateTime = (isoString) => {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  }).format(date)
}

const getMessageDateKey = (isoString) => {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

const formatMessageDate = (isoString) => {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  }).format(date)
}

const shouldShowDateDivider = (index) => {
  const currentMessage = chatMessages.value[index]
  if (!currentMessage) return false
  if (index === 0) return true

  const previousMessage = chatMessages.value[index - 1]
  return getMessageDateKey(currentMessage.time) !== getMessageDateKey(previousMessage?.time)
}

const normalizeParticipant = (participant = {}) => {
  const userIdx = participant.userIdx

  return {
    id: participant.id,
    userIdx,
    nickname: participant.nickname || participant.email || '사용자',
    email: participant.email || '',
    customRoomName: participant.customRoomName || '',
    joinedAt: participant.joinedAt || null,
    lastReadMessageId: Number(participant.lastReadMessageId || 0),
    isFavorite: Boolean(participant.isFavorite ?? participant.favorite),
    isMe: Boolean(participant.isMe ?? participant.me ?? Number(userIdx) === Number(currentUserIdx.value))
  }
}

const participantInitial = (participant = {}) => (
  String(participant.nickname || participant.email || '?').charAt(0).toUpperCase()
)

const getLatestLoadedMessageId = () => (
  chatMessages.value.reduce((latest, message) => {
    const messageId = Number(message.id)
    return Number.isFinite(messageId) ? Math.max(latest, messageId) : latest
  }, 0)
)

const updateParticipantReadState = (userIdx, lastReadMessageId = null) => {
  const normalizedUserIdx = Number(userIdx)
  const nextReadId = Number(lastReadMessageId ?? getLatestLoadedMessageId())

  if (!Number.isFinite(normalizedUserIdx) || !Number.isFinite(nextReadId) || nextReadId <= 0) return

  const participant = participants.value.find((item) => Number(item.userIdx) === normalizedUserIdx)
  if (!participant) return

  participant.lastReadMessageId = Math.max(Number(participant.lastReadMessageId || 0), nextReadId)
}

const getReadersForMessage = (message = {}) => {
  const messageId = Number(message.id)
  if (!message.isMe || !Number.isFinite(messageId)) return []

  return participants.value.filter((participant) => (
    !participant.isMe && Number(participant.lastReadMessageId || 0) >= messageId
  ))
}

const formatReadPeople = (message = {}) => {
  const readers = getReadersForMessage(message)
  if (!readers.length) return ''
  if (readers.length <= 2) return `${readers.map((reader) => reader.nickname).join(', ')} 읽음`
  return `${readers[0].nickname} 외 ${readers.length - 1}명 읽음`
}

const messageReadPeopleTitle = (message = {}) => (
  getReadersForMessage(message).map((reader) => reader.nickname).join(', ')
)

const getMessageUnreadCount = (message = {}) => {
  if (!message.isMe) return 0

  const messageId = Number(message.id)
  if (!Number.isFinite(messageId) || !participants.value.length) {
    return Number(message.messageUnreadCount || 0)
  }

  return participants.value.filter((participant) => (
    !participant.isMe && Number(participant.lastReadMessageId || 0) < messageId
  )).length
}

const participantReadLabel = (participant = {}) => {
  const lastReadMessageId = Number(participant.lastReadMessageId || 0)
  return lastReadMessageId > 0 ? `#${lastReadMessageId}까지 읽음` : '읽음 없음'
}

const fetchParticipants = async () => {
  if (!props.room?.id) return

  participantsLoading.value = true
  participantsError.value = ''

  try {
    const response = await api.get(`/chatRoom/${props.room.id}/participants`)
    const result = response.data?.result ?? []
    participants.value = Array.isArray(result) ? result.map(normalizeParticipant) : []
  } catch (error) {
    console.error('참여자 목록 로드 실패:', error)
    participantsError.value = '참여자 정보를 불러오지 못했습니다.'
  } finally {
    participantsLoading.value = false
  }
}

const openParticipantsPanel = async () => {
  isParticipantsPanelOpen.value = true
  await fetchParticipants()
}

const closeParticipantsPanel = () => {
  isParticipantsPanelOpen.value = false
}

const sortMessages = () => {
  chatMessages.value.sort((a, b) => {
    const timeA = new Date(a.time).getTime()
    const timeB = new Date(b.time).getTime()
    if (timeA !== timeB) return timeA - timeB
    return (a.id > b.id) ? 1 : -1
  })
}

const fetchHistory = async (isFirst = false) => {
  if (isLoading.value || (isLastPage.value && !isFirst)) return

  isLoading.value = true
  const size = 20

  if (isFirst) {
    currentPage.value = 0
    isLastPage.value = false
    chatMessages.value = [] // 첫 로딩 시 초기화
  }

  const container = scrollContainer.value
  const beforeHeight = container ? container.scrollHeight : 0

  try {
    const response = await api.get(`/chat/${props.room.id}/history`, {
      params: { page: currentPage.value, size: size }
    })

    if (response.data.success && response.data.result.messageList) {
      const newMsgs = response.data.result.messageList.map((msg) =>
        toChatMessage(msg, { isMe: Number(msg.senderIdx) === Number(currentUserIdx.value) })
      )

      if (newMsgs.length < size) isLastPage.value = true

      chatMessages.value = [...newMsgs.reverse(), ...chatMessages.value]
      currentPage.value++

      await nextTick()
      if (isFirst) {
        scrollToBottom()
        fetchParticipants()
      } else if (container) {
        container.scrollTop = container.scrollHeight - beforeHeight
      }
    }
  } catch (error) {
    console.error('이전 대화 로드 실패:', error)
  } finally {
    isLoading.value = false
  }
}

const initObserver = () => {
  if (scrollObserver.value) scrollObserver.value.disconnect()

  scrollObserver.value = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLastPage.value && !isLoading.value) {
      fetchHistory()
    }
  }, {
    threshold: 0.1,
    rootMargin: '100px 0px 0px 0px'
  })

  const target = document.querySelector('#chat-top-sensor')
  if (target) scrollObserver.value.observe(target)
}

const initChat = () => {
  if (stompClient) stompClient.disconnect()

  const socket = new SockJS(apiPath('/ws-stomp'))
  stompClient = Stomp.over(socket)
  stompClient.debug = null // 디버그 로그 제거

  stompClient.connect(
    { Authorization: `Bearer ${authStore.token}` },
    () => {
      console.log('STOMP 연결 성공')

      stompClient.subscribe(`/sub/chat/room/${props.room.id}`, (sdkEvent) => {
        const data = JSON.parse(sdkEvent.body)

        // ✅ 시스템 메시지 (입장/퇴장)
        if (data.messageType === 'ENTER' || data.messageType === 'EXIT') {
          chatMessages.value.push({
            id: 'system-' + Date.now(),
            isSystem: true,       // 시스템 메시지 구분 플래그
            text: data.contents,  // "홍길동님이 입장했습니다." 등
            time: data.createdAt
          })
          nextTick(() => scrollToBottom())
          return  // 👈 이후 로직 실행 안 되게 차단
        }

        // 읽음 업데이트
        if (data.type === 'READ_UPDATE') {
          updateParticipantReadState(data.userIdx, data.lastReadMessageId)
          return
        }

        if (data.type === 'MESSAGE_DELETED') {
          applyDeletedMessage(data.messageIdx ?? data.idx, data.contents)
          return
        }

        // 내가 보낸 메시지 → 임시 메시지 교체
        if (Number(data.senderIdx) === Number(currentUserIdx.value)) {
          const tempIdx = chatMessages.value.findLastIndex(m => m.isPending && m.isMe)
          if (tempIdx !== -1) {
            chatMessages.value[tempIdx] = toChatMessage(data, { isMe: true })
            emitRoomPreviewUpdate(chatMessages.value[tempIdx])
            sortMessages()
            nextTick(() => scrollToBottom())
            return
          }
        }

        // 상대방 메시지 (중복 방지)
        if (!chatMessages.value.some(m => m.id === data.idx && !m.isPending)) {
          const nextMessage = toChatMessage(data, { isMe: false })
          chatMessages.value.push(nextMessage)
          emitRoomPreviewUpdate(nextMessage)
          sortMessages()
          nextTick(() => scrollToBottom())
          markAsRead()
        }
      })
    },
    (error) => {
      console.error('STOMP 연결 에러:', error)
    }
  )
}

const sendMessage = () => {
  const text = newMessage.value.trim()
  if (!text || !stompClient) return

  newMessage.value = '' // 즉시 초기화

  const tempMsg = {
    id: 'temp-' + Date.now() + Math.random(),
    sender: myName.value,
    text: text,
    time: new Date().toISOString(),
    isMe: true,
    isPending: true,
    messageUnreadCount: 0,
    profileImageUrl: myProfileImageUrl.value
  }
  chatMessages.value.push(tempMsg)
  emitRoomPreviewUpdate(tempMsg)
  sortMessages()
  nextTick(() => scrollToBottom())

  stompClient.send(
    `/pub/chat/${props.room.id}`,
    { Authorization: `Bearer ${authStore.token}` },
    JSON.stringify({ contents: text })
  )
}

const fileInput = ref(null)

const handleFileSelect = async (e) => {
  const file = e.target.files[0]
  if (!file) return

  const isImage = file.type.startsWith('image/')
  const maxSize = isImage ? 5 * 1024 * 1024 : 30 * 1024 * 1024

  if (file.size > maxSize) {
    alert(isImage ? '이미지는 5MB 이하만 업로드 가능합니다.' : '파일은 30MB 이하만 업로드 가능합니다.')
    return
  }

  const formData = new FormData()
  formData.append('file', file)

  try {
    const response = await api.post(`/chat/${props.room.id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })

    const fileUrl = response.data.result.fileUrl
    const messageType = isImage ? 'IMAGE' : 'FILE'

    // 임시 메시지 추가
    const tempMsg = {
      id: 'temp-' + Date.now() + Math.random(),
      sender: myName.value,
      time: new Date().toISOString(),
      isMe: true,
      isPending: true,
      messageUnreadCount: 0,
      profileImageUrl: myProfileImageUrl.value,
      fileUrl: fileUrl,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      messageType: messageType,
      contents: ''
    }
    chatMessages.value.push(tempMsg)
    emitRoomPreviewUpdate(tempMsg)
    sortMessages()
    nextTick(() => scrollToBottom())

    // 웹소켓으로 파일 메시지 전송
    stompClient.send(
      `/pub/chat/${props.room.id}`,
      { Authorization: `Bearer ${authStore.token}` },
      JSON.stringify({
        contents: '',
        fileUrl: fileUrl,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        messageType: messageType
      })
    )
  } catch (e) {
    alert('파일 업로드에 실패했습니다.')
  }

  e.target.value = '' // 같은 파일 재업로드 가능하도록
}

const stopPresenceHeartbeat = () => {
  if (presenceHeartbeatTimer) {
    window.clearInterval(presenceHeartbeatTimer)
    presenceHeartbeatTimer = null
  }
}

const sendPresenceHeartbeat = async (roomId = activePresenceRoomId) => {
  if (!roomId) return

  try {
    await api.post(`/chatRoom/${roomId}/heartbeat`)
  } catch (error) {
    console.error('채팅방 heartbeat 실패:', error)
  }
}

const startPresenceHeartbeat = (roomId) => {
  stopPresenceHeartbeat()
  if (!roomId) return

  activePresenceRoomId = roomId
  presenceHeartbeatTimer = window.setInterval(() => {
    sendPresenceHeartbeat(roomId)
  }, HEARTBEAT_INTERVAL_MS)
}

const enterRoomPresence = async (roomId) => {
  if (!roomId) return

  await api.post(`/chatRoom/${roomId}/enter`)
  activePresenceRoomId = roomId
  startPresenceHeartbeat(roomId)
}

const leaveRoomPresence = async (roomId = activePresenceRoomId) => {
  stopPresenceHeartbeat()

  if (!roomId) {
    activePresenceRoomId = null
    return
  }

  activePresenceRoomId = null

  try {
    await api.post(`/chatRoom/${roomId}/leave`)
  } catch (error) {
    console.error('채팅방 leave 실패:', error)
  }
}

const scrollToBottom = () => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
  }
}

const markAsRead = async () => {
  try {
    await api.post(`/chat/${props.room.id}/read`)
    updateParticipantReadState(currentUserIdx.value, getLatestLoadedMessageId())
  } catch (e) {
    console.error('읽음 처리 실패:', e)
  }
}

const requestNotificationPermission = async () => {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission()
  }
}
const openFile = (url) => {
  window.open(url, '_blank')
}

const deleteMessage = async () => {
  const messageId = selectedMessage.value?.id
  if (!messageId) return

  try {
    await api.delete(`/chat/${props.room.id}/${messageId}`)
    applyDeletedMessage(messageId)
    closeMessageMenu()
  } catch (error) {
    console.error('메시지 삭제 실패:', error.response?.status, error.response?.data, error)
    alert('메시지 삭제에 실패했습니다.')
  }
}

onMounted(async () => {
  window.addEventListener('click', closeMessageMenu)
  window.addEventListener('keydown', handleWindowKeydown)
  await enterRoomPresence(props.room.id)
  requestNotificationPermission()
  await fetchHistory(true)
  initObserver()
  initChat()
  markAsRead()
})

onUnmounted(() => {
  window.removeEventListener('click', closeMessageMenu)
  window.removeEventListener('keydown', handleWindowKeydown)
  leaveRoomPresence().catch(() => {})
  if (scrollObserver.value) scrollObserver.value.disconnect()
  if (stompClient) stompClient.disconnect()
})

watch(() => props.room.id, async (newRoomId, oldRoomId) => {
  closeMessageMenu()
  closeParticipantsPanel()
  participants.value = []
  if (oldRoomId && oldRoomId !== newRoomId) {
    await leaveRoomPresence(oldRoomId)
  }
  await enterRoomPresence(newRoomId)
  markAsRead()
  await fetchHistory(true)
  initObserver()
  initChat()
})

watch(() => props.participantsRefreshKey, () => {
  if (!props.room?.id) return
  fetchParticipants()
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden relative">
    <div class="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2">
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
        @click="openParticipantsPanel"
      >
        <i class="fa-solid fa-users text-[11px]"></i>
        <span>{{ participantCountLabel }}명</span>
      </button>

      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-semibold text-[#4169E1] hover:bg-blue-50"
        @click="$emit('open-invite')"
      >
        <i class="fa-solid fa-user-plus text-[11px]"></i>
        <span>초대</span>
      </button>
    </div>

    <div ref="scrollContainer" class="flex-1 overflow-y-auto p-5 space-y-4">
      <div id="chat-top-sensor" style="height: 1px; margin-bottom: -1px;"></div>

      <div v-if="isLoading && !isLastPage" class="flex justify-center py-2">
        <span class="text-[10px] text-gray-400">
          <i class="fa-solid fa-circle-notch fa-spin mr-1"></i> 이전 메시지 로딩 중...
        </span>
      </div>

      <!-- v-for 바깥 div는 단순 래퍼 -->
      <div v-for="(msg, index) in chatMessages" :key="msg.id">
        <div v-if="shouldShowDateDivider(index)" class="flex justify-center py-2">
          <span class="rounded-full bg-gray-100 px-3 py-1 text-[10px] font-semibold text-gray-500">
            {{ formatMessageDate(msg.time) }}
          </span>
        </div>

        <!-- 시스템 메시지 -->
        <div v-if="msg.isSystem" class="flex justify-center my-1 w-full">
          <span class="text-[10px] text-gray-400 bg-gray-100 rounded-full px-3 py-0.5">
            {{ msg.text }}
          </span>
        </div>

        <!-- 일반 메시지 -->
        <div v-else class="flex items-end gap-2" :class="msg.isMe ? 'flex-row-reverse' : ''">
          <div class="flex-shrink-0 w-8 h-8">
            <img
              v-if="msg.profileImageUrl"
              :src="msg.profileImageUrl"
              class="w-8 h-8 rounded-full object-cover"
            />
            <div
              v-else
              class="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[10px] font-bold"
            >
              {{ msg.sender?.charAt(0)?.toUpperCase() }}
            </div>
          </div>

          <div :class="['flex flex-col max-w-[75%]', msg.isMe ? 'items-end' : 'items-start']">
            <p class="text-[10px] font-bold text-[var(--text-muted)] mb-1">{{ msg.sender }}</p>

            <div :class="['flex items-end gap-2', msg.isMe ? 'flex-row-reverse' : '']">
              <div
                :class="[
                  'p-3 rounded-2xl text-xs break-words',
                  msg.isMe ? 'bg-[#4169E1] text-white' : 'bg-[var(--bg-input)] text-[var(--text-main)]',
                  msg.isPending ? 'opacity-60' : ''
                ]"
                @contextmenu="openMessageMenu($event, msg)"
              >
                <span v-if="msg.deleted" :class="['italic opacity-70', msg.isMe ? 'text-white' : 'text-[var(--text-muted)]']">
                  {{ msg.text }}
                </span>
                <!-- 이미지 -->
                <img
                  v-else-if="msg.messageType === 'IMAGE'"
                  :src="msg.fileUrl"
                  class="max-w-[200px] max-h-[200px] rounded-xl object-cover cursor-pointer"
                  @click="openImagePreview(msg)"
                />
                <!-- 파일 -->
                <a
                  v-else-if="msg.messageType === 'FILE'"
                  :href="msg.fileUrl"
                  target="_blank"
                  :class="['flex items-center gap-2', msg.isMe ? 'text-white' : 'text-[var(--text-main)]']"
                >
                  <i class="fa-solid fa-file text-lg"></i>
                  <div class="flex flex-col">
                    <span class="font-bold truncate max-w-[150px]">{{ msg.fileName }}</span>
                    <span class="text-[9px] opacity-70">{{ formatFileSize(msg.fileSize) }}</span>
                  </div>
                  <i class="fa-solid fa-download ml-1"></i>
                </a>
                <!-- 텍스트 -->
                <span v-else>{{ msg.text }}</span>
              </div>

              <div :class="['flex flex-col gap-0.5', msg.isMe ? 'items-end' : 'items-start']">
                <span
                  v-if="getMessageUnreadCount(msg) > 0"
                  class="text-[9px] text-blue-400 font-bold whitespace-nowrap"
                >
                  {{ getMessageUnreadCount(msg) }}
                </span>
                <span class="text-[9px] text-gray-400 whitespace-nowrap">
                  {{ formatTime(msg.time) }}
                </span>
                <span
                  v-if="formatReadPeople(msg)"
                  class="max-w-[120px] truncate text-[9px] text-gray-400"
                  :title="messageReadPeopleTitle(msg)"
                >
                  {{ formatReadPeople(msg) }}
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <div
      v-if="isParticipantsPanelOpen"
      class="absolute inset-0 z-[70] bg-black/10 md:hidden"
      @click="closeParticipantsPanel"
    ></div>

    <aside
      v-if="isParticipantsPanelOpen"
      class="absolute inset-y-0 right-0 z-[80] flex w-full max-w-[320px] flex-col border-l border-gray-100 bg-white shadow-2xl"
    >
      <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <p class="text-sm font-bold text-[var(--text-main)]">참여자</p>
          <p class="text-[10px] text-[var(--text-muted)]">{{ participants.length }}명</p>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            @click="fetchParticipants"
          >
            <i class="fa-solid fa-rotate-right text-[11px]"></i>
          </button>
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            @click="closeParticipantsPanel"
          >
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        <div v-if="participantsLoading" class="flex justify-center py-10 text-xs text-gray-400">
          <i class="fa-solid fa-circle-notch fa-spin mr-2"></i> 불러오는 중...
        </div>

        <div v-else-if="participantsError" class="rounded-lg bg-red-50 p-3 text-xs text-red-500">
          <p>{{ participantsError }}</p>
          <button type="button" class="mt-2 font-bold" @click="fetchParticipants">다시 시도</button>
        </div>

        <div v-else-if="!participants.length" class="py-10 text-center text-xs text-gray-400">
          참여자가 없습니다.
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="participant in participants"
            :key="participant.id || participant.userIdx"
            class="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2"
          >
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">
              {{ participantInitial(participant) }}
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 items-center gap-1.5">
                <p class="truncate text-xs font-bold text-[var(--text-main)]">{{ participant.nickname }}</p>
                <span
                  v-if="participant.isMe"
                  class="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-[#4169E1]"
                >
                  나
                </span>
              </div>
              <p v-if="participant.email" class="truncate text-[10px] text-[var(--text-muted)]">
                {{ participant.email }}
              </p>
              <p class="text-[9px] text-gray-400">
                {{ formatDateTime(participant.joinedAt) }} 참여
              </p>
            </div>

            <span class="shrink-0 text-[9px] font-semibold text-gray-400">
              {{ participantReadLabel(participant) }}
            </span>
          </div>
        </div>
      </div>
    </aside>

    <div
      v-if="messageMenuVisible"
      :style="{ top: `${messageMenuPos.y}px`, left: `${messageMenuPos.x}px` }"
      class="fixed z-[999] min-w-[120px] rounded-lg border border-gray-200 bg-white py-2 text-xs shadow-xl"
      @click.stop
    >
      <button
        type="button"
        class="flex w-full items-center gap-2 px-4 py-2 text-left text-red-500 hover:bg-gray-100"
        @click.stop="deleteMessage"
      >
        <i class="fa-solid fa-trash text-[10px]"></i> 삭제
      </button>
    </div>

    <div
      v-if="imagePreviewUrl"
      class="fixed inset-0 z-[998] flex items-center justify-center bg-black/85 px-4 py-8"
      @click.self="closeImagePreview"
    >
      <div class="absolute right-5 top-5 flex items-center gap-2">
        <button
          type="button"
          class="rounded-full bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20"
          @click="downloadImagePreview"
        >
          <i class="fa-solid fa-download"></i>
        </button>
        <button
          type="button"
          class="rounded-full bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20"
          @click="closeImagePreview"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="flex max-h-full max-w-full flex-col items-center gap-4">
        <img
          :src="imagePreviewUrl"
          :alt="imagePreviewName"
          class="max-h-[82vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
        />
        <a
          :href="imagePreviewUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-full bg-white px-4 py-2 text-xs font-bold text-[#123d88] shadow"
        >
          새 창에서 열기
        </a>
      </div>
    </div>

    <div class="p-4 border-t border-gray-100">
      <div class="relative flex items-center">
        <input
          ref="fileInput"
          type="file"
          accept="image/*,.pdf,.zip,.docx,.xlsx"
          class="hidden"
          @change="handleFileSelect"
        />
        <button
          @click="fileInput.click()"
          class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#4169E1] transition z-10"
        >
          <i class="fa-solid fa-paperclip"></i>
        </button>
        <input
          v-model="newMessage"
          @keydown.enter.prevent="sendMessage"
          type="text"
          placeholder="메시지 입력..."
          class="w-full border border-gray-200 rounded-lg pl-9 pr-9 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <button
          @click="sendMessage"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-[#4169E1]"
        >
          <i class="fa-solid fa-paper-plane"></i>
        </button>
      </div>
    </div>
  </div>
</template>
