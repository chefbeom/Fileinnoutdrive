<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore.js' // 스토어 추가
import Sidebar from '../components/Sidebar.vue'
import Header from '../components/Header.vue'
import Chat from '@/components/Chat.vue'
import MediaTheaterModal from '@/components/media/MediaTheaterModal.vue'
import MiniPlayerWidget from '@/components/media/MiniPlayerWidget.vue'
import PhotoLightboxModal from '@/components/photos/PhotoLightboxModal.vue'
import SecretPinModal from '@/components/file/SecretPinModal.vue'
import SecretFolderDialog from '@/components/file/SecretFolderDialog.vue'
import { useMediaPhotoStore } from '@/stores/useMediaPhotoStore.js'
import { registerPushNotification } from '@/utils/pushNotification.js'
import { api } from '@/plugins/axiosinterceptor.js'

const isChatOpen = ref(false)
const authStore = useAuthStore()
const mediaPhotoStore = useMediaPhotoStore()
const route = useRoute()

watch(() => route.fullPath, () => {
  if (mediaPhotoStore.activeTheaterVideoId) {
    mediaPhotoStore.closeTheater()
  }
  if (mediaPhotoStore.activeLightboxPhotoId) {
    mediaPhotoStore.closePhotoLightbox()
  }
})

const handleOpenChatRoom = (event) => {
  const roomIdx = event?.detail?.roomIdx
  if (roomIdx == null) return
  // 알림 클릭 시 채팅 패널이 열려있지 않아도 보이도록 강제 오픈
  isChatOpen.value = true
}

onMounted(async () => {
  if (authStore.token) {
    try {
      await registerPushNotification()
    } catch (e) {
      console.error('푸시 알림 등록 실패:', e)
    }
  }
})

onMounted(() => {
  window.addEventListener('open-chat-room', handleOpenChatRoom)
})

onBeforeUnmount(() => {
  window.removeEventListener('open-chat-room', handleOpenChatRoom)
})

// 2. 서버에서 가져오기 (GET)
const loadContent = async () => {
  try {
    const response = await api.get('/posts/1')
    content.value = response.data.content
  } catch (error) {
    console.error('불러오기 실패:', error)
  }
}
</script>

<template>
  <div class="main-layout">
    <Sidebar />

    <div class="content-wrapper">
      <Header @toggle-chat="isChatOpen = !isChatOpen" />

      <div class="main-container">
        <main class="main-content">
          <RouterView />
        </main>

        <Chat :is-open="isChatOpen" @close="isChatOpen = false" />
      </div>
    </div>

    <MediaTheaterModal
      :video-id="mediaPhotoStore.activeTheaterVideoId"
      :playlist-ids="mediaPhotoStore.activeTheaterPlaylistIds"
      :collection-id="mediaPhotoStore.activeTheaterCollectionId"
      @close="mediaPhotoStore.closeTheater()"
    />

    <PhotoLightboxModal
      :photo-id="mediaPhotoStore.activeLightboxPhotoId"
      :pool-ids="mediaPhotoStore.activeLightboxPoolIds"
      :initial-slideshow="mediaPhotoStore.activeLightboxSlideshow"
      @close="mediaPhotoStore.closePhotoLightbox()"
    />

    <MiniPlayerWidget />
    <SecretPinModal />
    <SecretFolderDialog />
  </div>
</template>

<style scoped>
.main-layout {
  display: flex;
  height: 100vh;
  height: 100dvh;
  overflow-x: hidden;
  background-color: var(--bg-secondary);
  transition: background-color 0.3s ease;
}

.content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.main-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  padding: clamp(0.75rem, 2vw, 2rem);
  background-color: var(--bg-secondary);
  transition: all 0.3s ease;
}

@media (max-width: 768px) {
  .main-content {
    padding: 0.75rem 0.65rem calc(5.25rem + env(safe-area-inset-bottom, 0px));
  }
}

/* 스크롤바 스타일 */
.main-content::-webkit-scrollbar {
  width: 8px;
}

.main-content::-webkit-scrollbar-track {
  background: transparent;
}

.main-content::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}

.main-content::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}
</style>
