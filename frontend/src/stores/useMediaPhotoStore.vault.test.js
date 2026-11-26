import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick, reactive, ref } from "vue";
import { useMediaPhotoStore } from "./useMediaPhotoStore.js";

const mockAllFiles = ref([]);
const mockDrivePageFiles = ref([]);
const mockSharedFiles = ref([]);
const mockVaultAllFiles = ref([]);
const mockVaultHasLoaded = ref(false);
const mockVaultLoading = ref(false);
const mockHasLoaded = ref(true);
const mockIsLoading = ref(false);

const mockFetchFiles = vi.fn().mockResolvedValue([]);
const mockFetchVaultFiles = vi.fn().mockImplementation(async () => {
  mockVaultHasLoaded.value = true;
  return mockVaultAllFiles.value;
});
const mockClearVaultFiles = vi.fn().mockImplementation(() => {
  mockVaultAllFiles.value = [];
  mockVaultHasLoaded.value = false;
});
const mockNavigateToFolder = vi.fn();
const mockRecordFileAccess = vi.fn();
const mockClearVaultThumbnails = vi.fn();
const mockResetScope = vi.fn();

const mockFetchMediaLibraryState = vi.fn().mockResolvedValue({ state: null });
const mockSaveMediaLibraryState = vi.fn().mockResolvedValue({ updatedAt: "2026-11-13T10:00:00Z" });
const mockFetchVaultMediaLibraryState = vi.fn().mockResolvedValue({ state: null });
const mockSaveVaultMediaLibraryState = vi.fn().mockResolvedValue({ updatedAt: "2026-11-13T10:00:00Z" });

const mockSecretFolderStore = reactive({
  vaultMode: false,
  vaultUnlocked: false,
  vaultPinRegistered: true,
  setVaultTrashView: vi.fn(),
});

const mockAuthState = reactive({
  user: { idx: 88, email: "vault-tester@fileinnout.dev" },
});

vi.mock("@/api/mediaLibraryApi.js", () => ({
  fetchMediaLibraryState: (...args) => mockFetchMediaLibraryState(...args),
  saveMediaLibraryState: (...args) => mockSaveMediaLibraryState(...args),
  fetchVaultMediaLibraryState: (...args) => mockFetchVaultMediaLibraryState(...args),
  saveVaultMediaLibraryState: (...args) => mockSaveVaultMediaLibraryState(...args),
}));

vi.mock("@/utils/fileThumbnailCache.js", () => ({
  clearVaultThumbnails: (...args) => mockClearVaultThumbnails(...args),
}));

vi.mock("@/stores/useAuthStore.js", () => ({
  useAuthStore: () => mockAuthState,
}));

vi.mock("@/stores/useHeaderSearchStore.js", () => ({
  useHeaderSearchStore: () => ({
    resetScope: mockResetScope,
    setAvailableExtensions: vi.fn(),
  }),
}));

vi.mock("@/stores/useSecretFolderStore.js", () => ({
  useSecretFolderStore: () => mockSecretFolderStore,
}));

vi.mock("@/stores/useFileStore.js", () => ({
  useFileStore: () => ({
    get allFiles() {
      return mockAllFiles.value;
    },
    get drivePageFiles() {
      return mockDrivePageFiles.value;
    },
    get sharedFiles() {
      return mockSharedFiles.value;
    },
    get vaultAllFiles() {
      return mockVaultAllFiles.value;
    },
    get vaultHasLoaded() {
      return mockVaultHasLoaded.value;
    },
    get vaultLoading() {
      return mockVaultLoading.value;
    },
    get hasLoaded() {
      return mockHasLoaded.value;
    },
    get isLoading() {
      return mockIsLoading.value;
    },
    fetchFiles: mockFetchFiles,
    fetchVaultFiles: mockFetchVaultFiles,
    clearVaultFiles: mockClearVaultFiles,
    getFolderPath: (parentId) => {
      if (parentId === 201) {
        return [{ id: 201, name: "비밀 영화", spaceType: "VAULT", isVaultSpace: true }];
      }
      if (parentId === 10) {
        return [{ id: 10, name: "일반 여행", spaceType: "DRIVE", isVaultSpace: false }];
      }
      return [];
    },
    navigateToFolder: mockNavigateToFolder,
    recordFileAccess: mockRecordFileAccess,
  }),
}));

describe("useMediaPhotoStore vault isolation & security lifecycle", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.useRealTimers();

    mockSecretFolderStore.vaultMode = false;
    mockSecretFolderStore.vaultUnlocked = false;
    mockAuthState.user = { idx: 88, email: "vault-tester@fileinnout.dev" };
    mockVaultHasLoaded.value = false;
    mockVaultLoading.value = false;
    mockHasLoaded.value = true;

    mockAllFiles.value = [
      {
        id: 1,
        name: "public-clip.mp4",
        fileFormat: "mp4",
        nodeType: "FILE",
        fileSize: 4000,
        parentId: 10,
        spaceType: "DRIVE",
        isVaultSpace: false,
      },
      {
        id: 2,
        name: "public-photo.jpg",
        fileFormat: "jpg",
        nodeType: "FILE",
        fileSize: 2000,
        parentId: 10,
        spaceType: "DRIVE",
        isVaultSpace: false,
      },
      {
        id: 3,
        name: "shared-clip.mp4",
        fileFormat: "mp4",
        nodeType: "FILE",
        fileSize: 3000,
        sharedWithMe: true,
        spaceType: "DRIVE",
        isVaultSpace: false,
      },
    ];
    mockDrivePageFiles.value = [];
    mockSharedFiles.value = [mockAllFiles.value[2]];
    mockVaultAllFiles.value = [
      {
        id: 201,
        name: "비밀 영화",
        nodeType: "FOLDER",
        parentId: null,
        spaceType: "VAULT",
        isVaultSpace: true,
      },
      {
        id: 202,
        name: "secret-ep01.mp4",
        fileFormat: "mp4",
        nodeType: "FILE",
        fileSize: 9000,
        parentId: 201,
        spaceType: "VAULT",
        isVaultSpace: true,
      },
      {
        id: 203,
        name: "secret-photo.png",
        fileFormat: "png",
        nodeType: "FILE",
        fileSize: 3500,
        parentId: null,
        spaceType: "VAULT",
        isVaultSpace: true,
      },
      {
        // Even if a non-VAULT record were ever in the array, vault catalog must reject it
        id: 999,
        name: "leaked-normal.mp4",
        fileFormat: "mp4",
        nodeType: "FILE",
        fileSize: 1000,
        spaceType: "DRIVE",
        isVaultSpace: false,
      },
    ];
  });

  it("refuses vault scope and vault playback when the secret vault is locked", async () => {
    const store = useMediaPhotoStore();

    await store.ensureCatalogLoaded({ scope: "vault" });
    expect(store.libraryScope).toBe("normal");
    expect(store.isVaultScope).toBe(false);
    expect(mockFetchVaultMediaLibraryState).not.toHaveBeenCalled();
    expect(mockFetchVaultFiles).not.toHaveBeenCalled();

    store.openTheater({ id: 202, isVaultSpace: true, spaceType: "VAULT" });
    expect(store.activeTheaterVideoId).toBeNull();

    store.openPhotoLightbox({ id: 203, isVaultSpace: true, spaceType: "VAULT" });
    expect(store.activeLightboxPhotoId).toBeNull();
  });

  it("loads isolated vault catalog & state in memory without touching localStorage or mixing normal items", async () => {
    vi.useFakeTimers();
    mockSecretFolderStore.vaultMode = true;
    mockSecretFolderStore.vaultUnlocked = true;
    mockFetchVaultMediaLibraryState.mockResolvedValueOnce({
      state: {
        mediaFavoriteIds: ["202"],
        photoAlbums: [{ id: "va-1", name: "비밀 앨범", photoIds: ["203"], coverPhotoId: "203" }],
        preferences: { mediaSourceMode: "all", photoSourceMode: "all" },
      },
    });

    const store = useMediaPhotoStore();

    // Mutate normal library first and persist into localStorage
    store.toggleMediaFavorite(1);
    expect(window.localStorage.length).toBe(1);
    const localStorageSnapshotBeforeVault = window.localStorage.getItem(window.localStorage.key(0));

    await store.ensureCatalogLoaded({ scope: "vault" });
    // Switching from dirty normal state flushes normal state cleanly without vault fields
    expect(mockSaveMediaLibraryState).toHaveBeenCalledTimes(1);
    expect(mockSaveMediaLibraryState.mock.calls[0][0].mediaFavoriteIds).toEqual(["1"]);
    mockSaveMediaLibraryState.mockClear();

    expect(store.isVaultScope).toBe(true);
    expect(mockFetchVaultMediaLibraryState).toHaveBeenCalledTimes(1);
    expect(mockFetchVaultFiles).toHaveBeenCalledTimes(1);

    // Strictly vault-only candidates and root label "비밀 폴더"
    expect(store.candidateVideos.map((v) => String(v.id))).toEqual(["202"]);
    expect(store.candidatePhotos.map((p) => String(p.id))).toEqual(["203"]);
    expect(store.candidateVideos[0].folderPathLabel).toContain("비밀 폴더");
    expect(store.resolvedPhotoAlbums.map((a) => a.name)).toEqual(["비밀 앨범"]);
    expect(store.mediaFavoriteIds).toEqual(["202"]);

    // Mutations in vault scope must persist to vault API only and never touch localStorage
    store.togglePhotoFavorite(203);
    store.recordWatchProgress(202, 120, 600);
    await vi.advanceTimersByTimeAsync(900);

    expect(mockSaveVaultMediaLibraryState).toHaveBeenCalled();
    expect(mockSaveMediaLibraryState).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.getItem(window.localStorage.key(0))).toBe(localStorageSnapshotBeforeVault);

    // Switching back to normal scope restores normal favorites and excludes all vault artifacts
    await store.ensureCatalogLoaded({ scope: "normal" });
    expect(store.isVaultScope).toBe(false);
    expect(store.mediaFavoriteIds).toEqual(["1"]);
    expect(store.resolvedPhotoAlbums).toEqual([]);
    expect(store.candidateVideos.some((v) => String(v.id) === "202")).toBe(false);
    expect(store.candidatePhotos.some((p) => String(p.id) === "203")).toBe(false);
  });

  it("wipes vault files, thumbnails, theater, mini player, and lightbox immediately when vault locks", async () => {
    mockSecretFolderStore.vaultMode = true;
    mockSecretFolderStore.vaultUnlocked = true;

    const store = useMediaPhotoStore();
    await store.ensureCatalogLoaded({ scope: "vault" });

    // Open vault theater & minimize to mini player, plus open vault lightbox
    store.openTheater(202);
    expect(store.activeTheaterVideoId).toBe("202");
    store.minimizeToMiniPlayer({ positionSeconds: 45, isPlaying: true });
    expect(store.miniPlayer.active).toBe(true);
    expect(store.miniPlayer.isVault).toBe(true);

    store.openPhotoLightbox(203);
    expect(store.activeLightboxPhotoId).toBe("203");

    // Simulate locking vault
    mockSecretFolderStore.vaultUnlocked = false;
    await nextTick();

    expect(store.libraryScope).toBe("normal");
    expect(store.activeTheaterVideoId).toBeNull();
    expect(store.miniPlayer.active).toBe(false);
    expect(store.miniPlayer.isVault).toBe(false);
    expect(store.activeLightboxPhotoId).toBeNull();
    expect(mockClearVaultFiles).toHaveBeenCalled();
    expect(mockClearVaultThumbnails).toHaveBeenCalled();
    expect(mockResetScope).toHaveBeenCalledWith("secretMedia");
    expect(mockResetScope).toHaveBeenCalledWith("secretPhotos");
  });

  it("preserves vault files and vault thumbnails when leaving vaultMode while vault remains unlocked", async () => {
    mockSecretFolderStore.vaultMode = true;
    mockSecretFolderStore.vaultUnlocked = true;

    const store = useMediaPhotoStore();
    await store.ensureCatalogLoaded({ scope: "vault" });
    expect(store.isVaultScope).toBe(true);

    mockClearVaultFiles.mockClear();
    mockClearVaultThumbnails.mockClear();
    mockResetScope.mockClear();

    // Navigate back to normal routes without locking the vault
    mockSecretFolderStore.vaultMode = false;
    await nextTick();

    expect(store.libraryScope).toBe("normal");
    expect(mockClearVaultFiles).not.toHaveBeenCalled();
    expect(mockClearVaultThumbnails).not.toHaveBeenCalled();

    // Actually locking the vault must wipe both immediately
    mockSecretFolderStore.vaultUnlocked = false;
    await nextTick();

    expect(mockClearVaultFiles).toHaveBeenCalled();
    expect(mockClearVaultThumbnails).toHaveBeenCalled();
  });

  it("navigates to original vault folder cleanly without exposing normal drive routes", async () => {
    mockSecretFolderStore.vaultMode = true;
    mockSecretFolderStore.vaultUnlocked = true;
    const mockRouter = { push: vi.fn().mockResolvedValue(undefined) };

    const store = useMediaPhotoStore();
    await store.ensureCatalogLoaded({ scope: "vault" });
    await store.navigateToOriginalFolder(store.candidateVideos[0], mockRouter);

    expect(mockSecretFolderStore.setVaultTrashView).toHaveBeenCalledWith(false);
    expect(mockNavigateToFolder).toHaveBeenCalledWith(201);
    expect(mockRouter.push).toHaveBeenCalledWith({
      name: "home",
      query: { spotlightId: "202", folderId: "201" },
    });
  });
});
