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
  resolvedPhotoAlbums: [],
  allDriveFolders: [],
  excludedPhotos: [],
  excludedPhotoFolders: [],
  ensureCatalogLoaded: vi.fn().mockResolvedValue(undefined),
  excludePhotoFiles: vi.fn(),
  removePhotoFiles: vi.fn(),
  togglePhotoFavorite: vi.fn(),
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
});
