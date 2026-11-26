<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useFileStore } from "@/stores/useFileStore.js";
import { useHeaderSearchStore } from "@/stores/useHeaderSearchStore.js";
import { useMediaPhotoStore } from "@/stores/useMediaPhotoStore.js";
import { downloadFileAsset } from "@/api/filesApi.js";
import { getCachedFileThumbnailUrl, loadFileThumbnailUrl } from "@/utils/fileThumbnailCache.js";
import {
  isEncryptedVaultFile,
  resolveFilePlaybackUrl,
  resolveFileThumbnailFallbackUrl,
} from "@/utils/fileMediaUrl.js";
import { triggerDesktopUpload } from "@/utils/desktopDropUpload.js";
import { matchesSearchItem } from "@/utils/fileSearch.js";
import BaseFileShareDialog from "@/components/BaseFileShareDialog.vue";
import DownloadShareLinkDialog from "@/components/DownloadShareLinkDialog.vue";
import { BASE_SHARE_PERMISSION_OPTIONS, useBaseFileShareDialog } from "@/components/useBaseFileShareDialog.js";
import { useDownloadShareLinkDialog } from "@/components/useDownloadShareLinkDialog.js";

const props = defineProps({
  vaultOnly: {
    type: Boolean,
    default: false,
  },
});

const route = useRoute();
const router = useRouter();
const fileStore = useFileStore();
const headerSearchStore = useHeaderSearchStore();
const mediaPhotoStore = useMediaPhotoStore();

const photosRouteName = computed(() => (props.vaultOnly ? "secretPhotos" : "photos"));
const searchScopeName = computed(() => (props.vaultOnly ? "secretPhotos" : "photos"));
const storageNoun = computed(() => (props.vaultOnly ? "비밀 공간" : "저장소"));

const uploadInputRef = ref(null);
const localSearchQuery = ref("");
const scopeFilter = ref("all"); // 'all' | 'owned' | 'shared'
const categoryFilter = ref("all"); // 'all' | 'camera' | 'screenshot'
const sortOrder = ref("date-desc"); // 'date-desc' | 'date-asc' | 'name-asc' | 'size-desc'
const PHOTO_DENSITY_ORDER = ["compact", "normal", "large", "xlarge"];
const PHOTO_DENSITY_LABELS = {
  compact: "작게",
  normal: "보통",
  large: "크게",
  xlarge: "특대",
};
const gridDensity = computed(() => {
  const val = mediaPhotoStore.preferences.photoGridDensity;
  return PHOTO_DENSITY_ORDER.includes(val) ? val : "normal";
});
const photoThumbAspect = computed(() => mediaPhotoStore.preferences.photoThumbAspect || "square");
const photoThumbFit = computed(() => mediaPhotoStore.preferences.photoThumbFit || "cover");
const selectedIds = ref([]);
const lastSelectedAnchorId = ref(null);
const selectedAlbumId = ref(null);
const activeMonthJump = ref("all");

// Modals state
const isAlbumModalOpen = ref(false);
const editingAlbumId = ref(null);
const albumFormName = ref("");
const albumFormDesc = ref("");
const albumFormCoverId = ref(null);
const albumPickerSearch = ref("");
const albumFormSelectedIds = ref([]);

const isAddToAlbumModalOpen = ref(false);
const addToAlbumTargetIds = ref([]);
const isSettingsPopoverOpen = ref(false);
const isExcludedPhotosModalOpen = ref(false);
const photoContextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  photo: null,
});

// Photo Source File / Folder Designation Modal ('manual' vs 'all')
const isPhotoSourcePickerModalOpen = ref(false);
const photoSourcePickerTab = ref("files"); // 'files' | 'folders'
const photoSourcePickerSearch = ref("");
const photoSourcePickerSelectedFileIds = ref([]);
const photoSourcePickerSelectedFolderIds = ref([]);

// Thumbnail map & viewport priority observer
const thumbnailMap = ref({});
let thumbAbortController = null;
const pendingThumbKeys = new Set();
const observedThumbItems = new WeakMap();
let thumbnailObserver = null;

const ensureThumbAbortController = () => {
  if (!thumbAbortController || thumbAbortController.signal.aborted) {
    thumbAbortController = new AbortController();
  }
  return thumbAbortController;
};

const loadSinglePhotoThumbnail = (photo, priority = "high") => {
  if (!photo || photo.id == null) return;
  const key = String(photo.id);
  if (thumbnailMap.value[key]) return;

  const cached =
    getCachedFileThumbnailUrl(photo) ||
    resolveFileThumbnailFallbackUrl(photo) ||
    (!isEncryptedVaultFile(photo) ? resolveFilePlaybackUrl(photo) : "");
  if (cached) {
    thumbnailMap.value = { ...thumbnailMap.value, [key]: cached };
    return;
  }

  if (pendingThumbKeys.has(key)) return;
  pendingThumbKeys.add(key);

  const controller = ensureThumbAbortController();
  loadFileThumbnailUrl(photo, { signal: controller.signal, priority })
    .then((url) => {
      const resolved = url || (isEncryptedVaultFile(photo) ? resolveFilePlaybackUrl(photo) : "");
      if (resolved && !controller.signal.aborted) {
        thumbnailMap.value = { ...thumbnailMap.value, [key]: resolved };
      }
    })
    .catch(() => {
      if (isEncryptedVaultFile(photo) && !controller.signal.aborted) {
        const fallbackUrl = resolveFilePlaybackUrl(photo);
        if (fallbackUrl) {
          thumbnailMap.value = { ...thumbnailMap.value, [key]: fallbackUrl };
        }
      }
    })
    .finally(() => {
      pendingThumbKeys.delete(key);
    });
};

const ensureThumbnailObserver = () => {
  if (thumbnailObserver || typeof IntersectionObserver === "undefined") {
    return thumbnailObserver;
  }
  thumbnailObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const photo = observedThumbItems.get(entry.target);
        if (photo) {
          loadSinglePhotoThumbnail(photo, "high");
        }
        thumbnailObserver?.unobserve(entry.target);
      }
    },
    { rootMargin: "320px 0px" },
  );
  return thumbnailObserver;
};

const observePhotoThumbnailEl = (el, photo) => {
  if (!el || !photo || photo.id == null) return;
  const key = String(photo.id);
  if (thumbnailMap.value[key]) return;
  const observer = ensureThumbnailObserver();
  if (!observer) {
    return;
  }
  observedThumbItems.set(el, photo);
  observer.observe(el);
};

// Share dialog integration
const canCreateShares = computed(() => !props.vaultOnly && Boolean(fileStore.planCapabilities?.shareEnabled));
const selectedOwnedShareableFiles = computed(() => {
  const idSet = new Set(selectedIds.value.map((id) => String(id)));
  return mediaPhotoStore.allPhotos.filter((p) => idSet.has(String(p.id)) && !p.sharedWithMe && !p.lockedFile);
});
const {
  shareTargets,
  shareInfo,
  shareEmail,
  sharePermission,
  shareExpiresAt,
  shareDownloadLimit,
  sharePassword,
  shareCancelEmail,
  shareError,
  isSharing,
  isShareInfoLoading,
  isShareGroupOverviewLoading,
  shareOverviewGroups,
  shareOverviewUsers,
  shareTargetUserIds,
  shareTargetGroupIds,
  sharePendingInvites,
  openShareDialog,
  closeShareDialog,
  submitShare,
  cancelShare,
} = useBaseFileShareDialog({
  fileStore,
  canCreateShares,
  selectedOwnedShareableFiles,
});
const {
  targetFile: downloadLinkTargetFile,
  isOpen: isDownloadLinkDialogOpen,
  durationMode: downloadLinkDurationMode,
  customMinutes: downloadLinkCustomMinutes,
  customExpiresAt: downloadLinkCustomExpiresAt,
  limitMode: downloadLinkLimitMode,
  customMaxDownloads: downloadLinkCustomMaxDownloads,
  password: downloadLinkPassword,
  resolvedDurationMinutes: downloadLinkResolvedMinutes,
  resolvedMaxDownloads: downloadLinkResolvedMaxDownloads,
  issuedLink: downloadLinkIssued,
  existingLinks: downloadLinkHistory,
  isLoadingLinks: isDownloadLinkLoading,
  isCreating: isDownloadLinkCreating,
  revokingLinkIdx: revokingDownloadLinkIdx,
  errorMessage: downloadLinkError,
  copiedKey: downloadLinkCopiedKey,
  openDialog: openDownloadLinkDialog,
  closeDialog: closeDownloadLinkDialog,
  createLink: createDownloadLinkAction,
  revokeLink: revokeDownloadLinkAction,
  getSharePageUrl: getDownloadSharePageUrl,
  getDirectDownloadUrl: getDownloadShareDirectUrl,
  copyLinkUrl: copyDownloadShareUrl,
} = useDownloadShareLinkDialog({
  onError: (msg) => window.alert(msg),
});

const activeTab = computed(() => {
  const raw = String(route.query.tab || "timeline").toLowerCase();
  if (["timeline", "albums", "favorites"].includes(raw)) {
    return raw;
  }
  return "timeline";
});

const setTab = (tabKey) => {
  selectedAlbumId.value = null;
  router.push({
    name: photosRouteName.value,
    query: tabKey === "timeline" ? {} : { tab: tabKey },
  });
};

const headerSearchState = computed(() => headerSearchStore.getScopeState(searchScopeName.value));

const effectiveSearchQuery = computed(() => {
  const headerQ = String(headerSearchState.value?.searchQuery || "").trim();
  const localQ = String(localSearchQuery.value || "").trim();
  return (localQ || headerQ).toLowerCase();
});

const albums = computed(() => mediaPhotoStore.resolvedPhotoAlbums);

const activeAlbum = computed(() => {
  if (!selectedAlbumId.value) return null;
  return albums.value.find((a) => a.id === selectedAlbumId.value) || null;
});

const filterPhotoPool = (photos = []) => {
  return photos.filter((photo) => {
    if (!photo) return false;
    if (!props.vaultOnly) {
      if (scopeFilter.value === "owned" && photo.sharedWithMe) return false;
      if (scopeFilter.value === "shared" && !photo.sharedWithMe) return false;
    }
    if (categoryFilter.value !== "all" && photo.photoCategory !== categoryFilter.value) return false;
    if (activeMonthJump.value !== "all" && photo.yearMonthKey !== activeMonthJump.value) return false;

    const matchesQueryAndExt = matchesSearchItem({
      name: photo.name,
      extension: photo.extension,
      isFolder: false,
      searchQuery: effectiveSearchQuery.value,
      extensionFilter: headerSearchState.value?.extensionFilter || "all",
      extraSearchText: [photo.displayTitle, photo.yearMonthLabel, photo.dayLabel, photo.folderPathLabel],
    });
    if (!matchesQueryAndExt) {
      return false;
    }

    return true;
  });
};

const sortPhotoPool = (photos = []) => {
  const copy = [...photos];
  switch (sortOrder.value) {
    case "date-asc":
      return copy.sort((a, b) => a.effectiveDateMs - b.effectiveDateMs);
    case "name-asc":
      return copy.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko-KR"));
    case "size-desc":
      return copy.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
    case "date-desc":
    default:
      return copy.sort((a, b) => b.effectiveDateMs - a.effectiveDateMs);
  }
};

const basePhotoPool = computed(() => {
  if (activeAlbum.value) {
    return activeAlbum.value.photos;
  }
  if (activeTab.value === "favorites") {
    return mediaPhotoStore.favoritePhotos;
  }
  return mediaPhotoStore.allPhotos;
});

const availableYearMonths = computed(() => {
  const map = new Map();
  for (const photo of basePhotoPool.value) {
    if (!map.has(photo.yearMonthKey)) {
      map.set(photo.yearMonthKey, {
        key: photo.yearMonthKey,
        label: photo.yearMonthLabel,
        count: 0,
      });
    }
    map.get(photo.yearMonthKey).count += 1;
  }
  return Array.from(map.values());
});

const visiblePhotos = computed(() => {
  if (activeAlbum.value) {
    return filterPhotoPool(activeAlbum.value.photos);
  }
  return sortPhotoPool(filterPhotoPool(basePhotoPool.value));
});

// Group photos by Year-Month -> Day for Timeline View
const timelineGroups = computed(() => {
  const monthMap = new Map();
  for (const photo of visiblePhotos.value) {
    if (!monthMap.has(photo.yearMonthKey)) {
      monthMap.set(photo.yearMonthKey, {
        yearMonthKey: photo.yearMonthKey,
        yearMonthLabel: photo.yearMonthLabel,
        daysMap: new Map(),
        allPhotoIds: [],
      });
    }
    const monthGroup = monthMap.get(photo.yearMonthKey);
    monthGroup.allPhotoIds.push(String(photo.id));

    if (!monthGroup.daysMap.has(photo.dayKey)) {
      monthGroup.daysMap.set(photo.dayKey, {
        dayKey: photo.dayKey,
        dayLabel: photo.dayLabel,
        photos: [],
        photoIds: [],
      });
    }
    const dayGroup = monthGroup.daysMap.get(photo.dayKey);
    dayGroup.photos.push(photo);
    dayGroup.photoIds.push(String(photo.id));
  }

  return Array.from(monthMap.values()).map((m) => ({
    yearMonthKey: m.yearMonthKey,
    yearMonthLabel: m.yearMonthLabel,
    allPhotoIds: m.allPhotoIds,
    days: Array.from(m.daysMap.values()),
  }));
});

const gridColumnsClass = computed(() => {
  switch (gridDensity.value) {
    case "compact":
      return "grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1.5";
    case "large":
      return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4";
    case "xlarge":
      return "grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-5";
    case "normal":
    default:
      return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5";
  }
});

const albumGridColumnsClass = computed(() => {
  switch (gridDensity.value) {
    case "compact":
      return "grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
    case "large":
      return "grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3";
    case "xlarge":
      return "grid-cols-1 gap-6 lg:grid-cols-2";
    case "normal":
    default:
      return "grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  }
});

const photoThumbAspectClass = computed(() => {
  switch (photoThumbAspect.value) {
    case "portrait":
      return "aspect-[3/4]";
    case "landscape":
      return "aspect-[4/3]";
    case "square":
    default:
      return "aspect-square";
  }
});

const photoThumbFitClass = computed(() =>
  photoThumbFit.value === "contain" ? "object-contain bg-slate-950" : "object-cover",
);

const setGridDensity = (density) => {
  const normalized = PHOTO_DENSITY_ORDER.includes(density) ? density : "normal";
  mediaPhotoStore.updatePreferences({ photoGridDensity: normalized });
};

const stepGridDensity = (delta) => {
  const idx = PHOTO_DENSITY_ORDER.indexOf(gridDensity.value);
  const nextIdx = Math.max(0, Math.min(PHOTO_DENSITY_ORDER.length - 1, idx + delta));
  setGridDensity(PHOTO_DENSITY_ORDER[nextIdx]);
};

const setPhotoThumbAspect = (aspect) => {
  const allowed = ["square", "landscape", "portrait"];
  mediaPhotoStore.updatePreferences({
    photoThumbAspect: allowed.includes(aspect) ? aspect : "square",
  });
};

const setPhotoThumbFit = (fit) => {
  mediaPhotoStore.updatePreferences({
    photoThumbFit: fit === "contain" ? "contain" : "cover",
  });
};

const selectedIdSet = computed(() => new Set(selectedIds.value.map((id) => String(id))));

const isGroupAllSelected = (ids = []) => {
  return ids.length > 0 && ids.every((id) => selectedIdSet.value.has(String(id)));
};

const toggleSelectGroup = (ids = []) => {
  const stringIds = ids.map((id) => String(id));
  if (isGroupAllSelected(stringIds)) {
    const removeSet = new Set(stringIds);
    selectedIds.value = selectedIds.value.filter((id) => !removeSet.has(String(id)));
  } else {
    selectedIds.value = [...new Set([...selectedIds.value, ...stringIds])];
  }
};

const toggleSelectPhoto = (photo, event = null) => {
  if (!photo) return;
  const targetId = String(photo.id);
  const currentList = visiblePhotos.value;

  if (event?.shiftKey && lastSelectedAnchorId.value) {
    const anchorIdx = currentList.findIndex((p) => String(p.id) === String(lastSelectedAnchorId.value));
    const targetIdx = currentList.findIndex((p) => String(p.id) === targetId);
    if (anchorIdx >= 0 && targetIdx >= 0) {
      const [start, end] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
      const rangeIds = currentList.slice(start, end + 1).map((p) => String(p.id));
      selectedIds.value = [...new Set([...selectedIds.value, ...rangeIds])];
      return;
    }
  }

  lastSelectedAnchorId.value = targetId;
  if (selectedIdSet.value.has(targetId)) {
    selectedIds.value = selectedIds.value.filter((id) => String(id) !== targetId);
  } else {
    selectedIds.value = [...selectedIds.value, targetId];
  }
};

const selectAllVisible = () => {
  const allIds = visiblePhotos.value.map((p) => String(p.id));
  if (isGroupAllSelected(allIds)) {
    selectedIds.value = [];
  } else {
    selectedIds.value = allIds;
  }
};

const clearSelection = () => {
  selectedIds.value = [];
};

const handleOpenPhoto = (photo, slideshow = false) => {
  if (!photo) return;
  const poolIds = visiblePhotos.value.map((p) => String(p.id));
  mediaPhotoStore.openPhotoLightbox(photo.id, {
    poolIds,
    slideshow,
  });
};

const handleStartSlideshow = () => {
  if (!visiblePhotos.value.length) return;
  handleOpenPhoto(visiblePhotos.value[0], true);
};

// Prime cached thumbnails synchronously; defer remote loads to IntersectionObserver when available
const primeThumbnails = async () => {
  if (thumbAbortController) {
    thumbAbortController.abort();
  }
  pendingThumbKeys.clear();
  const controller = new AbortController();
  thumbAbortController = controller;

  const candidates = [
    ...visiblePhotos.value,
    ...albums.value.map((a) => a.coverPhoto).filter(Boolean),
  ];

  const seen = new Set();
  const cachedUpdates = {};
  const uncachedCandidates = [];
  for (const photo of candidates) {
    if (!photo || photo.id == null) continue;
    const key = String(photo.id);
    if (seen.has(key) || thumbnailMap.value[key]) continue;
    seen.add(key);

    const cached =
      getCachedFileThumbnailUrl(photo) ||
      resolveFileThumbnailFallbackUrl(photo) ||
      (!isEncryptedVaultFile(photo) ? resolveFilePlaybackUrl(photo) : "");
    if (cached) {
      cachedUpdates[key] = cached;
      continue;
    }

    uncachedCandidates.push(photo);
  }
  if (Object.keys(cachedUpdates).length > 0) {
    thumbnailMap.value = { ...thumbnailMap.value, ...cachedUpdates };
  }

  // Fallback for environments without IntersectionObserver (e.g. jsdom unit tests)
  if (typeof IntersectionObserver === "undefined") {
    for (const photo of uncachedCandidates.slice(0, 24)) {
      loadSinglePhotoThumbnail(photo, "high");
    }
  }
};

// Album CRUD Modal
const albumPickerCandidates = computed(() => {
  const q = albumPickerSearch.value.trim().toLowerCase();
  if (!q) return mediaPhotoStore.candidatePhotos;
  return mediaPhotoStore.candidatePhotos.filter((p) => String(p.name || "").toLowerCase().includes(q));
});

// Photo Source File / Folder Designation Modal
const photoFolderCandidateList = computed(() => {
  const q = photoSourcePickerSearch.value.trim().toLowerCase();
  return mediaPhotoStore.allDriveFolders
    .map((folder) => {
      const folderPhotoCount = mediaPhotoStore.candidatePhotos.filter(
        (p) => String(p.parentId ?? "") === String(folder.id),
      ).length;
      return {
        ...folder,
        folderPhotoCount,
      };
    })
    .filter((folder) => {
      if (!q) return true;
      return (
        String(folder.name || "").toLowerCase().includes(q) ||
        String(folder.pathLabel || "").toLowerCase().includes(q)
      );
    });
});

const photoFileCandidateList = computed(() => {
  const q = photoSourcePickerSearch.value.trim().toLowerCase();
  if (!q) return mediaPhotoStore.candidatePhotos;
  return mediaPhotoStore.candidatePhotos.filter(
    (p) =>
      String(p.name || "").toLowerCase().includes(q) ||
      String(p.folderPathLabel || "").toLowerCase().includes(q),
  );
});

const openPhotoSourcePickerModal = (defaultTab = "files") => {
  photoSourcePickerTab.value = defaultTab;
  photoSourcePickerSearch.value = "";
  photoSourcePickerSelectedFileIds.value = [...mediaPhotoStore.photoIncludedFileIds];
  photoSourcePickerSelectedFolderIds.value = [...mediaPhotoStore.photoIncludedFolderIds];
  isPhotoSourcePickerModalOpen.value = true;
};

const togglePhotoSourcePickerFolder = (folderId) => {
  const key = String(folderId);
  if (photoSourcePickerSelectedFolderIds.value.includes(key)) {
    photoSourcePickerSelectedFolderIds.value = photoSourcePickerSelectedFolderIds.value.filter((id) => id !== key);
  } else {
    photoSourcePickerSelectedFolderIds.value = [...photoSourcePickerSelectedFolderIds.value, key];
  }
};

const togglePhotoSourcePickerFile = (fileId) => {
  const key = String(fileId);
  if (photoSourcePickerSelectedFileIds.value.includes(key)) {
    photoSourcePickerSelectedFileIds.value = photoSourcePickerSelectedFileIds.value.filter((id) => id !== key);
  } else {
    photoSourcePickerSelectedFileIds.value = [...photoSourcePickerSelectedFileIds.value, key];
  }
};

const toggleSelectAllCandidatePhotos = () => {
  const visibleIds = photoFileCandidateList.value.map((p) => String(p.id));
  const allSelected =
    visibleIds.length > 0 &&
    visibleIds.every((id) => photoSourcePickerSelectedFileIds.value.includes(id));
  if (allSelected) {
    const removeSet = new Set(visibleIds);
    photoSourcePickerSelectedFileIds.value = photoSourcePickerSelectedFileIds.value.filter((id) => !removeSet.has(id));
  } else {
    photoSourcePickerSelectedFileIds.value = [...new Set([...photoSourcePickerSelectedFileIds.value, ...visibleIds])];
  }
};

const savePhotoSourcePickerModal = () => {
  const currentSet = new Set(mediaPhotoStore.photoIncludedFileIds.map((id) => String(id)));
  const nextSet = new Set(photoSourcePickerSelectedFileIds.value.map((id) => String(id)));
  const toRemove = [...currentSet].filter((id) => !nextSet.has(id));
  if (toRemove.length) {
    mediaPhotoStore.removePhotoFiles(toRemove);
  }
  if (nextSet.size > 0) {
    mediaPhotoStore.addPhotoFiles([...nextSet]);
  }
  mediaPhotoStore.setPhotoIncludedFolders(photoSourcePickerSelectedFolderIds.value);
  mediaPhotoStore.updatePreferences({ photoSourceMode: "manual" });
  isPhotoSourcePickerModalOpen.value = false;
};

const totalExcludedPhotosCount = computed(() =>
  (mediaPhotoStore.excludedPhotos?.length || 0) + (mediaPhotoStore.excludedPhotoFolders?.length || 0),
);

const handleBatchExcludeFromPhotos = () => {
  if (!selectedIds.value.length) return;
  (mediaPhotoStore.excludePhotoFiles || mediaPhotoStore.removePhotoFiles)(selectedIds.value);
  clearSelection();
};

const handleExcludeSinglePhoto = (photo) => {
  if (!photo || photo.id == null) return;
  photoContextMenu.value = { visible: false, x: 0, y: 0, photo: null };
  (mediaPhotoStore.excludePhotoFiles || mediaPhotoStore.removePhotoFiles)([photo.id]);
  const excludedKey = String(photo.id);
  selectedIds.value = selectedIds.value.filter((id) => String(id) !== excludedKey);
};

const openPhotoTileContextMenu = (event, photo) => {
  if (!photo) return;
  const menuWidth = 232;
  const maxX = Math.max(16, (window.innerWidth || 1024) - menuWidth - 16);
  const maxY = Math.max(16, (window.innerHeight || 768) - 290 - 16);
  photoContextMenu.value = {
    visible: true,
    x: Math.min(Math.max(12, event?.clientX || 0), maxX),
    y: Math.min(Math.max(12, event?.clientY || 0), maxY),
    photo,
  };
};

const handleRestoreAllExcludedPhotos = () => {
  const fileIds = (mediaPhotoStore.excludedPhotos || []).map((p) => p.id);
  const folders = mediaPhotoStore.excludedPhotoFolders || [];
  if (fileIds.length > 0) {
    mediaPhotoStore.restoreExcludedPhotoFiles?.(fileIds);
  }
  for (const folder of folders) {
    mediaPhotoStore.restoreExcludedPhotoFolder?.(folder.id);
  }
  isExcludedPhotosModalOpen.value = false;
};

const openCreateAlbumModal = (preselectedIds = []) => {
  editingAlbumId.value = null;
  albumFormName.value = "";
  albumFormDesc.value = "";
  albumFormSelectedIds.value = preselectedIds.map((id) => String(id));
  albumFormCoverId.value = albumFormSelectedIds.value[0] || null;
  albumPickerSearch.value = "";
  isAlbumModalOpen.value = true;
};

const openEditAlbumModal = (album) => {
  if (!album) return;
  editingAlbumId.value = album.id;
  albumFormName.value = album.name || "";
  albumFormDesc.value = album.description || "";
  albumFormSelectedIds.value = [...(album.photoIds || [])];
  albumFormCoverId.value = album.coverFileId || album.photoIds?.[0] || null;
  albumPickerSearch.value = "";
  isAlbumModalOpen.value = true;
};

const toggleAlbumPickerPhoto = (photoId) => {
  const key = String(photoId);
  if (albumFormSelectedIds.value.includes(key)) {
    albumFormSelectedIds.value = albumFormSelectedIds.value.filter((id) => id !== key);
    if (String(albumFormCoverId.value) === key) {
      albumFormCoverId.value = albumFormSelectedIds.value[0] || null;
    }
  } else {
    albumFormSelectedIds.value = [...albumFormSelectedIds.value, key];
    if (!albumFormCoverId.value) {
      albumFormCoverId.value = key;
    }
  }
};

const saveAlbumModal = () => {
  const name = albumFormName.value.trim();
  if (!name) {
    window.alert("앨범 이름을 입력해 주세요.");
    return;
  }

  if (editingAlbumId.value) {
    mediaPhotoStore.updatePhotoAlbum(editingAlbumId.value, {
      name,
      description: albumFormDesc.value,
      photoIds: albumFormSelectedIds.value,
      coverFileId: albumFormCoverId.value,
    });
  } else {
    const created = mediaPhotoStore.createPhotoAlbum({
      name,
      description: albumFormDesc.value,
      photoIds: albumFormSelectedIds.value,
      coverFileId: albumFormCoverId.value,
    });
    if (created && activeTab.value === "albums") {
      selectedAlbumId.value = created.id;
    }
  }

  isAlbumModalOpen.value = false;
  clearSelection();
};

const handleDeleteAlbum = (album) => {
  if (!album) return;
  if (!window.confirm(`'${album.name}' 앨범을 삭제하시겠습니까?\n(앨범만 삭제되며 ${storageNoun.value}의 원본 사진은 삭제되지 않습니다.)`)) {
    return;
  }
  mediaPhotoStore.deletePhotoAlbum(album.id);
  if (selectedAlbumId.value === album.id) {
    selectedAlbumId.value = null;
  }
};

const openBatchAddToAlbum = (targetIds = selectedIds.value) => {
  addToAlbumTargetIds.value = targetIds.map((id) => String(id));
  isAddToAlbumModalOpen.value = true;
};

const applyBatchAddToAlbum = (albumId) => {
  mediaPhotoStore.addPhotosToAlbum(albumId, addToAlbumTargetIds.value);
  isAddToAlbumModalOpen.value = false;
  clearSelection();
};

const handleBatchFavorite = (favorite = true) => {
  mediaPhotoStore.setPhotoFavoritesBatch(selectedIds.value, favorite);
  clearSelection();
};

const handleBatchDownload = async () => {
  const idSet = new Set(selectedIds.value.map((id) => String(id)));
  const targets = visiblePhotos.value.filter((p) => idSet.has(String(p.id)));
  for (const photo of targets) {
    try {
      await downloadFileAsset(photo, photo.name || "photo");
    } catch {
      // Continue
    }
  }
};

const handleBatchTrashOriginal = async () => {
  if (!selectedIds.value.length) return;
  if (
    !window.confirm(
      `선택한 사진 ${selectedIds.value.length}장의 원본 파일을 휴지통으로 이동하시겠습니까?\n(${props.vaultOnly ? "비밀 폴더 휴지통으로 이동되며" : "파일 저장소와"} 모든 앨범에서 함께 숨겨집니다.)`,
    )
  ) {
    return;
  }
  try {
    await fileStore.trashFilesBatch(selectedIds.value);
    clearSelection();
  } catch (error) {
    window.alert(error?.response?.data?.message || error?.message || "휴지통으로 이동하지 못했습니다.");
  }
};

const handleShareAlbum = (album) => {
  if (props.vaultOnly) return;
  if (!album || !album.photos?.length) {
    window.alert("공유할 사진이 없는 앨범입니다.");
    return;
  }
  const shareable = album.photos.filter((p) => !p.sharedWithMe && !p.lockedFile);
  if (!shareable.length) {
    window.alert("공유 가능한 내 소유 사진이 없습니다.");
    return;
  }
  openShareDialog(shareable);
};

const onUploadInputChange = (event) => {
  const files = Array.from(event?.target?.files || []);
  if (files.length > 0) {
    let uploadParentId = fileStore.currentFolderId ?? null;
    if (uploadParentId != null) {
      const currentFolder = fileStore.fileById.get(String(uploadParentId));
      const isVaultFolder = Boolean(
        currentFolder && (currentFolder.isVaultSpace || String(currentFolder.spaceType || "").toUpperCase() === "VAULT"),
      );
      if (props.vaultOnly ? !isVaultFolder : isVaultFolder) {
        uploadParentId = null;
      }
    }
    triggerDesktopUpload(files, uploadParentId, []);
  }
  if (event?.target) {
    event.target.value = "";
  }
};

const closeFloatingPopovers = () => {
  isSettingsPopoverOpen.value = false;
  if (photoContextMenu.value.visible) {
    photoContextMenu.value = { visible: false, x: 0, y: 0, photo: null };
  }
};

watch(
  () => [visiblePhotos.value.length, albums.value.length, activeTab.value],
  () => {
    void primeThumbnails();
  },
  { immediate: true },
);

onMounted(async () => {
  window.addEventListener("click", closeFloatingPopovers);
  await mediaPhotoStore.ensureCatalogLoaded({ scope: props.vaultOnly ? "vault" : "normal" });
  void primeThumbnails();
});

onBeforeUnmount(() => {
  window.removeEventListener("click", closeFloatingPopovers);
  if (thumbnailObserver) {
    thumbnailObserver.disconnect();
    thumbnailObserver = null;
  }
  pendingThumbKeys.clear();
  if (thumbAbortController) {
    thumbAbortController.abort();
  }
});
</script>

<template>
  <div class="photos-hub-view space-y-6 pb-16">
    <!-- Hidden File Input for Direct Photo Upload -->
    <input
      ref="uploadInputRef"
      type="file"
      accept="image/*"
      multiple
      class="hidden"
      @change="onUploadInputChange"
    />

    <!-- Top Hero & Toolbar -->
    <section class="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4 shadow-sm sm:p-6">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex items-center gap-3">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-md"
            :class="vaultOnly ? 'bg-gradient-to-br from-amber-500 to-rose-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'"
          >
            <i class="fa-solid fa-images text-lg"></i>
          </div>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="text-xl font-black tracking-tight text-[var(--text-main)] sm:text-2xl">
                {{ vaultOnly ? "비밀 사진첩" : "사진첩" }}
              </h1>
              <span
                class="rounded-full px-2.5 py-0.5 text-[11px] font-extrabold"
                :class="mediaPhotoStore.preferences.photoSourceMode === 'all'
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : 'bg-blue-500/15 text-blue-500'"
              >
                {{ mediaPhotoStore.preferences.photoSourceMode === "all" ? `${storageNoun} 전체 자동 표시` : "지정한 사진·폴더만 표시" }}
              </span>
            </div>
            <p class="text-xs font-medium text-[var(--text-muted)]">
              표시 중인 사진 {{ mediaPhotoStore.allPhotos.length }}장 ({{ storageNoun }} 전체 {{ mediaPhotoStore.candidatePhotos.length }}장) · 앨범 {{ albums.length }}개 · 즐겨찾기 {{ mediaPhotoStore.favoritePhotos.length }}장
            </p>
          </div>
        </div>

        <!-- Primary Action Buttons -->
        <div class="flex flex-wrap items-center gap-2">
          <!-- Source Mode Quick Switcher -->
          <div class="inline-flex rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] p-1 text-xs font-extrabold">
            <button
              type="button"
              class="rounded-xl px-3 py-1.5 transition"
              :class="mediaPhotoStore.preferences.photoSourceMode === 'manual'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
              title="내가 직접 선택한 사진과 폴더만 사진첩에 표시합니다"
              @click="mediaPhotoStore.updatePreferences({ photoSourceMode: 'manual' })"
            >
              지정 항목만 ({{ mediaPhotoStore.photoIncludedFileIds.length + mediaPhotoStore.photoIncludedFolderIds.length }})
            </button>
            <button
              type="button"
              class="rounded-xl px-3 py-1.5 transition"
              :class="mediaPhotoStore.preferences.photoSourceMode === 'all'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
              :title="`${storageNoun}의 모든 사진을 자동으로 표시합니다`"
              @click="mediaPhotoStore.updatePreferences({ photoSourceMode: 'all' })"
            >
              모든 사진 자동 ({{ mediaPhotoStore.candidatePhotos.length }})
            </button>
          </div>

          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-extrabold text-emerald-500 transition hover:bg-emerald-500/20"
            @click="openPhotoSourcePickerModal('files')"
          >
            <i class="fa-solid fa-folder-plus"></i>
            <span>+ {{ storageNoun }} 사진·폴더 지정</span>
          </button>

          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-500"
            @click="uploadInputRef?.click()"
          >
            <i class="fa-solid fa-cloud-arrow-up"></i>
            <span>+ 새 사진 업로드</span>
          </button>

          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] px-4 py-2.5 text-xs font-extrabold text-[var(--text-main)] transition hover:bg-[var(--bg-input)]"
            @click="openCreateAlbumModal(selectedIds)"
          >
            <i class="fa-solid fa-book-open text-emerald-500"></i>
            <span>+ 새 앨범 만들기</span>
          </button>

          <button
            v-if="visiblePhotos.length > 0"
            type="button"
            class="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] px-4 py-2.5 text-xs font-extrabold text-[var(--text-main)] transition hover:bg-[var(--bg-input)]"
            @click="handleStartSlideshow"
          >
            <i class="fa-solid fa-play text-blue-500"></i>
            <span>슬라이드쇼</span>
          </button>

          <!-- Photo Preferences Popover -->
          <div class="relative" @click.stop>
            <button
              type="button"
              class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
              title="사진첩 설정"
              @click="isSettingsPopoverOpen = !isSettingsPopoverOpen"
            >
              <i class="fa-solid fa-sliders"></i>
            </button>

            <div
              v-if="isSettingsPopoverOpen"
              class="absolute right-0 top-12 z-40 w-72 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4 shadow-2xl space-y-3 text-xs max-sm:fixed max-sm:left-3 max-sm:right-3 max-sm:top-auto max-sm:bottom-[calc(4.65rem+env(safe-area-inset-bottom,0px))] max-sm:z-[130] max-sm:w-auto max-sm:max-h-[62dvh] max-sm:overflow-y-auto"
            >
              <div class="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
                <span class="font-extrabold text-[var(--text-main)]">사진첩 환경설정</span>
              </div>

              <div class="space-y-1.5 border-b border-[var(--border-color)] pb-2.5">
                <span class="block font-bold text-[var(--text-main)]">사진 표시 기준</span>
                <select
                  :value="mediaPhotoStore.preferences.photoSourceMode"
                  class="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-main)]"
                  @change="mediaPhotoStore.updatePreferences({ photoSourceMode: $event.target.value })"
                >
                  <option value="manual">지정한 사진·폴더만 표시 (기본)</option>
                  <option value="all">{{ storageNoun }}의 모든 사진 자동 표시</option>
                </select>
              </div>

              <div class="flex items-center justify-between">
                <span class="text-[var(--text-secondary)]">날짜 정렬 기준</span>
                <select
                  :value="mediaPhotoStore.preferences.photoDateBasis"
                  class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1 text-xs font-bold text-[var(--text-main)]"
                  @change="mediaPhotoStore.updatePreferences({ photoDateBasis: $event.target.value })"
                >
                  <option value="capture">촬영 날짜 우선</option>
                  <option value="upload">업로드 날짜 기준</option>
                </select>
              </div>

              <div class="flex items-center justify-between">
                <span class="text-[var(--text-secondary)]">슬라이드쇼 간격</span>
                <select
                  :value="mediaPhotoStore.preferences.slideshowIntervalSec"
                  class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1 text-xs font-bold text-[var(--text-main)]"
                  @change="mediaPhotoStore.updatePreferences({ slideshowIntervalSec: Number($event.target.value) })"
                >
                  <option :value="3">3초</option>
                  <option :value="5">5초 (기본)</option>
                  <option :value="10">10초</option>
                </select>
              </div>

              <label v-if="!vaultOnly" class="flex items-center justify-between cursor-pointer">
                <span class="text-[var(--text-secondary)]">공유 시 위치정보(EXIF) 보호</span>
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded text-blue-600"
                  :checked="mediaPhotoStore.preferences.hideSensitiveExifOnShare"
                  @change="mediaPhotoStore.updatePreferences({ hideSensitiveExifOnShare: $event.target.checked })"
                />
              </label>

              <div class="space-y-2 border-t border-[var(--border-color)] pt-2">
                <span class="block font-bold text-[var(--text-main)]">썸네일 표시 옵션</span>

                <div class="flex items-center justify-between">
                  <span class="text-[var(--text-secondary)]">사진 크기</span>
                  <select
                    :value="gridDensity"
                    class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1 text-xs font-bold text-[var(--text-main)]"
                    @change="setGridDensity($event.target.value)"
                  >
                    <option value="compact">작게 (고밀도)</option>
                    <option value="normal">보통 (기본)</option>
                    <option value="large">크게</option>
                    <option value="xlarge">특대</option>
                  </select>
                </div>

                <div class="flex items-center justify-between">
                  <span class="text-[var(--text-secondary)]">썸네일 비율</span>
                  <select
                    :value="photoThumbAspect"
                    class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1 text-xs font-bold text-[var(--text-main)]"
                    @change="setPhotoThumbAspect($event.target.value)"
                  >
                    <option value="square">1:1 정사각형</option>
                    <option value="landscape">4:3 가로형</option>
                    <option value="portrait">3:4 세로형</option>
                  </select>
                </div>

                <div class="flex items-center justify-between">
                  <span class="text-[var(--text-secondary)]">사진 채우기</span>
                  <select
                    :value="photoThumbFit"
                    class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1 text-xs font-bold text-[var(--text-main)]"
                    @change="setPhotoThumbFit($event.target.value)"
                  >
                    <option value="cover">프레임 꽉 채우기</option>
                    <option value="contain">원본 전체 비율 유지</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sub-navigation Tabs & Filter Bar -->
      <div class="mt-5 flex flex-col gap-3 border-t border-[var(--border-color)] pt-4 xl:flex-row xl:items-center xl:justify-between">
        <!-- Main Tabs -->
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            v-for="tab in [
              { key: 'timeline', label: `모든 사진 (${mediaPhotoStore.allPhotos.length})`, icon: 'fa-regular fa-images' },
              { key: 'albums', label: `앨범 (${albums.length})`, icon: 'fa-solid fa-book-open' },
              { key: 'favorites', label: `즐겨찾기 (${mediaPhotoStore.favoritePhotos.length})`, icon: 'fa-solid fa-star' },
            ]"
            :key="tab.key"
            type="button"
            class="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-extrabold transition"
            :class="activeTab === tab.key && !selectedAlbumId
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
            @click="setTab(tab.key)"
          >
            <i :class="tab.icon"></i>
            <span>{{ tab.label }}</span>
          </button>

          <button
            v-if="totalExcludedPhotosCount > 0"
            type="button"
            data-testid="photos-excluded-open-btn"
            class="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs font-extrabold text-amber-500 transition hover:bg-amber-500/20"
            @click="isExcludedPhotosModalOpen = true"
          >
            <i class="fa-solid fa-eye-slash"></i>
            <span>제외 항목 ({{ totalExcludedPhotosCount }})</span>
          </button>
        </div>

        <!-- Search, Category, Sort & Density Controls -->
        <div class="flex flex-wrap items-center gap-2">
          <div class="relative min-w-0 w-full flex-1 sm:w-52 sm:flex-none">
            <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]"></i>
            <input
              v-model="localSearchQuery"
              type="text"
              placeholder="사진 이름·날짜·폴더 검색..."
              class="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] focus:border-blue-500 focus:outline-none"
            />
          </div>

          <select
            v-model="categoryFilter"
            class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1.5 text-xs font-bold text-[var(--text-main)] focus:outline-none"
          >
            <option value="all">모든 유형</option>
            <option value="camera">카메라 · 일반 사진</option>
            <option value="screenshot">스크린샷 · 그래픽</option>
          </select>

          <select
            v-model="sortOrder"
            class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1.5 text-xs font-bold text-[var(--text-main)] focus:outline-none"
          >
            <option value="date-desc">최신 날짜순</option>
            <option value="date-asc">오래된 날짜순</option>
            <option value="name-asc">이름 오름차순</option>
            <option value="size-desc">용량 큰 순</option>
          </select>

          <!-- Thumbnail Aspect Ratio & Fit Quick Controls -->
          <select
            :value="photoThumbAspect"
            title="썸네일 비율"
            class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-main)] focus:outline-none"
            @change="setPhotoThumbAspect($event.target.value)"
          >
            <option value="square">1:1</option>
            <option value="landscape">4:3</option>
            <option value="portrait">3:4</option>
          </select>

          <button
            type="button"
            class="rounded-xl border px-2.5 py-1.5 text-xs font-bold transition"
            :class="photoThumbFit === 'contain'
              ? 'border-blue-500/40 bg-blue-500/15 text-blue-500'
              : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
            title="사진 프레임 채우기 방식 전환 (꽉 채움 / 원본 비율 유지)"
            @click="setPhotoThumbFit(photoThumbFit === 'contain' ? 'cover' : 'contain')"
          >
            {{ photoThumbFit === "contain" ? "원본비율" : "채움" }}
          </button>

          <!-- Thumbnail Size Density Stepper & Presets -->
          <div
            class="inline-flex items-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] p-0.5 text-xs font-bold"
            role="group"
            aria-label="사진 썸네일 크기 조절"
          >
            <button
              type="button"
              class="rounded-lg px-2 py-1 text-[var(--text-secondary)] transition hover:text-[var(--text-main)] disabled:opacity-35"
              :disabled="gridDensity === 'compact'"
              title="사진 작게"
              @click="stepGridDensity(-1)"
            >
              <i class="fa-solid fa-minus text-[10px]"></i>
            </button>
            <button
              v-for="preset in PHOTO_DENSITY_ORDER"
              :key="preset"
              type="button"
              class="rounded-lg px-2 py-1 transition"
              :class="gridDensity === preset ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'"
              @click="setGridDensity(preset)"
            >
              {{ PHOTO_DENSITY_LABELS[preset] }}
            </button>
            <button
              type="button"
              class="rounded-lg px-2 py-1 text-[var(--text-secondary)] transition hover:text-[var(--text-main)] disabled:opacity-35"
              :disabled="gridDensity === 'xlarge'"
              title="사진 크게"
              @click="stepGridDensity(1)"
            >
              <i class="fa-solid fa-plus text-[10px]"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Year / Month Quick Jump Pills -->
      <div
        v-if="availableYearMonths.length > 1 && (activeTab !== 'albums' || selectedAlbumId)"
        class="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 pt-2"
      >
        <span class="shrink-0 text-[11px] font-bold text-[var(--text-muted)] mr-1">연/월 이동:</span>
        <button
          type="button"
          class="shrink-0 rounded-full px-3 py-1 text-xs font-bold transition"
          :class="activeMonthJump === 'all'
            ? 'bg-emerald-600 text-white'
            : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
          @click="activeMonthJump = 'all'"
        >
          전체 기간
        </button>
        <button
          v-for="ym in availableYearMonths"
          :key="ym.key"
          type="button"
          class="shrink-0 rounded-full px-3 py-1 text-xs font-bold transition"
          :class="activeMonthJump === ym.key
            ? 'bg-emerald-600 text-white'
            : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
          @click="activeMonthJump = ym.key"
        >
          {{ ym.label }} ({{ ym.count }})
        </button>
      </div>
    </section>

    <!-- Batch Selection Action Bar -->
    <div
      v-if="selectedIds.length > 0"
      class="sticky top-2 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-slate-900/95 px-4 py-3 text-xs text-white shadow-xl backdrop-blur-md"
    >
      <div class="flex items-center gap-3">
        <span class="rounded-full bg-emerald-600 px-3 py-1 font-extrabold">
          {{ selectedIds.length }}장 선택됨
        </span>
        <button
          type="button"
          class="font-semibold text-slate-300 hover:text-white"
          @click="selectAllVisible"
        >
          전체 선택/해제
        </button>
        <button
          type="button"
          class="font-semibold text-slate-400 hover:text-white"
          @click="clearSelection"
        >
          선택 취소
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-500"
          @click="openBatchAddToAlbum(selectedIds)"
        >
          <i class="fa-solid fa-book-open"></i>
          <span>앨범에 추가</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/20 px-3 py-1.5 font-bold text-amber-300 ring-1 ring-amber-400/40 hover:bg-amber-500/30"
          @click="handleBatchFavorite(true)"
        >
          <i class="fa-solid fa-star"></i>
          <span>즐겨찾기</span>
        </button>
        <button
          v-if="canCreateShares && selectedOwnedShareableFiles.length > 0"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 font-bold text-white hover:bg-blue-500"
          @click="openShareDialog(selectedOwnedShareableFiles)"
        >
          <i class="fa-solid fa-share-nodes"></i>
          <span>공유</span>
        </button>
        <button
          v-if="!vaultOnly && selectedOwnedShareableFiles.length === 1"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 font-bold text-white hover:bg-sky-500"
          @click="openDownloadLinkDialog(selectedOwnedShareableFiles[0])"
        >
          <i class="fa-solid fa-link"></i>
          <span>링크 공유</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 font-bold text-slate-200 hover:bg-slate-700"
          @click="handleBatchDownload"
        >
          <i class="fa-solid fa-download"></i>
          <span>다운로드</span>
        </button>
        <button
          v-if="activeAlbum"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl bg-orange-500/20 px-3 py-1.5 font-bold text-orange-300 hover:bg-orange-500/30"
          @click="mediaPhotoStore.removePhotosFromAlbum(activeAlbum.id, selectedIds); clearSelection()"
        >
          <i class="fa-solid fa-folder-minus"></i>
          <span>앨범에서 제외 (원본 유지)</span>
        </button>
        <button
          type="button"
          data-testid="photos-batch-exclude-btn"
          class="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/20 px-3 py-1.5 font-bold text-amber-300 hover:bg-amber-500/30"
          @click="handleBatchExcludeFromPhotos"
        >
          <i class="fa-solid fa-eye-slash"></i>
          <span>사진첩에서 제외 (원본 유지)</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl bg-rose-600/20 px-3 py-1.5 font-bold text-rose-300 ring-1 ring-rose-500/40 hover:bg-rose-600/30"
          @click="handleBatchTrashOriginal"
        >
          <i class="fa-solid fa-trash"></i>
          <span>원본 휴지통 이동</span>
        </button>
      </div>
    </div>

    <!-- [A] Albums Grid View (when activeTab === 'albums' and no album is open) -->
    <section
      v-if="activeTab === 'albums' && !selectedAlbumId"
      class="space-y-4"
    >
      <div class="flex items-center justify-between">
        <h2 class="text-base font-black text-[var(--text-main)]">내 사진 앨범 ({{ albums.length }})</h2>
        <button
          type="button"
          class="text-xs font-bold text-blue-500 hover:underline"
          @click="openCreateAlbumModal([])"
        >
          + 새 앨범 만들기
        </button>
      </div>

      <div
        v-if="albums.length === 0"
        class="rounded-3xl border border-dashed border-[var(--border-color)] bg-[var(--bg-elevated)] p-12 text-center"
      >
        <i class="fa-solid fa-book-open text-3xl text-emerald-500"></i>
        <h3 class="mt-3 text-base font-extrabold text-[var(--text-main)]">생성된 사진 앨범이 없습니다</h3>
        <button
          type="button"
          class="mt-4 rounded-2xl bg-blue-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-blue-500"
          @click="openCreateAlbumModal([])"
        >
          첫 앨범 만들기
        </button>
      </div>

      <div v-else class="grid" :class="albumGridColumnsClass">
        <div
          v-for="album in albums"
          :key="album.id"
          class="group flex flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <div
            :ref="(el) => observePhotoThumbnailEl(el, album.coverPhoto)"
            class="relative aspect-[4/3] w-full cursor-pointer overflow-hidden bg-slate-900"
            @click="selectedAlbumId = album.id"
          >
            <img
              v-if="album.coverPhoto && thumbnailMap[String(album.coverPhoto.id)]"
              :src="thumbnailMap[String(album.coverPhoto.id)]"
              :alt="album.name"
              class="h-full w-full transition duration-300 group-hover:scale-105"
              :class="photoThumbFitClass"
            />
            <div v-else class="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-900/60 to-slate-900 text-emerald-300">
              <i class="fa-regular fa-images text-3xl"></i>
            </div>

            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent"></div>

            <div class="absolute bottom-3 left-3 right-3 text-white">
              <div class="flex items-center justify-between">
                <span class="rounded bg-emerald-600/90 px-2 py-0.5 text-[10px] font-extrabold">
                  사진 {{ album.photoCount }}장
                </span>
                <span v-if="album.dateRangeLabel" class="text-[10px] text-slate-200">
                  {{ album.dateRangeLabel }}
                </span>
              </div>
              <h3 class="mt-1.5 truncate text-base font-black">{{ album.name }}</h3>
            </div>
          </div>

          <div class="flex items-center justify-between gap-2 p-3 text-xs">
            <span class="truncate text-[var(--text-muted)]">
              {{ album.description || "앨범 설명 없음" }}
            </span>
            <div class="flex shrink-0 items-center gap-1">
              <button
                v-if="canCreateShares && album.photoCount > 0"
                type="button"
                class="rounded-lg px-2 py-1 text-[11px] font-bold text-emerald-500 hover:bg-emerald-500/10"
                @click="handleShareAlbum(album)"
              >
                공유
              </button>
              <button
                type="button"
                class="rounded-lg px-2 py-1 text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-input)]"
                @click="openEditAlbumModal(album)"
              >
                편집
              </button>
              <button
                type="button"
                class="rounded-lg px-2 py-1 text-[11px] font-bold text-rose-500 hover:bg-rose-500/10"
                @click="handleDeleteAlbum(album)"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- [B] Active Album Detail Header Banner -->
    <section
      v-if="activeAlbum"
      class="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-5"
    >
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] text-[var(--text-main)]"
          @click="selectedAlbumId = null"
        >
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <div>
          <div class="flex items-center gap-2">
            <span class="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-extrabold text-white">앨범</span>
            <h2 class="text-lg font-black text-[var(--text-main)]">{{ activeAlbum.name }}</h2>
          </div>
          <p class="mt-0.5 text-xs text-[var(--text-muted)]">
            {{ activeAlbum.description || "사진 앨범" }} · 사진 {{ activeAlbum.photoCount }}장
            <span v-if="activeAlbum.dateRangeLabel">· {{ activeAlbum.dateRangeLabel }}</span>
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          v-if="activeAlbum.photoCount > 0"
          type="button"
          class="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-blue-500"
          @click="handleStartSlideshow"
        >
          <i class="fa-solid fa-play"></i>
          <span>앨범 슬라이드쇼</span>
        </button>
        <button
          v-if="canCreateShares && activeAlbum.photoCount > 0"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-2xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-500"
          @click="handleShareAlbum(activeAlbum)"
        >
          <i class="fa-solid fa-share-nodes"></i>
          <span>앨범 사진 공유</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3.5 py-2 text-xs font-bold text-[var(--text-main)]"
          @click="openEditAlbumModal(activeAlbum)"
        >
          <i class="fa-solid fa-pen"></i>
          <span>사진 추가·편집</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-500"
          @click="handleDeleteAlbum(activeAlbum)"
        >
          <i class="fa-solid fa-trash"></i>
          <span>앨범 삭제</span>
        </button>
      </div>
    </section>

    <!-- [C] Photo Timeline / Album Photos Section -->
    <section
      v-if="activeTab !== 'albums' || selectedAlbumId"
      class="space-y-6"
    >
      <!-- Empty State -->
      <div
        v-if="visiblePhotos.length === 0"
        class="rounded-3xl border border-dashed border-[var(--border-color)] bg-[var(--bg-elevated)] p-12 text-center"
      >
        <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
          <i class="fa-regular fa-images text-2xl"></i>
        </div>
        <h3 class="mt-4 text-base font-extrabold text-[var(--text-main)]">
          {{ mediaPhotoStore.preferences.photoSourceMode === "manual" && mediaPhotoStore.candidatePhotos.length > 0
            ? `현재 지정된 사진이 없습니다 (${storageNoun}에 사진 ${mediaPhotoStore.candidatePhotos.length}장 보관 중)`
            : "표시할 사진이 없습니다" }}
        </h3>
        <div class="mt-5 flex flex-wrap justify-center gap-2.5">
          <button
            type="button"
            class="rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-500"
            @click="openPhotoSourcePickerModal('files')"
          >
            + {{ storageNoun }}에서 원하는 사진·폴더 지정하기 ({{ mediaPhotoStore.candidatePhotos.length }}장)
          </button>
          <button
            v-if="mediaPhotoStore.preferences.photoSourceMode === 'manual' && mediaPhotoStore.candidatePhotos.length > 0"
            type="button"
            class="rounded-2xl border border-blue-500/40 bg-blue-500/10 px-4 py-2.5 text-xs font-extrabold text-blue-500 hover:bg-blue-500/20"
            @click="mediaPhotoStore.updatePreferences({ photoSourceMode: 'all' })"
          >
            {{ storageNoun }} 전체 사진 자동 표시로 전환 ({{ mediaPhotoStore.candidatePhotos.length }}장)
          </button>
          <button
            type="button"
            class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] px-4 py-2.5 text-xs font-extrabold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
            @click="uploadInputRef?.click()"
          >
            + 새 사진 업로드
          </button>
        </div>
      </div>

      <!-- Grouped Date Timeline -->
      <div
        v-for="monthGroup in timelineGroups"
        :key="monthGroup.yearMonthKey"
        class="space-y-4"
      >
        <!-- Year-Month Sticky Header -->
        <div class="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
          <div class="flex items-center gap-2.5">
            <label class="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                class="h-4 w-4 rounded text-blue-600"
                :checked="isGroupAllSelected(monthGroup.allPhotoIds)"
                @change="toggleSelectGroup(monthGroup.allPhotoIds)"
              />
              <h2 class="text-lg font-black text-[var(--text-main)]">
                {{ monthGroup.yearMonthLabel }}
              </h2>
            </label>
            <span class="rounded-full bg-[var(--bg-input)] px-2.5 py-0.5 text-xs font-bold text-[var(--text-muted)]">
              {{ monthGroup.allPhotoIds.length }}장
            </span>
          </div>
        </div>

        <!-- Day Sub-groups -->
        <div
          v-for="dayGroup in monthGroup.days"
          :key="dayGroup.dayKey"
          class="space-y-2.5"
        >
          <div class="flex items-center justify-between">
            <label class="inline-flex cursor-pointer items-center gap-2 text-xs font-extrabold text-[var(--text-secondary)]">
              <input
                type="checkbox"
                class="h-3.5 w-3.5 rounded text-blue-600"
                :checked="isGroupAllSelected(dayGroup.photoIds)"
                @change="toggleSelectGroup(dayGroup.photoIds)"
              />
              <span>{{ dayGroup.dayLabel }}</span>
              <span class="text-[11px] font-normal text-[var(--text-muted)]">({{ dayGroup.photos.length }}장)</span>
            </label>
          </div>

          <!-- Photo Tile Grid -->
          <div class="grid" :class="gridColumnsClass">
            <div
              v-for="photo in dayGroup.photos"
              :key="photo.id"
              :ref="(el) => observePhotoThumbnailEl(el, photo)"
              class="group relative cursor-pointer overflow-hidden rounded-2xl border bg-slate-900 transition"
              :class="[
                photoThumbAspectClass,
                selectedIdSet.has(String(photo.id))
                  ? 'border-blue-500 ring-3 ring-blue-500/40'
                  : 'border-[var(--border-color)]',
              ]"
              @click="handleOpenPhoto(photo, false)"
              @contextmenu.prevent="openPhotoTileContextMenu($event, photo)"
            >
              <img
                v-if="thumbnailMap[String(photo.id)]"
                :src="thumbnailMap[String(photo.id)]"
                :alt="photo.name"
                loading="lazy"
                class="h-full w-full transition duration-300 group-hover:scale-105"
                :class="[photoThumbFitClass, selectedIdSet.has(String(photo.id)) ? 'scale-95 rounded-xl' : '']"
              />
              <div v-else class="flex h-full w-full items-center justify-center text-slate-600">
                <i class="fa-regular fa-image text-2xl"></i>
              </div>

              <!-- Subtle Gradient Overlay -->
              <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/35 opacity-0 transition group-hover:opacity-100"></div>

              <!-- Top-left Selection Checkbox -->
              <div
                class="absolute left-2 top-2 z-10 transition"
                :class="selectedIdSet.has(String(photo.id)) ? 'opacity-100' : (selectedIdSet.size > 0 ? 'opacity-90' : 'opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60')"
                @click.stop
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 cursor-pointer rounded border-white/60 bg-black/60 text-blue-600 focus:ring-blue-500"
                  :checked="selectedIdSet.has(String(photo.id))"
                  @click="toggleSelectPhoto(photo, $event)"
                />
              </div>

              <!-- Top-right Quick Actions (Exclude & Favorite) -->
              <div class="absolute right-2 top-2 z-10 flex items-center gap-1">
                <button
                  type="button"
                  data-testid="photo-tile-exclude"
                  class="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-[11px] text-white/80 opacity-0 transition sm:group-hover:opacity-100 max-sm:opacity-65 hover:bg-amber-600/80 hover:text-white"
                  title="사진첩에서 제외 (원본 유지)"
                  @click.stop="handleExcludeSinglePhoto(photo)"
                >
                  <i class="fa-solid fa-eye-slash"></i>
                </button>
                <button
                  type="button"
                  class="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-xs transition"
                  :class="photo.isFavorite
                    ? 'text-amber-400 opacity-100'
                    : 'text-white/80 opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 hover:text-white'"
                  title="즐겨찾기"
                  @click.stop="mediaPhotoStore.togglePhotoFavorite(photo.id)"
                >
                  <i :class="photo.isFavorite ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
                </button>
              </div>

              <!-- Bottom Overlay Info -->
              <div class="pointer-events-none absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[11px] font-bold text-white opacity-0 transition group-hover:opacity-100">
                <span class="truncate">{{ photo.displayTitle }}</span>
                <span class="shrink-0 ml-1 text-[10px] text-slate-200">{{ photo.sizeLabel }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Create / Edit Photo Album Modal -->
    <Teleport to="body">
      <div
        v-if="isAlbumModalOpen"
        class="fixed inset-0 z-[280] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
        @click.self="isAlbumModalOpen = false"
      >
        <div class="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] shadow-2xl">
          <div class="flex items-center justify-between border-b border-[var(--border-color)] px-6 py-4">
            <h3 class="text-base font-black text-[var(--text-main)]">
              {{ editingAlbumId ? "사진 앨범 편집" : "새 사진 앨범 만들기" }}
            </h3>
            <button type="button" class="text-[var(--text-muted)] hover:text-[var(--text-main)]" @click="isAlbumModalOpen = false">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="flex-1 space-y-4 overflow-y-auto p-6 text-xs">
            <div>
              <label class="font-bold text-[var(--text-main)]">앨범 이름 *</label>
              <input
                v-model="albumFormName"
                type="text"
                placeholder="예: 2026 제주도 가족여행, 프로젝트 디자인 시안"
                class="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3.5 py-2.5 text-xs text-[var(--text-main)] focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label class="font-bold text-[var(--text-main)]">앨범 설명 (선택)</label>
              <input
                v-model="albumFormDesc"
                type="text"
                placeholder="앨범에 대한 설명이나 메모를 입력해 주세요"
                class="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3.5 py-2.5 text-xs text-[var(--text-main)] focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label class="font-bold text-[var(--text-main)]">
                앨범에 담을 사진 선택 ({{ albumFormSelectedIds.length }}장 선택됨)
              </label>
              <input
                v-model="albumPickerSearch"
                type="text"
                placeholder="사진 파일명 검색..."
                class="mt-2 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-main)]"
              />

              <div class="mt-2 max-h-60 space-y-1.5 overflow-y-auto rounded-2xl border border-[var(--border-color)] p-2">
                <div
                  v-for="cand in albumPickerCandidates"
                  :key="'alb-pick-' + cand.id"
                  class="flex items-center justify-between gap-2 rounded-xl px-3 py-2 hover:bg-[var(--bg-input)]"
                >
                  <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      class="h-4 w-4 rounded text-blue-600"
                      :checked="albumFormSelectedIds.includes(String(cand.id))"
                      @change="toggleAlbumPickerPhoto(cand.id)"
                    />
                    <span class="truncate font-semibold text-[var(--text-main)]">{{ cand.name }}</span>
                    <span class="shrink-0 text-[10px] text-[var(--text-muted)]">({{ cand.dayLabel }})</span>
                  </label>

                  <button
                    v-if="albumFormSelectedIds.includes(String(cand.id))"
                    type="button"
                    class="shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold"
                    :class="String(albumFormCoverId) === String(cand.id)
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[var(--bg-input)] text-[var(--text-muted)]'"
                    @click="albumFormCoverId = String(cand.id)"
                  >
                    {{ String(albumFormCoverId) === String(cand.id) ? "대표 사진" : "대표로 지정" }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 border-t border-[var(--border-color)] px-6 py-4">
            <button
              type="button"
              class="rounded-xl border border-[var(--border-color)] px-4 py-2 text-xs font-bold text-[var(--text-secondary)]"
              @click="isAlbumModalOpen = false"
            >
              취소
            </button>
            <button
              type="button"
              class="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-blue-500"
              @click="saveAlbumModal"
            >
              저장하기
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Quick Add to Album Modal -->
    <Teleport to="body">
      <div
        v-if="isAddToAlbumModalOpen"
        class="fixed inset-0 z-[280] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
        @click.self="isAddToAlbumModalOpen = false"
      >
        <div class="w-full max-w-md rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-6 shadow-2xl space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-black text-[var(--text-main)]">
              앨범에 사진 추가 ({{ addToAlbumTargetIds.length }}장)
            </h3>
            <button type="button" class="text-[var(--text-muted)]" @click="isAddToAlbumModalOpen = false">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div v-if="albums.length === 0" class="py-4 text-center text-xs text-[var(--text-muted)]">
            생성된 사진 앨범이 없습니다. 새 앨범을 만들어 보세요.
          </div>

          <div v-else class="max-h-60 space-y-2 overflow-y-auto">
            <button
              v-for="alb in albums"
              :key="'add-alb-' + alb.id"
              type="button"
              class="flex w-full items-center justify-between rounded-2xl border border-[var(--border-color)] px-4 py-3 text-left text-xs font-bold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
              @click="applyBatchAddToAlbum(alb.id)"
            >
              <span>{{ alb.name }}</span>
              <span class="text-[var(--text-muted)]">{{ alb.photoCount }}장</span>
            </button>
          </div>

          <button
            type="button"
            class="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-extrabold text-white hover:bg-blue-500"
            @click="isAddToAlbumModalOpen = false; openCreateAlbumModal(addToAlbumTargetIds)"
          >
            + 새 앨범 만들어 담기
          </button>
        </div>
      </div>
    </Teleport>

    <!-- Photo Source File / Folder Designation Modal -->
    <Teleport to="body">
      <div
        v-if="isPhotoSourcePickerModalOpen"
        class="fixed inset-0 z-[285] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
        @click.self="isPhotoSourcePickerModalOpen = false"
      >
        <div class="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] shadow-2xl">
          <div class="flex items-center justify-between border-b border-[var(--border-color)] px-6 py-4">
            <div>
              <h3 class="text-base font-black text-[var(--text-main)]">
                {{ vaultOnly ? "비밀 사진첩에 표시할 비밀 사진 · 폴더 지정" : "사진첩에 표시할 저장소 사진 · 폴더 지정" }}
              </h3>
              <p class="mt-0.5 text-xs text-[var(--text-muted)]">
                선택한 폴더 안의 사진이나 개별 사진만 사진첩에 표시되도록 구성할 수 있습니다.
              </p>
            </div>
            <button type="button" class="text-[var(--text-muted)] hover:text-[var(--text-main)]" @click="isPhotoSourcePickerModalOpen = false">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="flex-1 space-y-4 overflow-y-auto p-6 text-xs">
            <!-- Mode Quick Banner -->
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] p-3.5">
              <div>
                <p class="font-extrabold text-[var(--text-main)]">표시 모드 설정</p>
              </div>
              <div class="inline-flex rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-1">
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 font-extrabold transition"
                  :class="mediaPhotoStore.preferences.photoSourceMode === 'manual' ? 'bg-emerald-600 text-white' : 'text-[var(--text-secondary)]'"
                  @click="mediaPhotoStore.updatePreferences({ photoSourceMode: 'manual' })"
                >
                  지정 항목만 표시
                </button>
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 font-extrabold transition"
                  :class="mediaPhotoStore.preferences.photoSourceMode === 'all' ? 'bg-emerald-600 text-white' : 'text-[var(--text-secondary)]'"
                  @click="mediaPhotoStore.updatePreferences({ photoSourceMode: 'all' }); isPhotoSourcePickerModalOpen = false"
                >
                  모든 사진 자동 표시 ({{ mediaPhotoStore.candidatePhotos.length }}장)
                </button>
              </div>
            </div>

            <!-- Tabs: Individual Photos vs Folders -->
            <div class="flex items-center justify-between gap-2">
              <div class="inline-flex rounded-xl bg-[var(--bg-input)] p-1">
                <button
                  type="button"
                  class="rounded-lg px-3.5 py-1.5 font-extrabold transition"
                  :class="photoSourcePickerTab === 'files' ? 'bg-emerald-600 text-white' : 'text-[var(--text-secondary)]'"
                  @click="photoSourcePickerTab = 'files'"
                >
                  개별 사진 선택 ({{ photoSourcePickerSelectedFileIds.length }}장 선택됨)
                </button>
                <button
                  type="button"
                  class="rounded-lg px-3.5 py-1.5 font-extrabold transition"
                  :class="photoSourcePickerTab === 'folders' ? 'bg-emerald-600 text-white' : 'text-[var(--text-secondary)]'"
                  @click="photoSourcePickerTab = 'folders'"
                >
                  폴더 단위로 지정 ({{ photoSourcePickerSelectedFolderIds.length }}개 폴더)
                </button>
              </div>

              <button
                v-if="photoSourcePickerTab === 'files' && photoFileCandidateList.length > 0"
                type="button"
                class="font-bold text-emerald-500 hover:underline"
                @click="toggleSelectAllCandidatePhotos"
              >
                검색 결과 전체 선택/해제
              </button>
            </div>

            <input
              v-model="photoSourcePickerSearch"
              type="text"
              :placeholder="photoSourcePickerTab === 'files' ? `${storageNoun} 사진 이름 또는 폴더 경로 검색...` : '폴더 이름 또는 경로 검색...'"
              class="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3.5 py-2 text-xs text-[var(--text-main)]"
            />

            <!-- Individual Photo Files List -->
            <div
              v-if="photoSourcePickerTab === 'files'"
              class="max-h-72 space-y-1.5 overflow-y-auto rounded-2xl border border-[var(--border-color)] p-2"
            >
              <div v-if="photoFileCandidateList.length === 0" class="py-8 text-center text-[var(--text-muted)]">
                {{ storageNoun }}에 선택 가능한 사진이 없습니다.
              </div>
              <label
                v-for="photo in photoFileCandidateList"
                :key="'src-photo-' + photo.id"
                class="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--bg-input)]"
              >
                <div class="flex min-w-0 flex-1 items-center gap-2.5">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded text-emerald-600"
                    :checked="photoSourcePickerSelectedFileIds.includes(String(photo.id))"
                    @change="togglePhotoSourcePickerFile(photo.id)"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-bold text-[var(--text-main)]">{{ photo.name }}</p>
                    <p class="truncate text-[11px] text-[var(--text-muted)]">
                      {{ photo.folderPathLabel }} · {{ photo.dayLabel }} · {{ photo.sizeLabel }}
                    </p>
                  </div>
                </div>
                <span class="shrink-0 rounded-md bg-[var(--bg-input)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">
                  {{ photo.extension?.toUpperCase() || "IMAGE" }}
                </span>
              </label>
            </div>

            <!-- Drive Folders List -->
            <div
              v-else
              class="max-h-72 space-y-1.5 overflow-y-auto rounded-2xl border border-[var(--border-color)] p-2"
            >
              <div v-if="photoFolderCandidateList.length === 0" class="py-8 text-center text-[var(--text-muted)]">
                {{ storageNoun }}에 생성된 폴더가 없습니다.
              </div>
              <label
                v-for="folder in photoFolderCandidateList"
                :key="'src-pfolder-' + folder.id"
                class="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--bg-input)]"
              >
                <div class="flex min-w-0 flex-1 items-center gap-2.5">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded text-emerald-600"
                    :checked="photoSourcePickerSelectedFolderIds.includes(String(folder.id))"
                    @change="togglePhotoSourcePickerFolder(folder.id)"
                  />
                  <i class="fa-solid fa-folder text-amber-500"></i>
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-bold text-[var(--text-main)]">{{ folder.name }}</p>
                    <p class="truncate text-[11px] text-[var(--text-muted)]">
                      {{ folder.pathLabel }} (하위 폴더 포함 자동 반영)
                    </p>
                  </div>
                </div>
                <span class="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-500">
                  직속 사진 {{ folder.folderPhotoCount }}장
                </span>
              </label>
            </div>
          </div>

          <div class="flex items-center justify-between border-t border-[var(--border-color)] px-6 py-4 text-xs">
            <span class="font-bold text-[var(--text-muted)]">
              개별 사진 {{ photoSourcePickerSelectedFileIds.length }}장 · 지정 폴더 {{ photoSourcePickerSelectedFolderIds.length }}개
            </span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-xl border border-[var(--border-color)] px-4 py-2 font-bold text-[var(--text-secondary)]"
                @click="isPhotoSourcePickerModalOpen = false"
              >
                취소
              </button>
              <button
                type="button"
                class="rounded-xl bg-emerald-600 px-5 py-2 font-extrabold text-white hover:bg-emerald-500"
                @click="savePhotoSourcePickerModal"
              >
                지정 항목 적용하기
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Photo Tile Right-Click Context Menu -->
    <Teleport to="body">
      <div
        v-if="photoContextMenu.visible && photoContextMenu.photo"
        class="fixed z-[290] w-52 overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] py-1.5 text-xs shadow-2xl"
        :style="{ left: `${photoContextMenu.x}px`, top: `${photoContextMenu.y}px` }"
        @click.stop
        @contextmenu.prevent.stop
      >
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
          @click="handleOpenPhoto(photoContextMenu.photo, false); photoContextMenu.visible = false"
        >
          <i class="fa-solid fa-expand w-4 text-blue-500"></i>
          <span>크게 보기</span>
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
          @click="openBatchAddToAlbum([photoContextMenu.photo.id]); photoContextMenu.visible = false"
        >
          <i class="fa-solid fa-book-open w-4 text-emerald-500"></i>
          <span>앨범에 추가</span>
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
          @click="mediaPhotoStore.navigateToOriginalFolder(photoContextMenu.photo, router); photoContextMenu.visible = false"
        >
          <i class="fa-regular fa-folder-open w-4 text-amber-500"></i>
          <span>원본 폴더로 이동</span>
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
          @click="downloadFileAsset(photoContextMenu.photo, photoContextMenu.photo.name); photoContextMenu.visible = false"
        >
          <i class="fa-solid fa-download w-4 text-sky-500"></i>
          <span>원본 다운로드</span>
        </button>
        <div class="my-1 border-t border-[var(--border-color)]"></div>
        <button
          v-if="activeAlbum"
          type="button"
          class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-orange-500 hover:bg-orange-500/10"
          @click="mediaPhotoStore.removePhotosFromAlbum(activeAlbum.id, [photoContextMenu.photo.id]); photoContextMenu.visible = false"
        >
          <i class="fa-solid fa-folder-minus w-4"></i>
          <span>앨범에서 제외</span>
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-amber-500 hover:bg-amber-500/10"
          @click="handleExcludeSinglePhoto(photoContextMenu.photo)"
        >
          <i class="fa-solid fa-eye-slash w-4"></i>
          <span>사진첩에서 제외 (원본 유지)</span>
        </button>
      </div>
    </Teleport>

    <!-- Excluded Photos & Folders Restore Modal -->
    <Teleport to="body">
      <div
        v-if="isExcludedPhotosModalOpen"
        class="fixed inset-0 z-[290] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
        @click.self="isExcludedPhotosModalOpen = false"
      >
        <div class="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] shadow-2xl">
          <div class="flex items-center justify-between border-b border-[var(--border-color)] px-6 py-4">
            <div>
              <h3 class="text-base font-black text-[var(--text-main)]">사진첩 제외 항목 관리</h3>
              <p class="mt-0.5 text-xs text-[var(--text-muted)]">
                사진첩에서만 숨겨둔 항목입니다. {{ storageNoun }}의 원본 파일은 그대로 유지됩니다.
              </p>
            </div>
            <button type="button" class="text-[var(--text-muted)] hover:text-[var(--text-main)]" @click="isExcludedPhotosModalOpen = false">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="flex-1 space-y-2.5 overflow-y-auto p-5 text-xs">
            <div
              v-if="totalExcludedPhotosCount === 0"
              class="rounded-2xl border border-dashed border-[var(--border-color)] py-10 text-center text-[var(--text-muted)]"
            >
              제외된 사진이나 폴더가 없습니다.
            </div>

            <div
              v-for="folder in mediaPhotoStore.excludedPhotoFolders"
              :key="'excluded-pfolder-' + folder.id"
              class="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3"
            >
              <div class="flex min-w-0 flex-1 items-center gap-2.5">
                <i class="fa-solid fa-folder text-amber-500"></i>
                <div class="min-w-0">
                  <p class="truncate text-sm font-black text-[var(--text-main)]">{{ folder.name }}</p>
                  <p class="truncate text-[11px] text-[var(--text-muted)]">{{ folder.pathLabel }}</p>
                </div>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-xl bg-emerald-600 px-3 py-1.5 font-extrabold text-white hover:bg-emerald-500"
                @click="mediaPhotoStore.restoreExcludedPhotoFolder?.(folder.id)"
              >
                다시 표시
              </button>
            </div>

            <div
              v-for="photo in mediaPhotoStore.excludedPhotos"
              :key="'excluded-photo-' + photo.id"
              class="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-black text-[var(--text-main)]">{{ photo.name }}</p>
                <p class="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                  {{ photo.folderPathLabel }} · {{ photo.dayLabel }}
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-xl bg-emerald-600 px-3 py-1.5 font-extrabold text-white hover:bg-emerald-500"
                @click="mediaPhotoStore.restoreExcludedPhotoFiles?.([photo.id])"
              >
                다시 표시
              </button>
            </div>
          </div>

          <div class="flex items-center justify-between border-t border-[var(--border-color)] px-6 py-4 text-xs">
            <button
              v-if="totalExcludedPhotosCount >= 2"
              type="button"
              class="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 font-extrabold text-emerald-500 hover:bg-emerald-500/20"
              @click="handleRestoreAllExcludedPhotos"
            >
              모두 다시 표시 ({{ totalExcludedPhotosCount }}개)
            </button>
            <span v-else></span>
            <button
              type="button"
              class="rounded-xl border border-[var(--border-color)] px-4 py-2 font-bold text-[var(--text-secondary)] hover:text-[var(--text-main)]"
              @click="isExcludedPhotosModalOpen = false"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Share Dialog -->
    <BaseFileShareDialog
      v-if="!vaultOnly && shareTargets.length > 0"
      v-model:email="shareEmail"
      v-model:permission="sharePermission"
      v-model:expires-at="shareExpiresAt"
      v-model:download-limit="shareDownloadLimit"
      v-model:password="sharePassword"
      v-model:cancel-email="shareCancelEmail"
      v-model:target-user-ids="shareTargetUserIds"
      v-model:target-group-ids="shareTargetGroupIds"
      :targets="shareTargets"
      :permission-options="BASE_SHARE_PERMISSION_OPTIONS"
      :can-create-shares="canCreateShares"
      :is-sharing="isSharing"
      :is-overview-loading="isShareGroupOverviewLoading"
      :overview-users="shareOverviewUsers"
      :overview-groups="shareOverviewGroups"
      :error="shareError"
      :pending-invites="sharePendingInvites"
      :share-info="shareInfo"
      :is-info-loading="isShareInfoLoading"
      @close="closeShareDialog"
      @submit="submitShare"
      @cancel-share="cancelShare"
    />
    <DownloadShareLinkDialog
      v-if="!vaultOnly"
      v-model:duration-mode="downloadLinkDurationMode"
      v-model:custom-minutes="downloadLinkCustomMinutes"
      v-model:custom-expires-at="downloadLinkCustomExpiresAt"
      v-model:limit-mode="downloadLinkLimitMode"
      v-model:custom-max-downloads="downloadLinkCustomMaxDownloads"
      v-model:password="downloadLinkPassword"
      :open="isDownloadLinkDialogOpen"
      :target-file="downloadLinkTargetFile"
      :resolved-duration-minutes="downloadLinkResolvedMinutes"
      :resolved-max-downloads="downloadLinkResolvedMaxDownloads"
      :issued-link="downloadLinkIssued"
      :existing-links="downloadLinkHistory"
      :is-loading-links="isDownloadLinkLoading"
      :is-creating="isDownloadLinkCreating"
      :revoking-link-idx="revokingDownloadLinkIdx"
      :error-message="downloadLinkError"
      :copied-key="downloadLinkCopiedKey"
      :get-share-page-url="getDownloadSharePageUrl"
      :get-direct-download-url="getDownloadShareDirectUrl"
      @close="closeDownloadLinkDialog"
      @create="createDownloadLinkAction"
      @revoke="revokeDownloadLinkAction"
      @copy="copyDownloadShareUrl"
    />
  </div>
</template>
