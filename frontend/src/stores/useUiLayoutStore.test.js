import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const mockApi = vi.hoisted(() => ({
  fetchUiLayoutPreferences: vi.fn(),
  updateUiLayoutPreferences: vi.fn(),
}));

const mockAuthState = vi.hoisted(() => ({
  user: { idx: 7, email: "tester@example.com" },
  isAuthenticated: true,
  isLogin: true,
  token: "test-jwt",
}));

vi.mock("@/api/featerApi.js", () => mockApi);
vi.mock("@/stores/useAuthStore.js", () => ({
  useAuthStore: () => mockAuthState,
}));

import { useUiLayoutStore } from "@/stores/useUiLayoutStore.js";
import { useSidebarPrefsStore } from "@/stores/sidebarPrefsStore.js";
import { UI_LAYOUT_STORAGE_PREFIX } from "@/stores/uiLayoutModel.js";

describe("useUiLayoutStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    mockAuthState.user = { idx: 7, email: "tester@example.com" };
    mockAuthState.isAuthenticated = true;
    mockAuthState.isLogin = true;
    mockAuthState.token = "test-jwt";
    mockApi.fetchUiLayoutPreferences.mockResolvedValue({ layout: null, updatedAt: null });
    mockApi.updateUiLayoutPreferences.mockResolvedValue({ layout: {}, updatedAt: "2026-11-12T02:00:00Z" });
    setActivePinia(createPinia());
  });

  it("moves media and photos to the top header while removing them from sidebar", () => {
    const store = useUiLayoutStore();

    expect(store.headerNavItems).toHaveLength(0);
    expect(store.sidebarPrimaryNavItems.map((i) => i.id)).toContain("media");

    store.setNavPlacement("media", "header");
    store.setNavPlacement("photos", "header");

    expect(store.headerNavItems.map((i) => i.id)).toEqual(["media", "photos"]);
    expect(store.sidebarPrimaryNavItems.map((i) => i.id)).not.toContain("media");
    expect(store.sidebarPrimaryNavItems.map((i) => i.id)).not.toContain("photos");

    store.moveNavItem("header", "photos", -1);
    expect(store.headerNavItems.map((i) => i.id)).toEqual(["photos", "media"]);
  });

  it("supports hiding personal and shared pages and syncs sidebar recent section", () => {
    const store = useUiLayoutStore();
    const sidebarPrefs = useSidebarPrefsStore();

    store.setLayoutOption("showPersonalPages", false);
    store.setLayoutOption("showSharedPages", false);
    store.setLayoutOption("showSidebarRecentSection", false);

    expect(store.layout.showPersonalPages).toBe(false);
    expect(store.layout.showSharedPages).toBe(false);
    expect(sidebarPrefs.showRecentUploaded.value).toBe(false);
    expect(sidebarPrefs.showRecentAccessed.value).toBe(false);

    store.setLayoutOption("showSidebarRecentSection", true);
    expect(sidebarPrefs.showRecentUploaded.value).toBe(true);
    expect(sidebarPrefs.showRecentAccessed.value).toBe(true);
  });

  it("applies media-header preset and resets cleanly", () => {
    const store = useUiLayoutStore();

    store.applyPreset("media-header");
    expect(store.layout.presetId).toBe("media-header");
    expect(store.layout.headerNavPosition).toBe("after-search");
    expect(store.layout.headerNavAlign).toBe("right");
    expect(store.headerNavItems.map((i) => i.id)).toEqual(["media", "photos"]);

    store.resetToDefaults();
    expect(store.layout.presetId).toBe("default");
    expect(store.headerNavItems).toHaveLength(0);
    expect(store.layout.showPersonalPages).toBe(true);
  });

  it("hydrates remote preferences when server copy is newer than local cache and normalizes legacy stacked position", async () => {
    mockApi.fetchUiLayoutPreferences.mockResolvedValue({
      updatedAt: "2026-11-12T05:00:00Z",
      layout: {
        headerNavPosition: "above-search-right",
        showPersonalPages: false,
        navPlacements: { media: "both", photos: "header" },
      },
    });

    const store = useUiLayoutStore();
    await store.hydrateForCurrentUser({ forceRemote: true });

    expect(store.layout.headerNavPosition).toBe("after-search");
    expect(store.layout.showPersonalPages).toBe(false);
    expect(store.headerNavItems.map((i) => i.id)).toEqual(["media", "photos"]);
    expect(store.sidebarPrimaryNavItems.map((i) => i.id)).toContain("media");
    expect(store.sidebarPrimaryNavItems.map((i) => i.id)).not.toContain("photos");

    const cachedRaw = window.localStorage.getItem(`${UI_LAYOUT_STORAGE_PREFIX}user-7`);
    expect(cachedRaw).toContain("after-search");
  });

  it("flushes layout changes to backend api and clears pending flag", async () => {
    const store = useUiLayoutStore();
    store.setHeaderNavPosition("right-actions");
    store.setHeaderNavStyle("icon-only");
    expect(store.syncPending).toBe(true);
    await store.flushServerSave({ throwOnError: true });

    expect(mockApi.updateUiLayoutPreferences).toHaveBeenCalledTimes(1);
    expect(mockApi.updateUiLayoutPreferences.mock.calls[0][0]).toMatchObject({
      headerNavPosition: "right-actions",
      headerNavStyle: "icon-only",
      presetId: "custom",
    });
    expect(store.syncPending).toBe(false);
  });

  it("hydrates using isLogin even if isAuthenticated property is undefined", async () => {
    delete mockAuthState.isAuthenticated;
    mockAuthState.isLogin = true;
    mockApi.fetchUiLayoutPreferences.mockResolvedValue({
      updatedAt: "2026-11-12T05:00:00Z",
      layout: {
        presetId: "media-header",
        navPlacements: { media: "header", photos: "header" },
        showPersonalPages: false,
      },
    });

    const store = useUiLayoutStore();
    await store.hydrateForCurrentUser();

    expect(mockApi.fetchUiLayoutPreferences).toHaveBeenCalledTimes(1);
    expect(store.headerNavItems.map((i) => i.id)).toEqual(["media", "photos"]);
    expect(store.layout.showPersonalPages).toBe(false);
  });

  it("migrates existing local customizations to backend when server copy is empty", async () => {
    window.localStorage.setItem(
      `${UI_LAYOUT_STORAGE_PREFIX}user-7`,
      JSON.stringify({
        presetId: "media-header",
        clientUpdatedAt: "2026-11-12T01:00:00.000Z",
        navPlacements: { media: "header", photos: "header" },
      })
    );
    mockApi.fetchUiLayoutPreferences.mockResolvedValue({ layout: {}, updatedAt: null });

    const store = useUiLayoutStore();
    await store.hydrateForCurrentUser({ forceRemote: true });

    expect(mockApi.updateUiLayoutPreferences).toHaveBeenCalledTimes(1);
    expect(mockApi.updateUiLayoutPreferences.mock.calls[0][0]).toMatchObject({
      presetId: "media-header",
      navPlacements: expect.objectContaining({ media: "header", photos: "header" }),
    });
    expect(store.syncPending).toBe(false);
  });

  it("adopts server layout across devices without clock skew blocking synced caches", async () => {
    window.localStorage.setItem(
      `${UI_LAYOUT_STORAGE_PREFIX}user-7`,
      JSON.stringify({
        presetId: "custom",
        clientUpdatedAt: "2026-11-12T12:00:00.000Z",
        _pendingServerSync: false,
        showPersonalPages: true,
        navPlacements: { media: "sidebar", photos: "sidebar" },
      })
    );
    mockApi.fetchUiLayoutPreferences.mockResolvedValue({
      updatedAt: "2026-11-12T02:00:00Z",
      layout: {
        presetId: "media-header",
        clientUpdatedAt: "2026-11-12T02:00:00.000Z",
        showPersonalPages: false,
        navPlacements: { media: "header", photos: "header" },
      },
    });

    const store = useUiLayoutStore();
    await store.hydrateForCurrentUser({ forceRemote: true });

    expect(store.layout.showPersonalPages).toBe(false);
    expect(store.headerNavItems.map((i) => i.id)).toEqual(["media", "photos"]);
  });

  it("re-hydrates from backend after logout and re-login", async () => {
    const store = useUiLayoutStore();
    await store.hydrateForCurrentUser();
    expect(mockApi.fetchUiLayoutPreferences).toHaveBeenCalledTimes(1);

    mockAuthState.user = null;
    mockAuthState.isAuthenticated = false;
    mockAuthState.isLogin = false;
    mockAuthState.token = null;
    store.resetForLoggedOutSession();

    mockAuthState.user = { idx: 7, email: "tester@example.com" };
    mockAuthState.isAuthenticated = true;
    mockAuthState.isLogin = true;
    mockAuthState.token = "test-jwt-2";
    mockApi.fetchUiLayoutPreferences.mockResolvedValue({
      updatedAt: "2026-11-12T06:00:00Z",
      layout: {
        showSharedPages: false,
        navPlacements: { media: "header" },
      },
    });

    await store.hydrateForCurrentUser();
    expect(mockApi.fetchUiLayoutPreferences).toHaveBeenCalledTimes(2);
    expect(store.layout.showSharedPages).toBe(false);
    expect(store.headerNavItems.map((i) => i.id)).toEqual(["media"]);
  });

  it("throws from flushServerSave when throwOnError is true and backend fails", async () => {
    mockApi.updateUiLayoutPreferences.mockRejectedValueOnce(new Error("network down"));
    const store = useUiLayoutStore();
    store.setLayoutOption("showPersonalPages", false);

    await expect(store.flushServerSave({ throwOnError: true })).rejects.toThrow();
    expect(store.syncPending).toBe(true);
    expect(store.syncError).toBeTruthy();
  });
});
