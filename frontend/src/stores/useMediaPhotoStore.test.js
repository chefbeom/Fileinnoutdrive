import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import {
  classifyResolutionLabel,
  convertSrtToVtt,
  formatDurationClock,
  formatDurationKorean,
  inferCaptureDateFromFilename,
  isLikelyScreenshotOrGraphic,
  useMediaPhotoStore,
} from "./useMediaPhotoStore.js";

const mockAllFiles = ref([]);
const mockDrivePageFiles = ref([]);
const mockSharedFiles = ref([]);
const mockNavigateToFolder = vi.fn();
const mockRecordFileAccess = vi.fn();
const mockSaveMediaLibraryState = vi.fn().mockResolvedValue({ updatedAt: "2026-11-10T12:00:00Z" });
const mockFetchMediaLibraryState = vi.fn().mockResolvedValue({ stateJson: null });

vi.mock("@/api/mediaLibraryApi.js", () => ({
  fetchMediaLibraryState: (...args) => mockFetchMediaLibraryState(...args),
  saveMediaLibraryState: (...args) => mockSaveMediaLibraryState(...args),
}));

vi.mock("@/stores/useAuthStore.js", () => ({
  useAuthStore: () => ({
    user: { idx: 77, email: "tester@fileinnout.dev" },
  }),
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
    hasLoaded: true,
    isLoading: false,
    fetchFiles: vi.fn().mockResolvedValue([]),
    getFolderPath: (parentId) => (parentId === 10 ? [{ id: 10, name: "여행" }] : []),
    navigateToFolder: mockNavigateToFolder,
    recordFileAccess: mockRecordFileAccess,
  }),
}));

describe("useMediaPhotoStore & helper utilities", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    mockNavigateToFolder.mockReset();
    mockRecordFileAccess.mockReset();

    mockAllFiles.value = [
      {
        id: 10,
        name: "여행",
        type: "folder",
        isTrash: false,
        parentId: null,
      },
      {
        id: 101,
        name: "jeju_vlog_20261109.mp4",
        extension: "mp4",
        type: "file",
        isVideo: true,
        isImage: false,
        isTrash: false,
        lockedFile: false,
        parentId: 10,
        sizeBytes: 104857600,
        sizeLabel: "100 MB",
        uploadDate: "2026-11-09T10:00:00Z",
        uploadedAtMs: new Date("2026-11-09T10:00:00Z").getTime(),
        downloadUrl: "https://example.com/101.mp4",
      },
      {
        id: 102,
        name: "jeju_vlog_20261109.srt",
        extension: "srt",
        type: "file",
        isVideo: false,
        isImage: false,
        isTrash: false,
        lockedFile: false,
        parentId: 10,
        sizeBytes: 2048,
        sizeLabel: "2 KB",
        downloadUrl: "https://example.com/102.srt",
      },
      {
        id: 201,
        name: "IMG_20261108_143000.jpg",
        extension: "jpg",
        type: "file",
        isVideo: false,
        isImage: true,
        isTrash: false,
        lockedFile: false,
        parentId: 10,
        sizeBytes: 4194304,
        sizeLabel: "4 MB",
        uploadDate: "2026-11-08T15:00:00Z",
        uploadedAtMs: new Date("2026-11-08T15:00:00Z").getTime(),
        downloadUrl: "https://example.com/201.jpg",
      },
      {
        id: 202,
        name: "Screenshot_20261109-091500.png",
        extension: "png",
        type: "file",
        isVideo: false,
        isImage: true,
        isTrash: false,
        lockedFile: false,
        parentId: null,
        sizeBytes: 1048576,
        sizeLabel: "1 MB",
        uploadDate: "2026-11-09T09:15:00Z",
        uploadedAtMs: new Date("2026-11-09T09:15:00Z").getTime(),
        downloadUrl: "https://example.com/202.png",
      },
    ];
    mockDrivePageFiles.value = [];
    mockSharedFiles.value = [];
  });

  it("formats durations, resolutions, SRT to VTT, and filename capture dates", () => {
    expect(formatDurationClock(125)).toBe("02:05");
    expect(formatDurationClock(3661)).toBe("1:01:01");
    expect(formatDurationKorean(3660)).toBe("1시간 1분");
    expect(classifyResolutionLabel(3840, 2160)).toBe("4K");
    expect(classifyResolutionLabel(1920, 1080)).toBe("FHD");

    const vtt = convertSrtToVtt("1\n00:00:01,250 --> 00:00:03,500\n안녕하세요");
    expect(vtt).toContain("WEBVTT");
    expect(vtt).toContain("00:00:01.250 --> 00:00:03.500");

    const inferred = inferCaptureDateFromFilename("IMG_20261108_143000.jpg");
    expect(inferred).toContain("2026-11-08");
    expect(isLikelyScreenshotOrGraphic({ name: "Screenshot_20261109.png", extension: "png" })).toBe(true);
    expect(isLikelyScreenshotOrGraphic({ name: "IMG_20261108.jpg", extension: "jpg" })).toBe(false);
  });

  it("defaults to manual designation mode and supports switching to all-files mode or folder/file inclusion", () => {
    const store = useMediaPhotoStore();
    // Default mode is 'manual', so candidateVideos/candidatePhotos have items, while allVideos/allPhotos start empty
    expect(store.preferences.mediaSourceMode).toBe("manual");
    expect(store.preferences.photoSourceMode).toBe("manual");
    expect(store.candidateVideos).toHaveLength(1);
    expect(store.candidatePhotos).toHaveLength(2);
    expect(store.allVideos).toHaveLength(0);
    expect(store.allPhotos).toHaveLength(0);

    // Explicitly designating folder 10 includes video 101 and photo 201 inside folder 10
    store.toggleMediaFolderInclusion(10);
    store.togglePhotoFolderInclusion(10);
    expect(store.allVideos).toHaveLength(1);
    expect(store.allVideos[0].id).toBe(101);
    expect(store.allVideos[0].folderPathLabel).toBe("홈 / 여행");
    expect(store.allVideos[0].matchingSubtitles).toHaveLength(1);
    expect(store.allPhotos.map((p) => p.id)).toEqual([201]);

    // Switching to 'all' mode includes all Drive videos and photos automatically
    store.updatePreferences({ mediaSourceMode: "all", photoSourceMode: "all" });
    expect(store.allVideos).toHaveLength(1);
    expect(store.allPhotos.map((p) => p.id)).toEqual([202, 201]);
  });

  it("tracks watch progress, continue watching, and auto-completion at >= 92%", () => {
    const store = useMediaPhotoStore();
    store.recordWatchProgress(101, 1500, 3600);

    expect(store.continueWatchingVideos).toHaveLength(1);
    expect(store.continueWatchingVideos[0].progressPercent).toBe(42);
    expect(store.continueWatchingVideos[0].watchState).toBe("watching");

    // Reaching >= 92% marks video completed and removes it from continue watching
    store.recordWatchProgress(101, 3400, 3600);
    expect(store.continueWatchingVideos).toHaveLength(0);
    expect(store.allVideos[0].completed).toBe(true);
    expect(store.allVideos[0].watchState).toBe("completed");
  });

  it("supports N:M media collections and photo albums without deleting original files", () => {
    const store = useMediaPhotoStore();
    store.updatePreferences({ mediaSourceMode: "all", photoSourceMode: "all" });

    const col = store.createMediaCollection({
      name: "제주도 여행 모음",
      description: "영상 + 사진",
      itemIds: [101, 201],
    });
    expect(col).toBeTruthy();
    expect(store.resolvedMediaCollections[0].itemCount).toBe(2);

    const album = store.createPhotoAlbum({
      name: "제주 스냅",
      photoIds: [201, 202],
    });
    expect(album).toBeTruthy();
    expect(store.resolvedPhotoAlbums[0].photoCount).toBe(2);

    // Removing a photo from an album keeps the photo in allPhotos
    store.removePhotosFromAlbum(album.id, [202]);
    expect(store.resolvedPhotoAlbums[0].photoCount).toBe(1);
    expect(store.allPhotos).toHaveLength(2);

    // Trashing the original file in Drive automatically hides it from albums and media
    mockAllFiles.value = mockAllFiles.value.map((f) => (f.id === 201 ? { ...f, isTrash: true } : f));
    expect(store.allPhotos).toHaveLength(1);
    expect(store.resolvedPhotoAlbums[0].photoCount).toBe(0);
  });

  it("navigates to the original folder in Drive and sets spotlight file ID", async () => {
    const store = useMediaPhotoStore();
    const mockRouter = { push: vi.fn().mockResolvedValue(undefined) };

    await store.navigateToOriginalFolder(store.candidateVideos[0], mockRouter);
    expect(mockNavigateToFolder).toHaveBeenCalledWith(10);
    expect(mockRouter.push).toHaveBeenCalledWith({
      name: "home",
      query: { spotlightId: "101", folderId: "10" },
    });
  });

  it("takes down a manual or auto-mode series without deleting Drive files and restores it with custom metadata", () => {
    mockAllFiles.value = [
      ...mockAllFiles.value,
      {
        id: 20,
        name: "청춘 돼지는 바니걸 선배의 꿈을 꾸지 않는다",
        type: "folder",
        isTrash: false,
        parentId: null,
      },
      {
        id: 2001,
        name: "seishun_01.mp4",
        extension: "mp4",
        type: "file",
        isVideo: true,
        isImage: false,
        isTrash: false,
        lockedFile: false,
        parentId: 20,
        sizeBytes: 50_000_000,
        sizeLabel: "50 MB",
        downloadUrl: "https://example.com/2001.mp4",
      },
      {
        id: 30,
        name: "청춘 돼지는 꿈꾸는 소녀의 꿈을 꾸지 않는다",
        type: "folder",
        isTrash: false,
        parentId: null,
      },
      {
        id: 3001,
        name: "movie_01.mp4",
        extension: "mp4",
        type: "file",
        isVideo: true,
        isImage: false,
        isTrash: false,
        lockedFile: false,
        parentId: 30,
        sizeBytes: 120_000_000,
        sizeLabel: "120 MB",
        downloadUrl: "https://example.com/3001.mp4",
      },
    ];

    const store = useMediaPhotoStore();
    store.setMediaIncludedFolders([10, 20, 30]);
    const savedManual = store.saveSeriesOverride({
      title: "청춘 돼지 시리즈 커스텀",
      folderIds: [20, 30],
      seasonLabels: { 20: "TV판 1기", 30: "극장판" },
    });
    expect(savedManual?.title).toBe("청춘 돼지 시리즈 커스텀");

    store.markVideoStarted(2001);
    store.recordWatchProgress(2001, 420, 1400);
    expect(store.resolvedMediaSeries.some((s) => s.title === "청춘 돼지 시리즈 커스텀")).toBe(true);

    const targetSeries = store.resolvedMediaSeries.find((s) => s.title === "청춘 돼지 시리즈 커스텀");
    const removed = store.takedownMediaSeries(targetSeries);
    expect(removed).toHaveLength(1);
    expect(store.removedMediaSeries).toHaveLength(1);
    expect(store.resolvedMediaSeries.some((s) => s.title === "청춘 돼지 시리즈 커스텀")).toBe(false);
    expect(store.allVideos.some((v) => v.id === 2001 || v.id === 3001)).toBe(false);
    expect(store.continueWatchingVideos.some((v) => v.id === 2001)).toBe(false);

    // Originals remain untouched in candidate pool & watch progress stays preserved
    expect(store.candidateVideos.some((v) => v.id === 2001)).toBe(true);
    expect(store.watchHistoryById["2001"]?.positionSeconds).toBe(420);

    // Even switching to 'all' mode keeps taken-down series hidden
    store.updatePreferences({ mediaSourceMode: "all" });
    expect(store.allVideos.some((v) => v.id === 2001 || v.id === 3001)).toBe(false);

    // Restoring returns custom title, labels, videos, and watch history
    store.updatePreferences({ mediaSourceMode: "manual" });
    expect(store.restoreRemovedSeries(removed[0].id)).toBe(true);
    expect(store.removedMediaSeries).toHaveLength(0);
    const restored = store.resolvedMediaSeries.find((s) => s.title === "청춘 돼지 시리즈 커스텀");
    expect(restored).toBeTruthy();
    expect(restored.seasons.map((s) => s.seasonLabel)).toEqual(["TV판 1기", "극장판"]);
    expect(store.continueWatchingVideos.some((v) => v.id === 2001)).toBe(true);
  });

  it("supports virtual root-file series takedown, re-inclusion pruning, and restoreAllRemovedSeries", () => {
    mockAllFiles.value = [
      ...mockAllFiles.value,
      {
        id: 901,
        name: "root_clip_01.mp4",
        extension: "mp4",
        type: "file",
        isVideo: true,
        isImage: false,
        isTrash: false,
        lockedFile: false,
        parentId: null,
        sizeBytes: 10_000_000,
        sizeLabel: "10 MB",
        downloadUrl: "https://example.com/901.mp4",
      },
      {
        id: 902,
        name: "future_root_clip.mp4",
        extension: "mp4",
        type: "file",
        isVideo: true,
        isImage: false,
        isTrash: false,
        lockedFile: false,
        parentId: null,
        sizeBytes: 12_000_000,
        sizeLabel: "12 MB",
        downloadUrl: "https://example.com/902.mp4",
      },
    ];

    const store = useMediaPhotoStore();
    store.addMediaFiles([901, 902]);
    store.setMediaIncludedFolders([10]);
    expect(store.resolvedMediaSeries.length).toBeGreaterThanOrEqual(2);

    const rootSeries = store.resolvedMediaSeries.find((s) => s.folderIds.includes("__root__"));
    const folderSeries = store.resolvedMediaSeries.find((s) => s.folderIds.includes("10"));
    expect(rootSeries).toBeTruthy();
    expect(folderSeries).toBeTruthy();

    // Batch takedown hides both series while virtual exclusion targets specific fileIds, not '__root__'
    store.takedownMediaSeries([rootSeries.id, folderSeries.id]);
    expect(store.resolvedMediaSeries).toHaveLength(0);
    expect(store.mediaExcludedFolderIds).not.toContain("__root__");
    expect(store.mediaExcludedFolderIds).toContain("10");
    expect(store.removedMediaSeries).toHaveLength(2);

    // Re-including folder 10 via source picker clears folder 10 from removed list cleanly
    store.setMediaIncludedFolders([10]);
    expect(store.mediaExcludedFolderIds).not.toContain("10");
    expect(store.removedMediaSeries).toHaveLength(1);

    // restoreAllRemovedSeries restores remaining virtual root series
    expect(store.restoreAllRemovedSeries()).toBe(1);
    expect(store.removedMediaSeries).toHaveLength(0);
    expect(store.allVideos.some((v) => v.id === 901)).toBe(true);
  });

  it("designates a nested media area directory, auto-registers child series, reacts to uploads, and supports takedown/restore/remove", () => {
    const folder = (id, name, parentId) => ({
      id,
      name,
      extension: "",
      type: "folder",
      isVideo: false,
      isImage: false,
      isTrash: false,
      lockedFile: false,
      parentId,
    });
    const video = (id, name, parentId) => ({
      id,
      name,
      extension: "mp4",
      type: "file",
      isVideo: true,
      isImage: false,
      isTrash: false,
      lockedFile: false,
      parentId,
      sizeBytes: 50_000_000,
      sizeLabel: "50 MB",
      downloadUrl: `https://example.com/${id}.mp4`,
    });

    mockAllFiles.value = [
      folder(1, "저장한내용", null),
      folder(2, "엔터", 1),
      folder(3, "비디오들", 2),
      folder(5, "애니메이션", 3),
      folder(10, "간츠", 5),
      folder(20, "내청코", 5),
      folder(21, "역시내 청춘러브코메디는 잘못됐다. 시즌1", 20),
      folder(22, "역시내 청춘러브코메디는 잘못됐다.-속-", 20),
      folder(30, "국민이산다", 5),
      folder(40, "바케모노가타리", 5),
      folder(41, "바케모노가타리", 40),
      folder(42, "니세모노가타리", 40),
      video(1001, "간츠 01화.mp4", 10),
      video(2001, "내청코 1기 01화.mp4", 21),
      video(2002, "내청코 속 01화.mp4", 22),
      video(3001, "국민이산다 01화.mp4", 30),
      video(4001, "바케모노가타리 01화.mp4", 41),
      video(4002, "니세모노가타리 01화.mp4", 42),
    ];

    const store = useMediaPhotoStore();
    store.updatePreferences({ mediaSourceMode: "manual" });
    expect(store.resolvedMediaSeries).toHaveLength(0);

    // Live preview before designating Area 5 ("애니메이션")
    const preview = store.previewMediaAreaFolder("5");
    expect(preview).toBeTruthy();
    expect(preview.activeChildSeriesCount).toBe(4);
    expect(preview.childSeries.map((c) => c.name)).toEqual(["간츠", "국민이산다", "내청코", "바케모노가타리"]);
    expect(preview.totalVideoCount).toBe(6);

    // Register Area 5 -> automatically pulls all descendants even in 'manual' mode
    const created = store.addMediaLibraryArea("5");
    expect(created?.folderId).toBe("5");
    expect(store.isMediaAreaFolder("5")).toBe(true);
    expect(store.resolvedMediaAreas).toHaveLength(1);
    expect(store.resolvedMediaAreas[0].seriesCount).toBe(4);
    expect(store.resolvedMediaAreas[0].episodeCount).toBe(6);

    const titles = store.resolvedMediaSeries.map((s) => s.title).sort((a, b) => a.localeCompare(b, "ko-KR"));
    expect(titles).toEqual(["간츠", "국민이산다", "내청코", "바케모노가타리"]);

    // New child series uploaded under /애니메이션 appears automatically
    mockAllFiles.value = [
      ...mockAllFiles.value,
      folder(50, "신규작품", 5),
      video(5001, "신규작품 01화.mp4", 50),
    ];
    expect(store.resolvedMediaSeries.some((s) => s.title === "신규작품")).toBe(true);
    expect(store.resolvedMediaAreas[0].seriesCount).toBe(5);

    // Takedown a single child series inside the area while keeping other series active
    const gantzSeries = store.resolvedMediaSeries.find((s) => s.title === "간츠");
    store.takedownMediaSeries(gantzSeries.id);
    expect(store.resolvedMediaSeries.some((s) => s.title === "간츠")).toBe(false);
    expect(store.resolvedMediaSeries).toHaveLength(4);

    // Restore brings it back automatically inside the designated area
    expect(store.restoreAllRemovedSeries()).toBe(1);
    expect(store.resolvedMediaSeries.some((s) => s.title === "간츠")).toBe(true);
    expect(store.resolvedMediaSeries).toHaveLength(5);

    // Removing the area clears area-scoped entries without deleting underlying Drive files
    store.removeMediaLibraryArea("5");
    expect(store.resolvedMediaAreas).toHaveLength(0);
    expect(store.resolvedMediaSeries).toHaveLength(0);
    expect(mockAllFiles.value.some((f) => f.id === 1001)).toBe(true);
  });

  it("excludes and restores individual media videos and photos across all and manual modes without deleting Drive files", () => {
    const store = useMediaPhotoStore();
    store.updatePreferences({ mediaSourceMode: "all", photoSourceMode: "all" });

    expect(store.allVideos.map((v) => v.id)).toEqual([101]);
    expect(store.allPhotos.map((p) => p.id)).toEqual([202, 201]);

    // Exclude individual video from Media in 'all' mode
    store.excludeMediaFiles([101]);
    expect(store.allVideos).toEqual([]);
    expect(store.excludedIndividualMediaVideos.map((v) => v.id)).toEqual([101]);
    expect(store.candidateVideos.map((v) => v.id)).toEqual([101]);
    expect(mockAllFiles.value.some((f) => f.id === 101 && !f.isTrash)).toBe(true);

    store.restoreExcludedMediaFiles([101]);
    expect(store.allVideos.map((v) => v.id)).toEqual([101]);
    expect(store.excludedIndividualMediaVideos).toEqual([]);

    // Exclude photo from Photos (even when added to an album/favorite & lightbox open)
    const album = store.createPhotoAlbum({ name: "테스트", photoIds: [201, 202] });
    store.togglePhotoFavorite(201);
    store.openPhotoLightbox(201, { poolIds: ["201", "202"] });
    store.excludePhotoFiles([201]);

    expect(store.allPhotos.map((p) => p.id)).toEqual([202]);
    expect(store.favoritePhotos).toEqual([]);
    expect(store.resolvedPhotoAlbums.find((a) => a.id === album.id).photos.map((p) => p.id)).toEqual([202]);
    expect(store.excludedPhotos.map((p) => p.id)).toEqual([201]);
    expect(store.activeLightboxPhotoId).toBe("202");
    expect(mockAllFiles.value.some((f) => f.id === 201 && !f.isTrash)).toBe(true);

    // Works identically when switched to 'manual' mode
    store.updatePreferences({ photoSourceMode: "manual" });
    expect(store.allPhotos.map((p) => p.id)).toEqual([202]);
    store.restoreExcludedPhotoFiles([201]);
    expect(store.allPhotos.map((p) => p.id)).toEqual([202, 201]);
    expect(store.favoritePhotos.map((p) => p.id)).toEqual([201]);
    expect(store.resolvedPhotoAlbums.find((a) => a.id === album.id).photos.map((p) => p.id)).toEqual([201, 202]);
  });
});
