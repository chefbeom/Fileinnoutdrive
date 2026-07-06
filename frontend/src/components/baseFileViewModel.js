import { formatBytes } from "@/utils/formatBytes.js";

export function collectBaseFileExtensions({ useServerPaging = false, serverExtensions = [], files = [] } = {}) {
  if (useServerPaging) {
    return serverExtensions || [];
  }

  const extensions = files
    .map((file) => file?.extension || file?.fileFormat || "")
    .filter(Boolean)
    .map((extension) => String(extension).toLowerCase());

  return [...new Set(extensions).values()].sort((left, right) => left.localeCompare(right));
}

export function buildCurrentFolderVisibleSummary(currentFolder, files = []) {
  if (!currentFolder) {
    return null;
  }

  const visibleFiles = files.filter((file) => file?.type !== "folder");
  const visibleFolders = files.filter((file) => file?.type === "folder");
  const visibleSize = visibleFiles.reduce((sum, file) => sum + Number(file?.sizeBytes || 0), 0);

  return {
    visibleChildCount: files.length,
    visibleFileCount: visibleFiles.length,
    visibleFolderCount: visibleFolders.length,
    visibleSizeLabel: formatBytes(visibleSize),
  };
}

export function buildFolderSummaryCards(summary) {
  if (!summary) {
    return [];
  }

  return [
    { key: "items", label: "현재 폴더 항목", value: summary.visibleChildCount },
    { key: "files", label: "현재 폴더 파일", value: summary.visibleFileCount },
    { key: "folders", label: "현재 폴더 하위 폴더", value: summary.visibleFolderCount },
    { key: "size", label: "현재 폴더 파일 크기", value: summary.visibleSizeLabel },
  ];
}

export function buildBaseCustomSizeRangeLabel(searchState = {}) {
  if (searchState.sizeFilter !== "custom") return "";
  const min = searchState.customMinSize?.trim();
  const max = searchState.customMaxSize?.trim();
  if (!min && !max) return "범위를 입력하세요.";
  if (min && max) return `${min}MB ~ ${max}MB`;
  if (min) return `${min}MB 이상`;
  return `${max}MB 이하`;
}

export function hasBaseSearchFilters(searchState = {}) {
  return (
    String(searchState.searchQuery || "").trim() !== "" ||
    (searchState.extensionFilter || "all") !== "all" ||
    (searchState.sizeFilter || "all") !== "all" ||
    (searchState.statusFilter || "all") !== "all"
  );
}

export function buildBaseActiveFilterChips(searchState = {}, sortOption = "updatedAt-desc", options = {}) {
  const chips = [];
  const sizeOptionLabelMap = options.sizeOptionLabelMap || {};
  const statusOptionLabelMap = options.statusOptionLabelMap || {};
  const sortOptions = options.sortOptions || [];

  const keyword = String(searchState.searchQuery || "").trim();
  if (keyword) chips.push(`검색: ${keyword}`);
  if ((searchState.extensionFilter || "all") !== "all") chips.push(`확장자: ${String(searchState.extensionFilter).toUpperCase()}`);
  if ((searchState.sizeFilter || "all") !== "all") chips.push(`크기: ${sizeOptionLabelMap[searchState.sizeFilter] || "사용자 설정"}`);
  if ((searchState.statusFilter || "all") !== "all") chips.push(`상태: ${statusOptionLabelMap[searchState.statusFilter] || "사용자 설정"}`);
  if (sortOption !== "updatedAt-desc") chips.push(`정렬: ${sortOptions.find((option) => option.value === sortOption)?.label || "사용자 설정"}`);

  return chips;
}

export function matchesBaseFileSizeFilter(file, searchState = {}) {
  if (file?.type === "folder") return true;
  const sizeMb = Number(file?.sizeBytes || 0) / (1024 * 1024);
  const sizeFilter = searchState.sizeFilter || "all";

  if (sizeFilter === "all") return true;
  if (sizeFilter === "lte10") return sizeMb <= 10;
  if (sizeFilter === "lte100") return sizeMb <= 100;
  if (sizeFilter === "lte1000") return sizeMb <= 1000;
  if (sizeFilter === "lte100000") return sizeMb <= 100000;
  if (sizeFilter === "gte100001") return sizeMb >= 100001;
  if (sizeFilter === "custom") {
    const min = Number(searchState.customMinSize);
    const max = Number(searchState.customMaxSize);
    const hasMin = Number.isFinite(min) && searchState.customMinSize !== "";
    const hasMax = Number.isFinite(max) && searchState.customMaxSize !== "";
    if (hasMin && sizeMb < min) return false;
    if (hasMax && sizeMb > max) return false;
    return true;
  }

  return true;
}

export function filterAndSortBaseFiles(files = [], searchState = {}, sortOption = "updatedAt-desc") {
  const keyword = String(searchState.searchQuery || "").trim().toLowerCase();
  const [sortBy, sortDirection = "desc"] = String(sortOption || "updatedAt-desc").split("-");
  const extensionFilter = searchState.extensionFilter || "all";
  const statusFilter = searchState.statusFilter || "all";

  const filtered = files.filter((file) => {
    const fileName = String(file?.name || file?.fileOriginName || "").toLowerCase();
    const extension = String(file?.extension || file?.fileFormat || "").toLowerCase();
    const ownerName = String(file?.ownerName || "").toLowerCase();
    const ownerEmail = String(file?.ownerEmail || "").toLowerCase();
    const sharedPath = String(file?.sharedPath || file?.desktopPath || "").toLowerCase();
    const sharedPathSegments = Array.isArray(file?.sharedPathSegments)
      ? file.sharedPathSegments.join(" ").toLowerCase()
      : "";
    const matchesKeyword = !keyword ||
      fileName.includes(keyword) ||
      extension.includes(keyword) ||
      ownerName.includes(keyword) ||
      ownerEmail.includes(keyword) ||
      sharedPath.includes(keyword) ||
      sharedPathSegments.includes(keyword);
    const matchesExtension = extensionFilter === "all" || extension === extensionFilter;
    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "shared" && (file?.sharedFile || file?.sharedWithMe)) ||
      (statusFilter === "shared-owned" && file?.sharedFile && !file?.sharedWithMe) ||
      (statusFilter === "shared-with-me" && file?.sharedWithMe) ||
      (statusFilter === "locked" && file?.lockedFile) ||
      (statusFilter === "unlocked" && !file?.lockedFile);

    return matchesKeyword && matchesExtension && matchesStatus && matchesBaseFileSizeFilter(file, searchState);
  });

  return filtered.sort((left, right) => {
    let leftValue;
    let rightValue;
    if (sortBy === "name") {
      leftValue = String(left?.name || left?.fileOriginName || "").toLowerCase();
      rightValue = String(right?.name || right?.fileOriginName || "").toLowerCase();
    } else if (sortBy === "size") {
      leftValue = Number(left?.sizeBytes || 0);
      rightValue = Number(right?.sizeBytes || 0);
    } else if (sortBy === "sharedAt") {
      leftValue = Number(new Date(left?.sharedAt || 0).getTime() || 0);
      rightValue = Number(new Date(right?.sharedAt || 0).getTime() || 0);
    } else {
      leftValue = Number(left?.lastModifiedMs || new Date(left?.updatedAt || 0).getTime() || 0);
      rightValue = Number(right?.lastModifiedMs || new Date(right?.updatedAt || 0).getTime() || 0);
    }
    if (leftValue < rightValue) return sortDirection === "asc" ? -1 : 1;
    if (leftValue > rightValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });
}

export const buildBaseTotalSizeLabel = (files = []) =>
  formatBytes(files.reduce((sum, file) => sum + Number(file?.sizeBytes || 0), 0));

export function buildBaseToolbarMetaLabel({ useServerPaging = false, drivePageInfo = {}, filteredFiles = [], totalSizeLabel = "0 B" } = {}) {
  if (useServerPaging) {
    const totalCount = Number(drivePageInfo?.totalCount || 0);
    return `총 ${totalCount}개 항목 · 현재 페이지 ${filteredFiles.length}개 · 총 ${totalSizeLabel}`;
  }

  return `${filteredFiles.length}개 항목 · 총 ${totalSizeLabel}`;
}

export function getSelectedBaseFiles(files = [], selectedIds = []) {
  const selectedSet = new Set(selectedIds.map((id) => String(id)));
  return files.filter((file) => selectedSet.has(String(file.id)));
}

export const isOwnedSharedBaseFile = (file) => Boolean(file?.sharedFile && !file?.sharedWithMe);

export function buildSelectedBaseFileGroups(selectedFiles = [], options = {}) {
  const sharedLibrary = Boolean(options.sharedLibrary);
  const canCreateShares = Boolean(options.canCreateShares);
  const selectedLockableFiles = selectedFiles.filter((file) => !file?.sharedWithMe && file?.type !== "folder" && !file?.isTrash);

  return {
    downloadableFiles: selectedFiles.filter((file) => file?.type !== "folder" && !file?.lockedFile && (file?.downloadUrl || file?.presignedDownloadUrl || (file?.sharedWithMe && file?.downloadable))),
    sharedFiles: selectedFiles.filter((file) => file?.sharedWithMe && !file?.lockedFile),
    ownedShareableFiles: selectedFiles.filter((file) => !file?.sharedWithMe && !file?.lockedFile && !file?.isTrash && (canCreateShares || file?.sharedFile)),
    cancelableSentSharedFiles: selectedFiles.filter((file) => sharedLibrary && file?.sharedFile && !file?.sharedWithMe),
    lockableFiles: selectedLockableFiles,
    lockCandidates: selectedLockableFiles.filter((file) => !file?.lockedFile),
    lockedFiles: selectedLockableFiles.filter((file) => file?.lockedFile),
  };
}

export function buildBasePageCount({ useServerPaging = false, drivePageInfo = {}, filteredFiles = [], pageSize = 1 } = {}) {
  return useServerPaging
    ? Math.max(1, Number(drivePageInfo?.totalPage || 0) || 1)
    : Math.max(1, Math.ceil(filteredFiles.length / pageSize));
}

export function paginateBaseFiles({ useServerPaging = false, filteredFiles = [], currentPage = 1, pageSize = 1 } = {}) {
  if (useServerPaging) {
    return filteredFiles;
  }

  return filteredFiles.slice((currentPage - 1) * pageSize, currentPage * pageSize);
}

export function buildBasePageNumbers(currentPage = 1, pageCount = 1) {
  const pages = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(pageCount, start + 4);
  for (let page = start; page <= end; page += 1) pages.push(page);
  return pages;
}

export function buildBaseServerListQuery({ useServerPaging = false, currentFolderId = null, currentPage = 1, pageSize = 1, sortOption = "updatedAt-desc", searchState = {} } = {}) {
  if (!useServerPaging) {
    return null;
  }

  return {
    parentId: currentFolderId ?? null,
    page: Math.max(0, currentPage - 1),
    size: pageSize,
    sortOption,
    searchQuery: String(searchState.searchQuery || "").trim(),
    extensionFilter: searchState.extensionFilter,
    sizeFilter: searchState.sizeFilter,
    customMinSize: searchState.customMinSize,
    customMaxSize: searchState.customMaxSize,
    statusFilter: searchState.statusFilter,
  };
}

export function formatBaseDisplayDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function normalizeBaseSharePermission(permission) {
  const normalized = String(permission || "READ").toUpperCase();
  return ["READ", "DOWNLOAD", "UPLOAD", "WRITE"].includes(normalized) ? normalized : "READ";
}

export function getBaseSharePermissionRank(permission) {
  const ranks = {
    READ: 1,
    DOWNLOAD: 2,
    UPLOAD: 3,
    WRITE: 4,
  };
  return ranks[normalizeBaseSharePermission(permission)] || 0;
}

export function formatBaseSharePermissionLabel(permission) {
  const labels = {
    READ: "보기만",
    DOWNLOAD: "보기 + 다운로드",
    UPLOAD: "업로드만",
    WRITE: "전체 허용",
  };
  return labels[normalizeBaseSharePermission(permission)] || labels.READ;
}

export function formatBaseSharePolicyLabel(item) {
  const labels = [];

  if (item?.expiresAt) {
    labels.push(`만료: ${formatBaseDisplayDate(item.expiresAt)}`);
  }

  if (item?.downloadLimit) {
    labels.push(`다운로드: ${item.downloadCount || 0}/${item.downloadLimit}`);
  }

  if (item?.expired) {
    labels.push("만료됨");
  }

  if (item?.downloadLimitReached) {
    labels.push("다운로드 제한 도달");
  }

  if (item?.passwordProtected) {
    labels.push("비밀번호 보호");
  }

  return labels.join(" · ");
}

export function buildBaseSharePolicyOptions({ expiresAt = "", downloadLimit = "", sharePassword = "" } = {}) {
  const rawLimit = Number(downloadLimit || 0);
  const normalizedDownloadLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : null;

  return {
    expiresAt: expiresAt || null,
    downloadLimit: normalizedDownloadLimit,
    sharePassword: String(sharePassword || "").trim() || null,
  };
}

export function formatBaseSharedFilesLabel(item) {
  const fileNames = Array.isArray(item?.fileNames) ? item.fileNames.filter(Boolean) : [];

  if (!fileNames.length) {
    return "공유한 파일 정보 없음";
  }

  if (fileNames.length === 1) {
    return fileNames[0];
  }

  if (fileNames.length === 2) {
    return fileNames.join(", ");
  }

  return `${fileNames.slice(0, 2).join(", ")} 외 ${fileNames.length - 2}개`;
}

export function aggregateBaseShareInfoEntries(items = []) {
  const shareMap = new Map();

  items.forEach((item) => {
    const recipientEmail = String(item?.recipientEmail || "").trim();
    if (!recipientEmail) {
      return;
    }

    const key = recipientEmail.toLowerCase();
    const existing = shareMap.get(key) || {
      shareIdx: item?.shareIdx || null,
      fileIdx: item?.fileIdx || null,
      recipientName: item?.recipientName || "",
      recipientEmail,
      permission: "READ",
      permissions: new Set(),
      createdAt: item?.createdAt || null,
      expiresAt: item?.expiresAt || null,
      downloadLimit: item?.downloadLimit ?? null,
      downloadCount: Number(item?.downloadCount ?? 0) || 0,
      expired: Boolean(item?.expired),
      downloadLimitReached: Boolean(item?.downloadLimitReached),
      passwordProtected: Boolean(item?.passwordProtected),
      fileNames: new Set(),
    };

    if (!existing.recipientName && item?.recipientName) {
      existing.recipientName = item.recipientName;
    }

    const currentTimestamp = new Date(existing.createdAt || 0).getTime() || 0;
    const nextTimestamp = new Date(item?.createdAt || 0).getTime() || 0;
    if (nextTimestamp >= currentTimestamp) {
      existing.createdAt = item?.createdAt || existing.createdAt;
      existing.shareIdx = item?.shareIdx || existing.shareIdx;
      existing.fileIdx = item?.fileIdx || existing.fileIdx;
      existing.expiresAt = item?.expiresAt || null;
      existing.downloadLimit = item?.downloadLimit ?? null;
      existing.downloadCount = Number(item?.downloadCount ?? 0) || 0;
      existing.expired = Boolean(item?.expired);
      existing.downloadLimitReached = Boolean(item?.downloadLimitReached);
      existing.passwordProtected = Boolean(item?.passwordProtected);
    }

    if (item?.fileOriginName) {
      existing.fileNames.add(item.fileOriginName);
    }

    const nextPermission = normalizeBaseSharePermission(item?.permission);
    existing.permissions.add(nextPermission);
    if (getBaseSharePermissionRank(nextPermission) > getBaseSharePermissionRank(existing.permission)) {
      existing.permission = nextPermission;
    }

    shareMap.set(key, existing);
  });

  return [...shareMap.values()]
    .map(({ permissions, ...item }) => ({
      ...item,
      fileNames: [...item.fileNames],
      fileCount: item.fileNames.size,
    }))
    .sort((left, right) => (new Date(right.createdAt || 0).getTime() || 0) - (new Date(left.createdAt || 0).getTime() || 0));
}
