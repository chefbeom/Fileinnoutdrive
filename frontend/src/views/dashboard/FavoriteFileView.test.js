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
  navigateToFolder: vi.fn(),
  moveToTrash: vi.fn(),
});

vi.mock("@/stores/useFileStore.js", () => ({
  useFileStore: () => mockFileStore,
}));

describe("FavoriteFileView.vue", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockFileStore.navigateToFolder.mockReset();
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
});
