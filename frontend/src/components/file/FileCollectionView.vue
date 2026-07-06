<script setup>
import { computed, provide, ref, watch } from "vue";
import { useFileStore } from "@/stores/useFileStore.js";
import { useViewStore } from "@/stores/viewStore.js";
import FileCollectionGrid from "./FileCollectionGrid.vue";
import FileCollectionTable from "./FileCollectionTable.vue";
import { FILE_COLLECTION_CONTEXT_KEY } from "./FileCollectionContext.js";
import { downloadFileAsset } from "@/api/filesApi.js";
import {
  getCachedFileThumbnailUrl,
  getFileThumbnailCacheKey,
  loadFileThumbnailUrl,
} from "@/utils/fileThumbnailCache.js";
import {
  buildCollectionStyle,
  formatCollectionDisplaySize,
  getCollectionActionAvailability,
  getCollectionContentType,
  getCollectionDeleteConfirmMessage,
  getCollectionDragFileIds,
  getCollectionFileExtension,
  getCollectionFileName,
  getCollectionGridClassName,
  getCollectionPreviewUrl,
  getCollectionSentShareLabel,
  getCollectionSharedAtLabel,
  getCollectionSharedOwnerLabel,
  getCollectionSharedOwnerText,
  getCollectionSharedSourceLabel,
  getCollectionStatusChips,
  getCollectionThumbnailUrl,
  getCollectionUpdatedAt,
  isCollectionImage,
  isCollectionLocked,
  isCollectionManagedThumbnailCandidate,
  isCollectionVideo,
  readCollectionDraggedFileIds,
} from "./fileCollectionViewModel.js";

const props = defineProps({
  files: {
    type: Array,
    required: true,
  },
  selectedIds: {
    type: Array,
    default: () => [],
  },
  deleteMode: {
    type: String,
    default: "trash",
  },
  showParentNavigator: {
    type: Boolean,
    default: false,
  },
  parentFolderTargetId: {
    type: Number,
    default: null,
  },
  sharedLibrary: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "update:selectedIds",
  "delete-file",
  "restore-file",
  "rename-folder",
  "show-folder-properties",
  "preview-file",
  "share-file",
  "toggle-lock",
  "save-to-drive",
]);

const fileStore = useFileStore();
const { viewMode, resolvedLayoutColumns } = useViewStore();
const brokenPreviewIds = ref([]);
const brokenThumbnailIds = ref([]);
const thumbnailSourceByKey = ref({});
const thumbnailStateByKey = ref({});
const dragTargetId = ref(null);
const draggingFileIds = ref([]);
const downloadingIds = ref([]);
let refreshListTimerId = null;
const planCapabilities = computed(() => fileStore.planCapabilities);
const canCreateShares = computed(() => Boolean(planCapabilities.value?.shareEnabled));
const canCreateLocks = computed(() => Boolean(planCapabilities.value?.fileLockEnabled));

const selectedIdSet = computed(() => new Set(props.selectedIds.map((id) => String(id))));
const downloadingIdSet = computed(() => new Set(downloadingIds.value.map((id) => String(id))));
const visibleFileIds = computed(() => props.files.map((file) => String(file?.id)).filter(Boolean));
const allVisibleSelected = computed(() =>
  visibleFileIds.value.length > 0 &&
  visibleFileIds.value.every((id) => selectedIdSet.value.has(String(id))),
);
const canSelect = computed(() => true);
const showActions = computed(() => viewMode.value !== "icon");

const gridClassName = computed(() => getCollectionGridClassName(viewMode.value));
const collectionStyle = computed(() => buildCollectionStyle(viewMode.value, resolvedLayoutColumns.value));

const formatDisplaySize = formatCollectionDisplaySize;
const getFileName = getCollectionFileName;
const getFileExtension = getCollectionFileExtension;
const getUpdatedAt = getCollectionUpdatedAt;
const getSharedOwnerLabel = getCollectionSharedOwnerLabel;
const getSharedAtLabel = getCollectionSharedAtLabel;
const getSharedOwnerText = getCollectionSharedOwnerText;
const getSharedSourceLabel = getCollectionSharedSourceLabel;
const getSentShareLabel = getCollectionSentShareLabel;
const getPreviewUrl = getCollectionPreviewUrl;
const getThumbnailUrl = getCollectionThumbnailUrl;
const getContentType = getCollectionContentType;
const hasBrokenPreview = (file) => brokenPreviewIds.value.includes(String(file?.id));
const hasBrokenThumbnail = (file) => brokenThumbnailIds.value.includes(String(file?.id));
const getManagedThumbnailKey = (file) => getFileThumbnailCacheKey(file);
const getManagedThumbnailState = (file) => {
  const key = getManagedThumbnailKey(file);
  return key ? (thumbnailStateByKey.value[key] || "idle") : "idle";
};
const getManagedThumbnailUrl = (file) => {
  const key = getManagedThumbnailKey(file);
  return key ? (thumbnailSourceByKey.value[key] || "") : "";
};

const setManagedThumbnailState = (cacheKey, state) => {
  if (!cacheKey) {
    return;
  }

  thumbnailStateByKey.value = {
    ...thumbnailStateByKey.value,
    [cacheKey]: state,
  };
};

const setManagedThumbnailSource = (cacheKey, sourceUrl) => {
  if (!cacheKey) {
    return;
  }

  thumbnailSourceByKey.value = {
    ...thumbnailSourceByKey.value,
    [cacheKey]: sourceUrl,
  };
};

const clearManagedThumbnailSource = (file) => {
  const cacheKey = getManagedThumbnailKey(file);
  if (!cacheKey || !thumbnailSourceByKey.value[cacheKey]) {
    return false;
  }

  const nextSources = { ...thumbnailSourceByKey.value };
  delete nextSources[cacheKey];
  thumbnailSourceByKey.value = nextSources;
  setManagedThumbnailState(cacheKey, "failed");
  return true;
};

const shouldUseManagedThumbnail = isCollectionManagedThumbnailCandidate;

const primeManagedThumbnails = async (files = []) => {
  const nextSourceMap = {};
  const nextStateMap = {};
  const candidates = [];

  for (const file of files) {
    if (!shouldUseManagedThumbnail(file)) {
      continue;
    }

    const cacheKey = getManagedThumbnailKey(file);
    if (!cacheKey) {
      continue;
    }

    const cachedUrl = getCachedFileThumbnailUrl(file);
    if (cachedUrl) {
      nextSourceMap[cacheKey] = cachedUrl;
      nextStateMap[cacheKey] = "ready";
      continue;
    }

    nextStateMap[cacheKey] = thumbnailStateByKey.value[cacheKey] === "failed" ? "failed" : "loading";
    candidates.push({ file, cacheKey });
  }

  thumbnailSourceByKey.value = nextSourceMap;
  thumbnailStateByKey.value = nextStateMap;

  await Promise.allSettled(candidates.map(async ({ file, cacheKey }) => {
    const objectUrl = await loadFileThumbnailUrl(file);
    if (objectUrl) {
      setManagedThumbnailSource(cacheKey, objectUrl);
      setManagedThumbnailState(cacheKey, "ready");
      return;
    }

    setManagedThumbnailState(cacheKey, "failed");
  }));
};

const markBrokenAsset = (stateRef, file) => {
  const fileId = String(file?.id || "");
  if (!fileId || stateRef.value.includes(fileId)) {
    return;
  }

  stateRef.value = [...stateRef.value, fileId];
};

const scheduleAssetRefresh = () => {
  if (refreshListTimerId) {
    return;
  }

  refreshListTimerId = window.setTimeout(async () => {
    refreshListTimerId = null;
    try {
      if (fileStore.driveHasLoaded && !fileStore.hasLoaded) {
        await fileStore.refreshDrivePage();
      } else {
        await fileStore.fetchFiles();
      }
    } catch {
    }
  }, 900);
};

const handlePreviewAssetError = (file) => {
  if (clearManagedThumbnailSource(file)) {
    return;
  }
  markBrokenAsset(brokenPreviewIds, file);
  scheduleAssetRefresh();
};

const handleThumbnailAssetError = (file) => {
  if (clearManagedThumbnailSource(file)) {
    return;
  }
  markBrokenAsset(brokenThumbnailIds, file);
  scheduleAssetRefresh();
};

const isLocked = isCollectionLocked;
const isImage = (file) => isCollectionImage(file, hasBrokenPreview(file));
const isVideo = isCollectionVideo;
const hasVideoThumbnail = (file) => {
  if (!isVideo(file) || hasBrokenThumbnail(file)) {
    return false;
  }

  const managedThumbnailUrl = getManagedThumbnailUrl(file);
  if (managedThumbnailUrl) {
    return true;
  }

  return getManagedThumbnailState(file) === "failed" && Boolean(getThumbnailUrl(file));
};
const getImageCardUrl = (file) => {
  const managedThumbnailUrl = getManagedThumbnailUrl(file);
  if (managedThumbnailUrl) {
    return managedThumbnailUrl;
  }

  return getManagedThumbnailState(file) === "failed"
    ? getPreviewUrl(file)
    : "";
};
const getVideoCardUrl = (file) => {
  const managedThumbnailUrl = getManagedThumbnailUrl(file);
  if (managedThumbnailUrl) {
    return managedThumbnailUrl;
  }

  return getManagedThumbnailState(file) === "failed"
    ? getThumbnailUrl(file)
    : "";
};
const resolveProtectedShareOptions = (file) => {
  if (!file?.sharedWithMe || !file?.passwordProtected) {
    return {};
  }
  const sharePassword = window.prompt("\uACF5\uC720 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
  if (sharePassword === null) {
    throw new Error("\uACF5\uC720 \uBE44\uBC00\uBC88\uD638\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.");
  }
  return { sharePassword };
};
const getActionAvailability = (file) => getCollectionActionAvailability(file, {
  sharedLibrary: props.sharedLibrary,
  deleteMode: props.deleteMode,
  canCreateShares: canCreateShares.value,
  canCreateLocks: canCreateLocks.value,
});
const canDownload = (file) => getActionAvailability(file).canDownload;
const isDownloading = (file) => downloadingIdSet.value.has(String(file?.id));

const handleDownload = async (file, event) => {
  event?.stopPropagation?.();
  if (isDownloading(file)) {
    return;
  }

  const fileId = String(file?.id || "");

  try {
    if (fileId) {
      downloadingIds.value = [...downloadingIds.value, fileId];
    }
    await downloadFileAsset(file, "file", resolveProtectedShareOptions(file));
  } catch (error) {
    window.alert(error?.message || "\uD30C\uC77C\uC744 \uB2E4\uC6B4\uB85C\uB4DC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  } finally {
    if (fileId) {
      downloadingIds.value = downloadingIds.value.filter((id) => id !== fileId);
    }
  }
};
const canDelete = (file) => getActionAvailability(file).canDelete;
const canRestore = (file) => getActionAvailability(file).canRestore;
const canManageFolder = (file) => getActionAvailability(file).canManageFolder;
const canShare = (file) => getActionAvailability(file).canShare;
const canToggleLock = (file) => getActionAvailability(file).canToggleLock;
const canSaveShared = (file) => getActionAvailability(file).canSaveShared;
const canManageSentShare = (file) => getActionAvailability(file).canManageSentShare;
const isMovable = (file) => getActionAvailability(file).isMovable;

watch(
  () => props.files,
  (files) => {
    void primeManagedThumbnails(files || []);
  },
  { immediate: true },
);
const isFolderDropTarget = (file) => canManageFolder(file);
const getDeleteConfirmMessage = (file) => getCollectionDeleteConfirmMessage(file, props.deleteMode);
const getStatusChips = getCollectionStatusChips;

watch(
  () => props.files,
  () => {
    brokenPreviewIds.value = [];
    brokenThumbnailIds.value = [];
  },
  { deep: true },
);

const updateSelectedIds = (ids) => {
  emit("update:selectedIds", ids.map((id) => String(id)));
};

const toggleFileSelection = (fileId, checked) => {
  const normalizedId = String(fileId);
  if (!normalizedId) {
    return;
  }

  if (checked) {
    if (!selectedIdSet.value.has(normalizedId)) {
      updateSelectedIds([...props.selectedIds, normalizedId]);
    }
    return;
  }

  updateSelectedIds(props.selectedIds.filter((id) => String(id) !== normalizedId));
};

const toggleSelectAllVisible = (checked) => {
  const visibleIdSet = new Set(visibleFileIds.value);

  if (checked) {
    updateSelectedIds([
      ...new Set([
        ...props.selectedIds.map((id) => String(id)),
        ...visibleFileIds.value,
      ]),
    ]);
    return;
  }

  updateSelectedIds(props.selectedIds.filter((id) => !visibleIdSet.has(String(id))));
};

const ensureUnlocked = (file) => {
  if (isLocked(file)) {
    window.alert("이 파일은 잠겨있습니다.");
    return false;
  }

  return true;
};

const handlePrimaryAction = (file) => {
  if (!file) {
    return;
  }

  if (file.type === "folder") {
    if (props.deleteMode !== "permanent" && !props.sharedLibrary) {
      fileStore.enterFolder(file.id);
    }
    return;
  }

  if (!ensureUnlocked(file)) {
    return;
  }

  emit("preview-file", file);
};

const onClickDelete = (file, event) => {
  event.stopPropagation();
  if (!canDelete(file)) {
    return;
  }


  if (window.confirm(getDeleteConfirmMessage(file))) {
    emit("delete-file", file?.id);
  }
};

const onClickRestore = (file, event) => {
  event.stopPropagation();
  if (!canRestore(file)) {
    return;
  }

  if (window.confirm(`'${getFileName(file)}' 항목을 원래 위치로 복구하시겠습니까?`)) {
    emit("restore-file", file?.id);
  }
};

const onClickRenameFolder = (file, event) => {
  event.stopPropagation();
  emit("rename-folder", file);
};

const onClickShowFolderProperties = (file, event) => {
  event.stopPropagation();
  emit("show-folder-properties", file);
};

const onClickShare = (file, event) => {
  event.stopPropagation();
  if (!ensureUnlocked(file)) {
    return;
  }
  emit("share-file", [file]);
};

const onClickManageSentShare = (file, event) => {
  event.stopPropagation();
  emit("share-file", [file]);
};

const onClickToggleLock = (file, event) => {
  event.stopPropagation();
  emit("toggle-lock", file);
};

const onClickSaveShared = (file, event) => {
  event.stopPropagation();
  if (!ensureUnlocked(file)) {
    return;
  }
  emit("save-to-drive", file);
};

const getDragFileIds = (file) => getCollectionDragFileIds(file, props.selectedIds);
const readDraggedFileIds = (event) => readCollectionDraggedFileIds(
  event?.dataTransfer?.getData("text/plain"),
  draggingFileIds.value,
);
const onDragStart = (event, file) => {
  if (!isMovable(file)) {
    event.preventDefault();
    return;
  }

  const fileIds = getDragFileIds(file);
  draggingFileIds.value = fileIds;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", JSON.stringify({ fileIds }));
};

const onDragEnd = () => {
  draggingFileIds.value = [];
  dragTargetId.value = null;
};

const onDragOverFolder = (event, folder) => {
  if (!isFolderDropTarget(folder)) {
    return;
  }

  const draggedFileIds = readDraggedFileIds(event)
    .filter((id) => String(id) !== String(folder.id));
  if (!draggedFileIds.length) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  dragTargetId.value = folder.id;
};

const onDragLeaveFolder = (folder) => {
  if (String(dragTargetId.value) === String(folder?.id)) {
    dragTargetId.value = null;
  }
};

const onDropToFolder = async (event, folder) => {
  if (!isFolderDropTarget(folder)) {
    return;
  }

  event.preventDefault();
  const draggedFileIds = readDraggedFileIds(event)
    .filter((id) => String(id) !== String(folder.id));
  dragTargetId.value = null;
  draggingFileIds.value = [];
  if (!draggedFileIds.length) {
    return;
  }

  try {
    if (draggedFileIds.length === 1) {
      await fileStore.moveFileToFolder(draggedFileIds[0], folder.id);
    } else {
      await fileStore.moveFilesToFolder(draggedFileIds, folder.id);
    }

    updateSelectedIds(props.selectedIds.filter((id) => !draggedFileIds.includes(String(id))));
  } catch (error) {
    window.alert(
      error?.response?.data?.message ||
      error?.message ||
      "폴더로 이동하지 못했습니다.",
    );
  }
};

const onDragOverParentNavigator = (event) => {
  if (!props.showParentNavigator || props.deleteMode === "permanent" || props.sharedLibrary) {
    return;
  }

  const draggedFileIds = readDraggedFileIds(event);
  if (!draggedFileIds.length) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  dragTargetId.value = "__parent__";
};

const onDragLeaveParentNavigator = () => {
  if (dragTargetId.value === "__parent__") {
    dragTargetId.value = null;
  }
};

const onDropToParentNavigator = async (event) => {
  if (!props.showParentNavigator || props.deleteMode === "permanent" || props.sharedLibrary) {
    return;
  }

  event.preventDefault();
  const draggedFileIds = readDraggedFileIds(event);
  dragTargetId.value = null;
  draggingFileIds.value = [];
  if (!draggedFileIds.length) {
    return;
  }

  try {
    if (draggedFileIds.length === 1) {
      await fileStore.moveFileToFolder(draggedFileIds[0], props.parentFolderTargetId);
    } else {
      await fileStore.moveFilesToFolder(draggedFileIds, props.parentFolderTargetId);
    }

    updateSelectedIds(props.selectedIds.filter((id) => !draggedFileIds.includes(String(id))));
  } catch (error) {
    window.alert(
      error?.response?.data?.message ||
      error?.message ||
      "상위 폴더로 이동하지 못했습니다.",
    );
  }
};
provide(FILE_COLLECTION_CONTEXT_KEY, {
  files: computed(() => props.files),
  showParentNavigator: computed(() => props.showParentNavigator),
  deleteMode: computed(() => props.deleteMode),
  selectedIdSet,
  fileStore,
  canSelect,
  showActions,
  viewMode,
  gridClassName,
  collectionStyle,
  dragTargetId,
  formatDisplaySize,
  getFileName,
  getFileExtension,
  getUpdatedAt,
  getSharedSourceLabel,
  getSentShareLabel,
  getImageCardUrl,
  getVideoCardUrl,
  getStatusChips,
  isImage,
  isVideo,
  hasVideoThumbnail,
  isMovable,
  canDownload,
  canSaveShared,
  canShare,
  canManageSentShare,
  canToggleLock,
  canManageFolder,
  canRestore,
  canDelete,
  isDownloading,
  toggleFileSelection,
  handlePrimaryAction,
  handlePreviewAssetError,
  handleThumbnailAssetError,
  handleDownload,
  onClickSaveShared,
  onClickShare,
  onClickManageSentShare,
  onClickToggleLock,
  onClickRenameFolder,
  onClickShowFolderProperties,
  onClickRestore,
  onClickDelete,
  onDragStart,
  onDragEnd,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropToFolder,
  onDragOverParentNavigator,
  onDragLeaveParentNavigator,
  onDropToParentNavigator,
});
</script>

<template>
  <div class="file-collection-shell">
    <div
      v-if="canSelect"
      class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
    >
      <label class="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
        <input
          type="checkbox"
          class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          :checked="allVisibleSelected"
          @change="toggleSelectAllVisible($event.target.checked)"
        />
        현재 페이지 전체 선택
      </label>

      <p class="text-xs text-gray-500">
        체크한 파일과 폴더는 상단 일괄 작업에서 함께 처리됩니다.
      </p>
    </div>

    <FileCollectionTable v-if="viewMode === 'table'" />
    <FileCollectionGrid v-else />
  </div>
</template>
