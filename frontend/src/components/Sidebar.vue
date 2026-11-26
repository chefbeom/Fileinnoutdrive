<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router';
import BrandLogoIcon from '@/components/BrandLogoIcon.vue';
import FileUpload from '@/components/function/FilesUploadWidget.vue';
import loadpost from '@/components/workspace/loadpost.js';
import { useFileStore } from '@/stores/useFileStore.js';
import { useAuthStore } from '@/stores/useAuthStore.js';
import { useSidebarPrefsStore } from '@/stores/sidebarPrefsStore.js';
import { useMediaPhotoStore } from '@/stores/useMediaPhotoStore.js';
import { useSecretFolderStore } from '@/stores/useSecretFolderStore.js';
import { useUiLayoutStore } from '@/stores/useUiLayoutStore.js';
import { isItemInSidebar } from '@/stores/uiLayoutModel.js';
import postApi from '@/api/postApi.js';
import ShareModal from '@/views/workspace/ShareModal.vue'; 
import RoleModal from '@/views/workspace/RoleModal.vue';
import FilePreviewModal from '@/components/FilePreviewModal.vue';
import StorageShareCenterModal from '@/components/StorageShareCenterModal.vue';

const authStore = useAuthStore()
const fileStore = useFileStore()
const mediaPhotoStore = useMediaPhotoStore()
const secretFolderStore = useSecretFolderStore()
const uiLayoutStore = useUiLayoutStore()
const layout = computed(() => uiLayoutStore.layout)
const mobileBottomNavItems = computed(() => uiLayoutStore.mobileBottomNavItems)
const isNavInSidebar = (id) => isItemInSidebar(layout.value.navPlacements?.[id])
const getSidebarNavStyle = (id) => {
  const index = layout.value.sidebarNavOrder?.indexOf(id) ?? -1
  return { order: index >= 0 ? index + 1 : 99 }
}
const getSectionStyle = (sectionId) => {
  const index = layout.value.sidebarSectionOrder?.indexOf(sectionId) ?? -1
  return { order: index >= 0 ? index + 1 : 99 }
}
const openLayoutCustomizer = () => {
  isSidebarPrefsOpen.value = false
  if (isMobileViewport.value) {
    isSidebarOpen.value = false
  }
  window.dispatchEvent(new CustomEvent('open-layout-settings'))
}
const isMediaMenuOpen = ref(true)
const isPhotosMenuOpen = ref(true)
const isSidebarFavoritesOpen = ref(true)
const {
  showRecentUploaded,
  showRecentAccessed,
  maxItemsCount,
  isRecentUploadedOpen,
  isRecentAccessedOpen,
  isDefaultPreferences,
  maxItemsOptions,
  setShowRecentUploaded,
  setShowRecentAccessed,
  setMaxItemsCount,
  toggleRecentUploadedOpen,
  toggleRecentAccessedOpen,
  showBothRecentSections,
  hideBothRecentSections,
  resetSidebarPreferences,
} = useSidebarPrefsStore()

const isMobileViewport = ref(typeof window !== 'undefined' && window.innerWidth <= 768)
const isSidebarOpen = ref(!isMobileViewport.value) // 모바일에서는 기본 닫힘, 데스크톱에서는 열림
const openMenuId = ref(null) // 현재 열려있는 메뉴의 ID 관리
const isSidebarPrefsOpen = ref(false)
const sidebarPreviewFile = ref(null)

// 공유 모달 관련 상태
const isShareModalOpen = ref(false);
const targetPostIdx = ref(null);
const targetPostUuid = ref('');

// 권한 설정 모달 관련 상태
const isRoleModalOpen = ref(false);
const roleDataList = ref([]);

// 공유 저장소 & 용량 공유 모달 상태
const isStorageShareModalOpen = ref(false);
const storageShareModalInitialPage = ref('spaces');
const storageShareModalTargetParentId = ref(null);
const storageShareModalInitialStorageIdx = ref(null);
const storageShareModalShowDetailSettings = ref(false);

const openStorageShareModal = (page = 'spaces', options = {}) => {
  storageShareModalInitialPage.value = page || 'spaces';
  storageShareModalTargetParentId.value =
    options?.targetParentId !== undefined ? options.targetParentId : (fileStore.currentFolderId ?? null);
  storageShareModalInitialStorageIdx.value = options?.storageIdx ?? null;
  storageShareModalShowDetailSettings.value = Boolean(options?.showDetailSettings);
  isStorageShareModalOpen.value = true;
  if (isMobileViewport.value) {
    isSidebarOpen.value = false;
  }
};

const handleOpenStorageShareModalEvent = (event) => {
  const detail = event?.detail || {};
  const requestedPage = detail.page || 'spaces';
  openStorageShareModal(requestedPage, detail);
};

// 1. loadpost에서 정의된 상태와 함수를 가져옵니다.
const { 
  personalItems, 
  sharedItems, 
  isPersonalOpen, 
  isSharedOpen, 
  side_list 
} = loadpost;

let sideListTimer = null;
let homeLastTapAt = 0;
let mobileHomeCloseTimer = null;

const scrollToTop = () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

const handleGoHome = async (source = 'logo') => {
  const isHomeButton = source === 'sidebar-home' || source === 'mobile-bottom';
  if (!isHomeButton) {
    if (secretFolderStore.vaultMode) {
      secretFolderStore.exitVaultMode({ lockVault: false });
    }
    fileStore.navigateToFolder(null);
    scrollToTop();
    if (isMobileViewport.value) {
      isSidebarOpen.value = false;
    }
    return;
  }

  const now = Date.now();
  const isRapidDoubleTap = now - homeLastTapAt <= 450;

  if (isRapidDoubleTap) {
    homeLastTapAt = 0;
    if (mobileHomeCloseTimer) {
      clearTimeout(mobileHomeCloseTimer);
      mobileHomeCloseTimer = null;
    }
    if (isMobileViewport.value) {
      isSidebarOpen.value = false;
    }
    if (route.name !== 'home') {
      await router.push({ name: 'home' }).catch(() => {});
    }
    const entered = await secretFolderStore.openVaultAccess();
    if (entered) {
      fileStore.invalidateFolderSnapshots();
      fileStore.navigateToFolder(null);
      scrollToTop();
    }
    return;
  }

  homeLastTapAt = now;
  if (secretFolderStore.vaultMode) {
    secretFolderStore.setVaultTrashView(false);
  }
  fileStore.navigateToFolder(null);
  scrollToTop();
  if (isMobileViewport.value && source === 'sidebar-home') {
    if (mobileHomeCloseTimer) {
      clearTimeout(mobileHomeCloseTimer);
    }
    mobileHomeCloseTimer = setTimeout(() => {
      mobileHomeCloseTimer = null;
      isSidebarOpen.value = false;
    }, 460);
  }
}

const handleGoSecretFiles = () => {
  secretFolderStore.setVaultTrashView(false);
  fileStore.navigateToFolder(null);
  router.push({ name: "home" });
  if (isMobileViewport.value) {
    isSidebarOpen.value = false;
  }
};

// ✅ SSE: 협업 페이지 타이틀 실시간 반영 핵심 로직
const handleSseTitleUpdated = (evt) => {
  const updatedData = evt?.detail || {}
  const postId = Number(updatedData?.postId)
  const newTitle = updatedData?.title

  if (!postId || !newTitle) return;

  if (import.meta.env.DEV) console.debug(`[SSE Vue] 타이틀 업데이트 감지: 게시글 ${postId} -> ${newTitle}`);
  // 1. 협업 페이지(sharedItems) 리스트에서 해당 게시글 찾아서 제목 변경
  if (sharedItems.value) {
    sharedItems.value = sharedItems.value.map((item) => {
      if (Number(item?.post_idx) === postId) {
        return { ...item, title: newTitle }
      }
      return item
    })
  }

  // 2. 혹시 본인이 만든 페이지(personalItems)를 공유 중일 수 있으므로 여기도 같이 갱신
  if (personalItems.value) {
    personalItems.value = personalItems.value.map((item) => {
      if (Number(item?.post_idx) === postId) {
        return { ...item, title: newTitle }
      }
      return item
    })
  }
}

// 메뉴 토글 함수 (이벤트 전파 방지 포함)
const toggleMenu = (event, idx) => {
  event.stopPropagation();
  openMenuId.value = openMenuId.value === idx ? null : idx;
}

// 외부 클릭 시 메뉴 닫기
const closeMenu = () => {
  openMenuId.value = null;
}

const handleViewportResize = () => {
  const mobile = window.innerWidth <= 768
  if (mobile !== isMobileViewport.value) {
    isMobileViewport.value = mobile
    isSidebarOpen.value = !mobile
  }
}

const handleToggleMobileSidebarEvent = () => {
  isSidebarOpen.value = !isSidebarOpen.value
}

onMounted(() => {
  handleViewportResize()
  side_list();
  fileStore.fetchStorageSummary().catch(() => {})
  if (!fileStore.hasLoaded) {
    fileStore.fetchFiles({ background: true }).catch(() => {})
  }
  mediaPhotoStore.fetchRemoteLibraryState().catch(() => {})
  window.addEventListener('sse-title-updated', handleSseTitleUpdated)
  window.addEventListener('open-storage-share-modal', handleOpenStorageShareModalEvent)
  window.addEventListener('toggle-mobile-sidebar', handleToggleMobileSidebarEvent)
  window.addEventListener('resize', handleViewportResize)
  window.addEventListener('click', closeMenu);

  // sideListTimer = setInterval(() => {
  //   side_list();
  // }, 30000);
})

onBeforeUnmount(() => {
  if (sideListTimer) {
    clearInterval(sideListTimer);
  }
  window.removeEventListener('sse-title-updated', handleSseTitleUpdated)
  window.removeEventListener('open-storage-share-modal', handleOpenStorageShareModalEvent)
  window.removeEventListener('toggle-mobile-sidebar', handleToggleMobileSidebarEvent)
  window.removeEventListener('resize', handleViewportResize)
  window.removeEventListener('click', closeMenu);
})
 
// 사이드바 토글 함수
const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value
}

const formatBytes = (bytes) => {
  const size = Number(bytes || 0)
  if (!Number.isFinite(size) || size <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(
    Math.floor(Math.log(size) / Math.log(1024)),
    units.length - 1,
  )
  const value = size / 1024 ** unitIndex
  const fractionDigits = unitIndex === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2

  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`
}

const storageSummary = computed(() => fileStore.storageSummary)

const storageUsageWidth = computed(() => {
  return `${Math.min(100, Math.max(0, Number(storageSummary.value?.usagePercent || 0)))}%`
})

const storageUsageText = computed(() => {
  if (!storageSummary.value) {
    return '저장 공간 통계 불러오는 중'
  }

  return `${formatBytes(storageSummary.value.usedBytes)} / ${formatBytes(storageSummary.value.quotaBytes)} 사용`
})

const isAdministrator = computed(() => {
  const email = String(authStore.user?.email || '').toLowerCase()
  const role = String(authStore.user?.role || '').toUpperCase()

  return (
    Boolean(fileStore.planCapabilities?.adminAccount) ||
    role.includes('ADMIN') ||
    email === 'administrator@administrator.adm'
  )
})

const sidebarToggleStyle = computed(() => ({
  left: isSidebarOpen.value ? 'calc(16rem - 0.75rem)' : '0.75rem',
}))

const router = useRouter();
const route = useRoute();

watch(
  () => route.fullPath,
  () => {
    if (isMobileViewport.value) {
      isSidebarOpen.value = false;
    }
  },
);

const sidebarUploadedFiles = computed(() =>
  (fileStore.recentUploadedFiles || []).slice(0, maxItemsCount.value)
);

const sidebarAccessedFiles = computed(() =>
  (fileStore.recentAccessedFiles || []).slice(0, maxItemsCount.value)
);

const sidebarFavoriteFolders = computed(() =>
  (fileStore.favoriteFolders || []).slice(0, maxItemsCount.value)
);

const sidebarFavoriteFiles = computed(() =>
  (fileStore.favoriteFilesOnly || []).slice(0, maxItemsCount.value)
);

const sidebarVaultFavorites = computed(() =>
  (fileStore.vaultFavoriteItems || []).slice(0, maxItemsCount.value)
);

const openSidebarFavoriteFolder = async (folder) => {
  if (!folder?.id) return;
  if (secretFolderStore.vaultMode && !folder.isVaultSpace && String(folder.spaceType || "").toUpperCase() !== "VAULT") {
    secretFolderStore.exitVaultMode({ lockVault: false });
  }
  fileStore.navigateToFolder(folder.id);
  if (route.name !== "home") {
    await router.push({ name: "home" }).catch(() => {});
  }
  if (isMobileViewport.value) {
    isSidebarOpen.value = false;
  }
};

const openSidebarFile = (file) => {
  if (!file) return;
  if (file.lockedFile) {
    window.alert('이 파일은 잠겨있습니다.');
    return;
  }
  fileStore.recordFileAccess?.(file);
  sidebarPreviewFile.value = file;
};

const getSidebarFileIconClass = (file) => {
  const ext = String(file?.extension || file?.fileFormat || '').toLowerCase();
  if (file?.isImage || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) {
    return 'fa-regular fa-file-image text-emerald-500';
  }
  if (file?.isVideo || ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) {
    return 'fa-regular fa-file-video text-purple-500';
  }
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) {
    return 'fa-regular fa-file-audio text-amber-500';
  }
  if (ext === 'pdf') {
    return 'fa-regular fa-file-pdf text-rose-500';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return 'fa-regular fa-file-zipper text-orange-500';
  }
  if (['js', 'ts', 'vue', 'java', 'py', 'html', 'css', 'json', 'sql', 'sh', 'md'].includes(ext)) {
    return 'fa-regular fa-file-code text-sky-500';
  }
  return 'fa-regular fa-file-lines text-blue-500';
};

const goToPost = async (idx) => {
  if (!idx) return;

  // 현재 보고 있는 페이지와 동일한 idx를 클릭하면 새로고침 X
  if (String(route.params.id) === String(idx)) {
    return;
  }

  if (typeof window.__activeEditorDestroy === 'function') {
    window.__activeEditorDestroy();
    window.__activeEditorDestroy = null;
  }
  setTimeout(() => {
    router.push(`/workspace/read/${idx}`);
  }, 10);
};
// 1. 선택된 게시글의 상태를 저장할 ref 추가
const targetPostStatus = ref('Private');

// 메뉴 액션 함수들
const handleAction = async (action, idx) => {
  if (action === 'delete') {
    if (confirm('정말로 이 페이지를 삭제하시겠습니까?')) {
      await postApi.deletePost(idx); 
      await side_list(); 
      router.push({ name: 'home' });
    }
  } else if (action === 'listDelete') {
    // ✨ [추가] 목록 삭제 기능 (본인이 ADMIN이 아닐 때 리스트에서 제거)
    if (confirm('이 페이지를 내 목록에서 삭제하시겠습니까?')) {
      try {
        await postApi.list_delete(idx); // api.post(`/workspace/delete/list/${idx}`) 호출
        await side_list(); 
        router.push({ name: 'home' });
      } catch (error) {
        console.error(error);
        alert('목록 삭제 중 오류가 발생했습니다.');
      }
    }
  } else if (action === 'share') {
    const allItems = [...personalItems.value, ...sharedItems.value];
    const selectedItem = allItems.find(item => item.post_idx === idx);

    targetPostIdx.value = idx;
    targetPostUuid.value = selectedItem ? (selectedItem.uuid || selectedItem.UUID) : ''; 
    targetPostStatus.value = selectedItem ? selectedItem.status : 'Private';
    isShareModalOpen.value = true;
  } else if (action === 'settings') {
    try {
      targetPostIdx.value = idx;
      const response = await postApi.loadRole(idx);
      const fetchedRoles = response.result ? response.result.body : response;
      roleDataList.value = Array.isArray(fetchedRoles) ? fetchedRoles : [];
      isRoleModalOpen.value = true;
    } catch (error) {
      console.error('Role list fetch error:', error);
      alert('권한 정보를 불러오는데 실패했습니다.');
    }
  }
  openMenuId.value = null;
}
</script>

<template>
  <div class="relative">
    <ShareModal 
      :is-open="isShareModalOpen" 
      :post-idx="targetPostIdx"
      :uuid="targetPostUuid" 
      :initial-status="targetPostStatus" 
      @close="isShareModalOpen = false"
    />
    <RoleModal
      :is-open="isRoleModalOpen"
      :post-idx="targetPostIdx"
      :initial-roles="roleDataList"
      @close="isRoleModalOpen = false"
    />
    <FilePreviewModal
      :file="sidebarPreviewFile"
      @close="sidebarPreviewFile = null"
    />
    <StorageShareCenterModal
      :is-open="isStorageShareModalOpen"
      :initial-page="storageShareModalInitialPage"
      :initial-target-parent-id="storageShareModalTargetParentId"
      :initial-storage-idx="storageShareModalInitialStorageIdx"
      :initial-show-detail-settings="storageShareModalShowDetailSettings"
      @close="isStorageShareModalOpen = false"
    />

    <div
      v-if="isSidebarOpen"
      class="fixed inset-0 z-[135] bg-slate-950/50 backdrop-blur-[2px] md:hidden"
      @click="isSidebarOpen = false"
    ></div>

    <aside 
      class="bg-[var(--bg-sidebar)] border-r border-[var(--border-color)] flex flex-col transition-all duration-300 h-full sticky top-0 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-[140] max-md:shadow-2xl"
      :class="[
        isSidebarOpen ? 'w-64 overflow-visible' : 'w-0 border-r-0 overflow-hidden',
        layout.sidebarCompactMode ? 'sidebar-compact' : '',
      ]"
    >
      <div :class="isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'" class="transition-opacity duration-300 h-full flex flex-col">
        <RouterLink 
          :to="{ name: 'home' }" 
          class="py-6 px-6 pb-4 flex items-center gap-3 no-underline cursor-pointer transition-opacity duration-200 hover:opacity-80 flex-shrink-0"
          @click="handleGoHome"
        >
          <BrandLogoIcon class="w-9 h-9 flex-shrink-0 rounded-[9px] shadow-md shadow-sky-500/20" />
          <span class="font-bold text-lg text-[var(--text-main)] tracking-tight no-underline">FileInNOut</span>
        </RouterLink>

        <div
          class="px-6 mb-4 overflow-visible relative z-[100]"
          :class="{ '!mb-0 !px-0 h-0 overflow-hidden': !layout.showSidebarUploadButton }"
        >
          <FileUpload :hide-trigger="!layout.showSidebarUploadButton" />
        </div>

        <nav class="flex-1 px-3 overflow-y-auto custom-scrollbar flex flex-col">
          <div v-show="layout.showSidebarNavSection" :style="getSectionStyle('nav')" class="mb-6 flex flex-col gap-1">
            <RouterLink
              v-if="isNavInSidebar('home')"
              :style="getSidebarNavStyle('home')"
              :to="{ name: 'home' }"
              class="w-full flex items-center gap-3.5 px-3 py-2.5 text-sm text-[var(--text-secondary)] rounded-xl transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)] no-underline"
              active-class="!bg-blue-500/10 !text-blue-600 !font-bold dark:!bg-blue-400/20 dark:!text-blue-400"
              @click="handleGoHome('sidebar-home')"
            >
              <i class="fa-solid fa-house w-5 text-center flex-shrink-0 text-lg"></i>
              <span>홈</span>
            </RouterLink>

            <RouterLink
              v-if="isNavInSidebar('favoriteFile') && !(secretFolderStore.vaultMode && secretFolderStore.vaultUnlocked)"
              :style="getSidebarNavStyle('favoriteFile')"
              :to="{ name: 'favoriteFile' }"
              data-testid="sidebar-nav-favorites"
              class="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm text-[var(--text-secondary)] rounded-xl transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)] no-underline"
              active-class="!bg-amber-500/10 !text-amber-600 !font-bold dark:!bg-amber-400/20 dark:!text-amber-400"
            >
              <div class="flex items-center gap-3.5">
                <i class="fa-solid fa-star w-5 text-center flex-shrink-0 text-lg text-amber-500"></i>
                <span>즐겨찾기</span>
              </div>
              <span
                v-if="(fileStore.favoriteItems || []).length > 0"
                class="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-600 dark:text-amber-400"
              >
                {{ (fileStore.favoriteItems || []).length }}
              </span>
            </RouterLink>

            <!-- 비밀 공간 전용 빠른 이동 (잠금 해제된 비밀 공간에서만 표시) -->
            <div
              v-if="secretFolderStore.vaultMode && secretFolderStore.vaultUnlocked"
              data-testid="sidebar-secret-nav"
              class="mt-1.5 mb-1.5 space-y-0.5 rounded-2xl border border-amber-400/40 bg-amber-500/5 p-1.5"
            >
              <div class="flex items-center justify-between px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-600 dark:text-amber-400">
                <span><i class="fa-solid fa-shield-halved mr-1"></i>비밀 공간</span>
              </div>
              <button
                type="button"
                class="w-full flex items-center gap-3 px-2.5 py-2 text-xs font-bold rounded-xl transition-colors"
                :class="route.name === 'home' && !secretFolderStore.vaultTrashView
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]'"
                @click="handleGoSecretFiles"
              >
                <i class="fa-solid fa-folder-lock fa-fw text-amber-500"></i>
                <span>비밀 파일</span>
              </button>
              <RouterLink
                :to="{ name: 'secretMedia' }"
                class="flex items-center gap-3 px-2.5 py-2 text-xs font-bold rounded-xl transition-colors no-underline"
                :class="route.name === 'secretMedia'
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]'"
              >
                <i class="fa-solid fa-clapperboard fa-fw text-rose-500"></i>
                <span>비밀 미디어</span>
              </RouterLink>
              <RouterLink
                :to="{ name: 'secretPhotos' }"
                class="flex items-center gap-3 px-2.5 py-2 text-xs font-bold rounded-xl transition-colors no-underline"
                :class="route.name === 'secretPhotos'
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]'"
              >
                <i class="fa-solid fa-images fa-fw text-amber-500"></i>
                <span>비밀 사진첩</span>
              </RouterLink>

              <div
                v-if="sidebarVaultFavorites.length > 0"
                data-testid="sidebar-vault-favorites"
                class="mt-1 border-t border-amber-400/25 pt-1.5 space-y-0.5"
              >
                <div class="px-2 py-0.5 text-[10px] font-extrabold text-amber-600 dark:text-amber-400">
                  비밀 즐겨찾기 · 바로가기
                </div>
                <button
                  v-for="item in sidebarVaultFavorites"
                  :key="'vault-fav-' + item.id"
                  type="button"
                  class="w-full flex items-center gap-2 px-2 py-1 text-left text-[11px] font-bold text-[var(--text-secondary)] rounded-lg hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
                  @click="item.type === 'folder' ? openSidebarFavoriteFolder(item) : openSidebarFile(item)"
                >
                  <i :class="item.type === 'folder' ? 'fa-solid fa-folder text-amber-500' : getSidebarFileIconClass(item)" class="w-3.5 text-center shrink-0"></i>
                  <span class="truncate">{{ item.name }}</span>
                </button>
              </div>
            </div>

            <!-- 미디어 메뉴 (아코디언 하위 메뉴 포함) -->
            <div v-if="isNavInSidebar('media')" :style="getSidebarNavStyle('media')" class="mt-1">
              <div class="flex items-center gap-1">
                <RouterLink
                  :to="{ name: 'media' }"
                  class="flex-1 flex items-center justify-between gap-2 px-3 py-2.5 text-sm text-[var(--text-secondary)] rounded-xl transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)] no-underline"
                  :class="route.name === 'media' ? '!bg-blue-500/10 !text-blue-600 !font-bold dark:!bg-blue-400/20 dark:!text-blue-400' : ''"
                >
                  <div class="flex items-center gap-3.5">
                    <i class="fa-solid fa-clapperboard w-5 text-center flex-shrink-0 text-lg text-purple-500"></i>
                    <span>미디어</span>
                  </div>
                  <span
                    v-if="!mediaPhotoStore.isVaultScope && mediaPhotoStore.continueWatchingVideos.length > 0"
                    class="rounded-full bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-purple-500"
                    title="이어보기 중인 동영상 수"
                  >
                    {{ mediaPhotoStore.continueWatchingVideos.length }}
                  </span>
                </RouterLink>
                <button
                  v-if="layout.showMediaSubmenu"
                  type="button"
                  class="p-2 rounded-xl text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
                  :title="isMediaMenuOpen ? '미디어 하위 메뉴 접기' : '미디어 하위 메뉴 펼치기'"
                  @click.stop="isMediaMenuOpen = !isMediaMenuOpen"
                >
                  <span class="inline-block transition-transform duration-200" :class="{ 'rotate-180': !isMediaMenuOpen }">▼</span>
                </button>
              </div>

              <div v-show="layout.showMediaSubmenu && isMediaMenuOpen" class="mt-1 ml-4 pl-3 border-l border-[var(--border-color)] space-y-0.5">
                <RouterLink
                  :to="{ name: 'media' }"
                  class="flex items-center justify-between px-3 py-1.5 text-xs rounded-lg transition-colors no-underline"
                  :class="route.name === 'media' && (!route.query.section || route.query.section === 'series')
                    ? 'bg-blue-500/15 text-blue-600 font-bold dark:text-blue-400'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]'"
                >
                  <span>시리즈 · 작품</span>
                  <span v-if="!mediaPhotoStore.isVaultScope" class="text-[10px] text-[var(--text-muted)]">{{ mediaPhotoStore.resolvedMediaSeries.length }}</span>
                </RouterLink>
                <RouterLink
                  :to="{ name: 'media', query: { section: 'recent' } }"
                  class="flex items-center justify-between px-3 py-1.5 text-xs rounded-lg transition-colors no-underline"
                  :class="route.name === 'media' && route.query.section === 'recent'
                    ? 'bg-blue-500/15 text-blue-600 font-bold dark:text-blue-400'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]'"
                >
                  <span>최근 시청</span>
                  <span v-if="!mediaPhotoStore.isVaultScope" class="text-[10px] text-[var(--text-muted)]">{{ mediaPhotoStore.recentlyWatchedVideos.length }}</span>
                </RouterLink>
                <RouterLink
                  :to="{ name: 'media', query: { section: 'continue' } }"
                  class="flex items-center justify-between px-3 py-1.5 text-xs rounded-lg transition-colors no-underline"
                  :class="route.name === 'media' && route.query.section === 'continue'
                    ? 'bg-blue-500/15 text-blue-600 font-bold dark:text-blue-400'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]'"
                >
                  <span>이어보기</span>
                  <span
                    v-if="!mediaPhotoStore.isVaultScope && mediaPhotoStore.continueWatchingVideos.length > 0"
                    class="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold text-blue-500"
                  >
                    {{ mediaPhotoStore.continueWatchingVideos.length }}
                  </span>
                </RouterLink>
                <RouterLink
                  :to="{ name: 'media', query: { section: 'collections' } }"
                  class="flex items-center justify-between px-3 py-1.5 text-xs rounded-lg transition-colors no-underline"
                  :class="route.name === 'media' && route.query.section === 'collections'
                    ? 'bg-blue-500/15 text-blue-600 font-bold dark:text-blue-400'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]'"
                >
                  <span>내 컬렉션</span>
                  <span v-if="!mediaPhotoStore.isVaultScope" class="text-[10px] text-[var(--text-muted)]">{{ mediaPhotoStore.resolvedMediaCollections.length }}</span>
                </RouterLink>
                <RouterLink
                  :to="{ name: 'media', query: { section: 'favorites' } }"
                  class="flex items-center justify-between px-3 py-1.5 text-xs rounded-lg transition-colors no-underline"
                  :class="route.name === 'media' && route.query.section === 'favorites'
                    ? 'bg-blue-500/15 text-blue-600 font-bold dark:text-blue-400'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]'"
                >
                  <span>즐겨찾기</span>
                  <span v-if="!mediaPhotoStore.isVaultScope" class="text-[10px] text-[var(--text-muted)]">{{ mediaPhotoStore.totalMediaFavoritesCount }}</span>
                </RouterLink>
              </div>
            </div>

            <!-- 사진첩 메뉴 (아코디언 하위 메뉴 포함) -->
            <div v-if="isNavInSidebar('photos')" :style="getSidebarNavStyle('photos')" class="mt-1 mb-1">
              <div class="flex items-center gap-1">
                <RouterLink
                  :to="{ name: 'photos' }"
                  class="flex-1 flex items-center justify-between gap-2 px-3 py-2.5 text-sm text-[var(--text-secondary)] rounded-xl transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)] no-underline"
                  :class="route.name === 'photos' ? '!bg-blue-500/10 !text-blue-600 !font-bold dark:!bg-blue-400/20 dark:!text-blue-400' : ''"
                >
                  <div class="flex items-center gap-3.5">
                    <i class="fa-solid fa-images w-5 text-center flex-shrink-0 text-lg text-emerald-500"></i>
                    <span>사진첩</span>
                  </div>
                  <span v-if="!mediaPhotoStore.isVaultScope" class="text-[10px] font-bold text-[var(--text-muted)]">
                    {{ mediaPhotoStore.allPhotos.length }}
                  </span>
                </RouterLink>
                <button
                  v-if="layout.showPhotosSubmenu"
                  type="button"
                  class="p-2 rounded-xl text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
                  :title="isPhotosMenuOpen ? '사진첩 하위 메뉴 접기' : '사진첩 하위 메뉴 펼치기'"
                  @click.stop="isPhotosMenuOpen = !isPhotosMenuOpen"
                >
                  <span class="inline-block transition-transform duration-200" :class="{ 'rotate-180': !isPhotosMenuOpen }">▼</span>
                </button>
              </div>

              <div v-show="layout.showPhotosSubmenu && isPhotosMenuOpen" class="mt-1 ml-4 pl-3 border-l border-[var(--border-color)] space-y-0.5">
                <RouterLink
                  :to="{ name: 'photos' }"
                  class="flex items-center justify-between px-3 py-1.5 text-xs rounded-lg transition-colors no-underline"
                  :class="route.name === 'photos' && (!route.query.tab || route.query.tab === 'timeline')
                    ? 'bg-blue-500/15 text-blue-600 font-bold dark:text-blue-400'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]'"
                >
                  <span>모든 사진</span>
                  <span v-if="!mediaPhotoStore.isVaultScope" class="text-[10px] text-[var(--text-muted)]">{{ mediaPhotoStore.allPhotos.length }}</span>
                </RouterLink>
                <RouterLink
                  :to="{ name: 'photos', query: { tab: 'albums' } }"
                  class="flex items-center justify-between px-3 py-1.5 text-xs rounded-lg transition-colors no-underline"
                  :class="route.name === 'photos' && route.query.tab === 'albums'
                    ? 'bg-blue-500/15 text-blue-600 font-bold dark:text-blue-400'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]'"
                >
                  <span>앨범</span>
                  <span v-if="!mediaPhotoStore.isVaultScope" class="text-[10px] text-[var(--text-muted)]">{{ mediaPhotoStore.resolvedPhotoAlbums.length }}</span>
                </RouterLink>
                <RouterLink
                  :to="{ name: 'photos', query: { tab: 'favorites' } }"
                  class="flex items-center justify-between px-3 py-1.5 text-xs rounded-lg transition-colors no-underline"
                  :class="route.name === 'photos' && route.query.tab === 'favorites'
                    ? 'bg-blue-500/15 text-blue-600 font-bold dark:text-blue-400'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]'"
                >
                  <span>즐겨찾기</span>
                  <span v-if="!mediaPhotoStore.isVaultScope" class="text-[10px] text-[var(--text-muted)]">{{ mediaPhotoStore.totalPhotoFavoritesCount }}</span>
                </RouterLink>
              </div>
            </div>

            <RouterLink
              v-if="false"
              :to="{ name: 'drive' }"
              class="w-full flex items-center gap-3.5 px-3 py-2.5 text-sm text-[var(--text-secondary)] rounded-xl transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)] no-underline"
              active-class="!bg-blue-500/10 !text-blue-600 !font-bold dark:!bg-blue-400/20 dark:!text-blue-400"
            >
              <i class="fa-brands fa-google-drive w-5 text-center flex-shrink-0 text-lg"></i>
              <span>홈</span>
            </RouterLink>

            <RouterLink
              v-if="isNavInSidebar('shareFile')"
              :style="getSidebarNavStyle('shareFile')"
              :to="{ name: 'shareFile' }"
              class="w-full flex items-center gap-3.5 px-3 py-2.5 text-sm text-[var(--text-secondary)] rounded-xl transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)] no-underline"
              active-class="!bg-blue-500/10 !text-blue-600 !font-bold dark:!bg-blue-400/20 dark:!text-blue-400"
            >
              <i class="fa-solid fa-people-group w-5 text-center flex-shrink-0 text-lg"></i>
              <span>공유 파일</span>
            </RouterLink>

            <button
              v-if="isNavInSidebar('storageShare')"
              :style="getSidebarNavStyle('storageShare')"
              type="button"
              class="w-full flex items-center gap-3.5 px-3 py-2.5 text-sm text-[var(--text-secondary)] rounded-xl transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)] no-underline text-left"
              :class="isStorageShareModalOpen ? '!bg-blue-500/10 !text-blue-600 !font-bold dark:!bg-blue-400/20 dark:!text-blue-400' : ''"
              @click="openStorageShareModal('spaces')"
            >
              <i class="fa-solid fa-folder-tree w-5 text-center flex-shrink-0 text-lg"></i>
              <span>공유 저장소</span>
            </button>

            <div v-if="isNavInSidebar('recentFile')" :style="getSidebarNavStyle('recentFile')">
            <div class="flex items-center gap-1">
              <RouterLink
                :to="{ name: 'recentFile' }"
                class="flex-1 flex items-center gap-3.5 px-3 py-2.5 text-sm text-[var(--text-secondary)] rounded-xl transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)] no-underline"
                active-class="!bg-blue-500/10 !text-blue-600 !font-bold dark:!bg-blue-400/20 dark:!text-blue-400"
              >
                <i class="fa-solid fa-clock w-5 text-center flex-shrink-0 text-lg"></i>
                <span>최근 파일</span>
              </RouterLink>
              <button
                type="button"
                @click.stop="isSidebarPrefsOpen = !isSidebarPrefsOpen"
                class="p-2 rounded-xl text-xs transition-colors duration-200"
                :class="isSidebarPrefsOpen ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' : 'text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]'"
                title="최근 파일 사이드바 표시 설정"
              >
                <i class="fa-solid fa-sliders"></i>
              </button>
            </div>

            <!-- 왼쪽 네비게이션 바 사용자 설정 패널 -->
            <div
              v-if="isSidebarPrefsOpen"
              @click.stop
              class="mt-2 mx-1 p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] shadow-md space-y-2.5 text-xs"
            >
              <div class="flex items-center justify-between">
                <span class="font-bold text-[var(--text-main)]">사이드바 최근 파일 설정</span>
                <button
                  v-if="!isDefaultPreferences"
                  type="button"
                  @click="resetSidebarPreferences"
                  class="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                  기본값 복원
                </button>
              </div>

              <label class="flex items-center justify-between cursor-pointer py-1">
                <span class="text-[var(--text-secondary)]">최근 업로드한 파일 표시</span>
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  :checked="showRecentUploaded"
                  @change="setShowRecentUploaded($event.target.checked)"
                />
              </label>

              <label class="flex items-center justify-between cursor-pointer py-1">
                <span class="text-[var(--text-secondary)]">최근 열어본 파일 표시</span>
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  :checked="showRecentAccessed"
                  @change="setShowRecentAccessed($event.target.checked)"
                />
              </label>

              <div class="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  @click="showBothRecentSections"
                  class="flex-1 py-1 px-2 rounded-lg border border-[var(--border-color)] text-[11px] font-medium transition-colors"
                  :class="showRecentUploaded && showRecentAccessed ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'"
                >
                  둘 다 표시
                </button>
                <button
                  type="button"
                  @click="hideBothRecentSections"
                  class="flex-1 py-1 px-2 rounded-lg border border-[var(--border-color)] text-[11px] font-medium transition-colors"
                  :class="!showRecentUploaded && !showRecentAccessed ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'"
                >
                  둘 다 숨김
                </button>
              </div>

              <div class="flex items-center justify-between pt-1 border-t border-[var(--border-color)]">
                <span class="text-[11px] text-[var(--text-muted)]">표시 개수</span>
                <div class="flex items-center gap-1">
                  <button
                    v-for="countOpt in maxItemsOptions"
                    :key="countOpt"
                    type="button"
                    @click="setMaxItemsCount(countOpt)"
                    class="px-2 py-0.5 rounded text-[11px] font-semibold transition-colors"
                    :class="maxItemsCount === countOpt ? 'bg-blue-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'"
                  >
                    {{ countOpt }}개
                  </button>
                </div>
              </div>
              <div class="pt-1.5 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  @click="openLayoutCustomizer"
                  class="w-full py-1.5 px-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-[var(--bg-input)] transition-colors flex items-center justify-center gap-1.5"
                >
                  <i class="fa-solid fa-table-columns"></i>
                  <span>화면 · 버튼 배치 전체 설정</span>
                </button>
              </div>
            </div>
            </div>
          </div>

          <!-- 즐겨찾기 · 바로가기 섹션 (일반 영역 전용) -->
          <div
            v-if="!(secretFolderStore.vaultMode && secretFolderStore.vaultUnlocked) && (sidebarFavoriteFolders.length > 0 || sidebarFavoriteFiles.length > 0)"
            data-testid="sidebar-favorites-section"
            class="mb-3"
          >
            <div
              @click="isSidebarFavoritesOpen = !isSidebarFavoritesOpen"
              class="flex items-center justify-between px-4 py-2 cursor-pointer rounded-lg transition-colors duration-200 hover:bg-[var(--bg-input)]"
            >
              <div class="flex items-center gap-2 overflow-hidden">
                <i class="fa-solid fa-star text-xs text-amber-500 flex-shrink-0"></i>
                <h3 class="text-xs font-bold text-[var(--text-muted)] tracking-wider truncate">즐겨찾기 · 바로가기</h3>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <RouterLink
                  :to="{ name: 'favoriteFile' }"
                  @click.stop
                  class="text-[11px] text-blue-500 hover:underline no-underline"
                >
                  전체
                </RouterLink>
                <span class="text-xs text-[var(--text-muted)] transition-transform duration-200" :class="{ 'rotate-180': !isSidebarFavoritesOpen }">▼</span>
              </div>
            </div>

            <div v-show="isSidebarFavoritesOpen" class="mt-1 space-y-1 px-2">
              <button
                v-for="folder in sidebarFavoriteFolders"
                :key="'sidebar-fav-folder-' + folder.id"
                type="button"
                @click="openSidebarFavoriteFolder(folder)"
                class="w-full px-3 py-1.5 text-left text-xs font-semibold text-[var(--text-secondary)] rounded-xl flex items-center justify-between gap-2 transition-all duration-200 hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400"
                :title="`${folder.name} 폴더로 바로 이동`"
              >
                <div class="flex items-center gap-2.5 overflow-hidden">
                  <i class="fa-solid fa-folder text-amber-500 w-4 text-center flex-shrink-0"></i>
                  <span class="truncate">{{ folder.name }}</span>
                </div>
                <span class="text-[10px] text-[var(--text-muted)] flex-shrink-0">이동</span>
              </button>

              <div
                v-for="file in sidebarFavoriteFiles"
                :key="'sidebar-fav-file-' + file.id"
                @click="openSidebarFile(file)"
                class="group px-3 py-1.5 text-xs text-[var(--text-secondary)] rounded-xl cursor-pointer flex items-center justify-between gap-2 transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
                :title="`${file.name} (${file.sizeLabel || '-'})`"
              >
                <div class="flex items-center gap-2.5 overflow-hidden">
                  <i :class="getSidebarFileIconClass(file)" class="w-4 text-center flex-shrink-0"></i>
                  <span class="truncate">{{ file.name }}</span>
                </div>
                <span class="text-[10px] text-[var(--text-muted)] flex-shrink-0">{{ file.sizeLabel }}</span>
              </div>
            </div>
          </div>

          <div
            v-if="layout.showSidebarRecentSection && (showRecentUploaded || showRecentAccessed)"
            :style="getSectionStyle('recentFiles')"
          >
          <!-- 최근 등록(업로드)한 파일 섹션 -->
          <div v-if="showRecentUploaded" class="mb-3">
            <div
              @click="toggleRecentUploadedOpen"
              class="flex items-center justify-between px-4 py-2 cursor-pointer rounded-lg transition-colors duration-200 hover:bg-[var(--bg-input)]"
            >
              <div class="flex items-center gap-2 overflow-hidden">
                <i class="fa-solid fa-cloud-arrow-up text-xs text-blue-500 flex-shrink-0"></i>
                <h3 class="text-xs font-bold text-[var(--text-muted)] tracking-wider truncate">최근 업로드한 파일</h3>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <button
                  v-if="sidebarUploadedFiles.length > 0"
                  type="button"
                  @click.stop="fileStore.clearUploadedFiles()"
                  class="text-[11px] text-[var(--text-muted)] hover:text-rose-500 transition-colors"
                  title="최근 업로드 기록 비우기"
                >
                  비우기
                </button>
                <RouterLink
                  :to="{ name: 'recentFile', query: { tab: 'uploaded' } }"
                  @click.stop
                  class="text-[11px] text-blue-500 hover:underline no-underline"
                >
                  전체
                </RouterLink>
                <span class="text-xs text-[var(--text-muted)] transition-transform duration-200" :class="{ 'rotate-180': !isRecentUploadedOpen }">▼</span>
              </div>
            </div>

            <div v-show="isRecentUploadedOpen" class="mt-1 space-y-1 px-2">
              <template v-if="sidebarUploadedFiles.length > 0">
                <div
                  v-for="file in sidebarUploadedFiles"
                  :key="'sidebar-uploaded-' + file.id"
                  @click="openSidebarFile(file)"
                  class="group px-3 py-1.5 text-xs text-[var(--text-secondary)] rounded-xl cursor-pointer flex items-center justify-between gap-2 transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
                  :title="`${file.name} (${file.sizeLabel || '-'})`"
                >
                  <div class="flex items-center gap-2.5 overflow-hidden">
                    <i :class="getSidebarFileIconClass(file)" class="w-4 text-center flex-shrink-0"></i>
                    <span class="truncate">{{ file.name }}</span>
                  </div>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <span class="text-[10px] text-[var(--text-muted)]">{{ file.sizeLabel }}</span>
                    <button
                      type="button"
                      @click.stop="fileStore.removeUploadedFileHistory(file.id)"
                      class="opacity-0 group-hover:opacity-100 max-md:opacity-75 px-1 text-[10px] text-[var(--text-muted)] hover:text-rose-500 transition-opacity"
                      title="기록에서 지우기"
                      aria-label="최근 업로드 기록에서 지우기"
                    >
                      <i class="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                </div>
              </template>
              <div v-else class="px-3 py-3 text-xs text-[var(--text-muted)] italic text-center border border-dashed border-[var(--border-color)] rounded-lg mx-2">
                최근 업로드한 파일이 없습니다.
              </div>
            </div>
          </div>

          <!-- 최근 접근(열어본)한 파일 섹션 -->
          <div v-if="showRecentAccessed" class="mb-3">
            <div
              @click="toggleRecentAccessedOpen"
              class="flex items-center justify-between px-4 py-2 cursor-pointer rounded-lg transition-colors duration-200 hover:bg-[var(--bg-input)]"
            >
              <div class="flex items-center gap-2 overflow-hidden">
                <i class="fa-solid fa-clock-rotate-left text-xs text-emerald-500 flex-shrink-0"></i>
                <h3 class="text-xs font-bold text-[var(--text-muted)] tracking-wider truncate">최근 열어본 파일</h3>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <button
                  v-if="sidebarAccessedFiles.length > 0"
                  type="button"
                  @click.stop="fileStore.clearAccessedFiles()"
                  class="text-[11px] text-[var(--text-muted)] hover:text-rose-500 transition-colors"
                  title="최근 열어본 기록 비우기"
                >
                  비우기
                </button>
                <RouterLink
                  :to="{ name: 'recentFile', query: { tab: 'accessed' } }"
                  @click.stop
                  class="text-[11px] text-blue-500 hover:underline no-underline"
                >
                  전체
                </RouterLink>
                <span class="text-xs text-[var(--text-muted)] transition-transform duration-200" :class="{ 'rotate-180': !isRecentAccessedOpen }">▼</span>
              </div>
            </div>

            <div v-show="isRecentAccessedOpen" class="mt-1 space-y-1 px-2">
              <template v-if="sidebarAccessedFiles.length > 0">
                <div
                  v-for="file in sidebarAccessedFiles"
                  :key="'sidebar-accessed-' + file.id"
                  @click="openSidebarFile(file)"
                  class="group px-3 py-1.5 text-xs text-[var(--text-secondary)] rounded-xl cursor-pointer flex items-center justify-between gap-2 transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
                  :title="`${file.name} (${file.sizeLabel || '-'})`"
                >
                  <div class="flex items-center gap-2.5 overflow-hidden">
                    <i :class="getSidebarFileIconClass(file)" class="w-4 text-center flex-shrink-0"></i>
                    <span class="truncate">{{ file.name }}</span>
                  </div>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <span class="text-[10px] text-[var(--text-muted)]">{{ file.sizeLabel }}</span>
                    <button
                      type="button"
                      @click.stop="fileStore.removeAccessedFileHistory(file.id)"
                      class="opacity-0 group-hover:opacity-100 max-md:opacity-75 px-1 text-[10px] text-[var(--text-muted)] hover:text-rose-500 transition-opacity"
                      title="기록에서 지우기"
                      aria-label="최근 열람 기록에서 지우기"
                    >
                      <i class="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                </div>
              </template>
              <div v-else class="px-3 py-3 text-xs text-[var(--text-muted)] italic text-center border border-dashed border-[var(--border-color)] rounded-lg mx-2">
                최근 열어본 파일이 없습니다.
              </div>
            </div>
          </div>
          </div>

          <div v-if="layout.showPersonalPages" :style="getSectionStyle('personalPages')">
            <div class="border-t border-[var(--border-color)] my-4 mx-2"></div>
            <div>
              <div @click="isPersonalOpen = !isPersonalOpen" class="flex items-center justify-between px-4 py-2 cursor-pointer rounded-lg transition-colors duration-200 hover:bg-[var(--bg-input)] group">
                <h3 class="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">개인 페이지</h3>
              <div class="flex items-center gap-2">
                <RouterLink :to="{ name: 'workspace' }" @click.stop>
                  <button class="p-1 rounded hover:bg-gray-200 text-[var(--text-muted)] hover:text-blue-500 transition-colors">
                    <i class="fa-solid fa-plus text-[10px]"></i>
                  </button>
                </RouterLink>
                <span class="text-xs text-[var(--text-muted)] transition-transform duration-200" :class="{ 'rotate-180': !isPersonalOpen }">▼</span>
              </div>
            </div>

            <div v-show="isPersonalOpen" class="mt-1 space-y-1 px-2">
              <template v-if="personalItems.length > 0">
                <div v-for="item in personalItems" :key="item.post_idx" @click="goToPost(item.post_idx)" class="group relative px-3 py-2 text-sm text-[var(--text-secondary)] rounded-xl cursor-pointer flex items-center justify-between transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]">
                  <div class="flex items-center gap-3 overflow-hidden">
                    <i class="fa-solid fa-file-lines w-4 text-center opacity-70 flex-shrink-0"></i>
                    <span class="truncate">{{ item.title }}</span>
                  </div>
                  <button @click="toggleMenu($event, item.post_idx)" class="opacity-0 group-hover:opacity-100 max-md:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-all">
                    <i class="fa-solid fa-ellipsis text-xs"></i>
                  </button>
                  <div v-if="openMenuId === item.post_idx" class="absolute right-2 top-10 w-32 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg shadow-xl z-[110] py-1 overflow-hidden">
                    <button v-if="item.level === 'ADMIN'" @click.stop="handleAction('share', item.post_idx)" class="w-full text-left px-4 py-2 text-xs hover:bg-[var(--bg-input)] transition-colors flex items-center gap-2">
                      <i class="fa-solid fa-share-nodes w-3"></i> 공유
                    </button>
                    <button v-if="item.level === 'ADMIN'" @click.stop="handleAction('settings', item.post_idx)" class="w-full text-left px-4 py-2 text-xs hover:bg-[var(--bg-input)] transition-colors flex items-center gap-2">
                      <i class="fa-solid fa-lock w-3"></i> 권한 설정
                    </button>
                    
                    <button v-if="item.level !== 'ADMIN'" @click.stop="handleAction('listDelete', item.post_idx)" class="w-full text-left px-4 py-2 text-xs text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors flex items-center gap-2">
                      <i class="fa-solid fa-rectangle-xmark w-3"></i> 목록 삭제
                    </button>

                    <div v-if="item.level === 'ADMIN'" class="border-t border-[var(--border-color)] my-1"></div>
                    <button v-if="item.level === 'ADMIN'" @click.stop="handleAction('delete', item.post_idx)" class="w-full text-left px-4 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2">
                      <i class="fa-solid fa-trash w-3"></i> 삭제
                    </button>
                  </div>
                </div>
              </template>
              <div v-else class="px-3 py-4 text-xs text-[var(--text-muted)] italic text-center border border-dashed border-gray-200 rounded-lg mx-2">생성된 페이지가 없습니다.</div>
            </div>
          </div>
          </div>

          <div v-if="layout.showSharedPages" :style="getSectionStyle('sharedPages')" class="mt-2">
            <div @click="isSharedOpen = !isSharedOpen" class="flex items-center justify-between px-4 py-2 cursor-pointer rounded-lg transition-colors duration-200 hover:bg-[var(--bg-input)]">
              <h3 class="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">협업 페이지</h3>
              <span class="text-xs text-[var(--text-muted)] transition-transform duration-200" :class="{ 'rotate-180': !isSharedOpen }">▼</span>
            </div>
            <div v-show="isSharedOpen" class="mt-1 space-y-1 px-2">
              <template v-if="sharedItems.length > 0">
                <div v-for="team in sharedItems" :key="team.post_idx" @click="goToPost(team.post_idx)" class="group relative px-3 py-2 text-sm text-[var(--text-secondary)] rounded-xl cursor-pointer flex items-center justify-between transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]">
                  <div class="flex items-center gap-3 overflow-hidden">
                    <i class="fa-solid fa-file-lines w-4 text-center opacity-70 flex-shrink-0"></i>
                    <span class="truncate">{{ team.title }}</span>
                  </div>
                  <button @click="toggleMenu($event, team.post_idx)" class="opacity-0 group-hover:opacity-100 max-md:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-all">
                    <i class="fa-solid fa-ellipsis text-xs"></i>
                  </button>
                  <div v-if="openMenuId === team.post_idx" class="absolute right-2 top-10 w-32 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg shadow-xl z-[110] py-1 overflow-hidden">
                    <button v-if="team.level === 'ADMIN'" @click.stop="handleAction('share', team.post_idx)" class="w-full text-left px-4 py-2 text-xs hover:bg-[var(--bg-input)] transition-colors flex items-center gap-2">
                      <i class="fa-solid fa-share-nodes w-3"></i> 공유
                    </button>
                    <button v-if="team.level === 'ADMIN'" @click.stop="handleAction('settings', team.post_idx)" class="w-full text-left px-4 py-2 text-xs hover:bg-[var(--bg-input)] transition-colors flex items-center gap-2">
                      <i class="fa-solid fa-lock w-3"></i> 권한 설정
                    </button>

                    <button v-if="team.level !== 'ADMIN'" @click.stop="handleAction('listDelete', team.post_idx)" class="w-full text-left px-4 py-2 text-xs text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors flex items-center gap-2">
                      <i class="fa-solid fa-rectangle-xmark w-3"></i> 목록 삭제
                    </button>

                    <div v-if="team.level === 'ADMIN'" class="border-t border-[var(--border-color)] my-1"></div>
                    <button v-if="team.level === 'ADMIN'" @click.stop="handleAction('delete', team.post_idx)" class="w-full text-left px-4 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2">
                      <i class="fa-solid fa-trash w-3"></i> 삭제
                    </button>
                  </div>
                </div>
              </template>
              <div v-else class="px-3 py-4 text-xs text-[var(--text-muted)] italic text-center border border-dashed border-gray-200 rounded-lg mx-2">생성된 페이지가 없습니다.</div>
            </div>
          </div>
          
          <div v-if="layout.showSidebarUtilitiesSection" :style="getSectionStyle('utilities')">
          <div class="border-t border-[var(--border-color)] my-4 mx-2"></div>

          <RouterLink v-if="isNavInSidebar('trash')" :to="{ name: 'trash' }" class="w-full flex items-center gap-3.5 px-3 py-2.5 text-sm text-[var(--text-secondary)] rounded-xl transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)] no-underline">
            <i class="fa-solid fa-trash w-5 text-center flex-shrink-0 text-lg"></i>
            <span>휴지통</span>
          </RouterLink>

          <div class="p-3 pt-2">
            <RouterLink v-if="isNavInSidebar('storage')" :to="{ name: 'storage' }" class="flex items-center gap-3.5 text-[var(--text-secondary)] mb-3 transition-all duration-200 hover:text-[var(--text-main)] no-underline">
              <i class="fa-solid fa-cloud w-5 text-center flex-shrink-0 text-lg"></i>
              <span class="text-sm">저장용량</span>
            </RouterLink>
            <template v-if="layout.showStorageWidget">
            <div class="w-full bg-[var(--bg-input)] rounded-full h-1.5 mb-2 overflow-hidden">
              <div class="bg-blue-600 dark:bg-blue-400 h-1.5 rounded-full transition-all duration-300" :style="{ width: storageUsageWidth }"></div>
            </div>
            </template>
            <div class="border-t border-[var(--border-color)] my-4 mx-2"></div>
          

            <RouterLink
              v-if="isAdministrator"
              :to="{ name: 'administrator' }"
              class="w-full flex items-center gap-3.5 px-3 py-2.5 text-sm text-[var(--text-secondary)] rounded-xl transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)] no-underline"
              active-class="!bg-blue-500/10 !text-blue-600 !font-bold dark:!bg-blue-400/20 dark:!text-blue-400"
            >
              <i class="fa-solid fa-user-shield w-5 text-center flex-shrink-0 text-lg"></i>
              <span>관리자 페이지</span>
            </RouterLink>
            <template v-if="layout.showStorageWidget">
            <p class="text-xs text-[var(--text-muted)] mb-1">{{ storageUsageText }}</p>
            <p v-if="storageSummary" class="text-[11px] text-[var(--text-muted)] mb-4">{{ storageSummary.planLabel }} 플랜 · 휴지통 포함 {{ storageSummary.usagePercent }}%</p>
            <p v-else class="text-[11px] text-[var(--text-muted)] mb-4">저장 공간 통계 확인 중</p>
            </template>
            <div v-if="layout.showAdditionalStorageButton">
              <RouterLink :to="{ name: 'payment' }" class="block w-full text-center border border-[var(--border-color)] px-2 py-2 rounded-full text-sm font-semibold text-blue-600 dark:text-blue-400 bg-[var(--bg-main)] transition-all duration-200 hover:bg-blue-500/10 dark:hover:bg-blue-400/10">추가 저장용량 구매</RouterLink>
            </div>
            <button
              type="button"
              @click="openLayoutCustomizer"
              class="mt-2.5 w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] px-2.5 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)] transition-colors"
            >
              <i class="fa-solid fa-table-columns"></i>
              <span>화면 · 버튼 배치 설정</span>
            </button>
          </div>
          </div>
        </nav>
      </div>
    </aside>

    <button
      @click="toggleSidebar"
      class="sidebar-toggle absolute top-4 z-50 hidden h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] text-[var(--text-main)] shadow-lg transition-all duration-300 hover:bg-[var(--bg-input)] md:flex"
      :style="sidebarToggleStyle"
      :title="isSidebarOpen ? '사이드바 숨기기' : '사이드바 보이기'"
    >
      <i class="fas transition-transform duration-300" :class="isSidebarOpen ? 'fa-chevron-left' : 'fa-chevron-right'"></i>
    </button>

    <!-- 모바일 하단 내비게이션 바 -->
    <Teleport to="body">
      <nav
        v-if="layout.showMobileBottomNav"
        class="mobile-bottom-nav fixed inset-x-0 bottom-0 z-[125] flex items-center justify-around border-t border-[var(--border-color)] bg-[var(--bg-elevated)] px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_20px_rgba(15,23,42,0.12)] backdrop-blur-md md:hidden"
        aria-label="모바일 하단 내비게이션"
      >
        <template v-for="item in mobileBottomNavItems" :key="item.id">
          <button
            v-if="item.kind === 'action'"
            type="button"
            class="mobile-bottom-nav__item flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] sm:text-[11px] font-bold transition"
            :class="isStorageShareModalOpen ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--text-muted)]'"
            @click="openStorageShareModal('spaces')"
          >
            <i :class="item.icon" class="text-sm"></i>
            <span class="max-w-full truncate leading-tight">{{ item.shortLabel }}</span>
          </button>

          <RouterLink
            v-else
            :to="{ name: item.routeName }"
            class="mobile-bottom-nav__item flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] sm:text-[11px] font-bold no-underline transition"
            :class="route.name === item.routeName && !isStorageShareModalOpen ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--text-muted)]'"
            @click="item.id === 'home' ? handleGoHome('mobile-bottom') : null"
          >
            <i :class="item.icon" class="text-sm"></i>
            <span class="max-w-full truncate leading-tight">{{ item.shortLabel }}</span>
          </RouterLink>
        </template>

        <button
          type="button"
          class="mobile-bottom-nav__item flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] sm:text-[11px] font-bold transition"
          :class="isSidebarOpen ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--text-muted)]'"
          @click.stop="toggleSidebar"
        >
          <i class="fa-solid text-sm" :class="isSidebarOpen ? 'fa-xmark' : 'fa-bars'"></i>
          <span class="max-w-full truncate leading-tight">메뉴·업로드</span>
        </button>
      </nav>
    </Teleport>
  </div>
</template>

<style scoped>
/* Scrollbar Styling */
nav::-webkit-scrollbar {
  width: 6px;
}

nav::-webkit-scrollbar-track {
  background: transparent;
}

nav::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

nav::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}
.overflow-visible {
  overflow: visible !important; 
}

.sidebar-toggle {
  transform: translateX(-50%);
}

@media (max-width: 1024px) {
  .sidebar-toggle {
    top: 0.75rem;
  }
}

.sidebar-compact nav a,
.sidebar-compact nav button {
  padding-top: 0.42rem;
  padding-bottom: 0.42rem;
}

.sidebar-compact .mb-6 {
  margin-bottom: 0.75rem;
}
</style>
