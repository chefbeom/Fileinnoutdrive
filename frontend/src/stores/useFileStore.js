import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { useAuthStore } from "@/stores/useAuthStore.js";
import { useSecretFolderStore } from "@/stores/useSecretFolderStore.js";
import {
  acceptSharedFile as acceptSharedFileApi,
  cancelAllFileShares as cancelAllFileSharesApi,
  cancelFileShares as cancelFileSharesApi,
  clearTrash as clearTrashApi,
  createFolder as createFolderApi,
  deleteFilePermanently as deleteFilePermanentlyApi,
  fetchFileList as fetchFileListApi,
  fetchFileListPage as fetchFileListPageApi,
  fetchVaultFileList as fetchVaultFileListApi,
  fetchFileShareInfo as fetchFileShareInfoApi,
  fetchFolderProperties as fetchFolderPropertiesApi,
  fetchPendingSharedFileList as fetchPendingSharedFileListApi,
  fetchSentSharedFileList as fetchSentSharedFileListApi,
  fetchSharedFileList as fetchSharedFileListApi,
  fetchSharedTextPreview as fetchSharedTextPreviewApi,
  fetchStorageSummary as fetchStorageSummaryApi,
  fetchTextPreview as fetchTextPreviewApi,
  moveFileToFolder as moveFileToFolderApi,
  moveFileToVault as moveFileToVaultApi,
  moveFilesToVault as moveFilesToVaultApi,
  moveFilesFromVault as moveFilesFromVaultApi,
  moveFileToTrash as moveFileToTrashApi,
  moveFilesToFolder as moveFilesToFolderApi,
  renameFolder as renameFolderApi,
  restoreFileFromTrash as restoreFileFromTrashApi,
  restoreFilesFromTrash as restoreFilesFromTrashApi,
  rejectSharedFile as rejectSharedFileApi,
  saveSharedFileToDrive as saveSharedFileToDriveApi,
  setLockedFiles as setLockedFilesApi,
  setFavoriteFiles as setFavoriteFilesApi,
  shareFilesWithUser as shareFilesWithUserApi,
} from "@/api/filesApi.js";
import {
  ROOT_LOCATION_LABEL,
  VAULT_ROOT_LOCATION_LABEL,
  areDriveQueriesEqual,
  decorateLocations,
  decorateSharedPaths,
  normalizeBreadcrumbRecord,
  normalizeFileRecord,
  normalizeIdList,
  normalizeLookupValue,
  normalizePathSegments,
  rememberFolderRecords,
  reuseCachedAssetUrls,
} from "./fileStoreModel.js";

const ADMINISTRATOR_EMAIL = "administrator@administrator.adm";
const DEFAULT_MAX_UPLOAD_FILE_BYTES = 5 * 1024 * 1024 * 1024;
const DEFAULT_MAX_UPLOAD_COUNT = 30;
const ADMIN_MAX_UPLOAD_FILE_BYTES = 20 * 1024 * 1024 * 1024;
const ADMIN_MAX_UPLOAD_COUNT = 500;
const DEFAULT_DRIVE_PAGE_SIZE = 10;
const MAX_DRIVE_PAGE_SIZE = 50;
const RECENT_ACCESSED_STORAGE_KEY = "fileinnout-recent-accessed-files";
const RECENT_UPLOADED_HISTORY_STORAGE_KEY = "fileinnout-recent-uploaded-history";
const MAX_RECENT_ACCESSED_COUNT = 50;
const MAX_DISMISSED_UPLOAD_IDS = 500;

function resolveScopedRecentKey(baseKey, userIdx = null) {
  return userIdx != null && String(userIdx).trim() !== ""
    ? `${baseKey}:${String(userIdx).trim()}`
    : baseKey;
}

function readSavedAccessedFiles(userIdx = null) {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(resolveScopedRecentKey(RECENT_ACCESSED_STORAGE_KEY, userIdx))
      ?? (userIdx != null ? window.localStorage.getItem(RECENT_ACCESSED_STORAGE_KEY) : null);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id != null) : [];
  } catch {
    return [];
  }
}

function writeSavedAccessedFiles(items, userIdx = null) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(
      resolveScopedRecentKey(RECENT_ACCESSED_STORAGE_KEY, userIdx),
      JSON.stringify(items),
    );
  } catch {
    // Ignore storage errors
  }
}

function createEmptyUploadedHistoryState() {
  return {
    clearedCutoffMs: 0,
    dismissedIds: [],
  };
}

function readSavedUploadedHistoryState(userIdx = null) {
  if (typeof window === "undefined" || !window.localStorage) {
    return createEmptyUploadedHistoryState();
  }
  try {
    const raw = window.localStorage.getItem(resolveScopedRecentKey(RECENT_UPLOADED_HISTORY_STORAGE_KEY, userIdx))
      ?? (userIdx != null ? window.localStorage.getItem(RECENT_UPLOADED_HISTORY_STORAGE_KEY) : null);
    if (!raw) return createEmptyUploadedHistoryState();
    const parsed = JSON.parse(raw);
    const clearedCutoffMs = Number(parsed?.clearedCutoffMs || 0) || 0;
    const dismissedIds = Array.isArray(parsed?.dismissedIds)
      ? parsed.dismissedIds.map((id) => String(id)).filter(Boolean).slice(-MAX_DISMISSED_UPLOAD_IDS)
      : [];
    return {
      clearedCutoffMs: clearedCutoffMs > 0 ? clearedCutoffMs : 0,
      dismissedIds,
    };
  } catch {
    return createEmptyUploadedHistoryState();
  }
}

function writeSavedUploadedHistoryState(state, userIdx = null) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    const payload = {
      clearedCutoffMs: Number(state?.clearedCutoffMs || 0) || 0,
      dismissedIds: Array.isArray(state?.dismissedIds)
        ? state.dismissedIds.map((id) => String(id)).filter(Boolean).slice(-MAX_DISMISSED_UPLOAD_IDS)
        : [],
    };
    window.localStorage.setItem(
      resolveScopedRecentKey(RECENT_UPLOADED_HISTORY_STORAGE_KEY, userIdx),
      JSON.stringify(payload),
    );
  } catch {
    // Ignore storage errors
  }
}

const getFolderSnapshotKey = (folderId) => (folderId == null ? "root" : String(folderId));

const isDefaultFolderSnapshotQuery = (query) => (
  !query?.vaultMode &&
  !query?.includeHidden &&
  !query?.trashedOnly &&
  String(query?.searchScope || "current") === "current" &&
  (query?.searchRootFolderId ?? null) == null &&
  Number(query?.page ?? 0) === 0 &&
  String(query?.searchQuery ?? "") === "" &&
  String(query?.extensionFilter ?? "all") === "all" &&
  String(query?.sizeFilter ?? "all") === "all" &&
  String(query?.customMinSize ?? "") === "" &&
  String(query?.customMaxSize ?? "") === "" &&
  String(query?.statusFilter ?? "all") === "all"
);

const isRequestCanceledError = (error) => (
  error?.name === "AbortError" ||
  error?.name === "CanceledError" ||
  error?.code === "ERR_CANCELED"
);

export const useFileStore = defineStore("file", () => {
  const authStore = useAuthStore();
  const secretFolderStore = useSecretFolderStore();
  const allFiles = ref([]);
  const vaultAllFiles = ref([]);
  const vaultHasLoaded = ref(false);
  const vaultLoading = ref(false);
  const accessedFilesHistory = ref(readSavedAccessedFiles(authStore.user?.idx ?? null));
  const uploadedHistoryState = ref(readSavedUploadedHistoryState(authStore.user?.idx ?? null));
  const postClearUploadedIds = ref([]);
  const drivePageFiles = ref([]);
  const driveBreadcrumbs = ref([]);
  const driveRootFolders = ref([]);
  const driveAvailableExtensions = ref([]);
  const drivePageInfo = ref({
    totalPage: 0,
    totalCount: 0,
    currentPage: 0,
    currentSize: 0,
  });
  const knownFolders = ref([]);
  const sharedLibraryFiles = ref([]);
  const pendingSharedLibraryFiles = ref([]);
  const sentSharedLibraryFiles = ref([]);
  const currentFolderId = ref(null);
  const isLoading = ref(false);
  const loadError = ref("");
  const hasLoaded = ref(false);
  const driveHasLoaded = ref(false);
  const lastDriveQuery = ref(null);
  const inFlightDriveQuery = ref(null);
  const storageSummary = ref(null);
  const storageLoading = ref(false);
  const storageError = ref("");
  let storageSummaryRequest = null;
  let fetchFilesInFlightPromise = null;
  let fetchVaultFilesInFlightPromise = null;
  const favoriteInFlightIds = new Set();
  let drivePageRequestSeq = 0;
  let drivePageAbortController = null;
  let drivePageInFlightPromise = null;
  let pagePrefetchTimer = null;
  let pagePrefetchAbortController = null;
  const PAGE_CACHE_MAX_ENTRIES = 24;
  const PAGE_CACHE_TTL_MS = 45_000;
  const folderSnapshotCache = new Map();
  const pageResponseCache = new Map();

  const cancelAdjacentPagePrefetch = () => {
    if (pagePrefetchTimer) {
      clearTimeout(pagePrefetchTimer);
      pagePrefetchTimer = null;
    }
    if (pagePrefetchAbortController) {
      pagePrefetchAbortController.abort();
      pagePrefetchAbortController = null;
    }
  };

  const buildPageCacheKey = (query = {}) => JSON.stringify([
    query.parentId ?? null,
    Number(query.page || 0),
    Number(query.size || DEFAULT_DRIVE_PAGE_SIZE),
    String(query.sortOption || "updatedAt-desc"),
    String(query.searchQuery || ""),
    String(query.searchScope || "current"),
    query.searchRootFolderId ?? null,
    String(query.extensionFilter || "all"),
    String(query.sizeFilter || "all"),
    String(query.customMinSize || ""),
    String(query.customMaxSize || ""),
    String(query.statusFilter || "all"),
    Boolean(query.vaultMode),
    Boolean(query.includeHidden),
    Boolean(query.trashedOnly),
  ]);

  const setCachedPageResponse = (query, normalizedPayload) => {
    const key = buildPageCacheKey(query);
    if (pageResponseCache.has(key)) {
      pageResponseCache.delete(key);
    }
    pageResponseCache.set(key, {
      ...normalizedPayload,
      cachedAt: Date.now(),
    });
    while (pageResponseCache.size > PAGE_CACHE_MAX_ENTRIES) {
      const oldestKey = pageResponseCache.keys().next().value;
      if (!oldestKey) break;
      pageResponseCache.delete(oldestKey);
    }
  };

  const getCachedPageResponse = (query) => {
    const key = buildPageCacheKey(query);
    const cached = pageResponseCache.get(key);
    if (!cached) {
      return null;
    }
    if (Date.now() - cached.cachedAt > PAGE_CACHE_TTL_MS) {
      pageResponseCache.delete(key);
      return null;
    }
    // LRU 순서 갱신
    pageResponseCache.delete(key);
    pageResponseCache.set(key, cached);
    return cached;
  };

  const invalidateFolderSnapshots = () => {
    folderSnapshotCache.clear();
    pageResponseCache.clear();
    cancelAdjacentPagePrefetch();
  };

  const isAdministrator = computed(() => {
    const currentUser = authStore.user;
    const role = String(currentUser?.role || "").toUpperCase();
    const email = String(currentUser?.email || "").toLowerCase();

    return Boolean(storageSummary.value?.adminAccount) || role.includes("ADMIN") || email === ADMINISTRATOR_EMAIL;
  });
  const planCapabilities = computed(() => ({
    planCode: String(storageSummary.value?.planCode || (isAdministrator.value ? "ADMIN" : "FREE")).toUpperCase(),
    adminAccount: isAdministrator.value,
    shareEnabled: isAdministrator.value || Boolean(storageSummary.value?.shareEnabled),
    fileLockEnabled: isAdministrator.value || Boolean(storageSummary.value?.fileLockEnabled),
    maxUploadFileBytes: Number(
      storageSummary.value?.maxUploadFileBytes ||
      (isAdministrator.value ? ADMIN_MAX_UPLOAD_FILE_BYTES : DEFAULT_MAX_UPLOAD_FILE_BYTES),
    ),
    maxUploadCount: Number(
      storageSummary.value?.maxUploadCount ||
      (isAdministrator.value ? ADMIN_MAX_UPLOAD_COUNT : DEFAULT_MAX_UPLOAD_COUNT),
    ),
  }));

  const fileById = computed(() => {
    const map = new Map();
    const vaultSources = secretFolderStore.vaultUnlocked ? vaultAllFiles.value : [];
    [...allFiles.value, ...knownFolders.value, ...drivePageFiles.value, ...vaultSources].forEach((file) => {
      if (file?.id == null) {
        return;
      }
      map.set(String(file.id), file);
    });
    return map;
  });

  const currentFolder = computed(() => {
    if (currentFolderId.value == null) {
      return null;
    }

    const breadcrumbFolder = driveBreadcrumbs.value[driveBreadcrumbs.value.length - 1];
    if (breadcrumbFolder?.id != null && String(breadcrumbFolder.id) === String(currentFolderId.value)) {
      return breadcrumbFolder;
    }

    return fileById.value.get(String(currentFolderId.value)) || null;
  });

  const getFolderPath = (folderId) => {
    if (folderId == null) {
      return [];
    }

    if (
      currentFolderId.value != null &&
      String(folderId) === String(currentFolderId.value) &&
      driveBreadcrumbs.value.length > 0 &&
      String(driveBreadcrumbs.value[driveBreadcrumbs.value.length - 1]?.id) === String(folderId)
    ) {
      return driveBreadcrumbs.value;
    }

    const breadcrumbIdx = driveBreadcrumbs.value.findIndex(
      (crumb) => crumb?.id != null && String(crumb.id) === String(folderId),
    );
    if (breadcrumbIdx >= 0) {
      return driveBreadcrumbs.value.slice(0, breadcrumbIdx + 1);
    }

    const path = [];
    let cursor = fileById.value.get(String(folderId)) || null;
    const visited = new Set();

    while (cursor && !visited.has(String(cursor.id))) {
      visited.add(String(cursor.id));
      path.unshift(cursor);
      if (cursor.parentId == null) {
        break;
      }
      cursor = fileById.value.get(String(cursor.parentId)) || null;
    }

    return path;
  };

  const currentFolderPath = computed(() => getFolderPath(currentFolderId.value));

  const applyFolderTransitionState = (targetFolderId) => {
    loadError.value = "";
    const skipSnapshot = secretFolderStore.vaultMode || secretFolderStore.showHiddenFolders;
    const snapshotKey = getFolderSnapshotKey(targetFolderId);
    const cachedSnapshot = skipSnapshot ? null : folderSnapshotCache.get(snapshotKey);

    if (targetFolderId == null) {
      driveBreadcrumbs.value = [];
    } else {
      const existingBreadcrumbIndex = driveBreadcrumbs.value.findIndex(
        (crumb) => crumb?.id != null && String(crumb.id) === String(targetFolderId),
      );
      if (existingBreadcrumbIndex >= 0) {
        driveBreadcrumbs.value = driveBreadcrumbs.value.slice(0, existingBreadcrumbIndex + 1);
      } else {
        const computedPath = getFolderPath(targetFolderId);
        if (computedPath.length > 0) {
          driveBreadcrumbs.value = computedPath;
        }
      }
    }

    if (cachedSnapshot) {
      drivePageFiles.value = cachedSnapshot.files;
      if (targetFolderId == null || cachedSnapshot.breadcrumbs.length > 0) {
        driveBreadcrumbs.value = cachedSnapshot.breadcrumbs;
      }
      if (Array.isArray(cachedSnapshot.rootFolders)) {
        driveRootFolders.value = cachedSnapshot.rootFolders;
      }
      driveAvailableExtensions.value = cachedSnapshot.availableExtensions;
      drivePageInfo.value = { ...cachedSnapshot.pageInfo };
      return;
    }

    drivePageFiles.value = [];
    drivePageInfo.value = {
      totalPage: 0,
      totalCount: 0,
      currentPage: 0,
      currentSize: Number(lastDriveQuery.value?.size || DEFAULT_DRIVE_PAGE_SIZE),
    };
  };

  const syncCurrentFolder = () => {
    if (currentFolderId.value == null) {
      return;
    }

    const folder = fileById.value.get(String(currentFolderId.value));
    if (folder && (folder.type !== "folder" || folder.isTrash)) {
      currentFolderId.value = null;
      applyFolderTransitionState(null);
    }
  };

  const rememberFolders = (records) => {
    const publicRecords = (records || []).filter(
      (record) => record && !record.hiddenFolder && !record.isVaultSpace && record.spaceType !== "VAULT",
    );
    knownFolders.value = rememberFolderRecords(knownFolders.value, publicRecords);
  };

  const fetchSharedFiles = async () => {
    const sharedList = await fetchSharedFileListApi();
    sharedLibraryFiles.value = decorateSharedPaths(sharedList.map((file) => normalizeFileRecord(file, { shared: true })));
    return sharedLibraryFiles.value;
  };

  const fetchPendingSharedFiles = async () => {
    const pendingList = await fetchPendingSharedFileListApi();
    pendingSharedLibraryFiles.value = decorateSharedPaths(pendingList.map((file) => normalizeFileRecord(file, { shared: true })));
    return pendingSharedLibraryFiles.value;
  };

  const fetchSentSharedFiles = async () => {
    const sentSharedList = await fetchSentSharedFileListApi();
    sentSharedLibraryFiles.value = decorateSharedPaths(sentSharedList.map((file) => normalizeFileRecord(file, { sentShared: true })));
    return sentSharedLibraryFiles.value;
  };

  const fetchStorageSummary = () => {
    if (storageSummaryRequest) {
      return storageSummaryRequest;
    }

    storageLoading.value = true;
    storageError.value = "";

    const request = Promise.resolve()
      .then(() => fetchStorageSummaryApi())
      .then((summary) => {
        storageSummary.value = summary;
        return summary;
      })
      .catch((error) => {
        storageError.value =
          error?.response?.data?.message ||
          error?.message ||
          "저장 공간 정보를 불러오지 못했습니다.";
        throw error;
      })
      .finally(() => {
        if (storageSummaryRequest === request) {
          storageSummaryRequest = null;
          storageLoading.value = false;
        }
      });

    storageSummaryRequest = request;
    return request;
  };

  const fetchFiles = async (options = {}) => {
    if (!options?.force && fetchFilesInFlightPromise) {
      return fetchFilesInFlightPromise;
    }

    const isBackground = Boolean(options?.background);
    const skipStorageSummary = Boolean(options?.skipStorageSummary);
    if (!isBackground) {
      isLoading.value = true;
      loadError.value = "";
    }

    const requestPromise = (async () => {
      try {
        const [fileList, sharedList, pendingSharedList, sentSharedList] = await Promise.all([
          fetchFileListApi(),
          fetchSharedFileListApi().catch(() => []),
          fetchPendingSharedFileListApi().catch(() => []),
          fetchSentSharedFileListApi().catch(() => []),
        ]);

        const normalizedFiles = decorateLocations(fileList.map((file) => normalizeFileRecord(file)));
        allFiles.value = reuseCachedAssetUrls(allFiles.value, normalizedFiles);
        rememberFolders(allFiles.value);
        sharedLibraryFiles.value = decorateSharedPaths(sharedList.map((file) => normalizeFileRecord(file, { shared: true })));
        pendingSharedLibraryFiles.value = decorateSharedPaths(pendingSharedList.map((file) => normalizeFileRecord(file, { shared: true })));
        sentSharedLibraryFiles.value = decorateSharedPaths(sentSharedList.map((file) => normalizeFileRecord(file, { sentShared: true })));
        hasLoaded.value = true;
        syncCurrentFolder();
        if (!skipStorageSummary) {
          fetchStorageSummary().catch(() => {});
        }
        return allFiles.value;
      } catch (error) {
        if (!isBackground) {
          loadError.value =
            error?.response?.data?.message ||
            error?.message ||
            "파일 목록을 불러오지 못했습니다.";
        }
        throw error;
      } finally {
        if (!isBackground) {
          isLoading.value = false;
        }
        if (fetchFilesInFlightPromise === requestPromise) {
          fetchFilesInFlightPromise = null;
        }
      }
    })();

    fetchFilesInFlightPromise = requestPromise;
    return requestPromise;
  };

  const clearVaultFiles = () => {
    cancelAdjacentPagePrefetch();
    fetchVaultFilesInFlightPromise = null;
    pageResponseCache.clear();
    if (lastDriveQuery.value?.vaultMode) {
      lastDriveQuery.value = null;
      driveHasLoaded.value = false;
      drivePageFiles.value = [];
    }
    vaultAllFiles.value = [];
    vaultHasLoaded.value = false;
    vaultLoading.value = false;
    knownFolders.value = (knownFolders.value || []).filter(
      (record) => !(record?.isVaultSpace || String(record?.spaceType || "").toUpperCase() === "VAULT"),
    );
  };

  const fetchVaultFiles = async (options = {}) => {
    if (!secretFolderStore.vaultUnlocked) {
      clearVaultFiles();
      return [];
    }

    if (!options?.force && fetchVaultFilesInFlightPromise) {
      return fetchVaultFilesInFlightPromise;
    }

    const isBackground = Boolean(options?.background);
    if (!isBackground) {
      vaultLoading.value = true;
    }

    const requestPromise = (async () => {
      try {
        const vaultList = await fetchVaultFileListApi();
        if (!secretFolderStore.vaultUnlocked) {
          clearVaultFiles();
          return [];
        }

        const normalizedVault = decorateLocations(
          vaultList.map((file) => normalizeFileRecord(file)),
          VAULT_ROOT_LOCATION_LABEL,
        );
        vaultAllFiles.value = reuseCachedAssetUrls(vaultAllFiles.value, normalizedVault);
        vaultHasLoaded.value = true;
        return vaultAllFiles.value;
      } catch (error) {
        const status = error?.response?.status;
        if (status === 401 || status === 403 || status === 423) {
          clearVaultFiles();
        }
        throw error;
      } finally {
        vaultLoading.value = false;
        if (fetchVaultFilesInFlightPromise === requestPromise) {
          fetchVaultFilesInFlightPromise = null;
        }
      }
    })();

    fetchVaultFilesInFlightPromise = requestPromise;
    return requestPromise;
  };

  const normalizeDrivePageResult = (result, nextQuery) => {
    const breadcrumbs = Array.isArray(result?.breadcrumbs)
      ? result.breadcrumbs.map((folder) => normalizeBreadcrumbRecord(folder))
      : [];
    const rootFolders = Array.isArray(result?.rootFolders)
      ? result.rootFolders.map((folder) => normalizeBreadcrumbRecord(folder))
      : null;
    const currentLocationLabel = breadcrumbs[breadcrumbs.length - 1]?.name || ROOT_LOCATION_LABEL;
    const pageFiles = Array.isArray(result?.fileList)
      ? result.fileList
        .map((file) => normalizeFileRecord(file))
        .map((file) => ({
          ...file,
          location: file.locationPath || currentLocationLabel,
        }))
      : [];
    const availableExtensions = Array.isArray(result?.availableExtensions)
      ? [...new Set(result.availableExtensions.map((extension) => String(extension || "").trim().toLowerCase()).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right))
      : [];
    const pageInfo = {
      totalPage: Number(result?.totalPage ?? 0) || 0,
      totalCount: Number(result?.totalCount ?? 0) || 0,
      currentPage: Number(result?.currentPage ?? nextQuery.page) || 0,
      currentSize: Number(result?.currentSize ?? nextQuery.size) || nextQuery.size,
    };

    rememberFolders([
      ...(rootFolders || []),
      ...breadcrumbs,
      ...pageFiles.filter((file) => file?.type === "folder"),
    ]);

    if (isDefaultFolderSnapshotQuery(nextQuery)) {
      folderSnapshotCache.set(getFolderSnapshotKey(nextQuery.parentId), {
        files: pageFiles,
        breadcrumbs,
        rootFolders,
        availableExtensions,
        pageInfo,
      });
    }

    const normalizedPayload = {
      pageFiles,
      breadcrumbs,
      rootFolders,
      availableExtensions,
      pageInfo,
    };
    setCachedPageResponse(nextQuery, normalizedPayload);
    return normalizedPayload;
  };

  const applyNormalizedDrivePageResult = (normalizedPayload, nextQuery) => {
    drivePageFiles.value = reuseCachedAssetUrls(drivePageFiles.value, normalizedPayload.pageFiles);
    driveBreadcrumbs.value = normalizedPayload.breadcrumbs;
    if (normalizedPayload.rootFolders !== null) {
      driveRootFolders.value = normalizedPayload.rootFolders;
    } else if (lastDriveQuery.value?.vaultMode !== nextQuery.vaultMode) {
      driveRootFolders.value = [];
    }
    driveAvailableExtensions.value = normalizedPayload.availableExtensions;
    drivePageInfo.value = normalizedPayload.pageInfo;
    driveHasLoaded.value = true;
    lastDriveQuery.value = nextQuery;
    syncCurrentFolder();
    if (!storageSummary.value && !storageLoading.value) {
      fetchStorageSummary().catch(() => {});
    }
  };

  const scheduleAdjacentPagePrefetch = (baseQuery, pageInfo) => {
    cancelAdjacentPagePrefetch();
    const totalPage = Number(pageInfo?.totalPage || 0);
    const currentPage = Number(pageInfo?.currentPage ?? baseQuery?.page ?? 0);
    const nextPage = currentPage + 1;
    if (nextPage >= totalPage) {
      return;
    }
    const prefetchQuery = { ...baseQuery, page: nextPage };
    if (getCachedPageResponse(prefetchQuery)) {
      return;
    }
    pagePrefetchTimer = setTimeout(() => {
      pagePrefetchTimer = null;
      const controller = new AbortController();
      pagePrefetchAbortController = controller;
      void fetchFileListPageApi(prefetchQuery, { signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          if (String(currentFolderId.value ?? null) !== String(prefetchQuery.parentId ?? null)) return;
          normalizeDrivePageResult(result, prefetchQuery);
        })
        .catch(() => {})
        .finally(() => {
          if (pagePrefetchAbortController === controller) {
            pagePrefetchAbortController = null;
          }
        });
    }, 250);
  };

  const fetchDrivePage = async (query = {}) => {
    const hasExplicitParentId = Object.prototype.hasOwnProperty.call(query, "parentId");
    const resolvedParentId = hasExplicitParentId
      ? (query.parentId ?? null)
      : (currentFolderId.value ?? null);
    const resolvedVaultMode = query.vaultMode ?? secretFolderStore.vaultMode ?? false;
    const resolvedIncludeHidden = query.includeHidden ?? secretFolderStore.showHiddenFolders ?? false;
    const resolvedTrashedOnly = resolvedVaultMode && (query.trashedOnly ?? secretFolderStore.vaultTrashView ?? false);

    const nextQuery = {
      parentId: resolvedParentId,
      page: Math.max(0, Number(query.page ?? lastDriveQuery.value?.page ?? 0) || 0),
      size: Math.min(
        MAX_DRIVE_PAGE_SIZE,
        Math.max(1, Number(query.size ?? lastDriveQuery.value?.size ?? DEFAULT_DRIVE_PAGE_SIZE) || DEFAULT_DRIVE_PAGE_SIZE),
      ),
      sortOption: query.sortOption ?? lastDriveQuery.value?.sortOption ?? "updatedAt-desc",
      searchQuery: query.searchQuery ?? lastDriveQuery.value?.searchQuery ?? "",
      searchScope: query.searchScope ?? lastDriveQuery.value?.searchScope ?? "current",
      searchRootFolderId: query.searchRootFolderId !== undefined
        ? (query.searchRootFolderId ?? null)
        : (lastDriveQuery.value?.searchRootFolderId ?? null),
      extensionFilter: query.extensionFilter ?? lastDriveQuery.value?.extensionFilter ?? "all",
      sizeFilter: query.sizeFilter ?? lastDriveQuery.value?.sizeFilter ?? "all",
      customMinSize: query.customMinSize ?? lastDriveQuery.value?.customMinSize ?? "",
      customMaxSize: query.customMaxSize ?? lastDriveQuery.value?.customMaxSize ?? "",
      statusFilter: query.statusFilter ?? lastDriveQuery.value?.statusFilter ?? "all",
      vaultMode: Boolean(resolvedVaultMode),
      includeHidden: Boolean(resolvedIncludeHidden),
      trashedOnly: Boolean(resolvedTrashedOnly),
    };

    if (!query.forceRefresh && inFlightDriveQuery.value && areDriveQueriesEqual(inFlightDriveQuery.value, nextQuery) && drivePageInFlightPromise) {
      return drivePageInFlightPromise;
    }

    if (
      !query.forceRefresh &&
      driveHasLoaded.value &&
      !inFlightDriveQuery.value &&
      areDriveQueriesEqual(lastDriveQuery.value, nextQuery)
    ) {
      isLoading.value = false;
      return drivePageFiles.value;
    }

    if (!query.forceRefresh) {
      const cachedPage = getCachedPageResponse(nextQuery);
      if (cachedPage) {
        if (drivePageAbortController) {
          drivePageAbortController.abort();
          drivePageAbortController = null;
        }
        drivePageRequestSeq += 1;
        inFlightDriveQuery.value = null;
        drivePageInFlightPromise = null;
        isLoading.value = false;
        loadError.value = "";
        applyNormalizedDrivePageResult(cachedPage, nextQuery);
        scheduleAdjacentPagePrefetch(nextQuery, cachedPage.pageInfo);
        return drivePageFiles.value;
      }
    }

    cancelAdjacentPagePrefetch();

    if (drivePageAbortController) {
      drivePageAbortController.abort();
      drivePageAbortController = null;
    }

    const abortController = new AbortController();
    drivePageAbortController = abortController;
    const requestSeq = ++drivePageRequestSeq;
    inFlightDriveQuery.value = nextQuery;
    isLoading.value = true;
    loadError.value = "";

    const requestPromise = (async () => {
      try {
        const result = await fetchFileListPageApi(nextQuery, { signal: abortController.signal });
        const normalizedPayload = normalizeDrivePageResult(result, nextQuery);

        if (requestSeq !== drivePageRequestSeq) {
          return drivePageFiles.value;
        }

        if (String(currentFolderId.value ?? null) !== String(nextQuery.parentId ?? null)) {
          return drivePageFiles.value;
        }

        applyNormalizedDrivePageResult(normalizedPayload, nextQuery);
        scheduleAdjacentPagePrefetch(nextQuery, normalizedPayload.pageInfo);
        return drivePageFiles.value;
      } catch (error) {
        if (isRequestCanceledError(error) || requestSeq !== drivePageRequestSeq) {
          return drivePageFiles.value;
        }

        const status = error?.response?.status;
        if (nextQuery.parentId != null && (status === 400 || status === 404)) {
          currentFolderId.value = null;
          applyFolderTransitionState(null);
        }

        loadError.value =
          error?.response?.data?.message ||
          error?.message ||
          "파일 목록을 불러오지 못했습니다.";
        throw error;
      } finally {
        if (requestSeq === drivePageRequestSeq) {
          inFlightDriveQuery.value = null;
          drivePageInFlightPromise = null;
          drivePageAbortController = null;
          isLoading.value = false;
        }
      }
    })();

    drivePageInFlightPromise = requestPromise;
    return requestPromise;
  };

  const refreshDrivePage = async () => {
    const baseQuery = lastDriveQuery.value || {};
    return fetchDrivePage({
      ...baseQuery,
      parentId: currentFolderId.value ?? null,
      forceRefresh: true,
    });
  };

  const driveFiles = computed(() => drivePageFiles.value);

  const sharedFiles = computed(() =>
    [...sharedLibraryFiles.value]
      .filter((file) => !file.isTrash)
      .sort((left, right) => (new Date(right.sharedAt || 0).getTime()) - (new Date(left.sharedAt || 0).getTime())),
  );

  const pendingSharedFiles = computed(() =>
    [...pendingSharedLibraryFiles.value]
      .filter((file) => !file.isTrash)
      .sort((left, right) => (new Date(right.sharedAt || 0).getTime()) - (new Date(left.sharedAt || 0).getTime())),
  );

  const sentSharedFiles = computed(() =>
    [...sentSharedLibraryFiles.value]
      .filter((file) => !file.isTrash)
      .sort((left, right) => (new Date(right.sharedAt || 0).getTime()) - (new Date(left.sharedAt || 0).getTime())),
  );

  const recentFiles = computed(() =>
    [...allFiles.value]
      .filter((file) => !file.isTrash && file.type !== "folder")
      .sort((left, right) => (right.lastModifiedMs || 0) - (left.lastModifiedMs || 0)),
  );

  const sortFavoriteList = (items = []) => [...items].sort((left, right) => {
    const leftIsFolder = left?.type === "folder" ? 0 : 1;
    const rightIsFolder = right?.type === "folder" ? 0 : 1;
    if (leftIsFolder !== rightIsFolder) return leftIsFolder - rightIsFolder;
    return (right.lastModifiedMs || 0) - (left.lastModifiedMs || 0);
  });

  const favoriteItems = computed(() => sortFavoriteList(
    (allFiles.value || []).filter(
      (file) => file && !file.isTrash && file.isFavorite && !file.isVaultSpace && String(file.spaceType || "").toUpperCase() !== "VAULT",
    ),
  ));

  const favoriteFolders = computed(() => favoriteItems.value.filter((file) => file.type === "folder"));
  const favoriteFilesOnly = computed(() => favoriteItems.value.filter((file) => file.type !== "folder"));

  const vaultFavoriteItems = computed(() => {
    const mergedById = new Map();
    for (const file of vaultAllFiles.value || []) {
      if (file?.id != null && !file.isTrash && file.isFavorite) {
        mergedById.set(String(file.id), file);
      }
    }
    for (const file of drivePageFiles.value || []) {
      if (
        file?.id != null
        && (file.isVaultSpace || String(file.spaceType || "").toUpperCase() === "VAULT")
        && !file.isTrash
        && file.isFavorite
        && !mergedById.has(String(file.id))
      ) {
        mergedById.set(String(file.id), file);
      }
    }
    return sortFavoriteList([...mergedById.values()]);
  });
  const vaultFavoriteFolders = computed(() => vaultFavoriteItems.value.filter((file) => file.type === "folder"));
  const vaultFavoriteFilesOnly = computed(() => vaultFavoriteItems.value.filter((file) => file.type !== "folder"));

  const isEligibleUploadedCandidate = (file) => !(
    !file ||
    file.id == null ||
    file.isTrash ||
    file.type === "folder" ||
    file.hiddenFolder ||
    file.isVaultSpace ||
    file.spaceType === "VAULT"
  );

  const rawRecentUploadedCandidates = computed(() => {
    const mergedMap = new Map();
    const sources = (secretFolderStore.vaultMode || secretFolderStore.showHiddenFolders)
      ? [...allFiles.value]
      : [...drivePageFiles.value, ...allFiles.value];

    sources.forEach((file) => {
      if (!isEligibleUploadedCandidate(file)) {
        return;
      }
      mergedMap.set(String(file.id), file);
    });

    return Array.from(mergedMap.values());
  });

  const recentUploadedFiles = computed(() => {
    const dismissedSet = new Set((uploadedHistoryState.value?.dismissedIds || []).map((id) => String(id)));
    const unhiddenSet = new Set(postClearUploadedIds.value.map((id) => String(id)));
    const clearedCutoffMs = Number(uploadedHistoryState.value?.clearedCutoffMs || 0) || 0;

    return rawRecentUploadedCandidates.value
      .filter((file) => {
        const key = String(file.id);
        if (dismissedSet.has(key)) {
          return false;
        }
        const uploadMs = Number(file.uploadedAtMs || file.lastModifiedMs || 0) || 0;
        if (clearedCutoffMs > 0 && uploadMs > 0 && uploadMs <= clearedCutoffMs && !unhiddenSet.has(key)) {
          return false;
        }
        return true;
      })
      .sort((left, right) => {
        const rightTime = right.uploadedAtMs || right.lastModifiedMs || 0;
        const leftTime = left.uploadedAtMs || left.lastModifiedMs || 0;
        if (rightTime !== leftTime) {
          return rightTime - leftTime;
        }
        return (Number(right.id) || 0) - (Number(left.id) || 0);
      });
  });

  const clearUploadedFiles = () => {
    const candidates = rawRecentUploadedCandidates.value;
    const maxCandidateUploadMs = candidates.reduce((max, file) => {
      const ts = Number(file.uploadedAtMs || file.lastModifiedMs || 0) || 0;
      return ts > max ? ts : max;
    }, 0);
    const nextDismissedIds = [
      ...new Set([
        ...(uploadedHistoryState.value?.dismissedIds || []).map((id) => String(id)),
        ...candidates.map((file) => String(file.id)),
      ]),
    ].slice(-MAX_DISMISSED_UPLOAD_IDS);

    const nextState = {
      clearedCutoffMs: Math.max(Number(uploadedHistoryState.value?.clearedCutoffMs || 0) || 0, maxCandidateUploadMs),
      dismissedIds: nextDismissedIds,
    };
    uploadedHistoryState.value = nextState;
    postClearUploadedIds.value = [];
    writeSavedUploadedHistoryState(nextState, authStore.user?.idx ?? null);
  };

  const removeUploadedFileHistory = (fileId) => {
    const key = String(fileId ?? "");
    if (!key) return;
    const nextState = {
      clearedCutoffMs: Number(uploadedHistoryState.value?.clearedCutoffMs || 0) || 0,
      dismissedIds: [
        ...new Set([
          ...(uploadedHistoryState.value?.dismissedIds || []).map((id) => String(id)),
          key,
        ]),
      ].slice(-MAX_DISMISSED_UPLOAD_IDS),
    };
    uploadedHistoryState.value = nextState;
    postClearUploadedIds.value = postClearUploadedIds.value.filter((id) => String(id) !== key);
    writeSavedUploadedHistoryState(nextState, authStore.user?.idx ?? null);
  };

  const markFilesRecentlyUploaded = (fileIds = []) => {
    const keys = (Array.isArray(fileIds) ? fileIds : [fileIds])
      .map((id) => String(id ?? ""))
      .filter(Boolean);
    if (!keys.length) return;
    const keySet = new Set(keys);
    const nextState = {
      clearedCutoffMs: Number(uploadedHistoryState.value?.clearedCutoffMs || 0) || 0,
      dismissedIds: (uploadedHistoryState.value?.dismissedIds || []).filter((id) => !keySet.has(String(id))),
    };
    uploadedHistoryState.value = nextState;
    postClearUploadedIds.value = [...new Set([...postClearUploadedIds.value, ...keys])];
    writeSavedUploadedHistoryState(nextState, authStore.user?.idx ?? null);
  };

  const isInsideHiddenOrVault = (file) => {
    if (!file) {
      return true;
    }
    if (
      secretFolderStore.vaultMode ||
      file.isVaultSpace ||
      file.spaceType === "VAULT" ||
      file.hiddenFolder
    ) {
      return true;
    }
    if (currentFolderId.value != null && !allFiles.value.some((item) => String(item?.id) === String(currentFolderId.value))) {
      return true;
    }
    if (file.parentId != null) {
      const parent = fileById.value.get(String(file.parentId));
      if (parent?.hiddenFolder || parent?.isVaultSpace) {
        return true;
      }
      if (hasLoaded.value && !allFiles.value.some((item) => String(item?.id) === String(file.id))) {
        return true;
      }
    }
    return false;
  };

  const recordFileAccess = (file) => {
    if (!file || file.id == null || file.type === "folder" || file.isTrash || isInsideHiddenOrVault(file)) {
      return;
    }

    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    const fileId = String(file.id);

    const entry = {
      id: file.id,
      idx: file.idx ?? file.id,
      name: file.name || file.fileOriginName || "이름 없는 파일",
      fileOriginName: file.fileOriginName || file.name || "이름 없는 파일",
      extension: file.extension || file.fileFormat || "",
      fileFormat: file.fileFormat || file.extension || "",
      sizeBytes: Number(file.sizeBytes ?? 0) || 0,
      sizeLabel: file.sizeLabel || file.size || "-",
      size: file.size || file.sizeLabel || "-",
      type: "file",
      nodeType: "FILE",
      parentId: file.parentId ?? null,
      sharedWithMe: Boolean(file.sharedWithMe),
      isShared: Boolean(file.isShared),
      sharedFile: Boolean(file.sharedFile),
      lockedFile: Boolean(file.lockedFile),
      spaceType: String(file.spaceType || "DRIVE").toUpperCase(),
      isVaultSpace: Boolean(file.isVaultSpace || String(file.spaceType || "DRIVE").toUpperCase() === "VAULT"),
      encrypted: Boolean(file.encrypted),
      encryptionMode: String(file.encryptionMode || (file.encrypted ? "SERVER_ENVELOPE_V1" : "NONE")).toUpperCase(),
      downloadUrl: file.downloadUrl || file.presignedDownloadUrl || "",
      presignedDownloadUrl: file.presignedDownloadUrl || file.downloadUrl || "",
      thumbnailUrl: file.thumbnailUrl || file.thumbnailPresignedUrl || "",
      thumbnailPresignedUrl: file.thumbnailPresignedUrl || file.thumbnailUrl || "",
      contentType: file.contentType || "",
      uploadDate: file.uploadDate || file.uploadedAt || nowIso,
      uploadedAt: file.uploadedAt || file.uploadDate || nowIso,
      uploadDateLabel: file.uploadDateLabel || "-",
      updatedAt: file.updatedAt || file.lastModified || nowIso,
      updatedAtLabel: file.updatedAtLabel || "-",
      lastModified: file.lastModified || file.updatedAt || nowIso,
      lastModifiedMs: Number(file.lastModifiedMs || nowMs),
      uploadedAtMs: Number(file.uploadedAtMs || nowMs),
      location: file.location || ROOT_LOCATION_LABEL,
      accessedAt: nowIso,
      accessedAtMs: nowMs,
    };

    const nextHistory = [
      entry,
      ...accessedFilesHistory.value.filter((candidate) => String(candidate?.id) !== fileId),
    ].slice(0, MAX_RECENT_ACCESSED_COUNT);

    accessedFilesHistory.value = nextHistory;
    writeSavedAccessedFiles(nextHistory, authStore.user?.idx ?? null);
  };

  const clearAccessedFiles = () => {
    accessedFilesHistory.value = [];
    writeSavedAccessedFiles([], authStore.user?.idx ?? null);
  };

  const removeAccessedFileHistory = (fileId) => {
    const key = String(fileId ?? "");
    if (!key) return;
    const nextHistory = accessedFilesHistory.value.filter((candidate) => String(candidate?.id) !== key);
    accessedFilesHistory.value = nextHistory;
    writeSavedAccessedFiles(nextHistory, authStore.user?.idx ?? null);
  };

  const recentAccessedFiles = computed(() => {
    const sharedMap = new Map(
      sharedLibraryFiles.value
        .filter((file) => file?.id != null)
        .map((file) => [String(file.id), file]),
    );

    return accessedFilesHistory.value
      .map((entry) => {
        const key = String(entry.id);
        const liveFile = fileById.value.get(key) || sharedMap.get(key) || null;
        if (liveFile) {
          if (liveFile.isTrash || liveFile.type === "folder") {
            return null;
          }
          return {
            ...liveFile,
            accessedAt: entry.accessedAt,
            accessedAtMs: entry.accessedAtMs || 0,
          };
        }
        return entry;
      })
      .filter(Boolean)
      .sort((left, right) => (right.accessedAtMs || 0) - (left.accessedAtMs || 0));
  });

  const trashFiles = computed(() =>
    allFiles.value.filter((file) => {
      if (!file.isTrash) {
        return false;
      }

      if (file.parentId == null) {
        return true;
      }

      return !fileById.value.get(String(file.parentId))?.isTrash;
    }),
  );

  const allOnlyFiles = computed(() =>
    allFiles.value.filter((file) => !file.isTrash && file.type !== "folder"),
  );

  const refreshAll = async (options = {}) => {
    const {
      includeDriveLibrary,
      includeVault,
      includeStorageSummary = true,
      forceVault = false,
    } = options || {};
    const inVaultMode = Boolean(secretFolderStore.vaultMode && secretFolderStore.vaultUnlocked);
    const shouldRefreshDriveLibrary = includeDriveLibrary ?? !inVaultMode;
    const shouldRefreshVault = (includeVault ?? inVaultMode) && secretFolderStore.vaultUnlocked && vaultHasLoaded.value;
    const shouldRefreshSummary = Boolean(includeStorageSummary && storageSummary.value);

    invalidateFolderSnapshots();

    if (driveHasLoaded.value) {
      await refreshDrivePage();
      if (shouldRefreshDriveLibrary && hasLoaded.value) {
        fetchFiles({ background: true, skipStorageSummary: true }).catch(() => {});
      }
    } else if (shouldRefreshDriveLibrary) {
      await fetchFiles({ skipStorageSummary: shouldRefreshSummary });
    }

    if (shouldRefreshVault) {
      fetchVaultFiles({ background: true, force: Boolean(forceVault) }).catch(() => {});
    }

    if (shouldRefreshSummary) {
      fetchStorageSummary().catch(() => {});
    }

    return true;
  };

  const createFolder = async (folderName, parentId = currentFolderId.value, options = undefined) => {
    if (!folderName?.trim()) {
      return null;
    }

    const requestOptions = secretFolderStore.vaultMode
      ? {
          ...(options && typeof options === "object" ? options : {}),
          vaultMode: true,
          spaceType: "VAULT",
        }
      : options;

    if (requestOptions !== undefined) {
      await createFolderApi(folderName.trim(), parentId, requestOptions);
    } else {
      await createFolderApi(folderName.trim(), parentId);
    }
    await refreshAll();
    return true;
  };

  const moveToTrash = async (fileId) => {
    await moveFileToTrashApi(fileId);
    await refreshAll();
  };

  const trashFilesBatch = async (fileIds) => {
    for (const fileId of normalizeIdList(fileIds)) {
      await moveFileToTrashApi(fileId);
    }
    await refreshAll();
  };

  const permanentlyDelete = async (fileId) => {
    await deleteFilePermanentlyApi(fileId);
    await refreshAll();
  };

  const restoreFromTrash = async (fileId) => {
    await restoreFileFromTrashApi(fileId);
    await refreshAll();
  };

  const restoreFilesBatch = async (fileIds) => {
    const normalizedIds = normalizeIdList(fileIds);
    if (!normalizedIds.length) {
      return;
    }

    await restoreFilesFromTrashApi(normalizedIds);
    await refreshAll();
  };

  const permanentlyDeleteBatch = async (fileIds) => {
    for (const fileId of normalizeIdList(fileIds)) {
      await deleteFilePermanentlyApi(fileId);
    }
    await refreshAll();
  };

  const emptyTrash = async () => {
    await clearTrashApi({ vaultMode: Boolean(secretFolderStore.vaultMode) });
    await refreshAll();
  };

  const applyEnterFolder = (folderId) => {
    const targetFolder = fileById.value.get(String(folderId));
    if (targetFolder && (targetFolder.type !== "folder" || targetFolder.isTrash)) {
      return;
    }

    const numericId = Number(folderId);
    const resolvedId = targetFolder?.id ?? (Number.isFinite(numericId) && numericId > 0 ? numericId : folderId);

    if (String(currentFolderId.value ?? "") === String(resolvedId)) {
      return;
    }

    currentFolderId.value = resolvedId;
    applyFolderTransitionState(resolvedId);
  };

  const enterFolder = (folderId) => {
    if (folderId == null || folderId === "") {
      navigateToFolder(null);
      return;
    }

    const targetFolder = fileById.value.get(String(folderId));
    if (targetFolder && (targetFolder.type !== "folder" || targetFolder.isTrash)) {
      return;
    }

    if (targetFolder?.hiddenFolder && targetFolder?.pinEnabled && !secretFolderStore.isFolderUnlocked(targetFolder.id)) {
      void secretFolderStore.ensureFolderUnlocked(targetFolder).then((unlocked) => {
        if (unlocked) {
          applyEnterFolder(targetFolder.id ?? folderId);
        }
      });
      return;
    }

    applyEnterFolder(folderId);
  };

  const exitHiddenSubtreeIfNeeded = () => {
    if (currentFolderId.value == null || secretFolderStore.vaultMode) {
      return false;
    }
    if (hasLoaded.value && allFiles.value.some((file) => String(file?.id) === String(currentFolderId.value))) {
      return false;
    }
    const visibleMap = new Set(allFiles.value.map((file) => String(file?.id)));
    let safeParentId = null;
    for (const crumb of driveBreadcrumbs.value || []) {
      if (crumb?.id != null && visibleMap.has(String(crumb.id))) {
        safeParentId = crumb.id;
      } else {
        break;
      }
    }
    currentFolderId.value = safeParentId;
    applyFolderTransitionState(safeParentId);
    return true;
  };

  const navigateToFolder = (folderId) => {
    if (folderId == null || folderId === "") {
      const wasAtRoot = currentFolderId.value == null;
      currentFolderId.value = null;
      applyFolderTransitionState(null);
      if (wasAtRoot && (inFlightDriveQuery.value?.parentId != null || lastDriveQuery.value?.parentId != null)) {
        void fetchDrivePage({ parentId: null, page: 0, forceRefresh: true }).catch(() => {});
      }
      return;
    }

    enterFolder(folderId);
  };

  const resolvePathRecord = (pathValue) => {
    const segments = normalizePathSegments(pathValue);
    if (!segments.length) {
      return null;
    }

    let parentId = null;
    let match = null;
    const candidates = [...allFiles.value, ...knownFolders.value, ...drivePageFiles.value]
      .filter((file) => file?.id != null && !file?.isTrash);

    for (const segment of segments) {
      const normalizedSegment = segment.toLocaleLowerCase("ko-KR");
      match = candidates.find((file) => (
        (file.parentId ?? null) === parentId &&
        String(file.name || file.fileOriginName || "").toLocaleLowerCase("ko-KR") === normalizedSegment
      )) || null;

      if (!match) {
        return null;
      }
      parentId = match.id;
    }

    return match;
  };

  const resolveSharedPathRecord = (pathValue) => {
    const inputSegments = normalizePathSegments(pathValue).map(normalizeLookupValue);
    if (!inputSegments.length) {
      return null;
    }

    const matchesSegments = (candidateSegments) => {
      if (candidateSegments.length !== inputSegments.length) {
        return false;
      }
      return candidateSegments.every((segment, index) => segment === inputSegments[index]);
    };

    for (const file of sharedLibraryFiles.value) {
      const sharedSegments = Array.isArray(file?.sharedPathSegments)
        ? file.sharedPathSegments.map(normalizeLookupValue)
        : normalizePathSegments(file?.sharedPath || "").map(normalizeLookupValue);
      const withoutSharedRoot = sharedSegments[0] === "shared"
        ? sharedSegments.slice(1)
        : sharedSegments;
      const withoutOwner = withoutSharedRoot.length > 1
        ? withoutSharedRoot.slice(1)
        : withoutSharedRoot;

      if (
        matchesSegments(sharedSegments) ||
        matchesSegments(withoutSharedRoot) ||
        matchesSegments(withoutOwner)
      ) {
        return file;
      }
    }

    return null;
  };

  const navigateToDesktopPath = async (pathValue) => {
    const segments = normalizePathSegments(pathValue);
    if (!segments.length) {
      navigateToFolder(null);
      return { found: false, searchTerm: "" };
    }

    if (!hasLoaded.value) {
      await fetchFiles();
    }

    const target = resolvePathRecord(pathValue);
    const searchTerm = segments[segments.length - 1] || "";
    if (!target) {
      return { found: false, searchTerm };
    }

    if (target.type === "folder") {
      navigateToFolder(target.id);
      return { found: true, searchTerm: "", target };
    }

    navigateToFolder(target.parentId ?? null);
    return { found: true, searchTerm: target.name || searchTerm, target };
  };

  const navigateToSharedDesktopPath = async (pathValue) => {
    const segments = normalizePathSegments(pathValue);
    if (!segments.length) {
      return { found: false, searchTerm: "" };
    }

    if (!sharedLibraryFiles.value.length) {
      await fetchSharedFiles().catch(() => []);
    }

    const target = resolveSharedPathRecord(pathValue);
    const searchTerm = segments[segments.length - 1] || "";
    if (!target) {
      return { found: false, searchTerm };
    }

    return {
      found: true,
      searchTerm: target.sharedPath || target.desktopPath || target.name || target.fileOriginName || searchTerm,
      target,
    };
  };

  const goBack = () => {
    if (currentFolderId.value == null) {
      return;
    }

    const currentIdStr = String(currentFolderId.value);
    const breadcrumbIndex = driveBreadcrumbs.value.findIndex(
      (crumb) => crumb?.id != null && String(crumb.id) === currentIdStr,
    );

    if (breadcrumbIndex > 0) {
      const parentBreadcrumb = driveBreadcrumbs.value[breadcrumbIndex - 1];
      navigateToFolder(parentBreadcrumb?.id ?? null);
      return;
    }

    if (breadcrumbIndex === 0) {
      navigateToFolder(null);
      return;
    }

    const folder = fileById.value.get(currentIdStr);
    navigateToFolder(folder?.parentId ?? null);
  };

  const moveFileToFolder = async (fileId, folderId) => {
    await moveFileToFolderApi(fileId, folderId);
    await refreshAll();
  };

  const moveFilesToFolder = async (fileIds, folderId) => {
    const normalizedIds = normalizeIdList(fileIds);
    if (!normalizedIds.length) {
      return;
    }

    await moveFilesToFolderApi(normalizedIds, folderId);
    await refreshAll();
  };

  const pruneMovedAccessedHistory = (rootIds = []) => {
    const movedTreeIdSet = new Set(rootIds.map((id) => String(id)));
    const knownNodes = [...allFiles.value, ...drivePageFiles.value, ...knownFolders.value];
    let added = true;
    while (added) {
      added = false;
      for (const item of knownNodes) {
        if (
          item?.id != null &&
          item.parentId != null &&
          movedTreeIdSet.has(String(item.parentId)) &&
          !movedTreeIdSet.has(String(item.id))
        ) {
          movedTreeIdSet.add(String(item.id));
          added = true;
        }
      }
    }
    accessedFilesHistory.value = accessedFilesHistory.value.filter(
      (entry) => !movedTreeIdSet.has(String(entry?.id)),
    );
    writeSavedAccessedFiles(accessedFilesHistory.value);
  };

  const moveFileToVault = async (fileId, targetParentId = null) => {
    if (fileId == null) {
      return null;
    }

    const result = await moveFileToVaultApi(fileId, targetParentId);
    pruneMovedAccessedHistory([fileId]);
    await refreshAll({ includeDriveLibrary: true, includeVault: true, forceVault: true });
    return result;
  };

  const moveFilesToVault = async (fileIds, targetParentId = null) => {
    const normalizedIds = normalizeIdList(fileIds);
    if (!normalizedIds.length) {
      return null;
    }

    const result = await moveFilesToVaultApi(normalizedIds, targetParentId);
    pruneMovedAccessedHistory(normalizedIds);
    await refreshAll({ includeDriveLibrary: true, includeVault: true, forceVault: true });
    return result;
  };

  const moveFilesFromVault = async (
    fileIds,
    { targetParentId = null, restoreOriginalParent = false, onProgress = null } = {},
  ) => {
    const normalizedIds = normalizeIdList(fileIds);
    if (!normalizedIds.length) {
      return { affectedCount: 0, targetIdx: targetParentId ?? null };
    }

    let affectedCount = 0;
    let lastResult = null;
    const succeededIds = [];

    try {
      for (let index = 0; index < normalizedIds.length; index += 1) {
        const currentId = normalizedIds[index];
        onProgress?.({
          completed: index,
          total: normalizedIds.length,
          currentId,
        });
        const result = await moveFilesFromVaultApi([currentId], {
          targetParentId: restoreOriginalParent ? null : targetParentId,
          restoreOriginalParent: Boolean(restoreOriginalParent),
        });
        lastResult = result;
        succeededIds.push(currentId);
        affectedCount += Number(result?.affectedCount ?? 1);
        onProgress?.({
          completed: index + 1,
          total: normalizedIds.length,
          currentId,
        });
      }
    } catch (error) {
      if (succeededIds.length > 0) {
        pruneMovedAccessedHistory(succeededIds);
        await refreshAll({ includeDriveLibrary: true, includeVault: true, forceVault: true }).catch(() => {});
      }
      throw error;
    }

    pruneMovedAccessedHistory(succeededIds);
    await refreshAll({ includeDriveLibrary: true, includeVault: true, forceVault: true });

    return {
      affectedCount,
      targetIdx: lastResult?.targetIdx ?? (restoreOriginalParent ? null : targetParentId),
    };
  };

  const renameFolder = async (folderId, folderName) => {
    await renameFolderApi(folderId, folderName.trim());
    await refreshAll();
  };

  const setFilesLocked = async (fileIds, locked) => {
    const normalizedIds = normalizeIdList(fileIds);
    if (!normalizedIds.length) {
      return;
    }

    await setLockedFilesApi(normalizedIds, locked);
    await refreshAll();
  };

  const patchFavoriteFlagLocal = (idSet, nextFlag) => {
    const patchList = (listRef) => {
      if (!Array.isArray(listRef.value)) return;
      listRef.value = listRef.value.map((entry) => (
        entry && idSet.has(String(entry.id))
          ? { ...entry, favorite: nextFlag, isFavorite: nextFlag }
          : entry
      ));
    };
    patchList(allFiles);
    patchList(drivePageFiles);
    patchList(vaultAllFiles);

    if (nextFlag) {
      const existingVaultIds = new Set((vaultAllFiles.value || []).map((entry) => String(entry?.id)));
      const existingDriveIds = new Set((allFiles.value || []).map((entry) => String(entry?.id)));
      const addedVaultEntries = [];
      const addedDriveEntries = [];

      for (const entry of drivePageFiles.value || []) {
        if (!entry || !idSet.has(String(entry.id))) continue;
        const entryId = String(entry.id);
        const isVaultEntry = Boolean(entry.isVaultSpace || String(entry.spaceType || "").toUpperCase() === "VAULT");
        if (isVaultEntry) {
          if (!existingVaultIds.has(entryId)) {
            existingVaultIds.add(entryId);
            addedVaultEntries.push(entry);
          }
        } else if (hasLoaded.value && !existingDriveIds.has(entryId)) {
          existingDriveIds.add(entryId);
          addedDriveEntries.push(entry);
        }
      }

      if (addedVaultEntries.length > 0) {
        vaultAllFiles.value = [...(vaultAllFiles.value || []), ...addedVaultEntries];
      }
      if (addedDriveEntries.length > 0) {
        allFiles.value = [...(allFiles.value || []), ...addedDriveEntries];
      }
    }
  };

  const setFilesFavorite = async (fileIds, favorite) => {
    const normalizedIds = normalizeIdList(fileIds);
    const activeIds = normalizedIds.filter((id) => !favoriteInFlightIds.has(String(id)));
    if (!activeIds.length) {
      return null;
    }

    const nextFlag = Boolean(favorite);
    const idSet = new Set(activeIds.map((id) => String(id)));
    idSet.forEach((key) => favoriteInFlightIds.add(key));
    patchFavoriteFlagLocal(idSet, nextFlag);

    try {
      const result = await setFavoriteFilesApi(activeIds, nextFlag);
      invalidateFolderSnapshots();
      return result;
    } catch (error) {
      patchFavoriteFlagLocal(idSet, !nextFlag);
      throw error;
    } finally {
      idSet.forEach((key) => favoriteInFlightIds.delete(key));
    }
  };

  const shareFiles = async (fileIds, recipientEmail, permission = "READ", options = {}) => {
    const normalizedIds = normalizeIdList(fileIds);
    if (!normalizedIds.length) {
      return;
    }

    await shareFilesWithUserApi(normalizedIds, recipientEmail.trim(), permission, options);
    await refreshAll();
  };

  const cancelSharedFiles = async (fileIds, recipientEmail) => {
    const normalizedIds = normalizeIdList(fileIds);
    if (!normalizedIds.length) {
      return;
    }

    await cancelFileSharesApi(normalizedIds, recipientEmail.trim());
    await refreshAll();
  };

  const cancelAllSharedFiles = async (fileIds) => {
    const normalizedIds = normalizeIdList(fileIds);
    if (!normalizedIds.length) {
      return;
    }

    await cancelAllFileSharesApi(normalizedIds);
    await refreshAll();
  };

  const acceptSharedFile = async (fileId) => {
    if (fileId == null) {
      return;
    }
    await acceptSharedFileApi(fileId);
    await refreshAll();
    await fetchPendingSharedFiles().catch(() => {});
  };

  const rejectSharedFile = async (fileId) => {
    if (fileId == null) {
      return;
    }
    await rejectSharedFileApi(fileId);
    await refreshAll();
    await fetchPendingSharedFiles().catch(() => {});
  };

  const fetchShareInfo = async (fileId) => {
    return fetchFileShareInfoApi(fileId);
  };

  const saveSharedFileToDrive = async (fileId, parentId = currentFolderId.value, options = {}) => {
    const result = await saveSharedFileToDriveApi(fileId, parentId, options);
    await refreshAll();
    return result;
  };

  const fetchFolderProperties = async (fileId) => {
    return fetchFolderPropertiesApi(fileId);
  };

  const fetchTextPreview = async (fileId) => {
    return fetchTextPreviewApi(fileId);
  };

  const fetchSharedTextPreview = async (fileId, options = {}) => {
    return fetchSharedTextPreviewApi(fileId, options);
  };

  const fetchTextPreviewFor = async (file, options = {}) => {
    if (file?.sharedWithMe) {
      return fetchSharedTextPreviewApi(file.id, options);
    }

    return fetchTextPreviewApi(file?.id);
  };

  watch(
    () => Boolean(secretFolderStore.vaultUnlocked),
    (unlocked) => {
      if (!unlocked) {
        clearVaultFiles();
      }
    },
    { flush: "sync" },
  );

  watch(
    () => authStore.user?.idx ?? null,
    (nextUserIdx) => {
      secretFolderStore.resetSecretSession();
      clearVaultFiles();
      invalidateFolderSnapshots();
      currentFolderId.value = null;
      applyFolderTransitionState(null);
      accessedFilesHistory.value = readSavedAccessedFiles(nextUserIdx);
      uploadedHistoryState.value = readSavedUploadedHistoryState(nextUserIdx);
      postClearUploadedIds.value = [];
    },
  );

  return {
    allFiles,
    vaultAllFiles,
    vaultHasLoaded,
    vaultLoading,
    drivePageFiles,
    driveBreadcrumbs,
    driveRootFolders,
    driveAvailableExtensions,
    drivePageInfo,
    sharedLibraryFiles,
    pendingSharedLibraryFiles,
    sentSharedLibraryFiles,
    currentFolderId,
    currentFolder,
    currentFolderPath,
    isLoading,
    loadError,
    hasLoaded,
    driveHasLoaded,
    storageSummary,
    planCapabilities,
    storageLoading,
    storageError,
    driveFiles,
    sharedFiles,
    pendingSharedFiles,
    sentSharedFiles,
    recentFiles,
    recentUploadedFiles,
    recentAccessedFiles,
    favoriteItems,
    favoriteFolders,
    favoriteFilesOnly,
    vaultFavoriteItems,
    vaultFavoriteFolders,
    vaultFavoriteFilesOnly,
    trashFiles,
    allOnlyFiles,
    fetchFiles,
    fetchVaultFiles,
    clearVaultFiles,
    fetchDrivePage,
    refreshDrivePage,
    fetchSharedFiles,
    fetchPendingSharedFiles,
    fetchSentSharedFiles,
    refreshAll,
    recordFileAccess,
    clearAccessedFiles,
    removeAccessedFileHistory,
    clearUploadedFiles,
    removeUploadedFileHistory,
    markFilesRecentlyUploaded,
    createFolder,
    moveToTrash,
    trashFilesBatch,
    restoreFromTrash,
    restoreFilesBatch,
    permanentlyDelete,
    permanentlyDeleteBatch,
    emptyTrash,
    enterFolder,
    navigateToFolder,
    exitHiddenSubtreeIfNeeded,
    invalidateFolderSnapshots,
    navigateToDesktopPath,
    navigateToSharedDesktopPath,
    goBack,
    moveFileToFolder,
    moveFilesToFolder,
    moveFileToVault,
    moveFilesToVault,
    moveFilesFromVault,
    renameFolder,
    setFilesLocked,
    setFilesFavorite,
    shareFiles,
    cancelSharedFiles,
    cancelAllSharedFiles,
    acceptSharedFile,
    rejectSharedFile,
    fetchShareInfo,
    saveSharedFileToDrive,
    fetchFolderProperties,
    fetchTextPreview,
    fetchSharedTextPreview,
    fetchTextPreviewFor,
    getFolderPath,
    fetchStorageSummary,
  };
});
