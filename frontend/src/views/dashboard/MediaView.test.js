import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import MediaView from "./MediaView.vue";

const mockRoute = reactive({ query: {} });
const mockPush = vi.fn();

vi.mock("vue-router", () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: mockPush }),
}));

const mockFileStore = reactive({
  currentFolderId: null,
  planCapabilities: { shareEnabled: true },
  moveToTrash: vi.fn(),
  trashFilesBatch: vi.fn(),
});

const mockHeaderSearchStore = {
  getScopeState: () => ({ searchQuery: "", extensionFilter: "all" }),
  resetScope: vi.fn(),
};

const mockMediaPhotoStore = reactive({
  preferences: {
    mediaSourceMode: "manual",
    mediaViewMode: "card",
    mediaGridDensity: "normal",
    mediaShowThumbnails: true,
    mediaThumbAspect: "video",
    enableContinueWatching: true,
    autoPlayNext: true,
    autoLoadSubtitles: true,
    defaultPlaybackRate: 1.0,
  },
  seriesOverrides: { autoClassifyEnabled: true },
  resolvedMediaAreas: [
    {
      folderId: "10",
      name: "temp",
      pathLabel: "홈 / temp",
      seriesCount: 0,
      episodeCount: 0,
      groupingMode: "children-as-series",
      isMissing: false,
    },
  ],
  mediaLibraryAreas: [{ folderId: "10", groupingMode: "children-as-series" }],
  mediaIncludedFolderIds: [],
  mediaIncludedFileIds: ["101", "102"],
  candidateVideos: [],
  candidatePhotos: [],
  allVideos: [],
  allDriveFolders: [{ id: "10", name: "temp", parentId: null, pathLabel: "홈 / temp" }],
  resolvedMediaSeries: [],
  autoGroupedMediaSeries: [],
  removedMediaSeries: [],
  continueWatchingVideos: [],
  recentlyWatchedVideos: [],
  recentlyAddedVideos: [],
  favoriteMediaItems: [],
  favoriteMediaSeries: [],
  totalMediaFavoritesCount: 0,
  resolvedMediaCollections: [],
  activeMediaFolderUnits: [],
  fetchRemoteLibraryState: vi.fn().mockResolvedValue(undefined),
  ensureCatalogLoaded: vi.fn().mockResolvedValue(undefined),
  isMediaAreaFolder: (id) => mockMediaPhotoStore.resolvedMediaAreas.some((a) => String(a.folderId) === String(id)),
  toggleSeriesFavorite: vi.fn(),
  updatePreferences: vi.fn(),
  setAutoClassifyEnabled: vi.fn(),
  resetPreferences: vi.fn(),
  resetAllSeriesOverrides: vi.fn(),
  clearAllWatchHistory: vi.fn(),
  previewMediaAreaFolder: vi.fn().mockReturnValue(null),
  openTheater: vi.fn(),
});

vi.mock("@/stores/useFileStore.js", () => ({
  useFileStore: () => mockFileStore,
}));

vi.mock("@/stores/useHeaderSearchStore.js", () => ({
  useHeaderSearchStore: () => mockHeaderSearchStore,
}));

vi.mock("@/stores/useMediaPhotoStore.js", () => ({
  useMediaPhotoStore: () => mockMediaPhotoStore,
}));

vi.mock("@/api/filesApi.js", () => ({
  downloadFileAsset: vi.fn(),
}));

vi.mock("@/utils/fileThumbnailCache.js", () => ({
  getCachedFileThumbnailUrl: () => null,
  loadFileThumbnailUrl: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/utils/desktopDropUpload.js", () => ({
  triggerDesktopUpload: vi.fn(),
}));

vi.mock("@/components/useBaseFileShareDialog.js", () => ({
  BASE_SHARE_PERMISSION_OPTIONS: [],
  useBaseFileShareDialog: () => ({
    shareTargets: [],
    shareInfo: null,
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

describe("MediaView.vue streamlined layout & guided setup", () => {
  it("hides duplicate setup buttons and single-area filter strip, and guides users cleanly via empty state", async () => {
    const wrapper = mount(MediaView, {
      global: {
        stubs: {
          Teleport: true,
          BaseFileShareDialog: true,
        },
      },
    });

    // No redundant top/preview buttons
    expect(wrapper.text()).not.toContain("+ 시즌 폴더 추가 등록");
    expect(wrapper.text()).not.toContain("+ 영역 관리");

    // Single area with 0 series hides redundant area strip
    expect(wrapper.find("[data-testid='media-area-filter-bar']").exists()).toBe(false);

    // Empty state guides upload & folder connection
    const emptyState = wrapper.get("[data-testid='series-empty-state']");
    expect(emptyState.text()).toContain("새 동영상 업로드");
    expect(emptyState.text()).toContain("저장소 폴더 · 영역 연결");
    expect(emptyState.text()).toContain("개별 폴더 · 파일 지정");

    // Clicking settings button opens dedicated settings modal
    await wrapper.get("[data-testid='media-settings-trigger']").trigger("click");
    expect(wrapper.find("[data-testid='media-settings-modal']").exists()).toBe(true);
  });

  it("shows area quick filter strip when multiple media areas are registered", () => {
    mockMediaPhotoStore.resolvedMediaAreas = [
      { folderId: "10", name: "애니메이션", pathLabel: "홈 / 애니메이션", seriesCount: 2, episodeCount: 24 },
      { folderId: "20", name: "영화", pathLabel: "홈 / 영화", seriesCount: 1, episodeCount: 3 },
    ];
    mockMediaPhotoStore.resolvedMediaSeries = [
      { id: "s1", title: "시리즈1", areaFolderId: "10", episodeCount: 12, seasons: [], allEpisodes: [] },
    ];

    const wrapper = mount(MediaView, {
      global: {
        stubs: {
          Teleport: true,
          BaseFileShareDialog: true,
        },
      },
    });

    const areaBar = wrapper.get("[data-testid='media-area-filter-bar']");
    expect(areaBar.text()).toContain("애니메이션");
    expect(areaBar.text()).toContain("영화");
  });

  it("allows excluding individual items in all-mode without manual-mode restriction", async () => {
    mockRoute.query = { section: "favorites" };
    mockMediaPhotoStore.preferences.mediaSourceMode = "all";
    mockMediaPhotoStore.favoriteMediaItems = [
      { id: 501, name: "trailer.mp4", displayTitle: "trailer", mediaKind: "video", sizeLabel: "10 MB" },
    ];
    mockMediaPhotoStore.excludeMediaFiles = vi.fn();

    const wrapper = mount(MediaView, {
      global: {
        stubs: {
          Teleport: true,
          BaseFileShareDialog: true,
        },
      },
    });

    await wrapper.find("input[type='checkbox']").trigger("click");
    const batchExcludeBtn = wrapper.find("[data-testid='media-batch-exclude-btn']");
    expect(batchExcludeBtn.exists()).toBe(true);
    await batchExcludeBtn.trigger("click");
    expect(mockMediaPhotoStore.excludeMediaFiles).toHaveBeenCalledWith(["501"]);
  });

  it("does not spawn video preload=metadata elements for uncached video cards", () => {
    mockRoute.query = { section: "all" };
    mockMediaPhotoStore.preferences.mediaSourceMode = "all";
    mockMediaPhotoStore.preferences.mediaShowThumbnails = true;
    mockMediaPhotoStore.candidateVideos = [
      {
        id: 777,
        name: "vault-clip.mp4",
        displayTitle: "vault-clip",
        mediaKind: "video",
        downloadUrl: "/api/file/secret/stream/777?st=token",
        presignedDownloadUrl: "/api/file/secret/stream/777?st=token",
        sizeLabel: "120 MB",
      },
    ];
    mockMediaPhotoStore.allVideos = [...mockMediaPhotoStore.candidateVideos];

    const wrapper = mount(MediaView, {
      global: {
        stubs: {
          Teleport: true,
          BaseFileShareDialog: true,
        },
      },
    });

    expect(wrapper.findAll("video[preload='metadata']").length).toBe(0);
  });

  it("renders dedicated media favorites shelf and toggles series favorite star", async () => {
    mockRoute.query = {};
    mockMediaPhotoStore.preferences.mediaSourceMode = "all";
    mockMediaPhotoStore.favoriteMediaItems = [
      { id: 801, name: "fav-ep.mp4", displayTitle: "fav-ep", mediaKind: "video", isFavorite: true },
    ];
    const seriesItem = {
      id: "series-10",
      title: "테스트 시리즈",
      episodeCount: 5,
      seasonCount: 1,
      seasons: [],
      allEpisodes: [],
      isFavorite: true,
    };
    mockMediaPhotoStore.resolvedMediaSeries = [seriesItem];
    mockMediaPhotoStore.favoriteMediaSeries = [seriesItem];
    mockMediaPhotoStore.totalMediaFavoritesCount = 2;
    mockMediaPhotoStore.toggleSeriesFavorite.mockClear();

    const wrapper = mount(MediaView, {
      global: {
        stubs: {
          Teleport: true,
          BaseFileShareDialog: true,
        },
      },
    });

    const shelf = wrapper.get("[data-testid='media-favorites-shelf']");
    expect(shelf.text()).toContain("즐겨찾기");
    expect(shelf.text()).toContain("테스트 시리즈");
    expect(shelf.text()).toContain("fav-ep");

    await wrapper.get("[data-testid='series-favorite-btn']").trigger("click");
    expect(mockMediaPhotoStore.toggleSeriesFavorite).toHaveBeenCalledWith("series-10");
  });

  it("opens series episode in theater using the active season's visibleSeriesEpisodes order", async () => {
    const s1Ep1 = { id: "901", name: "S1E01.mp4", displayTitle: "1화", mediaKind: "video", seasonFolderId: "s1", uploadedAtMs: 1000 };
    const s1Ep2 = { id: "902", name: "S1E02.mp4", displayTitle: "2화", mediaKind: "video", seasonFolderId: "s1", uploadedAtMs: 2000 };
    const s2Ep1 = { id: "903", name: "S2E01.mp4", displayTitle: "S2 1화", mediaKind: "video", seasonFolderId: "s2", uploadedAtMs: 3000 };

    mockMediaPhotoStore.resolvedMediaSeries = [
      {
        id: "series-order-test",
        title: "시즌 테스트",
        episodeCount: 3,
        seasonCount: 2,
        seasons: [
          { folderId: "s1", seasonLabel: "시즌 1", episodeCount: 2, isSpecial: false, episodes: [s1Ep1, s1Ep2], pathLabel: "홈 / S1" },
          { folderId: "s2", seasonLabel: "시즌 2", episodeCount: 1, isSpecial: false, episodes: [s2Ep1], pathLabel: "홈 / S2" },
        ],
        allEpisodes: [s1Ep1, s1Ep2, s2Ep1],
      },
    ];
    mockMediaPhotoStore.openTheater.mockClear();
    mockRoute.query = { seriesId: "series-order-test", season: "s1" };

    const wrapper = mount(MediaView, {
      global: {
        stubs: {
          Teleport: true,
          BaseFileShareDialog: true,
        },
      },
    });

    const epTitle = wrapper.findAll("h3").find((h) => h.text().includes("2화"));
    expect(epTitle).toBeDefined();
    await epTitle.trigger("click");

    expect(mockMediaPhotoStore.openTheater).toHaveBeenCalledWith("902", expect.objectContaining({
      playlistIds: ["901", "902"],
    }));
  });
});
