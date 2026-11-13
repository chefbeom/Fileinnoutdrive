import { flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockFetchFileListPage, mockSecretFolderStore, mockFileStore } = vi.hoisted(() => ({
  mockFetchFileListPage: vi.fn(),
  mockSecretFolderStore: {
    vaultMode: true,
    showHiddenFolders: false,
    isFolderUnlocked: vi.fn().mockReturnValue(false),
    ensureFolderUnlocked: vi.fn().mockResolvedValue(true),
    ensureVaultUnlocked: vi.fn().mockResolvedValue(true),
    invalidateVaultUnlock: vi.fn(),
    pinModal: { open: false },
  },
  mockFileStore: {
    moveFilesToVault: vi.fn().mockResolvedValue({ affectedCount: 1 }),
  },
}));

vi.mock("@/api/filesApi.js", () => ({
  fetchFileListPage: mockFetchFileListPage,
}));

vi.mock("@/stores/useSecretFolderStore.js", () => ({
  useSecretFolderStore: () => reactive(mockSecretFolderStore),
}));

vi.mock("@/stores/useFileStore.js", () => ({
  useFileStore: () => mockFileStore,
}));

import VaultImportModal from "./VaultImportModal.vue";

describe("VaultImportModal.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    mockSecretFolderStore.showHiddenFolders = false;
    mockSecretFolderStore.isFolderUnlocked.mockReturnValue(false);
    mockSecretFolderStore.ensureFolderUnlocked.mockResolvedValue(true);
    mockSecretFolderStore.ensureVaultUnlocked.mockResolvedValue(true);
    mockFileStore.moveFilesToVault.mockResolvedValue({ affectedCount: 1 });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("loads Drive entries, unlocks hidden PIN folders when imported, and moves selected items into target Vault folder", async () => {
    mockFetchFileListPage
      .mockResolvedValueOnce({
        fileList: [
          { idx: 10, fileOriginName: "히미츠", nodeType: "FOLDER", fileFormat: "folder", hiddenFolder: true, pinEnabled: true, pinRegistered: true, spaceType: "DRIVE" },
          { idx: 11, fileOriginName: "잠긴.pdf", nodeType: "FILE", fileFormat: "pdf", fileSize: 1024, lockedFile: true, spaceType: "DRIVE" },
        ],
        breadcrumbs: [],
        currentPage: 0,
        totalPage: 1,
        totalCount: 2,
      });

    const wrapper = mount(VaultImportModal, {
      attachTo: document.body,
      props: {
        open: true,
        targetFolderId: 99,
        targetFolderName: "비밀서류",
      },
    });

    await flushPromises();

    expect(mockFetchFileListPage).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: null,
        vaultMode: false,
        includeHidden: false,
      }),
      expect.any(Object),
    );
    expect(document.body.textContent).toContain("대상 위치: 자체 비밀 폴더 > 비밀서류");

    const checkboxes = Array.from(document.body.querySelectorAll('li input[type="checkbox"]'));
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].disabled).toBe(false);
    expect(checkboxes[1].disabled).toBe(true);

    checkboxes[0].checked = true;
    checkboxes[0].dispatchEvent(new Event("change"));
    await wrapper.vm.$nextTick();

    const importBtn = Array.from(document.body.querySelectorAll("button"))
      .find((btn) => btn.textContent?.includes("선택 항목 가져오기 (1)"));
    expect(importBtn).toBeTruthy();

    importBtn.click();
    await flushPromises();

    expect(mockSecretFolderStore.ensureFolderUnlocked).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10, name: "히미츠", hiddenFolder: true, pinEnabled: true }),
    );
    expect(mockSecretFolderStore.ensureVaultUnlocked).toHaveBeenCalled();
    expect(mockFileStore.moveFilesToVault).toHaveBeenCalledWith([10], 99);
    expect(wrapper.emitted("imported")).toEqual([[{ movedIds: [10], targetParentId: 99, affectedCount: 1 }]]);
    expect(wrapper.emitted("close")).toBeTruthy();

    wrapper.unmount();
  });

  it("toggles includeHidden option to reveal Drive hidden folders and supports drilling down into folders", async () => {
    mockFetchFileListPage
      .mockResolvedValueOnce({
        fileList: [
          { idx: 5, fileOriginName: "자료", nodeType: "FOLDER", fileFormat: "folder", spaceType: "DRIVE" },
        ],
        breadcrumbs: [],
        currentPage: 0,
        totalPage: 1,
        totalCount: 1,
      })
      .mockResolvedValueOnce({
        fileList: [
          { idx: 5, fileOriginName: "자료", nodeType: "FOLDER", fileFormat: "folder", spaceType: "DRIVE" },
          { idx: 6, fileOriginName: "비밀상자", nodeType: "FOLDER", fileFormat: "folder", hiddenFolder: true, pinEnabled: false, spaceType: "DRIVE" },
        ],
        breadcrumbs: [],
        currentPage: 0,
        totalPage: 1,
        totalCount: 2,
      })
      .mockResolvedValueOnce({
        fileList: [
          { idx: 7, fileOriginName: "hidden.txt", nodeType: "FILE", fileFormat: "txt", fileSize: 12, spaceType: "DRIVE" },
        ],
        breadcrumbs: [{ idx: 6, fileOriginName: "비밀상자", parentId: null }],
        currentPage: 0,
        totalPage: 1,
        totalCount: 1,
      });

    const wrapper = mount(VaultImportModal, {
      attachTo: document.body,
      props: {
        open: true,
        targetFolderId: null,
        targetFolderName: "",
      },
    });

    await flushPromises();

    const includeHiddenCheckbox = document.body.querySelector('label input[type="checkbox"]');
    includeHiddenCheckbox.checked = true;
    includeHiddenCheckbox.dispatchEvent(new Event("change"));
    await flushPromises();

    expect(mockFetchFileListPage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ includeHidden: true, vaultMode: false }),
      expect.any(Object),
    );
    expect(document.body.textContent).toContain("비밀상자");

    const openButtons = Array.from(document.body.querySelectorAll("button"))
      .filter((btn) => btn.textContent?.trim() === "열기");
    expect(openButtons).toHaveLength(2);
    openButtons[1].click();
    await flushPromises();

    expect(mockFetchFileListPage).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ parentId: 6, includeHidden: true, vaultMode: false }),
      expect.any(Object),
    );
    expect(document.body.textContent).toContain("hidden.txt");

    wrapper.unmount();
  });
});
