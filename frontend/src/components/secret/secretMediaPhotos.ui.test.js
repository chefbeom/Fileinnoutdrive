import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, reactive, ref } from "vue";
import SecretMediaView from "@/views/dashboard/SecretMediaView.vue";
import SecretPhotosView from "@/views/dashboard/SecretPhotosView.vue";
import BaseFileView from "@/components/BaseFileView.vue";
import Sidebar from "@/components/Sidebar.vue";

const mockRoute = reactive({ name: "home", query: {} });
const mockRouterPush = vi.fn().mockResolvedValue(undefined);
const mockRouterReplace = vi.fn().mockResolvedValue(undefined);

vi.mock("vue-router", () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
  RouterLink: {
    name: "RouterLink",
    props: ["to"],
    template: "<a><slot /></a>",
  },
}));

const mockOpenVaultAccess = vi.fn().mockResolvedValue(false);
const mockExitVaultMode = vi.fn();
const mockSetVaultTrashView = vi.fn();
const mockOpenChangeVaultPinModal = vi.fn();

const mockSecretFolderStore = reactive({
  vaultMode: false,
  vaultUnlocked: false,
  vaultTrashView: false,
  vaultPinRegistered: true,
  showHiddenFolders: false,
  unlockedHiddenFolderIds: [],
  openVaultAccess: (...args) => mockOpenVaultAccess(...args),
  exitVaultMode: (...args) => mockExitVaultMode(...args),
  setVaultTrashView: (...args) => mockSetVaultTrashView(...args),
  openChangeVaultPinModal: (...args) => mockOpenChangeVaultPinModal(...args),
  resetSecretSession: vi.fn(),
  isFileLocked: () => false,
});

const mockFileStore = reactive({
  allFiles: [],
  vaultAllFiles: [],
  vaultHasLoaded: false,
  vaultLoading: false,
  driveFiles: [],
  drivePageFiles: [],
  driveBreadcrumbs: [],
  driveAvailableExtensions: [],
  drivePageInfo: { page: 0, size: 10, totalElements: 0, totalPages: 1 },
  sharedFiles: [],
  sharedLibraryFiles: [],
  pendingSharedLibraryFiles: [],
  sentSharedLibraryFiles: [],
  allOnlyFiles: [],
  recentFiles: [],
  trashFiles: [],
  recentUploadedFiles: [],
  recentAccessedFiles: [],
  currentFolder: null,
  currentFolderId: null,
  currentFolderPath: [],
  breadcrumbs: [],
  hasLoaded: true,
  isLoading: false,
  loadError: "",
  driveHasLoaded: true,
  drivePagingLoading: false,
  driveTotalCount: 0,
  driveCurrentPage: 1,
  driveTotalPages: 1,
  planCapabilities: { shareEnabled: true, secretVaultEnabled: true },
  storageSummary: { usedPercent: 10, usedLabel: "1 MB", totalLabel: "10 GB" },
  searchQuery: "",
  searchScope: "all",
  fileById: new Map(),
  selectedIds: [],
  fetchFiles: vi.fn().mockResolvedValue([]),
  fetchVaultFiles: vi.fn().mockResolvedValue([]),
  clearVaultFiles: vi.fn(),
  fetchDrivePage: vi.fn().mockResolvedValue([]),
  fetchStorageSummary: vi.fn().mockResolvedValue({}),
  refreshDrivePage: vi.fn().mockResolvedValue([]),
  navigateToFolder: vi.fn(),
  invalidateFolderSnapshots: vi.fn(),
  moveToTrash: vi.fn(),
  trashFilesBatch: vi.fn(),
});

const mockHeaderSearchStore = {
  getScopeState: () => ({
    searchQuery: "",
    extensionFilter: "all",
    sizeFilter: "all",
    statusFilter: "all",
  }),
  resetScope: vi.fn(),
  setSearchQuery: vi.fn(),
  setAvailableExtensions: vi.fn(),
};

const mockMediaPhotoStore = reactive({
  libraryScope: "normal",
  get isVaultScope() {
    return this.libraryScope === "vault";
  },
  preferences: {
    mediaSourceMode: "all",
    photoSourceMode: "all",
    mediaViewMode: "card",
    mediaGridDensity: "normal",
    mediaShowThumbnails: true,
    mediaThumbAspect: "video",
    photoGridDensity: "normal",
    photoThumbAspect: "square",
    photoThumbFit: "cover",
    photoDateBasis: "capture",
    slideshowIntervalSec: 5,
    hideSensitiveExifOnShare: true,
  },
  seriesOverrides: { autoClassifyEnabled: true },
  resolvedMediaAreas: [],
  mediaLibraryAreas: [],
  mediaIncludedFolderIds: [],
  mediaIncludedFileIds: [],
  photoIncludedFileIds: [],
  photoIncludedFolderIds: [],
  candidateVideos: [],
  candidatePhotos: [],
  allVideos: [{ id: "202", name: "secret.mp4" }],
  allPhotos: [{ id: "203", name: "secret.png" }],
  allDriveFolders: [],
  resolvedMediaSeries: [{ id: "vs-1", title: "비밀 시리즈" }],
  autoGroupedMediaSeries: [],
  removedMediaSeries: [],
  continueWatchingVideos: [{ id: "202", name: "secret.mp4" }],
  recentlyWatchedVideos: [{ id: "202", name: "secret.mp4" }],
  recentlyAddedVideos: [],
  favoriteMediaItems: [{ id: "202", name: "secret.mp4" }],
  favoritePhotos: [{ id: "203", name: "secret.png" }],
  resolvedMediaCollections: [{ id: "vc-1", name: "비밀 컬렉션" }],
  resolvedPhotoAlbums: [{ id: "va-1", name: "비밀 앨범" }],
  activeMediaFolderUnits: [],
  spotlightFileId: null,
  fetchRemoteLibraryState: vi.fn().mockResolvedValue(undefined),
  ensureCatalogLoaded: vi.fn().mockImplementation(async (opts = {}) => {
    mockMediaPhotoStore.libraryScope = opts.scope === "vault" ? "vault" : "normal";
  }),
  clearVaultMediaSession: vi.fn().mockImplementation(() => {
    mockMediaPhotoStore.libraryScope = "normal";
  }),
  isMediaAreaFolder: () => false,
  updatePreferences: vi.fn(),
  setAutoClassifyEnabled: vi.fn(),
  resetPreferences: vi.fn(),
  resetAllSeriesOverrides: vi.fn(),
  clearAllWatchHistory: vi.fn(),
  previewMediaAreaFolder: vi.fn().mockReturnValue(null),
  openTheater: vi.fn(),
  openPhotoLightbox: vi.fn(),
  clearSpotlight: vi.fn(),
});

vi.mock("@/stores/useSecretFolderStore.js", () => ({
  useSecretFolderStore: () => mockSecretFolderStore,
}));

vi.mock("@/stores/useFileStore.js", () => ({
  useFileStore: () => mockFileStore,
}));

vi.mock("@/stores/useHeaderSearchStore.js", () => ({
  FILE_SIZE_OPTIONS: [],
  FILE_STATUS_OPTIONS: [],
  getFileSearchScope: () => "home",
  useHeaderSearchStore: () => mockHeaderSearchStore,
}));

vi.mock("@/stores/useMediaPhotoStore.js", () => ({
  useMediaPhotoStore: () => mockMediaPhotoStore,
}));

vi.mock("@/stores/viewStore.js", () => ({
  useViewStore: () => ({
    viewMode: ref("list"),
    itemSize: ref("medium"),
    layoutPreset: ref("10"),
    customLayoutColumns: ref(4),
    customLayoutRows: ref(4),
    resolvedPageSize: ref(10),
    setViewMode: vi.fn(),
    setItemSize: vi.fn(),
    setLayoutPreset: vi.fn(),
    setCustomLayoutColumns: vi.fn(),
    setCustomLayoutRows: vi.fn(),
  }),
}));

vi.mock("@/stores/useAuthStore.js", () => ({
  useAuthStore: () => ({
    user: { idx: 88, email: "vault@test.dev" },
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

vi.mock("@/stores/sidebarPrefsStore.js", () => ({
  useSidebarPrefsStore: () => ({
    showRecentUploaded: false,
    showRecentAccessed: false,
    maxItemsCount: 5,
    isRecentUploadedOpen: false,
    isRecentAccessedOpen: false,
    isDefaultPreferences: true,
    maxItemsOptions: [5, 10],
    setShowRecentUploaded: vi.fn(),
    setShowRecentAccessed: vi.fn(),
    setMaxItemsCount: vi.fn(),
    toggleRecentUploadedOpen: vi.fn(),
    toggleRecentAccessedOpen: vi.fn(),
    showBothRecentSections: vi.fn(),
    hideBothRecentSections: vi.fn(),
    resetSidebarPreferences: vi.fn(),
  }),
}));

vi.mock("@/stores/useUiLayoutStore.js", () => ({
  useUiLayoutStore: () => ({
    layout: {
      sidebarNavOrder: ["home", "media", "photos"],
      sidebarSectionOrder: ["nav"],
      navPlacements: { home: "sidebar", media: "sidebar", photos: "sidebar" },
      showMediaSubmenu: true,
      showPhotosSubmenu: true,
      showMobileBottomNav: false,
    },
    mobileBottomNavItems: [],
  }),
}));

vi.mock("@/stores/uiLayoutModel.js", () => ({
  isItemInSidebar: () => true,
}));

vi.mock("@/api/filesApi.js", () => ({
  downloadFileAsset: vi.fn(),
}));

vi.mock("@/api/postApi.js", () => ({
  default: { getWorkspaceList: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/utils/fileThumbnailCache.js", () => ({
  getCachedFileThumbnailUrl: () => null,
  loadFileThumbnailUrl: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/utils/desktopDropUpload.js", () => ({
  extractDropItems: vi.fn(),
  isDesktopDragEvent: () => false,
  triggerDesktopUpload: vi.fn(),
}));

const mockShareTargets = ref([]);

vi.mock("@/components/useBaseFileShareDialog.js", () => ({
  BASE_SHARE_PERMISSION_OPTIONS: [],
  useBaseFileShareDialog: () => ({
    shareTargets: mockShareTargets.value,
    shareInfo: { recipients: [], groups: [] },
    shareEmail: "",
    sharePermission: "VIEW",
    shareExpiresAt: "",
    shareDownloadLimit: "",
    sharePassword: "",
    shareCancelEmail: "",
    shareError: "",
    isSharing: false,
    isShareInfoLoading: false,
    isShareGroupOverviewLoading: false,
    shareOverviewGroups: [],
    shareOverviewUsers: [],
    shareTargetUserIds: [],
    shareTargetGroupIds: [],
    sharePendingInvites: [],
    openShareDialog: vi.fn(),
    closeShareDialog: vi.fn(),
    submitShare: vi.fn(),
    cancelShare: vi.fn(),
  }),
}));

describe("Secret Media & Secret Photos UI gating & isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoute.name = "home";
    mockRoute.query = {};
    mockSecretFolderStore.vaultMode = false;
    mockSecretFolderStore.vaultUnlocked = false;
    mockSecretFolderStore.vaultTrashView = false;
    mockMediaPhotoStore.libraryScope = "normal";
    mockShareTargets.value = [];
  });

  it("blocks SecretMediaView behind PIN unlock gate when locked and renders vault-only MediaView when unlocked", async () => {
    mockRoute.name = "secretMedia";
    mockShareTargets.value = [{ id: 202, name: "secret.mp4" }];
    const wrapper = mount(SecretMediaView, {
      global: {
        stubs: {
          Teleport: true,
          BaseFileShareDialog: true,
          RouterLink: true,
        },
      },
    });

    expect(mockOpenVaultAccess).toHaveBeenCalledTimes(1);
    expect(wrapper.find("[data-testid='secret-space-locked-gate']").exists()).toBe(true);
    expect(wrapper.text()).toContain("비밀 미디어 잠금 상태");
    expect(wrapper.find("[data-testid='secret-space-banner']").exists()).toBe(false);
    expect(wrapper.find(".media-hub-view").exists()).toBe(false);

    // Unlock vault -> mounts vault MediaView with no share dialog or scope filter
    mockSecretFolderStore.vaultMode = true;
    mockSecretFolderStore.vaultUnlocked = true;
    await nextTick();
    await nextTick();

    expect(wrapper.find("[data-testid='secret-space-banner']").exists()).toBe(true);
    expect(wrapper.find(".media-hub-view").exists()).toBe(true);
    expect(wrapper.text()).toContain("비밀 미디어");
    expect(wrapper.find("base-file-share-dialog-stub").exists()).toBe(false);
    expect(mockMediaPhotoStore.ensureCatalogLoaded).toHaveBeenCalledWith({ scope: "vault" });

    // Locking again unmounts content & redirects home
    mockSecretFolderStore.vaultUnlocked = false;
    await nextTick();
    await nextTick();

    expect(wrapper.find("[data-testid='secret-space-locked-gate']").exists()).toBe(true);
    expect(wrapper.find(".media-hub-view").exists()).toBe(false);
    expect(mockRouterReplace).toHaveBeenCalledWith({ name: "home" });
  });

  it("blocks SecretPhotosView behind PIN gate when locked and hides EXIF/Share UI when unlocked", async () => {
    mockRoute.name = "secretPhotos";
    mockShareTargets.value = [{ id: 203, name: "secret.png" }];
    const wrapper = mount(SecretPhotosView, {
      global: {
        stubs: {
          Teleport: true,
          BaseFileShareDialog: true,
          RouterLink: true,
        },
      },
    });

    expect(wrapper.find("[data-testid='secret-space-locked-gate']").exists()).toBe(true);
    expect(wrapper.text()).toContain("비밀 사진첩 잠금 상태");
    expect(wrapper.find(".photos-hub-view").exists()).toBe(false);

    mockSecretFolderStore.vaultMode = true;
    mockSecretFolderStore.vaultUnlocked = true;
    await nextTick();
    await nextTick();

    expect(wrapper.find(".photos-hub-view").exists()).toBe(true);
    expect(wrapper.text()).toContain("비밀 사진첩");
    expect(wrapper.text()).not.toContain("공유 시 위치정보(EXIF) 보호");
    expect(wrapper.find("base-file-share-dialog-stub").exists()).toBe(false);
    expect(mockMediaPhotoStore.ensureCatalogLoaded).toHaveBeenCalledWith({ scope: "vault" });
  });

  it("renders Vault Media & Vault Photos buttons in BaseFileView header only inside non-trash Vault mode", async () => {
    mockRoute.name = "home";
    const wrapper = mount(BaseFileView, {
      props: {
        title: "홈",
        files: [],
        showFolderNavigation: true,
      },
      global: {
        stubs: {
          Teleport: true,
          BaseFileShareDialog: true,
          BaseFolderPropertyDialog: true,
          BaseFolderRenameDialog: true,
          FilePreviewModal: true,
          FileCollectionView: true,
          VaultImportModal: true,
        },
      },
    });

    expect(wrapper.find("[data-testid='vault-open-secret-media']").exists()).toBe(false);
    expect(wrapper.find("[data-testid='vault-open-secret-photos']").exists()).toBe(false);

    mockSecretFolderStore.vaultMode = true;
    mockSecretFolderStore.vaultUnlocked = true;
    await nextTick();

    const mediaBtn = wrapper.get("[data-testid='vault-open-secret-media']");
    const photosBtn = wrapper.get("[data-testid='vault-open-secret-photos']");
    await mediaBtn.trigger("click");
    await photosBtn.trigger("click");

    expect(mockRouterPush).toHaveBeenCalledWith({ name: "secretMedia" });
    expect(mockRouterPush).toHaveBeenCalledWith({ name: "secretPhotos" });

    // Trash view hides media/photo shortcuts
    mockSecretFolderStore.vaultTrashView = true;
    await nextTick();
    expect(wrapper.find("[data-testid='vault-open-secret-media']").exists()).toBe(false);
    expect(wrapper.find("[data-testid='vault-open-secret-photos']").exists()).toBe(false);
  });

  it("shows Sidebar secret-nav only when unlocked vaultMode is active and suppresses normal media/photo counters in vault scope", async () => {
    const wrapper = mount(Sidebar, {
      global: {
        stubs: {
          Teleport: true,
          FileUpload: true,
          ShareModal: true,
          RoleModal: true,
          FilePreviewModal: true,
          StorageShareCenterModal: true,
          RouterLink: {
            props: ["to"],
            template: "<a class='stub-link'><slot /></a>",
          },
        },
      },
    });

    expect(wrapper.find("[data-testid='sidebar-secret-nav']").exists()).toBe(false);

    mockSecretFolderStore.vaultMode = true;
    mockSecretFolderStore.vaultUnlocked = true;
    mockMediaPhotoStore.libraryScope = "vault";
    await nextTick();

    const secretNav = wrapper.get("[data-testid='sidebar-secret-nav']");
    expect(secretNav.text()).toContain("비밀 파일");
    expect(secretNav.text()).toContain("비밀 즐겨찾기");
    expect(secretNav.text()).toContain("비밀 미디어");
    expect(secretNav.text()).toContain("비밀 사진첩");
    expect(wrapper.find("span[title='이어보기 중인 동영상 수']").exists()).toBe(false);
  });
});
