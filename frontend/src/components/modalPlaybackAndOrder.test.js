import { mount, flushPromises } from "@vue/test-utils";
import { nextTick, reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FilePreviewModal from "./FilePreviewModal.vue";
import MediaTheaterModal from "./media/MediaTheaterModal.vue";
import PhotoLightboxModal from "./photos/PhotoLightboxModal.vue";
import { MODAL_HISTORY_KEY } from "@/utils/modalBackHistory.js";

const mockRouterPush = vi.fn().mockResolvedValue(undefined);

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

const mockFileStore = reactive({
  getFolderPath: () => [],
  recordFileAccess: vi.fn(),
  fetchTextPreviewFor: vi.fn().mockResolvedValue({ content: "hello", truncated: false }),
  refreshAll: vi.fn().mockResolvedValue(undefined),
});

vi.mock("@/stores/useFileStore.js", () => ({
  useFileStore: () => mockFileStore,
}));

const { mockMediaPhotoStore, mockRefreshEncryptedStreamUrl } = vi.hoisted(() => ({
  mockMediaPhotoStore: null,
  mockRefreshEncryptedStreamUrl: vi.fn(),
}));
void mockMediaPhotoStore;

const storeState = reactive({
  preferences: {
    autoPlayNext: true,
    autoLoadSubtitles: false,
    defaultPlaybackRate: 1.0,
    enableContinueWatching: true,
    slideshowIntervalSec: 5,
  },
  candidateVideoById: new Map(),
  candidatePhotoById: new Map(),
  videoById: new Map(),
  photoById: new Map(),
  allPhotos: [],
  resolvedMediaCollections: [],
  resolvedPhotoAlbums: [],
  getMediaItemById(id) {
    const key = String(id ?? "");
    return (
      this.candidateVideoById.get(key) ||
      this.candidatePhotoById.get(key) ||
      this.videoById.get(key) ||
      this.photoById.get(key) ||
      null
    );
  },
  ensureCatalogLoaded: vi.fn().mockResolvedValue(undefined),
  recordVideoMetadata: vi.fn(),
  recordWatchProgress: vi.fn(),
  markVideoCompleted: vi.fn(),
  markVideoUnwatched: vi.fn(),
  toggleMediaFavorite: vi.fn(),
  togglePhotoFavorite: vi.fn(),
  excludePhotoFiles: vi.fn(),
  updatePreferences: vi.fn(),
  openTheater: vi.fn(),
  closeTheater: vi.fn(),
  minimizeToMiniPlayer: vi.fn(),
  openPhotoLightbox: vi.fn(),
  closePhotoLightbox: vi.fn(),
  navigateToOriginalFolder: vi.fn().mockResolvedValue(undefined),
  createMediaCollection: vi.fn(),
  addItemsToMediaCollection: vi.fn(),
  removeItemsFromMediaCollection: vi.fn(),
  createPhotoAlbum: vi.fn(),
  addPhotosToAlbum: vi.fn(),
  removePhotosFromAlbum: vi.fn(),
  recordPhotoMetadata: vi.fn(),
});

vi.mock("@/stores/useMediaPhotoStore.js", () => ({
  useMediaPhotoStore: () => storeState,
  convertSrtToVtt: (s) => s,
  formatDurationClock: (sec) => {
    const s = Math.max(0, Math.floor(Number(sec || 0)));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  },
}));

vi.mock("@/api/filesApi.js", () => ({
  downloadFileAsset: vi.fn().mockResolvedValue(undefined),
  fetchFileVersions: vi.fn().mockResolvedValue([]),
  restoreFileVersion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/fileThumbnailCache.js", () => ({
  getCachedFileThumbnailUrl: () => "",
  loadFileThumbnailUrl: vi.fn().mockResolvedValue(""),
  resumeThumbnailQueue: vi.fn(),
  suspendThumbnailQueue: vi.fn(),
}));

vi.mock("@/utils/fileMediaUrl.js", () => ({
  isEncryptedVaultFile: (file) => Boolean(file?.isVaultSpace || file?.encrypted),
  refreshEncryptedStreamUrl: mockRefreshEncryptedStreamUrl,
  resolveFilePlaybackUrl: (file) => file?.downloadUrl || (file?.id ? `/api/file/preview/${file.id}` : ""),
  resolveFileThumbnailFallbackUrl: () => "",
}));

describe("Modal playback, ordering & mobile touch guarantees", () => {
  let mockHistory;

  beforeEach(() => {
    mockHistory = {
      state: {},
      pushState: vi.fn((state) => {
        mockHistory.state = state;
      }),
      replaceState: vi.fn((state) => {
        mockHistory.state = state;
      }),
      back: vi.fn(),
    };
    vi.stubGlobal("history", mockHistory);
    document.body.style.overflow = "";
    storeState.candidateVideoById = new Map();
    storeState.candidatePhotoById = new Map();
    storeState.videoById = new Map();
    storeState.photoById = new Map();
    storeState.allPhotos = [];
    storeState.openTheater.mockClear();
    storeState.closeTheater.mockClear();
    storeState.openPhotoLightbox.mockClear();
    storeState.closePhotoLightbox.mockClear();
    storeState.navigateToOriginalFolder.mockClear();
    mockRefreshEncryptedStreamUrl.mockReset();
  });

  it("FilePreviewModal teleports, navigates files in order, hands off ordered video/vault scope, and shows retry on error", async () => {
    const v1 = {
      id: 11,
      name: "vault-clip-1.mp4",
      extension: "mp4",
      downloadUrl: "/api/file/secret/stream/11",
      isVaultSpace: true,
      encrypted: true,
      sizeBytes: 1000,
    };
    const img2 = {
      id: 12,
      name: "doc.txt",
      extension: "txt",
      sizeBytes: 500,
    };
    const v3 = {
      id: 13,
      name: "vault-clip-2.mp4",
      extension: "mp4",
      downloadUrl: "/api/file/secret/stream/13",
      isVaultSpace: true,
      encrypted: true,
      sizeBytes: 2000,
    };

    const wrapper = mount(FilePreviewModal, {
      props: {
        file: v1,
        files: [v1, img2, v3],
      },
      global: {
        stubs: { Teleport: true },
      },
    });
    await nextTick();

    const videoEl = wrapper.get("video");
    expect(videoEl.attributes("playsinline")).toBeDefined();
    expect(videoEl.attributes("webkit-playsinline")).toBeDefined();
    expect(document.body.style.overflow).toBe("hidden");

    // Next file navigation via desktop button follows `files` prop order
    await wrapper.get("[data-testid='preview-next-desktop']").trigger("click");
    expect(wrapper.emitted("select-file")?.[0]?.[0]?.id).toBe(12);

    // Handoff to MediaTheater passes only ordered video IDs [11, 13] + vaultScope
    await wrapper.findAll("button").find((b) => b.text().includes("미디어 시어터")).trigger("click");
    expect(storeState.openTheater).toHaveBeenCalledWith(
      v1,
      expect.objectContaining({
        playlistIds: ["11", "13"],
        vaultScope: true,
      }),
    );

    // Error state exposes retry button
    mockRefreshEncryptedStreamUrl.mockResolvedValue("");
    const errWrapper = mount(FilePreviewModal, {
      props: { file: v1, files: [v1] },
      global: { stubs: { Teleport: true } },
    });
    await errWrapper.get("video").trigger("error");
    await flushPromises();
    expect(errWrapper.find("[data-testid='preview-retry-btn']").exists()).toBe(true);
    errWrapper.unmount();
    wrapper.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("MediaTheaterModal omits crossorigin=anonymous, supports prev/next on image items, and avoids history.back race on folder jump", async () => {
    const vid = {
      id: "201",
      name: "ep1.mp4",
      mediaKind: "video",
      downloadUrl: "http://192.168.35.30:9000/bucket/ep1.mp4",
      sizeLabel: "50 MB",
      folderPathLabel: "홈 / 영상",
    };
    const img = {
      id: "202",
      name: "poster.jpg",
      mediaKind: "image",
      downloadUrl: "/api/file/preview/202",
      sizeLabel: "2 MB",
      folderPathLabel: "홈 / 영상",
    };
    storeState.candidateVideoById.set("201", vid);
    storeState.candidatePhotoById.set("202", img);

    const wrapper = mount(MediaTheaterModal, {
      props: {
        videoId: "201",
        playlistIds: ["201", "202"],
      },
      global: { stubs: { Teleport: true } },
    });
    await nextTick();

    const videoEl = wrapper.get("video");
    expect(videoEl.attributes("crossorigin")).toBeUndefined();
    expect(videoEl.attributes("webkit-playsinline")).toBeDefined();

    // Switch to image item in mixed collection -> prev navigation remains available
    await wrapper.setProps({ videoId: "202" });
    await nextTick();
    expect(wrapper.find("[data-testid='theater-image-prev']").exists()).toBe(true);

    // Jump to original folder clears modal history via replaceState (not history.back)
    mockHistory.back.mockClear();
    const folderBtn = wrapper.findAll("button").find((b) => b.attributes("title") === "원본 폴더로 이동");
    await folderBtn.trigger("click");
    await flushPromises();
    expect(mockHistory.back).not.toHaveBeenCalled();
    expect(mockHistory.state[MODAL_HISTORY_KEY]).toBeUndefined();
    expect(storeState.navigateToOriginalFolder).toHaveBeenCalled();

    wrapper.unmount();
  });

  it("PhotoLightboxModal resolves candidatePhotoById outside allPhotos, scopes touch to canvas, and prevents pinch-to-swipe misfires", async () => {
    const p1 = {
      id: "301",
      name: "drive-only-1.jpg",
      dayLabel: "11월 28일",
      folderPathLabel: "홈 / 사진",
      sizeLabel: "3 MB",
      extension: "jpg",
      downloadUrl: "/api/file/preview/301",
    };
    const p2 = {
      id: "302",
      name: "drive-only-2.jpg",
      dayLabel: "11월 28일",
      folderPathLabel: "홈 / 사진",
      sizeLabel: "4 MB",
      extension: "jpg",
      downloadUrl: "/api/file/preview/302",
    };

    // Intentionally leave photoById/allPhotos empty (manual mode Drive view)
    storeState.candidatePhotoById.set("301", p1);
    storeState.candidatePhotoById.set("302", p2);

    // 1. Missing item must NOT push a phantom history entry
    const missingWrapper = mount(PhotoLightboxModal, {
      props: { photoId: "999999", poolIds: [] },
      global: { stubs: { Teleport: true } },
    });
    await nextTick();
    expect(mockHistory.pushState).not.toHaveBeenCalled();
    missingWrapper.unmount();

    // 2. Valid candidate photo renders even when photoById/allPhotos are empty
    const wrapper = mount(PhotoLightboxModal, {
      props: { photoId: "301", poolIds: ["301", "302"] },
      global: { stubs: { Teleport: true } },
    });
    await nextTick();

    expect(mockHistory.pushState).toHaveBeenCalledTimes(1);
    expect(wrapper.find("[data-testid='lightbox-next-btn']").exists()).toBe(true);

    // 3. Multi-finger pinch lifting one finger must NOT trigger goNext/goPrev swipe
    const stage = wrapper.get("[data-testid='lightbox-photo-stage']");
    await stage.trigger("touchstart", {
      touches: [
        { clientX: 100, clientY: 200 },
        { clientX: 200, clientY: 200 },
      ],
    });
    await stage.trigger("touchmove", {
      touches: [
        { clientX: 80, clientY: 200 },
        { clientX: 240, clientY: 200 },
      ],
    });
    await stage.trigger("touchend", {
      touches: [{ clientX: 80, clientY: 200 }],
      changedTouches: [{ clientX: 240, clientY: 200 }],
    });
    expect(storeState.openPhotoLightbox).not.toHaveBeenCalled();

    // Finish releasing second finger, zoom back to 100%, then normal 1-finger swipe left advances to next
    await stage.trigger("touchend", {
      touches: [],
      changedTouches: [{ clientX: 80, clientY: 200 }],
    });
    wrapper.get("button[title='원래 크기로 (0)']").trigger("click");
    await nextTick();

    await stage.trigger("touchstart", { touches: [{ clientX: 240, clientY: 200 }] });
    await stage.trigger("touchend", {
      touches: [],
      changedTouches: [{ clientX: 100, clientY: 205 }],
    });
    expect(storeState.openPhotoLightbox).toHaveBeenCalledWith(
      "302",
      expect.objectContaining({ poolIds: ["301", "302"] }),
    );

    // 4. Image error shows retry button
    await wrapper.get("img").trigger("error");
    await nextTick();
    expect(wrapper.find("[data-testid='lightbox-retry-btn']").exists()).toBe(true);

    wrapper.unmount();
  });
});
