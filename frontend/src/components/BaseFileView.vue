<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import BaseFilePaginationBar from "./BaseFilePaginationBar.vue";
import BaseFileSelectionBar from "./BaseFileSelectionBar.vue";
import BaseFileShareDialog from "./BaseFileShareDialog.vue";
import DownloadShareLinkDialog from "./DownloadShareLinkDialog.vue";
import BaseFileToolbar from "./BaseFileToolbar.vue";
import BaseFolderPropertyDialog from "./BaseFolderPropertyDialog.vue";
import BaseFolderRenameDialog from "./BaseFolderRenameDialog.vue";
import FilePreviewModal from "@/components/FilePreviewModal.vue";
import FileCollectionView from "@/components/file/FileCollectionView.vue";
import VaultImportModal from "@/components/file/VaultImportModal.vue";
import { downloadFileAsset } from "@/api/filesApi.js";
import {
  extractDropItems,
  isDesktopDragEvent,
  triggerDesktopUpload,
} from "@/utils/desktopDropUpload.js";
import { useFileStore } from "@/stores/useFileStore.js";
import { useSecretFolderStore } from "@/stores/useSecretFolderStore.js";
import { useViewStore } from "@/stores/viewStore.js";
import {
  FILE_SIZE_OPTIONS,
  FILE_STATUS_OPTIONS,
  getFileSearchScope,
  useHeaderSearchStore,
} from "@/stores/useHeaderSearchStore.js";
import {
  buildBaseActiveFilterChips,
  buildBaseCustomSizeRangeLabel,
  buildBasePageCount,
  buildBasePageNumbers,
  buildBaseServerListQuery,
  buildBaseToolbarMetaLabel,
  buildBaseTotalSizeLabel,
  buildCurrentFolderVisibleSummary,
  buildFolderSummaryCards,
  buildSelectedBaseFileGroups,
  collectBaseFileExtensions,
  filterAndSortBaseFiles,
  getSelectedBaseFiles,
  hasBaseSearchFilters,
  isOwnedSharedBaseFile,
  paginateBaseFiles,
  resolveEffectivePageSize,
  resolveEmptyFolderNavigationState,
} from "./baseFileViewModel.js";
import { BASE_SHARE_PERMISSION_OPTIONS, useBaseFileShareDialog } from "./useBaseFileShareDialog.js";
import { useDownloadShareLinkDialog } from "./useDownloadShareLinkDialog.js";
import {
  describeSearchScopeLabel,
  normalizeSearchScope,
  parseExtensionTokens,
} from "@/utils/fileSearch.js";
const FILE_ROOT_LABEL = "홈";

const props = defineProps({
  title: { type: String, default: "" },
  files: { type: Array, default: () => [] },
  showEmpty: { type: Boolean, default: true },
  deleteMode: { type: String, default: "trash" },
  showFolderNavigation: { type: Boolean, default: false },
  sharedLibrary: { type: Boolean, default: false },
});

const emit = defineEmits(["delete"]);

const fileStore = useFileStore();
const secretFolderStore = useSecretFolderStore();
const route = useRoute();
const router = useRouter();
const headerSearchStore = useHeaderSearchStore();
const isSecretDriveContext = computed(() => props.showFolderNavigation && !props.sharedLibrary);
const isVaultMode = computed(() => isSecretDriveContext.value && secretFolderStore.vaultMode);
const isVaultTrashView = computed(() => isVaultMode.value && secretFolderStore.vaultTrashView);
const effectiveDeleteMode = computed(() => (isVaultTrashView.value ? "permanent" : props.deleteMode));
const isCurrentTreeSecret = computed(() => (
  Boolean(
    isVaultMode.value ||
    fileStore.currentFolder?.hiddenFolder ||
    fileStore.currentFolder?.isVaultSpace ||
    (fileStore.currentFolderPath || []).some((folder) => Boolean(folder?.hiddenFolder || folder?.isVaultSpace)),
  )
));
const displayTitle = computed(() => {
  if (isVaultTrashView.value) {
    return "자체 비밀 폴더 · 휴지통";
  }
  if (isVaultMode.value) {
    return "자체 비밀 폴더";
  }
  return props.title;
});
const rootBreadcrumbLabel = computed(() => (isVaultMode.value ? "비밀 폴더" : FILE_ROOT_LABEL));
const {
  viewMode,
  itemSize,
  layoutPreset,
  customLayoutColumns,
  customLayoutRows,
  resolvedPageSize,
  setViewMode,
  setItemSize,
  setLayoutPreset,
  setCustomLayoutColumns,
  setCustomLayoutRows,
} = useViewStore();

const searchScope = computed(() => getFileSearchScope(route.name) || "files");
const searchState = computed(() => headerSearchStore.getScopeState(searchScope.value));
const useServerPaging = computed(() => props.showFolderNavigation && !props.sharedLibrary && props.deleteMode !== "permanent");
const effectiveFiles = computed(() => props.files);

const sortOption = ref("updatedAt-desc");
const pageSize = computed(() => resolvedPageSize.value);
const currentPage = ref(1);
const selectedIds = ref([]);

const renameTarget = ref(null);
const renameValue = ref("");
const renameError = ref("");
const isRenaming = ref(false);
const propertyTarget = ref(null);
const propertySummary = ref(null);
const propertyError = ref("");
const isPropertyLoading = ref(false);
const previewTarget = ref(null);

const sizeOptions = FILE_SIZE_OPTIONS;
const statusOptions = FILE_STATUS_OPTIONS;
const sortOptions = [
  { label: "\uCD5C\uADFC \uC218\uC815\uC21C", value: "updatedAt-desc" },
  { label: "\uC624\uB798\uB41C \uC218\uC815\uC21C", value: "updatedAt-asc" },
  { label: "\uC774\uB984 \uC624\uB984\uCC28\uC21C", value: "name-asc" },
  { label: "\uC774\uB984 \uB0B4\uB9BC\uCC28\uC21C", value: "name-desc" },
  { label: "\uD070 \uD30C\uC77C \uC21C", value: "size-desc" },
  { label: "\uC791\uC740 \uD30C\uC77C \uC21C", value: "size-asc" },
  { label: "\uCD5C\uADFC \uACF5\uC720\uC21C", value: "sharedAt-desc" },
];
const desktopQueryTerm = computed(() => {
  const rawValue = route.query.desktopPath || route.query.desktopTarget || route.query.drivePath || "";
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  const normalized = String(value || "").replace(/\\/g, "/").split("/").filter(Boolean);
  return (normalized[normalized.length - 1] || "").trim();
});
const desktopQueryPath = computed(() => {
  const rawValue = route.query.desktopPath || route.query.desktopTarget || route.query.drivePath || "";
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  return String(value || "").trim();
});
const parseRouteFolderId = (rawFolderId) => {
  const value = Array.isArray(rawFolderId) ? rawFolderId[0] : rawFolderId;
  if (value == null || String(value).trim() === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : String(value).trim();
};
const sharePermissionOptions = BASE_SHARE_PERMISSION_OPTIONS;
const layoutPresetOptions = [
  { value: "10", label: "10개" },
  { value: "20", label: "20개" },
  { value: "30", label: "30개" },
  { value: "40", label: "40개" },
  { value: "50", label: "50개" },
  { value: "custom", label: "사용자 설정" },
];
const sizeOptionLabelMap = Object.fromEntries(sizeOptions.map((option) => [option.value, option.label]));
const visibleLayoutPresetOptions = computed(() => layoutPresetOptions.filter((option) => option.value !== "custom"));
const statusOptionLabelMap = Object.fromEntries(statusOptions.map((option) => [option.value, option.label]));

const resolveProtectedShareOptions = (file) => {
  if (!file?.sharedWithMe || !file?.passwordProtected) {
    return {};
  }
  const sharePassword = window.prompt("공유 비밀번호를 입력해 주세요.");
  if (sharePassword === null) {
    throw new Error("공유 비밀번호가 필요합니다.");
  }
  return { sharePassword };
};

const triggerDownload = async (file) => {
  if (!file?.downloadUrl && !file?.presignedDownloadUrl && !file?.sharedWithMe && file?.type !== "folder") return;

  try {
    await downloadFileAsset(file, "file", resolveProtectedShareOptions(file));
  } catch (error) {
    window.alert(error?.message || "파일을 다운로드하지 못했습니다.");
  }
};
const extensionOptions = computed(() => collectBaseFileExtensions({
  useServerPaging: useServerPaging.value,
  serverExtensions: fileStore.driveAvailableExtensions,
  files: effectiveFiles.value,
}));
const folderPathSegments = computed(() => [
  { id: null, name: rootBreadcrumbLabel.value },
  ...fileStore.currentFolderPath.map((folder) => ({ id: folder.id, name: folder.name })),
]);
const folderBackStack = ref([]);
const activeFolderSnapshot = ref({
  id: fileStore.currentFolderId ?? null,
  label: fileStore.currentFolder?.name || rootBreadcrumbLabel.value,
});
let restoringHistoryToId;
const emptyFolderNavigation = computed(() => resolveEmptyFolderNavigationState({
  showFolderNavigation: props.showFolderNavigation,
  isVaultTrashView: isVaultTrashView.value,
  currentFolderId: fileStore.currentFolderId,
  currentFolder: fileStore.currentFolder,
  folderPathSegments: folderPathSegments.value,
  rootBreadcrumbLabel: rootBreadcrumbLabel.value,
  backStackEntry: folderBackStack.value[folderBackStack.value.length - 1] || null,
}));

const propertyPathLabel = computed(() => {
  if (!propertyTarget.value?.id) return rootBreadcrumbLabel.value;
  return [rootBreadcrumbLabel.value, ...fileStore.getFolderPath(propertyTarget.value.id).map((folder) => folder.name)].join(" / ");
});

const currentFolderVisibleSummary = computed(() => buildCurrentFolderVisibleSummary(fileStore.currentFolder, effectiveFiles.value));
const folderSummaryCards = computed(() => buildFolderSummaryCards(currentFolderVisibleSummary.value));
const planCapabilities = computed(() => fileStore.planCapabilities);
const canCreateShares = computed(() => Boolean(planCapabilities.value?.shareEnabled));
const canCreateLocks = computed(() => Boolean(planCapabilities.value?.fileLockEnabled));
const customSizeRangeLabel = computed(() => buildBaseCustomSizeRangeLabel(searchState.value));
const hasSearchFilters = computed(() => hasBaseSearchFilters(searchState.value));

const showParentNavigator = computed(() => emptyFolderNavigation.value.inSubfolder);
const effectivePageSize = computed(() => resolveEffectivePageSize(pageSize.value, showParentNavigator.value));

const hasActiveFilters = computed(() => hasSearchFilters.value || sortOption.value !== "updatedAt-desc");
const layoutGuideLabel = "배치";
const layoutGuideSummary = computed(() => (
  `${pageSize.value}`
));
const layoutGuideHint = computed(() => (
  showParentNavigator.value
    ? `현재 한 페이지에 ${pageSize.value}개씩 표시합니다. (항목 ${effectivePageSize.value}개 + 상위 이동 1개)`
    : `현재 한 페이지에 ${pageSize.value}개씩 표시합니다.`
));
const resetFiltersLabel = "조건 초기화";
const customSizeChipPrefix = "사용자 크기";
const hasVisibleToolbarChips = computed(() => (
  activeFilterChips.value.length > 0 || searchState.value.sizeFilter === "custom"
));
const activeFilterChips = computed(() => buildBaseActiveFilterChips(searchState.value, sortOption.value, {
  sizeOptionLabelMap,
  statusOptionLabelMap,
  sortOptions,
  rootFolders: fileStore.driveRootFolders,
  rootFallbackLabel: isVaultMode.value ? "비밀 폴더 (전체)" : "홈 (전체)",
}));
const activeSearchScopeLabel = computed(() => describeSearchScopeLabel({
  searchScope: searchState.value.searchScope,
  searchRootFolderId: searchState.value.searchRootFolderId ?? null,
  rootFolders: fileStore.driveRootFolders,
  rootFallbackLabel: isVaultMode.value ? "비밀 폴더 (전체)" : "홈 (전체)",
}));
const canExpandEmptySearchToRoot = computed(() => (
  Boolean(useServerPaging.value) &&
  hasSearchFilters.value &&
  (
    normalizeSearchScope(searchState.value.searchScope) !== "root" ||
    searchState.value.searchRootFolderId != null
  )
));
const expandSearchToWholeRoot = () => {
  searchState.value.searchScope = "root";
  searchState.value.searchRootFolderId = null;
  currentPage.value = 1;
};
const localFilteredFiles = computed(() => filterAndSortBaseFiles(effectiveFiles.value, searchState.value, sortOption.value));

const filteredFiles = computed(() => (
  useServerPaging.value ? effectiveFiles.value : localFilteredFiles.value
));
const totalSizeLabel = computed(() => buildBaseTotalSizeLabel(filteredFiles.value));
const toolbarMetaLabel = computed(() => buildBaseToolbarMetaLabel({
  useServerPaging: useServerPaging.value,
  drivePageInfo: fileStore.drivePageInfo,
  filteredFiles: filteredFiles.value,
  totalSizeLabel: totalSizeLabel.value,
}));
const selectedFiles = computed(() => getSelectedBaseFiles(filteredFiles.value, selectedIds.value));
const isOwnedSharedFile = isOwnedSharedBaseFile;
const selectedFileGroups = computed(() => buildSelectedBaseFileGroups(selectedFiles.value, {
  sharedLibrary: props.sharedLibrary,
  canCreateShares: canCreateShares.value,
  vaultMode: isVaultMode.value,
  deleteMode: effectiveDeleteMode.value,
}));
const selectedDownloadableFiles = computed(() => selectedFileGroups.value.downloadableFiles);
const selectedSharedFiles = computed(() => selectedFileGroups.value.sharedFiles);
const selectedOwnedShareableFiles = computed(() => selectedFileGroups.value.ownedShareableFiles);
const selectedCancelableSentSharedFiles = computed(() => selectedFileGroups.value.cancelableSentSharedFiles);
const selectedLockableFiles = computed(() => selectedFileGroups.value.lockableFiles);
const selectedLockCandidates = computed(() => selectedFileGroups.value.lockCandidates);
const selectedLockedFiles = computed(() => selectedFileGroups.value.lockedFiles);
const selectedVaultMovableFiles = computed(() => selectedFileGroups.value.vaultMovableFiles);
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
const pageCount = computed(() => buildBasePageCount({
  useServerPaging: useServerPaging.value,
  drivePageInfo: fileStore.drivePageInfo,
  filteredFiles: filteredFiles.value,
  pageSize: effectivePageSize.value,
}));
const paginatedFiles = computed(() => paginateBaseFiles({
  useServerPaging: useServerPaging.value,
  filteredFiles: filteredFiles.value,
  currentPage: currentPage.value,
  pageSize: effectivePageSize.value,
}));
const pageNumbers = computed(() => buildBasePageNumbers(currentPage.value, pageCount.value));
const serverListQuery = computed(() => buildBaseServerListQuery({
  useServerPaging: useServerPaging.value,
  currentFolderId: fileStore.currentFolderId,
  currentPage: currentPage.value,
  pageSize: effectivePageSize.value,
  sortOption: sortOption.value,
  searchState: searchState.value,
  vaultMode: isVaultMode.value,
  includeHidden: isVaultMode.value ? true : secretFolderStore.showHiddenFolders,
  trashedOnly: isVaultTrashView.value,
}));
const isInitialLoading = computed(() => (
  fileStore.isLoading &&
  (
    useServerPaging.value
      ? filteredFiles.value.length === 0
      : fileStore.allFiles.length === 0
  )
));

watch(effectiveFiles, (files) => {
  const validIds = new Set((files || []).map((file) => String(file?.id)));
  selectedIds.value = selectedIds.value.filter((id) => validIds.has(String(id)));
}, { deep: true });

watch(extensionOptions, (extensions) => {
  headerSearchStore.setAvailableExtensions(searchScope.value, extensions);
}, { immediate: true });

watch(() => fileStore.driveRootFolders, (rootFolders) => {
  headerSearchStore.setAvailableRootFolders?.(searchScope.value, rootFolders || []);
}, { immediate: true });

watch([isVaultMode, isVaultTrashView], ([vaultEnabled, trashEnabled], prev) => {
  const [prevVault, prevTrash] = prev || [false, false];
  currentPage.value = 1;
  selectedIds.value = [];

  const switchedSpace = prev != null && (vaultEnabled !== prevVault || trashEnabled !== prevTrash);
  const mismatchedFolder = Boolean(
    fileStore.currentFolderId != null &&
    (vaultEnabled ? !fileStore.currentFolder?.isVaultSpace : fileStore.currentFolder?.isVaultSpace),
  );

  if (switchedSpace) {
    searchState.value.searchRootFolderId = null;
    folderBackStack.value = [];
  }

  if (switchedSpace || mismatchedFolder || trashEnabled) {
    fileStore.invalidateFolderSnapshots?.();
    if (fileStore.currentFolderId != null) {
      fileStore.navigateToFolder(null);
    }
  }

  if (vaultEnabled && route.query.folderId != null) {
    const nextQuery = { ...route.query };
    delete nextQuery.folderId;
    router.replace({ query: nextQuery }).catch(() => {});
  }
}, { immediate: true, flush: "sync" });

watch(() => route.query.folderId, (rawFolderId) => {
  if (!useServerPaging.value || desktopQueryPath.value || isVaultMode.value) {
    return;
  }
  const targetFolderId = parseRouteFolderId(rawFolderId);
  if (targetFolderId == null && isCurrentTreeSecret.value) {
    return;
  }
  if (String(fileStore.currentFolderId ?? "") !== String(targetFolderId ?? "")) {
    currentPage.value = 1;
    selectedIds.value = [];
    fileStore.navigateToFolder(targetFolderId);
  }
}, { immediate: true });

watch(() => fileStore.currentFolderId, (folderId, previousFolderId) => {
  if (String(folderId ?? "") !== String(previousFolderId ?? "")) {
    currentPage.value = 1;
    selectedIds.value = [];
  }
  if (!useServerPaging.value) {
    return;
  }
  if (isVaultMode.value || isCurrentTreeSecret.value) {
    if (route.query.folderId != null) {
      const nextQuery = { ...route.query };
      delete nextQuery.folderId;
      router.replace({ query: nextQuery }).catch(() => {});
    }
    return;
  }
  const currentRouteFolderId = parseRouteFolderId(route.query.folderId);
  if (String(currentRouteFolderId ?? "") === String(folderId ?? "")) {
    return;
  }
  const nextQuery = { ...route.query };
  if (folderId == null || folderId === "") {
    delete nextQuery.folderId;
  } else {
    nextQuery.folderId = String(folderId);
  }
  router.push({ query: nextQuery }).catch(() => {});
});

watch(desktopQueryPath, async (path) => {
  if (!path) {
    return;
  }
  const result = props.sharedLibrary
    ? await fileStore.navigateToSharedDesktopPath(path).catch(() => null)
    : props.showFolderNavigation
      ? await fileStore.navigateToDesktopPath(path).catch(() => null)
      : null;
  const term = result?.searchTerm || desktopQueryTerm.value;
  if (searchState.value.searchQuery !== term) {
    searchState.value.searchQuery = term;
    currentPage.value = 1;
  }
  if (result?.target?.id != null) {
    selectedIds.value = [String(result.target.id)];
  }
}, { immediate: true });

watch(() => route.query.spotlightId, (rawSpotlightId) => {
  const value = Array.isArray(rawSpotlightId) ? rawSpotlightId[0] : rawSpotlightId;
  if (!value) {
    return;
  }
  const targetId = String(value).trim();
  if (targetId && !selectedIds.value.includes(targetId)) {
    selectedIds.value = [targetId];
  }
}, { immediate: true });

watch(serverListQuery, (query) => {
  if (!query) {
    return;
  }

  fileStore.fetchDrivePage(query).catch(() => {});
}, { immediate: true, deep: true });

watch(() => [
  searchState.value.searchQuery,
  searchState.value.searchScope,
  searchState.value.searchRootFolderId,
  searchState.value.extensionFilter,
  searchState.value.sizeFilter,
  searchState.value.customMinSize,
  searchState.value.customMaxSize,
  searchState.value.statusFilter,
  sortOption.value,
], () => {
  currentPage.value = 1;
});

watch([() => fileStore.currentFolder?.name, folderPathSegments, rootBreadcrumbLabel], () => {
  const currentId = fileStore.currentFolderId ?? null;
  if (String(activeFolderSnapshot.value.id ?? "") !== String(currentId ?? "")) {
    return;
  }
  const resolvedName = currentId == null
    ? rootBreadcrumbLabel.value
    : (
        fileStore.currentFolder?.name ||
        folderPathSegments.value[folderPathSegments.value.length - 1]?.name ||
        activeFolderSnapshot.value.label ||
        "이전 폴더"
      );
  activeFolderSnapshot.value = { id: currentId, label: resolvedName };
}, { immediate: true });

watch(() => fileStore.currentFolderId, (nextId, prevId) => {
  if (String(nextId ?? "") === String(prevId ?? "")) {
    return;
  }

  const leaving = activeFolderSnapshot.value;
  const nextLabel = nextId == null
    ? rootBreadcrumbLabel.value
    : (fileStore.currentFolder?.name || folderPathSegments.value[folderPathSegments.value.length - 1]?.name || "현재 폴더");
  activeFolderSnapshot.value = { id: nextId ?? null, label: nextLabel };

  const isRestoringTarget = (
    restoringHistoryToId !== undefined &&
    String(nextId ?? "") === String(restoringHistoryToId ?? "")
  );
  restoringHistoryToId = undefined;

  if (!isRestoringTarget && prevId !== undefined && String(leaving?.id ?? "") !== String(nextId ?? "")) {
    const nextStack = folderBackStack.value.slice(-49);
    const top = nextStack[nextStack.length - 1];
    if (!top || String(top.id ?? "") !== String(leaving.id ?? "")) {
      nextStack.push({
        id: leaving.id ?? null,
        label: leaving.label || rootBreadcrumbLabel.value,
      });
    }
    folderBackStack.value = nextStack;
  }

  const hadActiveSearchScope = normalizeSearchScope(searchState.value.searchScope) !== "current";
  const hadSearchText = String(searchState.value.searchQuery || "").trim() !== "";
  const hadExtensionFilter = parseExtensionTokens(searchState.value.extensionFilter).length > 0;
  if (hadActiveSearchScope || hadSearchText || hadExtensionFilter) {
    searchState.value.searchScope = "current";
    searchState.value.searchRootFolderId = null;
    searchState.value.searchQuery = "";
    searchState.value.extensionFilter = "all";
  }
  currentPage.value = 1;
});

watch(filteredFiles, (files) => {
  const validIds = new Set(files.map((file) => String(file.id)));
  selectedIds.value = selectedIds.value.filter((id) => validIds.has(String(id)));
  if (currentPage.value > pageCount.value) currentPage.value = pageCount.value;
  if (currentPage.value < 1) currentPage.value = 1;
});

watch(pageSize, () => {
  currentPage.value = 1;
  fileStore.invalidateFolderSnapshots?.();
});

const resetFilters = () => {
  headerSearchStore.resetScope(searchScope.value);
  sortOption.value = "updatedAt-desc";
  currentPage.value = 1;
};

const clearSelection = () => {
  selectedIds.value = [];
};

const navigateToFolder = (folderId) => {
  if (useServerPaging.value) {
    currentPage.value = 1;
  }
  fileStore.navigateToFolder(folderId);
};

const handleGoBack = () => {
  if (useServerPaging.value) {
    currentPage.value = 1;
  }
  fileStore.goBack();
};

const handleHistoryBack = () => {
  if (!emptyFolderNavigation.value.hasHistoryBack) {
    handleGoBack();
    return;
  }
  const nextStack = [...folderBackStack.value];
  const target = nextStack.pop();
  folderBackStack.value = nextStack;
  restoringHistoryToId = target?.id ?? null;
  if (useServerPaging.value) {
    currentPage.value = 1;
  }
  fileStore.navigateToFolder(target?.id ?? null);
};

const handleDelete = (fileId) => {
  selectedIds.value = selectedIds.value.filter((id) => String(id) !== String(fileId));
  emit("delete", fileId);
};

const handleRestore = async (fileId) => {
  try {
    await fileStore.restoreFromTrash(fileId);
    selectedIds.value = selectedIds.value.filter((id) => String(id) !== String(fileId));
  } catch (error) {
    window.alert(error?.response?.data?.message || error?.message || "파일을 원래 위치로 복구하지 못했습니다.");
  }
};

const handleRestoreSelected = async () => {
  if (!selectedFiles.value.length) return;

  try {
    await fileStore.restoreFilesBatch(selectedFiles.value.map((file) => file.id));
    clearSelection();
  } catch (error) {
    window.alert(error?.response?.data?.message || error?.message || "선택한 항목을 원래 위치로 복구하지 못했습니다.");
  }
};

const handleDeleteSelected = async () => {
  if (!selectedFiles.value.length) return;
  if (selectedFiles.value.some((file) => file?.lockedFile)) {
    window.alert("잠긴 파일은 삭제할 수 없습니다.");
    return;
  }
  const confirmMessage = selectedFiles.value.some(isOwnedSharedFile)
    ? "공유한 파일입니다. 삭제하시겠습니까? 공유받은 사람에게도 사라집니다."
    : effectiveDeleteMode.value === "permanent"
      ? `선택한 ${selectedFiles.value.length}개 항목을 영구 삭제하시겠습니까?`
      : `선택한 ${selectedFiles.value.length}개 항목을 휴지통으로 이동하시겠습니까?`;
  if (!window.confirm(confirmMessage)) return;
  try {
    const ids = selectedFiles.value.map((file) => file.id);
    if (effectiveDeleteMode.value === "permanent") await fileStore.permanentlyDeleteBatch(ids);
    else await fileStore.trashFilesBatch(ids);
    clearSelection();
  } catch (error) {
    window.alert(error?.response?.data?.message || error?.message || "선택한 항목을 처리하지 못했습니다.");
  }
};

const handleBatchDownload = () => {
  if (!selectedDownloadableFiles.value.length) {
    window.alert("다운로드할 수 있는 파일이 선택되지 않았습니다.");
    return;
  }
  selectedDownloadableFiles.value.forEach((file, index) => {
    window.setTimeout(() => { void triggerDownload(file); }, index * 120);
  });
};

const handleSaveSharedToDrive = async (file) => {
  try {
    await fileStore.saveSharedFileToDrive(file.id, fileStore.currentFolderId, resolveProtectedShareOptions(file));
    window.alert("내 드라이브에 저장했습니다.");
  } catch (error) {
    window.alert(error?.response?.data?.message || error?.message || "공유 파일을 저장하지 못했습니다.");
  }
};

const handleBatchSaveShared = async () => {
  if (!selectedSharedFiles.value.length) {
    window.alert("내 드라이브로 저장할 공유 파일이 선택되지 않았습니다.");
    return;
  }
  try {
    for (const file of selectedSharedFiles.value) {
      await fileStore.saveSharedFileToDrive(file.id, fileStore.currentFolderId, resolveProtectedShareOptions(file));
    }
    clearSelection();
    window.alert("선택한 공유 파일을 내 드라이브에 저장했습니다.");
  } catch (error) {
    window.alert(error?.response?.data?.message || error?.message || "공유 파일을 저장하지 못했습니다.");
  }
};

const handleBatchCancelSentShares = async () => {
  if (!selectedCancelableSentSharedFiles.value.length) {
    window.alert("공유 취소할 수 있는 공유한 파일이 선택되지 않았습니다.");
    return;
  }

  const cancelTargetCount = selectedCancelableSentSharedFiles.value.length;
  const ignoredCount = selectedFiles.value.length - cancelTargetCount;
  const confirmMessage = ignoredCount > 0
    ? `선택한 항목 중 내가 공유한 파일 ${cancelTargetCount}개만 공유 취소합니다. 계속할까요?`
    : `선택한 ${cancelTargetCount}개 파일의 공유를 모두 취소하시겠습니까?`;

  if (!window.confirm(confirmMessage)) {
    return;
  }

  try {
    const targetIds = selectedCancelableSentSharedFiles.value.map((file) => file.id);
    const targetIdSet = new Set(targetIds.map((id) => String(id)));
    await fileStore.cancelAllSharedFiles(targetIds);
    selectedIds.value = selectedIds.value.filter((id) => !targetIdSet.has(String(id)));
    window.alert("선택한 파일의 공유를 모두 취소했습니다.");
  } catch (error) {
    window.alert(error?.response?.data?.message || error?.message || "선택한 파일의 공유를 취소하지 못했습니다.");
  }
};
const handleBatchLock = async (locked) => {
  if (!selectedLockableFiles.value.length) {
    window.alert("\uC7A0\uAE00 \uC218 \uC788\uB294 \uD30C\uC77C\uC774 \uC120\uD0DD\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
    return;
  }
  if (locked && !canCreateLocks.value) {
    window.alert("\uD604\uC7AC \uBA64\uBC84\uC2ED\uC5D0\uC11C\uB294 \uD30C\uC77C \uC7A0\uAE08 \uAE30\uB2A5\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return;
  }
  try {
    const targetFiles = locked ? selectedLockCandidates.value : selectedLockedFiles.value;
    await fileStore.setFilesLocked(targetFiles.map((file) => file.id), locked);
    clearSelection();
  } catch (error) {
    window.alert(error?.response?.data?.message || error?.message || "\uD30C\uC77C \uC7A0\uAE08 \uC0C1\uD0DC\uB97C \uBCC0\uACBD\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  }
};

const handleToggleLock = async (file) => {
  if (!file?.lockedFile && !canCreateLocks.value) {
    window.alert("\uD604\uC7AC \uBA64\uBC84\uC2ED\uC5D0\uC11C\uB294 \uD30C\uC77C \uC7A0\uAE08 \uAE30\uB2A5\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return;
  }
  try {
    await fileStore.setFilesLocked([file.id], !file.lockedFile);
  } catch (error) {
    window.alert(error?.response?.data?.message || error?.message || "\uD30C\uC77C \uC7A0\uAE08 \uC0C1\uD0DC\uB97C \uBCC0\uACBD\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  }
};

const moveItemsToVault = async (targets = []) => {
  const validTargets = (Array.isArray(targets) ? targets : [targets]).filter((item) => item?.id != null);
  if (!validTargets.length || isVaultMode.value || props.sharedLibrary || effectiveDeleteMode.value === "permanent") {
    return;
  }

  for (const item of validTargets) {
    if (item.hiddenFolder && item.pinEnabled) {
      const folderUnlocked = await secretFolderStore.ensureFolderUnlocked(item);
      if (!folderUnlocked) {
        return;
      }
    }
  }

  const firstName = validTargets[0]?.name || validTargets[0]?.fileOriginName || "선택한 항목";
  const promptSubject = validTargets.length > 1
    ? `'${firstName}' 외 ${validTargets.length - 1}개 항목을`
    : `'${firstName}'을(를)`;

  const vaultReady = await secretFolderStore.ensureVaultUnlocked({
    enterVault: false,
    registerTitle: "자체 비밀구역 PIN 등록",
    title: "자체 비밀구역으로 옮기기",
    registerDescription: `${promptSubject} 자체 비밀구역(자체 비밀 폴더)으로 옮기려면 사용할 4자리 숫자 PIN 번호를 먼저 등록해 주세요.`,
    description: `${promptSubject} 자체 비밀구역(홈 버튼 두 번)으로 옮기려면 4자리 숫자 PIN 번호를 입력하세요.`,
  });
  if (!vaultReady) {
    return;
  }

  try {
    await fileStore.moveFilesToVault(validTargets.map((item) => item.id), null);
    const movedIdSet = new Set(validTargets.map((item) => String(item.id)));
    selectedIds.value = selectedIds.value.filter((id) => !movedIdSet.has(String(id)));
    window.alert(
      validTargets.length > 1
        ? `${validTargets.length}개 항목을 자체 비밀구역으로 옮겼습니다. (홈 버튼을 두 번 누르면 열 수 있습니다)`
        : `'${firstName}'을(를) 자체 비밀구역으로 옮겼습니다. (홈 버튼을 두 번 누르면 열 수 있습니다)`,
    );
  } catch (error) {
    const code = error?.response?.data?.code;
    if (code === 7304) {
      secretFolderStore.invalidateVaultUnlock?.();
    }
    if (code === 7306) {
      window.alert("하위에 PIN으로 잠긴 비밀 폴더가 있어 먼저 해당 폴더의 PIN 잠금을 해제해 주세요.");
      return;
    }
    window.alert(error?.response?.data?.message || error?.message || "자체 비밀구역으로 옮기지 못했습니다.");
  }
};

const vaultImportModal = ref({
  open: false,
  targetFolderId: null,
  targetFolderName: "",
});

const openVaultImportModal = (payload = {}) => {
  if (!isVaultMode.value || isVaultTrashView.value) return;
  closeEmptyContextMenu();
  const targetFolderId = payload?.targetFolderId ?? fileStore.currentFolderId ?? null;
  const targetFolderName =
    payload?.targetFolderName ||
    (targetFolderId != null && String(targetFolderId) === String(fileStore.currentFolderId ?? "")
      ? (fileStore.currentFolder?.name || "")
      : "");
  vaultImportModal.value = {
    open: true,
    targetFolderId,
    targetFolderName,
  };
};

const closeVaultImportModal = () => {
  vaultImportModal.value = {
    open: false,
    targetFolderId: null,
    targetFolderName: "",
  };
};

const handleVaultImported = ({ affectedCount = 0 } = {}) => {
  currentPage.value = 1;
  selectedIds.value = [];
  window.alert(`${affectedCount}개 항목을 자체 비밀 폴더로 가져왔습니다.`);
};

const handleMoveToVault = (target) => moveItemsToVault([target]);

const handleBatchMoveToVault = () => {
  if (!selectedVaultMovableFiles.value.length) {
    window.alert("비밀 폴더로 옮길 수 있는 항목이 선택되지 않았습니다.");
    return;
  }
  return moveItemsToVault(selectedVaultMovableFiles.value);
};

const openRenameFolder = (folder) => {
  if (!folder || folder.type !== "folder") return;
  renameTarget.value = folder;
  renameValue.value = folder.name || folder.fileOriginName || "";
  renameError.value = "";
};

const closeRenameModal = () => {
  renameTarget.value = null;
  renameValue.value = "";
  renameError.value = "";
  isRenaming.value = false;
};

const submitRenameFolder = async () => {
  const normalizedName = renameValue.value.trim();
  if (!renameTarget.value?.id) return;
  if (!normalizedName) {
    renameError.value = "\uD3F4\uB354 \uC774\uB984\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
    return;
  }
  isRenaming.value = true;
  renameError.value = "";
  try {
    await fileStore.renameFolder(renameTarget.value.id, normalizedName);
    closeRenameModal();
  } catch (error) {
    renameError.value = error?.response?.data?.message || error?.message || "\uD3F4\uB354 \uC774\uB984\uC744 \uBCC0\uACBD\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
  } finally {
    isRenaming.value = false;
  }
};

const openFolderProperties = async (folder) => {
  if (!folder || folder.type !== "folder") return;
  propertyTarget.value = folder;
  propertySummary.value = null;
  propertyError.value = "";
  isPropertyLoading.value = true;
  try {
    propertySummary.value = await fileStore.fetchFolderProperties(folder.id);
  } catch (error) {
    propertyError.value = error?.response?.data?.message || error?.message || "\uD3F4\uB354 \uC18D\uC131\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
  } finally {
    isPropertyLoading.value = false;
  }
};

const closePropertyModal = () => {
  propertyTarget.value = null;
  propertySummary.value = null;
  propertyError.value = "";
  isPropertyLoading.value = false;
};

const openFilePreview = (file) => {
  if (!file || file.type === "folder") return;
  previewTarget.value = file;
};

const closeFilePreview = () => {
  previewTarget.value = null;
};

const canDropUpload = computed(() => effectiveDeleteMode.value !== "permanent" && !props.sharedLibrary);
const isEmptyDraggingOver = ref(false);
let emptyDragCounter = 0;

const onEmptyDragEnter = (event) => {
  if (!isDesktopDragEvent(event) || !canDropUpload.value) return;
  emptyDragCounter += 1;
  isEmptyDraggingOver.value = true;
};

const onEmptyDragOver = (event) => {
  if (!isDesktopDragEvent(event) || !canDropUpload.value) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
};

const onEmptyDragLeave = (event) => {
  if (!isDesktopDragEvent(event) || !canDropUpload.value) return;
  emptyDragCounter = Math.max(0, emptyDragCounter - 1);
  if (emptyDragCounter === 0) {
    isEmptyDraggingOver.value = false;
  }
};

const onEmptyDrop = async (event) => {
  if (!isDesktopDragEvent(event) || !canDropUpload.value) return;
  event.preventDefault();
  emptyDragCounter = 0;
  isEmptyDraggingOver.value = false;

  const { files, emptyDirectories } = await extractDropItems(event.dataTransfer);
  triggerDesktopUpload(files, fileStore.currentFolderId, emptyDirectories);
};


const emptyContextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
});
const emptyFileUploadInputRef = ref(null);
const emptyFolderUploadInputRef = ref(null);

const closeEmptyContextMenu = () => {
  if (emptyContextMenu.value.visible) {
    emptyContextMenu.value.visible = false;
  }
};

const onEmptyContextMenu = (event) => {
  const menuWidth = 248;
  const maxX = Math.max(16, (window.innerWidth || 1024) - menuWidth - 16);
  const maxY = Math.max(16, (window.innerHeight || 768) - 360 - 16);
  emptyContextMenu.value = {
    visible: true,
    x: Math.min(Math.max(12, event?.clientX || 0), maxX),
    y: Math.min(Math.max(12, event?.clientY || 0), maxY),
  };
};

const handleEmptyCreateFolder = async () => {
  closeEmptyContextMenu();
  const folderName = window.prompt("새 폴더 이름을 입력해 주세요.");
  if (!folderName?.trim()) return;
  try {
    await fileStore.createFolder(folderName.trim(), fileStore.currentFolderId ?? null);
  } catch (error) {
    window.alert(error?.response?.data?.message || error?.message || "폴더를 생성하지 못했습니다.");
  }
};

const handleEmptyCreateSharedFolder = () => {
  closeEmptyContextMenu();
  window.dispatchEvent(
    new CustomEvent("open-storage-share-modal", {
      detail: {
        page: "create-space",
        targetParentId: fileStore.currentFolderId ?? null,
      },
    }),
  );
};

const handleEmptyCreateHiddenFolder = async () => {
  closeEmptyContextMenu();
  const created = await secretFolderStore.openCreateHiddenFolderDialog(fileStore.currentFolderId ?? null);
  if (created) {
    fileStore.invalidateFolderSnapshots?.();
    await Promise.all([
      fileStore.refreshDrivePage().catch(() => {}),
      fileStore.fetchFiles({ background: true }).catch(() => {}),
    ]);
  }
};

const emptyCurrentFolderForSecret = computed(() => {
  if (!isSecretDriveContext.value || isVaultMode.value || effectiveDeleteMode.value === "permanent") {
    return null;
  }
  const current = fileStore.currentFolder;
  if (!current || current.id == null) {
    return null;
  }
  const enriched =
    fileStore.allFiles?.find?.((item) => String(item?.id) === String(current.id)) ||
    current;
  const saveName = String(enriched?.fileSaveName || "");
  if (
    enriched?.sharedFile ||
    enriched?.isSharedFolder ||
    enriched?.isShared ||
    enriched?.sharedWithMe ||
    enriched?.sharedStorageIdx ||
    saveName.startsWith("shared-") ||
    enriched?.isVaultSpace
  ) {
    return null;
  }
  return enriched;
});

const handleEmptyConfigureHiddenFolder = async () => {
  const target = emptyCurrentFolderForSecret.value;
  closeEmptyContextMenu();
  if (!target) return;
  const saved = await secretFolderStore.openConfigureHiddenFolderDialog(target);
  if (saved) {
    fileStore.invalidateFolderSnapshots?.();
    if (saved.hidden && !secretFolderStore.showHiddenFolders) {
      fileStore.navigateToFolder(target.parentId ?? null);
    }
    await Promise.all([
      fileStore.refreshDrivePage?.().catch(() => {}),
      fileStore.fetchFiles?.({ background: true }).catch(() => {}),
    ]);
  }
};

const handleToggleHiddenFolders = async () => {
  if (!isSecretDriveContext.value || isVaultMode.value) return;
  const nextVisible = secretFolderStore.toggleShowHiddenFolders();
  if (!nextVisible) {
    fileStore.exitHiddenSubtreeIfNeeded?.();
  }
  currentPage.value = 1;
  selectedIds.value = [];
  fileStore.invalidateFolderSnapshots?.();
  try {
    await fileStore.refreshDrivePage();
  } catch {
    // Ignore transient refresh failure
  }
};

const handleExitVaultMode = async () => {
  closeVaultImportModal();
  secretFolderStore.exitVaultMode({ lockVault: true });
  fileStore.invalidateFolderSnapshots?.();
  fileStore.navigateToFolder(null);
  currentPage.value = 1;
  selectedIds.value = [];
};

const handleToggleVaultTrashView = () => {
  if (!isVaultMode.value) return;
  closeVaultImportModal();
  secretFolderStore.setVaultTrashView(!isVaultTrashView.value);
  currentPage.value = 1;
  selectedIds.value = [];
};

const handleClearVaultTrash = async () => {
  if (!isVaultMode.value || !isVaultTrashView.value) return;
  if (!window.confirm("자체 비밀 폴더의 휴지통 항목을 모두 영구 삭제하시겠습니까?")) {
    return;
  }
  try {
    await fileStore.emptyTrash();
    currentPage.value = 1;
    selectedIds.value = [];
    fileStore.invalidateFolderSnapshots?.();
    await fileStore.refreshDrivePage();
  } catch (error) {
    window.alert(error?.response?.data?.message || error?.message || "비밀 휴지통을 비우지 못했습니다.");
  }
};

const isEditableEventTarget = (target) => {
  if (!target || typeof target !== "object") return false;
  const tagName = String(target.tagName || "").toUpperCase();
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    Boolean(target.isContentEditable)
  );
};

const onGlobalKeyDown = (event) => {
  if (!isSecretDriveContext.value || isVaultMode.value) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.repeat) return;
  if (secretFolderStore.pinModal?.open || secretFolderStore.folderDialog?.open || previewTarget.value) return;
  if (isEditableEventTarget(event.target)) return;
  const key = String(event.key || "").toLowerCase();
  if (event.code === "KeyH" || key === "h" || key === "ㅗ") {
    event.preventDefault();
    void handleToggleHiddenFolders();
  }
};

const onEmptyContextUploadChange = (event) => {
  const selected = Array.from(event?.target?.files || []);
  if (selected.length > 0) {
    triggerDesktopUpload(selected, fileStore.currentFolderId, []);
  }
  if (event?.target) {
    event.target.value = "";
  }
};

const handleEmptyRefresh = async () => {
  closeEmptyContextMenu();
  try {
    if (fileStore.driveHasLoaded) {
      await fileStore.refreshDrivePage();
    }
    await fileStore.fetchFiles({ background: fileStore.driveHasLoaded });
  } catch {
  }
};

onMounted(() => {
  window.addEventListener("click", closeEmptyContextMenu);
  window.addEventListener("scroll", closeEmptyContextMenu, true);
  window.addEventListener("keydown", onGlobalKeyDown);
  if (props.sharedLibrary) {
    fileStore.fetchFiles().catch(() => {});
    setLayoutPreset("20");
    sortOption.value = "sharedAt-desc";
  } else if (!useServerPaging.value && !fileStore.hasLoaded && !fileStore.isLoading) {
    fileStore.fetchFiles().catch(() => {});
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("click", closeEmptyContextMenu);
  window.removeEventListener("scroll", closeEmptyContextMenu, true);
  window.removeEventListener("keydown", onGlobalKeyDown);
});
</script>

<template>
  <div>
    <BaseFileToolbar
      :title="displayTitle"
      :toolbar-meta-label="toolbarMetaLabel"
      :has-visible-toolbar-chips="hasVisibleToolbarChips"
      :has-active-filters="hasActiveFilters"
      :active-filter-chips="activeFilterChips"
      :search-state="searchState"
      :custom-size-chip-prefix="customSizeChipPrefix"
      :custom-size-range-label="customSizeRangeLabel"
      :reset-filters-label="resetFiltersLabel"
      :show-folder-navigation="showFolderNavigation && !isVaultTrashView"
      :can-go-back="emptyFolderNavigation.inSubfolder"
      :folder-path-segments="folderPathSegments"
      :current-folder="fileStore.currentFolder"
      :folder-summary-cards="folderSummaryCards"
      :sort-option="sortOption"
      :sort-options="sortOptions"
      :layout-guide-label="layoutGuideLabel"
      :layout-preset="layoutPreset"
      :visible-layout-preset-options="visibleLayoutPresetOptions"
      :custom-layout-columns="customLayoutColumns"
      :custom-layout-rows="customLayoutRows"
      :layout-guide-hint="layoutGuideHint"
      :view-mode="viewMode"
      :item-size="itemSize"
      @update:sort-option="sortOption = $event"
      @reset-filters="resetFilters"
      @navigate-folder="navigateToFolder"
      @show-folder-properties="openFolderProperties"
      @go-back="handleGoBack"
      @set-layout-preset="setLayoutPreset"
      @set-custom-layout-columns="setCustomLayoutColumns"
      @set-custom-layout-rows="setCustomLayoutRows"
      @set-view-mode="setViewMode"
      @set-item-size="setItemSize"
    >
      <template #header-left><slot name="header-left"></slot></template>
      <template #header-right>
        <div v-if="isSecretDriveContext" class="flex flex-wrap items-center gap-2">
          <template v-if="isVaultMode">
            <button
              v-if="!isVaultTrashView"
              type="button"
              data-testid="vault-open-secret-media"
              class="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
              @click="router.push({ name: 'secretMedia' })"
            >
              <i class="fa-solid fa-clapperboard"></i>
              <span>비밀 미디어</span>
            </button>
            <button
              v-if="!isVaultTrashView"
              type="button"
              data-testid="vault-open-secret-photos"
              class="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
              @click="router.push({ name: 'secretPhotos' })"
            >
              <i class="fa-solid fa-images"></i>
              <span>비밀 사진첩</span>
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
              @click="handleToggleVaultTrashView"
            >
              <i class="fa-solid" :class="isVaultTrashView ? 'fa-folder-open' : 'fa-trash-can'"></i>
              <span>{{ isVaultTrashView ? '비밀 파일로' : '비밀 휴지통' }}</span>
            </button>
            <button
              v-if="isVaultTrashView"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl border border-rose-300/80 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300"
              @click="handleClearVaultTrash"
            >
              <i class="fa-solid fa-broom"></i>
              <span>비밀 휴지통 비우기</span>
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              @click="secretFolderStore.openChangeVaultPinModal()"
            >
              <i class="fa-solid fa-key"></i>
              <span>PIN 변경</span>
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
              @click="handleExitVaultMode"
            >
              <i class="fa-solid fa-lock"></i>
              <span>일반 홈으로 · 잠금</span>
            </button>
          </template>
          <template v-else>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition md:hidden"
              :class="secretFolderStore.showHiddenFolders
                ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500/50 dark:bg-indigo-500/20 dark:text-indigo-200'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'"
              @click="handleToggleHiddenFolders"
            >
              <i class="fa-solid" :class="secretFolderStore.showHiddenFolders ? 'fa-eye' : 'fa-eye-slash'"></i>
              <span>{{ secretFolderStore.showHiddenFolders ? '숨긴 폴더 숨기기' : '숨긴 폴더 (H)' }}</span>
            </button>
          </template>
        </div>
        <slot name="header-right"></slot>
      </template>
    </BaseFileToolbar>
    <div
      v-if="isVaultMode"
      class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/70 bg-amber-50/80 px-4 py-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/35 dark:text-amber-200"
    >
      <div class="flex items-center gap-2.5">
        <i class="fa-solid fa-shield-halved text-sm text-amber-600 dark:text-amber-400"></i>
        <span class="font-semibold">
          {{
            isVaultTrashView
              ? "비밀 공간 전용 휴지통 (일반 휴지통과 분리 보관)"
              : "자체 비밀 공간 (일반 홈·최근 문서·미디어·사진첩에 노출되지 않음)"
          }}
        </span>
      </div>
    </div>
    <div
      v-else-if="isSecretDriveContext && secretFolderStore.showHiddenFolders"
      class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-300/70 bg-indigo-50/85 px-4 py-2.5 text-xs text-indigo-900 dark:border-indigo-500/35 dark:bg-indigo-950/35 dark:text-indigo-200"
    >
      <div class="flex items-center gap-2.5">
        <i class="fa-solid fa-eye text-sm text-indigo-600 dark:text-indigo-400"></i>
        <span class="font-semibold">숨긴 폴더 표시 중 · H 키로 다시 숨기기</span>
      </div>
      <button
        type="button"
        class="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-slate-900 dark:text-indigo-200 dark:hover:bg-slate-800"
        @click="handleToggleHiddenFolders"
      >
        숨기기
      </button>
    </div>
    <slot name="header-bottom"></slot>

    <BaseFileSelectionBar
      :selected-count="selectedFiles.length"
      :downloadable-count="selectedDownloadableFiles.length"
      :shared-count="selectedSharedFiles.length"
      :cancelable-sent-shared-count="selectedCancelableSentSharedFiles.length"
      :owned-shareable-count="selectedOwnedShareableFiles.length"
      :lock-candidate-count="selectedLockCandidates.length"
      :locked-count="selectedLockedFiles.length"
      :vault-movable-count="selectedVaultMovableFiles.length"
      :shared-library="sharedLibrary"
      :vault-mode="isVaultMode"
      :delete-mode="effectiveDeleteMode"
      :can-create-locks="canCreateLocks"
      @download="handleBatchDownload"
      @save-shared="handleBatchSaveShared"
      @cancel-sent-shares="handleBatchCancelSentShares"
      @share="openShareDialog()"
      @lock="handleBatchLock"
      @move-to-vault="handleBatchMoveToVault"
      @restore="handleRestoreSelected"
      @delete="handleDeleteSelected"
      @clear="clearSelection"
    />
    <div v-if="isInitialLoading" class="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center text-sm text-gray-500">{{ "\uD30C\uC77C \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4." }}</div>
    <div v-else-if="fileStore.loadError" class="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-4 text-sm text-rose-600">{{ fileStore.loadError }}</div>

    <div v-else-if="paginatedFiles.length > 0">
      <FileCollectionView
        :selected-ids="selectedIds"
        :files="paginatedFiles"
        :delete-mode="effectiveDeleteMode"
        :show-parent-navigator="showParentNavigator"
        :parent-folder-target-id="fileStore.currentFolder?.parentId ?? null"
        :shared-library="sharedLibrary"
        @update:selected-ids="selectedIds = $event"
        @delete-file="handleDelete"
        @restore-file="handleRestore"
        @rename-folder="openRenameFolder"
        @show-folder-properties="openFolderProperties"
        @preview-file="openFilePreview"
        @share-file="openShareDialog"
        @share-download-link="openDownloadLinkDialog"
        @toggle-lock="handleToggleLock"
        @move-to-vault="handleMoveToVault"
        @open-vault-import="openVaultImportModal"
        @save-to-drive="handleSaveSharedToDrive"
      />

      <BaseFilePaginationBar
        v-model:current-page="currentPage"
        :page-count="pageCount"
        :page-numbers="pageNumbers"
      />
    </div>
    <div
      v-else-if="showEmpty"
      class="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-all"
      :class="isEmptyDraggingOver ? 'border-blue-500 bg-blue-50/70' : 'border-gray-200 bg-white text-gray-400'"
      @contextmenu.prevent="onEmptyContextMenu($event)"
      @dragenter="onEmptyDragEnter"
      @dragover="onEmptyDragOver"
      @dragleave="onEmptyDragLeave"
      @drop="onEmptyDrop"
    >
      <input
        ref="emptyFileUploadInputRef"
        type="file"
        multiple
        class="hidden"
        @change="onEmptyContextUploadChange"
      />
      <input
        ref="emptyFolderUploadInputRef"
        type="file"
        webkitdirectory
        directory
        multiple
        class="hidden"
        @change="onEmptyContextUploadChange"
      />
      <div v-if="isEmptyDraggingOver" class="flex flex-col items-center gap-2">
        <svg class="h-10 w-10 text-blue-500 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p class="text-sm font-semibold text-blue-600">이곳에 놓으면 업로드가 시작됩니다.</p>
      </div>
      <template v-else>
        <template v-if="hasSearchFilters">
          <p class="text-sm font-semibold text-gray-600 dark:text-slate-300">
            {{ useServerPaging ? `"${activeSearchScopeLabel}" 범위에서 검색 조건과 일치하는 파일이 없습니다.` : "검색 조건과 일치하는 파일이 없습니다." }}
          </p>
          <div class="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              v-if="canExpandEmptySearchToRoot"
              type="button"
              data-testid="empty-search-expand-root"
              class="rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
              @click="expandSearchToWholeRoot"
            >
              전체 루트에서 검색
            </button>
            <button
              type="button"
              data-testid="empty-search-reset"
              class="rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              @click="resetFilters"
            >
              검색 조건 초기화
            </button>
          </div>
        </template>
        <template v-else>
          <p class="text-sm font-semibold text-gray-600 dark:text-slate-300">표시할 파일이 없습니다.</p>
          <div
            v-if="emptyFolderNavigation.canGoBack"
            data-testid="empty-folder-nav-actions"
            class="mt-4 flex flex-wrap items-center justify-center gap-2"
          >
            <button
              v-if="emptyFolderNavigation.hasHistoryBack && !emptyFolderNavigation.isHistorySameAsParent"
              type="button"
              data-testid="empty-go-back"
              class="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-500/60 dark:hover:bg-slate-700"
              @click="handleHistoryBack"
            >
              <i class="fa-solid fa-arrow-left text-[11px]" aria-hidden="true"></i>
              <span>뒤로가기 ({{ emptyFolderNavigation.historyBackLabel }})</span>
            </button>
            <button
              v-if="emptyFolderNavigation.inSubfolder"
              type="button"
              data-testid="empty-go-parent"
              class="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-500/60 dark:hover:bg-slate-700"
              @click="handleGoBack"
            >
              <i
                class="fa-solid text-[11px]"
                :class="emptyFolderNavigation.hasHistoryBack && !emptyFolderNavigation.isHistorySameAsParent ? 'fa-arrow-up' : 'fa-arrow-left'"
                aria-hidden="true"
              ></i>
              <span>
                {{
                  emptyFolderNavigation.hasHistoryBack && !emptyFolderNavigation.isHistorySameAsParent
                    ? `이전(상위) 디렉터리 (${emptyFolderNavigation.parentLabel})`
                    : `뒤로가기 · 이전 디렉터리 (${emptyFolderNavigation.parentLabel})`
                }}
              </span>
            </button>
            <button
              v-else-if="emptyFolderNavigation.hasHistoryBack"
              type="button"
              data-testid="empty-go-back"
              class="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-500/60 dark:hover:bg-slate-700"
              @click="handleHistoryBack"
            >
              <i class="fa-solid fa-arrow-left text-[11px]" aria-hidden="true"></i>
              <span>뒤로가기 ({{ emptyFolderNavigation.historyBackLabel }})</span>
            </button>
          </div>
        </template>
      </template>

      <Teleport to="body">
        <div
          v-if="emptyContextMenu.visible"
          class="fixed z-[260] w-60 overflow-hidden rounded-2xl border border-gray-200 bg-white py-1.5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          :style="{ left: `${emptyContextMenu.x}px`, top: `${emptyContextMenu.y}px` }"
          @click.stop
          @contextmenu.prevent.stop
        >
          <div class="border-b border-gray-100 px-3.5 py-2 dark:border-slate-800">
            <p class="truncate text-xs font-black text-gray-900 dark:text-slate-100">
              {{ fileStore.currentFolder?.name || (isVaultMode ? "비밀 폴더 (최상위)" : "홈 (최상위)") }}
            </p>
            <p class="text-[10px] font-semibold text-gray-500 dark:text-slate-400">
              현재 디렉터리 작업
            </p>
          </div>

          <button
            v-if="canDropUpload"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleEmptyCreateFolder"
          >
            <i class="fa-solid fa-folder-plus w-4 text-center text-amber-500"></i>
            <span>새 폴더 만들기 (현재 위치)</span>
          </button>

          <button
            v-if="canDropUpload && isVaultMode && !isVaultTrashView"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-amber-700 transition hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-slate-800"
            @click="openVaultImportModal({ targetFolderId: fileStore.currentFolderId ?? null, targetFolderName: fileStore.currentFolder?.name || '' })"
          >
            <i class="fa-solid fa-file-import w-4 text-center text-amber-500"></i>
            <span>드라이브에서 파일 · 폴더 가져오기</span>
          </button>

          <button
            v-if="canDropUpload && isSecretDriveContext && !isVaultMode"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleEmptyCreateHiddenFolder"
          >
            <i class="fa-solid fa-eye-slash w-4 text-center text-indigo-500"></i>
            <span>비밀 폴더 만들기 (숨김)</span>
          </button>

          <button
            v-if="canDropUpload && !isVaultMode && !isCurrentTreeSecret"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleEmptyCreateSharedFolder"
          >
            <i class="fa-solid fa-share-nodes w-4 text-center text-indigo-500"></i>
            <span>공유 폴더 만들기 (위치 선택)</span>
          </button>

          <button
            v-if="canDropUpload"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="closeEmptyContextMenu(); emptyFileUploadInputRef?.click()"
          >
            <i class="fa-solid fa-file-arrow-up w-4 text-center text-blue-500"></i>
            <span>파일 업로드</span>
          </button>

          <button
            v-if="canDropUpload"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="closeEmptyContextMenu(); emptyFolderUploadInputRef?.click()"
          >
            <i class="fa-solid fa-cloud-arrow-up w-4 text-center text-indigo-500"></i>
            <span>폴더 업로드</span>
          </button>

          <template v-if="fileStore.currentFolder && canDropUpload">
            <div class="my-1 border-t border-gray-100 dark:border-slate-800"></div>

            <button
              type="button"
              class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
              @click="closeEmptyContextMenu(); openFolderProperties(fileStore.currentFolder)"
            >
              <i class="fa-solid fa-circle-info w-4 text-center text-sky-500"></i>
              <span>현재 폴더 속성</span>
            </button>

            <button
              type="button"
              class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
              @click="closeEmptyContextMenu(); openRenameFolder(fileStore.currentFolder)"
            >
              <i class="fa-solid fa-pen-to-square w-4 text-center text-gray-500"></i>
              <span>현재 폴더 이름 변경</span>
            </button>

            <button
              v-if="emptyCurrentFolderForSecret"
              type="button"
              class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-slate-800"
              @click="handleEmptyConfigureHiddenFolder"
            >
              <i
                class="fa-solid w-4 text-center text-indigo-500"
                :class="emptyCurrentFolderForSecret.hiddenFolder ? 'fa-key' : 'fa-eye-slash'"
              ></i>
              <span>{{ emptyCurrentFolderForSecret.hiddenFolder ? "현재 폴더 비밀 설정 · 해제" : "현재 폴더를 비밀 폴더로 전환" }}</span>
            </button>
          </template>

          <template v-if="emptyFolderNavigation.canGoBack">
            <div class="my-1 border-t border-gray-100 dark:border-slate-800"></div>

            <button
              v-if="emptyFolderNavigation.hasHistoryBack && !emptyFolderNavigation.isHistorySameAsParent"
              type="button"
              class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
              @click="closeEmptyContextMenu(); handleHistoryBack()"
            >
              <i class="fa-solid fa-arrow-left w-4 text-center text-gray-500"></i>
              <span>뒤로가기 ({{ emptyFolderNavigation.historyBackLabel }})</span>
            </button>

            <button
              v-if="emptyFolderNavigation.inSubfolder"
              type="button"
              class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
              @click="closeEmptyContextMenu(); handleGoBack()"
            >
              <i class="fa-solid fa-level-up-alt w-4 text-center text-gray-500"></i>
              <span>이전 디렉터리로 이동</span>
            </button>
          </template>

          <div class="my-1 border-t border-gray-100 dark:border-slate-800"></div>

          <button
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleEmptyRefresh"
          >
            <i class="fa-solid fa-rotate-right w-4 text-center text-gray-500"></i>
            <span>새로고침</span>
          </button>
        </div>
      </Teleport>
    </div>

    <BaseFolderRenameDialog
      v-if="renameTarget"
      v-model="renameValue"
      :target="renameTarget"
      :error="renameError"
      :is-renaming="isRenaming"
      @close="closeRenameModal"
      @submit="submitRenameFolder"
    />
    <BaseFolderPropertyDialog
      v-if="propertyTarget"
      :target="propertyTarget"
      :summary="propertySummary"
      :path-label="propertyPathLabel"
      :error="propertyError"
      :is-loading="isPropertyLoading"
      @close="closePropertyModal"
    />
    <BaseFileShareDialog
      v-if="shareTargets.length > 0"
      v-model:email="shareEmail"
      v-model:permission="sharePermission"
      v-model:expires-at="shareExpiresAt"
      v-model:download-limit="shareDownloadLimit"
      v-model:password="sharePassword"
      v-model:cancel-email="shareCancelEmail"
      v-model:target-user-ids="shareTargetUserIds"
      v-model:target-group-ids="shareTargetGroupIds"
      :targets="shareTargets"
      :permission-options="sharePermissionOptions"
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
    <FilePreviewModal
      :file="previewTarget"
      :allow-download-link-share="!isVaultMode && !sharedLibrary"
      @close="closeFilePreview"
      @share-download-link="openDownloadLinkDialog"
    />
    <DownloadShareLinkDialog
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
    <VaultImportModal
      :open="vaultImportModal.open"
      :target-folder-id="vaultImportModal.targetFolderId"
      :target-folder-name="vaultImportModal.targetFolderName"
      @close="closeVaultImportModal"
      @imported="handleVaultImported"
    />
  </div>
</template>
