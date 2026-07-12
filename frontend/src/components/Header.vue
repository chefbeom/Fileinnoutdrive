<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/useAuthStore.js";
import { fetchSettingsProfile } from "@/api/featerApi.js";
import loadpost from "./workspace/loadpost.js";
import {
  FILE_SIZE_OPTIONS,
  FILE_STATUS_OPTIONS,
  getFileSearchScope,
  isFileSearchRoute,
  useHeaderSearchStore,
} from "@/stores/useHeaderSearchStore.js";
import {
  acceptGroupInvite,
  acceptRelationshipInvite,
  rejectGroupInvite,
  rejectRelationshipInvite,
} from "@/api/groupApi.js";
import { useFileStore } from "@/stores/useFileStore.js";
import { registerPushNotification } from "@/utils/pushNotification.js";
import {
  buildCustomSizeRangeLabel,
  canUseGamesHub,
  chatNotificationDedupeKey,
  countActiveSearchFilters,
  extractNotificationListPayload,
  findHeaderNotificationIndex,
  getAvatarInitials,
  getHeaderMembershipLabel,
  getHeaderProfileImage,
  getHeaderUserEmail,
  getHeaderUserLocaleLabel,
  getHeaderUserName,
  getSearchPlaceholder,
  toHeaderNotificationItem,
} from "./headerViewModel.js";
import ProfileModal from "./ProfileModal.vue";
import GamesHubModal from "@/components/games/GamesHubModal.vue";
import postApi from "@/api/postApi.js";

const emit = defineEmits(["toggle-chat", "toggle-theme", "switch-view"]);

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const fileStore = useFileStore();
const headerSearchStore = useHeaderSearchStore();

const showNotifDropdown = ref(false);
const showProfileDropdown = ref(false);
const showSearchDropdown = ref(false);
const isProfileModalOpen = ref(false);
const isGamesModalOpen = ref(false);

const notifications = ref([]);
const hasNewNotif = ref(false);

const emitGroupStateChanged = () => {
  window.dispatchEvent(new CustomEvent("group-state-changed"));
};

// ─── 캐시 제어 ────────────────────────────────────────────────────────────────
const lastFetchedAt = ref(0);
const CACHE_TTL_MS = 2 * 60 * 1000; // 2분

let broadcastChannel = null;

const isDarkMode = ref(false);
const themeIcon = ref("fa-solid fa-moon");
const settingsTab = ref("profile");
const settingsProfile = ref(null);
const isSettingsLoading = ref(false);

const searchScope = computed(() => getFileSearchScope(route.name));
const canUseFileSearch = computed(() => isFileSearchRoute(route.name));
const searchState = computed(() => headerSearchStore.getScopeState(searchScope.value || "global"));
const extensionOptions = computed(() => searchState.value.availableExtensions || []);

const customSizeRangeLabel = computed(() => buildCustomSizeRangeLabel(searchState.value));
const activeSearchFilterCount = computed(() => countActiveSearchFilters(searchState.value, canUseFileSearch.value));
const searchPlaceholder = computed(() => getSearchPlaceholder(canUseFileSearch.value));
const userName = computed(() => getHeaderUserName(settingsProfile.value, authStore.user));
const userEmail = computed(() => getHeaderUserEmail(settingsProfile.value, authStore.user));
const userLocaleLabel = computed(() => getHeaderUserLocaleLabel(settingsProfile.value));
const membershipLabel = computed(() => getHeaderMembershipLabel(settingsProfile.value));
const canUseGames = computed(() => canUseGamesHub(fileStore.planCapabilities, settingsProfile.value));
const userProfileImage = computed(() => getHeaderProfileImage(settingsProfile.value));
const avatarInitials = computed(() => getAvatarInitials(userName.value));

const updateNotifBadge = () => {
  hasNewNotif.value = notifications.value.some((notification) => !notification.read);
};

const toNotificationItem = (item = {}) => toHeaderNotificationItem(item);
const findNotificationIndex = (target) => findHeaderNotificationIndex(notifications.value, target);

// ─── 서버 조회 (최소화) ───────────────────────────────────────────────────────
// 호출 시점: ① 로그인 직후 1회  ② 드롭다운 열 때 (캐시 만료 시만)
//            ③ 수락/거절 직후 상태 동기화
const fetchNotifications = async () => {
  if (!authStore.user?.idx) {
    notifications.value = [];
    updateNotifBadge();
    return;
  }

  try {
    const response = await postApi.getNotifications();
    const items = extractNotificationListPayload(response);
    const mapped = items.map(toNotificationItem);
    const seen = new Map();
    const grouped = [];
    for (const notif of mapped) {
      if (notif.type === "chat") {
        const key = notif.roomIdx != null ? `room_${notif.roomIdx}` : `title_${notif.title}`;
        if (seen.has(key)) {
          const existing = grouped[seen.get(key)];
          if (!notif.read) existing.unreadCount = (existing.unreadCount ?? 0) + 1;
        } else {
          seen.set(key, grouped.length);
          notif.unreadCount = notif.read ? 0 : 1;
          grouped.push(notif);
        }
      } else {
        grouped.push(notif);
      }
    }
    const serverChatKeys = new Set(
      grouped.map(chatNotificationDedupeKey).filter((key) => key != null)
    );
    const clientOnlyChats = notifications.value.filter((notification) => {
      const key = chatNotificationDedupeKey(notification);
      return notification.type === "chat" && key != null && !serverChatKeys.has(key);
    });

    notifications.value = [...clientOnlyChats, ...grouped];
    lastFetchedAt.value = Date.now();
    updateNotifBadge();
  } catch (error) {
    console.error("알림 목록 불러오기 실패:", error);
  }
};

const fetchNotificationsIfStale = async () => {
  const elapsed = Date.now() - lastFetchedAt.value;
  if (lastFetchedAt.value > 0 && elapsed < CACHE_TTL_MS) return;
  await fetchNotifications();
};

const pushNewNotification = (data) => {
  if (!data) return;
  const allowed = ["invite", "general", "group_invite", "relationship_invite", "message", "NEW_MESSAGE"];
  if (data.type && !allowed.includes(data.type)) return;

  const incoming = toNotificationItem({ ...data, read: false });

  const existingIndex = findNotificationIndex(incoming);
  if (existingIndex >= 0) {
    const previous = notifications.value[existingIndex];
    if (incoming.type === "chat") {
      const prevUnread = previous.unreadCount ?? 0;
      notifications.value.splice(existingIndex, 1);
      notifications.value.unshift({
        ...incoming,
        id: previous.id,
        serverRowId: previous.serverRowId ?? incoming.serverRowId,
        unreadCount: data.unreadCount ?? (prevUnread + 1),
      });
    } else {
      notifications.value[existingIndex] = {
        ...previous,
        ...incoming,
        processed: previous.processed,
        processedLabel: previous.processedLabel,
      };
    }
  } else {
    notifications.value.unshift(incoming);
  }

  updateNotifBadge();
};

const handleSseNotification = (event) => {
  pushNewNotification(event?.detail);
};

const markNotificationAsRead = async (notification) => {
  if (!notification?.serverRowId && !notification?.uuid) return;

  try {
    await postApi.markNotificationAsRead({
      id: notification.serverRowId ?? null,
      uuid: notification.uuid ?? null,
    });
  } catch (error) {
    console.error("알림 읽음 처리 실패:", error);
  }
};

const applyProcessedState = async (notification, label) => {
  const index = findNotificationIndex(notification);
  if (index < 0) return;

  notifications.value[index] = {
    ...notifications.value[index],
    read: true,
    processed: true,
    processedLabel: label,
  };
  updateNotifBadge();

  await markNotificationAsRead(notifications.value[index]);
};

const getErrorMessage = (error) => {
  if (typeof error?.response?.data === "string" && error.response.data.trim()) {
    return error.response.data;
  }

  if (typeof error?.response?.data?.message === "string" && error.response.data.message.trim()) {
    return error.response.data.message;
  }

  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message;
  }

  return "";
};

const handleInviteVerify = async (notification, type) => {
  if (!notification.uuid || notification.processed) return;

  try {
    await postApi.verifyEmail(notification.uuid, type);
    await applyProcessedState(notification, type === "accept" ? "수락됨" : "거절됨");
    await fetchNotifications();
    await loadpost.side_list();
  } catch (error) {
    const message = getErrorMessage(error);

    if (type === "reject" && (error?.response?.status === 500 || message.includes("거절"))) {
      await applyProcessedState(notification, "거절됨");
      await fetchNotifications();
      return;
    }

    console.error(type === "accept" ? "초대 수락 실패:" : "초대 거절 실패:", error);
    await fetchNotifications();

    if (type === "accept" && message.includes("유효하지 않은 토큰")) {
      alert("이미 처리되었거나 만료된 초대입니다.");
      return;
    }

    alert(message || (type === "accept" ? "초대 수락에 실패했습니다." : "초대 거절에 실패했습니다."));
  }
};

const handleGroupInviteAction = async (notification, type) => {
  if (!notification.referenceId || notification.processed) return;

  try {
    if (type === "accept") {
      await acceptGroupInvite(notification.referenceId);
    } else {
      await rejectGroupInvite(notification.referenceId);
    }

    await applyProcessedState(notification, type === "accept" ? "수락됨" : "거절됨");
    await fetchNotifications();
    emitGroupStateChanged();
  } catch (error) {
    console.error(type === "accept" ? "그룹 초대 수락 실패:" : "그룹 초대 거절 실패:", error);
    await fetchNotifications();
    alert(getErrorMessage(error) || (type === "accept" ? "그룹 초대 수락에 실패했습니다." : "그룹 초대 거절에 실패했습니다."));
  }
};

const handleRelationshipInviteAction = async (notification, type) => {
  if (!notification.referenceId || notification.processed) return;

  try {
    if (type === "accept") {
      await acceptRelationshipInvite(notification.referenceId);
    } else {
      await rejectRelationshipInvite(notification.referenceId);
    }

    await applyProcessedState(notification, type === "accept" ? "수락됨" : "거절됨");
    await fetchNotifications();
    emitGroupStateChanged();
  } catch (error) {
    console.error(type === "accept" ? "연결 초대 수락 실패:" : "연결 초대 거절 실패:", error);
    await fetchNotifications();
    alert(getErrorMessage(error) || (type === "accept" ? "연결 초대 수락에 실패했습니다." : "연결 초대 거절에 실패했습니다."));
  }
};

const handleNotificationAction = async (notification, type) => {
  if (notification.type === "invite") {
    await handleInviteVerify(notification, type);
    return;
  }

  if (notification.type === "group_invite") {
    await handleGroupInviteAction(notification, type);
    return;
  }

  if (notification.type === "relationship_invite") {
    await handleRelationshipInviteAction(notification, type);
  }
};

const handleNotificationClick = async (notification) => {
  if (notification.type !== "chat") return;

  if (!notification.read) {
    notification.read = true;
    notification.unreadCount = 0;
    updateNotifBadge();
    await markNotificationAsRead(notification);
  }

  showNotifDropdown.value = false;

  window.dispatchEvent(new CustomEvent("open-chat-room", {
    detail: { roomIdx: notification.roomIdx, roomTitle: notification.title }
  }));
};

const handleDeleteNotification = async (notification) => {
  try {
    if (notification.type === "chat") {
      const index = findNotificationIndex(notification);
      if (index >= 0) {
        notifications.value.splice(index, 1);
      }
      updateNotifBadge();
      return;
    }

    if (notification?.id || notification?.uuid) {
      await postApi.deleteNotification({
        id: notification.id ?? null,
        uuid: notification.uuid ?? null,
      });
    }

    notifications.value = notifications.value.filter((item) => (
      !(notification.id != null && item.id === notification.id) &&
      !(notification.uuid && item.uuid === notification.uuid)
    ));
    updateNotifBadge();
  } catch (error) {
    console.error("알림 삭제 실패:", error);
    alert("알림 삭제에 실패했습니다.");
  }
};

const swDirectMessageHandler = (event) => {
  const data = event.data;
  if (!data) return;

  if (data.channel === "notification" && data.payload) {
    pushNewNotification(data.payload);
    return;
  }

  if (data.type === "NEW_MESSAGE") {
    pushNewNotification({ ...data, type: data.notifType ?? "message" });
    return;
  }

  if (["invite", "general", "group_invite", "relationship_invite", "message"].includes(data.type)) {
    pushNewNotification(data);
  }
};

const setupNotificationChannel = () => {
  if (typeof BroadcastChannel !== "undefined") {
    broadcastChannel = new BroadcastChannel("notif_channel");
    broadcastChannel.onmessage = (event) => {
      pushNewNotification(event.data);
    };
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", swDirectMessageHandler);
  }
};

const initTheme = () => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    isDarkMode.value = true;
    themeIcon.value = "fa-solid fa-sun";
    document.documentElement.classList.add("dark");
  } else {
    isDarkMode.value = false;
    themeIcon.value = "fa-solid fa-moon";
    document.documentElement.classList.remove("dark");
  }
};

const loadSettingsProfile = async () => {
  isSettingsLoading.value = true;
  try {
    settingsProfile.value = await fetchSettingsProfile();
  } catch {
    settingsProfile.value = null;
  } finally {
    isSettingsLoading.value = false;
  }
};

const toggleNotifMenu = async () => {
  showNotifDropdown.value = !showNotifDropdown.value;
  showProfileDropdown.value = false;
  showSearchDropdown.value = false;

  if (showNotifDropdown.value) {
    await fetchNotificationsIfStale();
  }
};

const toggleProfileMenu = () => {
  showProfileDropdown.value = !showProfileDropdown.value;
  showNotifDropdown.value = false;
  showSearchDropdown.value = false;
};

const toggleSearchMenu = () => {
  if (!canUseFileSearch.value) return;
  showSearchDropdown.value = !showSearchDropdown.value;
  showNotifDropdown.value = false;
  showProfileDropdown.value = false;
};

const resetSearchFilters = () => {
  if (!searchScope.value) return;
  headerSearchStore.resetScope(searchScope.value);
};

const handleToggleTheme = () => {
  isDarkMode.value = !isDarkMode.value;
  if (isDarkMode.value) {
    themeIcon.value = "fa-solid fa-sun";
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
  } else {
    themeIcon.value = "fa-solid fa-moon";
    document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", "light");
  }
  emit("toggle-theme", isDarkMode.value);
};

const openSettings = async (tab = "profile") => {
  settingsTab.value = tab;
  showProfileDropdown.value = false;
  isProfileModalOpen.value = true;
  await loadSettingsProfile();
};

const openGamesHub = async () => {
  if (!fileStore.storageSummary && !fileStore.storageLoading) {
    try {
      await fileStore.fetchStorageSummary();
    } catch (error) {
      console.error("게임 권한 확인 실패:", error);
    }
  }

  if (!canUseGames.value) {
    return;
  }

  showProfileDropdown.value = false;
  isGamesModalOpen.value = true;
};

const handleCloseProfileModal = () => {
  isProfileModalOpen.value = false;
};

const handleCloseGamesModal = () => {
  isGamesModalOpen.value = false;
};

const handleSavedProfile = (savedProfile) => {
  settingsProfile.value = savedProfile;
};

const handleLogout = async () => {
  if (confirm("로그아웃 하시겠습니까?")) {
    await authStore.logout();
    router.push("/login");
  }
};

const handleToggleChat = () => emit("toggle-chat");

const handleClickOutside = (event) => {
  if (!event.target.closest("#profile-container")) showProfileDropdown.value = false;
  if (!event.target.closest("#notif-container")) showNotifDropdown.value = false;
  if (!event.target.closest("#header-search-container")) showSearchDropdown.value = false;
};

watch(() => route.fullPath, () => {
  showSearchDropdown.value = false;
});

watch(
  () => authStore.user?.idx,
  async (userIdx) => {
    if (!userIdx) {
      notifications.value = [];
      lastFetchedAt.value = 0;
      updateNotifBadge();
      return;
    }

    await fetchNotifications();

    if (!fileStore.storageSummary && !fileStore.storageLoading) {
      fileStore.fetchStorageSummary().catch(() => {});
    }

    try {
      await registerPushNotification();
    } catch (error) {
      console.error("알림 구독 실패:", error);
    }
  },
  { immediate: true },
);

onMounted(() => {
  initTheme();
  authStore.ensureSession().catch(() => {});
  loadSettingsProfile();
  setupNotificationChannel();
  window.addEventListener("sse-notification", handleSseNotification);
  if (!fileStore.storageSummary && !fileStore.storageLoading) {
    fileStore.fetchStorageSummary().catch(() => {});
  }
  document.addEventListener("click", handleClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleClickOutside);
  window.removeEventListener("sse-notification", handleSseNotification);
  if (broadcastChannel) {
    broadcastChannel.close();
    broadcastChannel = null;
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.removeEventListener("message", swDirectMessageHandler);
  }
});
</script>

<template>
  <div>
    <ProfileModal
      :is-open="isProfileModalOpen"
      :initial-tab="settingsTab"
      :settings-profile="settingsProfile"
      :is-loading="isSettingsLoading"
      @close="handleCloseProfileModal"
      @saved="handleSavedProfile"
    />
    <GamesHubModal
      :is-open="isGamesModalOpen"
      :can-access="canUseGames"
      @close="handleCloseGamesModal"
    />

    <header class="header-container">
      <div class="header-search-wrap" id="header-search-container">
        <span class="search-icon"><i class="fa-solid fa-search"></i></span>
        <input v-model="searchState.searchQuery" type="search" :disabled="!canUseFileSearch" :placeholder="searchPlaceholder" class="search-input" />
        <button type="button" class="search-filter-button" :class="{ 'is-active': showSearchDropdown, 'has-filters': activeSearchFilterCount > 0 }" :disabled="!canUseFileSearch" @click="toggleSearchMenu">
          <i class="fa-solid fa-sliders"></i>
          <span>속성</span>
          <span v-if="activeSearchFilterCount > 0" class="search-filter-count">{{ activeSearchFilterCount }}</span>
        </button>

        <div v-if="canUseFileSearch && showSearchDropdown" class="search-dropdown">
          <div class="search-dropdown__header">
            <div>
              <p class="search-dropdown__eyebrow">상세 검색</p>
              <p class="search-dropdown__description">확장자, 상태, 크기 조건을 현재 화면에 바로 적용합니다.</p>
            </div>
            <button v-if="activeSearchFilterCount > 0" type="button" class="search-dropdown__reset" @click="resetSearchFilters">조건 초기화</button>
          </div>

          <div class="search-dropdown__grid">
            <label class="search-field">
              <span class="search-field__label">확장자</span>
              <select v-model="searchState.extensionFilter" class="search-field__control">
                <option value="all">전체</option>
                <option v-for="extension in extensionOptions" :key="extension" :value="extension">{{ extension.toUpperCase() }}</option>
              </select>
            </label>
            <label class="search-field">
              <span class="search-field__label">상태</span>
              <select v-model="searchState.statusFilter" class="search-field__control">
                <option v-for="option in FILE_STATUS_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label class="search-field">
              <span class="search-field__label">크기</span>
              <select v-model="searchState.sizeFilter" class="search-field__control">
                <option v-for="option in FILE_SIZE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
          </div>

          <div v-if="searchState.sizeFilter === 'custom'" class="search-dropdown__grid search-dropdown__grid--custom">
            <label class="search-field">
              <span class="search-field__label">최소 크기 (MB)</span>
              <input v-model="searchState.customMinSize" type="number" min="0" class="search-field__control" placeholder="예: 50" />
            </label>
            <label class="search-field">
              <span class="search-field__label">최대 크기 (MB)</span>
              <input v-model="searchState.customMaxSize" type="number" min="0" class="search-field__control" placeholder="예: 500" />
            </label>
            <div class="search-field search-field--hint">
              <span class="search-field__label">적용 범위</span>
              <p class="search-field__hint">{{ customSizeRangeLabel }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="header-actions">
        <div class="relative" id="notif-container">
          <button @click="toggleNotifMenu" class="icon-button bell-button">
            <i class="fa-solid fa-bell"></i>
            <span v-if="hasNewNotif" class="notif-badge"></span>
          </button>

          <div v-if="showNotifDropdown" class="dropdown-container active">
            <div class="dropdown-header">
              <p class="dropdown-header__label">알림</p>
            </div>
            <div class="py-2 max-h-64 overflow-y-auto">
              <template v-if="notifications.length > 0">
                <div
                  v-for="n in notifications"
                  :key="n.id"
                  class="notification-item"
                  :class="{
                    'notif-processed': n.processed,
                    'notif-read':      n.read && !n.processed,
                    'notif-unread':    !n.read && !n.processed,
                    'cursor-pointer':  n.type === 'chat',
                  }"
                  @click="handleNotificationClick(n)"
                >
                  <div class="notification-item__top">
                    <div class="flex flex-col gap-1">
                      <div class="notif-title-row">
                        <p class="notif-title">{{ n.title }}</p>
                        <span v-if="n.type === 'chat' && !n.read && n.unreadCount > 0" class="notif-unread-count">{{ n.unreadCount > 99 ? '99+' : n.unreadCount }}</span>
                        <span v-else-if="n.read && !n.processed" class="notif-read-badge">읽음</span>
                      </div>
                      <p class="notif-message">{{ n.message }}</p>
                      <span class="notif-time">{{ n.time }}</span>
                    </div>
                    <button type="button" class="notif-delete-button" @click.stop="handleDeleteNotification(n)" aria-label="알림 삭제">
                      <i class="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                  <div v-if="['invite', 'group_invite', 'relationship_invite'].includes(n.type)" class="notif-actions">
                    <template v-if="!n.processed">
                      <button type="button" class="notif-btn notif-btn--accept" @click.stop="handleNotificationAction(n, 'accept')">수락</button>
                      <button type="button" class="notif-btn notif-btn--reject" @click.stop="handleNotificationAction(n, 'reject')">거절</button>
                    </template>
                    <span v-else class="notif-processed-label">{{ n.processedLabel }}</span>
                  </div>
                </div>
              </template>
              <div v-else class="dropdown-item">
                <span class="dropdown-muted">새로운 알림이 없습니다</span>
              </div>
            </div>
          </div>
        </div>

        <button @click="handleToggleTheme" class="icon-button theme-button" :title="isDarkMode ? '라이트 모드로 변경' : '다크 모드로 변경'"><i :class="themeIcon" class="theme-icon"></i></button>
        <button @click="handleToggleChat" class="icon-button chat-button" title="작업 채팅"><i class="fa-solid fa-comments"></i></button>

        <div class="relative" id="profile-container">
          <button @click="toggleProfileMenu" class="profile-trigger">
            <div class="profile-trigger__copy">
              <p class="profile-trigger__name">{{ userName }}</p>
              <p class="profile-trigger__plan">{{ membershipLabel }}</p>
            </div>
            <div class="profile-trigger__avatar">
              <img v-if="userProfileImage" :src="userProfileImage" :alt="userName" class="profile-trigger__avatar-image" />
              <span v-else>{{ avatarInitials }}</span>
            </div>
          </button>

          <div v-if="showProfileDropdown" class="dropdown-container active profile-dropdown">
            <div class="dropdown-header">
              <p class="dropdown-header__label">로그인 계정</p>
              <p class="dropdown-header__email">{{ userEmail }}</p>
            </div>
            <div class="py-2">
              <button type="button" class="dropdown-item" @click="openSettings('profile')"><i class="fa-solid fa-user-gear"></i><span>개인 프로필 설정</span></button>
              <button type="button" class="dropdown-item" @click="openSettings('group')"><i class="fa-solid fa-user-group"></i><span>그룹 관리</span></button>
              <button v-if="canUseGames" type="button" class="dropdown-item" @click="openGamesHub"><i class="fa-solid fa-gamepad"></i><span>Games</span></button>
              <button type="button" class="dropdown-item" @click="openSettings('security')"><i class="fa-solid fa-shield-halved"></i><span>보안 및 비밀번호</span></button>
              <button type="button" class="dropdown-item" @click="openSettings('language')"><i class="fa-solid fa-language"></i><span>언어 설정 ({{ userLocaleLabel }})</span></button>
            </div>
            <div class="dropdown-footer">
              <button type="button" class="dropdown-item logout-item" @click="handleLogout"><i class="fa-solid fa-right-from-bracket"></i><span>로그아웃</span></button>
            </div>
          </div>
        </div>
      </div>
    </header>
  </div>
</template>


<style scoped src="./Header.css"></style>
