import { mount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSecretFolderStore, mockFileStore, mockViewStore } = vi.hoisted(() => ({
  mockSecretFolderStore: {
    vaultMode: false,
    showHiddenFolders: false,
    openCreateHiddenFolderDialog: vi.fn(),
    openConfigureHiddenFolderDialog: vi.fn(),
    ensureFolderUnlocked: vi.fn().mockResolvedValue(true),
  },
  mockFileStore: {
    currentFolderId: null,
    currentFolder: null,
    currentFolderPath: [],
    planCapabilities: { shareEnabled: true, fileLockEnabled: true },
    driveHasLoaded: true,
    hasLoaded: false,
    allFiles: [],
    goBack: vi.fn(),
    createFolder: vi.fn(),
    enterFolder: vi.fn(),
    moveFilesToFolder: vi.fn(),
    invalidateFolderSnapshots: vi.fn(),
    refreshDrivePage: vi.fn(),
    fetchFiles: vi.fn(),
  },
  mockViewStore: null,
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/stores/useSecretFolderStore.js", () => ({
  useSecretFolderStore: () => reactive(mockSecretFolderStore),
}));

vi.mock("@/stores/useFileStore.js", () => ({
  useFileStore: () => reactive(mockFileStore),
}));

vi.mock("@/stores/useMediaPhotoStore.js", () => ({
  useMediaPhotoStore: () => ({
    mediaIncludedFolderIds: [],
    mediaIncludedFileIds: [],
    photoIncludedFolderIds: [],
    photoIncludedFileIds: [],
    toggleMediaFolderInclusion: vi.fn(),
    togglePhotoFolderInclusion: vi.fn(),
    addMediaFiles: vi.fn(),
    removeMediaFiles: vi.fn(),
    addPhotoFiles: vi.fn(),
    removePhotoFiles: vi.fn(),
    createCollection: vi.fn(),
    createPhotoAlbum: vi.fn(),
  }),
}));

vi.mock("@/stores/viewStore.js", () => ({
  useViewStore: () => ({
    viewMode: ref("grid"),
    itemSize: ref("medium"),
    resolvedLayoutColumns: ref(5),
  }),
}));

import FileCollectionView from "./FileCollectionView.vue";

describe("FileCollectionView move-to-vault context menu", () => {
  beforeEach(() => {
    mockSecretFolderStore.vaultMode = false;
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows '자체 비밀구역으로 옮기기' on right-click for Drive folders (including hidden+PIN) and files and emits move-to-vault", async () => {
    const folder = { id: 10, name: "개인문서", type: "folder" };
    const hiddenPinFolder = { id: 15, name: "히미츠", type: "folder", hiddenFolder: true, pinEnabled: true, pinRegistered: true };
    const file = { id: 20, name: "memo.txt", type: "file", downloadUrl: "/d" };

    const wrapper = mount(FileCollectionView, {
      attachTo: document.body,
      props: {
        files: [folder, hiddenPinFolder, file],
        selectedIds: [],
        deleteMode: "trash",
        sharedLibrary: false,
      },
    });

    const cards = wrapper.findAll("article.file-entry");
    expect(cards).toHaveLength(3);

    await cards[0].trigger("contextmenu", { clientX: 40, clientY: 50 });
    const folderMenuBtn = Array.from(document.body.querySelectorAll("button"))
      .find((btn) => btn.textContent?.includes("자체 비밀구역으로 옮기기"));
    expect(folderMenuBtn).toBeTruthy();

    folderMenuBtn.click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("move-to-vault")).toEqual([[folder]]);

    await cards[1].trigger("contextmenu", { clientX: 50, clientY: 60 });
    const hiddenMenuBtn = Array.from(document.body.querySelectorAll("button"))
      .find((btn) => btn.textContent?.includes("자체 비밀구역으로 옮기기"));
    expect(hiddenMenuBtn).toBeTruthy();

    hiddenMenuBtn.click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("move-to-vault")).toEqual([[folder], [hiddenPinFolder]]);

    await cards[2].trigger("contextmenu", { clientX: 60, clientY: 80 });
    const fileMenuBtn = Array.from(document.body.querySelectorAll("button"))
      .find((btn) => btn.textContent?.includes("자체 비밀구역으로 옮기기"));
    expect(fileMenuBtn).toBeTruthy();

    fileMenuBtn.click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("move-to-vault")).toEqual([[folder], [hiddenPinFolder], [file]]);

    wrapper.unmount();
  });

  it("hides '자체 비밀구역으로 옮기기' in vaultMode and exposes right-click vault import actions", async () => {
    mockSecretFolderStore.vaultMode = true;
    const vaultFolder = { id: 30, name: "보관함폴더", type: "folder", isVaultSpace: true, spaceType: "VAULT" };

    const wrapper = mount(FileCollectionView, {
      attachTo: document.body,
      props: {
        files: [vaultFolder],
        selectedIds: [],
        deleteMode: "trash",
        sharedLibrary: false,
      },
    });

    const card = wrapper.find("article.file-entry");
    await card.trigger("contextmenu", { clientX: 40, clientY: 50 });

    const moveMenuBtn = Array.from(document.body.querySelectorAll("button"))
      .find((btn) => btn.textContent?.includes("자체 비밀구역으로 옮기기"));
    expect(moveMenuBtn).toBeUndefined();

    const importIntoFolderBtn = Array.from(document.body.querySelectorAll("button"))
      .find((btn) => btn.textContent?.includes("이 폴더로 파일 · 폴더 가져오기"));
    expect(importIntoFolderBtn).toBeTruthy();
    importIntoFolderBtn.click();
    await wrapper.vm.$nextTick();

    await wrapper.find(".file-collection-shell").trigger("contextmenu", { clientX: 100, clientY: 120 });
    const importFromBgBtn = Array.from(document.body.querySelectorAll("button"))
      .find((btn) => btn.textContent?.includes("드라이브에서 파일 · 폴더 가져오기"));
    expect(importFromBgBtn).toBeTruthy();
    importFromBgBtn.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("open-vault-import")).toEqual([
      [{ targetFolderId: 30, targetFolderName: "보관함폴더" }],
      [{ targetFolderId: null, targetFolderName: "" }],
    ]);

    wrapper.unmount();
  });
});
