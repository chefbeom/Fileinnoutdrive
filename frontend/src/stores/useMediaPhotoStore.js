import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { useAuthStore } from "@/stores/useAuthStore.js";
import { useFileStore } from "@/stores/useFileStore.js";
import { useHeaderSearchStore } from "@/stores/useHeaderSearchStore.js";
import { useSecretFolderStore } from "@/stores/useSecretFolderStore.js";
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from "@/constants/fileTypes.js";
import { classifyMediaSeries } from "@/utils/mediaSeriesClassifier.js";
import { clearVaultThumbnails } from "@/utils/fileThumbnailCache.js";
import {
  fetchMediaLibraryState,
  saveMediaLibraryState,
  fetchVaultMediaLibraryState,
  saveVaultMediaLibraryState,
} from "@/api/mediaLibraryApi.js";

const STORAGE_KEY_PREFIX = "fileinnout-media-photos-v1";
const COMPLETION_THRESHOLD_PERCENT = 92;

export const DEFAULT_MEDIA_PHOTO_PREFERENCES = {
  mediaSourceMode: "manual", // 'manual' (지정한 파일/폴더만 표시) | 'all' (저장소 모든 동영상 자동 표시)
  photoSourceMode: "manual", // 'manual' (지정한 파일/폴더만 표시) | 'all' (저장소 모든 사진 자동 표시)
  defaultPlaybackRate: 1.0,
  enableContinueWatching: true,
  autoPlayNext: true,
  autoLoadSubtitles: true,
  mediaGridDensity: "normal", // 'compact' | 'normal' | 'large' | 'xlarge'
  mediaViewMode: "card", // 'card' | 'list'
  mediaShowThumbnails: true,
  mediaThumbAspect: "video", // 'video' (16:9) | 'classic' (4:3) | 'square' (1:1) | 'poster' (3:4)
  photoGridDensity: "normal", // 'compact' | 'normal' | 'large' | 'xlarge'
  photoThumbAspect: "square", // 'square' (1:1) | 'classic' (4:3) | 'video' (16:9) | 'poster' (3:4)
  photoThumbFit: "cover", // 'cover' | 'contain'
  photoDateBasis: "capture",
  slideshowIntervalSec: 5,
  hideSensitiveExifOnShare: true,
};

const SUBTITLE_EXTENSIONS = new Set(["srt", "vtt"]);

const extractBaseFileName = (fileName = "") => {
  const normalized = String(fileName || "").trim();
  const lastDot = normalized.lastIndexOf(".");
  if (lastDot <= 0) {
    return normalized;
  }
  return normalized.slice(0, lastDot);
};

export const formatDurationClock = (secondsInput) => {
  const totalSeconds = Math.max(0, Math.floor(Number(secondsInput) || 0));
  if (!totalSeconds) {
    return "00:00";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (val) => String(val).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
};

export const formatDurationKorean = (secondsInput) => {
  const totalSeconds = Math.max(0, Math.floor(Number(secondsInput) || 0));
  if (!totalSeconds) {
    return "0초";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}분 ${seconds}초` : `${minutes}분`;
  }
  return `${seconds}초`;
};

export const classifyResolutionLabel = (width, height) => {
  const maxDim = Math.max(Number(width) || 0, Number(height) || 0);
  const minDim = Math.min(Number(width) || 0, Number(height) || 0);
  if (maxDim >= 3840 || minDim >= 2160) return "4K";
  if (maxDim >= 2560 || minDim >= 1440) return "QHD";
  if (maxDim >= 1920 || minDim >= 1080) return "FHD";
  if (maxDim >= 1280 || minDim >= 720) return "HD";
  if (maxDim > 0) return "SD";
  return "";
};

export const convertSrtToVtt = (srtText = "") => {
  const normalized = String(srtText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  const body = normalized.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    "$1.$2",
  );

  return `WEBVTT\n\n${body}\n`;
};

export const inferCaptureDateFromFilename = (fileName = "") => {
  const text = String(fileName || "");
  const match = /(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?:[-_.\s]?([01]\d|2[0-3])[-_.:]?([0-5]\d)(?:[-_.:]?([0-5]\d))?)?/.exec(text);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour = "12", minute = "00", second = "00"] = match;
  const isoCandidate = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const parsed = new Date(isoCandidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

export const isLikelyScreenshotOrGraphic = (file) => {
  const name = String(file?.name || file?.fileOriginName || "").toLowerCase();
  const ext = String(file?.extension || file?.fileFormat || "").toLowerCase();
  if (["svg", "gif", "bmp", "ico"].includes(ext)) {
    return true;
  }
  return (
    name.includes("screenshot") ||
    name.includes("스크린샷") ||
    name.includes("화면 캡처") ||
    name.includes("캡처") ||
    name.startsWith("scr_") ||
    name.startsWith("capture")
  );
};

const createEmptySeriesOverrides = () => ({
  manualSeries: [],
  cannotLink: [],
  autoClassifyEnabled: true,
});

const MEDIA_AREA_GROUPING_MODES = new Set([
  "children-as-series",
  "children-plus-similarity",
]);

const normalizeMediaLibraryArea = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const folderId = String(entry.folderId ?? entry.id ?? "").trim();
  if (!folderId) return null;
  const groupingMode = MEDIA_AREA_GROUPING_MODES.has(entry.groupingMode)
    ? entry.groupingMode
    : "children-as-series";
  return {
    folderId,
    name: String(entry.name || "").trim(),
    pathLabel: String(entry.pathLabel || "").trim(),
    groupingMode,
    addedAt: entry.addedAt ? String(entry.addedAt) : new Date().toISOString(),
  };
};

const createEmptyPersistedState = () => ({
  watchHistoryById: {},
  videoMetaById: {},
  photoMetaById: {},
  mediaIncludedFileIds: [],
  mediaIncludedFolderIds: [],
  mediaExcludedFileIds: [],
  mediaExcludedFolderIds: [],
  removedMediaSeries: [],
  mediaLibraryAreas: [],
  photoIncludedFileIds: [],
  photoIncludedFolderIds: [],
  photoExcludedFileIds: [],
  photoExcludedFolderIds: [],
  mediaFavoriteIds: [],
  mediaFavoriteSeriesIds: [],
  photoFavoriteIds: [],
  photoFavoriteAlbumIds: [],
  mediaCollections: [],
  photoAlbums: [],
  seriesOverrides: createEmptySeriesOverrides(),
  preferences: { ...DEFAULT_MEDIA_PHOTO_PREFERENCES },
});

const DEFAULT_VAULT_MEDIA_PHOTO_PREFERENCES = {
  ...DEFAULT_MEDIA_PHOTO_PREFERENCES,
  mediaSourceMode: "all",
  photoSourceMode: "all",
};

const createEmptyVaultPersistedState = () => ({
  ...createEmptyPersistedState(),
  preferences: { ...DEFAULT_VAULT_MEDIA_PHOTO_PREFERENCES },
});

export const useMediaPhotoStore = defineStore("mediaPhoto", () => {
  const authStore = useAuthStore();
  const fileStore = useFileStore();
  const headerSearchStore = useHeaderSearchStore();
  const secretFolderStore = useSecretFolderStore();

  const libraryScope = ref("normal"); // 'normal' | 'vault'
  const isVaultScope = computed(() => (
    libraryScope.value === "vault" &&
    Boolean(secretFolderStore.vaultMode && secretFolderStore.vaultUnlocked)
  ));

  const watchHistoryById = ref({});
  const videoMetaById = ref({});
  const photoMetaById = ref({});
  const mediaIncludedFileIds = ref([]);
  const mediaIncludedFolderIds = ref([]);
  const mediaExcludedFileIds = ref([]);
  const mediaExcludedFolderIds = ref([]);
  const removedMediaSeries = ref([]);
  const mediaLibraryAreas = ref([]);
  const photoIncludedFileIds = ref([]);
  const photoIncludedFolderIds = ref([]);
  const photoExcludedFileIds = ref([]);
  const photoExcludedFolderIds = ref([]);
  const mediaFavoriteIds = ref([]);
  const mediaFavoriteSeriesIds = ref([]);
  const photoFavoriteIds = ref([]);
  const photoFavoriteAlbumIds = ref([]);
  const mediaCollections = ref([]);
  const photoAlbums = ref([]);
  const seriesOverrides = ref(createEmptySeriesOverrides());
  const preferences = ref({ ...DEFAULT_MEDIA_PHOTO_PREFERENCES });
  const hasLoadedRemoteLibrary = ref(false);
  const hasLoadedRemoteVaultLibrary = ref(false);
  let normalSaveTimerId = null;
  let vaultSaveTimerId = null;
  let cachedNormalPayload = null;
  let cachedVaultPayload = null;

  // Active Theater / Mini Player / Lightbox state
  const activeTheaterVideoId = ref(null);
  const activeTheaterPlaylistIds = ref([]);
  const activeTheaterCollectionId = ref(null);
  const activeTheaterIsVault = ref(false);
  const miniPlayer = ref({
    active: false,
    isVault: false,
    fileId: null,
    playlistIds: [],
    collectionId: null,
    positionSeconds: 0,
    isPlaying: true,
    playbackRate: 1.0,
    muted: false,
  });
  const activeLightboxPhotoId = ref(null);
  const activeLightboxPoolIds = ref([]);
  const activeLightboxSlideshow = ref(false);
  const activeLightboxIsVault = ref(false);
  const spotlightFileId = ref(null);

  const storageKey = computed(() => {
    const userKey = authStore.user?.idx || authStore.user?.id || authStore.user?.email || "guest";
    return `${STORAGE_KEY_PREFIX}:${String(userKey).toLowerCase()}`;
  });

  const applyParsedState = (parsed = {}, options = {}) => {
    watchHistoryById.value = parsed.watchHistoryById && typeof parsed.watchHistoryById === "object"
      ? parsed.watchHistoryById
      : {};
    videoMetaById.value = parsed.videoMetaById && typeof parsed.videoMetaById === "object"
      ? parsed.videoMetaById
      : {};
    photoMetaById.value = parsed.photoMetaById && typeof parsed.photoMetaById === "object"
      ? parsed.photoMetaById
      : {};
    mediaIncludedFileIds.value = Array.isArray(parsed.mediaIncludedFileIds)
      ? parsed.mediaIncludedFileIds.map((id) => String(id))
      : [];
    mediaIncludedFolderIds.value = Array.isArray(parsed.mediaIncludedFolderIds)
      ? parsed.mediaIncludedFolderIds.map((id) => String(id))
      : [];
    mediaExcludedFileIds.value = Array.isArray(parsed.mediaExcludedFileIds)
      ? parsed.mediaExcludedFileIds.map((id) => String(id))
      : [];
    mediaExcludedFolderIds.value = Array.isArray(parsed.mediaExcludedFolderIds)
      ? parsed.mediaExcludedFolderIds.map((id) => String(id))
      : [];
    removedMediaSeries.value = Array.isArray(parsed.removedMediaSeries)
      ? parsed.removedMediaSeries.filter((entry) => entry && typeof entry === "object")
      : [];
    mediaLibraryAreas.value = Array.isArray(parsed.mediaLibraryAreas)
      ? parsed.mediaLibraryAreas.map(normalizeMediaLibraryArea).filter(Boolean)
      : [];
    photoIncludedFileIds.value = Array.isArray(parsed.photoIncludedFileIds)
      ? parsed.photoIncludedFileIds.map((id) => String(id))
      : [];
    photoIncludedFolderIds.value = Array.isArray(parsed.photoIncludedFolderIds)
      ? parsed.photoIncludedFolderIds.map((id) => String(id))
      : [];
    photoExcludedFileIds.value = Array.isArray(parsed.photoExcludedFileIds)
      ? parsed.photoExcludedFileIds.map((id) => String(id))
      : [];
    photoExcludedFolderIds.value = Array.isArray(parsed.photoExcludedFolderIds)
      ? parsed.photoExcludedFolderIds.map((id) => String(id))
      : [];
    mediaFavoriteIds.value = Array.isArray(parsed.mediaFavoriteIds)
      ? parsed.mediaFavoriteIds.map((id) => String(id))
      : [];
    mediaFavoriteSeriesIds.value = Array.isArray(parsed.mediaFavoriteSeriesIds)
      ? parsed.mediaFavoriteSeriesIds.map((id) => String(id))
      : [];
    photoFavoriteIds.value = Array.isArray(parsed.photoFavoriteIds)
      ? parsed.photoFavoriteIds.map((id) => String(id))
      : [];
    photoFavoriteAlbumIds.value = Array.isArray(parsed.photoFavoriteAlbumIds)
      ? parsed.photoFavoriteAlbumIds.map((id) => String(id))
      : [];
    mediaCollections.value = Array.isArray(parsed.mediaCollections)
      ? parsed.mediaCollections
      : [];
    photoAlbums.value = Array.isArray(parsed.photoAlbums)
      ? parsed.photoAlbums
      : [];
    const rawOverrides = parsed.seriesOverrides && typeof parsed.seriesOverrides === "object"
      ? parsed.seriesOverrides
      : {};
    seriesOverrides.value = {
      manualSeries: Array.isArray(rawOverrides.manualSeries) ? rawOverrides.manualSeries : [],
      cannotLink: Array.isArray(rawOverrides.cannotLink) ? rawOverrides.cannotLink : [],
      autoClassifyEnabled: rawOverrides.autoClassifyEnabled !== false,
    };
    const defaultPreferences = options.vaultDefaults
      ? DEFAULT_VAULT_MEDIA_PHOTO_PREFERENCES
      : DEFAULT_MEDIA_PHOTO_PREFERENCES;
    preferences.value = {
      ...defaultPreferences,
      ...(parsed.preferences || {}),
    };
  };

  const buildPersistedPayload = () => ({
    watchHistoryById: watchHistoryById.value,
    videoMetaById: videoMetaById.value,
    photoMetaById: photoMetaById.value,
    mediaIncludedFileIds: mediaIncludedFileIds.value,
    mediaIncludedFolderIds: mediaIncludedFolderIds.value,
    mediaExcludedFileIds: mediaExcludedFileIds.value,
    mediaExcludedFolderIds: mediaExcludedFolderIds.value,
    removedMediaSeries: removedMediaSeries.value,
    mediaLibraryAreas: mediaLibraryAreas.value,
    photoIncludedFileIds: photoIncludedFileIds.value,
    photoIncludedFolderIds: photoIncludedFolderIds.value,
    photoExcludedFileIds: photoExcludedFileIds.value,
    photoExcludedFolderIds: photoExcludedFolderIds.value,
    mediaFavoriteIds: mediaFavoriteIds.value,
    mediaFavoriteSeriesIds: mediaFavoriteSeriesIds.value,
    photoFavoriteIds: photoFavoriteIds.value,
    photoFavoriteAlbumIds: photoFavoriteAlbumIds.value,
    mediaCollections: mediaCollections.value,
    photoAlbums: photoAlbums.value,
    seriesOverrides: seriesOverrides.value,
    preferences: preferences.value,
  });

  const loadPersistedState = () => {
    if (typeof window === "undefined" || !window.localStorage) {
      applyParsedState(createEmptyPersistedState());
      cachedNormalPayload = buildPersistedPayload();
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey.value);
      if (!raw) {
        applyParsedState(createEmptyPersistedState());
        cachedNormalPayload = buildPersistedPayload();
        return;
      }
      const parsed = JSON.parse(raw) || {};
      applyParsedState(parsed);
      cachedNormalPayload = buildPersistedPayload();
    } catch {
      // Ignore corrupt storage
    }
  };

  const syncStateToBackend = async (immediate = false, targetScope = null, payloadSnapshot = null) => {
    const isAuthenticated = Boolean(authStore.user?.idx || authStore.user?.id || authStore.user?.email);
    if (!isAuthenticated) return;

    const resolvedScope = targetScope || (isVaultScope.value ? "vault" : "normal");
    const payload = payloadSnapshot || buildPersistedPayload();

    if (resolvedScope === "vault") {
      if (!secretFolderStore.vaultUnlocked) return;
      if (vaultSaveTimerId && typeof window !== "undefined") {
        window.clearTimeout(vaultSaveTimerId);
        vaultSaveTimerId = null;
      }
      const doSaveVault = async () => {
        if (!secretFolderStore.vaultUnlocked) return;
        try {
          await saveVaultMediaLibraryState(payload);
        } catch {
          // Ignore transient network errors; keep vault state in memory while unlocked
        }
      };
      if (immediate || typeof window === "undefined") {
        await doSaveVault();
      } else {
        vaultSaveTimerId = window.setTimeout(() => {
          vaultSaveTimerId = null;
          void doSaveVault();
        }, 300);
      }
      return;
    }

    if (normalSaveTimerId && typeof window !== "undefined") {
      window.clearTimeout(normalSaveTimerId);
      normalSaveTimerId = null;
    }

    const doSave = async () => {
      try {
        await saveMediaLibraryState(payload);
      } catch {
        // Offline or network error: localStorage still holds the state
      }
    };

    if (immediate || typeof window === "undefined") {
      await doSave();
    } else {
      normalSaveTimerId = window.setTimeout(() => {
        normalSaveTimerId = null;
        void doSave();
      }, 300);
    }
  };

  const savePersistedState = (options = {}) => {
    const targetScope = isVaultScope.value ? "vault" : "normal";
    const payload = buildPersistedPayload();

    if (targetScope === "vault") {
      cachedVaultPayload = payload;
      void syncStateToBackend(Boolean(options.immediate), "vault", payload);
      return;
    }

    cachedNormalPayload = payload;
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem(storageKey.value, JSON.stringify(payload));
      } catch {
        // Ignore storage quota errors
      }
    }
    void syncStateToBackend(Boolean(options.immediate), "normal", payload);
  };

  const fetchRemoteLibraryState = async () => {
    const isAuthenticated = Boolean(authStore.user?.idx || authStore.user?.id || authStore.user?.email);
    if (!isAuthenticated) return;
    try {
      const { state } = await fetchMediaLibraryState();
      if (state && typeof state === "object" && Object.keys(state).length > 0) {
        if (isVaultScope.value) {
          cachedNormalPayload = state;
        } else {
          applyParsedState(state);
          cachedNormalPayload = buildPersistedPayload();
        }
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(storageKey.value, JSON.stringify(cachedNormalPayload || state));
        }
      } else if (!isVaultScope.value) {
        // If backend is empty on first load and user already had local data, push local data to backend
        const currentPayload = buildPersistedPayload();
        const hasLocalDesignations =
          currentPayload.mediaIncludedFolderIds.length > 0 ||
          currentPayload.mediaIncludedFileIds.length > 0 ||
          currentPayload.mediaExcludedFolderIds.length > 0 ||
          currentPayload.mediaExcludedFileIds.length > 0 ||
          currentPayload.removedMediaSeries.length > 0 ||
          currentPayload.mediaLibraryAreas.length > 0 ||
          currentPayload.photoIncludedFolderIds.length > 0 ||
          currentPayload.photoIncludedFileIds.length > 0 ||
          currentPayload.photoExcludedFolderIds.length > 0 ||
          currentPayload.photoExcludedFileIds.length > 0 ||
          currentPayload.seriesOverrides.manualSeries.length > 0;
        if (hasLocalDesignations) {
          await saveMediaLibraryState(currentPayload);
        }
      }
      hasLoadedRemoteLibrary.value = true;
    } catch {
      // Fallback to localStorage seamlessly
    }
  };

  const fetchVaultRemoteLibraryState = async () => {
    const isAuthenticated = Boolean(authStore.user?.idx || authStore.user?.id || authStore.user?.email);
    if (!isAuthenticated || !secretFolderStore.vaultUnlocked) return;
    try {
      const { state } = await fetchVaultMediaLibraryState();
      if (!secretFolderStore.vaultUnlocked) {
        cachedVaultPayload = null;
        return;
      }
      if (state && typeof state === "object" && Object.keys(state).length > 0) {
        cachedVaultPayload = {
          ...createEmptyVaultPersistedState(),
          ...state,
          preferences: {
            ...DEFAULT_VAULT_MEDIA_PHOTO_PREFERENCES,
            ...(state.preferences || {}),
          },
        };
        if (isVaultScope.value) {
          applyParsedState(cachedVaultPayload, { vaultDefaults: true });
        }
      } else {
        cachedVaultPayload = createEmptyVaultPersistedState();
        if (isVaultScope.value) {
          applyParsedState(cachedVaultPayload, { vaultDefaults: true });
        }
      }
      hasLoadedRemoteVaultLibrary.value = true;
    } catch (error) {
      const status = error?.response?.status;
      if (status === 401 || status === 403 || status === 423) {
        cachedVaultPayload = null;
        hasLoadedRemoteVaultLibrary.value = false;
      }
    }
  };

  const setLibraryScope = (nextScope = "normal", options = {}) => {
    if (nextScope === "vault") {
      if (!secretFolderStore.vaultMode || !secretFolderStore.vaultUnlocked) {
        if (libraryScope.value !== "normal") {
          libraryScope.value = "normal";
          if (cachedNormalPayload) {
            applyParsedState(cachedNormalPayload);
          } else {
            loadPersistedState();
          }
        }
        return false;
      }
      if (libraryScope.value === "vault") {
        return true;
      }
      cachedNormalPayload = buildPersistedPayload();
      if (normalSaveTimerId && typeof window !== "undefined") {
        window.clearTimeout(normalSaveTimerId);
        normalSaveTimerId = null;
        void syncStateToBackend(true, "normal", cachedNormalPayload);
      }
      libraryScope.value = "vault";
      applyParsedState(cachedVaultPayload || createEmptyVaultPersistedState(), { vaultDefaults: true });
      return true;
    }

    if (libraryScope.value === "normal") {
      return true;
    }
    if (!options.skipVaultFlush && secretFolderStore.vaultUnlocked) {
      cachedVaultPayload = buildPersistedPayload();
      if (vaultSaveTimerId && typeof window !== "undefined") {
        window.clearTimeout(vaultSaveTimerId);
        vaultSaveTimerId = null;
        void syncStateToBackend(true, "vault", cachedVaultPayload);
      }
    } else if (vaultSaveTimerId && typeof window !== "undefined") {
      window.clearTimeout(vaultSaveTimerId);
      vaultSaveTimerId = null;
    }
    libraryScope.value = "normal";
    if (cachedNormalPayload) {
      applyParsedState(cachedNormalPayload);
    } else {
      loadPersistedState();
    }
    return true;
  };

  watch(storageKey, () => {
    hasLoadedRemoteLibrary.value = false;
    cachedNormalPayload = null;
    if (!isVaultScope.value) {
      loadPersistedState();
    }
  }, { immediate: true });

  // Unified live file map from useFileStore (owned + shared, or Vault-only in vault scope)
  const unifiedLiveFileMap = computed(() => {
    const map = new Map();
    const sources = isVaultScope.value
      ? [...(fileStore.vaultAllFiles || [])]
      : [
          ...(fileStore.allFiles || []),
          ...(fileStore.drivePageFiles || []),
          ...(fileStore.sharedFiles || []),
        ];

    for (const file of sources) {
      if (!file || file.id == null || file.isTrash || file.type === "folder") {
        continue;
      }
      if (!isVaultScope.value && (file.isVaultSpace || file.spaceType === "VAULT")) {
        continue;
      }
      if (isVaultScope.value && !(file.isVaultSpace || file.spaceType === "VAULT")) {
        continue;
      }
      const key = String(file.id);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, file);
      } else {
      const mergedEncrypted = Boolean(file.encrypted ?? existing.encrypted);
      const mergedEncryptionMode = String(
        file.encryptionMode || existing.encryptionMode || (mergedEncrypted ? "SERVER_ENVELOPE_V1" : "NONE"),
      ).toUpperCase();
      map.set(key, {
        ...existing,
        ...file,
        encrypted: mergedEncrypted,
        encryptionMode: mergedEncryptionMode,
        downloadUrl: file.downloadUrl || existing.downloadUrl || "",
        presignedDownloadUrl: file.presignedDownloadUrl || existing.presignedDownloadUrl || "",
        thumbnailUrl: mergedEncrypted ? "" : (file.thumbnailUrl || existing.thumbnailUrl || ""),
        thumbnailPresignedUrl: mergedEncrypted ? "" : (file.thumbnailPresignedUrl || existing.thumbnailPresignedUrl || ""),
      });
      }
    }

    return map;
  });

  // All non-trashed Drive folders (or Vault folders in vault scope) for selection UI and ancestor checks
  const allDriveFolders = computed(() => {
    const map = new Map();
    const sources = isVaultScope.value
      ? [...(fileStore.vaultAllFiles || [])]
      : [
          ...(fileStore.allFiles || []),
          ...(fileStore.drivePageFiles || []),
        ];
    for (const item of sources) {
      if (!item || item.id == null || item.isTrash || item.type !== "folder") {
        continue;
      }
      if (isVaultScope.value) {
        if (!(item.isVaultSpace || item.spaceType === "VAULT")) {
          continue;
        }
        if (item.pinEnabled && !secretFolderStore.isFolderUnlocked(item.id)) {
          continue;
        }
      } else if (item.isVaultSpace || item.spaceType === "VAULT" || item.hiddenFolder) {
        continue;
      }
      map.set(String(item.id), item);
    }
    const rootLabel = isVaultScope.value ? "비밀 폴더" : "홈";
    return Array.from(map.values()).map((folder) => {
      const crumbs = fileStore.getFolderPath(folder.id);
      const pathLabel = crumbs?.length
        ? [rootLabel, ...crumbs.map((c) => c.name)].join(" / ")
        : `${rootLabel} / ${folder.name}`;
      return {
        ...folder,
        idKey: String(folder.id),
        pathLabel,
      };
    });
  });

  const folderParentMap = computed(() => {
    const map = new Map();
    for (const folder of allDriveFolders.value) {
      map.set(String(folder.id), folder.parentId != null ? String(folder.parentId) : null);
    }
    return map;
  });

  // Check if a file is inside any of the includedFolderIds (including nested subfolders)
  const isFileInsideFolderSet = (file, folderIdSet) => {
    if (!file || file.parentId == null || !folderIdSet || folderIdSet.size === 0) {
      return false;
    }
    const visited = new Set();
    let cursor = String(file.parentId);
    while (cursor && !visited.has(cursor)) {
      if (folderIdSet.has(cursor)) {
        return true;
      }
      visited.add(cursor);
      cursor = folderParentMap.value.get(cursor) || null;
    }
    return false;
  };

  const isVideoFileRecord = (file) => {
    if (!file || file.type === "folder" || file.isTrash) return false;
    const ext = String(file.extension || file.fileFormat || "").toLowerCase();
    const mime = String(file.contentType || "").toLowerCase();
    return Boolean(file.isVideo || VIDEO_EXTENSIONS.has(ext) || mime.startsWith("video/"));
  };

  const isImageFileRecord = (file) => {
    if (!file || file.type === "folder" || file.isTrash) return false;
    const ext = String(file.extension || file.fileFormat || "").toLowerCase();
    const mime = String(file.contentType || "").toLowerCase();
    return Boolean(file.isImage || IMAGE_EXTENSIONS.has(ext) || mime.startsWith("image/"));
  };

  const isSubtitleFileRecord = (file) => {
    if (!file || file.type === "folder" || file.isTrash) return false;
    const ext = String(file.extension || file.fileFormat || "").toLowerCase();
    return SUBTITLE_EXTENSIONS.has(ext);
  };

  const mediaFavoriteSet = computed(() => new Set(mediaFavoriteIds.value.map((id) => String(id))));
  const mediaFavoriteSeriesSet = computed(() => new Set(mediaFavoriteSeriesIds.value.map((id) => String(id))));
  const photoFavoriteSet = computed(() => new Set(photoFavoriteIds.value.map((id) => String(id))));
  const photoFavoriteAlbumSet = computed(() => new Set(photoFavoriteAlbumIds.value.map((id) => String(id))));
  const mediaIncludedFileSet = computed(() => new Set(mediaIncludedFileIds.value.map((id) => String(id))));
  const mediaIncludedFolderSet = computed(() => new Set(mediaIncludedFolderIds.value.map((id) => String(id))));
  const mediaExcludedFileSet = computed(() => new Set(mediaExcludedFileIds.value.map((id) => String(id))));
  const mediaExcludedFolderSet = computed(() => new Set(mediaExcludedFolderIds.value.map((id) => String(id))));
  const mediaAreaFolderSet = computed(() => new Set(mediaLibraryAreas.value.map((area) => String(area.folderId))));
  const photoIncludedFileSet = computed(() => new Set(photoIncludedFileIds.value.map((id) => String(id))));
  const photoIncludedFolderSet = computed(() => new Set(photoIncludedFolderIds.value.map((id) => String(id))));
  const photoExcludedFileSet = computed(() => new Set(photoExcludedFileIds.value.map((id) => String(id))));
  const photoExcludedFolderSet = computed(() => new Set(photoExcludedFolderIds.value.map((id) => String(id))));

  // Also include any item that was explicitly added to a Media Collection or Photo Album or Favorite
  const collectionMemberSet = computed(() => {
    const set = new Set();
    for (const col of mediaCollections.value) {
      for (const id of col.itemIds || []) {
        set.add(String(id));
      }
    }
    return set;
  });

  const albumMemberSet = computed(() => {
    const set = new Set();
    for (const alb of photoAlbums.value) {
      for (const id of alb.photoIds || []) {
        set.add(String(id));
      }
    }
    return set;
  });

  const getFolderBreadcrumbText = (file) => {
    const vaultItem = Boolean(isVaultScope.value || file?.isVaultSpace || file?.spaceType === "VAULT");
    const rootLabel = vaultItem ? "비밀 폴더" : "홈";
    if (!file) return rootLabel;
    if (!vaultItem && file.sharedWithMe) {
      return file.sharedPath || "공유 문서함";
    }
    if (file.parentId == null) {
      return rootLabel;
    }
    const crumbs = fileStore.getFolderPath(file.parentId);
    if (!crumbs || !crumbs.length) {
      return file.location || rootLabel;
    }
    return [rootLabel, ...crumbs.map((folder) => folder.name)].join(" / ");
  };

  const enrichVideoItem = (file) => {
    const id = String(file.id);
    const history = watchHistoryById.value[id] || null;
    const meta = videoMetaById.value[id] || {};
    const durationSeconds = Number(meta.durationSeconds || history?.durationSeconds || 0) || 0;
    const positionSeconds = Number(history?.positionSeconds || 0) || 0;
    const progressPercent = durationSeconds > 0
      ? Math.min(100, Math.round((positionSeconds / durationSeconds) * 100))
      : Number(history?.progressPercent || 0);
    const completed = Boolean(history?.completed || progressPercent >= COMPLETION_THRESHOLD_PERCENT);
    const watchState = completed
      ? "completed"
      : positionSeconds >= 5 || progressPercent >= 2
        ? "watching"
        : "unwatched";

    const width = Number(meta.width || 0) || 0;
    const height = Number(meta.height || 0) || 0;
    const resolutionLabel = meta.resolutionLabel || classifyResolutionLabel(width, height);

    const baseTitle = extractBaseFileName(file.name || file.fileOriginName || "");
    const matchingSubtitles = [];
    for (const candidate of unifiedLiveFileMap.value.values()) {
      if (!isSubtitleFileRecord(candidate)) continue;
      const sameParent = String(candidate.parentId ?? "") === String(file.parentId ?? "");
      const candidateBase = extractBaseFileName(candidate.name || "");
      if (sameParent && (candidateBase.toLowerCase() === baseTitle.toLowerCase() || candidateBase.toLowerCase().startsWith(baseTitle.toLowerCase()))) {
        matchingSubtitles.push(candidate);
      }
    }

    const isInMediaArea = isFileInsideFolderSet(file, mediaAreaFolderSet.value);
    const isManuallyIncluded =
      mediaIncludedFileSet.value.has(id) ||
      isFileInsideFolderSet(file, mediaIncludedFolderSet.value) ||
      isInMediaArea ||
      collectionMemberSet.value.has(id) ||
      mediaFavoriteSet.value.has(id) ||
      Boolean(history?.lastWatchedAt);

    return {
      ...file,
      id: file.id,
      idKey: id,
      mediaKind: "video",
      displayTitle: extractBaseFileName(file.name || file.fileOriginName || "제목 없는 동영상"),
      durationSeconds,
      durationLabel: durationSeconds > 0 ? formatDurationClock(durationSeconds) : "",
      durationKoreanLabel: durationSeconds > 0 ? formatDurationKorean(durationSeconds) : "",
      positionSeconds,
      positionLabel: positionSeconds > 0 ? formatDurationClock(positionSeconds) : "00:00",
      remainingLabel: durationSeconds > positionSeconds
        ? `${formatDurationKorean(durationSeconds - positionSeconds)} 남음`
        : "",
      progressPercent,
      completed,
      watchState,
      dismissedFromContinue: Boolean(history?.dismissedFromContinue),
      lastWatchedAt: history?.lastWatchedAt || null,
      lastWatchedAtMs: history?.lastWatchedAt ? new Date(history.lastWatchedAt).getTime() : 0,
      watchCount: Number(history?.watchCount || 0) || 0,
      width,
      height,
      resolutionLabel,
      isFavorite: mediaFavoriteSet.value.has(id),
      isManuallyIncluded,
      folderPathLabel: getFolderBreadcrumbText(file),
      matchingSubtitles,
    };
  };

  const enrichPhotoItem = (file) => {
    const id = String(file.id);
    const meta = photoMetaById.value[id] || {};
    const inferredDate = inferCaptureDateFromFilename(file.name || file.fileOriginName || "");
    const captureDate =
      meta.captureDate ||
      file?.raw?.exifDate ||
      file?.raw?.captureDate ||
      inferredDate ||
      file.updatedAt ||
      file.uploadDate ||
      null;
    const captureDateObj = captureDate ? new Date(captureDate) : null;
    const validCaptureMs = captureDateObj && !Number.isNaN(captureDateObj.getTime())
      ? captureDateObj.getTime()
      : (file.uploadedAtMs || file.lastModifiedMs || Date.now());

    const effectiveDateMs = preferences.value.photoDateBasis === "upload"
      ? (file.uploadedAtMs || file.lastModifiedMs || validCaptureMs)
      : validCaptureMs;
    const effectiveDateObj = new Date(effectiveDateMs);
    const year = effectiveDateObj.getFullYear();
    const month = effectiveDateObj.getMonth() + 1;
    const day = effectiveDateObj.getDate();
    const yearMonthKey = `${year}-${String(month).padStart(2, "0")}`;
    const yearMonthLabel = `${year}년 ${month}월`;
    const dayKey = `${yearMonthKey}-${String(day).padStart(2, "0")}`;
    const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"];
    const dayLabel = `${month}월 ${day}일 (${weekdayNames[effectiveDateObj.getDay()]}요일)`;

    const width = Number(meta.width || 0) || 0;
    const height = Number(meta.height || 0) || 0;
    const isScreenshot = isLikelyScreenshotOrGraphic(file);

    const isManuallyIncluded =
      photoIncludedFileSet.value.has(id) ||
      isFileInsideFolderSet(file, photoIncludedFolderSet.value) ||
      albumMemberSet.value.has(id) ||
      photoFavoriteSet.value.has(id);

    return {
      ...file,
      id: file.id,
      idKey: id,
      mediaKind: "image",
      displayTitle: extractBaseFileName(file.name || file.fileOriginName || "사진"),
      captureDate: new Date(validCaptureMs).toISOString(),
      effectiveDateMs,
      yearMonthKey,
      yearMonthLabel,
      dayKey,
      dayLabel,
      width,
      height,
      dimensionsLabel: width > 0 && height > 0 ? `${width} × ${height}` : "",
      cameraModel: meta.cameraModel || file?.raw?.cameraModel || "",
      gpsLabel: meta.gpsLabel || file?.raw?.gpsLabel || "",
      isScreenshot,
      photoCategory: isScreenshot ? "screenshot" : "camera",
      isFavorite: photoFavoriteSet.value.has(id),
      isMediaFavorite: mediaFavoriteSet.value.has(id),
      isManuallyIncluded,
      folderPathLabel: getFolderBreadcrumbText(file),
    };
  };

  // Full candidate pools in Drive (used when picking files from Drive or when sourceMode === 'all')
  const candidateVideos = computed(() => {
    const list = [];
    for (const file of unifiedLiveFileMap.value.values()) {
      if (file.lockedFile) continue;
      if (isVideoFileRecord(file)) {
        list.push(enrichVideoItem(file));
      }
    }
    return list.sort((left, right) => {
      const rightTime = right.uploadedAtMs || right.lastModifiedMs || 0;
      const leftTime = left.uploadedAtMs || left.lastModifiedMs || 0;
      return rightTime - leftTime;
    });
  });

  const candidatePhotos = computed(() => {
    const list = [];
    for (const file of unifiedLiveFileMap.value.values()) {
      if (file.lockedFile) continue;
      if (isImageFileRecord(file)) {
        list.push(enrichPhotoItem(file));
      }
    }
    return list.sort((left, right) => right.effectiveDateMs - left.effectiveDateMs);
  });

  const isVideoExcludedFromMedia = (file) => {
    if (!file) return false;
    const idKey = String(file.id ?? "");
    if (mediaExcludedFileSet.value.has(idKey)) {
      return true;
    }
    return isFileInsideFolderSet(file, mediaExcludedFolderSet.value);
  };

  const isPhotoExcludedFromPhotos = (file) => {
    if (!file) return false;
    const idKey = String(file.id ?? "");
    if (photoExcludedFileSet.value.has(idKey)) {
      return true;
    }
    return isFileInsideFolderSet(file, photoExcludedFolderSet.value);
  };

  // Active Media Videos (respecting exclusions and preferences.mediaSourceMode: 'manual' vs 'all')
  const allVideos = computed(() => {
    const activeCandidates = candidateVideos.value.filter((video) => !isVideoExcludedFromMedia(video));
    if (preferences.value.mediaSourceMode === "all") {
      return activeCandidates;
    }
    return activeCandidates.filter((video) => video.isManuallyIncluded);
  });

  // Active Photos (respecting exclusions and preferences.photoSourceMode: 'manual' vs 'all')
  const allPhotos = computed(() => {
    const activeCandidates = candidatePhotos.value.filter((photo) => !isPhotoExcludedFromPhotos(photo));
    if (preferences.value.photoSourceMode === "all") {
      return activeCandidates;
    }
    return activeCandidates.filter((photo) => photo.isManuallyIncluded);
  });

  const removedSeriesVirtualFileSet = computed(() => {
    const set = new Set();
    for (const entry of removedMediaSeries.value || []) {
      const folderIds = Array.isArray(entry?.folderIds) ? entry.folderIds : [];
      const virtualIds = Array.isArray(entry?.virtualFileIds)
        ? entry.virtualFileIds
        : folderIds.length === 0
          ? (entry?.fileIds || [])
          : [];
      for (const id of virtualIds) {
        if (id != null) set.add(String(id));
      }
    }
    return set;
  });

  const excludedIndividualMediaVideos = computed(() =>
    candidateVideos.value.filter((video) => {
      const idKey = String(video.id ?? "");
      return mediaExcludedFileSet.value.has(idKey) && !removedSeriesVirtualFileSet.value.has(idKey);
    }),
  );

  const excludedPhotos = computed(() =>
    candidatePhotos.value.filter((photo) => isPhotoExcludedFromPhotos(photo)),
  );

  const excludedPhotoFolders = computed(() =>
    allDriveFolders.value.filter((folder) => photoExcludedFolderSet.value.has(String(folder.id))),
  );

  const candidateVideoById = computed(() => {
    const map = new Map();
    for (const video of candidateVideos.value) {
      map.set(String(video.id), video);
    }
    return map;
  });

  const candidatePhotoById = computed(() => {
    const map = new Map();
    for (const photo of candidatePhotos.value) {
      map.set(String(photo.id), photo);
    }
    return map;
  });

  const videoById = computed(() => {
    const map = new Map();
    for (const video of allVideos.value) {
      map.set(String(video.id), video);
    }
    return map;
  });

  const photoById = computed(() => {
    const map = new Map();
    for (const photo of allPhotos.value) {
      map.set(String(photo.id), photo);
    }
    return map;
  });

  // Lookup any video or photo by ID (even if opened directly from Drive)
  const getMediaItemById = (fileId) => {
    const key = String(fileId ?? "");
    return candidateVideoById.value.get(key) || candidatePhotoById.value.get(key) || null;
  };

  const pruneRemovedSeriesEntries = ({ folderIds = [], fileIds = [] } = {}) => {
    const folderSet = new Set(folderIds.map((id) => String(id)));
    const fileSet = new Set(fileIds.map((id) => String(id)));
    if (!folderSet.size && !fileSet.size) return;

    mediaExcludedFolderIds.value = mediaExcludedFolderIds.value.filter((id) => !folderSet.has(String(id)));
    mediaExcludedFileIds.value = mediaExcludedFileIds.value.filter((id) => !fileSet.has(String(id)));
    removedMediaSeries.value = removedMediaSeries.value
      .map((entry) => {
        const nextFolders = (entry.folderIds || []).filter((id) => !folderSet.has(String(id)));
        const baseVirtual = Array.isArray(entry.virtualFileIds)
          ? entry.virtualFileIds
          : entry.folderIds?.length
            ? []
            : (entry.fileIds || []);
        const nextVirtual = baseVirtual.filter((id) => !fileSet.has(String(id)));
        const nextFiles = (entry.fileIds || []).filter((id) => !fileSet.has(String(id)));
        return {
          ...entry,
          folderIds: nextFolders,
          virtualFileIds: nextVirtual,
          fileIds: nextFiles,
        };
      })
      .filter((entry) => entry.folderIds.length > 0 || entry.virtualFileIds.length > 0);
  };

  // --- Inclusion / Exclusion Management (Media & Photos Library Scope) ---
  const addMediaFiles = (fileIds = []) => {
    const keys = fileIds.map((id) => String(id)).filter(Boolean);
    if (!keys.length) return;
    mediaIncludedFileIds.value = [...new Set([...keys, ...mediaIncludedFileIds.value])];
    pruneRemovedSeriesEntries({ fileIds: keys });
    savePersistedState();
  };

  const removeMediaFiles = (fileIds = []) => {
    const removeSet = new Set(fileIds.map((id) => String(id)));
    mediaIncludedFileIds.value = mediaIncludedFileIds.value.filter((id) => !removeSet.has(String(id)));
    mediaFavoriteIds.value = mediaFavoriteIds.value.filter((id) => !removeSet.has(String(id)));
    const nextHistory = { ...watchHistoryById.value };
    for (const id of removeSet) {
      delete nextHistory[id];
    }
    watchHistoryById.value = nextHistory;
    savePersistedState();
  };

  const toggleMediaFolderInclusion = (folderId) => {
    const key = String(folderId ?? "");
    if (!key) return false;
    const exists = mediaIncludedFolderSet.value.has(key);
    mediaIncludedFolderIds.value = exists
      ? mediaIncludedFolderIds.value.filter((id) => String(id) !== key)
      : [key, ...mediaIncludedFolderIds.value];
    if (!exists) {
      pruneRemovedSeriesEntries({ folderIds: [key] });
    }
    savePersistedState();
    return !exists;
  };

  const setMediaIncludedFolders = (folderIds = []) => {
    const cleanIds = [...new Set(folderIds.map((id) => String(id)).filter(Boolean))];
    mediaIncludedFolderIds.value = cleanIds;
    if (cleanIds.length > 0) {
      pruneRemovedSeriesEntries({ folderIds: cleanIds });
    }
    savePersistedState();
  };

  const addPhotoFiles = (fileIds = []) => {
    const keys = fileIds.map((id) => String(id)).filter(Boolean);
    if (!keys.length) return;
    const keySet = new Set(keys);
    photoIncludedFileIds.value = [...new Set([...keys, ...photoIncludedFileIds.value])];
    photoExcludedFileIds.value = photoExcludedFileIds.value.filter((id) => !keySet.has(String(id)));
    savePersistedState();
  };

  const removePhotoFiles = (fileIds = []) => {
    const removeSet = new Set(fileIds.map((id) => String(id)));
    photoIncludedFileIds.value = photoIncludedFileIds.value.filter((id) => !removeSet.has(String(id)));
    photoFavoriteIds.value = photoFavoriteIds.value.filter((id) => !removeSet.has(String(id)));
    savePersistedState();
  };

  const togglePhotoFolderInclusion = (folderId) => {
    const key = String(folderId ?? "");
    if (!key) return false;
    const exists = photoIncludedFolderSet.value.has(key);
    photoIncludedFolderIds.value = exists
      ? photoIncludedFolderIds.value.filter((id) => String(id) !== key)
      : [key, ...photoIncludedFolderIds.value];
    if (!exists) {
      photoExcludedFolderIds.value = photoExcludedFolderIds.value.filter((id) => String(id) !== key);
    }
    savePersistedState();
    return !exists;
  };

  const setPhotoIncludedFolders = (folderIds = []) => {
    const cleanIds = [...new Set(folderIds.map((id) => String(id)).filter(Boolean))];
    const cleanSet = new Set(cleanIds);
    photoIncludedFolderIds.value = cleanIds;
    photoExcludedFolderIds.value = photoExcludedFolderIds.value.filter((id) => !cleanSet.has(String(id)));
    savePersistedState();
  };

  const excludeMediaFiles = (fileIds = []) => {
    const keys = (Array.isArray(fileIds) ? fileIds : [fileIds])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean);
    if (!keys.length) return [];
    const excludeSet = new Set(keys);
    mediaExcludedFileIds.value = [...new Set([...keys, ...mediaExcludedFileIds.value])];
    mediaIncludedFileIds.value = mediaIncludedFileIds.value.filter((id) => !excludeSet.has(String(id)));
    savePersistedState({ immediate: true });
    return keys;
  };

  const restoreExcludedMediaFiles = (fileIds = []) => {
    const keys = (Array.isArray(fileIds) ? fileIds : [fileIds])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean);
    if (!keys.length) return 0;
    const keySet = new Set(keys);
    mediaExcludedFileIds.value = mediaExcludedFileIds.value.filter((id) => !keySet.has(String(id)));
    if (preferences.value.mediaSourceMode === "manual") {
      mediaIncludedFileIds.value = [...new Set([...keys, ...mediaIncludedFileIds.value])];
    }
    savePersistedState({ immediate: true });
    return keys.length;
  };

  const toggleMediaFolderExclusion = (folderId) => {
    const key = String(folderId ?? "").trim();
    if (!key) return false;
    const isExcluded = mediaExcludedFolderSet.value.has(key);
    mediaExcludedFolderIds.value = isExcluded
      ? mediaExcludedFolderIds.value.filter((id) => String(id) !== key)
      : [key, ...mediaExcludedFolderIds.value];
    if (!isExcluded) {
      mediaIncludedFolderIds.value = mediaIncludedFolderIds.value.filter((id) => String(id) !== key);
    }
    savePersistedState({ immediate: true });
    return !isExcluded;
  };

  const excludePhotoFiles = (fileIds = []) => {
    const keys = (Array.isArray(fileIds) ? fileIds : [fileIds])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean);
    if (!keys.length) return [];
    const excludeSet = new Set(keys);
    photoExcludedFileIds.value = [...new Set([...keys, ...photoExcludedFileIds.value])];
    photoIncludedFileIds.value = photoIncludedFileIds.value.filter((id) => !excludeSet.has(String(id)));

    if (activeLightboxPhotoId.value && excludeSet.has(String(activeLightboxPhotoId.value))) {
      const nextPool = activeLightboxPoolIds.value.filter((id) => !excludeSet.has(String(id)));
      if (nextPool.length > 0) {
        const oldIdx = activeLightboxPoolIds.value.indexOf(String(activeLightboxPhotoId.value));
        const nextIdx = Math.min(Math.max(0, oldIdx), nextPool.length - 1);
        activeLightboxPoolIds.value = nextPool;
        activeLightboxPhotoId.value = nextPool[nextIdx];
      } else {
        closePhotoLightbox();
      }
    }

    savePersistedState({ immediate: true });
    return keys;
  };

  const restoreExcludedPhotoFiles = (fileIds = []) => {
    const keys = (Array.isArray(fileIds) ? fileIds : [fileIds])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean);
    if (!keys.length) return 0;
    const keySet = new Set(keys);
    photoExcludedFileIds.value = photoExcludedFileIds.value.filter((id) => !keySet.has(String(id)));
    if (preferences.value.photoSourceMode === "manual") {
      photoIncludedFileIds.value = [...new Set([...keys, ...photoIncludedFileIds.value])];
    }
    savePersistedState({ immediate: true });
    return keys.length;
  };

  const togglePhotoFolderExclusion = (folderId) => {
    const key = String(folderId ?? "").trim();
    if (!key) return false;
    const isExcluded = photoExcludedFolderSet.value.has(key);
    photoExcludedFolderIds.value = isExcluded
      ? photoExcludedFolderIds.value.filter((id) => String(id) !== key)
      : [key, ...photoExcludedFolderIds.value];
    if (!isExcluded) {
      photoIncludedFolderIds.value = photoIncludedFolderIds.value.filter((id) => String(id) !== key);
    }
    savePersistedState({ immediate: true });
    return !isExcluded;
  };

  const restoreExcludedPhotoFolder = (folderId) => {
    const key = String(folderId ?? "").trim();
    if (!key) return false;
    photoExcludedFolderIds.value = photoExcludedFolderIds.value.filter((id) => String(id) !== key);
    if (preferences.value.photoSourceMode === "manual") {
      photoIncludedFolderIds.value = [...new Set([key, ...photoIncludedFolderIds.value])];
    }
    savePersistedState({ immediate: true });
    return true;
  };

  // Continue watching list: watched >= 5s or >= 2%, not completed, not dismissed
  const continueWatchingVideos = computed(() => {
    if (!preferences.value.enableContinueWatching) {
      return [];
    }
    return allVideos.value
      .filter((video) => (
        !video.completed &&
        !video.dismissedFromContinue &&
        (video.positionSeconds >= 5 || video.progressPercent >= 2)
      ))
      .sort((left, right) => (right.lastWatchedAtMs || 0) - (left.lastWatchedAtMs || 0));
  });

  // Recently watched videos (any video with lastWatchedAtMs > 0)
  const recentlyWatchedVideos = computed(() => {
    return allVideos.value
      .filter((video) => video.lastWatchedAtMs > 0)
      .sort((left, right) => right.lastWatchedAtMs - left.lastWatchedAtMs);
  });

  // Recently added videos
  const recentlyAddedVideos = computed(() => {
    return [...allVideos.value].slice(0, 20);
  });

  // Favorite media items (videos + any favorited collection images)
  const favoriteMediaItems = computed(() => {
    const items = [];
    for (const id of mediaFavoriteIds.value) {
      const item = getMediaItemById(id);
      if (item && !isVideoExcludedFromMedia(item)) {
        items.push(item);
      }
    }
    return items;
  });

  // Favorite photos
  const favoritePhotos = computed(() => {
    return candidatePhotos.value.filter((photo) => photo.isFavorite && !isPhotoExcludedFromPhotos(photo));
  });

  // Enriched Media Collections (automatically filtering out trashed/missing/excluded files)
  const resolvedMediaCollections = computed(() => {
    return mediaCollections.value.map((collection) => {
      const items = (collection.itemIds || [])
        .map((id) => getMediaItemById(id))
        .filter((item) => item && !isVideoExcludedFromMedia(item));
      const videoCount = items.filter((item) => item.mediaKind === "video").length;
      const imageCount = items.filter((item) => item.mediaKind === "image").length;
      const totalDurationSeconds = items.reduce(
        (sum, item) => sum + (Number(item.durationSeconds) || 0),
        0,
      );
      const explicitCover = collection.coverFileId ? getMediaItemById(collection.coverFileId) : null;
      const coverItem = (explicitCover && !isVideoExcludedFromMedia(explicitCover)) ? explicitCover : (items[0] || null);

      return {
        ...collection,
        items,
        itemCount: items.length,
        videoCount,
        imageCount,
        totalDurationSeconds,
        totalDurationLabel: totalDurationSeconds > 0 ? formatDurationKorean(totalDurationSeconds) : "",
        coverItem,
      };
    });
  });

  // Enriched Photo Albums (automatically filtering out trashed/missing/excluded files)
  const resolvedPhotoAlbums = computed(() => {
    return photoAlbums.value.map((album) => {
      const photos = (album.photoIds || [])
        .map((id) => candidatePhotoById.value.get(String(id)))
        .filter((photo) => photo && !isPhotoExcludedFromPhotos(photo));
      const explicitCover = album.coverFileId ? candidatePhotoById.value.get(String(album.coverFileId)) : null;
      const coverPhoto = (explicitCover && !isPhotoExcludedFromPhotos(explicitCover)) ? explicitCover : (photos[0] || null);

      let dateRangeLabel = "";
      if (photos.length > 0) {
        const timestamps = photos.map((p) => p.effectiveDateMs).filter(Boolean);
        if (timestamps.length > 0) {
          const minDate = new Date(Math.min(...timestamps));
          const maxDate = new Date(Math.max(...timestamps));
          const fmt = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
          const minStr = fmt(minDate);
          const maxStr = fmt(maxDate);
          dateRangeLabel = minStr === maxStr ? minStr : `${minStr} ~ ${maxStr}`;
        }
      }

      return {
        ...album,
        photos,
        photoCount: photos.length,
        coverPhoto,
        dateRangeLabel,
        isFavorite: photoFavoriteAlbumSet.value.has(String(album.id)),
      };
    });
  });

  const favoritePhotoAlbums = computed(() =>
    resolvedPhotoAlbums.value.filter((album) => album.isFavorite),
  );

  const totalPhotoFavoritesCount = computed(
    () => favoritePhotos.value.length + favoritePhotoAlbums.value.length,
  );

  const folderByIdMap = computed(() => {
    const map = new Map();
    for (const folder of allDriveFolders.value) {
      map.set(String(folder.id), folder);
    }
    return map;
  });

  // Group active videos by their immediate parent folder (each folder = 1 season/unit)
  const activeMediaFolderUnits = computed(() => {
    const folderVideosMap = new Map();
    for (const video of allVideos.value) {
      const folderKey = video.parentId != null
        ? String(video.parentId)
        : (video.sharedWithMe ? "__shared__" : "__root__");
      if (!folderVideosMap.has(folderKey)) {
        folderVideosMap.set(folderKey, []);
      }
      folderVideosMap.get(folderKey).push(video);
    }

    const units = [];
    for (const [folderKey, videos] of folderVideosMap.entries()) {
      const folderRecord = folderByIdMap.value.get(folderKey);
      let folderName = folderRecord?.name || "";
      if (!folderName) {
        if (folderKey === "__root__") {
          folderName = videos.length === 1 ? videos[0].displayTitle : "최상위 보관 영상";
        } else if (folderKey === "__shared__") {
          folderName = "공유받은 영상";
        } else {
          const pathParts = String(videos[0]?.folderPathLabel || "").split(" / ").filter(Boolean);
          folderName = pathParts[pathParts.length - 1] || videos[0]?.displayTitle || `폴더 #${folderKey}`;
        }
      }

      units.push({
        folderId: folderKey,
        name: folderName,
        parentId: folderRecord?.parentId ?? null,
        pathLabel: folderRecord?.pathLabel || videos[0]?.folderPathLabel || (isVaultScope.value ? "비밀 폴더" : "홈"),
        videos,
      });
    }
    return units;
  });

  // Series & Season Classification (Auto + User Overrides)
  const mediaSeriesClassification = computed(() => {
    return classifyMediaSeries({
      folderUnits: activeMediaFolderUnits.value,
      folderById: folderByIdMap.value,
      seriesOverrides: seriesOverrides.value,
      mediaAreas: mediaLibraryAreas.value,
    });
  });

  const resolvedMediaSeries = computed(() =>
    (mediaSeriesClassification.value.series || []).map((series) => ({
      ...series,
      isFavorite: mediaFavoriteSeriesSet.value.has(String(series.id)),
    })),
  );
  const favoriteMediaSeries = computed(() =>
    resolvedMediaSeries.value.filter((series) => series.isFavorite),
  );
  const totalMediaFavoritesCount = computed(
    () => favoriteMediaItems.value.length + favoriteMediaSeries.value.length,
  );
  const autoGroupedMediaSeries = computed(() => mediaSeriesClassification.value.reviewCandidates || []);

  const getImmediateChildFolderUnderAncestor = (folderId, ancestorId) => {
    const ancestorKey = String(ancestorId ?? "");
    let currentKey = folderId != null ? String(folderId) : "";
    if (!ancestorKey || !currentKey || currentKey === ancestorKey) return null;
    const visited = new Set();
    while (currentKey && !visited.has(currentKey)) {
      visited.add(currentKey);
      const record = folderByIdMap.value.get(currentKey);
      if (!record) return null;
      const parentKey = record.parentId != null ? String(record.parentId) : "";
      if (parentKey === ancestorKey) {
        return record;
      }
      currentKey = parentKey;
    }
    return null;
  };

  const resolvedMediaAreas = computed(() => {
    const countsByAreaId = new Map();
    for (const series of resolvedMediaSeries.value) {
      const areaId = series.areaFolderId ? String(series.areaFolderId) : "";
      if (!areaId) continue;
      if (!countsByAreaId.has(areaId)) {
        countsByAreaId.set(areaId, { seriesCount: 0, episodeCount: 0 });
      }
      const stat = countsByAreaId.get(areaId);
      stat.seriesCount += 1;
      stat.episodeCount += series.episodeCount || 0;
    }

    const directChildrenCountByAreaId = new Map();
    for (const folder of allDriveFolders.value) {
      const parentKey = folder.parentId != null ? String(folder.parentId) : "";
      if (!parentKey || !mediaAreaFolderSet.value.has(parentKey)) continue;
      directChildrenCountByAreaId.set(parentKey, (directChildrenCountByAreaId.get(parentKey) || 0) + 1);
    }

    return mediaLibraryAreas.value.map((area) => {
      const key = String(area.folderId);
      const folder = folderByIdMap.value.get(key);
      const stat = countsByAreaId.get(key) || { seriesCount: 0, episodeCount: 0 };
      return {
        ...area,
        folderId: key,
        name: folder?.name || area.name || "이름 없는 폴더",
        pathLabel: folder?.pathLabel || area.pathLabel || folder?.name || key,
        isMissing: Boolean(folderByIdMap.value.size > 0 && !folder),
        seriesCount: stat.seriesCount,
        episodeCount: stat.episodeCount,
        directChildFolderCount: directChildrenCountByAreaId.get(key) || 0,
      };
    });
  });

  const previewMediaAreaFolder = (folderId) => {
    const areaKey = String(folderId ?? "").trim();
    if (!areaKey) return null;
    const areaFolder = folderByIdMap.value.get(areaKey);
    const registeredArea = mediaLibraryAreas.value.find((area) => String(area.folderId) === areaKey) || null;

    const childBucketById = new Map();
    for (const folder of allDriveFolders.value) {
      const parentKey = folder.parentId != null ? String(folder.parentId) : "";
      if (parentKey === areaKey) {
        const childKey = String(folder.id);
        childBucketById.set(childKey, {
          folderId: childKey,
          name: folder.name || "폴더",
          pathLabel: folder.pathLabel || folder.name || "",
          subfolderCount: 0,
          videoCount: 0,
          excludedVideoCount: 0,
          sampleVideoNames: [],
        });
      }
    }

    for (const folder of allDriveFolders.value) {
      const parentKey = folder.parentId != null ? String(folder.parentId) : "";
      if (!parentKey || parentKey === areaKey) continue;
      const rootChild = getImmediateChildFolderUnderAncestor(folder.id, areaKey);
      if (rootChild) {
        const bucket = childBucketById.get(String(rootChild.id));
        if (bucket) bucket.subfolderCount += 1;
      }
    }

    let directRootVideoCount = 0;
    let excludedVideoCount = 0;
    let totalVideoCount = 0;

    for (const video of candidateVideos.value) {
      const parentKey = video.parentId != null ? String(video.parentId) : "";
      const isExcluded = isVideoExcludedFromMedia(video);
      if (parentKey === areaKey) {
        if (isExcluded) {
          excludedVideoCount += 1;
        } else {
          directRootVideoCount += 1;
          totalVideoCount += 1;
        }
        continue;
      }

      const directBucket =
        childBucketById.get(parentKey) ||
        (() => {
          const rootChild = getImmediateChildFolderUnderAncestor(parentKey, areaKey);
          return rootChild ? childBucketById.get(String(rootChild.id)) : null;
        })();
      if (!directBucket) continue;

      if (isExcluded) {
        directBucket.excludedVideoCount += 1;
        excludedVideoCount += 1;
      } else {
        directBucket.videoCount += 1;
        totalVideoCount += 1;
        if (directBucket.sampleVideoNames.length < 2) {
          directBucket.sampleVideoNames.push(video.name || "");
        }
      }
    }

    const allChildFolders = Array.from(childBucketById.values()).sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), "ko-KR", { numeric: true }),
    );
    const childSeries = allChildFolders.filter((entry) => entry.videoCount > 0);

    return {
      folderId: areaKey,
      name: areaFolder?.name || registeredArea?.name || "폴더",
      pathLabel: areaFolder?.pathLabel || registeredArea?.pathLabel || areaFolder?.name || "",
      isRegistered: Boolean(registeredArea),
      groupingMode: registeredArea?.groupingMode || "children-as-series",
      childFolders: allChildFolders,
      childSeries,
      activeChildSeriesCount: childSeries.length,
      emptyChildFolderCount: allChildFolders.length - childSeries.length,
      directRootVideoCount,
      totalVideoCount,
      excludedVideoCount,
    };
  };

  const isMediaAreaFolder = (folderId) => {
    const key = String(folderId ?? "").trim();
    return Boolean(key && mediaAreaFolderSet.value.has(key));
  };

  const addMediaLibraryArea = (folderId, options = {}) => {
    const key = String(folderId ?? "").trim();
    if (!key) return null;
    const folder = folderByIdMap.value.get(key);
    const groupingMode = MEDIA_AREA_GROUPING_MODES.has(options.groupingMode)
      ? options.groupingMode
      : "children-as-series";
    const idx = mediaLibraryAreas.value.findIndex((area) => String(area.folderId) === key);
    if (idx !== -1) {
      const updated = normalizeMediaLibraryArea({
        ...mediaLibraryAreas.value[idx],
        name: folder?.name || options.name || mediaLibraryAreas.value[idx].name,
        pathLabel: folder?.pathLabel || options.pathLabel || mediaLibraryAreas.value[idx].pathLabel,
        groupingMode: options.groupingMode ? groupingMode : mediaLibraryAreas.value[idx].groupingMode,
      });
      mediaLibraryAreas.value = [
        ...mediaLibraryAreas.value.slice(0, idx),
        updated,
        ...mediaLibraryAreas.value.slice(idx + 1),
      ];
      savePersistedState({ immediate: true });
      return updated;
    }

    const entry = normalizeMediaLibraryArea({
      folderId: key,
      name: folder?.name || options.name || "미디어 영역",
      pathLabel: folder?.pathLabel || options.pathLabel || folder?.name || key,
      groupingMode,
      addedAt: new Date().toISOString(),
    });
    mediaLibraryAreas.value = [...mediaLibraryAreas.value, entry];
    if (mediaExcludedFolderSet.value.has(key)) {
      mediaExcludedFolderIds.value = mediaExcludedFolderIds.value.filter((id) => String(id) !== key);
      pruneRemovedSeriesEntries({ folderIds: [key] });
    }
    savePersistedState({ immediate: true });
    return entry;
  };

  const updateMediaLibraryArea = (folderId, patch = {}) => {
    const key = String(folderId ?? "").trim();
    if (!key) return null;
    const idx = mediaLibraryAreas.value.findIndex((area) => String(area.folderId) === key);
    if (idx === -1) return null;
    const updated = normalizeMediaLibraryArea({
      ...mediaLibraryAreas.value[idx],
      ...patch,
      folderId: key,
    });
    mediaLibraryAreas.value = [
      ...mediaLibraryAreas.value.slice(0, idx),
      updated,
      ...mediaLibraryAreas.value.slice(idx + 1),
    ];
    savePersistedState({ immediate: true });
    return updated;
  };

  const removeMediaLibraryArea = (folderId) => {
    const key = String(folderId ?? "").trim();
    if (!key) return;
    mediaLibraryAreas.value = mediaLibraryAreas.value.filter((area) => String(area.folderId) !== key);
    savePersistedState({ immediate: true });
  };

  const resolveSeriesInputList = (seriesOrIds) => {
    const items = Array.isArray(seriesOrIds) ? seriesOrIds : [seriesOrIds];
    const resolved = [];
    const seen = new Set();
    for (const item of items) {
      if (!item) continue;
      const obj = typeof item === "object" && (Array.isArray(item.seasons) || Array.isArray(item.folderIds))
        ? item
        : resolvedMediaSeries.value.find((s) => String(s.id) === String(item)) || null;
      if (!obj || seen.has(String(obj.id))) continue;
      seen.add(String(obj.id));
      resolved.push(obj);
    }
    return resolved;
  };

  // Series Manipulation / User Override Actions (immediately persisted to Backend)
  const saveSeriesOverride = ({
    seriesId = null,
    title = "",
    titleLocked = true,
    folderIds = [],
    seasonLabels = {},
    coverFileId = null,
  } = {}) => {
    const cleanFolderIds = [...new Set((folderIds || []).map((id) => String(id)).filter(Boolean))];
    if (!cleanFolderIds.length) return null;

    // Ensure these folders are also marked as included in Media if they are real Drive folders
    const realFolderIds = cleanFolderIds.filter((id) => !id.startsWith("__"));
    if (realFolderIds.length > 0) {
      mediaIncludedFolderIds.value = [...new Set([...realFolderIds, ...mediaIncludedFolderIds.value])];
      pruneRemovedSeriesEntries({ folderIds: realFolderIds });
    }

    const folderSet = new Set(cleanFolderIds);
    // Remove these folders from any other manualSeries entry
    const nextManual = [];
    for (const existing of seriesOverrides.value.manualSeries || []) {
      if (seriesId && existing.id === seriesId) continue;
      const remaining = (existing.folderIds || []).filter((id) => !folderSet.has(String(id)));
      if (remaining.length > 0) {
        nextManual.push({
          ...existing,
          folderIds: remaining,
        });
      }
    }

    // Remove any cannotLink constraints between folders that the user just explicitly merged
    const nextCannotLink = (seriesOverrides.value.cannotLink || []).filter((pair) => {
      const a = String(pair?.[0] ?? "");
      const b = String(pair?.[1] ?? "");
      return !(folderSet.has(a) && folderSet.has(b));
    });

    const newEntry = {
      id: seriesId && String(seriesId).startsWith("manual_")
        ? String(seriesId)
        : `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: String(title || "").trim() || "새 시리즈",
      titleLocked: Boolean(titleLocked),
      folderIds: cleanFolderIds,
      seasonLabels: seasonLabels && typeof seasonLabels === "object" ? { ...seasonLabels } : {},
      coverFileId: coverFileId ? String(coverFileId) : null,
      updatedAt: new Date().toISOString(),
    };

    seriesOverrides.value = {
      ...seriesOverrides.value,
      manualSeries: [newEntry, ...nextManual],
      cannotLink: nextCannotLink,
    };
    savePersistedState({ immediate: true });
    return newEntry;
  };

  // Merge multiple series (or series IDs) into a single series
  const mergeMediaSeries = (seriesList = [], customTitle = "") => {
    const resolvedList = resolveSeriesInputList(seriesList);
    const allFolderIds = [];
    const mergedSeasonLabels = {};
    let chosenTitle = String(customTitle || "").trim();
    let coverFileId = null;

    for (const ser of resolvedList) {
      if (!chosenTitle && ser.title) {
        chosenTitle = ser.title;
      }
      if (!coverFileId && ser.coverFileId) {
        coverFileId = ser.coverFileId;
      }
      for (const season of ser.seasons || []) {
        const fid = String(season.folderId);
        if (!allFolderIds.includes(fid)) {
          allFolderIds.push(fid);
        }
        if (season.seasonLabel) {
          mergedSeasonLabels[fid] = season.seasonLabel;
        }
      }
    }

    if (!allFolderIds.length) return null;
    return saveSeriesOverride({
      title: chosenTitle || "통합 시리즈",
      titleLocked: true,
      folderIds: allFolderIds,
      seasonLabels: mergedSeasonLabels,
      coverFileId,
    });
  };

  // Split a specific season folder out of a series into its own standalone series
  const splitFolderFromSeries = (seriesOrId, targetFolderId) => {
    const seriesObj = resolveSeriesInputList(seriesOrId)[0];
    if (!seriesObj || !targetFolderId) return;
    const targetKey = String(targetFolderId);
    const otherFolderIds = (seriesObj.folderIds || [])
      .map((id) => String(id))
      .filter((id) => id !== targetKey);

    if (!otherFolderIds.length) return;

    // Add cannotLink pairs between targetKey and all other folders in that series
    const nextCannotLink = [...(seriesOverrides.value.cannotLink || [])];
    for (const otherId of otherFolderIds) {
      const a = targetKey < otherId ? targetKey : otherId;
      const b = targetKey < otherId ? otherId : targetKey;
      const exists = nextCannotLink.some((p) => String(p?.[0]) === a && String(p?.[1]) === b);
      if (!exists) {
        nextCannotLink.push([a, b]);
      }
    }

    // If it was a manualSeries, update its folderIds
    const nextManual = [];
    for (const existing of seriesOverrides.value.manualSeries || []) {
      const filtered = (existing.folderIds || []).filter((id) => String(id) !== targetKey);
      if (filtered.length > 0) {
        nextManual.push({
          ...existing,
          folderIds: filtered,
        });
      }
    }

    seriesOverrides.value = {
      ...seriesOverrides.value,
      manualSeries: nextManual,
      cannotLink: nextCannotLink,
    };
    savePersistedState({ immediate: true });
  };

  // Ungroup an entire series so all of its folders become standalone works
  const ungroupSeriesToSingleFolders = (seriesOrId) => {
    const seriesObj = resolveSeriesInputList(seriesOrId)[0];
    if (!seriesObj || !Array.isArray(seriesObj.folderIds)) return;
    const fids = seriesObj.folderIds.map((id) => String(id));
    const folderSet = new Set(fids);

    const nextCannotLink = [...(seriesOverrides.value.cannotLink || [])];
    for (let i = 0; i < fids.length; i += 1) {
      for (let j = i + 1; j < fids.length; j += 1) {
        const a = fids[i] < fids[j] ? fids[i] : fids[j];
        const b = fids[i] < fids[j] ? fids[j] : fids[i];
        if (!nextCannotLink.some((p) => String(p?.[0]) === a && String(p?.[1]) === b)) {
          nextCannotLink.push([a, b]);
        }
      }
    }

    const nextManual = (seriesOverrides.value.manualSeries || [])
      .map((entry) => ({
        ...entry,
        folderIds: (entry.folderIds || []).filter((id) => !folderSet.has(String(id))),
      }))
      .filter((entry) => entry.folderIds.length > 0);

    seriesOverrides.value = {
      ...seriesOverrides.value,
      manualSeries: nextManual,
      cannotLink: nextCannotLink,
    };
    savePersistedState({ immediate: true });
  };

  /**
   * Takes down (hides / unlists) one or more series from the Media library view
   * without deleting any original files in Drive, while keeping a snapshot for one-click restore.
   */
  const takedownMediaSeries = (seriesOrIds) => {
    const targets = resolveSeriesInputList(seriesOrIds);
    if (!targets.length) return [];

    const foldersToExclude = new Set();
    const filesToExclude = new Set();
    const filesToRemoveFromIncluded = new Set();
    const allRemovedFolderSet = new Set();
    const nextRemovedSnapshots = [];

    for (const ser of targets) {
      const seasonOrder = (ser.seasons || []).map((s) => String(s.folderId)).filter(Boolean);
      const fallbackFolders = (ser.folderIds || []).map((id) => String(id)).filter(Boolean);
      const orderedFolderIds = seasonOrder.length ? seasonOrder : fallbackFolders;
      const realFolderIds = orderedFolderIds.filter((id) => !id.startsWith("__"));

      const seasonLabels = {};
      const virtualFileIds = [];
      for (const season of ser.seasons || []) {
        const fid = String(season.folderId || "");
        if (season.seasonLabel && fid) {
          seasonLabels[fid] = season.seasonLabel;
        }
        if (fid.startsWith("__") || !realFolderIds.includes(fid)) {
          for (const ep of season.episodes || []) {
            if (ep?.id != null) {
              virtualFileIds.push(String(ep.id));
            }
          }
        }
      }

      const allEpisodeIds = (ser.allEpisodes || []).map((ep) => String(ep.id)).filter(Boolean);
      realFolderIds.forEach((fid) => {
        foldersToExclude.add(fid);
        allRemovedFolderSet.add(fid);
      });
      virtualFileIds.forEach((id) => filesToExclude.add(id));
      allEpisodeIds.forEach((id) => filesToRemoveFromIncluded.add(id));

      const signature = [...orderedFolderIds].sort().join("|") || [...allEpisodeIds].sort().join("|");
      nextRemovedSnapshots.push({
        id: `removed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        signature,
        seriesId: String(ser.id),
        title: ser.title || "이름 없는 시리즈",
        titleLocked: Boolean(ser.titleLocked),
        source: ser.source || "single",
        folderIds: realFolderIds,
        seasonOrder: orderedFolderIds,
        seasonLabels,
        fileIds: allEpisodeIds,
        virtualFileIds,
        coverFileId: ser.coverFileId ? String(ser.coverFileId) : null,
        seasonCount: ser.seasonCount || 1,
        specialCount: ser.specialCount || 0,
        episodeCount: ser.episodeCount || allEpisodeIds.length,
        removedAt: new Date().toISOString(),
      });
    }

    if (foldersToExclude.size > 0) {
      mediaExcludedFolderIds.value = [...new Set([...foldersToExclude, ...mediaExcludedFolderIds.value])];
      mediaIncludedFolderIds.value = mediaIncludedFolderIds.value.filter(
        (id) => !foldersToExclude.has(String(id)),
      );
    }

    if (filesToExclude.size > 0) {
      mediaExcludedFileIds.value = [...new Set([...filesToExclude, ...mediaExcludedFileIds.value])];
    }

    if (filesToRemoveFromIncluded.size > 0) {
      mediaIncludedFileIds.value = mediaIncludedFileIds.value.filter(
        (id) => !filesToRemoveFromIncluded.has(String(id)),
      );
    }

    if (allRemovedFolderSet.size > 0) {
      const nextManual = (seriesOverrides.value.manualSeries || [])
        .map((entry) => ({
          ...entry,
          folderIds: (entry.folderIds || []).filter((id) => !allRemovedFolderSet.has(String(id))),
        }))
        .filter((entry) => entry.folderIds.length > 0);
      seriesOverrides.value = {
        ...seriesOverrides.value,
        manualSeries: nextManual,
      };
    }

    const existingSigSet = new Set(nextRemovedSnapshots.map((s) => s.signature).filter(Boolean));
    removedMediaSeries.value = [
      ...nextRemovedSnapshots,
      ...removedMediaSeries.value.filter((entry) => !entry.signature || !existingSigSet.has(entry.signature)),
    ];

    savePersistedState({ immediate: true });
    return nextRemovedSnapshots;
  };

  /**
   * Restores a previously taken-down series back onto the Media library list.
   */
  const restoreRemovedSeries = (removedEntryOrId) => {
    const targetId = typeof removedEntryOrId === "object" ? removedEntryOrId?.id : removedEntryOrId;
    const entry = removedMediaSeries.value.find((item) => String(item.id) === String(targetId));
    if (!entry) return false;

    const folderIds = (entry.folderIds || []).map((id) => String(id)).filter(Boolean);
    const virtualFileIds = (entry.virtualFileIds || []).map((id) => String(id)).filter(Boolean);
    const allFileIds = (entry.fileIds || []).map((id) => String(id)).filter(Boolean);

    const folderSet = new Set(folderIds);
    const fileSet = new Set([...virtualFileIds, ...allFileIds]);

    mediaExcludedFolderIds.value = mediaExcludedFolderIds.value.filter((id) => !folderSet.has(String(id)));
    mediaExcludedFileIds.value = mediaExcludedFileIds.value.filter((id) => !fileSet.has(String(id)));
    removedMediaSeries.value = removedMediaSeries.value.filter((item) => String(item.id) !== String(entry.id));

    if (preferences.value.mediaSourceMode === "manual") {
      const isFolderCoveredByMediaArea = (folderId) => {
        const key = String(folderId ?? "");
        if (!key || !mediaAreaFolderSet.value.size) return false;
        if (mediaAreaFolderSet.value.has(key)) return true;
        return mediaLibraryAreas.value.some((area) =>
          Boolean(getImmediateChildFolderUnderAncestor(key, area.folderId)),
        );
      };

      const uncoveredFolderIds = folderIds.filter((id) => !isFolderCoveredByMediaArea(id));
      if (uncoveredFolderIds.length > 0) {
        mediaIncludedFolderIds.value = [...new Set([...uncoveredFolderIds, ...mediaIncludedFolderIds.value])];
      }
      const filesToRestore = virtualFileIds.length > 0
        ? virtualFileIds
        : folderIds.length === 0
          ? allFileIds
          : [];
      const uncoveredFileIds = filesToRestore.filter((id) => {
        const rec = candidateVideoById.value.get(String(id));
        return !(rec && isFileInsideFolderSet(rec, mediaAreaFolderSet.value));
      });
      if (uncoveredFileIds.length > 0) {
        mediaIncludedFileIds.value = [...new Set([...uncoveredFileIds, ...mediaIncludedFileIds.value])];
      }
    }

    const restoreOrder = (entry.seasonOrder && entry.seasonOrder.length ? entry.seasonOrder : folderIds)
      .map((id) => String(id))
      .filter(Boolean);
    if (entry.source === "manual" && restoreOrder.length > 0) {
      saveSeriesOverride({
        seriesId: entry.seriesId,
        title: entry.title,
        titleLocked: entry.titleLocked !== false,
        folderIds: restoreOrder,
        seasonLabels: entry.seasonLabels || {},
        coverFileId: entry.coverFileId || null,
      });
      return true;
    }

    savePersistedState({ immediate: true });
    return true;
  };

  const restoreAllRemovedSeries = () => {
    const entries = [...removedMediaSeries.value];
    if (!entries.length) return 0;
    for (const entry of entries) {
      restoreRemovedSeries(entry.id);
    }
    return entries.length;
  };

  const setAutoClassifyEnabled = (enabled) => {
    seriesOverrides.value = {
      ...seriesOverrides.value,
      autoClassifyEnabled: Boolean(enabled),
    };
    savePersistedState({ immediate: true });
  };

  const resetAllSeriesOverrides = () => {
    seriesOverrides.value = createEmptySeriesOverrides();
    savePersistedState({ immediate: true });
  };

  // Keep Header search available extensions synced
  watch(allVideos, (videos) => {
    const exts = [...new Set(videos.map((v) => v.extension).filter(Boolean))];
    headerSearchStore.setAvailableExtensions(isVaultScope.value ? "secretMedia" : "media", exts);
  }, { immediate: true });

  watch(allPhotos, (photos) => {
    const exts = [...new Set(photos.map((p) => p.extension).filter(Boolean))];
    headerSearchStore.setAvailableExtensions(isVaultScope.value ? "secretPhotos" : "photos", exts);
  }, { immediate: true });

  const ensureCatalogLoaded = async (options = {}) => {
    const requestedScope = options.scope || "normal";
    if (requestedScope === "vault") {
      if (!secretFolderStore.vaultMode || !secretFolderStore.vaultUnlocked) {
        setLibraryScope("normal", { skipVaultFlush: true });
        return;
      }
      setLibraryScope("vault");
      if (!hasLoadedRemoteVaultLibrary.value) {
        await fetchVaultRemoteLibraryState();
      }
      if (!fileStore.vaultHasLoaded && !fileStore.vaultLoading) {
        await fileStore.fetchVaultFiles().catch(() => {});
      }
      return;
    }

    if (libraryScope.value !== "normal") {
      setLibraryScope("normal");
    }
    if (!hasLoadedRemoteLibrary.value) {
      await fetchRemoteLibraryState();
    }
    if (!fileStore.hasLoaded && !fileStore.isLoading) {
      await fileStore.fetchFiles().catch(() => {});
    }
  };

  // --- Watch Progress & History Actions ---
  const recordWatchProgress = (fileId, positionSeconds, durationSeconds = 0) => {
    const key = String(fileId ?? "");
    if (!key) return;

    const existing = watchHistoryById.value[key] || {};
    const resolvedDuration = Number(durationSeconds || existing.durationSeconds || videoMetaById.value[key]?.durationSeconds || 0) || 0;
    const clampedPosition = Math.max(0, Math.floor(Number(positionSeconds) || 0));
    const progressPercent = resolvedDuration > 0
      ? Math.min(100, Math.round((clampedPosition / resolvedDuration) * 100))
      : Number(existing.progressPercent || 0);
    const completed = progressPercent >= COMPLETION_THRESHOLD_PERCENT;

    watchHistoryById.value = {
      ...watchHistoryById.value,
      [key]: {
        positionSeconds: completed ? 0 : clampedPosition,
        durationSeconds: resolvedDuration,
        progressPercent: completed ? 100 : progressPercent,
        completed,
        dismissedFromContinue: false,
        lastWatchedAt: new Date().toISOString(),
        watchCount: Number(existing.watchCount || 0) || 1,
      },
    };
    savePersistedState();
  };

  const markVideoStarted = (fileId) => {
    const key = String(fileId ?? "");
    if (!key) return;
    if (!mediaIncludedFileSet.value.has(key)) {
      mediaIncludedFileIds.value = [key, ...mediaIncludedFileIds.value];
    }
    const existing = watchHistoryById.value[key] || {};
    watchHistoryById.value = {
      ...watchHistoryById.value,
      [key]: {
        positionSeconds: Number(existing.positionSeconds || 0),
        durationSeconds: Number(existing.durationSeconds || videoMetaById.value[key]?.durationSeconds || 0),
        progressPercent: Number(existing.progressPercent || 0),
        completed: Boolean(existing.completed),
        dismissedFromContinue: false,
        lastWatchedAt: new Date().toISOString(),
        watchCount: (Number(existing.watchCount || 0) || 0) + 1,
      },
    };
    const file = unifiedLiveFileMap.value.get(key);
    if (file) {
      fileStore.recordFileAccess?.(file);
    }
    savePersistedState();
  };

  const markVideoCompleted = (fileId) => {
    const key = String(fileId ?? "");
    if (!key) return;
    const existing = watchHistoryById.value[key] || {};
    watchHistoryById.value = {
      ...watchHistoryById.value,
      [key]: {
        ...existing,
        positionSeconds: 0,
        progressPercent: 100,
        completed: true,
        dismissedFromContinue: false,
        lastWatchedAt: new Date().toISOString(),
        watchCount: Math.max(1, Number(existing.watchCount || 0)),
      },
    };
    savePersistedState();
  };

  const markVideoUnwatched = (fileId) => {
    const key = String(fileId ?? "");
    if (!key) return;
    const next = { ...watchHistoryById.value };
    delete next[key];
    watchHistoryById.value = next;
    savePersistedState();
  };

  const dismissFromContinueWatching = (fileId) => {
    const key = String(fileId ?? "");
    if (!key || !watchHistoryById.value[key]) return;
    watchHistoryById.value = {
      ...watchHistoryById.value,
      [key]: {
        ...watchHistoryById.value[key],
        positionSeconds: 0,
        progressPercent: 0,
        dismissedFromContinue: true,
      },
    };
    savePersistedState();
  };

  const clearAllWatchHistory = () => {
    watchHistoryById.value = {};
    savePersistedState();
  };

  // --- Metadata Caching (Duration, Resolution, Image Dimensions) ---
  const recordVideoMetadata = (fileId, { durationSeconds, width, height } = {}) => {
    const key = String(fileId ?? "");
    if (!key) return;
    const existing = videoMetaById.value[key] || {};
    const nextDuration = Math.max(0, Math.floor(Number(durationSeconds ?? existing.durationSeconds) || 0));
    const nextWidth = Math.max(0, Math.floor(Number(width ?? existing.width) || 0));
    const nextHeight = Math.max(0, Math.floor(Number(height ?? existing.height) || 0));
    const resolutionLabel = classifyResolutionLabel(nextWidth, nextHeight);

    if (
      existing.durationSeconds === nextDuration &&
      existing.width === nextWidth &&
      existing.height === nextHeight
    ) {
      return;
    }

    videoMetaById.value = {
      ...videoMetaById.value,
      [key]: {
        durationSeconds: nextDuration,
        width: nextWidth,
        height: nextHeight,
        resolutionLabel,
      },
    };
    savePersistedState();
  };

  const recordPhotoMetadata = (fileId, { width, height, captureDate, cameraModel, gpsLabel } = {}) => {
    const key = String(fileId ?? "");
    if (!key) return;
    const existing = photoMetaById.value[key] || {};
    const nextWidth = Math.max(0, Math.floor(Number(width ?? existing.width) || 0));
    const nextHeight = Math.max(0, Math.floor(Number(height ?? existing.height) || 0));

    if (
      existing.width === nextWidth &&
      existing.height === nextHeight &&
      (!captureDate || existing.captureDate === captureDate)
    ) {
      return;
    }

    photoMetaById.value = {
      ...photoMetaById.value,
      [key]: {
        width: nextWidth,
        height: nextHeight,
        captureDate: captureDate || existing.captureDate || null,
        cameraModel: cameraModel || existing.cameraModel || "",
        gpsLabel: gpsLabel || existing.gpsLabel || "",
      },
    };
    savePersistedState();
  };

  // --- Favorites Actions ---
  const toggleMediaFavorite = (fileId) => {
    const key = String(fileId ?? "");
    if (!key) return false;
    const exists = mediaFavoriteSet.value.has(key);
    mediaFavoriteIds.value = exists
      ? mediaFavoriteIds.value.filter((id) => String(id) !== key)
      : [key, ...mediaFavoriteIds.value];
    if (!exists && !mediaIncludedFileSet.value.has(key)) {
      mediaIncludedFileIds.value = [key, ...mediaIncludedFileIds.value];
    }
    savePersistedState();
    return !exists;
  };

  const setMediaFavoritesBatch = (fileIds = [], favorite = true) => {
    const keys = fileIds.map((id) => String(id)).filter(Boolean);
    if (!keys.length) return;
    if (favorite) {
      mediaFavoriteIds.value = [...new Set([...keys, ...mediaFavoriteIds.value])];
      mediaIncludedFileIds.value = [...new Set([...keys, ...mediaIncludedFileIds.value])];
    } else {
      const removeSet = new Set(keys);
      mediaFavoriteIds.value = mediaFavoriteIds.value.filter((id) => !removeSet.has(String(id)));
    }
    savePersistedState();
  };

  const togglePhotoFavorite = (fileId) => {
    const key = String(fileId ?? "");
    if (!key) return false;
    const exists = photoFavoriteSet.value.has(key);
    photoFavoriteIds.value = exists
      ? photoFavoriteIds.value.filter((id) => String(id) !== key)
      : [key, ...photoFavoriteIds.value];
    if (!exists && !photoIncludedFileSet.value.has(key)) {
      photoIncludedFileIds.value = [key, ...photoIncludedFileIds.value];
    }
    savePersistedState();
    return !exists;
  };

  const setPhotoFavoritesBatch = (fileIds = [], favorite = true) => {
    const keys = fileIds.map((id) => String(id)).filter(Boolean);
    if (!keys.length) return;
    if (favorite) {
      photoFavoriteIds.value = [...new Set([...keys, ...photoFavoriteIds.value])];
      photoIncludedFileIds.value = [...new Set([...keys, ...photoIncludedFileIds.value])];
    } else {
      const removeSet = new Set(keys);
      photoFavoriteIds.value = photoFavoriteIds.value.filter((id) => !removeSet.has(String(id)));
    }
    savePersistedState();
  };

  const toggleSeriesFavorite = (seriesId) => {
    const key = String(seriesId ?? "").trim();
    if (!key) return false;
    const exists = mediaFavoriteSeriesSet.value.has(key);
    mediaFavoriteSeriesIds.value = exists
      ? mediaFavoriteSeriesIds.value.filter((id) => String(id) !== key)
      : [key, ...mediaFavoriteSeriesIds.value];
    savePersistedState();
    return !exists;
  };

  const toggleAlbumFavorite = (albumId) => {
    const key = String(albumId ?? "").trim();
    if (!key) return false;
    const exists = photoFavoriteAlbumSet.value.has(key);
    photoFavoriteAlbumIds.value = exists
      ? photoFavoriteAlbumIds.value.filter((id) => String(id) !== key)
      : [key, ...photoFavoriteAlbumIds.value];
    savePersistedState();
    return !exists;
  };

  // --- Media Collections CRUD ---
  const createMediaCollection = ({ name, description = "", itemIds = [], coverFileId = null } = {}) => {
    const trimmedName = String(name || "").trim();
    if (!trimmedName) return null;

    const normalizedIds = [...new Set((itemIds || []).map((id) => String(id)).filter(Boolean))];
    if (normalizedIds.length > 0) {
      mediaIncludedFileIds.value = [...new Set([...normalizedIds, ...mediaIncludedFileIds.value])];
    }
    const nowIso = new Date().toISOString();
    const newCollection = {
      id: `mc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: trimmedName,
      description: String(description || "").trim(),
      coverFileId: coverFileId ? String(coverFileId) : (normalizedIds[0] || null),
      itemIds: normalizedIds,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    mediaCollections.value = [newCollection, ...mediaCollections.value];
    savePersistedState();
    return newCollection;
  };

  const updateMediaCollection = (collectionId, patch = {}) => {
    const idx = mediaCollections.value.findIndex((c) => c.id === collectionId);
    if (idx < 0) return null;
    const current = mediaCollections.value[idx];
    const nextItemIds = Array.isArray(patch.itemIds)
      ? [...new Set(patch.itemIds.map((id) => String(id)).filter(Boolean))]
      : current.itemIds;
    if (nextItemIds.length > 0) {
      mediaIncludedFileIds.value = [...new Set([...nextItemIds, ...mediaIncludedFileIds.value])];
    }
    const updated = {
      ...current,
      name: patch.name !== undefined ? String(patch.name).trim() || current.name : current.name,
      description: patch.description !== undefined ? String(patch.description).trim() : current.description,
      coverFileId: patch.coverFileId !== undefined ? (patch.coverFileId ? String(patch.coverFileId) : null) : current.coverFileId,
      itemIds: nextItemIds,
      updatedAt: new Date().toISOString(),
    };
    const nextList = [...mediaCollections.value];
    nextList[idx] = updated;
    mediaCollections.value = nextList;
    savePersistedState();
    return updated;
  };

  const deleteMediaCollection = (collectionId) => {
    mediaCollections.value = mediaCollections.value.filter((c) => c.id !== collectionId);
    savePersistedState();
  };

  const addItemsToMediaCollection = (collectionId, fileIds = []) => {
    const idx = mediaCollections.value.findIndex((c) => c.id === collectionId);
    if (idx < 0) return false;
    const current = mediaCollections.value[idx];
    const incoming = fileIds.map((id) => String(id)).filter(Boolean);
    const mergedIds = [...new Set([...(current.itemIds || []), ...incoming])];
    updateMediaCollection(collectionId, {
      itemIds: mergedIds,
      coverFileId: current.coverFileId || mergedIds[0] || null,
    });
    return true;
  };

  const removeItemsFromMediaCollection = (collectionId, fileIds = []) => {
    const idx = mediaCollections.value.findIndex((c) => c.id === collectionId);
    if (idx < 0) return false;
    const current = mediaCollections.value[idx];
    const removeSet = new Set(fileIds.map((id) => String(id)));
    const nextIds = (current.itemIds || []).filter((id) => !removeSet.has(String(id)));
    const nextCover = removeSet.has(String(current.coverFileId))
      ? (nextIds[0] || null)
      : current.coverFileId;
    updateMediaCollection(collectionId, {
      itemIds: nextIds,
      coverFileId: nextCover,
    });
    return true;
  };

  const moveItemInMediaCollection = (collectionId, fromIndex, toIndex) => {
    const idx = mediaCollections.value.findIndex((c) => c.id === collectionId);
    if (idx < 0) return false;
    const items = [...(mediaCollections.value[idx].itemIds || [])];
    if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
      return false;
    }
    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);
    updateMediaCollection(collectionId, { itemIds: items });
    return true;
  };

  const createMediaCollectionFromFolder = async (folder) => {
    if (!folder || folder.id == null) return null;
    await ensureCatalogLoaded();
    const folderIdStr = String(folder.id);
    if (!mediaIncludedFolderSet.value.has(folderIdStr)) {
      mediaIncludedFolderIds.value = [folderIdStr, ...mediaIncludedFolderIds.value];
    }
    const matchingIds = [];
    for (const file of unifiedLiveFileMap.value.values()) {
      if (String(file.parentId ?? "") === folderIdStr && (isVideoFileRecord(file) || isImageFileRecord(file))) {
        matchingIds.push(String(file.id));
      }
    }
    return createMediaCollection({
      name: folder.name || folder.fileOriginName || "새 미디어 컬렉션",
      description: `'${folder.name || "폴더"}' 폴더에서 생성된 컬렉션`,
      itemIds: matchingIds,
    });
  };

  // --- Photo Albums CRUD ---
  const createPhotoAlbum = ({ name, description = "", photoIds = [], coverFileId = null } = {}) => {
    const trimmedName = String(name || "").trim();
    if (!trimmedName) return null;

    const normalizedIds = [...new Set((photoIds || []).map((id) => String(id)).filter(Boolean))];
    if (normalizedIds.length > 0) {
      photoIncludedFileIds.value = [...new Set([...normalizedIds, ...photoIncludedFileIds.value])];
    }
    const nowIso = new Date().toISOString();
    const newAlbum = {
      id: `pa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: trimmedName,
      description: String(description || "").trim(),
      coverFileId: coverFileId ? String(coverFileId) : (normalizedIds[0] || null),
      photoIds: normalizedIds,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    photoAlbums.value = [newAlbum, ...photoAlbums.value];
    savePersistedState();
    return newAlbum;
  };

  const updatePhotoAlbum = (albumId, patch = {}) => {
    const idx = photoAlbums.value.findIndex((a) => a.id === albumId);
    if (idx < 0) return null;
    const current = photoAlbums.value[idx];
    const nextPhotoIds = Array.isArray(patch.photoIds)
      ? [...new Set(patch.photoIds.map((id) => String(id)).filter(Boolean))]
      : current.photoIds;
    if (nextPhotoIds.length > 0) {
      photoIncludedFileIds.value = [...new Set([...nextPhotoIds, ...photoIncludedFileIds.value])];
    }
    const updated = {
      ...current,
      name: patch.name !== undefined ? String(patch.name).trim() || current.name : current.name,
      description: patch.description !== undefined ? String(patch.description).trim() : current.description,
      coverFileId: patch.coverFileId !== undefined ? (patch.coverFileId ? String(patch.coverFileId) : null) : current.coverFileId,
      photoIds: nextPhotoIds,
      updatedAt: new Date().toISOString(),
    };
    const nextList = [...photoAlbums.value];
    nextList[idx] = updated;
    photoAlbums.value = nextList;
    savePersistedState();
    return updated;
  };

  const deletePhotoAlbum = (albumId) => {
    photoAlbums.value = photoAlbums.value.filter((a) => a.id !== albumId);
    savePersistedState();
  };

  const addPhotosToAlbum = (albumId, fileIds = []) => {
    const idx = photoAlbums.value.findIndex((a) => a.id === albumId);
    if (idx < 0) return false;
    const current = photoAlbums.value[idx];
    const incoming = fileIds.map((id) => String(id)).filter(Boolean);
    const mergedIds = [...new Set([...(current.photoIds || []), ...incoming])];
    updatePhotoAlbum(albumId, {
      photoIds: mergedIds,
      coverFileId: current.coverFileId || mergedIds[0] || null,
    });
    return true;
  };

  const removePhotosFromAlbum = (albumId, fileIds = []) => {
    const idx = photoAlbums.value.findIndex((a) => a.id === albumId);
    if (idx < 0) return false;
    const current = photoAlbums.value[idx];
    const removeSet = new Set(fileIds.map((id) => String(id)));
    const nextIds = (current.photoIds || []).filter((id) => !removeSet.has(String(id)));
    const nextCover = removeSet.has(String(current.coverFileId))
      ? (nextIds[0] || null)
      : current.coverFileId;
    updatePhotoAlbum(albumId, {
      photoIds: nextIds,
      coverFileId: nextCover,
    });
    return true;
  };

  const movePhotoInAlbum = (albumId, fromIndex, toIndex) => {
    const idx = photoAlbums.value.findIndex((a) => a.id === albumId);
    if (idx < 0) return false;
    const ids = [...(photoAlbums.value[idx].photoIds || [])];
    if (fromIndex < 0 || fromIndex >= ids.length || toIndex < 0 || toIndex >= ids.length) {
      return false;
    }
    const [moved] = ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, moved);
    updatePhotoAlbum(albumId, { photoIds: ids });
    return true;
  };

  const createPhotoAlbumFromFolder = async (folder) => {
    if (!folder || folder.id == null) return null;
    await ensureCatalogLoaded();
    const folderIdStr = String(folder.id);
    if (!photoIncludedFolderSet.value.has(folderIdStr)) {
      photoIncludedFolderIds.value = [folderIdStr, ...photoIncludedFolderIds.value];
    }
    const matchingIds = [];
    for (const file of unifiedLiveFileMap.value.values()) {
      if (String(file.parentId ?? "") === folderIdStr && isImageFileRecord(file)) {
        matchingIds.push(String(file.id));
      }
    }
    return createPhotoAlbum({
      name: folder.name || folder.fileOriginName || "새 사진 앨범",
      description: `'${folder.name || "폴더"}' 폴더에서 생성된 앨범`,
      photoIds: matchingIds,
    });
  };

  // --- Preferences ---
  const updatePreferences = (patch = {}) => {
    preferences.value = {
      ...preferences.value,
      ...patch,
    };
    savePersistedState();
  };

  const resetPreferences = () => {
    preferences.value = isVaultScope.value
      ? { ...DEFAULT_VAULT_MEDIA_PHOTO_PREFERENCES }
      : { ...DEFAULT_MEDIA_PHOTO_PREFERENCES };
    savePersistedState();
  };

  // --- Theater & Mini Player Control ---
  const openTheater = (fileOrId, options = {}) => {
    const fileId = typeof fileOrId === "object" ? (fileOrId?.id ?? fileOrId?.idx) : fileOrId;
    if (fileId == null) return;
    const key = String(fileId);

    const fileObj = typeof fileOrId === "object" ? fileOrId : null;
    const isVaultRequest = Boolean(
      options.vaultScope ??
      (isVaultScope.value || fileObj?.isVaultSpace || fileObj?.spaceType === "VAULT"),
    );

    if (isVaultRequest) {
      if (!secretFolderStore.vaultMode || !secretFolderStore.vaultUnlocked) {
        return;
      }
      setLibraryScope("vault");
      if (!fileStore.vaultHasLoaded && !fileStore.vaultLoading) {
        void fileStore.fetchVaultFiles().catch(() => {});
      }
      if (!hasLoadedRemoteVaultLibrary.value) {
        void fetchVaultRemoteLibraryState();
      }
    }

    miniPlayer.value = {
      ...miniPlayer.value,
      active: false,
      isVault: false,
    };

    const playlistIds = Array.isArray(options.playlistIds) && options.playlistIds.length > 0
      ? options.playlistIds.map((id) => String(id))
      : allVideos.value.length > 0
        ? allVideos.value.map((v) => String(v.id))
        : [key];

    activeTheaterIsVault.value = isVaultRequest;
    activeTheaterVideoId.value = key;
    activeTheaterPlaylistIds.value = playlistIds;
    activeTheaterCollectionId.value = options.collectionId || null;
    markVideoStarted(key);
  };

  const closeTheater = () => {
    activeTheaterVideoId.value = null;
    activeTheaterPlaylistIds.value = [];
    activeTheaterCollectionId.value = null;
    activeTheaterIsVault.value = false;
  };

  const minimizeToMiniPlayer = (currentState = {}) => {
    if (!activeTheaterVideoId.value) return;
    miniPlayer.value = {
      active: true,
      isVault: activeTheaterIsVault.value,
      fileId: activeTheaterVideoId.value,
      playlistIds: [...activeTheaterPlaylistIds.value],
      collectionId: activeTheaterCollectionId.value,
      positionSeconds: Number(currentState.positionSeconds ?? 0) || 0,
      isPlaying: currentState.isPlaying !== undefined ? Boolean(currentState.isPlaying) : true,
      playbackRate: Number(currentState.playbackRate || preferences.value.defaultPlaybackRate || 1.0),
      muted: Boolean(currentState.muted),
    };
    activeTheaterVideoId.value = null;
    activeTheaterIsVault.value = false;
  };

  const restoreFromMiniPlayer = (currentPositionSeconds = null) => {
    if (!miniPlayer.value.active || !miniPlayer.value.fileId) return;
    const isVault = Boolean(miniPlayer.value.isVault);
    if (isVault && (!secretFolderStore.vaultMode || !secretFolderStore.vaultUnlocked)) {
      closeMiniPlayer();
      return;
    }
    if (currentPositionSeconds != null) {
      recordWatchProgress(miniPlayer.value.fileId, currentPositionSeconds);
    }
    const targetId = miniPlayer.value.fileId;
    const playlistIds = [...(miniPlayer.value.playlistIds || [])];
    const collectionId = miniPlayer.value.collectionId;
    miniPlayer.value = {
      ...miniPlayer.value,
      active: false,
      isVault: false,
    };
    openTheater(targetId, { playlistIds, collectionId, vaultScope: isVault });
  };

  const closeMiniPlayer = (currentPositionSeconds = null) => {
    const isVault = Boolean(miniPlayer.value.isVault);
    if (miniPlayer.value.fileId && currentPositionSeconds != null) {
      if (!isVault || (isVaultScope.value && secretFolderStore.vaultUnlocked)) {
        recordWatchProgress(miniPlayer.value.fileId, currentPositionSeconds);
      }
    }
    miniPlayer.value = {
      active: false,
      isVault: false,
      fileId: null,
      playlistIds: [],
      collectionId: null,
      positionSeconds: 0,
      isPlaying: false,
      playbackRate: 1.0,
      muted: false,
    };
  };

  // --- Photo Lightbox Control ---
  const openPhotoLightbox = (fileOrId, options = {}) => {
    const fileId = typeof fileOrId === "object" ? (fileOrId?.id ?? fileOrId?.idx) : fileOrId;
    if (fileId == null) return;
    const key = String(fileId);

    const fileObj = typeof fileOrId === "object" ? fileOrId : null;
    const isVaultRequest = Boolean(
      options.vaultScope ??
      (isVaultScope.value || fileObj?.isVaultSpace || fileObj?.spaceType === "VAULT"),
    );

    if (isVaultRequest) {
      if (!secretFolderStore.vaultMode || !secretFolderStore.vaultUnlocked) {
        return;
      }
      setLibraryScope("vault");
      if (!fileStore.vaultHasLoaded && !fileStore.vaultLoading) {
        void fileStore.fetchVaultFiles().catch(() => {});
      }
      if (!hasLoadedRemoteVaultLibrary.value) {
        void fetchVaultRemoteLibraryState();
      }
    }

    const poolIds = Array.isArray(options.poolIds) && options.poolIds.length > 0
      ? options.poolIds.map((id) => String(id))
      : allPhotos.value.length > 0
        ? allPhotos.value.map((p) => String(p.id))
        : [key];

    activeLightboxIsVault.value = isVaultRequest;
    activeLightboxPhotoId.value = key;
    activeLightboxPoolIds.value = poolIds;
    activeLightboxSlideshow.value = Boolean(options.slideshow);

    const file = unifiedLiveFileMap.value.get(key);
    if (file && !isVaultRequest) {
      fileStore.recordFileAccess?.(file);
    }
  };

  const closePhotoLightbox = () => {
    activeLightboxPhotoId.value = null;
    activeLightboxPoolIds.value = [];
    activeLightboxSlideshow.value = false;
    activeLightboxIsVault.value = false;
  };

  const clearVaultMediaSession = () => {
    if (vaultSaveTimerId && typeof window !== "undefined") {
      window.clearTimeout(vaultSaveTimerId);
      vaultSaveTimerId = null;
    }
    cachedVaultPayload = null;
    hasLoadedRemoteVaultLibrary.value = false;

    if (activeTheaterIsVault.value) {
      closeTheater();
    }
    if (miniPlayer.value.isVault) {
      miniPlayer.value = {
        active: false,
        isVault: false,
        fileId: null,
        playlistIds: [],
        collectionId: null,
        positionSeconds: 0,
        isPlaying: false,
        playbackRate: 1.0,
        muted: false,
      };
    }
    if (activeLightboxIsVault.value) {
      closePhotoLightbox();
    }
    if (libraryScope.value === "vault") {
      spotlightFileId.value = null;
      setLibraryScope("normal", { skipVaultFlush: true });
    }
    headerSearchStore.resetScope("secretMedia");
    headerSearchStore.resetScope("secretPhotos");
    fileStore.clearVaultFiles();
    clearVaultThumbnails();
  };

  const leaveVaultModeWhileUnlocked = () => {
    if (activeLightboxIsVault.value) {
      closePhotoLightbox();
    }
    if (libraryScope.value === "vault") {
      spotlightFileId.value = null;
      setLibraryScope("normal");
    }
  };

  watch(
    () => Boolean(secretFolderStore.vaultUnlocked),
    (unlocked) => {
      if (!unlocked) {
        clearVaultMediaSession();
      }
    },
    { flush: "sync" },
  );

  watch(
    () => Boolean(secretFolderStore.vaultMode),
    (inVaultMode) => {
      if (!inVaultMode && secretFolderStore.vaultUnlocked) {
        leaveVaultModeWhileUnlocked();
      }
    },
    { flush: "sync" },
  );

  watch(
    () => authStore.user?.idx ?? null,
    () => {
      clearVaultMediaSession();
    },
  );

  // --- Navigate to Original Folder in Drive or Vault ---
  const navigateToOriginalFolder = async (file, router) => {
    if (!file || !router) return;
    const isVaultItem = Boolean(
      isVaultScope.value ||
      file.isVaultSpace ||
      String(file.spaceType || "").toUpperCase() === "VAULT",
    );
    closeTheater();
    closePhotoLightbox();

    if (!isVaultItem && file.sharedWithMe) {
      spotlightFileId.value = String(file.id);
      await router.push({
        name: "shareFile",
        query: { spotlightId: String(file.id) },
      });
      return;
    }

    if (isVaultItem) {
      secretFolderStore.setVaultTrashView?.(false);
    }

    const parentId = file.parentId ?? null;
    spotlightFileId.value = String(file.id);
    fileStore.navigateToFolder(parentId);
    const query = { spotlightId: String(file.id) };
    if (parentId != null) {
      query.folderId = String(parentId);
    }
    await router.push({
      name: "home",
      query,
    });
  };

  const clearSpotlight = () => {
    spotlightFileId.value = null;
  };

  return {
    libraryScope,
    isVaultScope,
    watchHistoryById,
    videoMetaById,
    photoMetaById,
    mediaIncludedFileIds,
    mediaIncludedFolderIds,
    mediaExcludedFileIds,
    mediaExcludedFolderIds,
    removedMediaSeries,
    mediaLibraryAreas,
    photoIncludedFileIds,
    photoIncludedFolderIds,
    photoExcludedFileIds,
    photoExcludedFolderIds,
    mediaFavoriteIds,
    mediaFavoriteSeriesIds,
    photoFavoriteIds,
    photoFavoriteAlbumIds,
    mediaCollections,
    photoAlbums,
    preferences,
    activeTheaterVideoId,
    activeTheaterPlaylistIds,
    activeTheaterCollectionId,
    miniPlayer,
    activeLightboxPhotoId,
    activeLightboxPoolIds,
    activeLightboxSlideshow,
    spotlightFileId,
    allDriveFolders,
    candidateVideos,
    candidatePhotos,
    allVideos,
    allPhotos,
    candidateVideoById,
    candidatePhotoById,
    videoById,
    photoById,
    continueWatchingVideos,
    recentlyWatchedVideos,
    recentlyAddedVideos,
    favoriteMediaItems,
    favoriteMediaSeries,
    totalMediaFavoritesCount,
    favoritePhotos,
    favoritePhotoAlbums,
    totalPhotoFavoritesCount,
    resolvedMediaCollections,
    resolvedPhotoAlbums,
    seriesOverrides,
    activeMediaFolderUnits,
    resolvedMediaSeries,
    autoGroupedMediaSeries,
    resolvedMediaAreas,
    previewMediaAreaFolder,
    isMediaAreaFolder,
    addMediaLibraryArea,
    updateMediaLibraryArea,
    removeMediaLibraryArea,
    getMediaItemById,
    ensureCatalogLoaded,
    setLibraryScope,
    fetchRemoteLibraryState,
    fetchVaultRemoteLibraryState,
    clearVaultMediaSession,
    saveSeriesOverride,
    mergeMediaSeries,
    splitFolderFromSeries,
    ungroupSeriesToSingleFolders,
    takedownMediaSeries,
    restoreRemovedSeries,
    restoreAllRemovedSeries,
    setAutoClassifyEnabled,
    resetAllSeriesOverrides,
    addMediaFiles,
    removeMediaFiles,
    toggleMediaFolderInclusion,
    setMediaIncludedFolders,
    addPhotoFiles,
    removePhotoFiles,
    togglePhotoFolderInclusion,
    setPhotoIncludedFolders,
    isVideoExcludedFromMedia,
    isPhotoExcludedFromPhotos,
    excludedIndividualMediaVideos,
    excludedPhotos,
    excludedPhotoFolders,
    excludeMediaFiles,
    restoreExcludedMediaFiles,
    toggleMediaFolderExclusion,
    excludePhotoFiles,
    restoreExcludedPhotoFiles,
    togglePhotoFolderExclusion,
    restoreExcludedPhotoFolder,
    recordWatchProgress,
    markVideoStarted,
    markVideoCompleted,
    markVideoUnwatched,
    dismissFromContinueWatching,
    clearAllWatchHistory,
    recordVideoMetadata,
    recordPhotoMetadata,
    toggleMediaFavorite,
    setMediaFavoritesBatch,
    toggleSeriesFavorite,
    togglePhotoFavorite,
    setPhotoFavoritesBatch,
    toggleAlbumFavorite,
    createMediaCollection,
    updateMediaCollection,
    deleteMediaCollection,
    addItemsToMediaCollection,
    removeItemsFromMediaCollection,
    moveItemInMediaCollection,
    createMediaCollectionFromFolder,
    createPhotoAlbum,
    updatePhotoAlbum,
    deletePhotoAlbum,
    addPhotosToAlbum,
    removePhotosFromAlbum,
    movePhotoInAlbum,
    createPhotoAlbumFromFolder,
    updatePreferences,
    resetPreferences,
    openTheater,
    closeTheater,
    minimizeToMiniPlayer,
    restoreFromMiniPlayer,
    closeMiniPlayer,
    openPhotoLightbox,
    closePhotoLightbox,
    navigateToOriginalFolder,
    clearSpotlight,
  };
});
