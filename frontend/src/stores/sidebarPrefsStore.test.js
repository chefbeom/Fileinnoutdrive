import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SIDEBAR_PREFERENCES,
  SIDEBAR_PREFS_STORAGE_KEY,
  normalizeSidebarPreferences,
  useSidebarPrefsStore,
} from "./sidebarPrefsStore.js";

describe("sidebarPrefsStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    const store = useSidebarPrefsStore();
    store.resetSidebarPreferences();
  });

  it("normalizes preferences and falls back to defaults", () => {
    expect(normalizeSidebarPreferences(null)).toEqual(DEFAULT_SIDEBAR_PREFERENCES);
    expect(
      normalizeSidebarPreferences({
        showRecentUploaded: false,
        showRecentAccessed: true,
        maxItemsCount: 10,
      }),
    ).toEqual({
      showRecentUploaded: false,
      showRecentAccessed: true,
      maxItemsCount: 10,
      isRecentUploadedOpen: true,
      isRecentAccessedOpen: true,
    });
    expect(normalizeSidebarPreferences({ maxItemsCount: 999 }).maxItemsCount).toBe(5);
  });

  it("supports showing both, hiding both, or toggling individually and persists to localStorage", () => {
    const store = useSidebarPrefsStore();
    expect(store.showRecentUploaded.value).toBe(true);
    expect(store.showRecentAccessed.value).toBe(true);
    expect(store.hasAnyRecentSectionVisible.value).toBe(true);

    store.setShowRecentUploaded(false);
    expect(store.showRecentUploaded.value).toBe(false);
    expect(store.showRecentAccessed.value).toBe(true);
    expect(store.hasAnyRecentSectionVisible.value).toBe(true);

    store.hideBothRecentSections();
    expect(store.showRecentUploaded.value).toBe(false);
    expect(store.showRecentAccessed.value).toBe(false);
    expect(store.hasAnyRecentSectionVisible.value).toBe(false);

    const saved = JSON.parse(window.localStorage.getItem(SIDEBAR_PREFS_STORAGE_KEY));
    expect(saved.showRecentUploaded).toBe(false);
    expect(saved.showRecentAccessed).toBe(false);

    store.showBothRecentSections();
    expect(store.showRecentUploaded.value).toBe(true);
    expect(store.showRecentAccessed.value).toBe(true);
  });

  it("updates maxItemsCount and resets to default preferences", () => {
    const store = useSidebarPrefsStore();
    store.setMaxItemsCount(10);
    store.setShowRecentAccessed(false);
    expect(store.isDefaultPreferences.value).toBe(false);

    store.resetSidebarPreferences();
    expect(store.isDefaultPreferences.value).toBe(true);
    expect(store.maxItemsCount.value).toBe(5);
    expect(store.showRecentAccessed.value).toBe(true);
    expect(store.showRecentUploaded.value).toBe(true);
  });
});
