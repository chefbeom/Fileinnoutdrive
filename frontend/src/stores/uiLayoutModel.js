export const UI_LAYOUT_VERSION = 1;
export const UI_LAYOUT_STORAGE_PREFIX = "wafflebear:ui-layout:v1:";

export const NAV_PLACEMENTS = Object.freeze(["sidebar", "header", "both", "hidden"]);
export const HEADER_NAV_POSITIONS = Object.freeze(["after-search", "right-actions"]);
export const HEADER_NAV_STYLES = Object.freeze(["icon-label", "compact", "icon-only"]);
export const HEADER_NAV_ALIGNS = Object.freeze(["right", "left", "center"]);
export const MAX_MOBILE_BOTTOM_NAV_ITEMS = 4;

export const UI_LAYOUT_NAV_ITEMS = Object.freeze([
  {
    id: "home",
    label: "홈",
    shortLabel: "홈",
    description: "내 드라이브 파일 목록과 폴더 트리",
    icon: "fa-solid fa-house",
    route: "/main/home",
    routeName: "home",
    kind: "route",
    sidebarGroup: "nav",
    defaultPlacement: "sidebar",
  },
  {
    id: "media",
    label: "미디어",
    shortLabel: "미디어",
    description: "시리즈 · 동영상 라이브러리 및 이어보기",
    icon: "fa-solid fa-clapperboard",
    route: "/main/media",
    routeName: "media",
    kind: "route",
    sidebarGroup: "nav",
    supportsSubmenu: true,
    defaultPlacement: "sidebar",
  },
  {
    id: "photos",
    label: "사진첩",
    shortLabel: "사진첩",
    description: "사진 라이브러리 및 앨범",
    icon: "fa-regular fa-images",
    route: "/main/photos",
    routeName: "photos",
    kind: "route",
    sidebarGroup: "nav",
    supportsSubmenu: true,
    defaultPlacement: "sidebar",
  },
  {
    id: "shareFile",
    label: "공유 파일",
    shortLabel: "공유",
    description: "내게 공유되었거나 내가 공유한 파일",
    icon: "fa-solid fa-share-nodes",
    route: "/main/shareFile",
    routeName: "shareFile",
    kind: "route",
    sidebarGroup: "nav",
    defaultPlacement: "sidebar",
  },
  {
    id: "storageShare",
    label: "공유 저장소",
    shortLabel: "저장소",
    description: "공유 스페이스 관리 모달 열기",
    icon: "fa-solid fa-hard-drive",
    eventName: "open-storage-share-modal",
    eventDetail: { page: "spaces" },
    kind: "action",
    sidebarGroup: "nav",
    defaultPlacement: "sidebar",
  },
  {
    id: "recentFile",
    label: "최근 파일",
    shortLabel: "최근",
    description: "최근 업로드 및 열어본 파일 기록",
    icon: "fa-regular fa-clock",
    route: "/main/recentFile",
    routeName: "recentFile",
    kind: "route",
    sidebarGroup: "nav",
    defaultPlacement: "sidebar",
  },
  {
    id: "trash",
    label: "휴지통",
    shortLabel: "휴지통",
    description: "삭제된 파일 복원 및 영구 삭제",
    icon: "fa-regular fa-trash-can",
    route: "/main/trash",
    routeName: "trash",
    kind: "route",
    sidebarGroup: "utilities",
    defaultPlacement: "sidebar",
  },
  {
    id: "storage",
    label: "저장용량",
    shortLabel: "용량",
    description: "스토리지 사용량 분석 및 요금제 관리",
    icon: "fa-solid fa-cloud",
    route: "/main/storage",
    routeName: "storage",
    kind: "route",
    sidebarGroup: "utilities",
    defaultPlacement: "sidebar",
  },
]);

export const UI_LAYOUT_NAV_ITEM_MAP = Object.freeze(
  Object.fromEntries(UI_LAYOUT_NAV_ITEMS.map((item) => [item.id, item]))
);

export const UI_LAYOUT_SIDEBAR_SECTIONS = Object.freeze([
  { id: "nav", label: "주 메뉴", description: "홈, 미디어, 사진첩 등 주요 이동 버튼" },
  { id: "recentFiles", label: "최근 파일 바로가기", description: "최근 업로드 및 열어본 파일 목록" },
  { id: "personalPages", label: "개인 페이지", description: "내 개인 문서/노트 목록" },
  { id: "sharedPages", label: "협업 페이지", description: "공유받은 협업 문서/노트 목록" },
  { id: "utilities", label: "휴지통 · 저장용량", description: "휴지통, 용량 게이지 및 요금제 버튼" },
]);

export const UI_LAYOUT_HEADER_ACTIONS = Object.freeze([
  { id: "uploadQuick", label: "빠른 업로드", icon: "fa-solid fa-cloud-arrow-up", defaultVisible: false },
  { id: "notifications", label: "알림", icon: "fa-regular fa-bell", defaultVisible: true },
  { id: "theme", label: "다크/라이트 테마", icon: "fa-solid fa-circle-half-stroke", defaultVisible: true },
  { id: "chat", label: "작업 채팅", icon: "fa-solid fa-comments", defaultVisible: true },
  { id: "layoutSettings", label: "화면 · 버튼 배치", icon: "fa-solid fa-sliders", defaultVisible: true },
]);

const DEFAULT_NAV_IDS = UI_LAYOUT_NAV_ITEMS.map((item) => item.id);
const DEFAULT_SIDEBAR_SECTION_IDS = UI_LAYOUT_SIDEBAR_SECTIONS.map((sec) => sec.id);
const DEFAULT_HEADER_ACTION_IDS = UI_LAYOUT_HEADER_ACTIONS.map((act) => act.id);

export function createDefaultUiLayoutState() {
  return {
    version: UI_LAYOUT_VERSION,
    presetId: "default",
    clientUpdatedAt: null,
    navPlacements: {
      home: "sidebar",
      media: "sidebar",
      photos: "sidebar",
      shareFile: "sidebar",
      storageShare: "sidebar",
      recentFile: "sidebar",
      trash: "sidebar",
      storage: "sidebar",
    },
    sidebarNavOrder: [...DEFAULT_NAV_IDS],
    headerNavOrder: [...DEFAULT_NAV_IDS],
    headerNavPosition: "after-search",
    headerNavAlign: "right",
    headerNavStyle: "icon-label",
    showHeaderSearchBar: true,
    headerSearchCompact: false,
    headerActionOrder: [...DEFAULT_HEADER_ACTION_IDS],
    headerActionVisibility: {
      uploadQuick: false,
      notifications: true,
      theme: true,
      chat: true,
      layoutSettings: true,
    },
    sidebarSectionOrder: [...DEFAULT_SIDEBAR_SECTION_IDS],
    showSidebarNavSection: true,
    showSidebarRecentSection: true,
    showPersonalPages: true,
    showSharedPages: true,
    showSidebarUtilitiesSection: true,
    showSidebarUploadButton: true,
    showMediaSubmenu: true,
    showPhotosSubmenu: true,
    showStorageWidget: true,
    showAdditionalStorageButton: true,
    sidebarCompactMode: false,
    showMobileBottomNav: true,
    mobileBottomNavIds: ["home", "media", "photos", "shareFile"],
  };
}

export const UI_LAYOUT_PRESETS = Object.freeze([
  {
    id: "default",
    name: "기본 배치",
    badge: "표준",
    description: "모든 주 메뉴와 개인·협업 페이지를 왼쪽 사이드바에 유지하는 기본 레이아웃",
    patch: {},
  },
  {
    id: "media-header",
    name: "미디어 · 사진첩 상단",
    badge: "추천",
    description: "미디어와 사진첩 버튼을 왼쪽 사이드바에서 검색창과 같은 줄 오른쪽으로 이동하고 사이드바는 드라이브 중심으로 정돈",
    patch: {
      navPlacements: {
        home: "sidebar",
        media: "header",
        photos: "header",
        shareFile: "sidebar",
        storageShare: "sidebar",
        recentFile: "sidebar",
        trash: "sidebar",
        storage: "sidebar",
      },
      headerNavOrder: ["media", "photos", "home", "shareFile", "storageShare", "recentFile", "trash", "storage"],
      headerNavPosition: "after-search",
      headerNavAlign: "right",
      headerNavStyle: "icon-label",
      showHeaderSearchBar: true,
    },
  },
  {
    id: "minimal-drive",
    name: "파일 드라이브 집중형",
    badge: "미니멀",
    description: "개인·협업 페이지와 미디어 하위메뉴를 숨기고 주요 메뉴와 빠른 업로드를 상단 바에 배치",
    patch: {
      navPlacements: {
        home: "header",
        media: "header",
        photos: "header",
        shareFile: "header",
        storageShare: "sidebar",
        recentFile: "sidebar",
        trash: "sidebar",
        storage: "sidebar",
      },
      headerNavOrder: ["home", "media", "photos", "shareFile", "storageShare", "recentFile", "trash", "storage"],
      headerNavPosition: "after-search",
      headerNavAlign: "right",
      headerNavStyle: "compact",
      headerActionVisibility: {
        uploadQuick: true,
        notifications: true,
        theme: true,
        chat: true,
        layoutSettings: true,
      },
      showPersonalPages: false,
      showSharedPages: false,
      showSidebarRecentSection: false,
      showMediaSubmenu: false,
      showPhotosSubmenu: false,
      sidebarCompactMode: true,
    },
  },
  {
    id: "workspace-focus",
    name: "문서 · 협업 집중형",
    badge: "협업",
    description: "개인 페이지와 협업 페이지를 사이드바 상단으로 올리고 미디어·사진첩은 상단 아이콘으로 이동",
    patch: {
      navPlacements: {
        home: "sidebar",
        media: "header",
        photos: "header",
        shareFile: "sidebar",
        storageShare: "sidebar",
        recentFile: "sidebar",
        trash: "sidebar",
        storage: "sidebar",
      },
      headerNavOrder: ["media", "photos", "home", "shareFile", "storageShare", "recentFile", "trash", "storage"],
      headerNavPosition: "after-search",
      headerNavAlign: "right",
      headerNavStyle: "icon-only",
      sidebarSectionOrder: ["nav", "personalPages", "sharedPages", "recentFiles", "utilities"],
      showPersonalPages: true,
      showSharedPages: true,
      showMediaSubmenu: false,
      showPhotosSubmenu: false,
    },
  },
]);

function normalizeIdOrder(candidate, allowedIds) {
  const seen = new Set();
  const next = [];
  const source = Array.isArray(candidate) ? candidate : [];
  for (const id of source) {
    if (typeof id === "string" && allowedIds.includes(id) && !seen.has(id)) {
      seen.add(id);
      next.push(id);
    }
  }
  for (const id of allowedIds) {
    if (!seen.has(id)) {
      seen.add(id);
      next.push(id);
    }
  }
  return next;
}

function normalizeBool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeEnum(value, allowed, fallback) {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

export function normalizeUiLayoutState(raw) {
  const defaults = createDefaultUiLayoutState();
  const source = raw && typeof raw === "object" ? raw : {};

  const navPlacements = {};
  const rawPlacements = source.navPlacements && typeof source.navPlacements === "object" ? source.navPlacements : {};
  for (const id of DEFAULT_NAV_IDS) {
    navPlacements[id] = normalizeEnum(rawPlacements[id], NAV_PLACEMENTS, defaults.navPlacements[id]);
  }

  const headerActionVisibility = {};
  const rawActionVis =
    source.headerActionVisibility && typeof source.headerActionVisibility === "object"
      ? source.headerActionVisibility
      : {};
  for (const id of DEFAULT_HEADER_ACTION_IDS) {
    headerActionVisibility[id] = normalizeBool(rawActionVis[id], defaults.headerActionVisibility[id]);
  }

  const rawMobileIds = Array.isArray(source.mobileBottomNavIds) ? source.mobileBottomNavIds : defaults.mobileBottomNavIds;
  const mobileSet = new Set();
  const mobileBottomNavIds = [];
  for (const id of rawMobileIds) {
    if (typeof id === "string" && DEFAULT_NAV_IDS.includes(id) && !mobileSet.has(id)) {
      mobileSet.add(id);
      mobileBottomNavIds.push(id);
      if (mobileBottomNavIds.length >= MAX_MOBILE_BOTTOM_NAV_ITEMS) {
        break;
      }
    }
  }

  return {
    version: UI_LAYOUT_VERSION,
    presetId: typeof source.presetId === "string" && source.presetId.trim() ? source.presetId.trim() : defaults.presetId,
    clientUpdatedAt: typeof source.clientUpdatedAt === "string" && source.clientUpdatedAt ? source.clientUpdatedAt : null,
    navPlacements,
    sidebarNavOrder: normalizeIdOrder(source.sidebarNavOrder, DEFAULT_NAV_IDS),
    headerNavOrder: normalizeIdOrder(source.headerNavOrder, DEFAULT_NAV_IDS),
    headerNavPosition: normalizeEnum(source.headerNavPosition, HEADER_NAV_POSITIONS, defaults.headerNavPosition),
    headerNavAlign: normalizeEnum(source.headerNavAlign, HEADER_NAV_ALIGNS, defaults.headerNavAlign),
    headerNavStyle: normalizeEnum(source.headerNavStyle, HEADER_NAV_STYLES, defaults.headerNavStyle),
    showHeaderSearchBar: normalizeBool(source.showHeaderSearchBar, defaults.showHeaderSearchBar),
    headerSearchCompact: normalizeBool(source.headerSearchCompact, defaults.headerSearchCompact),
    headerActionOrder: normalizeIdOrder(source.headerActionOrder, DEFAULT_HEADER_ACTION_IDS),
    headerActionVisibility,
    sidebarSectionOrder: normalizeIdOrder(source.sidebarSectionOrder, DEFAULT_SIDEBAR_SECTION_IDS),
    showSidebarNavSection: normalizeBool(source.showSidebarNavSection, defaults.showSidebarNavSection),
    showSidebarRecentSection: normalizeBool(source.showSidebarRecentSection, defaults.showSidebarRecentSection),
    showPersonalPages: normalizeBool(source.showPersonalPages, defaults.showPersonalPages),
    showSharedPages: normalizeBool(source.showSharedPages, defaults.showSharedPages),
    showSidebarUtilitiesSection: normalizeBool(source.showSidebarUtilitiesSection, defaults.showSidebarUtilitiesSection),
    showSidebarUploadButton: normalizeBool(source.showSidebarUploadButton, defaults.showSidebarUploadButton),
    showMediaSubmenu: normalizeBool(source.showMediaSubmenu, defaults.showMediaSubmenu),
    showPhotosSubmenu: normalizeBool(source.showPhotosSubmenu, defaults.showPhotosSubmenu),
    showStorageWidget: normalizeBool(source.showStorageWidget, defaults.showStorageWidget),
    showAdditionalStorageButton: normalizeBool(source.showAdditionalStorageButton, defaults.showAdditionalStorageButton),
    sidebarCompactMode: normalizeBool(source.sidebarCompactMode, defaults.sidebarCompactMode),
    showMobileBottomNav: normalizeBool(source.showMobileBottomNav, defaults.showMobileBottomNav),
    mobileBottomNavIds: mobileBottomNavIds.length > 0 ? mobileBottomNavIds : [...defaults.mobileBottomNavIds],
  };
}

export function applyUiLayoutPreset(presetId) {
  const preset = UI_LAYOUT_PRESETS.find((entry) => entry.id === presetId) || UI_LAYOUT_PRESETS[0];
  const base = createDefaultUiLayoutState();
  const patch = preset.patch || {};
  return normalizeUiLayoutState({
    ...base,
    ...patch,
    navPlacements: {
      ...base.navPlacements,
      ...(patch.navPlacements || {}),
    },
    headerActionVisibility: {
      ...base.headerActionVisibility,
      ...(patch.headerActionVisibility || {}),
    },
    presetId: preset.id,
  });
}

export function isItemInSidebar(placement) {
  return placement === "sidebar" || placement === "both";
}

export function isItemInHeader(placement) {
  return placement === "header" || placement === "both";
}

/**
 * Reorders `targetId` within `order` by swapping against the nearest element
 * matching `isVisibleFn` in the given direction (-1 up/left, +1 down/right)
 * so reordering skips hidden entries and takes effect in one click.
 */
export function moveOrderedItem(order, targetId, direction, isVisibleFn = () => true) {
  if (!Array.isArray(order)) return [];
  const step = direction < 0 ? -1 : 1;
  const currentIndex = order.indexOf(targetId);
  if (currentIndex === -1) return [...order];

  let swapIndex = currentIndex + step;
  while (swapIndex >= 0 && swapIndex < order.length && !isVisibleFn(order[swapIndex])) {
    swapIndex += step;
  }
  if (swapIndex < 0 || swapIndex >= order.length) {
    return [...order];
  }

  const next = [...order];
  const temp = next[currentIndex];
  next[currentIndex] = next[swapIndex];
  next[swapIndex] = temp;
  return next;
}

export function moveOrderItemToTarget(order, sourceId, targetId) {
  if (!Array.isArray(order) || !sourceId || !targetId || sourceId === targetId) {
    return Array.isArray(order) ? [...order] : [];
  }
  const sourceIndex = order.indexOf(sourceId);
  const targetIndex = order.indexOf(targetId);
  if (sourceIndex === -1 || targetIndex === -1) {
    return [...order];
  }
  const next = [...order];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

export function serializeUiLayoutForPersistence(layoutState) {
  const normalized = normalizeUiLayoutState(layoutState);
  return {
    ...normalized,
    clientUpdatedAt: normalized.clientUpdatedAt || new Date().toISOString(),
  };
}
