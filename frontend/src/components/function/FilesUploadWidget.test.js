import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import { describe, expect, it, vi } from "vitest";
import FilesUploadWidget from "./FilesUploadWidget.vue";

vi.mock("vue-router", () => ({
  onBeforeRouteLeave: vi.fn(),
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/stores/useFileStore.js", () => ({
  useFileStore: () =>
    reactive({
      currentFolderId: null,
      planCapabilities: { maxUploadCount: 30, maxUploadFileBytes: 5 * 1024 * 1024 * 1024 },
      createFolder: vi.fn(),
      fetchStorageSummary: vi.fn().mockResolvedValue({}),
      markFilesRecentlyUploaded: vi.fn(),
      refreshAll: vi.fn(),
    }),
}));

vi.mock("@/stores/useSecretFolderStore.js", () => ({
  useSecretFolderStore: () =>
    reactive({
      vaultMode: false,
    }),
}));

vi.mock("@/stores/useAuthStore.js", () => ({
  useAuthStore: () =>
    reactive({
      token: "test-token",
    }),
}));

vi.mock("@/api/filesApi.js", () => ({
  abortUpload: vi.fn(),
  completeUpload: vi.fn(),
  initUploadFiles: vi.fn(),
  parseUploadResponse: vi.fn(),
}));

describe("FilesUploadWidget.vue", () => {
  it("omits hidden secret folder creation from the upload/create dropdown", async () => {
    const wrapper = mount(FilesUploadWidget, {
      global: {
        stubs: {
          Teleport: true,
          FilesUploadStatusPanel: true,
          FilesUploadExitDialog: true,
          FolderUploadStructureModal: true,
        },
      },
    });

    await wrapper.get("button.upload-trigger").trigger("click");
    const dropdownText = wrapper.get(".upload-dropdown").text();
    expect(dropdownText).toContain("새 폴더 만들기");
    expect(dropdownText).toContain("공유 폴더 만들기");
    expect(dropdownText).not.toContain("비밀 폴더 만들기");
    wrapper.unmount();
  });
});
