import { computed, ref } from "vue";

export const SIDEBAR_PREFS_STORAGE_KEY = "fileinnout-sidebar-preferences";
export const SIDEBAR_MAX_ITEMS_OPTIONS = [3, 5, 10];

export const DEFAULT_SIDEBAR_PREFERENCES = Object.freeze({
  showRecentUploaded: true,
  showRecentAccessed: true,
  maxItemsCount: 5,
  isRecentUploadedOpen: true,
  isRecentAccessedOpen: true,
});

export function normalizeSidebarPreferences(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const parsedCount = Number(source.maxItemsCount);
  const maxItemsCount = SIDEBAR_MAX_ITEMS_OPTIONS.includes(parsedCount)
    ? parsedCount
    : DEFAULT_SIDEBAR_PREFERENCES.maxItemsCount;

  return {
    showRecentUploaded:
      typeof source.showRecentUploaded === "boolean"
        ? source.showRecentUploaded
        : DEFAULT_SIDEBAR_PREFERENCES.showRecentUploaded,
    showRecentAccessed:
      typeof source.showRecentAccessed === "boolean"
        ? source.showRecentAccessed
        : DEFAULT_SIDEBAR_PREFERENCES.showRecentAccessed,
    maxItemsCount,
    isRecentUploadedOpen:
      typeof source.isRecentUploadedOpen === "boolean"
        ? source.isRecentUploadedOpen
        : DEFAULT_SIDEBAR_PREFERENCES.isRecentUploadedOpen,
    isRecentAccessedOpen:
      typeof source.isRecentAccessedOpen === "boolean"
        ? source.isRecentAccessedOpen
        : DEFAULT_SIDEBAR_PREFERENCES.isRecentAccessedOpen,
  };
}

export function readSavedSidebarPreferences() {
  if (typeof window === "undefined" || !window.localStorage) {
    return { ...DEFAULT_SIDEBAR_PREFERENCES };
  }

  try {
    const raw = window.localStorage.getItem(SIDEBAR_PREFS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SIDEBAR_PREFERENCES };
    }
    return normalizeSidebarPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SIDEBAR_PREFERENCES };
  }
}

const initialPrefs = readSavedSidebarPreferences();

const showRecentUploaded = ref(initialPrefs.showRecentUploaded);
const showRecentAccessed = ref(initialPrefs.showRecentAccessed);
const maxItemsCount = ref(initialPrefs.maxItemsCount);
const isRecentUploadedOpen = ref(initialPrefs.isRecentUploadedOpen);
const isRecentAccessedOpen = ref(initialPrefs.isRecentAccessedOpen);

function persistCurrentPreferences() {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  const payload = normalizeSidebarPreferences({
    showRecentUploaded: showRecentUploaded.value,
    showRecentAccessed: showRecentAccessed.value,
    maxItemsCount: maxItemsCount.value,
    isRecentUploadedOpen: isRecentUploadedOpen.value,
    isRecentAccessedOpen: isRecentAccessedOpen.value,
  });

  try {
    window.localStorage.setItem(SIDEBAR_PREFS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

export function useSidebarPrefsStore() {
  const hasAnyRecentSectionVisible = computed(
    () => Boolean(showRecentUploaded.value || showRecentAccessed.value),
  );

  const isDefaultPreferences = computed(
    () =>
      showRecentUploaded.value === DEFAULT_SIDEBAR_PREFERENCES.showRecentUploaded &&
      showRecentAccessed.value === DEFAULT_SIDEBAR_PREFERENCES.showRecentAccessed &&
      maxItemsCount.value === DEFAULT_SIDEBAR_PREFERENCES.maxItemsCount,
  );

  const setShowRecentUploaded = (value) => {
    showRecentUploaded.value = Boolean(value);
    persistCurrentPreferences();
  };

  const setShowRecentAccessed = (value) => {
    showRecentAccessed.value = Boolean(value);
    persistCurrentPreferences();
  };

  const setMaxItemsCount = (value) => {
    const parsed = Number(value);
    maxItemsCount.value = SIDEBAR_MAX_ITEMS_OPTIONS.includes(parsed)
      ? parsed
      : DEFAULT_SIDEBAR_PREFERENCES.maxItemsCount;
    persistCurrentPreferences();
  };

  const toggleRecentUploadedOpen = () => {
    isRecentUploadedOpen.value = !isRecentUploadedOpen.value;
    persistCurrentPreferences();
  };

  const toggleRecentAccessedOpen = () => {
    isRecentAccessedOpen.value = !isRecentAccessedOpen.value;
    persistCurrentPreferences();
  };

  const showBothRecentSections = () => {
    showRecentUploaded.value = true;
    showRecentAccessed.value = true;
    persistCurrentPreferences();
  };

  const hideBothRecentSections = () => {
    showRecentUploaded.value = false;
    showRecentAccessed.value = false;
    persistCurrentPreferences();
  };

  const resetSidebarPreferences = () => {
    showRecentUploaded.value = DEFAULT_SIDEBAR_PREFERENCES.showRecentUploaded;
    showRecentAccessed.value = DEFAULT_SIDEBAR_PREFERENCES.showRecentAccessed;
    maxItemsCount.value = DEFAULT_SIDEBAR_PREFERENCES.maxItemsCount;
    isRecentUploadedOpen.value = DEFAULT_SIDEBAR_PREFERENCES.isRecentUploadedOpen;
    isRecentAccessedOpen.value = DEFAULT_SIDEBAR_PREFERENCES.isRecentAccessedOpen;
    persistCurrentPreferences();
  };

  const reloadSidebarPreferences = () => {
    const loaded = readSavedSidebarPreferences();
    showRecentUploaded.value = loaded.showRecentUploaded;
    showRecentAccessed.value = loaded.showRecentAccessed;
    maxItemsCount.value = loaded.maxItemsCount;
    isRecentUploadedOpen.value = loaded.isRecentUploadedOpen;
    isRecentAccessedOpen.value = loaded.isRecentAccessedOpen;
  };

  return {
    showRecentUploaded,
    showRecentAccessed,
    maxItemsCount,
    isRecentUploadedOpen,
    isRecentAccessedOpen,
    hasAnyRecentSectionVisible,
    isDefaultPreferences,
    maxItemsOptions: SIDEBAR_MAX_ITEMS_OPTIONS,
    setShowRecentUploaded,
    setShowRecentAccessed,
    setMaxItemsCount,
    toggleRecentUploadedOpen,
    toggleRecentAccessedOpen,
    showBothRecentSections,
    hideBothRecentSections,
    resetSidebarPreferences,
    reloadSidebarPreferences,
  };
}
