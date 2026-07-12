import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { useAuthStore } from "@/stores/useAuthStore.js";
import {
  acceptSharedFile as acceptSharedFileApi,
  cancelAllFileShares as cancelAllFileSharesApi,
  cancelFileShares as cancelFileSharesApi,
  clearTrash as clearTrashApi,
  createFolder as createFolderApi,
  deleteFilePermanently as deleteFilePermanentlyApi,
  fetchFileList as fetchFileListApi,
  fetchFileListPage as fetchFileListPageApi,
  fetchFileShareInfo as fetchFileShareInfoApi,
  fetchFolderProperties as fetchFolderPropertiesApi,
  fetchPendingSharedFileList as fetchPendingSharedFileListApi,
  fetchSentSharedFileList as fetchSentSharedFileListApi,
  fetchSharedFileList as fetchSharedFileListApi,
  fetchSharedTextPreview as fetchSharedTextPreviewApi,
  fetchStorageSummary as fetchStorageSummaryApi,
  fetchTextPreview as fetchTextPreviewApi,
  moveFileToFolder as moveFileToFolderApi,
  moveFileToTrash as moveFileToTrashApi,
  moveFilesToFolder as moveFilesToFolderApi,
  renameFolder as renameFolderApi,
  restoreFileFromTrash as restoreFileFromTrashApi,
  restoreFilesFromTrash as restoreFilesFromTrashApi,
  rejectSharedFile as rejectSharedFileApi,
  saveSharedFileToDrive as saveSharedFileToDriveApi,
  setLockedFiles as setLockedFilesApi,
  shareFilesWithUser as shareFilesWithUserApi,
} from "@/api/filesApi.js";
import {
  ROOT_LOCATION_LABEL,
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
const MAX_DRIVE_PAGE_SIZE = 30;
export const useFileStore = defineStore("file", () => {
  const authStore = useAuthStore();
  const allFiles = ref([]);
  const drivePageFiles = ref([]);
  const driveBreadcrumbs = ref([]);
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
  const storageSummary = ref(null);
  const storageLoading = ref(false);
  const storageError = ref("");
  let storageSummaryRequest = null;
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
    [...allFiles.value, ...knownFolders.value, ...drivePageFiles.value].forEach((file) => {
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
      driveBreadcrumbs.value.length > 0
    ) {
      return driveBreadcrumbs.value;
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

  const syncCurrentFolder = () => {
    if (currentFolderId.value == null) {
      return;
    }

    const folder = fileById.value.get(String(currentFolderId.value));
    if (!folder || folder.type !== "folder" || folder.isTrash) {
      currentFolderId.value = null;
    }
  };

  const rememberFolders = (records) => {
    knownFolders.value = rememberFolderRecords(knownFolders.value, records);
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

  const fetchFiles = async () => {
    isLoading.value = true;
    loadError.value = "";

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
      fetchStorageSummary().catch(() => {});
      return allFiles.value;
    } catch (error) {
      loadError.value =
        error?.response?.data?.message ||
        error?.message ||
        "파일 목록을 불러오지 못했습니다.";
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  const fetchDrivePage = async (query = {}) => {
    isLoading.value = true;
    loadError.value = "";

    const nextQuery = {
      parentId: query.parentId ?? currentFolderId.value ?? null,
      page: Math.max(0, Number(query.page ?? lastDriveQuery.value?.page ?? 0) || 0),
      size: Math.min(
        MAX_DRIVE_PAGE_SIZE,
        Math.max(1, Number(query.size ?? lastDriveQuery.value?.size ?? DEFAULT_DRIVE_PAGE_SIZE) || DEFAULT_DRIVE_PAGE_SIZE),
      ),
      sortOption: query.sortOption ?? lastDriveQuery.value?.sortOption ?? "updatedAt-desc",
      searchQuery: query.searchQuery ?? lastDriveQuery.value?.searchQuery ?? "",
      extensionFilter: query.extensionFilter ?? lastDriveQuery.value?.extensionFilter ?? "all",
      sizeFilter: query.sizeFilter ?? lastDriveQuery.value?.sizeFilter ?? "all",
      customMinSize: query.customMinSize ?? lastDriveQuery.value?.customMinSize ?? "",
      customMaxSize: query.customMaxSize ?? lastDriveQuery.value?.customMaxSize ?? "",
      statusFilter: query.statusFilter ?? lastDriveQuery.value?.statusFilter ?? "all",
    };

    if (!query.forceRefresh && driveHasLoaded.value && areDriveQueriesEqual(lastDriveQuery.value, nextQuery)) {
      isLoading.value = false;
      return drivePageFiles.value;
    }

    try {
      const result = await fetchFileListPageApi(nextQuery);
      const breadcrumbs = Array.isArray(result?.breadcrumbs)
        ? result.breadcrumbs.map((folder) => normalizeBreadcrumbRecord(folder))
        : [];
      const currentLocationLabel = breadcrumbs[breadcrumbs.length - 1]?.name || ROOT_LOCATION_LABEL;
      const pageFiles = Array.isArray(result?.fileList)
        ? result.fileList
          .map((file) => normalizeFileRecord(file))
          .map((file) => ({
            ...file,
            location: currentLocationLabel,
          }))
        : [];

      drivePageFiles.value = reuseCachedAssetUrls(drivePageFiles.value, pageFiles);
      driveBreadcrumbs.value = breadcrumbs;
      driveAvailableExtensions.value = Array.isArray(result?.availableExtensions)
        ? [...new Set(result.availableExtensions.map((extension) => String(extension || "").trim().toLowerCase()).filter(Boolean))]
          .sort((left, right) => left.localeCompare(right))
        : [];
      drivePageInfo.value = {
        totalPage: Number(result?.totalPage ?? 0) || 0,
        totalCount: Number(result?.totalCount ?? 0) || 0,
        currentPage: Number(result?.currentPage ?? nextQuery.page) || 0,
        currentSize: Number(result?.currentSize ?? nextQuery.size) || nextQuery.size,
      };
      driveHasLoaded.value = true;
      lastDriveQuery.value = nextQuery;
      rememberFolders([
        ...breadcrumbs,
        ...pageFiles.filter((file) => file?.type === "folder"),
      ]);
      syncCurrentFolder();
      if (!storageSummary.value && !storageLoading.value) {
        fetchStorageSummary().catch(() => {});
      }
      return drivePageFiles.value;
    } catch (error) {
      loadError.value =
        error?.response?.data?.message ||
        error?.message ||
        "파일 목록을 불러오지 못했습니다.";
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  const refreshDrivePage = async () => {
    if (!lastDriveQuery.value) {
      return drivePageFiles.value;
    }

    return fetchDrivePage({
      ...lastDriveQuery.value,
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

  const refreshAll = async () => {
    if (driveHasLoaded.value && lastDriveQuery.value) {
      await refreshDrivePage();
    }

    if (hasLoaded.value) {
      await fetchFiles();
    } else if (!driveHasLoaded.value) {
      await fetchFiles();
    }

    if (storageSummary.value) {
      fetchStorageSummary().catch(() => {});
    }

    return true;
  };

  const createFolder = async (folderName) => {
    if (!folderName?.trim()) {
      return null;
    }

    await createFolderApi(folderName.trim(), currentFolderId.value);
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
    await clearTrashApi();
    await refreshAll();
  };

  const enterFolder = (folderId) => {
    const targetFolder = fileById.value.get(String(folderId));
    if (targetFolder?.type === "folder" && !targetFolder.isTrash) {
      currentFolderId.value = targetFolder.id;
    }
  };

  const navigateToFolder = (folderId) => {
    if (folderId == null) {
      currentFolderId.value = null;
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
      currentFolderId.value = null;
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
      currentFolderId.value = target.id;
      return { found: true, searchTerm: "", target };
    }

    currentFolderId.value = target.parentId ?? null;
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
    if (!currentFolderId.value) {
      return;
    }

    const folder = fileById.value.get(String(currentFolderId.value));
    currentFolderId.value = folder?.parentId ?? null;
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

  return {
    allFiles,
    drivePageFiles,
    driveBreadcrumbs,
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
    trashFiles,
    allOnlyFiles,
    fetchFiles,
    fetchDrivePage,
    refreshDrivePage,
    fetchSharedFiles,
    fetchPendingSharedFiles,
    fetchSentSharedFiles,
    refreshAll,
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
    navigateToDesktopPath,
    navigateToSharedDesktopPath,
    goBack,
    moveFileToFolder,
    moveFilesToFolder,
    renameFolder,
    setFilesLocked,
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
