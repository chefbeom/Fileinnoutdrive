import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { nextTick, reactive } from "vue";
import PhotosView from "./PhotosView.vue";

const mockRoute = reactive({ query: {} });
const mockPush = vi.fn();

vi.mock("vue-router", () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: mockPush }),
}));

const mockMediaPhotoStore = reactive({
  preferences: {
    photoSourceMode: "all",
    photoGridDensity: "normal",
    photoThumbAspect: "square",
    photoThumbFit: "cover",
    photoDateBasis: "capture",
    slideshowIntervalSec: 5,
    hideSensitiveExifOnShare: true,
  },
  photoIncludedFileIds: [],
  photoIncludedFolderIds: [],
  candidatePhotos: [
    {
      id: 201,
      name: "holiday.png",
      displayTitle: "holiday",
      yearMonthKey: "2026-11",
      yearMonthLabel: "2026년 11월",
      dayKey: "2026-11-19",
      dayLabel: "11월 19일",
      photoCategory: "camera",
      effectiveDateMs: 1000,
      sizeLabel: "2 MB",
    },
  ],
  allPhotos: [
    {
      id: 201,
      name: "holiday.png",
      displayTitle: "holiday",
      yearMonthKey: "2026-11",
      yearMonthLabel: "2026년 11월",
      dayKey: "2026-11-19",
      dayLabel: "11월 19일",
      photoCategory: "camera",
      effectiveDateMs: 1000,
      sizeLabel: "2 MB",
    },
  ],
  favoritePhotos: [],
  favoritePhotoAlbums: [],
  totalPhotoFavoritesCount: 0,
  resolvedPhotoAlbums: [],
  allDriveFolders: [],
  excludedPhotos: [],
  excludedPhotoFolders: [],
  ensureCatalogLoaded: vi.fn().mockResolvedValue(undefined),
  excludePhotoFiles: vi.fn(),
  removePhotoFiles: vi.fn(),
  togglePhotoFavorite: vi.fn(),
  toggleAlbumFavorite: vi.fn(),
  updatePreferences: vi.fn(),
});

vi.mock("@/stores/useFileStore.js", () => ({
  useFileStore: () =>
    reactive({
      currentFolderId: null,
      planCapabilities: { shareEnabled: true },
      trashFilesBatch: vi.fn(),
    }),
}));

vi.mock("@/stores/useHeaderSearchStore.js", () => ({
  useHeaderSearchStore: () => ({
    getScopeState: () => ({ searchQuery: "", extensionFilter: "all" }),
    resetScope: vi.fn(),
  }),
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
    shareInfo: [],
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

describe("PhotosView.vue", () => {
  it("allows excluding individual and selected photos in all-mode without deleting originals", async () => {
    const wrapper = mount(PhotosView, {
      global: {
        stubs: {
          Teleport: true,
          BaseFileShareDialog: true,
          DownloadShareLinkDialog: true,
        },
      },
    });
    await nextTick();

    await wrapper.get("[data-testid='photo-tile-exclude']").trigger("click");
    expect(mockMediaPhotoStore.excludePhotoFiles).toHaveBeenCalledWith([201]);

    await wrapper.get(".group.relative input[type='checkbox']").trigger("click");
    await nextTick();
    await wrapper.get("[data-testid='photos-batch-exclude-btn']").trigger("click");
    expect(mockMediaPhotoStore.excludePhotoFiles).toHaveBeenCalledWith(["201"]);
  });

  it("renders photos favorites & album shortcut shelf and toggles album favorite star", async () => {
    const album = {
      id: "alb-1",
      name: "여행모음",
      description: "",
      photoCount: 1,
      photos: [mockMediaPhotoStore.allPhotos[0]],
      isFavorite: true,
    };
    mockRoute.query = {};
    mockMediaPhotoStore.resolvedPhotoAlbums = [album];
    mockMediaPhotoStore.favoritePhotoAlbums = [album];
    mockMediaPhotoStore.favoritePhotos = [mockMediaPhotoStore.allPhotos[0]];
    mockMediaPhotoStore.totalPhotoFavoritesCount = 2;
    mockMediaPhotoStore.toggleFavorite = vi.fn();
    mockMediaPhotoStore.openPhotoLightbox = vi.fn();
    mockMediaPhotoStore.toggleAlbumFavorite.mockClear();

    const wrapper = mount(PhotosView, {
      global: {
        stubs: {
          Teleport: true,
          BaseFileShareDialog: true,
          DownloadShareLinkDialog: true,
        },
      },
    });
    await nextTick();

    const shelf = wrapper.get("[data-testid='photos-favorites-shelf']");
    expect(shelf.text()).toContain("즐겨찾기 · 앨범 바로가기");
    expect(shelf.text()).toContain("여행모음");

    mockRoute.query = { tab: "albums" };
    await nextTick();
    await wrapper.get("[data-testid='album-favorite-btn']").trigger("click");
    expect(mockMediaPhotoStore.toggleAlbumFavorite).toHaveBeenCalledWith("alb-1");
  });

  it("opens lightbox with favoritePhotos when clicking a photo on favorites shelf and follows timelineGroups visual order when sorted", async () => {
    mockRoute.query = {};
    const photoA = {
      id: 301,
      name: "alpha.jpg",
      displayTitle: "alpha",
      yearMonthKey: "2026-11",
      yearMonthLabel: "2026년 11월",
      dayKey: "2026-11-18",
      dayLabel: "11월 18일",
      photoCategory: "camera",
      effectiveDateMs: 1000,
      sizeLabel: "1 MB",
      isFavorite: true,
    };
    const photoB = {
      id: 302,
      name: "beta.jpg",
      displayTitle: "beta",
      yearMonthKey: "2026-11",
      yearMonthLabel: "2026년 11월",
      dayKey: "2026-11-20",
      dayLabel: "11월 20일",
      photoCategory: "camera",
      effectiveDateMs: 2000,
      sizeLabel: "1 MB",
      isFavorite: false,
    };
    const photoC = {
      id: 303,
      name: "gamma.jpg",
      displayTitle: "gamma",
      yearMonthKey: "2026-11",
      yearMonthLabel: "2026년 11월",
      dayKey: "2026-11-18",
      dayLabel: "11월 18일",
      photoCategory: "camera",
      effectiveDateMs: 3000,
      sizeLabel: "1 MB",
      isFavorite: false,
    };

    mockMediaPhotoStore.allPhotos = [photoA, photoB, photoC];
    mockMediaPhotoStore.candidatePhotos = [photoA, photoB, photoC];
    mockMediaPhotoStore.favoritePhotos = [photoA];
    mockMediaPhotoStore.resolvedPhotoAlbums = [];
    mockMediaPhotoStore.favoritePhotoAlbums = [];
    mockMediaPhotoStore.totalPhotoFavoritesCount = 1;
    mockMediaPhotoStore.openPhotoLightbox = vi.fn();

    const wrapper = mount(PhotosView, {
      global: {
        stubs: {
          Teleport: true,
          BaseFileShareDialog: true,
          DownloadShareLinkDialog: true,
        },
      },
    });
    await nextTick();

    // 1. Clicking photo in favorites shelf does not crash and opens with favoritePhotos pool
    const shelfItem = wrapper.get("[data-testid='photos-favorites-shelf'] .aspect-square");
    await shelfItem.trigger("click");
    expect(mockMediaPhotoStore.openPhotoLightbox).toHaveBeenCalledWith(301, expect.objectContaining({
      poolIds: ["301"],
    }));

    // 2. When sorted by name ascending, visual timelineGroups buckets group day18 (alpha, gamma) before day20 (beta)
    mockMediaPhotoStore.openPhotoLightbox.mockClear();
    const sortSelect = wrapper.findAll("select").find((sel) =>
      sel.findAll("option").some((opt) => opt.element.value === "name-asc"),
    );
    await sortSelect.setValue("name-asc");
    await nextTick();

    // Click first tile in timeline
    const tiles = wrapper.findAll(".aspect-square.rounded-2xl");
    expect(tiles.length).toBe(3);
    await tiles[0].trigger("click");
    expect(mockMediaPhotoStore.openPhotoLightbox).toHaveBeenCalledWith(301, expect.objectContaining({
      poolIds: ["301", "303", "302"],
    }));
  });
});
