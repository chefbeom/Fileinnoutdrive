import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import VaultExportModal from "./VaultExportModal.vue";

const mockMoveFilesFromVault = vi.fn();
const mockFetchFileListPage = vi.fn();
const mockInvalidateVaultUnlock = vi.fn();

vi.mock("@/stores/useFileStore.js", () => ({
  useFileStore: () => ({
    moveFilesFromVault: (...args) => mockMoveFilesFromVault(...args),
  }),
}));

vi.mock("@/stores/useSecretFolderStore.js", () => ({
  useSecretFolderStore: () => ({
    invalidateVaultUnlock: (...args) => mockInvalidateVaultUnlock(...args),
  }),
}));

vi.mock("@/api/filesApi.js", () => ({
  fetchFileListPage: (...args) => mockFetchFileListPage(...args),
}));

describe("VaultExportModal.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports selected vault items back to original Drive folder by default and reports progress", async () => {
    let resolveMove;
    mockMoveFilesFromVault.mockImplementation(async (ids, options) => {
      options?.onProgress?.({ completed: 0, total: 2, currentId: ids[0] });
      await new Promise((resolve) => {
        resolveMove = resolve;
      });
      options?.onProgress?.({ completed: 2, total: 2, currentId: ids[1] });
      return { affectedCount: 2, targetIdx: 10 };
    });

    const wrapper = mount(VaultExportModal, {
      props: {
        open: true,
        items: [
          { id: 101, name: "secret.mp4", type: "file", vaultOriginParentId: 10 },
          { id: 102, name: "secret-folder", type: "folder", vaultOriginParentId: null },
        ],
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    expect(wrapper.text()).toContain("원래 위치로 돌려보내기");
    expect(wrapper.text()).toContain("1개 항목은 홈 최상위로 이동");

    await wrapper.get("[data-testid='vault-export-submit']").trigger("click");
    await nextTick();

    expect(wrapper.find("[data-testid='vault-export-progress']").exists()).toBe(true);
    expect(wrapper.text()).toContain("복호화 및 이동 중 (0 / 2)");

    resolveMove();
    await nextTick();
    await nextTick();

    expect(mockMoveFilesFromVault).toHaveBeenCalledWith(
      [101, 102],
      expect.objectContaining({
        targetParentId: null,
        restoreOriginalParent: true,
      }),
    );
    expect(wrapper.emitted("exported")).toEqual([
      [{ affectedCount: 2, restoreOriginalParent: true, targetParentId: 10 }],
    ]);
  });

  it("allows browsing normal Drive folders and exporting to a chosen folder", async () => {
    mockFetchFileListPage.mockResolvedValue({
      fileList: [
        { idx: 55, fileOriginName: "개인자료", nodeType: "FOLDER", spaceType: "DRIVE" },
      ],
      breadcrumbs: [],
      currentPage: 0,
      totalPage: 1,
    });
    mockMoveFilesFromVault.mockResolvedValue({ affectedCount: 1, targetIdx: 55 });

    const wrapper = mount(VaultExportModal, {
      props: {
        open: true,
        items: [{ id: 201, name: "clip.mp4", type: "file", vaultOriginParentId: null }],
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    await wrapper.get("[data-testid='vault-export-mode-custom']").trigger("click");
    await nextTick();
    await nextTick();

    expect(mockFetchFileListPage).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: null,
        vaultMode: false,
        includeHidden: false,
        trashedOnly: false,
      }),
      expect.any(Object),
    );

    mockFetchFileListPage.mockResolvedValueOnce({
      fileList: [],
      breadcrumbs: [{ idx: 55, fileOriginName: "개인자료", parentId: null }],
      currentPage: 0,
      totalPage: 1,
    });
    const folderBtn = wrapper.findAll("button").find((btn) => btn.text().includes("개인자료"));
    expect(folderBtn).toBeTruthy();
    await folderBtn.trigger("click");
    await nextTick();
    await nextTick();

    await wrapper.get("[data-testid='vault-export-submit']").trigger("click");
    await nextTick();

    expect(mockMoveFilesFromVault).toHaveBeenCalledWith(
      [201],
      expect.objectContaining({
        targetParentId: 55,
        restoreOriginalParent: false,
      }),
    );
  });
});
