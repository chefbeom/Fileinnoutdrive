import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { fetchUiLayoutPreferences, updateUiLayoutPreferences } from "@/api/featerApi.js";
import { useAuthStore } from "@/stores/useAuthStore.js";
import { useSidebarPrefsStore } from "@/stores/sidebarPrefsStore.js";
import { apiPath } from "@/utils/backendUrl.js";
import {
  HEADER_NAV_ALIGNS,
  HEADER_NAV_POSITIONS,
  HEADER_NAV_STYLES,
  MAX_MOBILE_BOTTOM_NAV_ITEMS,
  NAV_PLACEMENTS,
  UI_LAYOUT_HEADER_ACTIONS,
  UI_LAYOUT_NAV_ITEM_MAP,
  UI_LAYOUT_NAV_ITEMS,
  UI_LAYOUT_PRESETS,
  UI_LAYOUT_SIDEBAR_SECTIONS,
  UI_LAYOUT_STORAGE_PREFIX,
  applyUiLayoutPreset,
  createDefaultUiLayoutState,
  isItemInHeader,
  isItemInSidebar,
  moveOrderItemToTarget,
  moveOrderedItem,
  normalizeUiLayoutState,
  serializeUiLayoutForPersistence,
} from "@/stores/uiLayoutModel.js";

const SAVE_DEBOUNCE_MS = 250;
let activePageHideHandler = null;

function readStorageJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorageJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota or storage restriction failures in restricted environments.
  }
}

function parseTimestamp(value) {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

export const useUiLayoutStore = defineStore("uiLayout", () => {
  const authStore = useAuthStore();
  const sidebarPrefsStore = useSidebarPrefsStore();

  const layout = ref(createDefaultUiLayoutState());
  const activeScopeKey = ref("guest");
  const isHydrating = ref(false);
  const isSaving = ref(false);
  const syncPending = ref(false);
  const lastSavedAt = ref(null);
  const syncError = ref("");

  let saveTimer = null;
  let hydratedScope = null;
  let pendingSyncPromise = null;
  let hasLocalRecord = false;
  let pendingLocalFlag = false;
  let commitSeq = 0;

  const hasPendingSave = computed(() => Boolean(syncPending.value || saveTimer != null));

  const currentUserScope = computed(() => {
    const user = authStore.user;
    if (user?.idx != null) return `user-${user.idx}`;
    if (user?.id != null) return `user-${user.id}`;
    if (user?.email) return `email-${String(user.email).trim().toLowerCase()}`;
    return "guest";
  });

  const navItemsCatalog = computed(() => UI_LAYOUT_NAV_ITEMS);
  const sidebarSectionsCatalog = computed(() => UI_LAYOUT_SIDEBAR_SECTIONS);
  const headerActionsCatalog = computed(() => UI_LAYOUT_HEADER_ACTIONS);
  const presetsCatalog = computed(() => UI_LAYOUT_PRESETS);

  const sidebarPrimaryNavItems = computed(() =>
    layout.value.sidebarNavOrder
      .map((id) => UI_LAYOUT_NAV_ITEM_MAP[id])
      .filter(
        (item) =>
          Boolean(item) &&
          item.sidebarGroup === "nav" &&
          isItemInSidebar(layout.value.navPlacements[item.id])
      )
  );

  const sidebarUtilityNavItems = computed(() =>
    layout.value.sidebarNavOrder
      .map((id) => UI_LAYOUT_NAV_ITEM_MAP[id])
      .filter(
        (item) =>
          Boolean(item) &&
          item.sidebarGroup === "utilities" &&
          isItemInSidebar(layout.value.navPlacements[item.id])
      )
  );

  const headerNavItems = computed(() =>
    layout.value.headerNavOrder
      .map((id) => UI_LAYOUT_NAV_ITEM_MAP[id])
      .filter((item) => Boolean(item) && isItemInHeader(layout.value.navPlacements[item.id]))
  );

  const orderedHeaderActions = computed(() =>
    layout.value.headerActionOrder
      .map((id) => UI_LAYOUT_HEADER_ACTIONS.find((item) => item.id === id))
      .filter(Boolean)
      .map((item) => ({
        ...item,
        visible: layout.value.headerActionVisibility[item.id] !== false,
      }))
  );

  const visibleHeaderActions = computed(() =>
    orderedHeaderActions.value.filter((item) => item.visible)
  );

  const orderedSidebarSections = computed(() =>
    layout.value.sidebarSectionOrder
      .map((id) => UI_LAYOUT_SIDEBAR_SECTIONS.find((section) => section.id === id))
      .filter(Boolean)
  );

  const mobileBottomNavItems = computed(() =>
    layout.value.mobileBottomNavIds
      .map((id) => UI_LAYOUT_NAV_ITEM_MAP[id])
      .filter(Boolean)
  );

  function getStorageKey(scope = currentUserScope.value) {
    return `${UI_LAYOUT_STORAGE_PREFIX}${scope || "guest"}`;
  }

  function isSessionAuthenticated() {
    if (currentUserScope.value === "guest") {
      return false;
    }
    if (authStore.isAuthenticated === true || authStore.isLogin === true) {
      return true;
    }
    if (authStore.isAuthenticated === false || authStore.isLogin === false) {
      return false;
    }
    return Boolean(authStore.token);
  }

  function writeLocalEnvelope(scope, layoutState, { pendingServerSync }) {
    const clean = serializeUiLayoutForPersistence(layoutState);
    writeStorageJson(getStorageKey(scope), {
      ...clean,
      _pendingServerSync: Boolean(pendingServerSync),
    });
  }

  function syncRecentPrefsVisibilityFromLayout(nextLayout) {
    const recentVisible = nextLayout.showSidebarRecentSection !== false;
    if (!recentVisible) {
      sidebarPrefsStore.hideBothRecentSections?.();
    } else if (
      !sidebarPrefsStore.showRecentUploaded?.value &&
      !sidebarPrefsStore.showRecentAccessed?.value
    ) {
      sidebarPrefsStore.showBothRecentSections?.();
    }
  }

  function loadLocalScope(scope = currentUserScope.value) {
    activeScopeKey.value = scope;
    const saved = readStorageJson(getStorageKey(scope));
    if (saved && typeof saved === "object") {
      hasLocalRecord = true;
      pendingLocalFlag = typeof saved._pendingServerSync === "boolean" ? saved._pendingServerSync : undefined;
      syncPending.value = Boolean(saved._pendingServerSync);
      layout.value = normalizeUiLayoutState(saved);
      lastSavedAt.value = layout.value.clientUpdatedAt || null;
      return true;
    }
    hasLocalRecord = false;
    pendingLocalFlag = false;
    syncPending.value = false;
    layout.value = createDefaultUiLayoutState();
    lastSavedAt.value = null;
    return false;
  }

  async function persistNowToServer(
    payloadSnapshot = null,
    targetSeq = commitSeq,
    targetScope = currentUserScope.value
  ) {
    if (!isSessionAuthenticated()) {
      return null;
    }
    const snapshot = serializeUiLayoutForPersistence(payloadSnapshot || layout.value);
    isSaving.value = true;
    syncError.value = "";
    try {
      const response = await updateUiLayoutPreferences(snapshot);
      const resolvedUpdatedAt = response?.updatedAt || snapshot.clientUpdatedAt;
      if (targetSeq === commitSeq && currentUserScope.value === targetScope) {
        syncPending.value = false;
        pendingLocalFlag = false;
        hasLocalRecord = true;
        lastSavedAt.value = resolvedUpdatedAt;
        writeLocalEnvelope(targetScope, snapshot, { pendingServerSync: false });
      }
      return response || { layout: snapshot, updatedAt: resolvedUpdatedAt };
    } catch {
      syncError.value = "배치 설정을 서버에 저장하지 못했습니다. 현재 기기에는 저장되었습니다.";
      if (currentUserScope.value === targetScope) {
        syncPending.value = true;
        pendingLocalFlag = true;
        writeLocalEnvelope(targetScope, snapshot, { pendingServerSync: true });
      }
      return null;
    } finally {
      isSaving.value = false;
    }
  }

  function scheduleServerSave(snapshot, targetSeq = commitSeq, targetScope = currentUserScope.value) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (!isSessionAuthenticated()) {
      return;
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      pendingSyncPromise = persistNowToServer(snapshot, targetSeq, targetScope);
    }, SAVE_DEBOUNCE_MS);
  }

  function commitLayout(nextState, { markCustom = true, syncRecentPrefs = false, skipServer = false } = {}) {
    const scope = currentUserScope.value;
    commitSeq += 1;
    const seq = commitSeq;
    const normalized = normalizeUiLayoutState({
      ...nextState,
      presetId: markCustom ? "custom" : nextState.presetId,
      clientUpdatedAt: new Date().toISOString(),
    });
    layout.value = normalized;
    lastSavedAt.value = normalized.clientUpdatedAt;
    hasLocalRecord = true;

    const authenticated = isSessionAuthenticated();
    const shouldMarkPending = !skipServer && authenticated;
    pendingLocalFlag = shouldMarkPending;
    syncPending.value = shouldMarkPending;
    writeLocalEnvelope(scope, normalized, { pendingServerSync: shouldMarkPending });

    if (syncRecentPrefs) {
      syncRecentPrefsVisibilityFromLayout(normalized);
    }
    if (!skipServer && authenticated) {
      scheduleServerSave(normalized, seq, scope);
    }
    return normalized;
  }

  async function hydrateForCurrentUser({ forceRemote = false } = {}) {
    const scope = currentUserScope.value;
    const scopeChanged = hydratedScope !== scope;
    if (scopeChanged) {
      loadLocalScope(scope);
      hydratedScope = scope;
    }

    if (!isSessionAuthenticated()) {
      return layout.value;
    }
    if (!scopeChanged && !forceRemote) {
      return layout.value;
    }
    if (!scopeChanged && (saveTimer != null || isSaving.value)) {
      return layout.value;
    }

    isHydrating.value = true;
    syncError.value = "";
    try {
      const startScope = scope;
      const startSeq = commitSeq;
      const localClientMs = parseTimestamp(layout.value.clientUpdatedAt);
      const remote = await fetchUiLayoutPreferences();

      if (currentUserScope.value !== startScope || commitSeq !== startSeq) {
        return layout.value;
      }

      const rawRemoteLayout =
        remote?.layout && typeof remote.layout === "object" && Object.keys(remote.layout).length > 0
          ? remote.layout
          : null;

      if (rawRemoteLayout) {
        const normalizedRemote = normalizeUiLayoutState(rawRemoteLayout);
        const remoteClientMs =
          parseTimestamp(normalizedRemote.clientUpdatedAt) || parseTimestamp(remote.updatedAt);
        const hasUnsyncedLocal = pendingLocalFlag === true || pendingLocalFlag === undefined;

        if (hasLocalRecord && hasUnsyncedLocal && localClientMs > remoteClientMs) {
          const snapshot = serializeUiLayoutForPersistence(layout.value);
          await persistNowToServer(snapshot, commitSeq, scope);
        } else {
          layout.value = normalizedRemote;
          hasLocalRecord = true;
          pendingLocalFlag = false;
          syncPending.value = false;
          writeLocalEnvelope(scope, normalizedRemote, { pendingServerSync: false });
          lastSavedAt.value = remote.updatedAt || normalizedRemote.clientUpdatedAt || null;
          syncRecentPrefsVisibilityFromLayout(normalizedRemote);
        }
      } else if (hasLocalRecord) {
        const snapshot = serializeUiLayoutForPersistence(layout.value);
        await persistNowToServer(snapshot, commitSeq, scope);
      }
    } catch {
      // Keep local layout when backend fetch fails cleanly.
    } finally {
      isHydrating.value = false;
    }

    return layout.value;
  }

  function setNavPlacement(itemId, placement) {
    if (!UI_LAYOUT_NAV_ITEM_MAP[itemId] || !NAV_PLACEMENTS.includes(placement)) {
      return;
    }
    const next = {
      ...layout.value,
      navPlacements: {
        ...layout.value.navPlacements,
        [itemId]: placement,
      },
    };
    commitLayout(next);
  }

  function moveNavItem(listType, itemId, direction) {
    if (listType === "header") {
      const nextOrder = moveOrderedItem(layout.value.headerNavOrder, itemId, direction, (id) =>
        isItemInHeader(layout.value.navPlacements[id])
      );
      commitLayout({ ...layout.value, headerNavOrder: nextOrder });
      return;
    }

    const group = UI_LAYOUT_NAV_ITEM_MAP[itemId]?.sidebarGroup || "nav";
    const nextOrder = moveOrderedItem(
      layout.value.sidebarNavOrder,
      itemId,
      direction,
      (id) =>
        UI_LAYOUT_NAV_ITEM_MAP[id]?.sidebarGroup === group &&
        isItemInSidebar(layout.value.navPlacements[id])
    );
    commitLayout({ ...layout.value, sidebarNavOrder: nextOrder });
  }

  function reorderNavItem(listType, sourceId, targetId) {
    if (listType === "header") {
      const nextOrder = moveOrderItemToTarget(layout.value.headerNavOrder, sourceId, targetId);
      commitLayout({ ...layout.value, headerNavOrder: nextOrder });
      return;
    }
    const nextOrder = moveOrderItemToTarget(layout.value.sidebarNavOrder, sourceId, targetId);
    commitLayout({ ...layout.value, sidebarNavOrder: nextOrder });
  }

  function setHeaderNavPosition(position) {
    if (!HEADER_NAV_POSITIONS.includes(position)) return;
    commitLayout({ ...layout.value, headerNavPosition: position });
  }

  function setHeaderNavAlign(align) {
    if (!HEADER_NAV_ALIGNS.includes(align)) return;
    commitLayout({ ...layout.value, headerNavAlign: align });
  }

  function setHeaderNavStyle(style) {
    if (!HEADER_NAV_STYLES.includes(style)) return;
    commitLayout({ ...layout.value, headerNavStyle: style });
  }

  function setHeaderActionVisible(actionId, visible) {
    if (!(actionId in layout.value.headerActionVisibility)) return;
    commitLayout({
      ...layout.value,
      headerActionVisibility: {
        ...layout.value.headerActionVisibility,
        [actionId]: Boolean(visible),
      },
    });
  }

  function moveHeaderAction(actionId, direction) {
    const nextOrder = moveOrderedItem(layout.value.headerActionOrder, actionId, direction);
    commitLayout({ ...layout.value, headerActionOrder: nextOrder });
  }

  function reorderHeaderAction(sourceId, targetId) {
    const nextOrder = moveOrderItemToTarget(layout.value.headerActionOrder, sourceId, targetId);
    commitLayout({ ...layout.value, headerActionOrder: nextOrder });
  }

  function moveSidebarSection(sectionId, direction) {
    const nextOrder = moveOrderedItem(layout.value.sidebarSectionOrder, sectionId, direction);
    commitLayout({ ...layout.value, sidebarSectionOrder: nextOrder });
  }

  function reorderSidebarSection(sourceId, targetId) {
    const nextOrder = moveOrderItemToTarget(layout.value.sidebarSectionOrder, sourceId, targetId);
    commitLayout({ ...layout.value, sidebarSectionOrder: nextOrder });
  }

  function setLayoutOption(key, value) {
    const allowedBooleanKeys = new Set([
      "showHeaderSearchBar",
      "headerSearchCompact",
      "showSidebarNavSection",
      "showSidebarRecentSection",
      "showPersonalPages",
      "showSharedPages",
      "showSidebarUtilitiesSection",
      "showSidebarUploadButton",
      "showMediaSubmenu",
      "showPhotosSubmenu",
      "showStorageWidget",
      "showAdditionalStorageButton",
      "sidebarCompactMode",
      "showMobileBottomNav",
    ]);
    if (!allowedBooleanKeys.has(key)) return;
    commitLayout(
      { ...layout.value, [key]: Boolean(value) },
      { syncRecentPrefs: key === "showSidebarRecentSection" }
    );
  }

  function toggleMobileBottomNavItem(itemId) {
    if (!UI_LAYOUT_NAV_ITEM_MAP[itemId]) return;
    const current = [...layout.value.mobileBottomNavIds];
    const index = current.indexOf(itemId);
    if (index >= 0) {
      if (current.length <= 1) return;
      current.splice(index, 1);
    } else if (current.length < MAX_MOBILE_BOTTOM_NAV_ITEMS) {
      current.push(itemId);
    } else {
      current[current.length - 1] = itemId;
    }
    commitLayout({ ...layout.value, mobileBottomNavIds: current });
  }

  function moveMobileBottomNavItem(itemId, direction) {
    const next = moveOrderedItem(layout.value.mobileBottomNavIds, itemId, direction);
    commitLayout({ ...layout.value, mobileBottomNavIds: next });
  }

  function applyPreset(presetId) {
    const presetState = applyUiLayoutPreset(presetId);
    commitLayout(presetState, { markCustom: false, syncRecentPrefs: true });
  }

  function resetToDefaults() {
    const fresh = createDefaultUiLayoutState();
    commitLayout(fresh, { markCustom: false, syncRecentPrefs: true });
  }

  async function flushServerSave({ throwOnError = false } = {}) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (!isSessionAuthenticated()) {
      return null;
    }
    const targetSeq = commitSeq;
    const targetScope = currentUserScope.value;
    const snapshot = serializeUiLayoutForPersistence(layout.value);
    pendingSyncPromise = persistNowToServer(snapshot, targetSeq, targetScope);
    const result = await pendingSyncPromise;
    if (throwOnError && !result && syncError.value) {
      throw new Error(syncError.value);
    }
    return result;
  }

  function resetForLoggedOutSession() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    hydratedScope = null;
    syncError.value = "";
    isSaving.value = false;
    loadLocalScope("guest");
  }

  function flushPendingOnPageHide() {
    if ((saveTimer == null && !syncPending.value) || !isSessionAuthenticated()) {
      return;
    }
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (typeof globalThis.fetch !== "function") {
      return;
    }
    const snapshot = serializeUiLayoutForPersistence(layout.value);
    const headers = {
      "Content-Type": "application/json",
    };
    if (authStore.token) {
      headers.Authorization = `Bearer ${authStore.token}`;
    }
    try {
      void globalThis.fetch(apiPath("/feater/settings/me/ui-layout"), {
        method: "PUT",
        credentials: "include",
        keepalive: true,
        headers,
        body: JSON.stringify({ layout: snapshot }),
      });
    } catch {
      // Local storage already retains _pendingServerSync for retry on next load.
    }
  }

  if (typeof globalThis.window !== "undefined" && typeof globalThis.window.addEventListener === "function") {
    if (activePageHideHandler) {
      globalThis.window.removeEventListener("pagehide", activePageHideHandler);
    }
    activePageHideHandler = flushPendingOnPageHide;
    globalThis.window.addEventListener("pagehide", activePageHideHandler);
  }

  // Initialize synchronously from local storage to prevent layout flash on mount.
  loadLocalScope(currentUserScope.value);

  return {
    layout,
    activeScopeKey,
    isHydrating,
    isSaving,
    syncPending,
    hasPendingSave,
    lastSavedAt,
    syncError,
    navItemsCatalog,
    sidebarSectionsCatalog,
    headerActionsCatalog,
    presetsCatalog,
    sidebarPrimaryNavItems,
    sidebarUtilityNavItems,
    headerNavItems,
    orderedHeaderActions,
    visibleHeaderActions,
    orderedSidebarSections,
    mobileBottomNavItems,
    hydrateForCurrentUser,
    resetForLoggedOutSession,
    setNavPlacement,
    moveNavItem,
    reorderNavItem,
    setHeaderNavPosition,
    setHeaderNavAlign,
    setHeaderNavStyle,
    setHeaderActionVisible,
    moveHeaderAction,
    reorderHeaderAction,
    moveSidebarSection,
    reorderSidebarSection,
    setLayoutOption,
    toggleMobileBottomNavItem,
    moveMobileBottomNavItem,
    applyPreset,
    resetToDefaults,
    flushServerSave,
  };
});
