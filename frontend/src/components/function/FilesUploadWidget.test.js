import { flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import FilesUploadWidget from "./FilesUploadWidget.vue";
import FilesUploadStatusPanel from "./FilesUploadStatusPanel.vue";
import { completeUpload, initUploadFiles, parseUploadResponse } from "@/api/filesApi.js";

const mockFileStore = reactive({
  currentFolderId: null,
  storageSummary: {},
  storageLoading: false,
  driveHasLoaded: false,
  planCapabilities: { maxUploadCount: 30, maxUploadFileBytes: 5 * 1024 * 1024 * 1024 },
  createFolder: vi.fn(),
  fetchStorageSummary: vi.fn().mockResolvedValue({}),
  markFilesRecentlyUploaded: vi.fn(),
  refreshDrivePage: vi.fn().mockResolvedValue([]),
  fetchVaultFiles: vi.fn().mockResolvedValue([]),
  fetchFiles: vi.fn().mockResolvedValue([]),
  refreshAll: vi.fn(),
});

const mockSecretFolderStore = reactive({
  vaultMode: false,
  vaultUnlocked: false,
});

vi.mock("vue-router", () => ({
  onBeforeRouteLeave: vi.fn(),
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("axios", () => ({
  default: {
    put: vi.fn().mockResolvedValue({ status: 200 }),
  },
}));

vi.mock("@/plugins/axiosinterceptor.js", () => ({
  api: {
    defaults: { baseURL: "/api" },
  },
}));

vi.mock("@/stores/useFileStore.js", () => ({
  useFileStore: () => mockFileStore,
}));

vi.mock("@/stores/useSecretFolderStore.js", () => ({
  useSecretFolderStore: () => mockSecretFolderStore,
}));

vi.mock("@/stores/useAuthStore.js", () => ({
  useAuthStore: () =>
    reactive({
      token: "test-token",
    }),
}));

vi.mock("@/api/filesApi.js", () => ({
  abortUpload: vi.fn().mockResolvedValue({}),
  completeUpload: vi.fn(),
  initUploadFiles: vi.fn(),
  parseUploadResponse: vi.fn((data) => (Array.isArray(data) ? data : data?.result || [])),
}));

function makeMockFile(name, size = 128, extra = {}) {
  return {
    name,
    size,
    type: extra.type || "application/octet-stream",
    lastModified: 1000,
    webkitRelativePath: extra.webkitRelativePath || "",
    slice(start = 0, end = size) {
      return { size: Math.max(0, end - start) };
    },
  };
}

function mountWidget() {
  return mount(FilesUploadWidget, {
    global: {
      stubs: {
        Teleport: true,
        FilesUploadStatusPanel: true,
        FilesUploadExitDialog: true,
        FolderUploadStructureModal: true,
      },
    },
  });
}

describe("FilesUploadWidget.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFileStore.currentFolderId = null;
    mockFileStore.planCapabilities = { maxUploadCount: 30, maxUploadFileBytes: 5 * 1024 * 1024 * 1024 };
    mockSecretFolderStore.vaultMode = false;
    mockSecretFolderStore.vaultUnlocked = false;
    parseUploadResponse.mockImplementation((data) => (Array.isArray(data) ? data : data?.result || []));
  });

  it("omits hidden secret folder creation from the upload/create dropdown", async () => {
    const wrapper = mountWidget();

    await wrapper.get("button.upload-trigger").trigger("click");
    const dropdownText = wrapper.get(".upload-dropdown").text();
    expect(dropdownText).toContain("새 폴더 만들기");
    expect(dropdownText).toContain("공유 폴더 만들기");
    expect(dropdownText).not.toContain("비밀 폴더 만들기");
    wrapper.unmount();
  });

  it("chunks large upload batches into rolling initUploadFiles calls of 25", async () => {
    mockFileStore.planCapabilities = { maxUploadCount: 500, maxUploadFileBytes: 5 * 1024 * 1024 * 1024 };
    initUploadFiles.mockImplementation(async (batch) => ({
      data: batch.map((file, idx) => ({
        fileOriginName: file.name,
        presignedUploadUrl: `http://minio.local/put/${idx}`,
        objectKey: `1/key-${file.name}`,
        finalObjectKey: `1/key-${file.name}`,
        partitioned: false,
      })),
    }));
    completeUpload.mockImplementation(async (payload) => ({
      idx: 1,
      fileOriginName: payload.fileOriginName,
      fileFormat: payload.fileFormat,
    }));

    const wrapper = mountWidget();
    const files = Array.from({ length: 60 }, (_, idx) => makeMockFile(`clip-${idx + 1}.mp4`, 64));

    window.dispatchEvent(new CustomEvent("start-desktop-upload", { detail: { files } }));
    await flushPromises();

    expect(initUploadFiles).toHaveBeenCalledTimes(3);
    expect(initUploadFiles.mock.calls.map((call) => call[0].length)).toEqual([25, 25, 10]);
    expect(axios.put).toHaveBeenCalledTimes(60);
    expect(completeUpload).toHaveBeenCalledTimes(60);
    expect(wrapper.emitted("upload-complete")?.[0]?.[0]).toHaveLength(60);
    const items = wrapper.findComponent(FilesUploadStatusPanel).props("items");
    expect(items.every((item) => item.status === "completed")).toBe(true);
    wrapper.unmount();
  });

  it("isolates invalid files and still uploads valid ellipsis and extensionless files", async () => {
    mockFileStore.planCapabilities = { maxUploadCount: 500, maxUploadFileBytes: 5 * 1024 * 1024 * 1024 };
    initUploadFiles.mockImplementation(async (batch) => ({
      data: batch.map((file, idx) => ({
        fileOriginName: file.name,
        presignedUploadUrl: `http://minio.local/put/${idx}`,
        objectKey: `1/key-${idx}`,
        finalObjectKey: `1/key-${idx}`,
        partitioned: false,
      })),
    }));
    completeUpload.mockImplementation(async (payload) => ({
      idx: 1,
      fileOriginName: payload.fileOriginName,
      fileFormat: payload.fileFormat,
    }));

    const wrapper = mountWidget();
    const tooLongName = `${"x".repeat(252)}.mp4`;
    const files = [
      makeMockFile(tooLongName, 128),
      makeMockFile("여행 영상...최종.mp4", 128),
      makeMockFile("README", 64),
    ];

    window.dispatchEvent(new CustomEvent("start-desktop-upload", { detail: { files } }));
    await flushPromises();

    expect(initUploadFiles).toHaveBeenCalledTimes(1);
    expect(initUploadFiles.mock.calls[0][0].map((file) => file.name)).toEqual([
      "여행 영상...최종.mp4",
      "README",
    ]);
    expect(completeUpload).toHaveBeenCalledTimes(2);
    expect(completeUpload.mock.calls.map((call) => call[0].fileFormat)).toEqual(["mp4", "bin"]);
    expect(wrapper.emitted("upload-complete")?.[0]?.[0]).toEqual(["여행 영상...최종.mp4", "README"]);
    expect(wrapper.emitted("upload-fail")?.[0]?.[0]).toContain(tooLongName);

    const items = wrapper.findComponent(FilesUploadStatusPanel).props("items");
    expect(items.some((item) => item.status === "preparing" || item.status === "pending")).toBe(false);
    expect(items.filter((item) => item.status === "failed")).toHaveLength(1);
    expect(items.filter((item) => item.status === "completed")).toHaveLength(2);
    wrapper.unmount();
  });

  it("isolates server per-file init errors without leaving items stuck in preparing", async () => {
    initUploadFiles.mockImplementation(async (batch) => {
      if (batch.length > 1 || batch[0].name === "bad-server.mp4") {
        throw {
          response: {
            data: {
              code: 3501,
              message: "파일 이름이 올바르지 않습니다: bad-server.mp4",
            },
          },
        };
      }
      return {
        data: [
          {
            fileOriginName: batch[0].name,
            presignedUploadUrl: "http://minio.local/put/good",
            objectKey: "1/good",
            finalObjectKey: "1/good",
            partitioned: false,
          },
        ],
      };
    });
    completeUpload.mockResolvedValue({ idx: 2, fileOriginName: "good.mp4", fileFormat: "mp4" });

    const wrapper = mountWidget();
    const files = [makeMockFile("bad-server.mp4", 64), makeMockFile("good.mp4", 64)];

    window.dispatchEvent(new CustomEvent("start-desktop-upload", { detail: { files } }));
    await flushPromises();

    expect(wrapper.emitted("upload-complete")?.[0]?.[0]).toEqual(["good.mp4"]);
    expect(wrapper.emitted("upload-fail")?.[0]?.[0]).toContain("bad-server.mp4");
    const items = wrapper.findComponent(FilesUploadStatusPanel).props("items");
    expect(items.some((item) => item.status === "preparing" || item.status === "pending")).toBe(false);
    expect(items.find((item) => item.name === "bad-server.mp4")).toMatchObject({
      status: "failed",
      statusText: "파일 이름이 올바르지 않습니다: bad-server.mp4",
    });
    expect(items.find((item) => item.name === "good.mp4")?.status).toBe("completed");
    wrapper.unmount();
  });

  it("marks all remaining items failed without retrying per-file on fatal quota exhaustion", async () => {
    mockFileStore.planCapabilities = { maxUploadCount: 500, maxUploadFileBytes: 5 * 1024 * 1024 * 1024 };
    initUploadFiles.mockRejectedValue({
      response: {
        data: {
          code: 3512,
          message: "저장 공간이 부족합니다.",
        },
      },
    });

    const wrapper = mountWidget();
    const files = Array.from({ length: 30 }, (_, idx) => makeMockFile(`item-${idx + 1}.mp4`, 64));

    window.dispatchEvent(new CustomEvent("start-desktop-upload", { detail: { files } }));
    await flushPromises();

    expect(initUploadFiles).toHaveBeenCalledTimes(1);
    expect(wrapper.get(".upload-error").text()).toContain("저장 공간이 부족합니다.");
    const items = wrapper.findComponent(FilesUploadStatusPanel).props("items");
    expect(items).toHaveLength(30);
    expect(items.every((item) => item.status === "failed")).toBe(true);
    wrapper.unmount();
  });
});
