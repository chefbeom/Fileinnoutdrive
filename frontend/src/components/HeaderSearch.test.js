import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHeaderSearchStore } from "@/stores/useHeaderSearchStore.js";

const { mockRoute, mockSecretFolderStore, mockFileStore } = vi.hoisted(() => ({
  mockRoute: {
    name: "home",
    fullPath: "/home",
  },
  mockSecretFolderStore: {
    vaultMode: false,
  },
  mockFileStore: {
    driveRootFolders: [],
    planCapabilities: {},
    storageSummary: { planCode: "FREE" },
    storageLoading: false,
    fetchStorageSummary: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("vue-router", () => ({
  useRoute: () => reactive(mockRoute),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/stores/useAuthStore.js", () => ({
  useAuthStore: () => reactive({
    user: null,
    ensureSession: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
  }),
}));

vi.mock("@/stores/useFileStore.js", () => ({
  useFileStore: () => reactive(mockFileStore),
}));

vi.mock("@/stores/useSecretFolderStore.js", () => ({
  useSecretFolderStore: () => reactive(mockSecretFolderStore),
}));

vi.mock("@/stores/useUiLayoutStore.js", () => ({
  useUiLayoutStore: () => reactive({
    layout: {
      showHeaderSearchBar: true,
      headerSearchCompact: false,
      headerActionVisibility: {},
      headerActionOrder: [],
      headerNavPosition: "after-search",
      headerNavStyle: "pills",
      headerNavAlign: "left",
    },
    headerNavItems: [],
    hydrateForCurrentUser: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/api/featerApi.js", () => ({
  fetchSettingsProfile: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/api/groupApi.js", () => ({
  acceptGroupInvite: vi.fn(),
  acceptRelationshipInvite: vi.fn(),
  rejectGroupInvite: vi.fn(),
  rejectRelationshipInvite: vi.fn(),
}));

vi.mock("@/api/postApi.js", () => ({
  default: {
    getNotifications: vi.fn().mockResolvedValue({ data: { result: [] } }),
  },
}));

vi.mock("@/utils/pushNotification.js", () => ({
  registerPushNotification: vi.fn().mockResolvedValue(undefined),
}));

import Header from "./Header.vue";

describe("Header search dropdown directory & extension controls", () => {
  beforeEach(() => {
    const searchStore = useHeaderSearchStore();
    searchStore.resetScope("home");
    searchStore.setAvailableExtensions("home", ["pdf", "png"]);
    searchStore.setAvailableRootFolders("home", [
      { id: 10, name: "자료" },
      { id: 20, name: "프로젝트" },
    ]);
    mockRoute.name = "home";
    mockRoute.fullPath = "/home";
    mockSecretFolderStore.vaultMode = false;
    mockFileStore.driveRootFolders = [
      { id: 10, name: "자료" },
      { id: 20, name: "프로젝트" },
    ];
  });

  it("lets the user pick current vs root directory scope and choose a specific root folder", async () => {
    const searchStore = useHeaderSearchStore();
    const wrapper = mount(Header, {
      global: {
        stubs: {
          ProfileModal: true,
          GamesHubModal: true,
          HeaderCustomNavGroup: true,
        },
      },
    });

    await wrapper.find(".search-filter-button").trigger("click");

    const rootSelect = wrapper.find('[data-testid="search-root-folder-select"]');
    expect(rootSelect.exists()).toBe(true);
    expect(rootSelect.text()).toContain("홈 (드라이브 전체)");
    expect(rootSelect.text()).toContain("자료");
    expect(rootSelect.text()).toContain("프로젝트");

    await rootSelect.setValue("10");
    const homeState = searchStore.getScopeState("home");
    expect(homeState.searchScope).toBe("root");
    expect(homeState.searchRootFolderId).toBe(10);
    expect(wrapper.find(".search-filter-scope-label").text()).toBe("루트 (자료)");

    const scopeButtons = wrapper.findAll(".search-scope-pill");
    const subtreeBtn = scopeButtons.find((btn) => btn.text() === "현재 폴더 + 하위");
    await subtreeBtn.trigger("click");
    expect(homeState.searchScope).toBe("subtree");
    expect(homeState.searchRootFolderId).toBeNull();
  });

  it("supports custom extension input and detected extension dropdown without wiping custom filters", async () => {
    const searchStore = useHeaderSearchStore();
    const wrapper = mount(Header, {
      global: {
        stubs: {
          ProfileModal: true,
          GamesHubModal: true,
          HeaderCustomNavGroup: true,
        },
      },
    });

    await wrapper.find(".search-filter-button").trigger("click");

    const extInput = wrapper.find('[data-testid="search-extension-input"]');
    await extInput.setValue(".pdf, hwp");
    const homeState = searchStore.getScopeState("home");
    expect(homeState.extensionFilter).toBe(".pdf, hwp");

    searchStore.setAvailableExtensions("home", ["png"]);
    await wrapper.vm.$nextTick();
    expect(homeState.extensionFilter).toBe(".pdf, hwp");

    const extSelect = wrapper.find('[data-testid="search-extension-select"]');
    await extSelect.setValue("png");
    expect(homeState.extensionFilter).toBe("png");
  });
});
