import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FavoriteFileView from "./FavoriteFileView.vue";

const mockPush = vi.fn();
const mockRoute = reactive({ query: {} });
const mockReplace = vi.fn((loc) => {
  mockRoute.query = loc?.query || {};
});

vi.mock("vue-router", () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  RouterLink: {
    props: ["to"],
    template: "<a><slot /></a>",
  },
}));

const mockFileStore = reactive({
  favoriteItems: [],
  favoriteFolders: [],
  favoriteFilesOnly: [],
  vaultFavoriteItems: [],
  vaultFavoriteFolders: [],
  vaultFavoriteFilesOnly: [],
  vaultHasLoaded: true,
  hasLoaded: true,
  fetchFiles: vi.fn().mockResolvedValue([]),
  fetchVaultFiles: vi.fn().mockResolvedValue([]),
  navigateToFolder: vi.fn(),
  moveToTrash: vi.fn(),
});

vi.mock("@/stores/useFileStore.js", () => ({
  useFileStore: () => mockFileStore,
}));

describe("FavoriteFileView.vue", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockRoute.query = {};
    mockFileStore.navigateToFolder.mockReset();
    mockFileStore.fetchFiles.mockClear();
    mockFileStore.fetchVaultFiles.mockClear();
    mockFileStore.vaultHasLoaded = true;
    mockFileStore.hasLoaded = true;
    mockFileStore.favoriteFolders = [
      { id: 10, name: "작업폴더", type: "folder", favorite: true },
    ];
    mockFileStore.favoriteFilesOnly = [
      { id: 20, name: "summary.pdf", type: "file", favorite: true, downloadUrl: "/d" },
    ];
    mockFileStore.favoriteItems = [
      ...mockFileStore.favoriteFolders,
      ...mockFileStore.favoriteFilesOnly,
    ];
    mockFileStore.vaultFavoriteFolders = [
      { id: 110, name: "비밀프로젝트", type: "folder", favorite: true, spaceType: "VAULT", isVaultSpace: true },
    ];
    mockFileStore.vaultFavoriteFilesOnly = [
      { id: 120, name: "secret-clip.mp4", type: "file", favorite: true, spaceType: "VAULT", isVaultSpace: true },
    ];
    mockFileStore.vaultFavoriteItems = [
      ...mockFileStore.vaultFavoriteFolders,
      ...mockFileStore.vaultFavoriteFilesOnly,
    ];
  });

  it("switches tabs between all favorites, folders, and files and jumps directly to favorited folder", async () => {
    const wrapper = mount(FavoriteFileView, {
      global: {
        stubs: {
          BaseFileView: {
            props: ["title", "files", "emptyMessage"],
            template: "<div data-testid='base-file-view' :data-count='files.length'><span>{{ title }}</span><slot name='header-bottom' /></div>",
          },
        },
      },
    });

    expect(wrapper.get("[data-testid='base-file-view']").attributes("data-count")).toBe("2");

    const folderChip = wrapper.find("[data-testid='favorite-folder-shortcuts'] button");
    expect(folderChip.exists()).toBe(true);
    await folderChip.trigger("click");
    expect(mockFileStore.navigateToFolder).toHaveBeenCalledWith(10);
    expect(mockPush).toHaveBeenCalledWith({ name: "home" });

    await wrapper.get("[data-testid='favorite-tab-folders']").trigger("click");
    expect(wrapper.get("[data-testid='base-file-view']").attributes("data-count")).toBe("1");
    expect(wrapper.find("[data-testid='favorite-folder-shortcuts']").exists()).toBe(true);

    await wrapper.get("[data-testid='favorite-tab-files']").trigger("click");
    expect(wrapper.get("[data-testid='base-file-view']").attributes("data-count")).toBe("1");
    expect(wrapper.find("[data-testid='favorite-folder-shortcuts']").exists()).toBe(false);
  });

  it("isolates vault-only secret favorites from normal drive favorites", async () => {
    mockFileStore.vaultHasLoaded = false;
    const wrapper = mount(FavoriteFileView, {
      props: { vaultOnly: true },
      global: {
        stubs: {
          BaseFileView: {
            props: ["title", "files", "emptyMessage"],
            template: "<div data-testid='base-file-view' :data-count='files.length'><span>{{ title }}</span><slot name='header-bottom' /></div>",
          },
        },
      },
    });

    expect(mockFileStore.fetchVaultFiles).toHaveBeenCalledTimes(1);
    expect(mockFileStore.fetchFiles).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("비밀 즐겨찾기");
    expect(wrapper.text()).toContain("비밀폴더".replace("비밀폴더", "비밀프로젝트"));
    expect(wrapper.text()).not.toContain("작업폴더");

    await wrapper.get("[data-testid='favorite-folder-shortcuts'] button").trigger("click");
    expect(mockFileStore.navigateToFolder).toHaveBeenCalledWith(110);
    expect(mockPush).toHaveBeenCalledWith({ name: "home" });
  });
});
