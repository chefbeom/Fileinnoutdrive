<script setup>
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useFileStore } from "@/stores/useFileStore.js";
import { useMediaPhotoStore } from "@/stores/useMediaPhotoStore.js";
import { useSecretFolderStore } from "@/stores/useSecretFolderStore.js";
import { useViewStore } from "@/stores/viewStore.js";
import FileCollectionGrid from "./FileCollectionGrid.vue";
import FileCollectionTable from "./FileCollectionTable.vue";
import { FILE_COLLECTION_CONTEXT_KEY } from "./FileCollectionContext.js";
import { downloadFileAsset } from "@/api/filesApi.js";
import {
  INTERNAL_DRAG_MIME,
  extractDropItems,
  isDesktopDragEvent,
  triggerDesktopUpload,
} from "@/utils/desktopDropUpload.js";
import {
  getCachedFileThumbnailUrl,
  getFileThumbnailCacheKey,
  loadFileThumbnailUrl,
} from "@/utils/fileThumbnailCache.js";
import {
  buildCollectionStyle,
  computeRangeSelectionIds,
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
  isCollectionSharedFolder,
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
  "share-download-link",
  "toggle-lock",
  "move-to-vault",
  "open-vault-import",
  "save-to-drive",
]);

const router = useRouter();
const fileStore = useFileStore();
const mediaPhotoStore = useMediaPhotoStore();
const secretFolderStore = useSecretFolderStore();
const { viewMode, itemSize, resolvedLayoutColumns } = useViewStore();
const isInsideSecretArea = computed(() => (
  Boolean(
    secretFolderStore.vaultMode ||
    fileStore.currentFolder?.hiddenFolder ||
    fileStore.currentFolder?.isVaultSpace ||
    (fileStore.currentFolderPath || []).some((folder) => Boolean(folder?.hiddenFolder || folder?.isVaultSpace)),
  )
));
const brokenPreviewIds = ref([]);
const brokenThumbnailIds = ref([]);
const thumbnailSourceByKey = ref({});
const thumbnailStateByKey = ref({});
const dragTargetId = ref(null);
const draggingFileIds = ref([]);
const downloadingIds = ref([]);
const lastSelectedAnchorId = ref(null);
let refreshListTimerId = null;
let thumbnailAbortController = null;
const planCapabilities = computed(() => fileStore.planCapabilities);
const canCreateShares = computed(() => Boolean(planCapabilities.value?.shareEnabled));
const canCreateLocks = computed(() => Boolean(planCapabilities.value?.fileLockEnabled));

const clearRefreshTimer = () => {
  if (refreshListTimerId) {
    window.clearTimeout(refreshListTimerId);
    refreshListTimerId = null;
  }
};

const abortManagedThumbnails = () => {
  if (thumbnailAbortController) {
    thumbnailAbortController.abort();
    thumbnailAbortController = null;
  }
};

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
const collectionStyle = computed(() => buildCollectionStyle(viewMode.value, resolvedLayoutColumns.value, itemSize.value));

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
  abortManagedThumbnails();
  const controller = new AbortController();
  thumbnailAbortController = controller;

  const nextSourceMap = { ...thumbnailSourceByKey.value };
  const nextStateMap = { ...thumbnailStateByKey.value };
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

    if (nextSourceMap[cacheKey]) {
      nextStateMap[cacheKey] = "ready";
      continue;
    }

    if (getThumbnailUrl(file) && !hasBrokenThumbnail(file)) {
      nextStateMap[cacheKey] = "ready";
      continue;
    }

    nextStateMap[cacheKey] = thumbnailStateByKey.value[cacheKey] === "failed" ? "failed" : "loading";
    candidates.push({ file, cacheKey });
  }

  thumbnailSourceByKey.value = nextSourceMap;
  thumbnailStateByKey.value = nextStateMap;

  await Promise.allSettled(candidates.map(async ({ file, cacheKey }, index) => {
    if (controller.signal.aborted) {
      return;
    }

    const objectUrl = await loadFileThumbnailUrl(file, {
      signal: controller.signal,
      priority: index < 24 ? "high" : "normal",
    });
    if (controller.signal.aborted) {
      return;
    }

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

  const scheduledFolderId = fileStore.currentFolderId ?? null;
  refreshListTimerId = window.setTimeout(async () => {
    refreshListTimerId = null;
    if ((fileStore.currentFolderId ?? null) !== scheduledFolderId) {
      return;
    }
    try {
      if (fileStore.driveHasLoaded && !fileStore.hasLoaded) {
        await fileStore.refreshDrivePage();
      } else {
        await fileStore.fetchFiles({ background: true });
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
  const cacheKey = getManagedThumbnailKey(file);
  if (cacheKey && shouldUseManagedThumbnail(file)) {
    void loadFileThumbnailUrl(file).then((objectUrl) => {
      if (objectUrl) {
        setManagedThumbnailSource(cacheKey, objectUrl);
        setManagedThumbnailState(cacheKey, "ready");
      }
    });
  }
  scheduleAssetRefresh();
};

const isLocked = isCollectionLocked;
const isImage = (file) => isCollectionImage(file, hasBrokenPreview(file));
const isVideo = isCollectionVideo;
const getVideoCardUrl = (file) => {
  const managedThumbnailUrl = getManagedThumbnailUrl(file);
  if (managedThumbnailUrl) {
    return managedThumbnailUrl;
  }

  if (!hasBrokenThumbnail(file)) {
    const directThumbnailUrl = getThumbnailUrl(file);
    if (directThumbnailUrl) {
      return directThumbnailUrl;
    }
  }

  return "";
};
const hasVideoThumbnail = (file) => isVideo(file) && Boolean(getVideoCardUrl(file));
const getVideoPreviewStreamUrl = (file) => {
  if (!isVideo(file) || hasBrokenPreview(file)) {
    return "";
  }
  return getPreviewUrl(file) || "";
};
const getImageCardUrl = (file) => {
  const managedThumbnailUrl = getManagedThumbnailUrl(file);
  if (managedThumbnailUrl) {
    return managedThumbnailUrl;
  }

  if (!hasBrokenThumbnail(file)) {
    const directThumbnailUrl = getThumbnailUrl(file);
    if (directThumbnailUrl) {
      return directThumbnailUrl;
    }
  }

  if (!hasBrokenPreview(file)) {
    return getPreviewUrl(file);
  }

  return "";
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
  vaultMode: secretFolderStore.vaultMode,
  hiddenContext: (fileStore.currentFolderPath || []).some((folder) => Boolean(folder?.hiddenFolder)),
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
    fileStore.recordFileAccess?.(file);
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
const canConfigureSecret = (file) => getActionAvailability(file).canConfigureSecret;
const canMoveToVault = (file) => getActionAvailability(file).canMoveToVault;
const canShare = (file) => getActionAvailability(file).canShare;
const canShareDownloadLink = (file) => getActionAvailability(file).canShareDownloadLink;
const canToggleLock = (file) => getActionAvailability(file).canToggleLock;
const canSaveShared = (file) => getActionAvailability(file).canSaveShared;
const canManageSentShare = (file) => getActionAvailability(file).canManageSentShare;
const isMovable = (file) => getActionAvailability(file).isMovable;

watch(
  () => props.files,
  (files) => {
    clearRefreshTimer();
    brokenPreviewIds.value = [];
    brokenThumbnailIds.value = [];
    void primeManagedThumbnails(files || []);
  },
  { immediate: true },
);

watch(
  () => fileStore.currentFolderId,
  () => {
    clearRefreshTimer();
    abortManagedThumbnails();
    lastSelectedAnchorId.value = null;
  },
);

onBeforeUnmount(() => {
  clearRefreshTimer();
  abortManagedThumbnails();
  window.removeEventListener("click", closeContextMenu);
  window.removeEventListener("scroll", closeContextMenu, true);
  window.removeEventListener("resize", closeContextMenu);
  window.removeEventListener("keydown", handleContextKeydown);
});

const isFolderDropTarget = (file) => canManageFolder(file);
const getDeleteConfirmMessage = (file) => getCollectionDeleteConfirmMessage(file, props.deleteMode);
const getStatusChips = getCollectionStatusChips;

const updateSelectedIds = (ids) => {
  emit("update:selectedIds", ids.map((id) => String(id)));
};

const resolveSelectionAnchorId = (fallbackId = null) => {
  if (lastSelectedAnchorId.value !== null && lastSelectedAnchorId.value !== "") {
    return String(lastSelectedAnchorId.value);
  }
  if (props.selectedIds.length > 0) {
    return String(props.selectedIds[props.selectedIds.length - 1]);
  }
  return fallbackId != null ? String(fallbackId) : null;
};

const toggleFileSelection = (fileId, checked, event = null) => {
  const normalizedId = String(fileId ?? "");
  if (!normalizedId) {
    return;
  }

  const shouldSelect = typeof checked === "boolean"
    ? checked
    : !selectedIdSet.value.has(normalizedId);

  if (event?.shiftKey) {
    const anchorId = resolveSelectionAnchorId(normalizedId);
    const nextIds = computeRangeSelectionIds(
      props.files,
      props.selectedIds,
      anchorId,
      normalizedId,
      true,
    );
    updateSelectedIds(nextIds);
    if (!lastSelectedAnchorId.value && anchorId) {
      lastSelectedAnchorId.value = anchorId;
    }
    return;
  }

  lastSelectedAnchorId.value = normalizedId;

  if (shouldSelect) {
    if (!selectedIdSet.value.has(normalizedId)) {
      updateSelectedIds([...props.selectedIds, normalizedId]);
    }
    return;
  }

  updateSelectedIds(props.selectedIds.filter((id) => String(id) !== normalizedId));
};

const handleItemClick = (file, event = null) => {
  if (!file) {
    return;
  }

  const normalizedId = String(file.id ?? file.idx ?? "");

  if (event?.shiftKey && canSelect.value && normalizedId) {
    event.preventDefault?.();
    const anchorId = resolveSelectionAnchorId(normalizedId);
    const nextIds = computeRangeSelectionIds(
      props.files,
      props.selectedIds,
      anchorId,
      normalizedId,
      true,
    );
    updateSelectedIds(nextIds);
    if (!lastSelectedAnchorId.value && anchorId) {
      lastSelectedAnchorId.value = anchorId;
    }
    return;
  }

  if ((event?.ctrlKey || event?.metaKey) && canSelect.value && normalizedId) {
    event.preventDefault?.();
    toggleFileSelection(normalizedId, !selectedIdSet.value.has(normalizedId));
    return;
  }

  if (viewMode.value === "icon") {
    if (typeof window !== "undefined" && window.innerWidth <= 768) {
      if (normalizedId) {
        lastSelectedAnchorId.value = normalizedId;
      }
      handlePrimaryAction(file);
      return;
    }
    toggleFileSelection(normalizedId, !selectedIdSet.value.has(normalizedId), event);
    return;
  }

  if (normalizedId) {
    lastSelectedAnchorId.value = normalizedId;
  }
  handlePrimaryAction(file);
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

const onClickShareDownloadLink = (file, event) => {
  event.stopPropagation();
  if (!ensureUnlocked(file)) {
    return;
  }
  emit("share-download-link", file);
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
const canUpload = computed(() => props.deleteMode !== "permanent" && !props.sharedLibrary);
let dragEnterCounter = 0;
const isDesktopDragging = ref(false);

const currentTargetFolderName = computed(() => {
  if (dragTargetId.value === "__parent__") {
    return "상위 폴더";
  }
  if (dragTargetId.value != null) {
    const folder = props.files.find((f) => String(f.id) === String(dragTargetId.value));
    return folder ? getFileName(folder) : "";
  }
  return fileStore.currentFolder?.fileOriginName || fileStore.currentFolder?.name || "현재 위치";
});

const onGeneralDragEnter = (event) => {
  if (!isDesktopDragEvent(event) || !canUpload.value) {
    return;
  }
  dragEnterCounter += 1;
  isDesktopDragging.value = true;
};

const onGeneralDragOver = (event) => {
  if (!isDesktopDragEvent(event) || !canUpload.value) {
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
};

const onGeneralDragLeave = (event) => {
  if (!isDesktopDragEvent(event) || !canUpload.value) {
    return;
  }
  dragEnterCounter = Math.max(0, dragEnterCounter - 1);
  if (dragEnterCounter === 0) {
    isDesktopDragging.value = false;
    dragTargetId.value = null;
  }
};

const onGeneralDrop = async (event) => {
  if (!isDesktopDragEvent(event) || !canUpload.value) {
    return;
  }
  event.preventDefault();
  dragEnterCounter = 0;
  isDesktopDragging.value = false;
  dragTargetId.value = null;

  const { files, emptyDirectories } = await extractDropItems(event.dataTransfer);
  triggerDesktopUpload(files, fileStore.currentFolderId, emptyDirectories);
};

const onDragStart = (event, file) => {
  if (!isMovable(file)) {
    event.preventDefault();
    return;
  }

  const fileIds = getDragFileIds(file);
  draggingFileIds.value = fileIds;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(INTERNAL_DRAG_MIME, JSON.stringify({ fileIds }));
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

  if (isDesktopDragEvent(event)) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    dragTargetId.value = folder.id;
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

  if (isDesktopDragEvent(event)) {
    event.preventDefault();
    event.stopPropagation();
    dragTargetId.value = null;
    isDesktopDragging.value = false;
    dragEnterCounter = 0;

    const { files, emptyDirectories } = await extractDropItems(event.dataTransfer);
    triggerDesktopUpload(files, folder.id, emptyDirectories);
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

  if (isDesktopDragEvent(event)) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    dragTargetId.value = "__parent__";
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

  if (isDesktopDragEvent(event)) {
    event.preventDefault();
    event.stopPropagation();
    dragTargetId.value = null;
    isDesktopDragging.value = false;
    dragEnterCounter = 0;

    const { files, emptyDirectories } = await extractDropItems(event.dataTransfer);
    triggerDesktopUpload(files, props.parentFolderTargetId, emptyDirectories);
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
const isSharedFolder = isCollectionSharedFolder;
const resolvedCurrentFolderForSecret = computed(() => {
  if (secretFolderStore.vaultMode || props.sharedLibrary || props.deleteMode === "permanent") {
    return null;
  }
  const current = fileStore.currentFolder;
  if (!current || current.id == null) {
    return null;
  }
  const enriched =
    fileStore.allFiles?.find?.((item) => String(item?.id) === String(current.id)) ||
    current;
  if ((fileStore.currentFolderPath || []).some((segment) => isSharedFolder(segment))) {
    return null;
  }
  return canConfigureSecret(enriched) ? enriched : null;
});
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  target: null,
});
const contextFileUploadInputRef = ref(null);
const contextFolderUploadInputRef = ref(null);
const contextUploadParentId = ref(null);

const closeContextMenu = () => {
  if (contextMenu.value.visible) {
    contextMenu.value = {
      ...contextMenu.value,
      visible: false,
      target: null,
    };
  }
};

const clampMenuPosition = (clientX, clientY, estimatedHeight = 320) => {
  const menuWidth = 248;
  const maxX = Math.max(16, (window.innerWidth || 1024) - menuWidth - 16);
  const maxY = Math.max(16, (window.innerHeight || 768) - estimatedHeight - 16);
  return {
    x: Math.min(Math.max(12, clientX), maxX),
    y: Math.min(Math.max(12, clientY), maxY),
  };
};

const onContextMenuItem = (event, file) => {
  if (!file) {
    return;
  }
  const pos = clampMenuPosition(event?.clientX || 0, event?.clientY || 0, 360);
  contextMenu.value = {
    visible: true,
    x: pos.x,
    y: pos.y,
    target: file,
  };
};

const onContextMenuBackground = (event) => {
  const pos = clampMenuPosition(event?.clientX || 0, event?.clientY || 0, 300);
  contextMenu.value = {
    visible: true,
    x: pos.x,
    y: pos.y,
    target: null,
  };
};

const handleContextKeydown = (event) => {
  if (event?.key === "Escape") {
    closeContextMenu();
  }
};

onMounted(() => {
  window.addEventListener("click", closeContextMenu);
  window.addEventListener("scroll", closeContextMenu, true);
  window.addEventListener("resize", closeContextMenu);
  window.addEventListener("keydown", handleContextKeydown);
});

const handleContextOpenItem = () => {
  const target = contextMenu.value.target;
  closeContextMenu();
  if (target) {
    handlePrimaryAction(target);
  }
};

const canGoToContainingFolder = (target) => {
  if (!target || props.sharedLibrary || props.deleteMode === "permanent") {
    return false;
  }
  const targetParentId = target.parentId ?? null;
  const currentId = fileStore.currentFolderId ?? null;
  return String(targetParentId ?? "") !== String(currentId ?? "");
};

const handleContextGoToContainingFolder = (target) => {
  closeContextMenu();
  if (!target) {
    return;
  }
  fileStore.enterFolder(target.parentId ?? null);
};

const handleContextCreateFolder = async (targetParentId = fileStore.currentFolderId) => {
  closeContextMenu();
  const folderName = window.prompt("새 폴더 이름을 입력해 주세요.");
  if (!folderName?.trim()) {
    return;
  }
  try {
    await fileStore.createFolder(folderName.trim(), targetParentId ?? null);
  } catch (error) {
    window.alert(
      error?.response?.data?.message ||
      error?.message ||
      "폴더를 생성하지 못했습니다.",
    );
  }
};

const handleContextCreateSharedFolder = (targetParentId = fileStore.currentFolderId) => {
  closeContextMenu();
  window.dispatchEvent(
    new CustomEvent("open-storage-share-modal", {
      detail: {
        page: "create-space",
        targetParentId: targetParentId ?? null,
      },
    }),
  );
};

const handleContextCreateHiddenFolder = async (targetParentId = fileStore.currentFolderId) => {
  closeContextMenu();
  const created = await secretFolderStore.openCreateHiddenFolderDialog(targetParentId ?? null);
  if (created) {
    fileStore.invalidateFolderSnapshots?.();
    await Promise.all([
      fileStore.refreshDrivePage().catch(() => {}),
      fileStore.fetchFiles({ background: true }).catch(() => {}),
    ]);
  }
};

const handleContextConfigureHiddenFolder = async (target) => {
  closeContextMenu();
  if (!target) {
    return;
  }
  const isCurrentFolderTarget =
    fileStore.currentFolderId != null &&
    String(target.id ?? target.idx) === String(fileStore.currentFolderId);
  const saved = await secretFolderStore.openConfigureHiddenFolderDialog(target);
  if (saved) {
    fileStore.invalidateFolderSnapshots?.();
    if (isCurrentFolderTarget && saved.hidden && !secretFolderStore.showHiddenFolders) {
      fileStore.navigateToFolder(target.parentId ?? null);
    }
    await Promise.all([
      fileStore.refreshDrivePage?.().catch(() => {}),
      fileStore.fetchFiles?.({ background: true }).catch(() => {}),
    ]);
  }
};

const handleContextMoveToVault = (target) => {
  closeContextMenu();
  if (target) {
    emit("move-to-vault", target);
  }
};

const handleContextOpenVaultImport = (targetFolderId = fileStore.currentFolderId ?? null, targetFolderName = "") => {
  closeContextMenu();
  emit("open-vault-import", {
    targetFolderId: targetFolderId ?? null,
    targetFolderName: targetFolderName || "",
  });
};

const handleContextOpenSharedStorageSettings = (folder) => {
  const storageIdx = folder?.sharedStorageIdx || null;
  closeContextMenu();
  window.dispatchEvent(
    new CustomEvent("open-storage-share-modal", {
      detail: {
        page: "spaces",
        storageIdx,
        showDetailSettings: true,
      },
    }),
  );
};

const handleContextRename = (target) => {
  closeContextMenu();
  if (target) {
    emit("rename-folder", target);
  }
};

const handleContextProperties = (target) => {
  closeContextMenu();
  if (target) {
    emit("show-folder-properties", target);
  }
};

const handleContextShare = (target, event) => {
  closeContextMenu();
  if (target) {
    onClickShare(target, event || { stopPropagation() {} });
  }
};

const handleContextShareDownloadLink = (target, event) => {
  closeContextMenu();
  if (target) {
    onClickShareDownloadLink(target, event || { stopPropagation() {} });
  }
};

const handleContextDownload = (target, event) => {
  closeContextMenu();
  if (target) {
    void handleDownload(target, event || { stopPropagation() {} });
  }
};

const handleContextToggleLock = (target, event) => {
  closeContextMenu();
  if (target) {
    onClickToggleLock(target, event || { stopPropagation() {} });
  }
};

const handleContextSaveShared = (target, event) => {
  closeContextMenu();
  if (target) {
    onClickSaveShared(target, event || { stopPropagation() {} });
  }
};

const handleContextRestore = (target, event) => {
  closeContextMenu();
  if (target) {
    onClickRestore(target, event || { stopPropagation() {} });
  }
};

const handleContextToggleSelect = (target) => {
  closeContextMenu();
  if (target?.id != null) {
    toggleFileSelection(target.id);
  }
};

const handleContextDelete = (target, event) => {
  closeContextMenu();
  if (target) {
    onClickDelete(target, event || { stopPropagation() {} });
  }
};

const handleContextTriggerFileUpload = (targetParentId = fileStore.currentFolderId) => {
  contextUploadParentId.value = targetParentId ?? null;
  closeContextMenu();
  contextFileUploadInputRef.value?.click();
};

const handleContextTriggerFolderUpload = (targetParentId = fileStore.currentFolderId) => {
  contextUploadParentId.value = targetParentId ?? null;
  closeContextMenu();
  contextFolderUploadInputRef.value?.click();
};

const onContextUploadInputChange = (event) => {
  const selected = Array.from(event?.target?.files || []);
  if (selected.length > 0) {
    triggerDesktopUpload(selected, contextUploadParentId.value ?? fileStore.currentFolderId, []);
  }
  if (event?.target) {
    event.target.value = "";
  }
};

const handleContextRefresh = async () => {
  closeContextMenu();
  try {
    if (fileStore.driveHasLoaded) {
      await fileStore.refreshDrivePage();
    }
    await fileStore.fetchFiles({ background: fileStore.driveHasLoaded });
  } catch {
  }
};

const handleContextGoParent = () => {
  closeContextMenu();
  fileStore.navigateToFolder(props.parentFolderTargetId ?? null);
};

const handleContextCreatePhotoAlbumFromFolder = async (folder) => {
  closeContextMenu();
  if (!folder) return;
  const created = await mediaPhotoStore.createPhotoAlbumFromFolder(folder);
  if (created) {
    if (window.confirm(`'${created.name}' 사진 앨범(${created.photoIds.length}장)이 생성되었습니다. 지금 사진첩에서 확인하시겠습니까?`)) {
      router.push({ name: "photos", query: { tab: "albums" } });
    }
  }
};

const handleContextCreateMediaCollectionFromFolder = async (folder) => {
  closeContextMenu();
  if (!folder) return;
  const created = await mediaPhotoStore.createMediaCollectionFromFolder(folder);
  if (created) {
    if (window.confirm(`'${created.name}' 미디어 컬렉션(${created.itemIds.length}개 항목)이 생성되었습니다. 지금 미디어 화면에서 확인하시겠습니까?`)) {
      router.push({ name: "media", query: { section: "collections" } });
    }
  }
};

const handleContextOpenInMediaTheater = (target) => {
  closeContextMenu();
  if (!target || !ensureUnlocked(target)) return;
  mediaPhotoStore.openTheater(target.id);
};

const handleContextOpenInPhotoLightbox = (target) => {
  closeContextMenu();
  if (!target || !ensureUnlocked(target)) return;
  mediaPhotoStore.openPhotoLightbox(target.id);
};

const isFolderIncludedInMedia = (folder) => {
  if (!folder) return false;
  const key = String(folder.id);
  if (mediaPhotoStore.preferences?.mediaSourceMode === "all") {
    return !(mediaPhotoStore.mediaExcludedFolderIds || []).includes(key);
  }
  return (mediaPhotoStore.mediaIncludedFolderIds || []).includes(key);
};

const isFolderIncludedInPhotos = (folder) => {
  if (!folder) return false;
  const key = String(folder.id);
  if (mediaPhotoStore.preferences?.photoSourceMode === "all") {
    return !(mediaPhotoStore.photoExcludedFolderIds || []).includes(key);
  }
  return (mediaPhotoStore.photoIncludedFolderIds || []).includes(key);
};

const handleContextToggleFolderInMedia = (folder) => {
  closeContextMenu();
  if (!folder) return;
  if (mediaPhotoStore.preferences?.mediaSourceMode === "all") {
    mediaPhotoStore.toggleMediaFolderExclusion?.(folder.id);
    return;
  }
  mediaPhotoStore.toggleMediaFolderInclusion(folder.id);
};

const handleContextToggleFolderInPhotos = (folder) => {
  closeContextMenu();
  if (!folder) return;
  if (mediaPhotoStore.preferences?.photoSourceMode === "all") {
    mediaPhotoStore.togglePhotoFolderExclusion?.(folder.id);
    return;
  }
  mediaPhotoStore.togglePhotoFolderInclusion(folder.id);
};

const isFileIncludedInMedia = (file) => {
  if (!file) return false;
  const key = String(file.id);
  if (mediaPhotoStore.isVideoExcludedFromMedia?.(file)) {
    return false;
  }
  if (mediaPhotoStore.preferences?.mediaSourceMode === "all") {
    return true;
  }
  if (mediaPhotoStore.videoById?.has?.(key)) {
    return true;
  }
  return (mediaPhotoStore.mediaIncludedFileIds || []).includes(key);
};

const isFileIncludedInPhotos = (file) => {
  if (!file) return false;
  const key = String(file.id);
  if (mediaPhotoStore.isPhotoExcludedFromPhotos?.(file)) {
    return false;
  }
  if (mediaPhotoStore.preferences?.photoSourceMode === "all") {
    return true;
  }
  if (mediaPhotoStore.photoById?.has?.(key)) {
    return true;
  }
  return (mediaPhotoStore.photoIncludedFileIds || []).includes(key);
};

const handleContextToggleFileInMedia = (file) => {
  closeContextMenu();
  if (!file) return;
  const key = String(file.id);
  if (isFileIncludedInMedia(file)) {
    (mediaPhotoStore.excludeMediaFiles || mediaPhotoStore.removeMediaFiles)([key]);
  } else {
    mediaPhotoStore.addMediaFiles([key]);
  }
};

const handleContextToggleFileInPhotos = (file) => {
  closeContextMenu();
  if (!file) return;
  const key = String(file.id);
  if (isFileIncludedInPhotos(file)) {
    (mediaPhotoStore.excludePhotoFiles || mediaPhotoStore.removePhotoFiles)([key]);
  } else {
    mediaPhotoStore.addPhotoFiles([key]);
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
  itemSize,
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
  getVideoPreviewStreamUrl,
  getStatusChips,
  isImage,
  isVideo,
  isSharedFolder,
  hasVideoThumbnail,
  isMovable,
  canDownload,
  canSaveShared,
  canShare,
  canShareDownloadLink,
  canManageSentShare,
  canToggleLock,
  canMoveToVault,
  canManageFolder,
  canRestore,
  canDelete,
  isDownloading,
  toggleFileSelection,
  handlePrimaryAction,
  handleItemClick,
  handlePreviewAssetError,
  handleThumbnailAssetError,
  handleDownload,
  onClickSaveShared,
  onClickShare,
  onClickShareDownloadLink,
  onClickManageSentShare,
  onClickToggleLock,
  onClickRenameFolder,
  onClickShowFolderProperties,
  onClickRestore,
  onClickDelete,
  onContextMenuItem,
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
  <div
    class="file-collection-shell relative"
    @contextmenu.prevent="onContextMenuBackground($event)"
    @dragenter="onGeneralDragEnter"
    @dragover="onGeneralDragOver"
    @dragleave="onGeneralDragLeave"
    @drop="onGeneralDrop"
  >
    <input
      ref="contextFileUploadInputRef"
      type="file"
      multiple
      class="hidden"
      @change="onContextUploadInputChange"
    />
    <input
      ref="contextFolderUploadInputRef"
      type="file"
      webkitdirectory
      directory
      multiple
      class="hidden"
      @change="onContextUploadInputChange"
    />
    <div
      v-if="isDesktopDragging"
      class="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-500 bg-blue-500/10 backdrop-blur-[2px] transition-all"
    >
      <div class="flex flex-col items-center gap-2 rounded-2xl bg-white/95 px-8 py-5 shadow-xl ring-1 ring-blue-500/30">
        <div class="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <svg class="h-8 w-8 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <p class="text-base font-bold text-gray-800">
          {{ currentTargetFolderName ? `'${currentTargetFolderName}' 폴더로 업로드` : '현재 위치에 업로드' }}
        </p>
        <p class="text-xs text-gray-500">
          파일 또는 폴더를 놓으면 업로드가 바로 진행됩니다.
        </p>
      </div>
    </div>
    <div
      v-if="canSelect"
      class="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5 shadow-sm sm:px-4 sm:py-3"
    >
      <label class="inline-flex items-center gap-2 text-xs font-semibold text-gray-700 sm:text-sm">
        <input
          type="checkbox"
          class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          :checked="allVisibleSelected"
          @change="toggleSelectAllVisible($event.target.checked)"
        />
        현재 페이지 전체 선택
      </label>

      <button
        v-if="canUpload"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600 sm:hidden dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300"
        @click.stop="onContextMenuBackground($event)"
      >
        <i class="fa-solid fa-plus text-[10px]"></i>
        <span>폴더 · 업로드</span>
      </button>

      <p class="hidden text-xs text-gray-500 sm:block">
        {{ viewMode === "icon" ? "클릭 선택 · 더블클릭 열기 · Shift 구간 선택" : "Shift 구간 · Ctrl 다중 선택" }}
      </p>
    </div>

    <FileCollectionTable v-if="viewMode === 'table'" :class="`size--${itemSize}`" />
    <FileCollectionGrid v-else :class="`size--${itemSize}`" />

    <!-- 우클릭 컨텍스트 메뉴 (폴더 / 파일 / 빈 화면) -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="fixed inset-0 z-[255] bg-slate-950/35 backdrop-blur-[1px] sm:hidden"
        @click="closeContextMenu"
      ></div>
      <div
        v-if="contextMenu.visible"
        class="fixed z-[260] w-60 overflow-hidden rounded-2xl border border-gray-200 bg-white py-1.5 shadow-2xl max-sm:!bottom-4 max-sm:!left-3 max-sm:!right-3 max-sm:!top-auto max-sm:!w-auto max-sm:max-h-[78vh] max-sm:overflow-y-auto max-sm:rounded-3xl max-sm:py-2.5 dark:border-slate-700 dark:bg-slate-900"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        @click.stop
        @contextmenu.prevent.stop
      >
        <!-- [1] 폴더 우클릭 메뉴 -->
        <template v-if="contextMenu.target && contextMenu.target.type === 'folder'">
          <div class="flex items-center gap-2.5 border-b border-gray-100 px-3.5 py-2 dark:border-slate-800">
            <div class="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100/80 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              <i class="fa-solid fa-folder text-xs"></i>
              <span
                v-if="isSharedFolder(contextMenu.target)"
                class="-right-1 -bottom-1 absolute flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-600 text-[8px] text-white"
              >
                <i class="fa-solid fa-share-nodes"></i>
              </span>
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-black text-gray-900 dark:text-slate-100">
                {{ getFileName(contextMenu.target) }}
              </p>
              <p class="text-[10px] font-semibold text-gray-500 dark:text-slate-400">
                {{
                  contextMenu.target.hiddenFolder
                    ? (contextMenu.target.pinEnabled ? "숨긴 폴더 · PIN 보호" : "숨긴 폴더")
                    : (isSharedFolder(contextMenu.target) ? "공유 폴더" : "일반 폴더")
                }}
              </p>
            </div>
          </div>

          <button
            v-if="deleteMode !== 'permanent'"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextOpenItem"
          >
            <i class="fa-regular fa-folder-open w-4 text-center text-blue-500"></i>
            <span>폴더 열기</span>
          </button>

          <button
            v-if="canGoToContainingFolder(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-slate-800"
            @click="handleContextGoToContainingFolder(contextMenu.target)"
          >
            <i class="fa-solid fa-location-crosshairs w-4 text-center text-indigo-500"></i>
            <span>상위 위치로 이동</span>
          </button>

          <button
            v-if="canManageFolder(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextCreateFolder(contextMenu.target.id)"
          >
            <i class="fa-solid fa-folder-plus w-4 text-center text-amber-500"></i>
            <span>이 폴더 안에 새 폴더 만들기</span>
          </button>

          <button
            v-if="canManageFolder(contextMenu.target) && !secretFolderStore.vaultMode"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextCreateHiddenFolder(contextMenu.target.id)"
          >
            <i class="fa-solid fa-eye-slash w-4 text-center text-indigo-500"></i>
            <span>이 폴더 안에 비밀 폴더 만들기</span>
          </button>

          <button
            v-if="canConfigureSecret(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-slate-800"
            @click="handleContextConfigureHiddenFolder(contextMenu.target)"
          >
            <i
              class="fa-solid w-4 text-center text-indigo-500"
              :class="contextMenu.target.hiddenFolder ? 'fa-key' : 'fa-eye-slash'"
            ></i>
            <span>{{ contextMenu.target.hiddenFolder ? "비밀 폴더 설정 · 해제" : "비밀 폴더로 전환 (숨김)" }}</span>
          </button>

          <button
            v-if="canMoveToVault(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-slate-800"
            @click="handleContextMoveToVault(contextMenu.target)"
          >
            <i class="fa-solid fa-shield-halved w-4 text-center text-indigo-500"></i>
            <span>자체 비밀구역으로 옮기기</span>
          </button>

          <button
            v-if="canManageFolder(contextMenu.target) && secretFolderStore.vaultMode"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-amber-700 transition hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-slate-800"
            @click="handleContextOpenVaultImport(contextMenu.target.id, getFileName(contextMenu.target))"
          >
            <i class="fa-solid fa-file-import w-4 text-center text-amber-500"></i>
            <span>이 폴더로 파일 · 폴더 가져오기</span>
          </button>

          <button
            v-if="canManageFolder(contextMenu.target) && !isInsideSecretArea && !contextMenu.target.hiddenFolder"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextCreateSharedFolder(contextMenu.target.id)"
          >
            <i class="fa-solid fa-share-nodes w-4 text-center text-indigo-500"></i>
            <span>이 폴더 안에 공유 폴더 만들기</span>
          </button>

          <button
            v-if="isSharedFolder(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-slate-800"
            @click="handleContextOpenSharedStorageSettings(contextMenu.target)"
          >
            <i class="fa-solid fa-sliders w-4 text-center text-indigo-600"></i>
            <span>공유 폴더 세부 설정 · 참여자 관리</span>
          </button>

          <button
            v-if="canShare(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextShare(contextMenu.target, $event)"
          >
            <i class="fa-solid fa-user-plus w-4 text-center text-emerald-500"></i>
            <span>공유 설정</span>
          </button>

          <button
            v-if="deleteMode !== 'permanent' && !isInsideSecretArea && !contextMenu.target.hiddenFolder"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextToggleFolderInMedia(contextMenu.target)"
          >
            <i class="fa-solid fa-film w-4 text-center text-blue-500"></i>
            <span>{{ isFolderIncludedInMedia(contextMenu.target) ? "이 폴더를 미디어 대상에서 해제" : "이 폴더를 미디어 대상 폴더로 지정" }}</span>
          </button>

          <button
            v-if="deleteMode !== 'permanent' && !isInsideSecretArea && !contextMenu.target.hiddenFolder"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextToggleFolderInPhotos(contextMenu.target)"
          >
            <i class="fa-regular fa-images w-4 text-center text-teal-500"></i>
            <span>{{ isFolderIncludedInPhotos(contextMenu.target) ? "이 폴더를 사진첩 대상에서 해제" : "이 폴더를 사진첩 대상 폴더로 지정" }}</span>
          </button>

          <button
            v-if="deleteMode !== 'permanent' && !isInsideSecretArea && !contextMenu.target.hiddenFolder"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextCreatePhotoAlbumFromFolder(contextMenu.target)"
          >
            <i class="fa-solid fa-images w-4 text-center text-emerald-500"></i>
            <span>이 폴더로 사진 앨범 만들기</span>
          </button>

          <button
            v-if="deleteMode !== 'permanent' && !isInsideSecretArea && !contextMenu.target.hiddenFolder"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextCreateMediaCollectionFromFolder(contextMenu.target)"
          >
            <i class="fa-solid fa-clapperboard w-4 text-center text-purple-500"></i>
            <span>이 폴더로 미디어 컬렉션 만들기</span>
          </button>

          <div class="my-1 border-t border-gray-100 dark:border-slate-800"></div>

          <button
            v-if="canManageFolder(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextRename(contextMenu.target)"
          >
            <i class="fa-solid fa-pen-to-square w-4 text-center text-gray-500"></i>
            <span>이름 변경</span>
          </button>

          <button
            v-if="canManageFolder(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextProperties(contextMenu.target)"
          >
            <i class="fa-solid fa-circle-info w-4 text-center text-sky-500"></i>
            <span>폴더 속성</span>
          </button>

          <button
            v-if="canDownload(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextDownload(contextMenu.target, $event)"
          >
            <i class="fa-solid fa-file-zipper w-4 text-center text-orange-500"></i>
            <span>ZIP 다운로드</span>
          </button>

          <button
            v-if="canRestore(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-emerald-600 transition hover:bg-emerald-50 dark:hover:bg-slate-800"
            @click="handleContextRestore(contextMenu.target, $event)"
          >
            <i class="fa-solid fa-rotate-left w-4 text-center"></i>
            <span>복구</span>
          </button>

          <button
            v-if="canSelect"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextToggleSelect(contextMenu.target)"
          >
            <i :class="selectedIdSet.has(String(contextMenu.target.id)) ? 'fa-solid fa-square-check text-blue-500' : 'fa-regular fa-square text-gray-400'" class="w-4 text-center"></i>
            <span>{{ selectedIdSet.has(String(contextMenu.target.id)) ? "선택 해제" : "선택" }}</span>
          </button>

          <div v-if="canDelete(contextMenu.target)" class="my-1 border-t border-gray-100 dark:border-slate-800"></div>

          <button
            v-if="canDelete(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:hover:bg-slate-800"
            @click="handleContextDelete(contextMenu.target, $event)"
          >
            <i class="fa-solid fa-trash w-4 text-center"></i>
            <span>{{ deleteMode === "permanent" ? "영구 삭제" : "삭제" }}</span>
          </button>
        </template>

        <!-- [2] 파일 우클릭 메뉴 -->
        <template v-else-if="contextMenu.target">
          <div class="border-b border-gray-100 px-3.5 py-2 dark:border-slate-800">
            <p class="truncate text-xs font-black text-gray-900 dark:text-slate-100">
              {{ getFileName(contextMenu.target) }}
            </p>
            <p class="text-[10px] font-semibold text-gray-500 dark:text-slate-400">
              {{ formatDisplaySize(contextMenu.target) }}
            </p>
          </div>

          <button
            v-if="deleteMode !== 'permanent'"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextOpenItem"
          >
            <i class="fa-regular fa-eye w-4 text-center text-blue-500"></i>
            <span>미리보기 / 열기</span>
          </button>

          <button
            v-if="canGoToContainingFolder(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-slate-800"
            @click="handleContextGoToContainingFolder(contextMenu.target)"
          >
            <i class="fa-solid fa-location-crosshairs w-4 text-center text-indigo-500"></i>
            <span>해당 위치로 이동</span>
          </button>

          <button
            v-if="deleteMode !== 'permanent' && !isInsideSecretArea && isVideo(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-purple-700 transition hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-slate-800"
            @click="handleContextOpenInMediaTheater(contextMenu.target)"
          >
            <i class="fa-solid fa-clapperboard w-4 text-center text-purple-500"></i>
            <span>미디어 시어터에서 스트리밍 재생</span>
          </button>

          <button
            v-if="deleteMode !== 'permanent' && !isInsideSecretArea && isVideo(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-blue-700 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-slate-800"
            @click="handleContextToggleFileInMedia(contextMenu.target)"
          >
            <i class="fa-solid fa-film w-4 text-center text-blue-500"></i>
            <span>{{ isFileIncludedInMedia(contextMenu.target) ? "미디어 목록에서 제외" : "미디어 목록에 추가" }}</span>
          </button>

          <button
            v-if="deleteMode !== 'permanent' && !isInsideSecretArea && isImage(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-slate-800"
            @click="handleContextOpenInPhotoLightbox(contextMenu.target)"
          >
            <i class="fa-solid fa-images w-4 text-center text-emerald-500"></i>
            <span>사진첩 라이트박스로 보기</span>
          </button>

          <button
            v-if="deleteMode !== 'permanent' && !isInsideSecretArea && isImage(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-teal-700 transition hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-slate-800"
            @click="handleContextToggleFileInPhotos(contextMenu.target)"
          >
            <i class="fa-regular fa-images w-4 text-center text-teal-500"></i>
            <span>{{ isFileIncludedInPhotos(contextMenu.target) ? "사진첩 목록에서 제외" : "사진첩 목록에 추가" }}</span>
          </button>

          <button
            v-if="canDownload(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextDownload(contextMenu.target, $event)"
          >
            <i class="fa-solid fa-download w-4 text-center text-blue-500"></i>
            <span>다운로드</span>
          </button>

          <button
            v-if="canShare(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextShare(contextMenu.target, $event)"
          >
            <i class="fa-solid fa-share-nodes w-4 text-center text-emerald-500"></i>
            <span>공유 설정</span>
          </button>

          <button
            v-if="canShareDownloadLink(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-sky-50 hover:text-sky-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextShareDownloadLink(contextMenu.target, $event)"
          >
            <i class="fa-solid fa-link w-4 text-center text-sky-500"></i>
            <span>다운로드 링크 공유</span>
          </button>

          <button
            v-if="canSaveShared(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextSaveShared(contextMenu.target, $event)"
          >
            <i class="fa-solid fa-cloud-arrow-down w-4 text-center text-indigo-500"></i>
            <span>내 드라이브에 저장</span>
          </button>

          <button
            v-if="canToggleLock(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextToggleLock(contextMenu.target, $event)"
          >
            <i class="fa-solid fa-lock w-4 text-center text-amber-500"></i>
            <span>{{ contextMenu.target.lockedFile ? "잠금 해제" : "잠금" }}</span>
          </button>

          <button
            v-if="canMoveToVault(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-slate-800"
            @click="handleContextMoveToVault(contextMenu.target)"
          >
            <i class="fa-solid fa-shield-halved w-4 text-center text-indigo-500"></i>
            <span>자체 비밀구역으로 옮기기</span>
          </button>

          <button
            v-if="canRestore(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-emerald-600 transition hover:bg-emerald-50 dark:hover:bg-slate-800"
            @click="handleContextRestore(contextMenu.target, $event)"
          >
            <i class="fa-solid fa-rotate-left w-4 text-center"></i>
            <span>복구</span>
          </button>

          <button
            v-if="canSelect"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextToggleSelect(contextMenu.target)"
          >
            <i :class="selectedIdSet.has(String(contextMenu.target.id)) ? 'fa-solid fa-square-check text-blue-500' : 'fa-regular fa-square text-gray-400'" class="w-4 text-center"></i>
            <span>{{ selectedIdSet.has(String(contextMenu.target.id)) ? "선택 해제" : "선택" }}</span>
          </button>

          <div v-if="canDelete(contextMenu.target)" class="my-1 border-t border-gray-100 dark:border-slate-800"></div>

          <button
            v-if="canDelete(contextMenu.target)"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:hover:bg-slate-800"
            @click="handleContextDelete(contextMenu.target, $event)"
          >
            <i class="fa-solid fa-trash w-4 text-center"></i>
            <span>{{ deleteMode === "permanent" ? "영구 삭제" : "삭제" }}</span>
          </button>
        </template>

        <!-- [3] 드라이브 화면(빈 공간) 우클릭 메뉴 -->
        <template v-else>
          <div class="border-b border-gray-100 px-3.5 py-2 dark:border-slate-800">
            <p class="truncate text-xs font-black text-gray-900 dark:text-slate-100">
              {{ fileStore.currentFolder?.name || (secretFolderStore.vaultMode ? "비밀 폴더 (최상위)" : "홈 (최상위)") }}
            </p>
            <p class="text-[10px] font-semibold text-gray-500 dark:text-slate-400">
              현재 디렉터리 작업
            </p>
          </div>

          <button
            v-if="canUpload"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextCreateFolder(fileStore.currentFolderId)"
          >
            <i class="fa-solid fa-folder-plus w-4 text-center text-amber-500"></i>
            <span>새 폴더 만들기 (현재 위치)</span>
          </button>

          <button
            v-if="canUpload && !secretFolderStore.vaultMode"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextCreateHiddenFolder(fileStore.currentFolderId)"
          >
            <i class="fa-solid fa-eye-slash w-4 text-center text-indigo-500"></i>
            <span>비밀 폴더 만들기 (숨김)</span>
          </button>

          <button
            v-if="canUpload && !isInsideSecretArea"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextCreateSharedFolder(fileStore.currentFolderId)"
          >
            <i class="fa-solid fa-share-nodes w-4 text-center text-indigo-500"></i>
            <span>공유 폴더 만들기 (위치 선택)</span>
          </button>

          <button
            v-if="canUpload && secretFolderStore.vaultMode && deleteMode !== 'permanent'"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-amber-700 transition hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-slate-800"
            @click="handleContextOpenVaultImport(fileStore.currentFolderId ?? null, fileStore.currentFolder?.name || '')"
          >
            <i class="fa-solid fa-file-import w-4 text-center text-amber-500"></i>
            <span>드라이브에서 파일 · 폴더 가져오기</span>
          </button>

          <button
            v-if="canUpload"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextTriggerFileUpload(fileStore.currentFolderId)"
          >
            <i class="fa-solid fa-file-arrow-up w-4 text-center text-blue-500"></i>
            <span>파일 업로드</span>
          </button>

          <button
            v-if="canUpload"
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextTriggerFolderUpload(fileStore.currentFolderId)"
          >
            <i class="fa-solid fa-cloud-arrow-up w-4 text-center text-indigo-500"></i>
            <span>폴더 업로드</span>
          </button>

          <template v-if="fileStore.currentFolder && canUpload">
            <div class="my-1 border-t border-gray-100 dark:border-slate-800"></div>

            <button
              type="button"
              class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
              @click="handleContextProperties(fileStore.currentFolder)"
            >
              <i class="fa-solid fa-circle-info w-4 text-center text-sky-500"></i>
              <span>현재 폴더 속성</span>
            </button>

            <button
              type="button"
              class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
              @click="handleContextRename(fileStore.currentFolder)"
            >
              <i class="fa-solid fa-pen-to-square w-4 text-center text-gray-500"></i>
              <span>현재 폴더 이름 변경</span>
            </button>

            <button
              v-if="resolvedCurrentFolderForSecret"
              type="button"
              class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-slate-800"
              @click="handleContextConfigureHiddenFolder(resolvedCurrentFolderForSecret)"
            >
              <i
                class="fa-solid w-4 text-center text-indigo-500"
                :class="resolvedCurrentFolderForSecret.hiddenFolder ? 'fa-key' : 'fa-eye-slash'"
              ></i>
              <span>{{ resolvedCurrentFolderForSecret.hiddenFolder ? "현재 폴더 비밀 설정 · 해제" : "현재 폴더를 비밀 폴더로 전환" }}</span>
            </button>

            <button
              type="button"
              class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
              @click="handleContextGoParent"
            >
              <i class="fa-solid fa-level-up-alt w-4 text-center text-gray-500"></i>
              <span>상위 폴더로 이동</span>
            </button>
          </template>

          <div class="my-1 border-t border-gray-100 dark:border-slate-800"></div>

          <button
            type="button"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-bold text-gray-700 transition hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="handleContextRefresh"
          >
            <i class="fa-solid fa-rotate-right w-4 text-center text-gray-500"></i>
            <span>새로고침</span>
          </button>
        </template>
      </div>
    </Teleport>
  </div>
</template>
