<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useFileStore } from "@/stores/useFileStore.js";
import { useHeaderSearchStore } from "@/stores/useHeaderSearchStore.js";
import { useMediaPhotoStore } from "@/stores/useMediaPhotoStore.js";
import { downloadFileAsset } from "@/api/filesApi.js";
import { getCachedFileThumbnailUrl, loadFileThumbnailUrl } from "@/utils/fileThumbnailCache.js";
import { resolveFileThumbnailFallbackUrl } from "@/utils/fileMediaUrl.js";
import { triggerDesktopUpload } from "@/utils/desktopDropUpload.js";
import { matchesSearchItem } from "@/utils/fileSearch.js";
import BaseFileShareDialog from "@/components/BaseFileShareDialog.vue";
import DownloadShareLinkDialog from "@/components/DownloadShareLinkDialog.vue";
import MediaHeaderToolbar from "@/components/media/MediaHeaderToolbar.vue";
import MediaSettingsModal from "@/components/media/MediaSettingsModal.vue";
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

const mediaRouteName = computed(() => (props.vaultOnly ? "secretMedia" : "media"));
const searchScopeName = computed(() => (props.vaultOnly ? "secretMedia" : "media"));
const storageNoun = computed(() => (props.vaultOnly ? "비밀 공간" : "저장소"));

const uploadInputRef = ref(null);
const localSearchQuery = ref("");
const scopeFilter = ref("all"); // 'all' | 'owned' | 'shared'
const statusFilter = ref("all"); // 'all' | 'unwatched' | 'watching' | 'completed'
const sortOption = ref("added-desc"); // 'added-desc' | 'watched-desc' | 'duration-desc' | 'name-asc' | 'size-desc'
const seriesEpisodeSortOption = ref("episode-asc"); // 'episode-asc' | 'added-desc' | 'watched-desc' | 'duration-desc' | 'name-asc' | 'size-desc'
const MEDIA_DENSITY_ORDER = ["compact", "normal", "large", "xlarge"];
const viewMode = computed(() =>
  mediaPhotoStore.preferences.mediaViewMode === "list" ? "list" : "card",
);
const gridDensity = computed(() => {
  const val = mediaPhotoStore.preferences.mediaGridDensity;
  return MEDIA_DENSITY_ORDER.includes(val) ? val : "normal";
});
const showThumbnails = computed(() => mediaPhotoStore.preferences.mediaShowThumbnails !== false);
const thumbAspect = computed(() => mediaPhotoStore.preferences.mediaThumbAspect || "video");

const setViewMode = (mode) => {
  mediaPhotoStore.updatePreferences({ mediaViewMode: mode === "list" ? "list" : "card" });
};

const setGridDensity = (density) => {
  const normalized = MEDIA_DENSITY_ORDER.includes(density) ? density : "normal";
  mediaPhotoStore.updatePreferences({ mediaGridDensity: normalized });
};

const toggleShowThumbnails = () => {
  mediaPhotoStore.updatePreferences({ mediaShowThumbnails: !showThumbnails.value });
};

const setThumbAspect = (aspect) => {
  const allowed = ["video", "classic", "square", "poster"];
  mediaPhotoStore.updatePreferences({
    mediaThumbAspect: allowed.includes(aspect) ? aspect : "video",
  });
};

const mediaGridColsClass = computed(() => {
  switch (gridDensity.value) {
    case "compact":
      return "grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
    case "large":
      return "grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3";
    case "xlarge":
      return "grid-cols-1 gap-6 lg:grid-cols-2";
    case "normal":
    default:
      return "grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  }
});

const seriesGridColsClass = computed(() => {
  switch (gridDensity.value) {
    case "compact":
      return "grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
    case "large":
      return "grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3";
    case "xlarge":
      return "grid-cols-1 gap-6 lg:grid-cols-2";
    case "normal":
    default:
      return "grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  }
});

const thumbAspectClass = computed(() => {
  switch (thumbAspect.value) {
    case "classic":
      return "aspect-[4/3]";
    case "square":
      return "aspect-square";
    case "poster":
      return "aspect-[3/4]";
    case "video":
    default:
      return "aspect-video";
  }
});

const listThumbSizeClass = computed(() => {
  switch (gridDensity.value) {
    case "compact":
      return "h-11 w-20";
    case "large":
      return "h-24 w-44 max-sm:h-20 max-sm:w-32";
    case "xlarge":
      return "h-32 w-56 max-sm:h-24 max-sm:w-40";
    case "normal":
    default:
      return "h-16 w-28 max-sm:h-14 max-sm:w-24";
  }
});

const selectedIds = ref([]);
const lastSelectedAnchorId = ref(null);
const activeMenuCardId = ref(null);
const selectedCollectionId = ref(null);

// Series state
const selectedSeriesId = ref(null);
const selectedSeasonFolderId = ref("all-seasons");
const selectedSeriesIds = ref([]);
const activeSeriesMenuId = ref(null);

// Series Editor & Merge Modal state
const isSeriesEditorModalOpen = ref(false);
const editingSeriesId = ref(null);
const seriesEditorTitle = ref("");
const seriesEditorFolderIds = ref([]);
const seriesEditorSeasonLabels = ref({});
const seriesEditorSearch = ref("");

const isMergeSeriesModalOpen = ref(false);
const mergeTargetSeriesId = ref("");
const mergeCustomTitle = ref("");
const isRemovedSeriesModalOpen = ref(false);

// Modals state
const isCollectionModalOpen = ref(false);
const editingCollectionId = ref(null);
const collectionFormName = ref("");
const collectionFormDesc = ref("");
const collectionFormCoverId = ref(null);
const collectionPickerSearch = ref("");
const collectionFormSelectedIds = ref([]);
const includePhotosInPicker = ref(false);

const isAddToCollectionModalOpen = ref(false);
const addToCollectionTargetIds = ref([]);
const isSettingsModalOpen = ref(false);
const isSeriesToolsMenuOpen = ref(false);
const isAutoGroupedBannerDismissed = ref(false);

// Source File/Folder Designation Modal ('areas' | 'folders' | 'files')
const isSourcePickerModalOpen = ref(false);
const sourcePickerTab = ref("areas"); // 'areas' | 'folders' | 'files'
const sourcePickerSearch = ref("");
const sourcePickerSelectedFileIds = ref([]);
const sourcePickerSelectedFolderIds = ref([]);
const selectedAreaFolderId = ref("all");
const areaBrowserFolderId = ref("");
const areaBrowserGroupingMode = ref("children-as-series");

// Thumbnail loading map & viewport priority observer
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

const loadSingleMediaThumbnail = (item, priority = "high") => {
  if (!item || item.id == null) return;
  const key = String(item.id);
  if (thumbnailMap.value[key]) return;

  const cached = getCachedFileThumbnailUrl(item) || resolveFileThumbnailFallbackUrl(item);
  if (cached) {
    thumbnailMap.value = { ...thumbnailMap.value, [key]: cached };
    return;
  }

  if (pendingThumbKeys.has(key)) return;
  pendingThumbKeys.add(key);

  const controller = ensureThumbAbortController();
  loadFileThumbnailUrl(item, { signal: controller.signal, priority })
    .then((url) => {
      if (url && !controller.signal.aborted) {
        thumbnailMap.value = { ...thumbnailMap.value, [key]: url };
      }
    })
    .catch(() => {})
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
        const item = observedThumbItems.get(entry.target);
        if (item) {
          loadSingleMediaThumbnail(item, "high");
        }
        thumbnailObserver?.unobserve(entry.target);
      }
    },
    { rootMargin: "320px 0px" },
  );
  return thumbnailObserver;
};

const observeThumbnailEl = (el, item) => {
  if (!el || !item || item.id == null) return;
  const key = String(item.id);
  if (thumbnailMap.value[key]) return;
  const observer = ensureThumbnailObserver();
  if (!observer) {
    return;
  }
  observedThumbItems.set(el, item);
  observer.observe(el);
};

// Share dialog integration
const canCreateShares = computed(() => !props.vaultOnly && Boolean(fileStore.planCapabilities?.shareEnabled));
const selectedOwnedShareableFiles = computed(() => {
  const idSet = new Set(selectedIds.value.map((id) => String(id)));
  return mediaPhotoStore.allVideos.filter((v) => idSet.has(String(v.id)) && !v.sharedWithMe && !v.lockedFile);
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

const activeSection = computed(() => {
  const raw = String(route.query.section || "series").toLowerCase();
  if (["series", "continue", "recent", "collections", "favorites"].includes(raw)) {
    return raw;
  }
  return "series";
});

const setSection = (sectionKey) => {
  selectedCollectionId.value = null;
  selectedSeriesId.value = null;
  selectedSeriesIds.value = [];
  router.push({
    name: mediaRouteName.value,
    query: sectionKey === "series" ? {} : { section: sectionKey },
  });
};

watch(
  () => route.query.seriesId,
  (nextSeriesId) => {
    const normalized = nextSeriesId ? String(nextSeriesId) : null;
    if (selectedSeriesId.value !== normalized) {
      selectedSeriesId.value = normalized;
      if (normalized) {
        selectedSeasonFolderId.value = route.query.season ? String(route.query.season) : "all-seasons";
      }
    }
  },
  { immediate: true },
);

watch(
  () => route.query.collectionId,
  (nextCollectionId) => {
    const normalized = nextCollectionId ? String(nextCollectionId) : null;
    if (selectedCollectionId.value !== normalized) {
      selectedCollectionId.value = normalized;
    }
  },
  { immediate: true },
);

const headerSearchState = computed(() => headerSearchStore.getScopeState(searchScopeName.value));

const effectiveSearchQuery = computed(() => {
  const headerQ = String(headerSearchState.value?.searchQuery || "").trim();
  const localQ = String(localSearchQuery.value || "").trim();
  return (localQ || headerQ).toLowerCase();
});

const filterMediaPool = (items = []) => {
  return items.filter((item) => {
    if (!item) return false;

    if (!props.vaultOnly) {
      if (scopeFilter.value === "owned" && item.sharedWithMe) return false;
      if (scopeFilter.value === "shared" && !item.sharedWithMe) return false;
    }

    if (statusFilter.value !== "all" && item.mediaKind === "video") {
      if (statusFilter.value !== item.watchState) return false;
    }

    const matchesQueryAndExt = matchesSearchItem({
      name: item.name,
      extension: item.extension,
      isFolder: false,
      searchQuery: effectiveSearchQuery.value,
      extensionFilter: headerSearchState.value?.extensionFilter || "all",
      extraSearchText: [item.displayTitle, item.folderPathLabel, item.ownerName],
    });
    if (!matchesQueryAndExt) {
      return false;
    }

    return true;
  });
};

const sortMediaPool = (items = [], option = sortOption.value) => {
  const copy = [...items];
  switch (option) {
    case "watched-desc":
      return copy.sort((a, b) => (b.lastWatchedAtMs || 0) - (a.lastWatchedAtMs || 0));
    case "duration-desc":
      return copy.sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0));
    case "name-asc":
      return copy.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko-KR"));
    case "size-desc":
      return copy.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
    case "added-desc":
    default:
      return copy.sort((a, b) => (b.uploadedAtMs || b.lastModifiedMs || 0) - (a.uploadedAtMs || a.lastModifiedMs || 0));
  }
};

const filteredAllVideos = computed(() => sortMediaPool(filterMediaPool(mediaPhotoStore.allVideos)));
const filteredContinueWatching = computed(() => filterMediaPool(mediaPhotoStore.continueWatchingVideos));
const filteredRecentlyWatched = computed(() => filterMediaPool(mediaPhotoStore.recentlyWatchedVideos));
const filteredRecentlyAdded = computed(() => filterMediaPool(mediaPhotoStore.recentlyAddedVideos));
const filteredFavorites = computed(() => sortMediaPool(filterMediaPool(mediaPhotoStore.favoriteMediaItems)));
const collections = computed(() => mediaPhotoStore.resolvedMediaCollections);

const activeAreaFolderId = computed(() => {
  const current = String(selectedAreaFolderId.value || "all");
  if (current === "all") return "all";
  return mediaPhotoStore.isMediaAreaFolder(current) ? current : "all";
});

const activeAreaLabel = computed(() => {
  if (activeAreaFolderId.value === "all") return "";
  const match = (mediaPhotoStore.resolvedMediaAreas || []).find(
    (area) => String(area.folderId) === activeAreaFolderId.value,
  );
  return match?.name || "지정 영역";
});

const showAreaQuickFilterBar = computed(() => {
  const areas = mediaPhotoStore.resolvedMediaAreas || [];
  if (areas.length >= 2) return true;
  if (activeAreaFolderId.value !== "all") return true;
  if (areas.length === 1) {
    const totalSeries = (mediaPhotoStore.resolvedMediaSeries || []).length;
    return totalSeries > Number(areas[0]?.seriesCount || 0);
  }
  return false;
});

const hasActiveFilters = computed(() =>
  Boolean(
    effectiveSearchQuery.value ||
      (!props.vaultOnly && scopeFilter.value !== "all") ||
      statusFilter.value !== "all" ||
      activeAreaFolderId.value !== "all",
  ),
);

// Series computed state
const filteredSeriesList = computed(() => {
  const q = effectiveSearchQuery.value;
  const areaFilter = activeAreaFolderId.value;
  return (mediaPhotoStore.resolvedMediaSeries || []).filter((series) => {
    if (!series) return false;
    if (areaFilter !== "all" && String(series.areaFolderId || "") !== areaFilter) {
      return false;
    }
    if (statusFilter.value === "watching" && series.watchingCount === 0 && (series.progressPercent <= 0 || series.progressPercent >= 100)) {
      return false;
    }
    if (statusFilter.value === "completed" && series.progressPercent < 100) {
      return false;
    }
    if (statusFilter.value === "unwatched" && (series.completedCount > 0 || series.watchingCount > 0)) {
      return false;
    }
    if (!q) return true;
    const haystack = [
      series.title,
      series.areaName,
      ...(series.seasons || []).map((s) => `${s.folderName} ${s.seasonLabel} ${s.pathLabel}`),
      ...(series.allEpisodes || []).map((ep) => ep.name),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
});

const selectedSeries = computed(() => {
  if (!selectedSeriesId.value) return null;
  return (mediaPhotoStore.resolvedMediaSeries || []).find((s) => s.id === selectedSeriesId.value) || null;
});

const selectedSeriesRegularSeasons = computed(() =>
  (selectedSeries.value?.seasons || []).filter((s) => !s.isSpecial),
);

const selectedSeriesSpecialSeasons = computed(() =>
  (selectedSeries.value?.seasons || []).filter((s) => s.isSpecial),
);

const activeSeasonUnit = computed(() => {
  if (!selectedSeries.value) return null;
  const seasons = selectedSeries.value.seasons || [];
  if (!seasons.length) return null;
  if (selectedSeasonFolderId.value === "all-seasons") return null;
  if (selectedSeasonFolderId.value === "specials") return null;
  return (
    seasons.find((s) => String(s.folderId) === String(selectedSeasonFolderId.value)) ||
    seasons[0] ||
    null
  );
});

const visibleSeriesEpisodes = computed(() => {
  if (!selectedSeries.value) return [];
  let list = [];
  if (selectedSeasonFolderId.value === "all-seasons") {
    list = selectedSeries.value.allEpisodes || [];
  } else if (selectedSeasonFolderId.value === "specials") {
    list = selectedSeriesSpecialSeasons.value.flatMap((s) => s.episodes || []);
  } else {
    list = activeSeasonUnit.value?.episodes || [];
  }
  if (seriesEpisodeSortOption.value === "episode-asc") {
    return list;
  }
  return sortMediaPool(list, seriesEpisodeSortOption.value);
});

const openSeriesDetail = (series, initialTab = null) => {
  if (!series) return;
  const targetTab = initialTab ? String(initialTab) : "all-seasons";
  selectedSeriesId.value = series.id;
  selectedSeasonFolderId.value = targetTab;
  router.push({
    name: mediaRouteName.value,
    query: targetTab === "all-seasons"
      ? { seriesId: series.id }
      : { seriesId: series.id, season: targetTab },
  });
};

const closeSeriesDetail = () => {
  selectedSeriesId.value = null;
  router.push({
    name: mediaRouteName.value,
    query: activeSection.value === "series" ? {} : { section: activeSection.value },
  });
};

const toggleSelectSeriesCard = (seriesId) => {
  const key = String(seriesId);
  if (selectedSeriesIds.value.includes(key)) {
    selectedSeriesIds.value = selectedSeriesIds.value.filter((id) => id !== key);
  } else {
    selectedSeriesIds.value = [...selectedSeriesIds.value, key];
  }
};

const handlePlaySeries = (series, targetEpisode = null) => {
  if (!series || !series.allEpisodes?.length) return;
  const startEp = targetEpisode || series.nextEpisode || series.allEpisodes[0];
  handlePlayItem(startEp, series.allEpisodes);
};

// Series Editor & Merge / Split handlers
const openSeriesEditorModal = (series) => {
  activeSeriesMenuId.value = null;
  if (!series) return;
  editingSeriesId.value = series.id;
  seriesEditorTitle.value = series.title || "";
  seriesEditorFolderIds.value = (series.seasons || []).map((s) => String(s.folderId));
  const labelMap = {};
  for (const s of series.seasons || []) {
    labelMap[String(s.folderId)] = s.seasonLabel || s.folderName || "";
  }
  seriesEditorSeasonLabels.value = labelMap;
  seriesEditorSearch.value = "";
  isSeriesEditorModalOpen.value = true;
};

const seriesEditorCandidateFolders = computed(() => {
  const q = seriesEditorSearch.value.trim().toLowerCase();
  return (mediaPhotoStore.activeMediaFolderUnits || []).filter((unit) => {
    if (!q) return true;
    return (
      String(unit.folderName || "").toLowerCase().includes(q) ||
      String(unit.pathLabel || "").toLowerCase().includes(q)
    );
  });
});

const moveSeriesEditorFolder = (index, delta) => {
  const targetIdx = index + delta;
  if (targetIdx < 0 || targetIdx >= seriesEditorFolderIds.value.length) return;
  const next = [...seriesEditorFolderIds.value];
  const [moved] = next.splice(index, 1);
  next.splice(targetIdx, 0, moved);
  seriesEditorFolderIds.value = next;
};

const toggleFolderInSeriesEditor = (folderId) => {
  const key = String(folderId);
  if (seriesEditorFolderIds.value.includes(key)) {
    if (seriesEditorFolderIds.value.length <= 1) {
      window.alert("시리즈에는 최소 1개 이상의 폴더가 포함되어야 합니다.");
      return;
    }
    seriesEditorFolderIds.value = seriesEditorFolderIds.value.filter((id) => id !== key);
  } else {
    seriesEditorFolderIds.value = [...seriesEditorFolderIds.value, key];
  }
};

const saveSeriesEditorModal = () => {
  const title = seriesEditorTitle.value.trim();
  if (!title) {
    window.alert("시리즈 제목을 입력해 주세요.");
    return;
  }
  const savedEntry = mediaPhotoStore.saveSeriesOverride({
    seriesId: editingSeriesId.value,
    title,
    folderIds: seriesEditorFolderIds.value,
    seasonLabels: seriesEditorSeasonLabels.value,
  });
  const savedId = savedEntry?.id;
  if (savedId && selectedSeriesId.value) {
    selectedSeriesId.value = savedId;
    router.replace({ name: mediaRouteName.value, query: { seriesId: savedId } });
  }
  isSeriesEditorModalOpen.value = false;
};

const handleSplitSeasonFolder = (series, folderId, folderName = "") => {
  if (!series || !folderId) return;
  if ((series.seasons || []).length <= 1) {
    window.alert("단독 시즌 시리즈는 더 이상 분리할 수 없습니다.");
    return;
  }
  if (!window.confirm(`'${folderName || folderId}' 시즌 폴더를 현재 시리즈에서 분리하여 별도 시리즈로 만들고, 다시 자동으로 묶이지 않도록 설정할까요?`)) {
    return;
  }
  mediaPhotoStore.splitFolderFromSeries(series, folderId);
};

const handleUngroupSeries = (series) => {
  activeSeriesMenuId.value = null;
  if (!series) return;
  if (!window.confirm(`'${series.title}'에 묶인 ${series.totalFolderCount}개의 폴더를 각각 독립된 작품으로 분리하시겠습니까?`)) {
    return;
  }
  mediaPhotoStore.ungroupSeriesToSingleFolders(series);
  if (selectedSeriesId.value === series.id) {
    closeSeriesDetail();
  }
};

const handleTakedownSeries = (series) => {
  activeSeriesMenuId.value = null;
  if (!series) return;
  const folderCount = series.totalFolderCount || (series.seasons || []).length || 1;
  const episodeCount = series.episodeCount || 0;
  if (
    !window.confirm(
      `'${series.title}' 시리즈(폴더 ${folderCount}개 · ${episodeCount}화)를 미디어 목록에서 내리시겠습니까?\n(${props.vaultOnly ? "비밀 폴더" : "파일 저장소"}의 원본 파일은 삭제되지 않으며, 상단 '내린 시리즈'에서 언제든 다시 올릴 수 있습니다.)`,
    )
  ) {
    return;
  }
  mediaPhotoStore.takedownMediaSeries(series);
  selectedSeriesIds.value = selectedSeriesIds.value.filter((id) => id !== String(series.id));
  if (selectedSeriesId.value === series.id) {
    closeSeriesDetail();
  }
};

const handleBatchTakedownSeries = () => {
  if (!selectedSeriesIds.value.length) return;
  const count = selectedSeriesIds.value.length;
  if (
    !window.confirm(
      `선택한 ${count}개의 시리즈를 미디어 목록에서 내리시겠습니까?\n(${props.vaultOnly ? "비밀 폴더" : "파일 저장소"}의 원본 파일은 유지되며, '내린 시리즈'에서 언제든 다시 올릴 수 있습니다.)`,
    )
  ) {
    return;
  }
  mediaPhotoStore.takedownMediaSeries(selectedSeriesIds.value);
  selectedSeriesIds.value = [];
};

const handleRestoreRemovedSeries = (entry) => {
  if (!entry) return;
  mediaPhotoStore.restoreRemovedSeries(entry.id);
  if ((mediaPhotoStore.removedMediaSeries || []).length === 0) {
    isRemovedSeriesModalOpen.value = false;
  }
};

const handleRestoreAllRemovedSeries = () => {
  if ((mediaPhotoStore.removedMediaSeries || []).length) {
    mediaPhotoStore.restoreAllRemovedSeries();
  }
  const excludedIds = (mediaPhotoStore.excludedIndividualMediaVideos || []).map((v) => v.id);
  if (excludedIds.length) {
    mediaPhotoStore.restoreExcludedMediaFiles?.(excludedIds);
  }
  isRemovedSeriesModalOpen.value = false;
};

const formatRemovedTimestamp = (isoStr) => {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (v) => String(v).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const openMergeSelectedSeriesModal = (preselectedSeriesIds = selectedSeriesIds.value) => {
  activeSeriesMenuId.value = null;
  const ids = [
    ...new Set(
      (preselectedSeriesIds || [])
        .filter((id) => id != null && id !== "")
        .map((id) => String(id)),
    ),
  ];
  if (ids.length === 1) {
    selectedSeriesIds.value = ids;
  }
  const firstSeries = (mediaPhotoStore.resolvedMediaSeries || []).find((s) => s.id === ids[0]);
  mergeCustomTitle.value = firstSeries?.title || "";
  mergeTargetSeriesId.value = "";
  isMergeSeriesModalOpen.value = true;
};

const confirmMergeSeries = () => {
  const ids = [...selectedSeriesIds.value];
  if (mergeTargetSeriesId.value && !ids.includes(mergeTargetSeriesId.value)) {
    ids.push(mergeTargetSeriesId.value);
  }
  if (ids.length < 2) {
    window.alert("합칠 대상 시리즈를 선택해 주세요.");
    return;
  }
  const mergedEntry = mediaPhotoStore.mergeMediaSeries(ids, mergeCustomTitle.value.trim());
  const mergedId = mergedEntry?.id;
  selectedSeriesIds.value = [];
  isMergeSeriesModalOpen.value = false;
  if (mergedId && selectedSeriesId.value) {
    selectedSeriesId.value = mergedId;
    router.replace({ name: mediaRouteName.value, query: { seriesId: mergedId } });
  }
};

const openCollectionDetail = (collection) => {
  if (!collection) return;
  selectedCollectionId.value = collection.id;
  router.push({
    name: mediaRouteName.value,
    query: { section: "collections", collectionId: collection.id },
  });
};

const closeCollectionDetail = () => {
  selectedCollectionId.value = null;
  router.push({
    name: mediaRouteName.value,
    query: { section: "collections" },
  });
};

const activeCollection = computed(() => {
  if (!selectedCollectionId.value) return null;
  return collections.value.find((c) => c.id === selectedCollectionId.value) || null;
});

const visibleMainItems = computed(() => {
  if (activeCollection.value) {
    return filterMediaPool(activeCollection.value.items);
  }
  switch (activeSection.value) {
    case "continue":
      return filteredContinueWatching.value;
    case "recent":
      return filteredRecentlyWatched.value;
    case "favorites":
      return filteredFavorites.value;
    default:
      return [];
  }
});

const selectedIdSet = computed(() => new Set(selectedIds.value.map((id) => String(id))));

const toggleSelectItem = (item, event = null) => {
  if (!item) return;
  const targetId = String(item.id);
  const currentList = visibleMainItems.value;

  if (event?.shiftKey && lastSelectedAnchorId.value) {
    const anchorIdx = currentList.findIndex((i) => String(i.id) === String(lastSelectedAnchorId.value));
    const targetIdx = currentList.findIndex((i) => String(i.id) === targetId);
    if (anchorIdx >= 0 && targetIdx >= 0) {
      const [start, end] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
      const rangeIds = currentList.slice(start, end + 1).map((i) => String(i.id));
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
  const allIds = visibleMainItems.value.map((i) => String(i.id));
  if (allIds.length > 0 && allIds.every((id) => selectedIdSet.value.has(id))) {
    selectedIds.value = [];
  } else {
    selectedIds.value = allIds;
  }
};

const clearSelection = () => {
  selectedIds.value = [];
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
    ...(mediaPhotoStore.resolvedMediaSeries || []).map((s) => s.coverEpisode).filter(Boolean),
    ...visibleSeriesEpisodes.value,
    ...mediaPhotoStore.continueWatchingVideos,
    ...visibleMainItems.value,
    ...collections.value.map((c) => c.coverItem).filter(Boolean),
  ];

  const seen = new Set();
  const cachedUpdates = {};
  const uncachedCandidates = [];
  for (const item of candidates) {
    if (!item || item.id == null) continue;
    const key = String(item.id);
    if (seen.has(key) || thumbnailMap.value[key]) continue;
    seen.add(key);

    const cached = getCachedFileThumbnailUrl(item) || resolveFileThumbnailFallbackUrl(item);
    if (cached) {
      cachedUpdates[key] = cached;
      continue;
    }

    uncachedCandidates.push(item);
  }
  if (Object.keys(cachedUpdates).length > 0) {
    thumbnailMap.value = { ...thumbnailMap.value, ...cachedUpdates };
  }

  // Fallback for environments without IntersectionObserver (e.g. jsdom unit tests)
  if (typeof IntersectionObserver === "undefined") {
    for (const item of uncachedCandidates.slice(0, 12)) {
      loadSingleMediaThumbnail(item, "high");
    }
  }
};

const handlePlayItem = (item, pool = visibleMainItems.value, collectionId = null) => {
  if (!item) return;
  const playlistIds = (pool || [item]).map((i) => String(i.id));
  mediaPhotoStore.openTheater(item.id, {
    playlistIds,
    collectionId: collectionId || activeCollection.value?.id || null,
  });
};

const handlePlayCollection = (collection) => {
  if (!collection || !collection.items?.length) {
    window.alert("이 컬렉션에 재생할 미디어 항목이 없습니다.");
    return;
  }
  handlePlayItem(collection.items[0], collection.items, collection.id);
};

// Collection Create / Edit Modal
const pickerCandidates = computed(() => {
  const base = includePhotosInPicker.value
    ? [...mediaPhotoStore.candidateVideos, ...mediaPhotoStore.candidatePhotos]
    : [...mediaPhotoStore.candidateVideos];
  const q = collectionPickerSearch.value.trim().toLowerCase();
  if (!q) return base;
  return base.filter((item) => String(item.name || "").toLowerCase().includes(q));
});

// Source File / Folder Picker Modal (for manual inclusion)
const folderCandidateList = computed(() => {
  const q = sourcePickerSearch.value.trim().toLowerCase();
  return mediaPhotoStore.allDriveFolders
    .map((folder) => {
      const folderVideoCount = mediaPhotoStore.candidateVideos.filter(
        (v) => String(v.parentId ?? "") === String(folder.id),
      ).length;
      return {
        ...folder,
        folderVideoCount,
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

const fileCandidateList = computed(() => {
  const q = sourcePickerSearch.value.trim().toLowerCase();
  if (!q) return mediaPhotoStore.candidateVideos;
  return mediaPhotoStore.candidateVideos.filter(
    (v) =>
      String(v.name || "").toLowerCase().includes(q) ||
      String(v.folderPathLabel || "").toLowerCase().includes(q),
  );
});

const areaFolderByIdMap = computed(() => {
  const map = new Map();
  for (const folder of mediaPhotoStore.allDriveFolders || []) {
    map.set(String(folder.id), folder);
  }
  return map;
});

const areaBrowserBreadcrumbs = computed(() => {
  const crumbs = [{ id: "", name: props.vaultOnly ? "비밀 폴더 (최상위)" : "홈 (드라이브 최상위)" }];
  let currentId = String(areaBrowserFolderId.value || "").trim();
  if (!currentId) return crumbs;
  const trail = [];
  const visited = new Set();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = areaFolderByIdMap.value.get(currentId);
    if (!folder) break;
    trail.unshift({ id: String(folder.id), name: folder.name || "폴더" });
    currentId = folder.parentId != null ? String(folder.parentId) : "";
  }
  return [...crumbs, ...trail];
});

const areaBrowserChildFolders = computed(() => {
  const currentId = String(areaBrowserFolderId.value || "");
  const allFolders = mediaPhotoStore.allDriveFolders || [];
  const hasChildSet = new Set();
  for (const f of allFolders) {
    if (f.parentId != null && String(f.parentId) !== "") {
      hasChildSet.add(String(f.parentId));
    }
  }
  const directVideoCountByFolderId = new Map();
  for (const video of mediaPhotoStore.candidateVideos || []) {
    const pKey = video.parentId != null ? String(video.parentId) : "";
    if (!pKey) continue;
    directVideoCountByFolderId.set(pKey, (directVideoCountByFolderId.get(pKey) || 0) + 1);
  }
  return allFolders
    .filter((folder) => String(folder.parentId ?? "") === currentId)
    .map((folder) => {
      const idStr = String(folder.id);
      return {
        ...folder,
        idStr,
        hasChildren: hasChildSet.has(idStr),
        directVideoCount: directVideoCountByFolderId.get(idStr) || 0,
        isRegisteredArea: mediaPhotoStore.isMediaAreaFolder(idStr),
      };
    })
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko-KR", { numeric: true }));
});

const areaBrowserSearchResults = computed(() => {
  if (sourcePickerTab.value !== "areas") return [];
  const q = sourcePickerSearch.value.trim().toLowerCase();
  if (!q) return [];
  return (mediaPhotoStore.allDriveFolders || [])
    .filter(
      (folder) =>
        String(folder.name || "").toLowerCase().includes(q) ||
        String(folder.pathLabel || "").toLowerCase().includes(q),
    )
    .map((folder) => ({
      ...folder,
      idStr: String(folder.id),
      isRegisteredArea: mediaPhotoStore.isMediaAreaFolder(folder.id),
    }));
});

const currentBrowsedAreaPreview = computed(() => {
  const currentId = String(areaBrowserFolderId.value || "").trim();
  if (!currentId) return null;
  return mediaPhotoStore.previewMediaAreaFolder(currentId);
});

const browseAreaFolder = (folderId = "") => {
  const nextId = String(folderId ?? "");
  areaBrowserFolderId.value = nextId;
  sourcePickerSearch.value = "";
  const existing = (mediaPhotoStore.mediaLibraryAreas || []).find((a) => String(a.folderId) === nextId);
  if (existing) {
    areaBrowserGroupingMode.value = existing.groupingMode || "children-as-series";
  }
};

const designateAreaFolder = (folderId, groupingModeOverride = null) => {
  const targetId = String(folderId ?? "").trim();
  if (!targetId) return;
  const mode = groupingModeOverride || areaBrowserGroupingMode.value || "children-as-series";
  mediaPhotoStore.addMediaLibraryArea(targetId, { groupingMode: mode });
  areaBrowserFolderId.value = targetId;
  areaBrowserGroupingMode.value = mode;
};

const handleAreaGroupingModeChange = (folderId, nextMode) => {
  const targetId = String(folderId ?? "").trim();
  if (!targetId) return;
  if (mediaPhotoStore.isMediaAreaFolder(targetId)) {
    mediaPhotoStore.updateMediaLibraryArea(targetId, { groupingMode: nextMode });
  } else {
    areaBrowserGroupingMode.value = nextMode;
  }
};

const openSourcePickerModal = (defaultTab = "areas", initialBrowseFolderId = "") => {
  sourcePickerTab.value = defaultTab;
  sourcePickerSearch.value = "";
  sourcePickerSelectedFileIds.value = [...mediaPhotoStore.mediaIncludedFileIds];
  sourcePickerSelectedFolderIds.value = [...mediaPhotoStore.mediaIncludedFolderIds];
  if (defaultTab === "areas") {
    const targetBrowseId =
      initialBrowseFolderId ||
      areaBrowserFolderId.value ||
      (mediaPhotoStore.resolvedMediaAreas?.[0]?.folderId ?? "");
    browseAreaFolder(targetBrowseId);
  }
  isSourcePickerModalOpen.value = true;
};

const toggleSourcePickerFolder = (folderId) => {
  const key = String(folderId);
  if (sourcePickerSelectedFolderIds.value.includes(key)) {
    sourcePickerSelectedFolderIds.value = sourcePickerSelectedFolderIds.value.filter((id) => id !== key);
  } else {
    sourcePickerSelectedFolderIds.value = [...sourcePickerSelectedFolderIds.value, key];
  }
};

const toggleSourcePickerFile = (fileId) => {
  const key = String(fileId);
  if (sourcePickerSelectedFileIds.value.includes(key)) {
    sourcePickerSelectedFileIds.value = sourcePickerSelectedFileIds.value.filter((id) => id !== key);
  } else {
    sourcePickerSelectedFileIds.value = [...sourcePickerSelectedFileIds.value, key];
  }
};

const toggleSelectAllCandidateFiles = () => {
  const visibleIds = fileCandidateList.value.map((f) => String(f.id));
  const allSelected =
    visibleIds.length > 0 &&
    visibleIds.every((id) => sourcePickerSelectedFileIds.value.includes(id));
  if (allSelected) {
    const removeSet = new Set(visibleIds);
    sourcePickerSelectedFileIds.value = sourcePickerSelectedFileIds.value.filter((id) => !removeSet.has(id));
  } else {
    sourcePickerSelectedFileIds.value = [...new Set([...sourcePickerSelectedFileIds.value, ...visibleIds])];
  }
};

const saveSourcePickerModal = () => {
  const currentSet = new Set(mediaPhotoStore.mediaIncludedFileIds.map((id) => String(id)));
  const nextSet = new Set(sourcePickerSelectedFileIds.value.map((id) => String(id)));
  const toRemove = [...currentSet].filter((id) => !nextSet.has(id));
  if (toRemove.length) {
    mediaPhotoStore.removeMediaFiles(toRemove);
  }
  if (nextSet.size > 0) {
    mediaPhotoStore.addMediaFiles([...nextSet]);
  }
  mediaPhotoStore.setMediaIncludedFolders(sourcePickerSelectedFolderIds.value);
  mediaPhotoStore.updatePreferences({ mediaSourceMode: "manual" });
  isSourcePickerModalOpen.value = false;
};

const totalExcludedMediaCount = computed(() =>
  (mediaPhotoStore.removedMediaSeries?.length || 0) +
  (mediaPhotoStore.excludedIndividualMediaVideos?.length || 0),
);

const handleBatchExcludeFromMedia = () => {
  if (!selectedIds.value.length) return;
  (mediaPhotoStore.excludeMediaFiles || mediaPhotoStore.removeMediaFiles)(selectedIds.value);
  clearSelection();
};

const handleExcludeSingleMediaItem = (item) => {
  if (!item || item.id == null) return;
  activeMenuCardId.value = null;
  (mediaPhotoStore.excludeMediaFiles || mediaPhotoStore.removeMediaFiles)([item.id]);
  const key = String(item.id);
  selectedIds.value = selectedIds.value.filter((id) => String(id) !== key);
};

const handleRestoreExcludedSingleMedia = (item) => {
  if (!item || item.id == null) return;
  mediaPhotoStore.restoreExcludedMediaFiles?.([item.id]);
  if (totalExcludedMediaCount.value === 0) {
    isRemovedSeriesModalOpen.value = false;
  }
};

const openCreateCollectionModal = (preselectedIds = []) => {
  editingCollectionId.value = null;
  collectionFormName.value = "";
  collectionFormDesc.value = "";
  collectionFormSelectedIds.value = preselectedIds.map((id) => String(id));
  collectionFormCoverId.value = collectionFormSelectedIds.value[0] || null;
  collectionPickerSearch.value = "";
  isCollectionModalOpen.value = true;
};

const openEditCollectionModal = (collection) => {
  if (!collection) return;
  editingCollectionId.value = collection.id;
  collectionFormName.value = collection.name || "";
  collectionFormDesc.value = collection.description || "";
  collectionFormSelectedIds.value = [...(collection.itemIds || [])];
  collectionFormCoverId.value = collection.coverFileId || collection.itemIds?.[0] || null;
  collectionPickerSearch.value = "";
  isCollectionModalOpen.value = true;
};

const togglePickerItem = (itemId) => {
  const key = String(itemId);
  if (collectionFormSelectedIds.value.includes(key)) {
    collectionFormSelectedIds.value = collectionFormSelectedIds.value.filter((id) => id !== key);
    if (String(collectionFormCoverId.value) === key) {
      collectionFormCoverId.value = collectionFormSelectedIds.value[0] || null;
    }
  } else {
    collectionFormSelectedIds.value = [...collectionFormSelectedIds.value, key];
    if (!collectionFormCoverId.value) {
      collectionFormCoverId.value = key;
    }
  }
};

const saveCollectionModal = () => {
  const name = collectionFormName.value.trim();
  if (!name) {
    window.alert("컬렉션 이름을 입력해 주세요.");
    return;
  }

  if (editingCollectionId.value) {
    mediaPhotoStore.updateMediaCollection(editingCollectionId.value, {
      name,
      description: collectionFormDesc.value,
      itemIds: collectionFormSelectedIds.value,
      coverFileId: collectionFormCoverId.value,
    });
  } else {
    const created = mediaPhotoStore.createMediaCollection({
      name,
      description: collectionFormDesc.value,
      itemIds: collectionFormSelectedIds.value,
      coverFileId: collectionFormCoverId.value,
    });
    if (created && activeSection.value === "collections") {
      openCollectionDetail(created);
    }
  }

  isCollectionModalOpen.value = false;
  clearSelection();
};

const handleDeleteCollection = (collection) => {
  if (!collection) return;
  if (!window.confirm(`'${collection.name}' 컬렉션을 삭제하시겠습니까?\n(컬렉션만 삭제되며 원본 동영상/사진 파일은 삭제되지 않습니다.)`)) {
    return;
  }
  mediaPhotoStore.deleteMediaCollection(collection.id);
  if (selectedCollectionId.value === collection.id) {
    closeCollectionDetail();
  }
};

const openBatchAddToCollection = (targetIds = selectedIds.value) => {
  addToCollectionTargetIds.value = targetIds.map((id) => String(id));
  isAddToCollectionModalOpen.value = true;
};

const applyBatchAddToCollection = (collectionId) => {
  mediaPhotoStore.addItemsToMediaCollection(collectionId, addToCollectionTargetIds.value);
  isAddToCollectionModalOpen.value = false;
  clearSelection();
};

// Batch actions
const handleBatchFavorite = (favorite = true) => {
  mediaPhotoStore.setMediaFavoritesBatch(selectedIds.value, favorite);
  clearSelection();
};

const handleBatchDownload = async () => {
  const idSet = new Set(selectedIds.value.map((id) => String(id)));
  const targets = visibleMainItems.value.filter((i) => idSet.has(String(i.id)));
  for (const item of targets) {
    try {
      await downloadFileAsset(item, item.name || "media");
    } catch {
      // Continue
    }
  }
};

const handleBatchTrashOriginal = async () => {
  if (!selectedIds.value.length) return;
  if (
    !window.confirm(
      `선택한 ${selectedIds.value.length}개의 원본 파일을 휴지통으로 이동하시겠습니까?\n(${props.vaultOnly ? "비밀 폴더 휴지통으로 이동되며, 비밀 미디어·비밀 사진첩에서 모두 숨겨집니다." : "파일 저장소, 미디어, 사진첩에서 모두 휴지통으로 이동됩니다."})`,
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

const handleTrashSingleOriginal = async (item) => {
  activeMenuCardId.value = null;
  if (!item) return;
  if (!window.confirm(`'${item.name}' 원본 파일을 휴지통으로 이동하시겠습니까?`)) {
    return;
  }
  try {
    await fileStore.moveToTrash(item.id);
  } catch (error) {
    window.alert(error?.response?.data?.message || error?.message || "파일을 삭제하지 못했습니다.");
  }
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

const resetBrowsingFilters = () => {
  localSearchQuery.value = "";
  scopeFilter.value = "all";
  statusFilter.value = "all";
  selectedAreaFolderId.value = "all";
  headerSearchStore.resetScope(searchScopeName.value);
};

const handleResetSeriesOverrides = () => {
  if (!window.confirm("수동 시리즈 병합·분리·숨김 규칙을 모두 초기화하시겠습니까?")) {
    return;
  }
  mediaPhotoStore.resetAllSeriesOverrides();
};

const handleClearWatchHistory = () => {
  if (!window.confirm("전체 시청 기록과 이어보기 위치를 초기화하시겠습니까?")) {
    return;
  }
  mediaPhotoStore.clearAllWatchHistory();
};

const closeFloatingMenus = () => {
  activeMenuCardId.value = null;
  activeSeriesMenuId.value = null;
  isSeriesToolsMenuOpen.value = false;
};

watch(
  () => [
    visibleMainItems.value.length,
    (mediaPhotoStore.resolvedMediaSeries || []).length,
    visibleSeriesEpisodes.value.length,
    collections.value.length,
    activeSection.value,
    selectedSeriesId.value,
  ],
  () => {
    void primeThumbnails();
  },
  { immediate: true },
);

onMounted(async () => {
  window.addEventListener("click", closeFloatingMenus);
  await mediaPhotoStore.ensureCatalogLoaded({ scope: props.vaultOnly ? "vault" : "normal" });
  void primeThumbnails();
});

onBeforeUnmount(() => {
  window.removeEventListener("click", closeFloatingMenus);
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
  <div class="media-hub-view space-y-6 pb-16">
    <!-- Hidden File Input for Direct Media Upload -->
    <input
      ref="uploadInputRef"
      type="file"
      accept="video/*,image/*"
      multiple
      class="hidden"
      @change="onUploadInputChange"
    />

    <!-- Top Hero & Focused Toolbar -->
    <MediaHeaderToolbar
      :vault-only="vaultOnly"
      :media-source-mode="mediaPhotoStore.preferences.mediaSourceMode"
      :area-count="(mediaPhotoStore.resolvedMediaAreas || []).length"
      :folder-count="mediaPhotoStore.mediaIncludedFolderIds.length"
      :file-count="mediaPhotoStore.mediaIncludedFileIds.length"
      :candidate-video-count="mediaPhotoStore.candidateVideos.length"
      :series-count="(mediaPhotoStore.resolvedMediaSeries || []).length"
      :displayed-video-count="mediaPhotoStore.allVideos.length"
      :continue-count="mediaPhotoStore.continueWatchingVideos.length"
      :collection-count="collections.length"
      :favorite-count="mediaPhotoStore.favoriteMediaItems.length"
      :active-section="activeSection"
      :selected-collection-id="selectedCollectionId"
      :in-series-detail="Boolean(selectedSeries)"
      :search-query="localSearchQuery"
      :scope-filter="scopeFilter"
      :status-filter="statusFilter"
      :sort-option="sortOption"
      :series-episode-sort-option="seriesEpisodeSortOption"
      :view-mode="viewMode"
      :grid-density="gridDensity"
      :show-thumbnails="showThumbnails"
      :thumb-aspect="thumbAspect"
      :active-area-label="activeAreaLabel"
      @set-section="setSection"
      @update:search-query="localSearchQuery = $event"
      @update:scope-filter="scopeFilter = $event"
      @update:status-filter="statusFilter = $event"
      @update:sort-option="sortOption = $event"
      @update:series-episode-sort-option="seriesEpisodeSortOption = $event"
      @set-view-mode="setViewMode"
      @set-grid-density="setGridDensity"
      @toggle-show-thumbnails="toggleShowThumbnails"
      @set-thumb-aspect="setThumbAspect"
      @clear-area-filter="selectedAreaFolderId = 'all'"
      @reset-filters="resetBrowsingFilters"
      @open-source-picker="openSourcePickerModal($event)"
      @trigger-upload="uploadInputRef?.click()"
      @create-collection="openCreateCollectionModal(selectedIds)"
      @open-settings="isSettingsModalOpen = true"
    />

    <!-- Series Batch Selection Action Bar (Merge / Ungroup) -->
    <div
      v-if="selectedSeriesIds.length > 0 && activeSection === 'series' && !selectedSeriesId"
      class="sticky top-2 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-500/40 bg-slate-900/95 px-4 py-3 text-xs text-white shadow-xl backdrop-blur-md"
    >
      <div class="flex items-center gap-3">
        <span class="rounded-full bg-indigo-600 px-3 py-1 font-extrabold">
          시리즈 {{ selectedSeriesIds.length }}개 선택됨
        </span>
        <span class="text-slate-300">
          자동 분류가 다르게 묶였거나 흩어진 시즌 폴더들을 하나의 시리즈로 합칠 수 있습니다.
        </span>
        <button
          type="button"
          class="font-semibold text-slate-400 hover:text-white"
          @click="selectedSeriesIds = []"
        >
          선택 취소
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 font-extrabold text-white hover:bg-blue-500"
          @click="openMergeSelectedSeriesModal(selectedSeriesIds)"
        >
          <i class="fa-solid fa-object-group"></i>
          <span>{{ selectedSeriesIds.length >= 2 ? `선택한 ${selectedSeriesIds.length}개 시리즈 하나로 합치기` : "다른 시리즈와 합치기" }}</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl bg-rose-600/20 px-3.5 py-1.5 font-extrabold text-rose-300 ring-1 ring-rose-500/40 hover:bg-rose-600/35"
          @click="handleBatchTakedownSeries"
        >
          <i class="fa-solid fa-eye-slash"></i>
          <span>선택한 {{ selectedSeriesIds.length }}개 시리즈 내리기</span>
        </button>
      </div>
    </div>

    <!-- Batch Selection Action Bar -->
    <div
      v-if="selectedIds.length > 0"
      class="sticky top-2 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-500/40 bg-slate-900/95 px-4 py-3 text-xs text-white shadow-xl backdrop-blur-md"
    >
      <div class="flex items-center gap-3">
        <span class="rounded-full bg-blue-600 px-3 py-1 font-extrabold">
          {{ selectedIds.length }}개 선택됨
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
          class="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-1.5 font-bold text-white hover:bg-purple-500"
          @click="openBatchAddToCollection(selectedIds)"
        >
          <i class="fa-solid fa-layer-group"></i>
          <span>컬렉션에 담기</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/20 px-3 py-1.5 font-bold text-amber-300 ring-1 ring-amber-400/40 hover:bg-amber-500/30"
          @click="handleBatchFavorite(true)"
        >
          <i class="fa-solid fa-star"></i>
          <span>즐겨찾기 추가</span>
        </button>
        <button
          v-if="canCreateShares && selectedOwnedShareableFiles.length > 0"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-500"
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
          v-if="activeCollection"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl bg-orange-500/20 px-3 py-1.5 font-bold text-orange-300 hover:bg-orange-500/30"
          @click="mediaPhotoStore.removeItemsFromMediaCollection(activeCollection.id, selectedIds); clearSelection()"
        >
          <i class="fa-solid fa-folder-minus"></i>
          <span>컬렉션에서 제외</span>
        </button>
        <button
          type="button"
          data-testid="media-batch-exclude-btn"
          class="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/20 px-3 py-1.5 font-bold text-amber-300 hover:bg-amber-500/30"
          @click="handleBatchExcludeFromMedia"
        >
          <i class="fa-solid fa-eye-slash"></i>
          <span>미디어 목록에서 제외 (원본 유지)</span>
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

    <!-- [A] Continue Watching Horizontal Rail (Shown on 'series' overview when not searching) -->
    <section
      v-if="activeSection === 'series' && !selectedSeriesId && !selectedCollectionId && !effectiveSearchQuery && filteredContinueWatching.length > 0"
      class="space-y-3"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-play-circle text-blue-500"></i>
          <h2 class="text-base font-black text-[var(--text-main)]">이어서 시청하기</h2>
          <span class="rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-extrabold text-blue-500">
            {{ filteredContinueWatching.length }}
          </span>
        </div>
        <button
          type="button"
          class="text-xs font-bold text-blue-500 hover:underline"
          @click="setSection('continue')"
        >
          전체 보기 →
        </button>
      </div>

      <div class="grid" :class="mediaGridColsClass">
        <article
          v-for="video in filteredContinueWatching.slice(0, 4)"
          :key="'continue-' + video.id"
          class="group relative overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <div
            v-if="showThumbnails"
            :ref="(el) => observeThumbnailEl(el, video)"
            class="relative w-full cursor-pointer overflow-hidden bg-slate-900"
            :class="thumbAspectClass"
            @click="handlePlayItem(video, filteredContinueWatching)"
          >
            <img
              v-if="thumbnailMap[String(video.id)]"
              :src="thumbnailMap[String(video.id)]"
              :alt="video.name"
              class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
            <div v-else class="flex h-full w-full items-center justify-center text-slate-500">
              <i class="fa-solid fa-film text-3xl"></i>
            </div>

            <div class="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition group-hover:opacity-100 max-sm:opacity-60">
              <div class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl">
                <i class="fa-solid fa-play ml-0.5"></i>
              </div>
            </div>

            <span class="absolute left-2.5 top-2.5 rounded-lg bg-blue-600/90 px-2 py-0.5 text-[10px] font-extrabold text-white shadow">
              {{ video.positionLabel }}부터 이어보기
            </span>

            <button
              type="button"
              class="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-xs text-slate-200 transition hover:bg-rose-600 hover:text-white"
              title="이어보기 목록에서 숨기기"
              @click.stop="mediaPhotoStore.dismissFromContinueWatching(video.id)"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>

            <span
              v-if="video.durationLabel"
              class="absolute bottom-2.5 right-2.5 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white"
            >
              {{ video.durationLabel }}
            </span>

            <div class="absolute inset-x-0 bottom-0 h-1.5 bg-slate-700/80">
              <div class="h-full bg-blue-500" :style="{ width: `${video.progressPercent}%` }"></div>
            </div>
          </div>

          <div :class="gridDensity === 'compact' ? 'p-2.5' : 'p-3'">
            <div v-if="!showThumbnails" class="mb-2 flex items-center justify-between gap-2">
              <span class="rounded-md bg-blue-600/90 px-2 py-0.5 text-[10px] font-extrabold text-white">
                {{ video.positionLabel }}부터 이어보기
              </span>
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  class="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs text-white hover:bg-blue-500"
                  title="재생"
                  @click="handlePlayItem(video, filteredContinueWatching)"
                >
                  <i class="fa-solid fa-play ml-0.5"></i>
                </button>
                <button
                  type="button"
                  class="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-input)] text-xs text-[var(--text-muted)] hover:bg-rose-600 hover:text-white"
                  title="이어보기 목록에서 숨기기"
                  @click="mediaPhotoStore.dismissFromContinueWatching(video.id)"
                >
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>
            <h3
              class="cursor-pointer truncate text-sm font-extrabold text-[var(--text-main)] hover:text-blue-500"
              @click="handlePlayItem(video, filteredContinueWatching)"
            >
              {{ video.displayTitle }}
            </h3>
            <div class="mt-1 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span>{{ video.remainingLabel || `${video.progressPercent}% 시청 중` }}</span>
              <span>{{ video.folderPathLabel }}</span>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- [S1] Series Preview Grid (Default view on /main/media) -->
    <section
      v-if="activeSection === 'series' && !selectedSeriesId"
      class="space-y-4"
    >
      <!-- Auto-Grouped Compact Notice -->
      <div
        v-if="mediaPhotoStore.autoGroupedMediaSeries?.length > 0 && !isAutoGroupedBannerDismissed"
        class="flex items-center justify-between gap-3 rounded-2xl border border-indigo-500/25 bg-indigo-500/10 px-4 py-2.5 text-xs"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <i class="fa-solid fa-wand-magic-sparkles text-[11px]"></i>
          </span>
          <p class="truncate font-bold text-[var(--text-main)]">
            유사 폴더 {{ mediaPhotoStore.autoGroupedMediaSeries.length }}개 시리즈 자동 통합 ·
            <span class="font-normal text-[var(--text-muted)]">우측 메뉴(⋮)에서 수정·분리</span>
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-main)]"
          title="안내 닫기"
          @click="isAutoGroupedBannerDismissed = true"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-tv text-blue-500"></i>
          <h2 class="text-base font-black text-[var(--text-main)]">시리즈 · 작품 미리보기</h2>
          <span class="rounded-full bg-[var(--bg-input)] px-2.5 py-0.5 text-xs font-extrabold text-[var(--text-secondary)]">
            {{ filteredSeriesList.length }}개 작품
          </span>
        </div>

        <!-- Contextual Series Management Menu (only shown when relevant actions exist) -->
        <div
          v-if="filteredSeriesList.length >= 2 || totalExcludedMediaCount > 0"
          class="relative"
          @click.stop
        >
          <button
            type="button"
            data-testid="series-tools-trigger"
            class="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
            @click="isSeriesToolsMenuOpen = !isSeriesToolsMenuOpen"
          >
            <i class="fa-solid fa-sliders text-[11px]"></i>
            <span>시리즈 정리</span>
            <i class="fa-solid fa-chevron-down text-[10px] opacity-75"></i>
          </button>

          <div
            v-if="isSeriesToolsMenuOpen"
            class="absolute right-0 top-9 z-30 w-56 space-y-1 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-1.5 text-xs shadow-2xl"
          >
            <button
              v-if="filteredSeriesList.length >= 2"
              type="button"
              class="flex w-full items-center gap-2 rounded-xl px-3 py-2 font-bold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
              @click="isSeriesToolsMenuOpen = false; openMergeSelectedSeriesModal(selectedSeriesIds.length ? selectedSeriesIds : [filteredSeriesList[0]?.id])"
            >
              <i class="fa-solid fa-object-group text-indigo-500"></i>
              <span>시리즈 수동 병합</span>
            </button>
            <button
              v-if="totalExcludedMediaCount > 0"
              type="button"
              class="flex w-full items-center gap-2 rounded-xl px-3 py-2 font-bold text-amber-500 hover:bg-amber-500/10"
              @click="isSeriesToolsMenuOpen = false; isRemovedSeriesModalOpen = true"
            >
              <i class="fa-solid fa-arrow-rotate-left"></i>
              <span>제외 · 내린 항목 ({{ totalExcludedMediaCount }})</span>
            </button>
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-xl px-3 py-2 font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
              @click="isSeriesToolsMenuOpen = false; openSourcePickerModal('areas')"
            >
              <i class="fa-solid fa-folder-tree text-teal-500"></i>
              <span>영역 · 폴더 지정 편집</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Area Quick Filter Bar (Shown only when 2+ areas exist, mixed sources exist, or area filter is active) -->
      <div
        v-if="showAreaQuickFilterBar"
        data-testid="media-area-filter-bar"
        class="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3.5 py-2 text-xs"
      >
        <span class="inline-flex items-center gap-1.5 font-extrabold text-[var(--text-muted)]">
          <i class="fa-solid fa-folder-tree text-teal-500"></i>
          <span>영역</span>
        </span>
        <button
          type="button"
          class="rounded-xl px-3 py-1 font-bold transition"
          :class="activeAreaFolderId === 'all'
            ? 'bg-teal-600 text-white shadow-sm'
            : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
          @click="selectedAreaFolderId = 'all'"
        >
          전체 ({{ (mediaPhotoStore.resolvedMediaSeries || []).length }})
        </button>
        <button
          v-for="area in mediaPhotoStore.resolvedMediaAreas"
          :key="'area-pill-' + area.folderId"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl px-3 py-1 font-bold transition"
          :class="activeAreaFolderId === String(area.folderId)
            ? 'bg-teal-600 text-white shadow-sm'
            : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
          :title="area.pathLabel"
          @click="selectedAreaFolderId = String(area.folderId)"
        >
          <span class="max-w-[140px] truncate">{{ area.name }}</span>
          <span class="opacity-80">({{ area.seriesCount }})</span>
        </button>
        <button
          type="button"
          class="ml-auto text-[11px] font-bold text-[var(--text-muted)] hover:text-teal-500"
          @click="openSourcePickerModal('areas')"
        >
          영역 편집 →
        </button>
      </div>

      <!-- Guided Empty State for Series -->
      <div
        v-if="filteredSeriesList.length === 0"
        data-testid="series-empty-state"
        class="rounded-3xl border border-dashed border-[var(--border-color)] bg-[var(--bg-elevated)] px-6 py-10 text-center"
      >
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
          <i :class="hasActiveFilters ? 'fa-solid fa-filter-circle-xmark text-xl' : 'fa-solid fa-tv text-xl'"></i>
        </div>

        <template v-if="hasActiveFilters">
          <h3 class="mt-4 text-base font-extrabold text-[var(--text-main)]">
            조건에 맞는 시리즈 작품이 없습니다
          </h3>
          <div class="mt-5 flex flex-wrap justify-center gap-2.5">
            <button
              type="button"
              class="rounded-2xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-blue-500"
              @click="resetBrowsingFilters"
            >
              검색 · 필터 초기화
            </button>
            <button
              v-if="activeAreaFolderId !== 'all'"
              type="button"
              class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] px-4 py-2.5 text-xs font-extrabold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
              @click="openSourcePickerModal('areas', activeAreaFolderId)"
            >
              이 영역 설정 확인
            </button>
          </div>
        </template>

        <template v-else>
          <h3 class="mt-4 text-base font-extrabold text-[var(--text-main)]">
            {{ mediaPhotoStore.preferences.mediaSourceMode === "manual" && mediaPhotoStore.candidateVideos.length > 0
              ? `미디어를 시작해 보세요 (${storageNoun}에 동영상 ${mediaPhotoStore.candidateVideos.length}개 보관 중)`
              : "표시할 시리즈 작품이 없습니다" }}
          </h3>

          <!-- Clean Guided Onboarding Cards -->
          <div class="mx-auto mt-6 grid max-w-3xl gap-3 text-left sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              class="group flex flex-col justify-between rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] p-4 transition hover:border-blue-500/50 hover:bg-[var(--bg-input)]"
              @click="uploadInputRef?.click()"
            >
              <div>
                <span class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-500">
                  <i class="fa-solid fa-cloud-arrow-up"></i>
                </span>
                <p class="mt-3 text-xs font-extrabold text-[var(--text-main)]">새 동영상 업로드</p>
                <p class="mt-1 text-[11px] text-[var(--text-muted)]">
                  PC·기기에서 동영상과 자막 파일을 바로 올립니다.
                </p>
              </div>
              <span class="mt-3 text-[11px] font-extrabold text-blue-500 group-hover:underline">업로드 시작 →</span>
            </button>

            <button
              type="button"
              class="group flex flex-col justify-between rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] p-4 transition hover:border-teal-500/50 hover:bg-[var(--bg-input)]"
              @click="openSourcePickerModal('areas')"
            >
              <div>
                <span class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/15 text-teal-500">
                  <i class="fa-solid fa-folder-tree"></i>
                </span>
                <p class="mt-3 text-xs font-extrabold text-[var(--text-main)]">{{ storageNoun }} 폴더 · 영역 연결</p>
                <p class="mt-1 text-[11px] text-[var(--text-muted)]">
                  {{ vaultOnly ? "비밀 폴더" : "드라이브 폴더" }}(예: 애니메이션)를 지정해 시리즈로 자동 분류합니다.
                </p>
              </div>
              <span class="mt-3 text-[11px] font-extrabold text-teal-500 group-hover:underline">폴더 선택하기 →</span>
            </button>

            <button
              v-if="mediaPhotoStore.preferences.mediaSourceMode === 'manual' && mediaPhotoStore.candidateVideos.length > 0"
              type="button"
              class="group flex flex-col justify-between rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] p-4 transition hover:border-emerald-500/50 hover:bg-[var(--bg-input)]"
              @click="mediaPhotoStore.updatePreferences({ mediaSourceMode: 'all' })"
            >
              <div>
                <span class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
                  <i class="fa-solid fa-wand-magic-sparkles"></i>
                </span>
                <p class="mt-3 text-xs font-extrabold text-[var(--text-main)]">{{ storageNoun }} 전체 자동 표시</p>
                <p class="mt-1 text-[11px] text-[var(--text-muted)]">
                  보관 중인 {{ mediaPhotoStore.candidateVideos.length }}개 동영상을 별도 지정 없이 바로 표시합니다.
                </p>
              </div>
              <span class="mt-3 text-[11px] font-extrabold text-emerald-500 group-hover:underline">자동 표시 켜기 →</span>
            </button>

            <button
              v-else
              type="button"
              class="group flex flex-col justify-between rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] p-4 transition hover:border-indigo-500/50 hover:bg-[var(--bg-input)]"
              @click="openSourcePickerModal('folders')"
            >
              <div>
                <span class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-500">
                  <i class="fa-solid fa-folder-plus"></i>
                </span>
                <p class="mt-3 text-xs font-extrabold text-[var(--text-main)]">개별 폴더 · 파일 지정</p>
                <p class="mt-1 text-[11px] text-[var(--text-muted)]">
                  특정 시즌 폴더나 개별 동영상 파일만 선택해 목록에 담습니다.
                </p>
              </div>
              <span class="mt-3 text-[11px] font-extrabold text-indigo-500 group-hover:underline">항목 고르기 →</span>
            </button>
          </div>

          <div v-if="(mediaPhotoStore.removedMediaSeries || []).length > 0" class="mt-4">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 text-xs font-bold text-amber-500 hover:underline"
              @click="isRemovedSeriesModalOpen = true"
            >
              <i class="fa-solid fa-arrow-rotate-left"></i>
              <span>내린 시리즈 다시 올리기 ({{ mediaPhotoStore.removedMediaSeries.length }}개)</span>
            </button>
          </div>
        </template>
      </div>

      <!-- Series Preview Card Grid -->
      <div
        v-else-if="viewMode === 'card'"
        class="grid"
        :class="seriesGridColsClass"
      >
        <article
          v-for="series in filteredSeriesList"
          :key="series.id"
          class="group relative flex flex-col overflow-hidden rounded-3xl border bg-[var(--bg-elevated)] shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
          :class="selectedSeriesIds.includes(String(series.id))
            ? 'border-indigo-500 ring-2 ring-indigo-500/30'
            : 'border-[var(--border-color)]'"
        >
          <!-- Series Poster / Cover Stage -->
          <div
            v-if="showThumbnails"
            :ref="(el) => observeThumbnailEl(el, series.coverEpisode)"
            class="relative w-full cursor-pointer overflow-hidden bg-slate-900"
            :class="thumbAspectClass"
            @click="openSeriesDetail(series)"
          >
            <img
              v-if="series.coverEpisode && thumbnailMap[String(series.coverEpisode.id)]"
              :src="thumbnailMap[String(series.coverEpisode.id)]"
              :alt="series.title"
              loading="lazy"
              class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
            <div v-else class="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 text-slate-400">
              <i class="fa-solid fa-tv text-3xl"></i>
            </div>

            <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent"></div>

            <!-- Top-left Checkbox & Classification Badge -->
            <div class="absolute left-3 top-3 flex flex-wrap items-center gap-1.5" @click.stop>
              <input
                type="checkbox"
                class="h-4 w-4 cursor-pointer rounded border-white/50 bg-black/60 text-indigo-600 focus:ring-indigo-500"
                :checked="selectedSeriesIds.includes(String(series.id))"
                title="선택하여 다른 시리즈와 병합"
                @change="toggleSelectSeriesCard(series.id)"
              />
              <span
                v-if="series.isManual"
                class="rounded-lg bg-emerald-600/90 px-2 py-0.5 text-[10px] font-extrabold text-white shadow"
              >
                사용자 지정 시리즈
              </span>
              <span
                v-else-if="series.areaName"
                class="rounded-lg bg-teal-600/90 px-2 py-0.5 text-[10px] font-extrabold text-white shadow"
                :title="series.matchReason"
              >
                영역 · {{ series.areaName }}
              </span>
              <span
                v-else-if="series.isAutoGrouped && series.totalFolderCount > 1"
                class="rounded-lg bg-indigo-600/90 px-2 py-0.5 text-[10px] font-extrabold text-white shadow"
                :title="series.matchReason"
              >
                자동 묶음 · {{ series.totalFolderCount }}개 폴더
              </span>
            </div>

            <!-- Top-right Season + Special Count Badges -->
            <div class="absolute right-3 top-3 flex items-center gap-1.5">
              <span class="rounded-lg bg-black/75 px-2 py-0.5 text-[10px] font-extrabold text-white backdrop-blur-sm">
                시즌 {{ series.seasonCount || 1 }}개
              </span>
              <span
                v-if="series.specialCount > 0"
                class="rounded-lg bg-amber-500/90 px-2 py-0.5 text-[10px] font-extrabold text-slate-950 shadow"
              >
                특별편·극장판 {{ series.specialCount }}
              </span>
            </div>

            <!-- Bottom Title & Quick Play Button on Cover -->
            <div class="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2 text-white">
              <div class="min-w-0">
                <span class="text-[11px] font-bold text-blue-300">
                  총 {{ series.episodeCount }}화
                  <template v-if="series.completedCount > 0"> · {{ series.completedCount }}화 시청 완료</template>
                </span>
                <h3 class="truncate text-base font-black leading-snug" :title="series.title">
                  {{ series.title }}
                </h3>
              </div>

              <button
                type="button"
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition hover:scale-105 hover:bg-blue-500"
                :title="series.nextEpisode ? `${series.nextEpisode.seasonLabel || ''} · ${series.nextEpisode.episodeBadge || series.nextEpisode.displayTitle} 재생` : '시리즈 첫 화부터 재생'"
                @click.stop="handlePlaySeries(series)"
              >
                <i class="fa-solid fa-play ml-0.5 text-xs"></i>
              </button>
            </div>

            <!-- Series Overall Watch Progress Bar -->
            <div
              v-if="series.progressPercent > 0"
              class="absolute inset-x-0 bottom-0 h-1.5 bg-slate-700/80"
            >
              <div
                class="h-full"
                :class="series.progressPercent >= 100 ? 'bg-emerald-500' : 'bg-blue-500'"
                :style="{ width: `${series.progressPercent}%` }"
              ></div>
            </div>
          </div>

          <!-- Series Card Body: Season Pills & Actions -->
          <div class="flex flex-1 flex-col justify-between" :class="gridDensity === 'compact' ? 'p-3' : 'p-4'">
            <div class="space-y-2.5">
              <!-- Text-Only Header when Thumbnails Hidden -->
              <div v-if="!showThumbnails" class="space-y-2 border-b border-[var(--border-color)] pb-2.5">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex flex-wrap items-center gap-1.5" @click.stop>
                    <input
                      type="checkbox"
                      class="h-4 w-4 cursor-pointer rounded border-[var(--border-color)] text-indigo-600 focus:ring-indigo-500"
                      :checked="selectedSeriesIds.includes(String(series.id))"
                      @change="toggleSelectSeriesCard(series.id)"
                    />
                    <span class="rounded-md bg-[var(--bg-input)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--text-main)]">
                      시즌 {{ series.seasonCount || 1 }}개 · 총 {{ series.episodeCount }}화
                    </span>
                    <span
                      v-if="series.areaName"
                      class="rounded-md bg-teal-500/15 px-2 py-0.5 text-[10px] font-extrabold text-teal-600 dark:text-teal-400"
                    >
                      영역 · {{ series.areaName }}
                    </span>
                    <span
                      v-if="series.specialCount > 0"
                      class="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-extrabold text-amber-500"
                    >
                      특별편·극장판 {{ series.specialCount }}
                    </span>
                  </div>
                  <button
                    type="button"
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow hover:bg-blue-500"
                    title="시리즈 재생"
                    @click.stop="handlePlaySeries(series)"
                  >
                    <i class="fa-solid fa-play ml-0.5 text-[11px]"></i>
                  </button>
                </div>
                <h3
                  class="cursor-pointer truncate text-sm font-black text-[var(--text-main)] hover:text-blue-500"
                  :title="series.title"
                  @click="openSeriesDetail(series)"
                >
                  {{ series.title }}
                </h3>
              </div>

              <!-- Season Pills Preview -->
              <div class="flex flex-wrap items-center gap-1.5">
                <button
                  v-for="season in (series.seasons || []).slice(0, 5)"
                  :key="'pill-' + series.id + '-' + season.folderId"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition"
                  :class="season.isSpecial
                    ? 'bg-amber-500/15 text-amber-500 hover:bg-amber-500/25'
                    : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-blue-500/15 hover:text-blue-500'"
                  :title="`${season.folderName} (${season.episodeCount}화)`"
                  @click="openSeriesDetail(series, season.isSpecial ? 'specials' : String(season.folderId))"
                >
                  <i :class="season.isSpecial ? 'fa-solid fa-star text-[9px]' : 'fa-solid fa-folder text-[9px]'"></i>
                  <span class="max-w-[115px] truncate">{{ season.seasonLabel }}</span>
                  <span class="opacity-70">({{ season.episodeCount }})</span>
                </button>
                <span
                  v-if="(series.seasons || []).length > 5"
                  class="rounded-lg bg-[var(--bg-input)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-muted)]"
                >
                  +{{ series.seasons.length - 5 }}
                </span>
              </div>

              <!-- Match Reason / Folder Summary -->
              <p class="truncate text-[11px] text-[var(--text-muted)]" :title="series.matchReason">
                {{ series.matchReason }}
              </p>
            </div>

            <!-- Card Footer Actions -->
            <div class="mt-3 flex items-center justify-between border-t border-[var(--border-color)] pt-2.5 text-xs">
              <button
                type="button"
                class="font-extrabold text-blue-500 hover:underline"
                @click="openSeriesDetail(series)"
              >
                전체 에피소드 보기 →
              </button>

              <div class="relative flex items-center gap-1" @click.stop>
                <button
                  type="button"
                  class="rounded-lg px-2 py-1 text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
                  title="시리즈 제목·시즌 구성 수정"
                  @click="openSeriesEditorModal(series)"
                >
                  편집
                </button>

                <button
                  type="button"
                  class="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
                  @click="activeSeriesMenuId = activeSeriesMenuId === series.id ? null : series.id"
                >
                  <i class="fa-solid fa-ellipsis-vertical text-xs"></i>
                </button>

                <div
                  v-if="activeSeriesMenuId === series.id"
                  class="absolute bottom-8 right-0 z-30 w-56 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] py-1.5 text-xs shadow-2xl"
                >
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
                    @click="activeSeriesMenuId = null; openSeriesDetail(series)"
                  >
                    <i class="fa-solid fa-list-ol w-4 text-blue-500"></i>
                    <span>전체 에피소드 · 시즌 보기</span>
                  </button>
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
                    @click="openSeriesEditorModal(series)"
                  >
                    <i class="fa-solid fa-pen-to-square w-4 text-indigo-500"></i>
                    <span>시리즈 편집 (제목·시즌·폴더)</span>
                  </button>
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
                    @click="openMergeSelectedSeriesModal([series.id])"
                  >
                    <i class="fa-solid fa-object-group w-4 text-purple-500"></i>
                    <span>다른 시리즈와 하나로 합치기</span>
                  </button>
                  <button
                    v-if="series.totalFolderCount > 1"
                    type="button"
                    class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-amber-500 hover:bg-amber-500/10"
                    @click="handleUngroupSeries(series)"
                  >
                    <i class="fa-solid fa-link-slash w-4"></i>
                    <span>묶음 해제 (폴더별로 각각 분리)</span>
                  </button>
                  <div class="my-1 border-t border-[var(--border-color)]"></div>
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-rose-500 hover:bg-rose-500/10"
                    :title="`${storageNoun} 원본 파일은 유지되고 미디어 시리즈 목록에서만 내려집니다`"
                    @click="handleTakedownSeries(series)"
                  >
                    <i class="fa-solid fa-eye-slash w-4"></i>
                    <span>시리즈 내리기 (목록에서 숨김)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>

      <!-- Series List View -->
      <div
        v-else
        class="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)]"
      >
        <div
          v-for="series in filteredSeriesList"
          :key="'series-list-' + series.id"
          class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3 last:border-b-0 hover:bg-[var(--bg-input)]"
        >
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <input
              type="checkbox"
              class="h-4 w-4 shrink-0 cursor-pointer rounded text-indigo-600"
              :checked="selectedSeriesIds.includes(String(series.id))"
              @change="toggleSelectSeriesCard(series.id)"
            />
            <div
              v-if="showThumbnails"
              :ref="(el) => observeThumbnailEl(el, series.coverEpisode)"
              class="relative shrink-0 cursor-pointer overflow-hidden rounded-xl bg-slate-900"
              :class="listThumbSizeClass"
              @click="openSeriesDetail(series)"
            >
              <img
                v-if="series.coverEpisode && thumbnailMap[String(series.coverEpisode.id)]"
                :src="thumbnailMap[String(series.coverEpisode.id)]"
                :alt="series.title"
                loading="lazy"
                class="h-full w-full object-cover"
              />
              <div v-else class="flex h-full w-full items-center justify-center text-slate-500">
                <i class="fa-solid fa-tv text-lg"></i>
              </div>
              <div
                v-if="series.progressPercent > 0"
                class="absolute inset-x-0 bottom-0 h-1 bg-slate-700/80"
              >
                <div
                  class="h-full"
                  :class="series.progressPercent >= 100 ? 'bg-emerald-500' : 'bg-blue-500'"
                  :style="{ width: `${series.progressPercent}%` }"
                ></div>
              </div>
            </div>

            <div class="min-w-0 flex-1 cursor-pointer" @click="openSeriesDetail(series)">
              <div class="flex flex-wrap items-center gap-1.5">
                <h3 class="truncate text-sm font-black text-[var(--text-main)] hover:text-blue-500">
                  {{ series.title }}
                </h3>
                <span
                  v-if="series.areaName"
                  class="rounded bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-teal-600 dark:text-teal-400"
                >
                  {{ series.areaName }}
                </span>
                <span class="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-blue-500">
                  시즌 {{ series.seasonCount || 1 }} · 총 {{ series.episodeCount }}화
                </span>
                <span
                  v-if="series.specialCount > 0"
                  class="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-500"
                >
                  특별편·극장판 {{ series.specialCount }}
                </span>
              </div>
              <p class="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                {{ series.matchReason }}
              </p>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              class="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-blue-500"
              @click="openSeriesDetail(series)"
            >
              전체 에피소드
            </button>
            <button
              type="button"
              class="rounded-xl border border-[var(--border-color)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-main)]"
              @click="handlePlaySeries(series)"
            >
              재생
            </button>
            <button
              type="button"
              class="rounded-xl border border-[var(--border-color)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-main)]"
              @click="openSeriesEditorModal(series)"
            >
              편집
            </button>
            <button
              type="button"
              class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-500/20"
              :title="`${storageNoun} 원본은 유지하고 미디어 목록에서만 내립니다`"
              @click="handleTakedownSeries(series)"
            >
              내리기
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- [S2] Series Detail View (Seasons + Specials/Movies + Episode List) -->
    <section
      v-if="activeSection === 'series' && selectedSeries"
      class="space-y-5"
    >
      <!-- Series Detail Hero Header -->
      <div class="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-5 shadow-sm sm:p-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex items-start gap-3.5">
            <button
              type="button"
              class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] transition hover:bg-[var(--bg-input)]"
              title="시리즈 목록으로 돌아가기"
              @click="closeSeriesDetail"
            >
              <i class="fa-solid fa-arrow-left"></i>
            </button>

            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="rounded-lg px-2.5 py-0.5 text-[11px] font-extrabold text-white"
                  :class="selectedSeries.isManual ? 'bg-emerald-600' : (selectedSeries.areaName ? 'bg-teal-600' : 'bg-indigo-600')"
                >
                  {{ selectedSeries.isManual
                    ? "사용자 지정 시리즈"
                    : (selectedSeries.areaName
                      ? `영역 · ${selectedSeries.areaName}`
                      : (selectedSeries.totalFolderCount > 1 ? "자동 분류 시리즈" : "단독 시즌 작품")) }}
                </span>
                <span class="text-xs font-bold text-[var(--text-muted)]">
                  시즌 {{ selectedSeries.seasonCount }}개
                  <template v-if="selectedSeries.specialCount > 0"> · 특별편/극장판 {{ selectedSeries.specialCount }}개</template>
                  · 총 {{ selectedSeries.episodeCount }}화
                </span>
              </div>

              <h2 class="mt-1 text-xl font-black text-[var(--text-main)] sm:text-2xl">
                {{ selectedSeries.title }}
              </h2>
              <p class="mt-1 text-xs text-[var(--text-muted)]">
                분류 기준: {{ selectedSeries.matchReason }}
              </p>
            </div>
          </div>

          <!-- Series Detail Action Buttons -->
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-500"
              @click="handlePlaySeries(selectedSeries)"
            >
              <i class="fa-solid fa-play"></i>
              <span>
                {{ selectedSeries.nextEpisode
                  ? `이어서 재생 (${selectedSeries.nextEpisode.seasonLabel || ""} · ${selectedSeries.nextEpisode.episodeBadge || "1화"})`
                  : "첫 화부터 연속 재생" }}
              </span>
            </button>

            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] px-3.5 py-2.5 text-xs font-extrabold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
              @click="openSeriesEditorModal(selectedSeries)"
            >
              <i class="fa-solid fa-pen-to-square text-indigo-500"></i>
              <span>시리즈 · 시즌 구성 편집</span>
            </button>

            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] px-3.5 py-2.5 text-xs font-extrabold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
              @click="openMergeSelectedSeriesModal([selectedSeries.id])"
            >
              <i class="fa-solid fa-object-group text-purple-500"></i>
              <span>다른 시리즈와 합치기</span>
            </button>

            <button
              v-if="selectedSeries.totalFolderCount > 1"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs font-extrabold text-amber-500 hover:bg-amber-500/20"
              @click="handleUngroupSeries(selectedSeries)"
            >
              <i class="fa-solid fa-link-slash"></i>
              <span>전체 묶음 해제</span>
            </button>

            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-extrabold text-rose-500 hover:bg-rose-500/20"
              :title="`${storageNoun}의 원본 파일은 유지되고 미디어 목록에서만 내려집니다`"
              @click="handleTakedownSeries(selectedSeries)"
            >
              <i class="fa-solid fa-eye-slash"></i>
              <span>시리즈 내리기</span>
            </button>
          </div>
        </div>

        <!-- Season & Specials/Movies Selector Tabs -->
        <div class="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--border-color)] pt-4">
          <!-- All Episodes Combined Tab (Primary Default View inside Series) -->
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-extrabold transition"
            :class="selectedSeasonFolderId === 'all-seasons'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
            @click="selectedSeasonFolderId = 'all-seasons'"
          >
            <i class="fa-solid fa-layer-group text-[11px]"></i>
            <span>전체 에피소드 ({{ selectedSeries.episodeCount }}화)</span>
          </button>

          <!-- Regular Season Tabs -->
          <button
            v-for="season in selectedSeriesRegularSeasons"
            :key="'tab-season-' + season.folderId"
            type="button"
            class="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-extrabold transition"
            :class="String(selectedSeasonFolderId) === String(season.folderId)
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
            @click="selectedSeasonFolderId = String(season.folderId)"
          >
            <i class="fa-solid fa-folder-open text-[11px]"></i>
            <span>{{ season.seasonLabel }}</span>
            <span class="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px]">
              {{ season.episodeCount }}화
            </span>
          </button>

          <!-- Combined Specials / Movies Tab (Decision 3: 특별편 혹은 극장판 등으로 같이 묶기) -->
          <button
            v-if="selectedSeriesSpecialSeasons.length > 0"
            type="button"
            class="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-extrabold transition"
            :class="selectedSeasonFolderId === 'specials'
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'border border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'"
            @click="selectedSeasonFolderId = 'specials'"
          >
            <i class="fa-solid fa-film text-[11px]"></i>
            <span>특별편 · 극장판 (OVA/Movie)</span>
            <span class="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px]">
              {{ selectedSeriesSpecialSeasons.reduce((acc, s) => acc + s.episodeCount, 0) }}편
            </span>
          </button>

          <!-- Individual Special Folder Tabs if multiple -->
          <button
            v-for="spSeason in selectedSeriesSpecialSeasons"
            :key="'tab-sp-' + spSeason.folderId"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-bold transition"
            :class="String(selectedSeasonFolderId) === String(spSeason.folderId)
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'bg-[var(--bg-input)] text-amber-500 hover:bg-amber-500/15'"
            @click="selectedSeasonFolderId = String(spSeason.folderId)"
          >
            <i class="fa-solid fa-star text-[10px]"></i>
            <span>{{ spSeason.seasonLabel }} ({{ spSeason.folderName }})</span>
          </button>
        </div>

        <!-- Active Season Folder Info Bar (Shows original folder path & split button) -->
        <div
          v-if="activeSeasonUnit"
          class="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--bg-input)] px-4 py-2.5 text-xs"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="rounded-md px-2 py-0.5 text-[10px] font-extrabold"
              :class="activeSeasonUnit.isSpecial ? 'bg-amber-500 text-slate-950' : 'bg-blue-600 text-white'"
            >
              {{ activeSeasonUnit.seasonLabel }}
            </span>
            <span class="font-bold text-[var(--text-main)]">{{ activeSeasonUnit.folderName }}</span>
            <span class="text-[var(--text-muted)]">({{ activeSeasonUnit.pathLabel }})</span>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <button
              v-if="activeSeasonUnit.episodes?.[0]"
              type="button"
              class="inline-flex items-center gap-1 rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-1 font-bold text-[var(--text-secondary)] hover:text-[var(--text-main)]"
              @click="mediaPhotoStore.navigateToOriginalFolder(activeSeasonUnit.episodes[0], router)"
            >
              <i class="fa-regular fa-folder-open text-amber-500"></i>
              <span>{{ vaultOnly ? "원본 비밀 폴더 열기" : "원본 저장소 폴더 열기" }}</span>
            </button>
            <button
              v-if="selectedSeries.totalFolderCount > 1"
              type="button"
              class="inline-flex items-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1 font-bold text-amber-500 hover:bg-amber-500/20"
              title="이 폴더가 다른 작품이거나 잘못 묶였다면 별도 시리즈로 분리합니다"
              @click="handleSplitSeasonFolder(selectedSeries, activeSeasonUnit.folderId, activeSeasonUnit.folderName)"
            >
              <i class="fa-solid fa-scissors"></i>
              <span>이 시즌 폴더를 별도 시리즈로 분리</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Episode List for Selected Season / Series -->
      <div
        v-if="viewMode === 'card'"
        class="grid"
        :class="mediaGridColsClass"
      >
        <article
          v-for="ep in visibleSeriesEpisodes"
          :key="'series-ep-' + ep.id"
          class="group flex flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <div
            v-if="showThumbnails"
            :ref="(el) => observeThumbnailEl(el, ep)"
            class="relative w-full cursor-pointer overflow-hidden bg-slate-900"
            :class="thumbAspectClass"
            @click="handlePlaySeries(selectedSeries, ep)"
          >
            <img
              v-if="thumbnailMap[String(ep.id)]"
              :src="thumbnailMap[String(ep.id)]"
              :alt="ep.name"
              loading="lazy"
              class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
            <div v-else class="flex h-full w-full items-center justify-center text-slate-500">
              <i class="fa-solid fa-film text-3xl"></i>
            </div>

            <div class="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition group-hover:opacity-100 max-sm:opacity-60">
              <div class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl">
                <i class="fa-solid fa-play ml-0.5"></i>
              </div>
            </div>

            <!-- Episode Number & Season Badge -->
            <div class="absolute left-2.5 top-2.5 flex items-center gap-1.5">
              <span
                v-if="selectedSeasonFolderId === 'all-seasons' || selectedSeasonFolderId === 'specials'"
                class="rounded bg-indigo-600/90 px-2 py-0.5 text-[10px] font-extrabold text-white"
              >
                {{ ep.seasonLabel }}
              </span>
              <span
                v-if="ep.episodeBadge"
                class="rounded bg-black/80 px-2 py-0.5 text-[10px] font-extrabold text-blue-300"
              >
                {{ ep.episodeBadge }}
              </span>
              <span
                v-if="ep.completed"
                class="rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-extrabold text-white"
              >
                시청 완료
              </span>
            </div>

            <span
              v-if="ep.durationLabel"
              class="absolute bottom-2.5 right-2.5 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white"
            >
              {{ ep.durationLabel }}
            </span>

            <div
              v-if="ep.progressPercent > 0"
              class="absolute inset-x-0 bottom-0 h-1.5 bg-slate-700/80"
            >
              <div
                class="h-full"
                :class="ep.completed ? 'bg-emerald-500' : 'bg-blue-500'"
                :style="{ width: `${ep.progressPercent}%` }"
              ></div>
            </div>
          </div>

          <div class="flex flex-1 flex-col justify-between" :class="gridDensity === 'compact' ? 'p-2.5' : 'p-3.5'">
            <div>
              <div v-if="!showThumbnails" class="mb-2 flex items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-1">
                  <span
                    v-if="selectedSeasonFolderId === 'all-seasons' || selectedSeasonFolderId === 'specials'"
                    class="rounded bg-indigo-600/90 px-1.5 py-0.5 text-[10px] font-extrabold text-white"
                  >
                    {{ ep.seasonLabel }}
                  </span>
                  <span
                    v-if="ep.episodeBadge"
                    class="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-blue-500"
                  >
                    {{ ep.episodeBadge }}
                  </span>
                  <span
                    v-if="ep.durationLabel"
                    class="rounded bg-[var(--bg-input)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--text-secondary)]"
                  >
                    {{ ep.durationLabel }}
                  </span>
                </div>
                <button
                  type="button"
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs text-white hover:bg-blue-500"
                  title="재생"
                  @click="handlePlaySeries(selectedSeries, ep)"
                >
                  <i class="fa-solid fa-play ml-0.5"></i>
                </button>
              </div>
              <h3
                class="cursor-pointer truncate text-sm font-extrabold text-[var(--text-main)] hover:text-blue-500"
                :title="ep.name"
                @click="handlePlaySeries(selectedSeries, ep)"
              >
                {{ ep.displayTitle || ep.name }}
              </h3>
              <p class="mt-1 truncate text-[11px] text-[var(--text-muted)]">
                {{ ep.folderPathLabel }} · {{ ep.sizeLabel }}
              </p>
            </div>

            <div class="mt-2.5 flex items-center justify-between border-t border-[var(--border-color)] pt-2 text-[11px] text-[var(--text-muted)]">
              <span>{{ ep.uploadDateLabel }}</span>
              <div class="flex items-center gap-2">
                <span v-if="ep.matchingSubtitles?.length" class="font-bold text-emerald-500">CC 자막</span>
                <button
                  type="button"
                  data-testid="episode-card-exclude"
                  class="font-bold text-amber-500 hover:underline"
                  title="미디어 목록에서 제외 (원본 파일은 유지)"
                  @click.stop="handleExcludeSingleMediaItem(ep)"
                >
                  제외
                </button>
                <button
                  type="button"
                  class="font-bold text-[var(--text-secondary)] hover:text-blue-500"
                  @click="mediaPhotoStore.navigateToOriginalFolder(ep, router)"
                >
                  원본 위치
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>

      <!-- Episode List View -->
      <div
        v-else
        class="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)]"
      >
        <div
          v-for="ep in visibleSeriesEpisodes"
          :key="'series-ep-list-' + ep.id"
          class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3 last:border-b-0 hover:bg-[var(--bg-input)]"
        >
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div
              v-if="showThumbnails"
              :ref="(el) => observeThumbnailEl(el, ep)"
              class="relative shrink-0 cursor-pointer overflow-hidden rounded-xl bg-slate-900"
              :class="listThumbSizeClass"
              @click="handlePlaySeries(selectedSeries, ep)"
            >
              <img
                v-if="thumbnailMap[String(ep.id)]"
                :src="thumbnailMap[String(ep.id)]"
                :alt="ep.name"
                loading="lazy"
                class="h-full w-full object-cover"
              />
              <div v-else class="flex h-full w-full items-center justify-center text-slate-500">
                <i class="fa-solid fa-film text-lg"></i>
              </div>
              <span
                v-if="ep.durationLabel"
                class="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[10px] font-bold text-white"
              >
                {{ ep.durationLabel }}
              </span>
              <div
                v-if="ep.progressPercent > 0"
                class="absolute inset-x-0 bottom-0 h-1 bg-slate-700/80"
              >
                <div
                  class="h-full"
                  :class="ep.completed ? 'bg-emerald-500' : 'bg-blue-500'"
                  :style="{ width: `${ep.progressPercent}%` }"
                ></div>
              </div>
            </div>

            <div class="min-w-0 flex-1 cursor-pointer" @click="handlePlaySeries(selectedSeries, ep)">
              <div class="flex flex-wrap items-center gap-1.5">
                <span
                  v-if="selectedSeasonFolderId === 'all-seasons' || selectedSeasonFolderId === 'specials'"
                  class="rounded bg-indigo-600/90 px-1.5 py-0.5 text-[10px] font-extrabold text-white"
                >
                  {{ ep.seasonLabel }}
                </span>
                <span
                  v-if="ep.episodeBadge"
                  class="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-blue-500"
                >
                  {{ ep.episodeBadge }}
                </span>
                <span
                  v-if="ep.completed"
                  class="rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-extrabold text-white"
                >
                  시청 완료
                </span>
                <p class="truncate text-sm font-extrabold text-[var(--text-main)] hover:text-blue-500">
                  {{ ep.displayTitle || ep.name }}
                </p>
              </div>
              <p class="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                {{ ep.folderPathLabel }} · {{ ep.sizeLabel }} · {{ ep.uploadDateLabel }}
                <template v-if="ep.durationLabel && !showThumbnails"> · {{ ep.durationLabel }}</template>
              </p>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              data-testid="episode-list-exclude"
              class="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-500 hover:bg-amber-500/20"
              title="미디어 목록에서 제외 (원본 파일은 유지)"
              @click="handleExcludeSingleMediaItem(ep)"
            >
              목록에서 제외
            </button>
            <button
              type="button"
              class="rounded-xl border border-[var(--border-color)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-main)]"
              @click="mediaPhotoStore.navigateToOriginalFolder(ep, router)"
            >
              원본 위치
            </button>
            <button
              type="button"
              class="rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
              @click="handlePlaySeries(selectedSeries, ep)"
            >
              재생
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- [B] Collections Overview Rail (on 'collections' section) -->
    <section
      v-if="activeSection === 'collections' && !selectedCollectionId"
      class="space-y-3"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-layer-group text-purple-500"></i>
          <h2 class="text-base font-black text-[var(--text-main)]">내 미디어 컬렉션</h2>
          <span class="rounded-full bg-purple-500/15 px-2 py-0.5 text-[11px] font-extrabold text-purple-500">
            {{ collections.length }}
          </span>
        </div>
        <button
          type="button"
          class="text-xs font-bold text-blue-500 hover:underline"
          @click="openCreateCollectionModal([])"
        >
          + 새 컬렉션 만들기
        </button>
      </div>

      <div
        v-if="collections.length === 0"
        class="rounded-3xl border border-dashed border-[var(--border-color)] bg-[var(--bg-elevated)] p-10 text-center"
      >
        <i class="fa-solid fa-layer-group text-3xl text-purple-400"></i>
        <p class="mt-3 text-sm font-extrabold text-[var(--text-main)]">아직 만든 미디어 컬렉션이 없습니다</p>
        <button
          type="button"
          class="mt-4 rounded-2xl bg-blue-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-blue-500"
          @click="openCreateCollectionModal([])"
        >
          첫 컬렉션 만들기
        </button>
      </div>

      <div v-else class="grid" :class="mediaGridColsClass">
        <div
          v-for="col in collections"
          :key="col.id"
          class="group flex flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <div
            v-if="showThumbnails"
            :ref="(el) => observeThumbnailEl(el, col.coverItem)"
            class="relative w-full cursor-pointer overflow-hidden bg-slate-900"
            :class="thumbAspectClass"
            @click="openCollectionDetail(col)"
          >
            <img
              v-if="col.coverItem && thumbnailMap[String(col.coverItem.id)]"
              :src="thumbnailMap[String(col.coverItem.id)]"
              :alt="col.name"
              class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
            <div v-else class="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-900/60 to-slate-900 text-purple-300">
              <i class="fa-solid fa-layer-group text-3xl"></i>
            </div>

            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>

            <div class="absolute bottom-3 left-3 right-3 flex items-end justify-between text-white">
              <div class="min-w-0">
                <span class="rounded bg-purple-600/90 px-2 py-0.5 text-[10px] font-extrabold">
                  항목 {{ col.itemCount }}개
                </span>
                <h3 class="mt-1 truncate text-sm font-black">{{ col.name }}</h3>
              </div>
              <button
                type="button"
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition hover:bg-blue-500"
                title="컬렉션 전체 연속 재생"
                @click.stop="handlePlayCollection(col)"
              >
                <i class="fa-solid fa-play text-xs ml-0.5"></i>
              </button>
            </div>
          </div>

          <div
            v-if="!showThumbnails"
            class="flex items-center justify-between gap-2 border-b border-[var(--border-color)] p-3"
          >
            <div class="min-w-0 cursor-pointer" @click="openCollectionDetail(col)">
              <span class="rounded bg-purple-600/90 px-2 py-0.5 text-[10px] font-extrabold text-white">
                항목 {{ col.itemCount }}개
              </span>
              <h3 class="mt-1 truncate text-sm font-black text-[var(--text-main)] hover:text-blue-500">
                {{ col.name }}
              </h3>
            </div>
            <button
              type="button"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow hover:bg-blue-500"
              title="컬렉션 전체 연속 재생"
              @click.stop="handlePlayCollection(col)"
            >
              <i class="fa-solid fa-play text-xs ml-0.5"></i>
            </button>
          </div>

          <div class="flex items-center justify-between gap-2 p-3 text-xs">
            <span class="truncate text-[var(--text-muted)]">
              {{ col.description || (col.totalDurationLabel ? `총 ${col.totalDurationLabel}` : "설명 없음") }}
            </span>
            <div class="flex shrink-0 items-center gap-1">
              <button
                type="button"
                class="rounded-lg px-2 py-1 text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-input)]"
                @click="openEditCollectionModal(col)"
              >
                편집
              </button>
              <button
                type="button"
                class="rounded-lg px-2 py-1 text-[11px] font-bold text-rose-500 hover:bg-rose-500/10"
                @click="handleDeleteCollection(col)"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- [C] Active Collection Detail Banner -->
    <section
      v-if="activeCollection"
      class="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-purple-500/30 bg-purple-500/10 p-5"
    >
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] text-[var(--text-main)]"
          @click="closeCollectionDetail"
        >
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <div>
          <div class="flex items-center gap-2">
            <span class="rounded-md bg-purple-600 px-2 py-0.5 text-[10px] font-extrabold text-white">컬렉션</span>
            <h2 class="text-lg font-black text-[var(--text-main)]">{{ activeCollection.name }}</h2>
          </div>
          <p class="mt-0.5 text-xs text-[var(--text-muted)]">
            {{ activeCollection.description || "동영상 및 이미지 컬렉션" }} · 총 {{ activeCollection.itemCount }}개 항목
            <span v-if="activeCollection.totalDurationLabel">· {{ activeCollection.totalDurationLabel }}</span>
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-blue-500"
          @click="handlePlayCollection(activeCollection)"
        >
          <i class="fa-solid fa-play"></i>
          <span>전체 연속 재생</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3.5 py-2 text-xs font-bold text-[var(--text-main)]"
          @click="openEditCollectionModal(activeCollection)"
        >
          <i class="fa-solid fa-pen"></i>
          <span>항목 추가·편집</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-500"
          @click="handleDeleteCollection(activeCollection)"
        >
          <i class="fa-solid fa-trash"></i>
          <span>컬렉션 삭제</span>
        </button>
      </div>
    </section>

    <!-- [D] Main Video Grid / List Section (Shown on 'continue', 'recent', 'favorites', or inside a collection) -->
    <section
      v-if="activeSection !== 'series' && (activeSection !== 'collections' || selectedCollectionId)"
      class="space-y-3"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <h2 class="text-base font-black text-[var(--text-main)]">
            <template v-if="activeCollection">{{ activeCollection.name }} 수록 콘텐츠</template>
            <template v-else-if="activeSection === 'continue'">이어서 시청하기</template>
            <template v-else-if="activeSection === 'recent'">최근 시청한 동영상</template>
            <template v-else-if="activeSection === 'favorites'">즐겨찾는 미디어</template>
            <template v-else>동영상 목록</template>
          </h2>
          <span class="rounded-full bg-[var(--bg-input)] px-2.5 py-0.5 text-xs font-extrabold text-[var(--text-secondary)]">
            {{ visibleMainItems.length }}개
          </span>
        </div>

        <button
          v-if="visibleMainItems.length > 0"
          type="button"
          class="text-xs font-bold text-[var(--text-secondary)] hover:text-blue-500"
          @click="selectAllVisible"
        >
          전체 선택
        </button>
      </div>

      <!-- Guided Empty State -->
      <div
        v-if="visibleMainItems.length === 0"
        data-testid="main-items-empty-state"
        class="rounded-3xl border border-dashed border-[var(--border-color)] bg-[var(--bg-elevated)] px-6 py-10 text-center"
      >
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
          <i :class="hasActiveFilters ? 'fa-solid fa-filter-circle-xmark text-xl' : 'fa-solid fa-film text-xl'"></i>
        </div>

        <template v-if="hasActiveFilters">
          <h3 class="mt-4 text-base font-extrabold text-[var(--text-main)]">
            조건에 맞는 미디어가 없습니다
          </h3>
          <div class="mt-5 flex justify-center">
            <button
              type="button"
              class="rounded-2xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-blue-500"
              @click="resetBrowsingFilters"
            >
              검색 · 필터 초기화
            </button>
          </div>
        </template>

        <template v-else>
          <h3 class="mt-4 text-base font-extrabold text-[var(--text-main)]">
            {{ mediaPhotoStore.preferences.mediaSourceMode === "manual" && mediaPhotoStore.candidateVideos.length > 0
              ? `지정된 항목이 없습니다 (${storageNoun}에 동영상 ${mediaPhotoStore.candidateVideos.length}개 보관 중)`
              : "표시할 미디어 콘텐츠가 없습니다" }}
          </h3>
          <div class="mt-5 flex flex-wrap justify-center gap-2.5">
            <button
              type="button"
              class="rounded-2xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-blue-500"
              @click="uploadInputRef?.click()"
            >
              새 동영상 업로드
            </button>
            <button
              type="button"
              class="rounded-2xl border border-blue-500/40 bg-blue-500/10 px-4 py-2.5 text-xs font-extrabold text-blue-500 hover:bg-blue-500/20"
              @click="openSourcePickerModal('folders')"
            >
              {{ storageNoun }} 폴더·동영상 지정
            </button>
            <button
              v-if="mediaPhotoStore.preferences.mediaSourceMode === 'manual' && mediaPhotoStore.candidateVideos.length > 0"
              type="button"
              class="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-extrabold text-emerald-500 hover:bg-emerald-500/20"
              @click="mediaPhotoStore.updatePreferences({ mediaSourceMode: 'all' })"
            >
              전체 동영상 자동 표시 켜기 ({{ mediaPhotoStore.candidateVideos.length }}개)
            </button>
          </div>
        </template>
      </div>

      <!-- Cinema Card Grid View -->
      <div
        v-else-if="viewMode === 'card'"
        class="grid"
        :class="mediaGridColsClass"
      >
        <article
          v-for="(item, idx) in visibleMainItems"
          :key="item.id"
          class="group relative flex flex-col overflow-hidden rounded-2xl border bg-[var(--bg-elevated)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
          :class="selectedIdSet.has(String(item.id))
            ? 'border-blue-500 ring-2 ring-blue-500/30'
            : 'border-[var(--border-color)]'"
        >
          <!-- Thumbnail Stage -->
          <div
            v-if="showThumbnails"
            :ref="(el) => observeThumbnailEl(el, item)"
            class="relative w-full cursor-pointer overflow-hidden bg-slate-900"
            :class="thumbAspectClass"
            @click="handlePlayItem(item, visibleMainItems)"
          >
            <img
              v-if="thumbnailMap[String(item.id)]"
              :src="thumbnailMap[String(item.id)]"
              :alt="item.name"
              loading="lazy"
              class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
            <div v-else class="flex h-full w-full items-center justify-center text-slate-500">
              <i :class="item.mediaKind === 'image' ? 'fa-regular fa-image text-3xl' : 'fa-solid fa-film text-3xl'"></i>
            </div>

            <!-- Play Hover Overlay -->
            <div class="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition group-hover:opacity-100 max-sm:opacity-60">
              <div class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl">
                <i :class="item.mediaKind === 'image' ? 'fa-solid fa-expand' : 'fa-solid fa-play ml-0.5'"></i>
              </div>
            </div>

            <!-- Top-left Selection Checkbox & Badges -->
            <div class="absolute left-2.5 top-2.5 flex items-center gap-1.5" @click.stop>
              <input
                type="checkbox"
                class="h-4 w-4 cursor-pointer rounded border-white/50 bg-black/60 text-blue-600 focus:ring-blue-500"
                :checked="selectedIdSet.has(String(item.id))"
                @click="toggleSelectItem(item, $event)"
              />
              <span
                v-if="item.resolutionLabel"
                class="rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-extrabold text-blue-300 backdrop-blur-sm"
              >
                {{ item.resolutionLabel }}
              </span>
              <span
                v-if="item.completed"
                class="rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-extrabold text-white"
              >
                시청 완료
              </span>
              <span
                v-else-if="item.watchState === 'watching'"
                class="rounded bg-blue-600/90 px-1.5 py-0.5 text-[10px] font-extrabold text-white"
              >
                {{ item.progressPercent }}% 시청 중
              </span>
            </div>

            <!-- Top-right Favorite Star -->
            <button
              type="button"
              class="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-xs transition hover:bg-black/80"
              :class="item.isFavorite ? 'text-amber-400' : 'text-white/80 hover:text-white'"
              title="즐겨찾기"
              @click.stop="mediaPhotoStore.toggleMediaFavorite(item.id)"
            >
              <i :class="item.isFavorite ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
            </button>

            <!-- Bottom-right Duration -->
            <span
              v-if="item.durationLabel"
              class="absolute bottom-2.5 right-2.5 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white"
            >
              {{ item.durationLabel }}
            </span>

            <!-- Watch Progress Bar -->
            <div
              v-if="item.progressPercent > 0"
              class="absolute inset-x-0 bottom-0 h-1.5 bg-slate-700/80"
            >
              <div
                class="h-full"
                :class="item.completed ? 'bg-emerald-500' : 'bg-blue-500'"
                :style="{ width: `${item.progressPercent}%` }"
              ></div>
            </div>
          </div>

          <!-- Card Footer Info -->
          <div class="flex flex-1 flex-col justify-between" :class="gridDensity === 'compact' ? 'p-2.5' : 'p-3.5'">
            <div v-if="!showThumbnails" class="mb-2 flex items-center justify-between gap-2 border-b border-[var(--border-color)] pb-2">
              <div class="flex flex-wrap items-center gap-1.5" @click.stop>
                <input
                  type="checkbox"
                  class="h-4 w-4 cursor-pointer rounded border-[var(--border-color)] text-blue-600 focus:ring-blue-500"
                  :checked="selectedIdSet.has(String(item.id))"
                  @click="toggleSelectItem(item, $event)"
                />
                <span
                  v-if="item.resolutionLabel"
                  class="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-blue-500"
                >
                  {{ item.resolutionLabel }}
                </span>
                <span
                  v-if="item.durationLabel"
                  class="rounded bg-[var(--bg-input)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--text-secondary)]"
                >
                  {{ item.durationLabel }}
                </span>
              </div>
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  class="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-input)] text-xs transition"
                  :class="item.isFavorite ? 'text-amber-400' : 'text-[var(--text-muted)]'"
                  title="즐겨찾기"
                  @click.stop="mediaPhotoStore.toggleMediaFavorite(item.id)"
                >
                  <i :class="item.isFavorite ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
                </button>
                <button
                  type="button"
                  class="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs text-white hover:bg-blue-500"
                  title="재생"
                  @click="handlePlayItem(item, visibleMainItems)"
                >
                  <i :class="item.mediaKind === 'image' ? 'fa-solid fa-expand' : 'fa-solid fa-play ml-0.5'"></i>
                </button>
              </div>
            </div>
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <h3
                  class="cursor-pointer truncate text-sm font-extrabold text-[var(--text-main)] hover:text-blue-500"
                  :title="item.name"
                  @click="handlePlayItem(item, visibleMainItems)"
                >
                  {{ item.displayTitle || item.name }}
                </h3>
                <p class="mt-1 truncate text-[11px] text-[var(--text-muted)]">
                  {{ item.folderPathLabel }} · {{ item.sizeLabel }}
                </p>
              </div>

              <!-- Card Action Menu -->
              <div class="relative" @click.stop>
                <button
                  type="button"
                  class="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
                  @click="activeMenuCardId = activeMenuCardId === item.id ? null : item.id"
                >
                  <i class="fa-solid fa-ellipsis-vertical text-xs"></i>
                </button>

                <div
                  v-if="activeMenuCardId === item.id"
                  class="absolute bottom-8 right-0 z-30 w-48 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] py-1.5 text-xs shadow-2xl"
                >
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
                    @click="activeMenuCardId = null; handlePlayItem(item, visibleMainItems)"
                  >
                    <i class="fa-solid fa-play w-4 text-blue-500"></i>
                    <span>시어터에서 재생</span>
                  </button>
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
                    @click="activeMenuCardId = null; openBatchAddToCollection([item.id])"
                  >
                    <i class="fa-solid fa-layer-group w-4 text-purple-500"></i>
                    <span>컬렉션에 담기</span>
                  </button>
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
                    @click="activeMenuCardId = null; mediaPhotoStore.navigateToOriginalFolder(item, router)"
                  >
                    <i class="fa-regular fa-folder-open w-4 text-amber-500"></i>
                    <span>원본 폴더로 이동</span>
                  </button>
                  <button
                    v-if="canCreateShares && !item.sharedWithMe"
                    type="button"
                    class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
                    @click="activeMenuCardId = null; openShareDialog([item])"
                  >
                    <i class="fa-solid fa-share-nodes w-4 text-emerald-500"></i>
                    <span>공유 설정</span>
                  </button>
                  <button
                    v-if="!vaultOnly && !item.sharedWithMe && !item.lockedFile && !item.hiddenFolder"
                    type="button"
                    class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
                    @click="activeMenuCardId = null; openDownloadLinkDialog(item)"
                  >
                    <i class="fa-solid fa-link w-4 text-sky-500"></i>
                    <span>다운로드 링크 공유</span>
                  </button>
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
                    @click="activeMenuCardId = null; downloadFileAsset(item, item.name)"
                  >
                    <i class="fa-solid fa-download w-4 text-sky-500"></i>
                    <span>원본 다운로드</span>
                  </button>
                  <template v-if="activeCollection">
                    <button
                      v-if="idx > 0"
                      type="button"
                      class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
                      @click="activeMenuCardId = null; mediaPhotoStore.moveItemInMediaCollection(activeCollection.id, idx, idx - 1)"
                    >
                      <i class="fa-solid fa-arrow-up w-4 text-slate-400"></i>
                      <span>순서 위로 이동</span>
                    </button>
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-orange-500 hover:bg-[var(--bg-input)]"
                      @click="activeMenuCardId = null; mediaPhotoStore.removeItemsFromMediaCollection(activeCollection.id, [item.id])"
                    >
                      <i class="fa-solid fa-folder-minus w-4"></i>
                      <span>컬렉션에서 제외</span>
                    </button>
                  </template>
                  <div class="my-1 border-t border-[var(--border-color)]"></div>
                  <button
                    type="button"
                    data-testid="media-card-exclude"
                    class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-amber-500 hover:bg-amber-500/10"
                    @click="handleExcludeSingleMediaItem(item)"
                  >
                    <i class="fa-solid fa-eye-slash w-4"></i>
                    <span>미디어 목록에서 제외</span>
                  </button>
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 px-3.5 py-2 text-left font-bold text-rose-500 hover:bg-rose-500/10"
                    @click="handleTrashSingleOriginal(item)"
                  >
                    <i class="fa-solid fa-trash w-4"></i>
                    <span>원본 휴지통 이동</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="mt-2.5 flex items-center justify-between border-t border-[var(--border-color)] pt-2 text-[11px] text-[var(--text-muted)]">
              <span>{{ item.uploadDateLabel }}</span>
              <span v-if="item.matchingSubtitles?.length" class="font-bold text-emerald-500">
                CC 자막 지원
              </span>
            </div>
          </div>
        </article>
      </div>

      <!-- List View -->
      <div
        v-else
        class="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)]"
      >
        <div
          v-for="item in visibleMainItems"
          :key="'list-' + item.id"
          class="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3 last:border-b-0 hover:bg-[var(--bg-input)]"
        >
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <input
              type="checkbox"
              class="h-4 w-4 rounded text-blue-600"
              :checked="selectedIdSet.has(String(item.id))"
              @click.stop="toggleSelectItem(item, $event)"
            />
            <div
              v-if="showThumbnails"
              :ref="(el) => observeThumbnailEl(el, item)"
              class="relative shrink-0 cursor-pointer overflow-hidden rounded-xl bg-slate-900"
              :class="listThumbSizeClass"
              @click="handlePlayItem(item, visibleMainItems)"
            >
              <img
                v-if="thumbnailMap[String(item.id)]"
                :src="thumbnailMap[String(item.id)]"
                :alt="item.name"
                class="h-full w-full object-cover"
              />
              <div v-else class="flex h-full w-full items-center justify-center text-slate-500">
                <i :class="item.mediaKind === 'image' ? 'fa-regular fa-image text-lg' : 'fa-solid fa-film text-lg'"></i>
              </div>
              <span
                v-if="item.durationLabel"
                class="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[10px] font-bold text-white"
              >
                {{ item.durationLabel }}
              </span>
            </div>

            <div class="min-w-0 flex-1 cursor-pointer" @click="handlePlayItem(item, visibleMainItems)">
              <div class="flex items-center gap-2">
                <span v-if="item.resolutionLabel" class="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold text-blue-500">
                  {{ item.resolutionLabel }}
                </span>
                <p class="truncate text-sm font-extrabold text-[var(--text-main)]">{{ item.name }}</p>
              </div>
              <p class="mt-0.5 text-xs text-[var(--text-muted)]">
                {{ item.folderPathLabel }} · {{ item.sizeLabel }} · {{ item.uploadDateLabel }}
              </p>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              data-testid="media-list-exclude"
              class="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-500 hover:bg-amber-500/20"
              title="미디어 목록에서 제외 (원본 유지)"
              @click="handleExcludeSingleMediaItem(item)"
            >
              제외
            </button>
            <button
              type="button"
              class="rounded-xl border border-[var(--border-color)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-main)]"
              @click="mediaPhotoStore.navigateToOriginalFolder(item, router)"
            >
              원본 위치
            </button>
            <button
              type="button"
              class="rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
              @click="handlePlayItem(item, visibleMainItems)"
            >
              재생
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Create / Edit Media Collection Modal -->
    <Teleport to="body">
      <div
        v-if="isCollectionModalOpen"
        class="fixed inset-0 z-[280] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
        @click.self="isCollectionModalOpen = false"
      >
        <div class="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] shadow-2xl">
          <div class="flex items-center justify-between border-b border-[var(--border-color)] px-6 py-4">
            <h3 class="text-base font-black text-[var(--text-main)]">
              {{ editingCollectionId ? "미디어 컬렉션 편집" : "새 미디어 컬렉션 만들기" }}
            </h3>
            <button type="button" class="text-[var(--text-muted)] hover:text-[var(--text-main)]" @click="isCollectionModalOpen = false">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="flex-1 space-y-4 overflow-y-auto p-6 text-xs">
            <div>
              <label class="font-bold text-[var(--text-main)]">컬렉션 이름 *</label>
              <input
                v-model="collectionFormName"
                type="text"
                placeholder="예: 2026 제주도 여행 브이로그, 개발 강의 모음"
                class="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3.5 py-2.5 text-xs text-[var(--text-main)] focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label class="font-bold text-[var(--text-main)]">컬렉션 설명 (선택)</label>
              <input
                v-model="collectionFormDesc"
                type="text"
                placeholder="컬렉션에 대한 간단한 메모를 남겨보세요"
                class="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3.5 py-2.5 text-xs text-[var(--text-main)] focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <label class="font-bold text-[var(--text-main)]">
                  컬렉션에 포함할 콘텐츠 선택 ({{ collectionFormSelectedIds.length }}개 선택됨)
                </label>
                <label class="inline-flex cursor-pointer items-center gap-1.5 text-[var(--text-secondary)]">
                  <input
                    v-model="includePhotosInPicker"
                    type="checkbox"
                    class="h-3.5 w-3.5 rounded text-blue-600"
                  />
                  <span>{{ storageNoun }} 사진(이미지)도 함께 표시</span>
                </label>
              </div>

              <input
                v-model="collectionPickerSearch"
                type="text"
                placeholder="추가할 파일 이름 검색..."
                class="mt-2 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-main)]"
              />

              <div class="mt-2 max-h-60 space-y-1.5 overflow-y-auto rounded-2xl border border-[var(--border-color)] p-2">
                <div
                  v-for="cand in pickerCandidates"
                  :key="'pick-' + cand.id"
                  class="flex items-center justify-between gap-2 rounded-xl px-3 py-2 hover:bg-[var(--bg-input)]"
                >
                  <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      class="h-4 w-4 rounded text-blue-600"
                      :checked="collectionFormSelectedIds.includes(String(cand.id))"
                      @change="togglePickerItem(cand.id)"
                    />
                    <span class="truncate font-semibold text-[var(--text-main)]">{{ cand.name }}</span>
                    <span class="shrink-0 text-[10px] text-[var(--text-muted)]">({{ cand.sizeLabel }})</span>
                  </label>

                  <button
                    v-if="collectionFormSelectedIds.includes(String(cand.id))"
                    type="button"
                    class="shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold"
                    :class="String(collectionFormCoverId) === String(cand.id)
                      ? 'bg-purple-600 text-white'
                      : 'bg-[var(--bg-input)] text-[var(--text-muted)]'"
                    @click="collectionFormCoverId = String(cand.id)"
                  >
                    {{ String(collectionFormCoverId) === String(cand.id) ? "대표 썸네일" : "대표로 지정" }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 border-t border-[var(--border-color)] px-6 py-4">
            <button
              type="button"
              class="rounded-xl border border-[var(--border-color)] px-4 py-2 text-xs font-bold text-[var(--text-secondary)]"
              @click="isCollectionModalOpen = false"
            >
              취소
            </button>
            <button
              type="button"
              class="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-blue-500"
              @click="saveCollectionModal"
            >
              저장하기
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Quick Add to Collection Modal -->
    <Teleport to="body">
      <div
        v-if="isAddToCollectionModalOpen"
        class="fixed inset-0 z-[280] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
        @click.self="isAddToCollectionModalOpen = false"
      >
        <div class="w-full max-w-md rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-6 shadow-2xl space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-black text-[var(--text-main)]">
              컬렉션에 추가 ({{ addToCollectionTargetIds.length }}개 항목)
            </h3>
            <button type="button" class="text-[var(--text-muted)]" @click="isAddToCollectionModalOpen = false">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div v-if="collections.length === 0" class="py-4 text-center text-xs text-[var(--text-muted)]">
            생성된 컬렉션이 없습니다. 새 컬렉션을 만들어 추가해 보세요.
          </div>

          <div v-else class="max-h-60 space-y-2 overflow-y-auto">
            <button
              v-for="col in collections"
              :key="'add-col-' + col.id"
              type="button"
              class="flex w-full items-center justify-between rounded-2xl border border-[var(--border-color)] px-4 py-3 text-left text-xs font-bold text-[var(--text-main)] hover:bg-[var(--bg-input)]"
              @click="applyBatchAddToCollection(col.id)"
            >
              <span>{{ col.name }}</span>
              <span class="text-[var(--text-muted)]">{{ col.itemCount }}개 항목</span>
            </button>
          </div>

          <button
            type="button"
            class="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-extrabold text-white hover:bg-blue-500"
            @click="isAddToCollectionModalOpen = false; openCreateCollectionModal(addToCollectionTargetIds)"
          >
            + 새 컬렉션 만들어 담기
          </button>
        </div>
      </div>
    </Teleport>

    <!-- Source File / Folder Designation Modal -->
    <Teleport to="body">
      <div
        v-if="isSourcePickerModalOpen"
        class="fixed inset-0 z-[285] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
        @click.self="isSourcePickerModalOpen = false"
      >
        <div class="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] shadow-2xl">
          <div class="flex items-center justify-between border-b border-[var(--border-color)] px-6 py-4">
            <div>
              <h3 class="text-base font-black text-[var(--text-main)]">
                미디어 영역(디렉터리) · 폴더/파일 지정
              </h3>
              <p class="mt-0.5 text-xs text-[var(--text-muted)]">
                디렉터리를 미디어 영역(예: 홈/저장한내용/엔터/비디오들/애니메이션)으로 지정하면 하위 작품 폴더(/간츠, /내청코 등)가 자동으로 구분·등록됩니다.
              </p>
            </div>
            <button type="button" class="text-[var(--text-muted)] hover:text-[var(--text-main)]" @click="isSourcePickerModalOpen = false">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="flex-1 space-y-4 overflow-y-auto p-6 text-xs">
            <!-- Mode Quick Banner -->
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] p-3.5">
              <div>
                <p class="font-extrabold text-[var(--text-main)]">표시 모드 설정</p>
                <p class="text-[11px] text-[var(--text-muted)]">
                  지정한 영역·항목만 볼지, {{ storageNoun }} 전체 동영상을 자동으로 볼지 선택하세요.
                </p>
              </div>
              <div class="inline-flex rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-1">
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 font-extrabold transition"
                  :class="mediaPhotoStore.preferences.mediaSourceMode === 'manual' ? 'bg-blue-600 text-white' : 'text-[var(--text-secondary)]'"
                  @click="mediaPhotoStore.updatePreferences({ mediaSourceMode: 'manual' })"
                >
                  지정 영역·항목만 표시
                </button>
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 font-extrabold transition"
                  :class="mediaPhotoStore.preferences.mediaSourceMode === 'all' ? 'bg-blue-600 text-white' : 'text-[var(--text-secondary)]'"
                  @click="mediaPhotoStore.updatePreferences({ mediaSourceMode: 'all' }); isSourcePickerModalOpen = false"
                >
                  모든 동영상 자동 표시 ({{ mediaPhotoStore.candidateVideos.length }})
                </button>
              </div>
            </div>

            <!-- Tabs: Areas vs Folders vs Individual Files -->
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="inline-flex flex-wrap gap-1 rounded-xl bg-[var(--bg-input)] p-1">
                <button
                  type="button"
                  class="rounded-lg px-3.5 py-1.5 font-extrabold transition"
                  :class="sourcePickerTab === 'areas' ? 'bg-teal-600 text-white' : 'text-[var(--text-secondary)]'"
                  @click="sourcePickerTab = 'areas'"
                >
                  미디어 영역(디렉터리) 지정 ({{ (mediaPhotoStore.resolvedMediaAreas || []).length }})
                </button>
                <button
                  type="button"
                  class="rounded-lg px-3.5 py-1.5 font-extrabold transition"
                  :class="sourcePickerTab === 'folders' ? 'bg-blue-600 text-white' : 'text-[var(--text-secondary)]'"
                  @click="sourcePickerTab = 'folders'"
                >
                  개별 폴더 지정 ({{ sourcePickerSelectedFolderIds.length }})
                </button>
                <button
                  type="button"
                  class="rounded-lg px-3.5 py-1.5 font-extrabold transition"
                  :class="sourcePickerTab === 'files' ? 'bg-blue-600 text-white' : 'text-[var(--text-secondary)]'"
                  @click="sourcePickerTab = 'files'"
                >
                  개별 동영상 ({{ sourcePickerSelectedFileIds.length }})
                </button>
              </div>

              <button
                v-if="sourcePickerTab === 'files' && fileCandidateList.length > 0"
                type="button"
                class="font-bold text-blue-500 hover:underline"
                @click="toggleSelectAllCandidateFiles"
              >
                검색 결과 전체 선택/해제
              </button>
            </div>

            <input
              v-model="sourcePickerSearch"
              type="text"
              :placeholder="sourcePickerTab === 'areas'
                ? '영역으로 지정할 폴더 이름 또는 경로 검색 (예: 애니메이션)...'
                : (sourcePickerTab === 'files' ? `${storageNoun} 동영상 이름 또는 폴더 경로 검색...` : '폴더 이름 또는 경로 검색...')"
              class="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3.5 py-2 text-xs text-[var(--text-main)]"
            />

            <!-- Tab 1: Media Area Directory Designation & Tree Navigator -->
            <div v-if="sourcePickerTab === 'areas'" class="space-y-4">
              <!-- Registered Media Areas -->
              <div
                v-if="(mediaPhotoStore.resolvedMediaAreas || []).length > 0"
                class="space-y-2 rounded-2xl border border-teal-500/30 bg-teal-500/5 p-3.5"
              >
                <div class="flex items-center justify-between">
                  <span class="inline-flex items-center gap-1.5 font-extrabold text-[var(--text-main)]">
                    <i class="fa-solid fa-folder-tree text-teal-500"></i>
                    <span>현재 지정된 미디어 영역 ({{ mediaPhotoStore.resolvedMediaAreas.length }})</span>
                  </span>
                  <span class="text-[11px] text-[var(--text-muted)]">새 작품 폴더를 올리면 자동으로 등록됩니다</span>
                </div>

                <div class="space-y-2">
                  <div
                    v-for="area in mediaPhotoStore.resolvedMediaAreas"
                    :key="'reg-area-' + area.folderId"
                    class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2.5"
                  >
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-1.5">
                        <span class="font-extrabold text-[var(--text-main)]">{{ area.name }}</span>
                        <span class="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-extrabold text-teal-600 dark:text-teal-400">
                          {{ area.seriesCount }}개 시리즈 · {{ area.episodeCount }}화
                        </span>
                        <span
                          v-if="area.isMissing"
                          class="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-500"
                        >
                          원본 폴더 없음
                        </span>
                      </div>
                      <p class="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{{ area.pathLabel }}</p>
                    </div>

                    <div class="flex flex-wrap items-center gap-1.5">
                      <select
                        :value="area.groupingMode"
                        class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1 text-[11px] font-bold text-[var(--text-main)]"
                        title="하위 폴더 시리즈 분류 방식"
                        @change="handleAreaGroupingModeChange(area.folderId, $event.target.value)"
                      >
                        <option value="children-as-series">직계 하위 폴더별 분리</option>
                        <option value="children-plus-similarity">유사 이름 시즌 병합 포함</option>
                      </select>
                      <button
                        type="button"
                        class="rounded-lg border border-[var(--border-color)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
                        @click="browseAreaFolder(area.folderId)"
                      >
                        미리보기
                      </button>
                      <button
                        type="button"
                        class="rounded-lg bg-rose-500/15 px-2.5 py-1 text-[11px] font-bold text-rose-500 hover:bg-rose-500/25"
                        @click="mediaPhotoStore.removeMediaLibraryArea(area.folderId)"
                      >
                        해제
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Current Browsed Directory Area Action & Live Series Preview -->
              <div
                v-if="currentBrowsedAreaPreview && !sourcePickerSearch.trim()"
                class="space-y-3 rounded-2xl border border-blue-500/30 bg-blue-500/5 p-3.5"
              >
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <i class="fa-solid fa-folder-open text-amber-500"></i>
                      <span class="text-sm font-black text-[var(--text-main)]">{{ currentBrowsedAreaPreview.name }}</span>
                      <span
                        v-if="currentBrowsedAreaPreview.isRegistered"
                        class="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-extrabold text-white"
                      >
                        미디어 영역 적용 중
                      </span>
                    </div>
                    <p class="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{{ currentBrowsedAreaPreview.pathLabel }}</p>
                  </div>

                  <div class="flex flex-wrap items-center gap-1.5">
                    <select
                      :value="currentBrowsedAreaPreview.isRegistered ? currentBrowsedAreaPreview.groupingMode : areaBrowserGroupingMode"
                      class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--text-main)]"
                      @change="handleAreaGroupingModeChange(currentBrowsedAreaPreview.folderId, $event.target.value)"
                    >
                      <option value="children-as-series">직계 하위 폴더별로 시리즈 분리 (권장)</option>
                      <option value="children-plus-similarity">직계 폴더 분리 + 유사 이름 시즌 병합</option>
                    </select>
                    <button
                      v-if="!currentBrowsedAreaPreview.isRegistered"
                      type="button"
                      class="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-1.5 font-extrabold text-white shadow-sm hover:bg-teal-500"
                      @click="designateAreaFolder(currentBrowsedAreaPreview.folderId)"
                    >
                      <i class="fa-solid fa-check"></i>
                      <span>이 디렉터리를 영역으로 지정</span>
                    </button>
                    <button
                      v-else
                      type="button"
                      class="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 font-bold text-rose-500 hover:bg-rose-500/20"
                      @click="mediaPhotoStore.removeMediaLibraryArea(currentBrowsedAreaPreview.folderId)"
                    >
                      <i class="fa-solid fa-xmark"></i>
                      <span>영역 해제</span>
                    </button>
                  </div>
                </div>

                <!-- Live Detected Child Series Preview -->
                <div class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-2.5">
                  <p class="font-bold text-[var(--text-main)]">
                    <template v-if="currentBrowsedAreaPreview.activeChildSeriesCount > 0">
                      자동 구분될 시리즈 {{ currentBrowsedAreaPreview.activeChildSeriesCount }}개 (총 {{ currentBrowsedAreaPreview.totalVideoCount }}화)
                    </template>
                    <template v-else-if="currentBrowsedAreaPreview.directRootVideoCount > 0">
                      하위 폴더 없이 직속 동영상 {{ currentBrowsedAreaPreview.directRootVideoCount }}개만 있습니다
                    </template>
                    <template v-else>
                      감지된 동영상 시리즈가 아직 없습니다 (빈 하위 폴더 {{ currentBrowsedAreaPreview.emptyChildFolderCount }}개)
                    </template>
                  </p>
                  <div
                    v-if="currentBrowsedAreaPreview.childSeries.length > 0"
                    class="mt-2 flex flex-wrap gap-1.5"
                  >
                    <button
                      v-for="child in currentBrowsedAreaPreview.childSeries.slice(0, 16)"
                      :key="'area-preview-' + child.folderId"
                      type="button"
                      class="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1 text-[11px] font-bold text-[var(--text-main)] hover:border-teal-500/50 hover:text-teal-500"
                      :title="`${child.pathLabel} · 동영상 ${child.videoCount}개`"
                      @click="browseAreaFolder(child.folderId)"
                    >
                      <i class="fa-solid fa-tv text-[10px] text-teal-500"></i>
                      <span class="max-w-[140px] truncate">{{ child.name }}</span>
                      <span class="text-[10px] text-[var(--text-muted)]">
                        {{ child.videoCount }}화<template v-if="child.subfolderCount > 0"> · 하위{{ child.subfolderCount }}</template>
                      </span>
                    </button>
                    <span
                      v-if="currentBrowsedAreaPreview.childSeries.length > 16"
                      class="inline-flex items-center rounded-lg bg-[var(--bg-input)] px-2 py-1 text-[10px] font-bold text-[var(--text-muted)]"
                    >
                      +{{ currentBrowsedAreaPreview.childSeries.length - 16 }}개 더
                    </span>
                  </div>
                  <p
                    v-if="currentBrowsedAreaPreview.directRootVideoCount > 0"
                    class="mt-1.5 text-[11px] text-[var(--text-muted)]"
                  >
                    이 디렉터리에 직접 들어있는 동영상 {{ currentBrowsedAreaPreview.directRootVideoCount }}개는 하위 시리즈에 섞이지 않고 단독 항목으로 유지됩니다.
                  </p>
                </div>
              </div>

              <!-- Search Results OR Folder Tree Navigator -->
              <div class="space-y-2 rounded-2xl border border-[var(--border-color)] p-3">
                <template v-if="sourcePickerSearch.trim()">
                  <div class="text-[11px] font-bold text-[var(--text-muted)]">
                    폴더 검색 결과 ({{ areaBrowserSearchResults.length }}개)
                  </div>
                  <div v-if="areaBrowserSearchResults.length === 0" class="py-8 text-center text-[var(--text-muted)]">
                    검색어와 일치하는 {{ vaultOnly ? "비밀 폴더" : "드라이브 폴더" }}가 없습니다.
                  </div>
                  <div v-else class="max-h-60 space-y-1.5 overflow-y-auto">
                    <div
                      v-for="folder in areaBrowserSearchResults"
                      :key="'area-search-' + folder.idStr"
                      class="flex items-center justify-between gap-2 rounded-xl px-3 py-2 hover:bg-[var(--bg-input)]"
                    >
                      <button
                        type="button"
                        class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        @click="browseAreaFolder(folder.idStr)"
                      >
                        <i class="fa-solid fa-folder text-amber-500"></i>
                        <div class="min-w-0 flex-1">
                          <p class="truncate font-bold text-[var(--text-main)]">{{ folder.name }}</p>
                          <p class="truncate text-[11px] text-[var(--text-muted)]">{{ folder.pathLabel }}</p>
                        </div>
                      </button>
                      <div class="flex shrink-0 items-center gap-1.5">
                        <button
                          v-if="!folder.isRegisteredArea"
                          type="button"
                          class="rounded-lg bg-teal-600 px-2.5 py-1 text-[11px] font-extrabold text-white hover:bg-teal-500"
                          @click="designateAreaFolder(folder.idStr)"
                        >
                          영역 지정
                        </button>
                        <button
                          v-else
                          type="button"
                          class="rounded-lg bg-teal-500/15 px-2.5 py-1 text-[11px] font-extrabold text-teal-600 dark:text-teal-400"
                          @click="mediaPhotoStore.removeMediaLibraryArea(folder.idStr)"
                        >
                          등록됨 · 해제
                        </button>
                      </div>
                    </div>
                  </div>
                </template>

                <template v-else>
                  <!-- Breadcrumbs -->
                  <div class="flex flex-wrap items-center gap-1 border-b border-[var(--border-color)] pb-2 text-[11px]">
                    <template v-for="(crumb, cIdx) in areaBrowserBreadcrumbs" :key="'crumb-' + (crumb.id || 'root')">
                      <i v-if="cIdx > 0" class="fa-solid fa-chevron-right text-[9px] text-[var(--text-muted)]"></i>
                      <button
                        type="button"
                        class="rounded-lg px-2 py-1 font-bold transition"
                        :class="cIdx === areaBrowserBreadcrumbs.length - 1
                          ? 'bg-[var(--bg-input)] text-[var(--text-main)]'
                          : 'text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]'"
                        @click="browseAreaFolder(crumb.id)"
                      >
                        {{ crumb.name }}
                      </button>
                    </template>
                  </div>

                  <!-- Subfolder Navigation List -->
                  <div class="max-h-56 space-y-1 overflow-y-auto">
                    <button
                      v-if="areaBrowserBreadcrumbs.length > 1"
                      type="button"
                      class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-input)]"
                      @click="browseAreaFolder(areaBrowserBreadcrumbs[areaBrowserBreadcrumbs.length - 2].id)"
                    >
                      <i class="fa-solid fa-level-up-alt text-[11px]"></i>
                      <span>.. 상위 폴더로 이동</span>
                    </button>

                    <div
                      v-if="areaBrowserChildFolders.length === 0"
                      class="py-6 text-center text-[var(--text-muted)]"
                    >
                      이 위치 아래에 더 이상 하위 폴더가 없습니다. 상단에서 이 디렉터리를 영역으로 지정하거나 상위 폴더로 이동하세요.
                    </div>

                    <div
                      v-for="folder in areaBrowserChildFolders"
                      :key="'area-nav-' + folder.idStr"
                      class="flex items-center justify-between gap-2 rounded-xl px-3 py-2 hover:bg-[var(--bg-input)]"
                    >
                      <button
                        type="button"
                        class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        @click="browseAreaFolder(folder.idStr)"
                      >
                        <i
                          class="fa-solid fa-folder"
                          :class="folder.isRegisteredArea ? 'text-teal-500' : 'text-amber-500'"
                        ></i>
                        <div class="min-w-0 flex-1">
                          <p class="truncate font-bold text-[var(--text-main)]">{{ folder.name }}</p>
                          <p class="text-[11px] text-[var(--text-muted)]">
                            <template v-if="folder.hasChildren">하위 폴더 열기 가능</template>
                            <template v-else>직속 동영상 {{ folder.directVideoCount }}개</template>
                          </p>
                        </div>
                      </button>

                      <div class="flex shrink-0 items-center gap-1.5">
                        <button
                          v-if="!folder.isRegisteredArea"
                          type="button"
                          class="rounded-lg border border-teal-500/40 bg-teal-500/10 px-2.5 py-1 text-[11px] font-bold text-teal-600 hover:bg-teal-500/20 dark:text-teal-400"
                          @click.stop="designateAreaFolder(folder.idStr)"
                        >
                          영역 지정
                        </button>
                        <button
                          v-else
                          type="button"
                          class="rounded-lg bg-teal-600 px-2.5 py-1 text-[11px] font-extrabold text-white"
                          @click.stop="mediaPhotoStore.removeMediaLibraryArea(folder.idStr)"
                        >
                          등록됨
                        </button>
                        <button
                          type="button"
                          class="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-main)]"
                          title="하위 폴더 탐색"
                          @click="browseAreaFolder(folder.idStr)"
                        >
                          <i class="fa-solid fa-chevron-right text-[11px]"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <!-- Individual Video Files List -->
            <div
              v-else-if="sourcePickerTab === 'files'"
              class="max-h-72 space-y-1.5 overflow-y-auto rounded-2xl border border-[var(--border-color)] p-2"
            >
              <div v-if="fileCandidateList.length === 0" class="py-8 text-center text-[var(--text-muted)]">
                {{ storageNoun }}에 선택 가능한 동영상이 없습니다.
              </div>
              <label
                v-for="video in fileCandidateList"
                :key="'src-file-' + video.id"
                class="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--bg-input)]"
              >
                <div class="flex min-w-0 flex-1 items-center gap-2.5">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded text-blue-600"
                    :checked="sourcePickerSelectedFileIds.includes(String(video.id))"
                    @change="toggleSourcePickerFile(video.id)"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-bold text-[var(--text-main)]">{{ video.name }}</p>
                    <p class="truncate text-[11px] text-[var(--text-muted)]">
                      {{ video.folderPathLabel }} · {{ video.sizeLabel }}
                    </p>
                  </div>
                </div>
                <span class="shrink-0 rounded-md bg-[var(--bg-input)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">
                  {{ video.extension?.toUpperCase() || "VIDEO" }}
                </span>
              </label>
            </div>

            <!-- Drive Folders List -->
            <div
              v-else
              class="max-h-72 space-y-1.5 overflow-y-auto rounded-2xl border border-[var(--border-color)] p-2"
            >
              <div v-if="folderCandidateList.length === 0" class="py-8 text-center text-[var(--text-muted)]">
                {{ storageNoun }}에 생성된 폴더가 없습니다.
              </div>
              <label
                v-for="folder in folderCandidateList"
                :key="'src-folder-' + folder.id"
                class="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--bg-input)]"
              >
                <div class="flex min-w-0 flex-1 items-center gap-2.5">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded text-blue-600"
                    :checked="sourcePickerSelectedFolderIds.includes(String(folder.id))"
                    @change="toggleSourcePickerFolder(folder.id)"
                  />
                  <i class="fa-solid fa-folder text-amber-500"></i>
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-bold text-[var(--text-main)]">{{ folder.name }}</p>
                    <p class="truncate text-[11px] text-[var(--text-muted)]">
                      {{ folder.pathLabel }} (하위 폴더 포함 · 유사 이름 폴더는 자동으로 같은 시리즈로 묶임)
                    </p>
                  </div>
                </div>
                <span class="shrink-0 rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[10px] font-extrabold text-blue-500">
                  직속 영상 {{ folder.folderVideoCount }}개
                </span>
              </label>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-color)] px-6 py-4 text-xs">
            <span class="font-bold text-[var(--text-muted)]">
              등록 영역 {{ (mediaPhotoStore.resolvedMediaAreas || []).length }}개 · 지정 폴더 {{ sourcePickerSelectedFolderIds.length }}개 · 개별 영상 {{ sourcePickerSelectedFileIds.length }}개 (적용 즉시 서버 저장)
            </span>
            <div class="flex items-center gap-2">
              <template v-if="sourcePickerTab === 'areas'">
                <button
                  type="button"
                  class="rounded-xl bg-teal-600 px-5 py-2 font-extrabold text-white hover:bg-teal-500"
                  @click="isSourcePickerModalOpen = false"
                >
                  완료 · 닫기
                </button>
              </template>
              <template v-else>
                <button
                  type="button"
                  class="rounded-xl border border-[var(--border-color)] px-4 py-2 font-bold text-[var(--text-secondary)]"
                  @click="isSourcePickerModalOpen = false"
                >
                  취소
                </button>
                <button
                  type="button"
                  class="rounded-xl bg-blue-600 px-5 py-2 font-extrabold text-white hover:bg-blue-500"
                  @click="saveSourcePickerModal"
                >
                  지정 항목 적용하기
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Series Editor Modal (Edit Title, Season Labels, Order, Add/Remove Folders) -->
    <Teleport to="body">
      <div
        v-if="isSeriesEditorModalOpen"
        class="fixed inset-0 z-[290] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
        @click.self="isSeriesEditorModalOpen = false"
      >
        <div class="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] shadow-2xl">
          <div class="flex items-center justify-between border-b border-[var(--border-color)] px-6 py-4">
            <div>
              <h3 class="text-base font-black text-[var(--text-main)]">
                시리즈 · 시즌 구성 편집
              </h3>
              <p class="mt-0.5 text-xs text-[var(--text-muted)]">
                시리즈 대표 제목을 변경하거나, 시즌별 표시 이름(시즌1, 속, 완, 극장판, OVA 등)과 순서를 직접 조정할 수 있습니다.
              </p>
            </div>
            <button type="button" class="text-[var(--text-muted)] hover:text-[var(--text-main)]" @click="isSeriesEditorModalOpen = false">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="flex-1 space-y-5 overflow-y-auto p-6 text-xs">
            <div>
              <label class="font-bold text-[var(--text-main)]">시리즈 대표 제목 *</label>
              <input
                v-model="seriesEditorTitle"
                type="text"
                placeholder="예: 역시 내 청춘 러브코메디는 잘못됐다 / 청춘 돼지 시리즈"
                class="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3.5 py-2.5 text-xs font-bold text-[var(--text-main)] focus:border-blue-500 focus:outline-none"
              />
            </div>

            <!-- Current Included Season Folders & Custom Season Labels -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="font-bold text-[var(--text-main)]">
                  포함된 시즌 · 특별편 폴더 ({{ seriesEditorFolderIds.length }}개)
                </label>
                <span class="text-[11px] text-[var(--text-muted)]">
                  순서를 위·아래로 조정하거나 시즌 라벨을 수정하세요
                </span>
              </div>

              <div class="space-y-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] p-3">
                <div
                  v-for="(folderId, idx) in seriesEditorFolderIds"
                  :key="'edit-season-' + folderId"
                  class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-2.5"
                >
                  <div class="flex min-w-0 flex-1 items-center gap-2">
                    <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-600/15 font-extrabold text-blue-500">
                      {{ idx + 1 }}
                    </span>
                    <input
                      v-model="seriesEditorSeasonLabels[folderId]"
                      type="text"
                      placeholder="예: 시즌 1, 시즌 2 (속), 극장판, OVA"
                      class="w-40 shrink-0 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-2.5 py-1 text-xs font-extrabold text-[var(--text-main)]"
                    />
                    <span class="truncate text-[11px] text-[var(--text-muted)]">
                      원본 폴더: {{ (mediaPhotoStore.activeMediaFolderUnits || []).find((u) => String(u.folderId) === String(folderId))?.folderName || folderId }}
                    </span>
                  </div>

                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      class="rounded-lg border border-[var(--border-color)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-input)] disabled:opacity-40"
                      :disabled="idx === 0"
                      title="위로 이동"
                      @click="moveSeriesEditorFolder(idx, -1)"
                    >
                      <i class="fa-solid fa-arrow-up"></i>
                    </button>
                    <button
                      type="button"
                      class="rounded-lg border border-[var(--border-color)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-input)] disabled:opacity-40"
                      :disabled="idx === seriesEditorFolderIds.length - 1"
                      title="아래로 이동"
                      @click="moveSeriesEditorFolder(idx, 1)"
                    >
                      <i class="fa-solid fa-arrow-down"></i>
                    </button>
                    <button
                      v-if="seriesEditorFolderIds.length > 1"
                      type="button"
                      class="rounded-lg bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-500 hover:bg-rose-500/20"
                      title="이 시리즈에서 제외 (별도 시리즈로 분리)"
                      @click="toggleFolderInSeriesEditor(folderId)"
                    >
                      제외
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Add Other Media Folders into This Series -->
            <div class="space-y-2">
              <label class="font-bold text-[var(--text-main)]">
                다른 미디어 폴더를 이 시리즈의 시즌·특별편·극장판으로 추가
              </label>
              <input
                v-model="seriesEditorSearch"
                type="text"
                placeholder="추가할 폴더 이름 검색..."
                class="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-main)]"
              />
              <div class="max-h-48 space-y-1.5 overflow-y-auto rounded-2xl border border-[var(--border-color)] p-2">
                <label
                  v-for="unit in seriesEditorCandidateFolders"
                  :key="'cand-unit-' + unit.folderId"
                  class="flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 hover:bg-[var(--bg-input)]"
                >
                  <div class="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      type="checkbox"
                      class="h-4 w-4 rounded text-blue-600"
                      :checked="seriesEditorFolderIds.includes(String(unit.folderId))"
                      @change="toggleFolderInSeriesEditor(unit.folderId)"
                    />
                    <span class="truncate font-bold text-[var(--text-main)]">{{ unit.folderName }}</span>
                    <span class="truncate text-[11px] text-[var(--text-muted)]">({{ unit.pathLabel }})</span>
                  </div>
                  <span class="shrink-0 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-500">
                    {{ unit.episodes?.length || 0 }}화
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 border-t border-[var(--border-color)] px-6 py-4 text-xs">
            <button
              type="button"
              class="rounded-xl border border-[var(--border-color)] px-4 py-2 font-bold text-[var(--text-secondary)]"
              @click="isSeriesEditorModalOpen = false"
            >
              취소
            </button>
            <button
              type="button"
              class="rounded-xl bg-blue-600 px-5 py-2 font-extrabold text-white hover:bg-blue-500"
              @click="saveSeriesEditorModal"
            >
              시리즈 구성 저장하기
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Merge Series Modal -->
    <Teleport to="body">
      <div
        v-if="isMergeSeriesModalOpen"
        class="fixed inset-0 z-[290] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
        @click.self="isMergeSeriesModalOpen = false"
      >
        <div class="w-full max-w-lg rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-6 shadow-2xl space-y-4 text-xs">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-black text-[var(--text-main)]">
              시리즈 하나로 합치기 (병합)
            </h3>
            <button type="button" class="text-[var(--text-muted)]" @click="isMergeSeriesModalOpen = false">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <p class="text-[var(--text-muted)]">
            제목 변형이 특이하여 따로 분류된 시즌·특별편·극장판 시리즈들을 하나의 작품으로 묶습니다.
          </p>

          <div>
            <label class="font-bold text-[var(--text-main)]">통합 시리즈 대표 제목 *</label>
            <input
              v-model="mergeCustomTitle"
              type="text"
              placeholder="통합 후 표시할 시리즈 제목 입력"
              class="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3.5 py-2.5 text-xs font-bold text-[var(--text-main)]"
            />
          </div>

          <div>
            <label class="font-bold text-[var(--text-main)]">
              합칠 시리즈 선택 ({{ selectedSeriesIds.length }}개 선택됨)
            </label>
            <div class="mt-2 max-h-60 space-y-1.5 overflow-y-auto rounded-2xl border border-[var(--border-color)] p-2">
              <label
                v-for="s in (mediaPhotoStore.resolvedMediaSeries || [])"
                :key="'merge-opt-' + s.id"
                class="flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 hover:bg-[var(--bg-input)]"
              >
                <div class="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded text-indigo-600"
                    :checked="selectedSeriesIds.includes(String(s.id))"
                    @change="toggleSelectSeriesCard(s.id)"
                  />
                  <span class="truncate font-bold text-[var(--text-main)]">{{ s.title }}</span>
                </div>
                <span class="shrink-0 text-[11px] text-[var(--text-muted)]">
                  폴더 {{ s.totalFolderCount }}개 · {{ s.episodeCount }}화
                </span>
              </label>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              class="rounded-xl border border-[var(--border-color)] px-4 py-2 font-bold text-[var(--text-secondary)]"
              @click="isMergeSeriesModalOpen = false"
            >
              취소
            </button>
            <button
              type="button"
              class="rounded-xl bg-blue-600 px-5 py-2 font-extrabold text-white hover:bg-blue-500"
              @click="confirmMergeSeries"
            >
              선택한 시리즈 하나로 합치기
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Removed Series Restore Modal -->
    <Teleport to="body">
      <div
        v-if="isRemovedSeriesModalOpen"
        class="fixed inset-0 z-[290] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
        @click.self="isRemovedSeriesModalOpen = false"
      >
        <div class="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] shadow-2xl">
          <div class="flex items-center justify-between border-b border-[var(--border-color)] px-6 py-4">
            <div>
              <h3 class="text-base font-black text-[var(--text-main)]">
                제외 · 내린 미디어 관리
              </h3>
              <p class="mt-0.5 text-xs text-[var(--text-muted)]">
                미디어 목록에서만 숨긴 항목입니다. {{ storageNoun }}의 원본 파일과 시청 기록은 유지됩니다.
              </p>
            </div>
            <button type="button" class="text-[var(--text-muted)] hover:text-[var(--text-main)]" @click="isRemovedSeriesModalOpen = false">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="flex-1 space-y-3 overflow-y-auto p-5 text-xs">
            <div
              v-if="totalExcludedMediaCount === 0"
              class="rounded-2xl border border-dashed border-[var(--border-color)] py-10 text-center text-[var(--text-muted)]"
            >
              현재 미디어 목록에서 내리거나 제외한 항목이 없습니다.
            </div>

            <div
              v-for="entry in mediaPhotoStore.removedMediaSeries"
              :key="'removed-ser-' + entry.id"
              class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-black text-[var(--text-main)]">
                  {{ entry.title }}
                </p>
                <p class="mt-0.5 text-[11px] text-[var(--text-muted)]">
                  시리즈 · 시즌 {{ entry.seasonCount || 1 }}개
                  <template v-if="entry.specialCount > 0"> · 특별편 {{ entry.specialCount }}개</template>
                  · 총 {{ entry.episodeCount || 0 }}화
                  <template v-if="entry.removedAt"> · {{ formatRemovedTimestamp(entry.removedAt) }} 내림</template>
                </p>
              </div>
              <button
                type="button"
                class="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 font-extrabold text-white transition hover:bg-blue-500"
                @click="handleRestoreRemovedSeries(entry)"
              >
                <i class="fa-solid fa-arrow-up-from-bracket text-[11px]"></i>
                <span>다시 올리기</span>
              </button>
            </div>

            <div
              v-for="video in (mediaPhotoStore.excludedIndividualMediaVideos || [])"
              :key="'excluded-video-' + video.id"
              class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-black text-[var(--text-main)]">
                  {{ video.displayTitle || video.name }}
                </p>
                <p class="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                  개별 제외 · {{ video.folderPathLabel }}
                </p>
              </div>
              <button
                type="button"
                class="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 font-extrabold text-white transition hover:bg-emerald-500"
                @click="handleRestoreExcludedSingleMedia(video)"
              >
                <i class="fa-solid fa-eye text-[11px]"></i>
                <span>다시 표시</span>
              </button>
            </div>
          </div>

          <div class="flex items-center justify-between border-t border-[var(--border-color)] px-6 py-4 text-xs">
            <button
              v-if="totalExcludedMediaCount >= 2"
              type="button"
              class="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 font-extrabold text-emerald-500 hover:bg-emerald-500/20"
              @click="handleRestoreAllRemovedSeries"
            >
              모두 다시 표시 ({{ totalExcludedMediaCount }}개)
            </button>
            <span v-else></span>
            <button
              type="button"
              class="rounded-xl border border-[var(--border-color)] px-4 py-2 font-bold text-[var(--text-secondary)] hover:text-[var(--text-main)]"
              @click="isRemovedSeriesModalOpen = false"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Media Preferences & Library Settings Modal -->
    <MediaSettingsModal
      :open="isSettingsModalOpen"
      :vault-only="vaultOnly"
      :preferences="mediaPhotoStore.preferences"
      :auto-classify-enabled="mediaPhotoStore.seriesOverrides?.autoClassifyEnabled !== false"
      :view-mode="viewMode"
      :grid-density="gridDensity"
      :thumb-aspect="thumbAspect"
      :show-thumbnails="showThumbnails"
      :area-count="(mediaPhotoStore.resolvedMediaAreas || []).length"
      :folder-count="mediaPhotoStore.mediaIncludedFolderIds.length"
      :file-count="mediaPhotoStore.mediaIncludedFileIds.length"
      :candidate-video-count="mediaPhotoStore.candidateVideos.length"
      :series-count="(mediaPhotoStore.resolvedMediaSeries || []).length"
      :removed-series-count="totalExcludedMediaCount"
      @close="isSettingsModalOpen = false"
      @update-preferences="mediaPhotoStore.updatePreferences($event)"
      @set-auto-classify="mediaPhotoStore.setAutoClassifyEnabled($event)"
      @set-view-mode="setViewMode"
      @set-grid-density="setGridDensity"
      @set-thumb-aspect="setThumbAspect"
      @toggle-show-thumbnails="toggleShowThumbnails"
      @open-source-picker="openSourcePickerModal($event)"
      @open-merge-series="openMergeSelectedSeriesModal(selectedSeriesIds.length ? selectedSeriesIds : [filteredSeriesList[0]?.id || mediaPhotoStore.resolvedMediaSeries?.[0]?.id])"
      @open-removed-series="isRemovedSeriesModalOpen = true"
      @reset-preferences="mediaPhotoStore.resetPreferences()"
      @reset-series-overrides="handleResetSeriesOverrides"
      @clear-watch-history="handleClearWatchHistory"
    />

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
