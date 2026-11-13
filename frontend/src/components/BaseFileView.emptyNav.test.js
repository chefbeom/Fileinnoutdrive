import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, reactive, ref } from "vue";
import BaseFileView from "./BaseFileView.vue";

const mockRoute = reactive({ name: "home", query: {} });
const mockRouterPush = vi.fn().mockResolvedValue(undefined);
const mockRouterReplace = vi.fn().mockResolvedValue(undefined);

vi.mock("vue-router", () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
}));

const mockSecretFolderStore = reactive({
  vaultMode: false,
  vaultUnlocked: false,
  vaultTrashView: false,
  showHiddenFolders: false,
  pinModal: { open: false },
  folderDialog: { open: false },
  openChangeVaultPinModal: vi.fn(),
  exitVaultMode: vi.fn(),
  setVaultTrashView: vi.fn(),
  toggleShowHiddenFolders: vi.fn(),
  openCreateHiddenFolderDialog: vi.fn(),
});

const mockGoBack = vi.fn();
const mockNavigateToFolder = vi.fn();

const mockFileStore = reactive({
  allFiles: [],
  driveFiles: [],
  driveRootFolders: [],
  driveAvailableExtensions: [],
  drivePageInfo: { totalPage: 1, totalCount: 0, currentPage: 0, currentSize: 20 },
  currentFolder: null,
  currentFolderId: null,
  currentFolderPath: [],
  hasLoaded: true,
  isLoading: false,
  loadError: "",
  driveHasLoaded: true,
  planCapabilities: { shareEnabled: true, fileLockEnabled: true },
  fetchFiles: vi.fn().mockResolvedValue([]),
  fetchDrivePage: vi.fn().mockResolvedValue([]),
  refreshDrivePage: vi.fn().mockResolvedValue([]),
  navigateToFolder: (...args) => mockNavigateToFolder(...args),
  goBack: (...args) => mockGoBack(...args),
  invalidateFolderSnapshots: vi.fn(),
  getFolderPath: () => [],
});

const createScopeState = () => ({
  searchQuery: "",
  searchScope: "current",
  searchRootFolderId: null,
  extensionFilter: "all",
  sizeFilter: "all",
  customMinSize: "",
  customMaxSize: "",
  statusFilter: "all",
});

const mockSearchScopes = reactive({ files: createScopeState() });

vi.mock("@/stores/useFileStore.js", () => ({
  useFileStore: () => mockFileStore,
}));

vi.mock("@/stores/useSecretFolderStore.js", () => ({
  useSecretFolderStore: () => mockSecretFolderStore,
}));

vi.mock("@/stores/useHeaderSearchStore.js", () => ({
  FILE_SIZE_OPTIONS: [{ value: "all", label: "전체 크기" }],
  FILE_STATUS_OPTIONS: [{ value: "all", label: "전체 상태" }],
  getFileSearchScope: () => "files",
  useHeaderSearchStore: () => ({
    getScopeState: (scope) => mockSearchScopes[scope] || mockSearchScopes.files,
    resetScope: (scope) => {
      mockSearchScopes[scope] = createScopeState();
    },
    setAvailableExtensions: vi.fn(),
    setAvailableRootFolders: vi.fn(),
  }),
}));

vi.mock("@/stores/viewStore.js", () => ({
  useViewStore: () => ({
    viewMode: ref("table"),
    itemSize: ref("small"),
    layoutPreset: ref("20"),
    customLayoutColumns: ref("5"),
    customLayoutRows: ref("5"),
    resolvedPageSize: ref(20),
    setViewMode: vi.fn(),
    setItemSize: vi.fn(),
    setLayoutPreset: vi.fn(),
    setCustomLayoutColumns: vi.fn(),
    setCustomLayoutRows: vi.fn(),
  }),
}));

vi.mock("@/api/filesApi.js", () => ({
  downloadFileAsset: vi.fn(),
}));

const mountView = () =>
  mount(BaseFileView, {
    props: {
      title: "홈",
      files: [],
      showFolderNavigation: true,
    },
    global: {
      stubs: {
        Teleport: true,
        BaseFileShareDialog: true,
        BaseFolderPropertyDialog: true,
        BaseFolderRenameDialog: true,
        DownloadShareLinkDialog: true,
        FilePreviewModal: true,
        FileCollectionView: true,
        VaultImportModal: true,
      },
    },
  });

describe("BaseFileView empty directory navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoute.name = "home";
    mockRoute.query = {};
    mockSecretFolderStore.vaultMode = false;
    mockSecretFolderStore.vaultTrashView = false;
    mockFileStore.currentFolderId = null;
    mockFileStore.currentFolder = null;
    mockFileStore.currentFolderPath = [];
    mockSearchScopes.files = createScopeState();
  });

  it("does not show empty folder navigation buttons at root when there is no history", () => {
    const wrapper = mountView();
    expect(wrapper.find("[data-testid='empty-folder-nav-actions']").exists()).toBe(false);
  });

  it("shows 이전 디렉터리 / 뒤로가기 button in an empty subdirectory and triggers goBack", async () => {
    mockFileStore.currentFolderId = 20;
    mockFileStore.currentFolder = { id: 20, name: "temp", parentId: null };
    mockFileStore.currentFolderPath = [{ id: 20, name: "temp", parentId: null }];

    const wrapper = mountView();
    await nextTick();

    const parentBtn = wrapper.get("[data-testid='empty-go-parent']");
    expect(parentBtn.text()).toContain("뒤로가기 · 이전 디렉터리 (홈)");

    await parentBtn.trigger("click");
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it("shows separate 뒤로가기 and 이전(상위) 디렉터리 buttons after jumping from another folder into an empty folder", async () => {
    mockFileStore.currentFolderId = 99;
    mockFileStore.currentFolder = { id: 99, name: "서브", parentId: 10 };
    mockFileStore.currentFolderPath = [
      { id: 10, name: "자료", parentId: null },
      { id: 99, name: "서브", parentId: 10 },
    ];

    const wrapper = mountView();
    await nextTick();

    mockFileStore.currentFolderId = 20;
    mockFileStore.currentFolder = { id: 20, name: "temp", parentId: null };
    mockFileStore.currentFolderPath = [{ id: 20, name: "temp", parentId: null }];
    await nextTick();

    const backBtn = wrapper.get("[data-testid='empty-go-back']");
    const parentBtn = wrapper.get("[data-testid='empty-go-parent']");
    expect(backBtn.text()).toContain("뒤로가기 (서브)");
    expect(parentBtn.text()).toContain("이전(상위) 디렉터리 (홈)");

    await backBtn.trigger("click");
    expect(mockNavigateToFolder).toHaveBeenCalledWith(99);
  });

  it("includes 이전 디렉터리로 이동 in empty directory right-click context menu", async () => {
    mockFileStore.currentFolderId = 20;
    mockFileStore.currentFolder = { id: 20, name: "temp", parentId: null };
    mockFileStore.currentFolderPath = [{ id: 20, name: "temp", parentId: null }];

    const wrapper = mountView();
    await nextTick();

    const emptyBox = wrapper.get(".border-dashed");
    await emptyBox.trigger("contextmenu", { clientX: 120, clientY: 160 });

    expect(wrapper.text()).toContain("이전 디렉터리로 이동");
  });
});
