import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount, flushPromises } from "@vue/test-utils";
import { reactive, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockApiGet, mockApiPost, mockApiDelete } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
  mockApiDelete: vi.fn(),
}));

vi.mock("@/plugins/axiosinterceptor.js", () => ({
  default: {
    get: mockApiGet,
    post: mockApiPost,
    delete: mockApiDelete,
  },
}));

vi.mock("@/stores/useAuthStore.js", () => ({
  useAuthStore: () => ({
    token: "",
    user: { idx: 1, nickname: "나", name: "나" },
    checkLogin: () => false,
    ensureSession: vi.fn(() => Promise.resolve()),
    logout: vi.fn(),
  }),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: {
    props: ["to"],
    template: "<a><slot /></a>",
  },
}));

vi.mock("sockjs-client", () => ({
  default: function MockSockJS() {},
}));

vi.mock("@/utils/stompClient.js", () => ({
  default: {
    over: () => ({
      debug: null,
      connect: vi.fn((_headers, onConnect) => {
        if (typeof onConnect === "function") onConnect();
      }),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      send: vi.fn(),
      disconnect: vi.fn(),
    }),
  },
}));

vi.mock("@/stores/useFileStore.js", () => ({
  useFileStore: () => reactive({
    currentFolderId: null,
    selectedStorageFilter: "all",
    sharedFiles: [],
    enterFolder: vi.fn(),
    moveFileToFolder: vi.fn(),
    moveFilesToFolder: vi.fn(),
  }),
}));

vi.mock("@/stores/viewStore.js", () => ({
  useViewStore: () => ({
    viewMode: ref("table"),
    gridSize: ref("medium"),
  }),
}));

import Chatlist from "./Chatlist.vue";
import ChatRoom from "./ChatRoom.vue";
import FileTable from "./FileTable.vue";
import IntrodHeader from "./IntrodHeader.vue";

const readFrontendFile = (relativePath) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Mobile responsiveness improvements", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { value: 360, configurable: true, writable: true });
    Object.defineProperty(window, "innerHeight", { value: 740, configurable: true, writable: true });
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    mockApiPost.mockResolvedValue({ data: { success: true } });
    mockApiDelete.mockResolvedValue({ data: { success: true } });
  });

  it("Chatlist exposes a mobile room menu button that opens a clamped menu without selecting the room", async () => {
    const rooms = [
      { id: 10, name: "모바일 테스트방", icon: "fa-comments", unreadCount: 3, time: "2026-11-13T10:00:00", userCount: 2, lastMsg: "안녕" },
    ];
    const wrapper = mount(Chatlist, {
      props: { rooms },
    });

    const menuButton = wrapper.get("button[aria-label='채팅방 메뉴']");
    expect(menuButton.classes()).toContain("md:hidden");

    await menuButton.trigger("click", { clientX: 355, clientY: 730 });

    expect(wrapper.emitted("select-room")).toBeFalsy();
    expect(wrapper.text()).toContain("이름 변경");
    expect(wrapper.text()).toContain("방 나가기");

    const menuEl = wrapper.findAll("div").find((el) => el.classes().includes("z-[999]"));
    expect(menuEl).toBeDefined();
    const left = Number.parseInt(menuEl.element.style.left, 10);
    const top = Number.parseInt(menuEl.element.style.top, 10);
    expect(left).toBeLessThanOrEqual(360 - 176 - 12);
    expect(top).toBeLessThanOrEqual(740 - 104 - 12);
  });

  it("ChatRoom exposes mobile touch option button only for own messages and clamps the menu position", async () => {
    mockApiGet.mockImplementation((url) => {
      if (url.includes("/history")) {
        return Promise.resolve({
          data: {
            success: true,
            result: {
              messageList: [
                { idx: 101, senderIdx: 1, senderName: "나", contents: "내 메시지", createdAt: "2026-11-13T10:00:00", messageType: "TEXT" },
                { idx: 102, senderIdx: 2, senderName: "상대방", contents: "상대 메시지", createdAt: "2026-11-13T10:01:00", messageType: "TEXT" },
              ],
            },
          },
        });
      }
      return Promise.resolve({ data: { result: [] } });
    });

    const wrapper = mount(ChatRoom, {
      props: {
        room: { id: 1, name: "테스트 채팅" },
        currentUser: { idx: 1, nickname: "나" },
      },
    });

    await flushPromises();

    const optionButtons = wrapper.findAll("button[aria-label='메시지 옵션']");
    expect(optionButtons).toHaveLength(1);
    expect(optionButtons[0].classes()).toContain("md:hidden");

    await optionButtons[0].trigger("click", { clientX: 350, clientY: 730 });
    expect(wrapper.text()).toContain("삭제");

    const popup = wrapper.findAll("div").find((el) => el.classes().includes("z-[999]"));
    expect(popup).toBeDefined();
    const left = Number.parseInt(popup.element.style.left, 10);
    const top = Number.parseInt(popup.element.style.top, 10);
    expect(left).toBeLessThanOrEqual(360 - 140 - 12);
    expect(top).toBeLessThanOrEqual(740 - 56 - 12);
  });

  it("IntrodHeader uses compact mobile navigation spacing", () => {
    const wrapper = mount(IntrodHeader, {
      global: {
        stubs: {
          RouterLink: { props: ["to"], template: "<a><slot /></a>" },
        },
      },
    });

    const nav = wrapper.get("nav");
    expect(nav.classes()).toContain("px-4");
    expect(nav.classes()).toContain("sm:px-10");
    expect(wrapper.html()).toContain("text-lg sm:text-2xl");
  });

  it("FileTable wraps the legacy table with overflow-x-auto instead of overflow-hidden", () => {
    const wrapper = mount(FileTable, {
      props: {
        files: [
          { id: 1, name: "sample.txt", type: "file", fileSize: 120, updatedAt: "2026-11-13T10:00:00" },
        ],
      },
    });

    expect(wrapper.find(".overflow-x-auto").exists()).toBe(true);
    expect(wrapper.find("div.overflow-hidden.rounded-2xl").exists()).toBe(false);
  });

  it("contains mobile viewport-safe layout and overlay styling across shell, modals, chat, and drive components", () => {
    const indexHtml = readFrontendFile("index.html");
    expect(indexHtml).toContain("viewport-fit=cover");

    const mainView = readFrontendFile("src/views/MainView.vue");
    expect(mainView).toContain("overflow-x: hidden");
    expect(mainView).toContain("env(safe-area-inset-bottom");

    const headerCss = readFrontendFile("src/components/Header.css");
    expect(headerCss).toContain("position: fixed");
    expect(headerCss).toContain("top: auto");
    expect(headerCss).toContain("max-height: calc(100dvh - 8rem)");

    const uploadCss = readFrontendFile("src/components/function/FilesUploadWidget.css");
    expect(uploadCss).toContain("bottom: calc(4.65rem + env(safe-area-inset-bottom, 0px))");
    expect(uploadCss).toContain("max-height: 54dvh");

    const miniPlayer = readFrontendFile("src/components/media/MiniPlayerWidget.vue");
    expect(miniPlayer).toContain("bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))]");

    const selectionBarCss = readFrontendFile("src/components/BaseFileSelectionBar.css");
    expect(selectionBarCss).toContain("bottom: calc(4.4rem + env(safe-area-inset-bottom, 0px))");
    expect(selectionBarCss).toContain("max-height: 36dvh");

    const profileCss = readFrontendFile("src/components/ProfileModal.css");
    expect(profileCss).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(profileCss).toContain("88dvh");

    const sidebar = readFrontendFile("src/components/Sidebar.vue");
    expect(sidebar).toContain("max-md:opacity-100");
    expect(sidebar).toContain("pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))]");

    const chatVue = readFrontendFile("src/components/Chat.vue");
    expect(chatVue).toContain("width: 100vw !important");
    expect(chatVue).toContain("height: 100dvh");

    const collectionVue = readFrontendFile("src/components/file/FileCollectionView.vue");
    expect(collectionVue).toContain("handleContextToggleSelect");

    const shareModal = readFrontendFile("src/components/StorageShareCenterModal.vue");
    expect(shareModal).toContain("max-h-[90dvh]");
    expect(shareModal).toContain("mt-3 overflow-x-auto rounded-xl");
  });
});
