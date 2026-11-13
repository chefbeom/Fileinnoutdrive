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
  resolvedMediaCollections: [],
  activeMediaFolderUnits: [],
  fetchRemoteLibraryState: vi.fn().mockResolvedValue(undefined),
  ensureCatalogLoaded: vi.fn().mockResolvedValue(undefined),
  isMediaAreaFolder: (id) => mockMediaPhotoStore.resolvedMediaAreas.some((a) => String(a.folderId) === String(id)),
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
});
