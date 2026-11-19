import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import RecentFileView from "./RecentFileView.vue";

const mockRoute = reactive({ query: { tab: "uploaded" } });
const mockReplace = vi.fn();

vi.mock("vue-router", () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ replace: mockReplace }),
}));

const mockFileStore = reactive({
  recentFiles: [
    { id: 1, name: "uploaded.txt", lastModified: new Date().toISOString(), uploadDate: new Date().toISOString() },
  ],
  recentUploadedFiles: [
    { id: 1, name: "uploaded.txt", lastModified: new Date().toISOString(), uploadDate: new Date().toISOString() },
  ],
  recentAccessedFiles: [
    { id: 2, name: "accessed.txt", lastModified: new Date().toISOString() },
  ],
  moveToTrash: vi.fn(),
  clearUploadedFiles: vi.fn(),
  clearAccessedFiles: vi.fn(),
});

vi.mock("@/stores/useFileStore.js", () => ({
  useFileStore: () => mockFileStore,
}));

describe("RecentFileView.vue", () => {
  it("renders clear uploaded history button and invokes fileStore.clearUploadedFiles", async () => {
    mockRoute.query = { tab: "uploaded" };
    const wrapper = mount(RecentFileView, {
      global: {
        stubs: {
          BaseFileView: {
            props: ["title", "files"],
            template: "<div><slot name='header-bottom' /></div>",
          },
        },
      },
    });

    const clearUploadedBtn = wrapper.get("[data-testid='clear-recent-uploaded-btn']");
    await clearUploadedBtn.trigger("click");
    expect(mockFileStore.clearUploadedFiles).toHaveBeenCalledTimes(1);
  });
});
