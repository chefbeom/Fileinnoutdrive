<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import BaseFilePaginationBar from "./BaseFilePaginationBar.vue";
import BaseFileSelectionBar from "./BaseFileSelectionBar.vue";
import BaseFileShareDialog from "./BaseFileShareDialog.vue";
import BaseFileToolbar from "./BaseFileToolbar.vue";
import BaseFolderPropertyDialog from "./BaseFolderPropertyDialog.vue";
import BaseFolderRenameDialog from "./BaseFolderRenameDialog.vue";
import FilePreviewModal from "@/components/FilePreviewModal.vue";
import FileCollectionView from "@/components/file/FileCollectionView.vue";
import { downloadFileAsset } from "@/api/filesApi.js";
import { useFileStore } from "@/stores/useFileStore.js";
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
} from "./baseFileViewModel.js";
import { BASE_SHARE_PERMISSION_OPTIONS, useBaseFileShareDialog } from "./useBaseFileShareDialog.js";
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
const route = useRoute();
const headerSearchStore = useHeaderSearchStore();
const {
  viewMode,
  layoutPreset,
  customLayoutColumns,
  customLayoutRows,
  resolvedPageSize,
  setViewMode,
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
const sharePermissionOptions = BASE_SHARE_PERMISSION_OPTIONS;
const layoutPresetOptions = [
  { value: "10", label: "10개" },
  { value: "20", label: "20개" },
  { value: "30", label: "30개" },
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
  if (!file?.downloadUrl && !file?.presignedDownloadUrl && !file?.sharedWithMe) return;

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
  { id: null, name: FILE_ROOT_LABEL },
  ...fileStore.currentFolderPath.map((folder) => ({ id: folder.id, name: folder.name })),
]);

const propertyPathLabel = computed(() => {
  if (!propertyTarget.value?.id) return FILE_ROOT_LABEL;
  return [FILE_ROOT_LABEL, ...fileStore.getFolderPath(propertyTarget.value.id).map((folder) => folder.name)].join(" / ");
});

const currentFolderVisibleSummary = computed(() => buildCurrentFolderVisibleSummary(fileStore.currentFolder, effectiveFiles.value));
const folderSummaryCards = computed(() => buildFolderSummaryCards(currentFolderVisibleSummary.value));
const planCapabilities = computed(() => fileStore.planCapabilities);
const canCreateShares = computed(() => Boolean(planCapabilities.value?.shareEnabled));
const canCreateLocks = computed(() => Boolean(planCapabilities.value?.fileLockEnabled));
const customSizeRangeLabel = computed(() => buildBaseCustomSizeRangeLabel(searchState.value));
const hasSearchFilters = computed(() => hasBaseSearchFilters(searchState.value));

const hasActiveFilters = computed(() => hasSearchFilters.value || sortOption.value !== "updatedAt-desc");
const layoutGuideLabel = "배치";
const layoutGuideSummary = computed(() => (
  `${pageSize.value}`
));
const layoutGuideHint = computed(() => (
  `현재 한 페이지에 ${pageSize.value}개씩 표시합니다.`
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
}));
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
}));
const selectedDownloadableFiles = computed(() => selectedFileGroups.value.downloadableFiles);
const selectedSharedFiles = computed(() => selectedFileGroups.value.sharedFiles);
const selectedOwnedShareableFiles = computed(() => selectedFileGroups.value.ownedShareableFiles);
const selectedCancelableSentSharedFiles = computed(() => selectedFileGroups.value.cancelableSentSharedFiles);
const selectedLockableFiles = computed(() => selectedFileGroups.value.lockableFiles);
const selectedLockCandidates = computed(() => selectedFileGroups.value.lockCandidates);
const selectedLockedFiles = computed(() => selectedFileGroups.value.lockedFiles);
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
const pageCount = computed(() => buildBasePageCount({
  useServerPaging: useServerPaging.value,
  drivePageInfo: fileStore.drivePageInfo,
  filteredFiles: filteredFiles.value,
  pageSize: pageSize.value,
}));
const paginatedFiles = computed(() => paginateBaseFiles({
  useServerPaging: useServerPaging.value,
  filteredFiles: filteredFiles.value,
  currentPage: currentPage.value,
  pageSize: pageSize.value,
}));
const pageNumbers = computed(() => buildBasePageNumbers(currentPage.value, pageCount.value));
const serverListQuery = computed(() => buildBaseServerListQuery({
  useServerPaging: useServerPaging.value,
  currentFolderId: fileStore.currentFolderId,
  currentPage: currentPage.value,
  pageSize: pageSize.value,
  sortOption: sortOption.value,
  searchState: searchState.value,
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

watch(serverListQuery, (query) => {
  if (!query) {
    return;
  }

  fileStore.fetchDrivePage(query).catch(() => {});
}, { immediate: true, deep: true });

watch(() => [
  searchState.value.searchQuery,
  searchState.value.extensionFilter,
  searchState.value.sizeFilter,
  searchState.value.customMinSize,
  searchState.value.customMaxSize,
  searchState.value.statusFilter,
  sortOption.value,
], () => {
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
    : props.deleteMode === "permanent"
      ? `선택한 ${selectedFiles.value.length}개 항목을 영구 삭제하시겠습니까?`
      : `선택한 ${selectedFiles.value.length}개 항목을 휴지통으로 이동하시겠습니까?`;
  if (!window.confirm(confirmMessage)) return;
  try {
    const ids = selectedFiles.value.map((file) => file.id);
    if (props.deleteMode === "permanent") await fileStore.permanentlyDeleteBatch(ids);
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

onMounted(() => {
  if (props.sharedLibrary) {
    fileStore.fetchFiles().catch(() => {});
    setLayoutPreset("20");
    sortOption.value = "sharedAt-desc";
  } else if (!useServerPaging.value && !fileStore.hasLoaded && !fileStore.isLoading) {
    fileStore.fetchFiles().catch(() => {});
  }
});
</script>

<template>
  <div>
    <BaseFileToolbar
      :title="title"
      :toolbar-meta-label="toolbarMetaLabel"
      :has-visible-toolbar-chips="hasVisibleToolbarChips"
      :has-active-filters="hasActiveFilters"
      :active-filter-chips="activeFilterChips"
      :search-state="searchState"
      :custom-size-chip-prefix="customSizeChipPrefix"
      :custom-size-range-label="customSizeRangeLabel"
      :reset-filters-label="resetFiltersLabel"
      :show-folder-navigation="showFolderNavigation"
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
      @update:sort-option="sortOption = $event"
      @reset-filters="resetFilters"
      @navigate-folder="navigateToFolder"
      @show-folder-properties="openFolderProperties"
      @go-back="handleGoBack"
      @set-layout-preset="setLayoutPreset"
      @set-custom-layout-columns="setCustomLayoutColumns"
      @set-custom-layout-rows="setCustomLayoutRows"
      @set-view-mode="setViewMode"
    >
      <template #header-left><slot name="header-left"></slot></template>
      <template #header-right><slot name="header-right"></slot></template>
    </BaseFileToolbar>
    <slot name="header-bottom"></slot>

    <BaseFileSelectionBar
      :selected-count="selectedFiles.length"
      :downloadable-count="selectedDownloadableFiles.length"
      :shared-count="selectedSharedFiles.length"
      :cancelable-sent-shared-count="selectedCancelableSentSharedFiles.length"
      :owned-shareable-count="selectedOwnedShareableFiles.length"
      :lock-candidate-count="selectedLockCandidates.length"
      :locked-count="selectedLockedFiles.length"
      :shared-library="sharedLibrary"
      :delete-mode="deleteMode"
      :can-create-locks="canCreateLocks"
      @download="handleBatchDownload"
      @save-shared="handleBatchSaveShared"
      @cancel-sent-shares="handleBatchCancelSentShares"
      @share="openShareDialog()"
      @lock="handleBatchLock"
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
        :delete-mode="deleteMode"
        :show-parent-navigator="showFolderNavigation && Boolean(fileStore.currentFolder)"
        :parent-folder-target-id="fileStore.currentFolder?.parentId ?? null"
        :shared-library="sharedLibrary"
        @update:selected-ids="selectedIds = $event"
        @delete-file="handleDelete"
        @restore-file="handleRestore"
        @rename-folder="openRenameFolder"
        @show-folder-properties="openFolderProperties"
        @preview-file="openFilePreview"
        @share-file="openShareDialog"
        @toggle-lock="handleToggleLock"
        @save-to-drive="handleSaveSharedToDrive"
      />

      <BaseFilePaginationBar
        v-model:current-page="currentPage"
        :page-count="pageCount"
        :page-numbers="pageNumbers"
      />
    </div>
    <div v-else-if="showEmpty" class="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center text-sm text-gray-400">{{ "\uD45C\uC2DC\uD560 \uD30C\uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }}</div>

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
    <FilePreviewModal :file="previewTarget" @close="closeFilePreview" />
  </div>
</template>
